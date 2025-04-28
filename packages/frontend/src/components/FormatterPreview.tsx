import React from 'react';
import styles from './FormatterPreview.module.css';
import { ParsedStream } from '@aiostreams/types';
import {
  gdriveFormat,
  torrentioFormat,
  torboxFormat,
} from '@aiostreams/formatters';

interface FormatterPreviewProps {
  formatter: string;
}

const FormatterPreview: React.FC<FormatterPreviewProps> = ({ formatter }) => {
  // Create a sample stream for preview
  const sampleStream: ParsedStream = {
    addon: {
      id: 'aiostreams',
      name: 'AIOStreams',
    },
    resolution: '4K',
    quality: 'BluRay',
    encode: 'HEVC',
    visualTags: ['HDR', 'DV'],
    audioTags: ['Atmos', 'TrueHD'],
    languages: ['English', 'Spanish', 'French'],
    filename: 'Movie.Title.2023.2160p.BluRay.HEVC.DV.TrueHD.Atmos.7.1-GROUP',
    size: 62500000000, // 58.2 GB
    duration: 9120, // 2h 32m
    provider: {
      id: 'realdebrid',
      cached: true,
    },
    torrent: {
      seeders: 125,
    },
    indexers: 'RARBG',
    type: 'debrid',
  };

  const getFormatterExample = () => {
    switch (formatter) {
      case 'gdrive':
        return gdriveFormat(sampleStream, false);
      case 'minimalistic-gdrive':
        return gdriveFormat(sampleStream, true);
      case 'torrentio':
        return torrentioFormat(sampleStream);
      case 'torbox':
        return torboxFormat(sampleStream);
      case 'imposter':
        return {
          name: 'ಞ AIOStreams 4K ಞ',
          description:
            'ಞ Sus: Very ಞ\nಞ Vented: Yes ಞ\nಞ Tasks: None ಞ\nಞ Crewmates: 0 ಞ',
        };
      default:
        return gdriveFormat(sampleStream, false);
    }
  };

  const example = getFormatterExample();

  return (
    <div className={styles.previewContainer}>
      <div className={styles.streamPreview}>
        <div className={styles.streamName}>{example.name}</div>
        <div className={styles.streamDescription}>{example.description}</div>
      </div>
    </div>
  );
};

export default FormatterPreview;
