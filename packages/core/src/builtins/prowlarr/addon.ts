import { BaseDebridAddon, BaseDebridConfigSchema } from '../base/debrid';
import { z } from 'zod';
import { createLogger, Env, getTimeTakenSincePoint } from '../../utils';
import ProwlarrApi, {
  ProwlarrApiIndexer,
  ProwlarrApiSearchItem,
  ProwlarrApiError,
} from './api';
import { ParsedId } from '../../utils/id-parser';
import { SearchMetadata } from '../base/debrid';
import { Torrent, NZB, UnprocessedTorrent } from '../../debrid';
import {
  extractInfoHashFromMagnet,
  extractTrackersFromMagnet,
} from '../utils/debrid';

export const ProwlarrAddonConfigSchema = BaseDebridConfigSchema.extend({
  url: z.string(),
  apiKey: z.string(),
  indexers: z.array(z.string()),
});

export type ProwlarrAddonConfig = z.infer<typeof ProwlarrAddonConfigSchema>;

const logger = createLogger('prowlarr');

export class ProwlarrAddon extends BaseDebridAddon<ProwlarrAddonConfig> {
  readonly id = 'prowlarr';
  readonly name = 'Prowlarr';
  readonly version = '1.0.0';
  readonly logger = logger;
  readonly api: ProwlarrApi;

  private readonly indexers: string[] = [];

  constructor(config: ProwlarrAddonConfig, clientIp?: string) {
    super(config, ProwlarrAddonConfigSchema, clientIp);
    this.indexers = config.indexers.map((x) => x.toLowerCase());
    this.api = new ProwlarrApi({
      baseUrl: config.url,
      apiKey: config.apiKey,
      timeout: Env.BUILTIN_PROWLARR_SEARCH_TIMEOUT,
    });
  }

  protected async _searchTorrents(
    parsedId: ParsedId,
    metadata: SearchMetadata
  ): Promise<UnprocessedTorrent[]> {
    let availableIndexers: ProwlarrApiIndexer[] = [];
    try {
      const { data } = await this.api.indexers();
      availableIndexers = data;
    } catch (error) {
      if (error instanceof ProwlarrApiError) {
        throw new Error(
          `Failed to get Prowlarr indexers: ${error.message}: ${error.status} - ${error.statusText}`
        );
      }
      throw new Error(`Failed to get Prowlarr indexers: ${error}`);
    }
    const chosenIndexerIds = availableIndexers
      .filter(
        (indexer) =>
          indexer.enable &&
          (!this.indexers.length ||
            this.indexers.includes(indexer.name.toLowerCase()) ||
            this.indexers.includes(indexer.definitionName.toLowerCase()) ||
            this.indexers.includes(indexer.sortName.toLowerCase()))
      )
      .map((indexer) => indexer.id);

    let queries: string[] = [];

    if (metadata.primaryTitle) {
      queries.push(metadata.primaryTitle);
      if (parsedId.season && parsedId.episode) {
        queries = [
          `${metadata.primaryTitle} S${parsedId.season.toString().padStart(2, '0')}E${parsedId.episode.toString().padStart(2, '0')}`,
          `${metadata.primaryTitle} S${parsedId.season.toString().padStart(2, '0')}`,
        ];
        if (metadata.absoluteEpisode)
          queries.push(
            `${metadata.primaryTitle} ${metadata.absoluteEpisode.toString().padStart(2, '0')}`
          );
      }
      if (metadata.year && parsedId.mediaType === 'movie') {
        queries = queries.map((q) => `${q} ${metadata.year}`);
      }
    }

    if (queries.length === 0) {
      return [];
    }

    const searchPromises = queries.map(async (q) => {
      const start = Date.now();
      const { data } = await this.api.search({
        query: q,
        indexerIds: chosenIndexerIds,
        type: 'search',
      });
      this.logger.info(
        `Prowlarr search for ${q} took ${getTimeTakenSincePoint(start)}`,
        {
          results: data.length,
        }
      );
      return data;
    });
    const allResults = await Promise.all(searchPromises);
    const results = allResults.flat();

    const seenTorrents = new Set<string>();
    const torrents: UnprocessedTorrent[] = [];

    for (const result of results) {
      const magnetUrl = result.guid.includes('magnet:')
        ? result.guid
        : result.magnetUrl;
      const downloadUrl = result.magnetUrl?.startsWith('http')
        ? result.magnetUrl
        : result.downloadUrl;
      const infoHash =
        result.infoHash ||
        (magnetUrl ? extractInfoHashFromMagnet(magnetUrl) : undefined);
      if (!infoHash) continue;
      if (seenTorrents.has(infoHash)) continue;
      seenTorrents.add(infoHash);

      torrents.push({
        hash: infoHash,
        downloadUrl: downloadUrl,
        sources: magnetUrl ? extractTrackersFromMagnet(magnetUrl) : [],
        seeders: result.seeders,
        title: result.title,
        size: result.size,
        indexer: result.indexer,
        type: 'torrent',
      });
    }
    return torrents;
  }

  protected async _searchNzbs(
    parsedId: ParsedId,
    metadata: SearchMetadata
  ): Promise<NZB[]> {
    return [];
  }
}
