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
});
type TorznabAddonConfig = z.infer<typeof TorznabAddonConfigSchema>;

const JackettIndexerSchema = z.object({
  id: z.string(),
  title: z.string(),
  configured: z.boolean(),
  type: z.enum(['private', 'public']),
});
const JackettIndexersSchema = z.object({
  // MODIFIED: Jackett nests the indexers inside a root "Indexers" property
  Indexers: z.array(JackettIndexerSchema),
});
type JackettIndexer = z.infer<typeof JackettIndexerSchema>;

class TorznabApi extends BaseNabApi<'torznab'> {
  private readonly internalBaseUrl: string;
  private readonly internalApiKey?: string;
  private readonly internalApiPath?: string;

  constructor(baseUrl: string, apiKey?: string, apiPath?: string) {
    super('torznab', logger, baseUrl, apiKey, apiPath);
    this.internalBaseUrl = baseUrl;
    this.internalApiKey = apiKey;
    this.internalApiPath = apiPath;
  }

  // MODIFIED: Re-written to use the correct native Jackett API endpoint
  async getIndexers(): Promise<JackettIndexer[]> {
    // **THE FIX: Construct the URL from the base origin, not the full torznab path.**
    const origin = new URL(this.internalBaseUrl).origin;
    const url = new URL(`${origin}/api/v2.0/indexers`); // This is the correct endpoint for the indexer list

    // Jackett uses a different parameter name for the API key on this endpoint
    if (this.internalApiKey) {
      url.searchParams.set('apikey', this.internalApiKey);
    }

    const response = await makeRequest(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
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
    // MODIFIED: Return the nested array and filter for configured indexers
    return parsed.data.Indexers.filter((idx) => idx.configured);
  }

  async searchIndexer(
    indexerId: string,
    functionName: string,
    params: Record<string, string | number | boolean> = {}
  ): Promise<any> {
    const originalUrl = this.internalBaseUrl;
    // For searching, we still target the torznab path, replacing /all/ with the specific indexer
    const indexerUrl = originalUrl.replace('/all/', `/${indexerId}/`);
    const tempApi = new BaseNabApi(
      'torznab',
      logger,
      indexerUrl,
      this.internalApiKey,
      this.internalApiPath
    );
    return tempApi.search(functionName, params);
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
      this.userData.apiPath
    );
  }

  protected async _searchTorrents(
    parsedId: ParsedId,
    metadata: SearchMetadata
  ): Promise<UnprocessedTorrent[]> {
    const searchDeadline = Math.max(1000, this.userData.timeout - 500);

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

    const searchTasks = queries.flatMap((query) =>
      indexers.map((indexer) => ({ query, indexer }))
    );

    const searchPromises = searchTasks.map(({ query, indexer }) => async () => {
      const start = Date.now();
      try {
        const params: Record<string, string | number | boolean> = { q: query, o: 'json' };
        if (parsedId.season) params.season = parsedId.season;
        if (parsedId.episode) params.ep = parsedId.episode;

        const results = await this.api.searchIndexer(indexer.id, 'search', params);

        this.logger.info(
          `Jackett search for "${query}" on [${indexer.title}] took ${getTimeTakenSincePoint(start)}`,
          { results: results.length }
        );
        
        for (const result of results) {
            const infoHash = this.extractInfoHash(result);
            const downloadUrl = result.enclosure.find(
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
              indexer: result.jackettindexer?.name ?? indexer.title,
              title: result.title,
              size:
                result.size ??
                (result.torznab?.size ? Number(result.torznab.size) : 0),
              type: 'torrent',
            });
        }
      } catch (error) {
        this.logger.warn(
          `Jackett search for "${query}" on [${indexer.title}] failed after ${getTimeTakenSincePoint(start)}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    const allSearchesPromise = Promise.all(searchPromises.map((p) => p()));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Search deadline reached')), searchDeadline)
    );

    try {
      await Promise.race([allSearchesPromise, timeoutPromise]);
    } catch (error) {
      this.logger.info(`Search deadline of ${searchDeadline}ms reached. Returning ${torrents.length} results found so far.`);
    }

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
        result.enclosure.find(
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
