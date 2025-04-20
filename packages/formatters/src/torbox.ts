import { ParsedStream } from '@aiostreams/types';
import { formatSize } from './utils';
import { serviceDetails } from '@aiostreams/utils';

export function torboxFormat(stream: ParsedStream): {
  name: string;
  description: string;
} {
  let name: string = '';

  name += `${stream.addon.name}\n`;
  if (stream.provider) {
    const serviceShortName =
      serviceDetails.find((service) => service.id === stream.provider!.id)
        ?.shortName || stream.provider.id;
    name += `(${serviceShortName}${stream.provider.cached === undefined ? ' Unknown' : stream.provider.cached ? ' Instant' : ''})\n`;
  }

  if (stream.torrent?.infoHash) {
    name += `(P2P)\n`;
  }

  name += `${stream.personal ? '(Your Media) ' : ''}(${stream.resolution})`;

  let description: string = '';

  description += `Quality: ${stream.quality}
Name: ${stream.filename}
Size: ${formatSize(stream.size || 0)}`;

  // Add Source/Indexer information if available
  if (stream.indexers) {
    description += ` | Source: ${stream.indexers}`;
  }

  description += `
Language: ${stream.languages.length > 0 ? stream.languages.join(', ') : 'Unknown'}`;

  // Determine stream type based on multiple indicators
  let streamType = 'Unknown';
  if (stream.usenet?.age || stream.type === 'usenet') {
    streamType = 'Usenet';
  } else if (stream.torrent?.infoHash || stream.torrent?.seeders || stream.type === 'p2p') {
    streamType = 'Torrent';
  } else if (stream.url) {
    streamType = 'Direct';
  }
  description += `
Type: ${streamType}`;

  if (streamType === 'Torrent' || streamType === 'Usenet') {
    description += ` | ${streamType === 'Torrent' ? 'Seeders' : 'Age'}: ${streamType === 'Torrent' ? stream.torrent?.seeders : stream.usenet?.age}`;
  }

  if (stream.message) {
    description += `\n${stream.message}`;
  }

  return { name, description };
}
