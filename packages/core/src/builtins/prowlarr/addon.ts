import { BaseDebridAddon, BaseDebridConfigSchema } from '../base/debrid.js';
import { z } from 'zod';
import {
  createLogger,
  Env,
  getTimeTakenSincePoint,
} from '../../utils/index.js';
import ProwlarrApi, {
  ProwlarrApiIndexer,
  ProwlarrApiSearchItem,
  ProwlarrApiError,
  ProwlarrApiTagItem,
} from './api.js';
import { ParsedId } from '../../utils/id-parser.js';
import { SearchMetadata } from '../base/debrid.js';
import { Torrent, NZB, UnprocessedTorrent } from '../../debrid/index.js';
import {
  extractInfoHashFromMagnet,
  extractTrackersFromMagnet,
  validateInfoHash,
} from '../utils/debrid.js';
import { createQueryLimit, useAllTitles } from '../utils/general.js';

export const ProwlarrAddonConfigSchema = BaseDebridConfigSchema.extend({
  url: z.string(),
  apiKey: z.string(),
  indexers: z.array(z.string()),
  tags: z.array(z.string()),
});

export type ProwlarrAddonConfig = z.infer<typeof ProwlarrAddonConfigSchema>;

const logger = createLogger('prowlarr');

// **KEY CHANGE 1: Define a hard deadline for returning results.**
// This should be less than the AIOStreams wrapper timeout (15s).
const SEARCH_DEADLINE_MS = 10000; // 10 seconds

export class ProwlarrAddon extends BaseDebridAddon<ProwlarrAddonConfig> {
  readonly id = 'prowlarr';
  readonly name = 'Prowlarr';
  readonly version = '1.0.0';
  readonly logger = logger;
  readonly api: ProwlarrApi;

  public static preconfiguredIndexers: ProwlarrApiIndexer[] | undefined;

  private readonly preconfiguredInstance: boolean;
  private readonly indexers: string[] = [];
  private readonly tags: string[] = [];
  constructor(config: ProwlarrAddonConfig, clientIp?: string) {
    super(config, ProwlarrAddonConfigSchema, clientIp);

    this.preconfiguredInstance =
      Env.BUILTIN_PROWLARR_URL === config.url &&
      Env.BUILTIN_PROWLARR_API_KEY === config.apiKey;
    this.indexers = config.indexers.map((x) => x.toLowerCase());
    this.tags = config.tags.map((x) => x.toLowerCase());
    this.api = new ProwlarrApi({
      baseUrl: config.url,
      apiKey: config.apiKey,
      timeout: Env.BUILTIN_PROWLARR_SEARCH_TIMEOUT, // This is the timeout for each *individual* request
    });
  }

  public static async fetchpreconfiguredIndexers(): Promise<void> {
    if (this.preconfiguredIndexers) return;
    if (!Env.BUILTIN_PROWLARR_URL || !Env.BUILTIN_PROWLARR_API_KEY) return;
    const api = new ProwlarrApi({
      baseUrl: Env.BUILTIN_PROWLARR_URL,
      apiKey: Env.BUILTIN_PROWLARR_API_KEY,
      timeout: 5000,
    });
    const { data } = await api.indexers();
    logger.debug(`Fetched ${data.length} preconfigured indexers`);
    let filterReasons: Map<string, number> = new Map();

    this.preconfiguredIndexers = data.filter((indexer) => {
      if (!indexer.enable) {
        filterReasons.set(
          'not enabled',
          (filterReasons.get('not enabled') ?? 0) + 1
        );
        return false;
      }
      if (indexer.protocol !== 'torrent') {
        filterReasons.set(
          'not torrent protocol',
          (filterReasons.get('not torrent protocol') ?? 0) + 1
        );
        return false;
      }
      if (Env.BUILTIN_PROWLARR_INDEXERS?.length) {
        if (
          ![
            indexer.name.toLowerCase(),
            indexer.sortName.toLowerCase(),
            indexer.definitionName.toLowerCase(),
          ].some((x) =>
            Env.BUILTIN_PROWLARR_INDEXERS?.map((x) => x.toLowerCase()).includes(
              x
            )
          )
        ) {
          filterReasons.set(
            'not in preconfigured indexers',
            (filterReasons.get('not in preconfigured indexers') ?? 0) + 1
          );
          return false;
        }
      }
      return true;
    });
    logger.debug(
      `Set ${this.preconfiguredIndexers?.length} preconfigured indexers`
    );
    if (filterReasons.size > 0) {
      logger.debug(
        `Filter reasons: ${Array.from(filterReasons.entries())
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')}`
      );
    }
  }

