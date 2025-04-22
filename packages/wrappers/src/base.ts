import {
  Stream,
  ParsedStream,
  StreamRequest,
  ParsedNameData,
  Config,
} from '@aiostreams/types';
import { parseFilename } from '@aiostreams/parser';
import { getTextHash, serviceDetails, Settings } from '@aiostreams/utils';
import { emojiToLanguage, codeToLanguage } from '@aiostreams/formatters';

export class BaseWrapper {
  private readonly streamPath: string = 'stream/{type}/{id}.json';
  private indexerTimeout: number;
  protected addonName: string;
  private addonUrl: string;
  private addonId: string;
  private userConfig: Config;

  constructor(
    addonName: string,
    addonUrl: string,
    addonId: string,
    userConfig: Config,
    indexerTimeout?: number
  ) {
    this.addonName = addonName;
    this.addonUrl = this.standardizeManifestUrl(addonUrl);
    this.addonId = addonId;
    this.indexerTimeout = indexerTimeout || Settings.DEFAULT_TIMEOUT;
    this.userConfig = userConfig;
  }

  protected standardizeManifestUrl(url: string): string {
    let manifestUrl = url.replace('stremio://', 'https://').replace(/\/$/, '');
    return manifestUrl.endsWith('/manifest.json')
      ? manifestUrl
      : `${manifestUrl}/manifest.json`;
  }

  public async getParsedStreams(
    streamRequest: StreamRequest
  ): Promise<ParsedStream[]> {
    const streams: Stream[] = await this.getStreams(streamRequest);
    const parsedStreams: ParsedStream[] = streams
      .map((stream) => this.parseStream(stream))
      .filter((parsedStream) => parsedStream !== undefined);
    return parsedStreams;
  }

  private getStreamUrl(streamRequest: StreamRequest) {
    return (
      this.addonUrl.replace('manifest.json', '') +
      this.streamPath
        .replace('{type}', streamRequest.type)
        .replace('{id}', encodeURIComponent(streamRequest.id))
    );
  }

  protected async makeRequest(url: string): Promise<Response> {
    const headers = new Headers();
    const userIp = this.userConfig.requestingIp;
    if (userIp) {
      headers.set('X-Client-IP', userIp);
      headers.set('X-Forwarded-For', userIp);
      headers.set('X-Real-IP', userIp);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.indexerTimeout);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      return response;
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  protected async getStreams(streamRequest: StreamRequest): Promise<Stream[]> {
    const url = this.getStreamUrl(streamRequest);
    const cache = this.userConfig.instanceCache;
    const requestCacheKey = getTextHash(url);
    const cachedStreams = cache ? cache.get(requestCacheKey) : undefined;

    if (cachedStreams) {
      console.debug(
        `|DBG| wrappers > base > ${this.addonName}: Returning cached streams`
      );
      return cachedStreams;
    }

    try {
      const response = await this.makeRequest(url);
      if (!response.ok) {
        throw new Error(
          `${this.addonName} failed to respond with status ${response.status}`
        );
      }

      const results = (await response.json()) as { streams: Stream[] };
      if (!results.streams) {
        throw new Error('Failed to respond with streams');
      }

      if (Settings.CACHE_STREAM_RESULTS && cache) {
        cache.set(
          requestCacheKey,
          results.streams,
          Settings.CACHE_STREAM_RESULTS_TTL
        );
      }
      return results.streams;
    } catch (error: any) {
      const message =
        error.name === 'AbortError'
          ? `The request to ${this.addonName} was aborted after ${this.indexerTimeout}ms`
          : error.message;
      return Promise.reject(new Error(message));
    }
  }

  // Everything else in your original class below this point is unchanged
  // and already compatible with Cloudflare Workers since it’s just TypeScript logic.

  // Keep your existing parseStream, createParsedResult, extract helpers, etc.
  // ...
}
