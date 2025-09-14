export * from './base';
export * from './utils';
export * from './stremthru';
export * from './torbox';

import { ServiceId } from '../utils';
import { DebridService, DebridServiceConfig } from './base';
import { StremThruInterface } from './stremthru';
import { TorboxDebridService } from './torbox';
import { StremThruPreset } from '../presets/stremthru';

export function getDebridService(
  serviceName: ServiceId,
  token: string,
  clientIp?: string
): DebridService {
  const config: DebridServiceConfig = {
    token,
    clientIp,
  };

  switch (serviceName) {
    case 'torbox':
      return new TorboxDebridService(config);
    default:
      if (StremThruPreset.supportedServices.includes(serviceName)) {
        return new StremThruInterface({ ...config, serviceName });
      }
      throw new Error(`Unknown debrid service: ${serviceName}`);
  }
}