  protected async _searchTorrents(
    parsedId: ParsedId,
    metadata: SearchMetadata
  ): Promise<UnprocessedTorrent[]> {
    const queryLimit = createQueryLimit();
    let availableIndexers: ProwlarrApiIndexer[] = [];
    let chosenTags: number[] = [];
    if (this.preconfiguredInstance && ProwlarrAddon.preconfiguredIndexers) {
      availableIndexers = ProwlarrAddon.preconfiguredIndexers;
    } else {
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
    }

    try {
      const { data } = await this.api.tags();
      chosenTags = data
        .filter((tag) => this.tags.includes(tag.label.toLowerCase()))
        .map((tag) => tag.id);
    } catch (error) {
      logger.warn(`Failed to get Prowlarr tags: ${error}`);
    }

    const chosenIndexers = availableIndexers.filter(
      (indexer) =>
        indexer.enable &&
        indexer.protocol === 'torrent' &&
        ((!this.indexers.length && !chosenTags.length) ||
          (chosenTags.length &&
            indexer.tags.some((tag) => chosenTags.includes(tag))) ||
          (this.indexers.length &&
            (this.indexers.includes(indexer.name.toLowerCase()) ||
              this.indexers.includes(indexer.definitionName.toLowerCase()) ||
              this.indexers.includes(indexer.sortName.toLowerCase()))))
    );

    this.logger.info(
      `Chosen indexers: ${chosenIndexers.map((indexer) => indexer.name).join(', ')}`
    );

    const queries = this.buildQueries(parsedId, metadata, {
      useAllTitles: useAllTitles(this.userData.url),
    });
    if (queries.length === 0 || chosenIndexers.length === 0) {
      return [];
    }
    
    // **KEY CHANGE 2: Process results as they come in and race against a deadline.**
    const torrents: UnprocessedTorrent[] = [];
    const seenTorrents = new Set<string>();

    const searchTasks: { query: string; indexer: ProwlarrApiIndexer }[] = [];
    for (const q of queries) {
      for (const indexer of chosenIndexers) {
        searchTasks.push({ query: q, indexer: indexer });
      }
    }

    const searchPromises = searchTasks.map(({ query, indexer }) =>
      queryLimit(async () => {
        const start = Date.now();
        try {
          const { data } = await this.api.search({
            query: query,
            indexerIds: [indexer.id],
            type: 'search',
          });
          this.logger.info(
            `Prowlarr search for "${query}" on [${indexer.name}] took ${getTimeTakenSincePoint(start)}`,
            { results: data.length }
          );

          // Process and add torrents to the main array immediately
          for (const result of data) {
            const magnetUrl = result.guid.includes('magnet:') ? result.guid : undefined;
            const downloadUrl = result.magnetUrl?.startsWith('http') ? result.magnetUrl : result.downloadUrl;
            const infoHash = validateInfoHash(result.infoHash || (magnetUrl ? extractInfoHashFromMagnet(magnetUrl) : undefined));
            if (!infoHash && !downloadUrl) continue;
            if (seenTorrents.has(infoHash ?? downloadUrl!)) continue;
            seenTorrents.add(infoHash ?? downloadUrl!);

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
        } catch (error) {
          this.logger.warn(
            `Prowlarr search for "${query}" on [${indexer.name}] failed after ${getTimeTakenSincePoint(start)}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      })
    );

    // Create a promise that resolves when all searches are complete
    const allSearchesPromise = Promise.all(searchPromises);

    // Create a timeout promise that rejects after our deadline
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Search deadline reached')), SEARCH_DEADLINE_MS)
    );

    try {
      // Race the search completion against the timeout
      await Promise.race([allSearchesPromise, timeoutPromise]);
    } catch (error) {
      // This catch block will be triggered if the timeout wins the race
      this.logger.info(`Search deadline of ${SEARCH_DEADLINE_MS}ms reached. Returning ${torrents.length} results found so far.`);
    }

    // **KEY CHANGE 3: Only throw an error if we have NO results at the end.**
    if (torrents.length === 0) {
      // This preserves the "addon timeout" error behavior only when nothing is found.
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
}
