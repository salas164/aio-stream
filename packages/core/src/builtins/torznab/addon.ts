import { z } from 'zod';
import { ParsedId } from '../../utils/id-parser.js';
import { createLogger, getTimeTakenSincePoint, makeRequest } from '../../utils/index.js';
import { Torrent, NZB, UnprocessedTorrent } from '../../debrid/index.js';
import { SearchMetadata } from '../base/debrid';
import {
  extractTrackersFromMagnet,
  validateInfoHash,
} from '../utils/debrid.js';
import { BaseNabApi } from '../base/nab/api.js';
import {
  BaseNabAddon,
  NabAddonConfigSchema,
  NabAddonConfig,
} from '../base/nab/addon.js';

const logger = createLogger('torznab');

const TorznabAddonConfigSchema = NabAddonConfigSchema.extend({
  timeout: z.number(),
  adminUsername: z.string().optional(),
  adminPassword: z.string().optional(),
});
type TorznabAddonConfig = z.infer<typeof TorznabAddonConfigSchema>;

const JackettIndexerSchema = z.object({
  id: z.string(),
  name: z.string(), // Changed to match admin API response
  configured: z.boolean(),
  type: z.enum(['private', 'public']),
});
const JackettIndexersSchema = z.array(JackettIndexerSchema); // Direct array for admin API
type JackettIndexer = z.infer<typeof JackettIndexerSchema>;

class TorznabApi extends BaseNabApi<'torznab'> {
  private readonly internalBaseUrl: string;
  private readonly internalApiKey?: string;
  private readonly internalApiPath?: string;
  private readonly adminUsername?: string;
  private readonly adminPassword?: string;

  constructor(baseUrl: string, apiKey?: string, apiPath?: string, adminUsername?: string, adminPassword?: string) {
    super('torznab', logger, baseUrl, apiKey, apiPath);
    this.internalBaseUrl = baseUrl;
    this.internalApiKey = apiKey;
    this.internalApiPath = apiPath;
    this.adminUsername = adminUsername;
    this.adminPassword = adminPassword;
  }

  async getIndexers(): Promise<JackettIndexer[]> {
    const url = new URL(this.internalBaseUrl);
    url.pathname = '/api/v2.0/indexers'; // Use admin API for JSON
    url.searchParams.set('configured', 'true');

    let headers: Record<string, string> = { 'Accept': 'application/json' };

    // Optional login if credentials are provided
    if (this.adminUsername && this.adminPassword) {
      const loginUrl = new URL(this.internalBaseUrl);
      loginUrl.pathname = '/UI/Login';
      const loginResponse = await makeRequest(loginUrl.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: `username=${encodeURIComponent(this.adminUsername)}&password=${encodeURIComponent(this.adminPassword)}`,
        timeout: 5000,
      });

      if (!loginResponse.ok) {
        throw new Error(`Failed to login to Jackett: ${loginResponse.status} ${loginResponse.statusText}`);
      }

      const cookies = loginResponse.headers.get('set-cookie');
      if (cookies) {
        headers['Cookie'] = cookies;
      } else {
        logger.warn('No session cookie received from Jackett login');
      }
    }

