import { z } from 'zod';
import { ParsedId } from '../../utils/id-parser.js';
import { createLogger, getTimeTakenSincePoint } from '../../utils/index.js';
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
  indexers: z.array(z.string()),
});
type TorznabAddonConfig = z.infer<typeof TorznabAddonConfigSchema>;

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

    const queries = this.buildQueries(parsedId, metadata, { useAllTitles: false });
    if (queries.length === 0) return [];

    const torrents: UnprocessedTorrent[] = [];
    const seenTorrents = new Set<string>();
    
    const indexerIds = this.userData.indexers;

    if (indexerIds && indexerIds.length > 0) {
      this.logger.info(`Performing parallel search on ${indexerIds.length} user-defined indexers.`);
      const searchTasks = queries.flatMap((query) =>
        indexerIds.map((indexerId) => ({ query, indexerId }))
      );

      const searchPromises = searchTasks.map(({ query, indexerId }) => async () => {
        const start = Date.now();
        try {
          const params: Record<string, string | number | boolean> = { q: query, o: 'json' };
          if (parsedId.season) params.season = parsedId.season;
          if (parsedId.episode) params.ep = parsedId.episode;

          const results = await this.api.searchIndexer(indexerId, 'search', params);
          this.processResults(results, torrents, seenTorrents, indexerId);
        } catch (error) {
          this.logger.warn(
            `Jackett search for "${query}" on [${indexerId}] failed after ${getTimeTakenSincePoint(start)}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      });
      await this.runWithTimeout(searchPromises, searchDeadline);
    } else {
      this.logger.info('Performing single search using Jackett\'s /all/ endpoint.');
      const searchPromises = queries.map((query) => async () => {
        try {
          const params: Record<string, string | number | boolean> = { q: query, o: 'json' };
          if (parsedId.season) params.season = parsedId.season;
          if (parsedId.episode) params.ep = parsedId.episode;
          const results = await this.api.search('search', params);
          this.processResults(results, torrents, seenTorrents);
        } catch (error) {
           this.logger.warn(`Jackett /all/ search for "${query}" failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      });
      await this.runWithTimeout(searchPromises, searchDeadline);
    }

    if (torrents.length === 0) {
      throw new Error(`The operation was aborted due to timeout and no results were found.`);
    }
    
    return torrents;
  }

  private processResults(results: any[], torrents: UnprocessedTorrent[], seenTorrents: Set<string>, indexerId?: string) {
    for (const result of results) {
        const infoHash = this.extractInfoHash(result);
        const downloadUrl = infoHash 
          ? undefined 
          : result.enclosure.find(
              (e: any) =>
                e.type === 'application/x-bittorrent' && !e.url.includes('magnet:')
            )?.url;

        if (!infoHash && !downloadUrl) continue;
        if (seenTorrents.has(infoHash ?? downloadUrl!)) continue;
        seenTorrents.add(infoHash ?? downloadUrl!);

        torrents.push({
          hash: infoHash,
          downloadUrl: downloadUrl,
          sources: result.torznab?.magneturl?.toString()
            ? extractTrackersFromMagnet(result.torznab.magneturl.toString())
            : [],
          seeders:
            typeof result.torznab?.seeders === 'number' &&
            ![-1, 999].includes(result.torznab.seeders)
              ? result.torznab.seeders
              : undefined,
          indexer: result.jackettindexer?.name ?? indexerId ?? 'unknown',
          title: result.title,
          size:
            result.size ??
            (result.torznab?.size ? Number(result.torznab.size) : 0),
          type: 'torrent',
        });
    }
  }

  private async runWithTimeout(searchPromises: (() => Promise<void>)[], deadline: number) {
    const allSearchesPromise = Promise.all(searchPromises.map((p) => p()));
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Search deadline reached')), deadline)
    );
    try {
      await Promise.race([allSearchesPromise, timeoutPromise]);
    } catch (error) {
      this.logger.info(`Search deadline of ${deadline}ms reached. Returning results found so far.`);
    }
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
      // **THE FIX: Corrected the regex from 'a-f0-y' to 'a-f0-9'.**
      ?.match(/(?:urn(?::|%3A)btih(?::|%3A))([a-f0-9]{40})/i)?.[1]
      ?.toLowerCase()
    );
  }
}
