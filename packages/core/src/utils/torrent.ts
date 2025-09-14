import { Torrent, UnprocessedTorrent, DebridFile } from '../debrid';
import {
  extractInfoHashFromMagnet,
  extractTrackersFromMagnet,
} from '../builtins/utils/debrid';
import { createLogger } from './logger';
import { Cache } from './cache';
import { makeRequest } from './http';

const logger = createLogger('torrent');

interface TorrentMetadata {
  hash: string;
  files: DebridFile[];
  sources: string[];
}

export class TorrentClient {
  static readonly #metadataCache = Cache.getInstance<string, TorrentMetadata>(
    'torrent-metadata'
  );

  private constructor() {}

  static async getMetadata(
    torrent: UnprocessedTorrent
  ): Promise<TorrentMetadata | undefined> {
    // If we have hash and don't need full metadata, return early
    if (torrent.hash) {
      return {
        hash: torrent.hash,
        files: [], // Empty files array since we don't need metadata
        sources: torrent.sources || [],
      };
    }

    // If we don't have a download URL, we can't proceed
    if (!torrent.downloadUrl) {
      logger.debug(
        `No download URL available for torrent with hash ${torrent.hash}`
      );
      return undefined;
    }

    // Try to get from cache if we have a download URL
    if (torrent.downloadUrl) {
      const cachedMetadata = await this.#metadataCache.get(torrent.downloadUrl);
      if (cachedMetadata) {
        return cachedMetadata;
      }
    }

    try {
      const metadata = await this.#fetchMetadata(torrent);
      if (metadata && torrent.downloadUrl) {
        await this.#metadataCache.set(
          torrent.downloadUrl,
          metadata,
          5 * 60 * 1000
        );
      }
      return metadata;
    } catch (error) {
      logger.error(`Failed to fetch metadata for torrent: ${error}`);
      if (torrent.hash) {
        // If we have a hash but metadata fetch failed, return basic info
        return {
          hash: torrent.hash,
          files: [],
          sources: torrent.sources || [],
        };
      }
      return undefined;
    }
  }

  static async #fetchMetadata(
    torrent: UnprocessedTorrent
  ): Promise<TorrentMetadata> {
    if (!torrent.downloadUrl) {
      throw new Error('Download URL must be provided');
    }

    const response = await makeRequest(torrent.downloadUrl, {
      timeout: 500,
      rawOptions: {
        redirect: 'manual',
      },
    });

    // Handle redirects
    if (response.status === 302 || response.status === 301) {
      const redirectUrl = response.headers.get('Location');
      if (!redirectUrl) {
        throw new Error('Redirect location not found');
      }

      if (redirectUrl.startsWith('magnet:')) {
        const hash = extractInfoHashFromMagnet(redirectUrl);
        const sources = extractTrackersFromMagnet(redirectUrl);
        if (!hash) throw new Error('Invalid magnet URL');
        return {
          hash,
          files: [],
          sources,
        };
      }
    }

    throw new Error('Unsupported torrent');
  }
}
