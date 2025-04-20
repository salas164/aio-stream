import { BaseWrapper } from './base';
import {
  Config,
  ParsedNameData,
  ParsedStream,
  ParseResult,
  Stream,
  StreamRequest,
} from '@aiostreams/types';
import { parseFilename } from '@aiostreams/parser';
import { createLogger, Settings } from '@aiostreams/utils';

const logger = createLogger('wrappers');

interface TorboxStream extends Stream {
  name: string;
  url: string;
  hash: string;
  is_cached: boolean;
  size: number;
  description: string;
  magnet?: string;
  nzb?: string;
  seeders?: number;
  peers?: number;
  quality?: string;
  resolution?: string;
  language?: string;
  type?: string;
  source?: string; // Indexer source (e.g., NZBGeek)
  adult?: boolean;
}

export class Torbox extends BaseWrapper {
  constructor(
    apiKey: string,
    addonName: string = 'Torbox',
    addonId: string,
    userConfig: Config,
    indexerTimeout?: number
  ) {
    super(
      addonName,
      Settings.TORBOX_STREMIO_URL + apiKey + '/',
      addonId,
      userConfig,
      indexerTimeout || Settings.DEFAULT_TORBOX_TIMEOUT
    );
  }

  protected parseStream(stream: TorboxStream): ParseResult {
    let type = stream.type;
    let personal = false;
    let sourceIndexer: string | undefined;
    
    if (stream.name.includes('Your Media')) {
      logger.debug(`${stream.name} was detected as a personal stream.`, {
        func: 'torbox',
      });
      personal = true;
    }
    
    // Initialize default values
    let dQuality: string | undefined;
    let dFilename: string | undefined;
    let dSize: string | undefined;
    let dSourceAndLanguage: string | undefined;
    let dAgeOrSeeders: string | undefined;

    // Only try to parse if description exists
    if (stream.description) {
      try {
        const fields = stream.description.split('\n').map((field: string) => {
        if (field.startsWith('Type')) {
          // the last line can either contain only the type or the type and the seeders/age
          // we will always return the age or seeders and assign the type to the variable declared outside the map
          const parts = field.split('|');
          // Extract type from the first part (e.g., "Type: usenet")
          const typePart = parts[0].split(':');
          if (typePart.length > 1) {
            const extractedType = typePart[1].trim().toLowerCase();
            // Only update type if it's a valid type and we don't already have a valid type
            if (['torrent', 'usenet', 'web'].includes(extractedType)) {
              type = extractedType;
            }
          }
          
          // Return the seeders/age from the second part if it exists
          if (parts.length > 1) {
            const valuePart = parts[1].split(':');
            return valuePart.length > 1 ? valuePart[1].trim() : undefined;
          }
          return undefined;
        }
        // Handle case where field might not contain ':'
        const parts = field.split(':');
        if (parts.length < 2) return undefined;

        const [fieldName, ...valueParts] = parts;
        const value = valueParts.join(':'); // Rejoin in case there were more colons
        const trimmedValue = value.trim();
        
        // Extract Source/Indexer from the size or language field
        if (fieldName && fieldName.trim() === 'Size' && trimmedValue.includes('Source')) {
          // Format: "643MB | Source: NZBGeek"
          const parts = trimmedValue.split('|');
          if (parts.length > 1 && parts[1].includes('Source')) {
            sourceIndexer = parts[1].split(':')[1].trim();
            return parts[0].trim(); // Return just the size part
          }
        } else if (fieldName && fieldName.trim() === 'Language' && trimmedValue.includes('Source')) {
          // Format: "Unknown | Source: NZBGeek"
          const parts = trimmedValue.split('|');
          if (parts.length > 1 && parts[1].includes('Source')) {
            sourceIndexer = parts[1].split(':')[1].trim();
            return parts[0].trim(); // Return just the language part
          }
        }
        
        return trimmedValue;
      });

      // Safely assign values from the parsed fields
      [dQuality, dFilename, dSize, dSourceAndLanguage, dAgeOrSeeders] = fields;
      } catch (error) {
        logger.error(`Error parsing stream description: ${error}`, { func: 'torbox' });
      }
    }
    const filename = stream.behaviorHints?.filename || dFilename;
    const parsedFilename: ParsedNameData = parseFilename(
      filename || stream.description
    );

    /* If the quality from Torbox is not one of the qualities in the Config, they get filtered out
    So, for now, we will not update the quality from Torbox
    We can revisit this later and match the quality from Torbox to one of the qualities in the Config
    if (parsedFilename.quality === 'Unknown' && quality !== 'Unknown') {
      parsedFilename.quality = quality;
    }
    */

    const language = stream.language || dSourceAndLanguage;
    const normaliseLanguage = (lang: string) => {
      if (lang.toLowerCase() === 'multi audio') {
        return 'Multi';
      }
      return lang
        .split(' ')
        .map(
          (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        )
        .join(' ');
    };
    if (language) {
      const normalisedLanguage = normaliseLanguage(language);
      if (
        normalisedLanguage !== 'Unknown' &&
        !parsedFilename.languages.includes(normalisedLanguage)
      ) {
        parsedFilename.languages.push(normalisedLanguage);
      }
    }

    // usenet results provide size as a string, we need to convert it to a number
    const validateBehaviorHintSize = (size: string | number | undefined) =>
      typeof size === 'string' ? parseInt(size) : size;
    const sizeInBytes =
      stream.size ||
      validateBehaviorHintSize(stream.behaviorHints?.videoSize) ||
      (dSize ? this.extractSizeInBytes(dSize, 1000) : undefined);

    const provider = {
      id: 'torbox',
      cached: stream.is_cached,
    };

    // If seeders is undefined and we have a source indexer, it's likely a Usenet stream
    if (sourceIndexer && !stream.seeders && type !== 'torrent') {
      type = 'usenet';
    }

    // Set seeders only for torrent type
    const seeders = type === 'torrent' ?
      stream.seeders || (dAgeOrSeeders ? parseInt(dAgeOrSeeders) : undefined) :
      undefined;

    // Set age only for usenet type
    const age = type === 'usenet' ? dAgeOrSeeders || undefined : undefined;

    // Handle infoHash - only for torrent type
    let infoHash = type === 'torrent' ? (stream.hash || this.extractInfoHash(stream.url)) : undefined;

    // Add the sourceIndexer to the indexers field if available
    const indexers = sourceIndexer ? sourceIndexer : undefined;
    
    const parsedStream: ParseResult = this.createParsedResult(
      parsedFilename,
      stream,
      filename,
      sizeInBytes,
      provider,
      seeders,
      age,
      indexers, // The indexers parameter is in the 8th position
      undefined, // This is the duration parameter in the 9th position
      personal,
      infoHash
    );

    return parsedStream;
  }
}

export async function getTorboxStreams(
  config: Config,
  torboxOptions: {
    indexerTimeout?: string;
    overrideName?: string;
  },
  streamRequest: StreamRequest,
  addonId: string
): Promise<{ addonStreams: ParsedStream[]; addonErrors: string[] }> {
  const torboxService = config.services.find(
    (service) => service.id === 'torbox'
  );
  if (!torboxService) {
    throw new Error('Torbox service not found');
  }

  const torboxApiKey = torboxService.credentials.apiKey;
  if (!torboxApiKey) {
    throw new Error('Torbox API key not found');
  }

  const torbox = new Torbox(
    torboxApiKey,
    torboxOptions.overrideName,
    addonId,
    config,
    torboxOptions.indexerTimeout
      ? parseInt(torboxOptions.indexerTimeout)
      : undefined
  );
  return await torbox.getParsedStreams(streamRequest);
}