    const response = await makeRequest(url.toString(), {
      method: 'GET',
      headers,
      timeout: 5000,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch Jackett indexers: ${response.status} ${response.statusText}`);
    }

    const parsed = JackettIndexersSchema.safeParse(await response.json());
    if (!parsed.success) {
      logger.error('Failed to parse Jackett indexers', parsed.error);
      return [];
    }
    return parsed.data.filter((idx) => idx.configured);
  }

  async searchIndexer(
    indexerId: string,
    functionName: string,
    params: Record<string, string | number | boolean> = {}
  ): Promise<any> {
    const originalUrl = this.internalBaseUrl;
    const indexerUrl = originalUrl.replace('/all/', `/${indexerId}/`);
    const tempApi = new BaseNabApi(
      'torznab',
      logger,
      indexerUrl,
      this.internalApiKey,
      this.internalApiPath
    );
    return tempApi.search(functionName, { ...params, o: 'json' }); // Ensure JSON output
  }
}

export class TorznabAddon extends BaseNabAddon<TorznabAddonConfig, TorznabApi> {
  readonly name = 'Torznab';
  readonly version = '1.0.0';
  readonly id = 'torznab';
  readonly logger = logger;
  readonly api: TorznabApi;

  constructor(userData: TorznabAddonConfig, clientIp?: string) {
    super(userData, TorznabAddonConfigSchema, clientIp);
    this.api = new TorznabApi(
      this.userData.url,
      this.userData.apiKey,
      this.userData.apiPath,
      this.userData.adminUsername,
      this.userData.adminPassword
    );
  }

  protected async _searchTorrents(
    parsedId: ParsedId,
    metadata: SearchMetadata
  ): Promise<UnprocessedTorrent[]> {
    const searchDeadline = Math.max(1000, this.userData.timeout - 500); // 500ms before timeout

    // Fetch indexers
    let indexers: JackettIndexer[];
    try {
      indexers = await this.api.getIndexers();
      this.logger.info(`Found ${indexers.length} configured indexers in Jackett`);
    } catch (error) {
      throw new Error(`Failed to get Jackett indexers: ${error}`);
    }

    if (indexers.length === 0) return [];

    const queries = this.buildQueries(parsedId, metadata, { useAllTitles: false });
    if (queries.length === 0) return [];

    const torrents: UnprocessedTorrent[] = [];
    const seenTorrents = new Set<string>();

    // Create tasks for each indexer-query pair
    const searchTasks = queries.flatMap((query) =>
      indexers.map((indexer) => ({ query, indexer }))
    ).map(({ query, indexer }) => async () => {
      const start = Date.now();
      try {
        const params: Record<string, string | number | boolean> = { q: query };
        if (parsedId.season) params.season = parsedId.season;
        if (parsedId.episode) params.ep = parsedId.episode;

        const results = await this.api.searchIndexer(indexer.id, 'search', params);

        this.logger.info(
          `Jackett search for "${query}" on [${indexer.name}] took ${getTimeTakenSincePoint(start)}`,
          { results: results.length }
        );

        for (const result of results) {
          const infoHash = this.extractInfoHash(result);
          const downloadUrl = result.enclosure?.find(
            (e: any) =>
              e.type === 'application/x-bittorrent' && !e.url.includes('magnet:')
          )?.url;

          if (!infoHash && !downloadUrl) continue;
          if (seenTorrents.has(infoHash ?? downloadUrl!)) continue;
          seenTorrents.add(infoHash ?? downloadUrl!);

          torrents.push({
            hash: infoHash,
            downloadUrl,
            sources: result.torznab?.magneturl?.toString()
              ? extractTrackersFromMagnet(result.torznab.magneturl.toString())
              : [],
            seeders:
              typeof result.torznab?.seeders === 'number' &&
              ![-1, 999].includes(result.torznab.seeders)
                ? result.torznab.seeders
                : undefined,
            indexer: result.jackettindexer?.name ?? indexer.name,
            title: result.title,
            size:
              result.size ??
              (result.torznab?.size ? Number(result.torznab.size) : 0),
            type: 'torrent',
          });
        }
      } catch (error) {
        this.logger.warn(
          `Jackett search for "${query}" on [${indexer.name}] failed after ${getTimeTakenSincePoint(start)}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // Run tasks in parallel, stop 500ms before timeout
    const allSearchesPromise = Promise.allSettled(searchTasks.map((p) => p()));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Search deadline reached')), searchDeadline)
    );

    try {
      await Promise.race([allSearchesPromise, timeoutPromise]);
    } catch (error) {
      this.logger.info(`Search deadline of ${searchDeadline}ms reached. Returning ${torrents.length} results found so far.`);
    }

    // Only throw error if no results were found
    if (torrents.length === 0) {
      throw new Error(`The operation was aborted due to timeout and no results were found.`);
    }

    return torrents;
  }

  protected async _searchNzbs(
    parsedId: ParsedId,
    metadata: SearchMetadata
  ): Promise<NZB[]> {
    return [];
  }

  private extractInfoHash(result: any): string | undefined {
    return validateInfoHash(
      result.torznab?.infohash?.toString() ||
      (
        result.torznab?.magneturl ||
        result.enclosure?.find(
          (e: any) =>
            e.type === 'application/x-bittorrent' && e.url.includes('magnet:')
        )?.url
      )
      ?.toString()
      ?.match(/(?:urn(?::|%3A)btih(?::|%3A))([a-f0-9]{40})/i)?.[1]
      ?.toLowerCase()
    );
  }
}
