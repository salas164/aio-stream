import { Option, UserData } from '../db';
import { Env, constants } from '../utils';
import { baseOptions } from './preset';
import { StremThruPreset } from './stremthru';
import { TorznabPreset } from './torznab';

export class AnimeToshoPreset extends TorznabPreset {
  static override get METADATA() {
    const supportedResources = [constants.STREAM_RESOURCE];
    const options: Option[] = [
      ...baseOptions(
        'AnimeTosho',
        supportedResources,
        Env.BUILTIN_ANIMETOSHO_TIMEOUT || Env.DEFAULT_TIMEOUT
      ).filter((option) => option.id !== 'url' && option.id !== 'resources'),
      {
        id: 'services',
        name: 'Services',
        description:
          'Optionally override the services that are used. If not specified, then the services that are enabled and supported will be used.',
        type: 'multi-select',
        required: false,
        showInNoobMode: false,
        options: StremThruPreset.supportedServices.map((service) => ({
          value: service,
          label: constants.SERVICE_DETAILS[service].name,
        })),
        default: undefined,
        emptyIsUndefined: true,
      },
    ];

    return {
      ID: 'animetosho',
      NAME: 'AnimeTosho',
      LOGO: '/assets/animetosho_logo.png',
      URL: Env.BUILTIN_ANIMETOSHO_URL,
      TIMEOUT: Env.BUILTIN_ANIMETOSHO_TIMEOUT || Env.DEFAULT_TIMEOUT,
      USER_AGENT: Env.DEFAULT_USER_AGENT,
      SUPPORTED_SERVICES: StremThruPreset.supportedServices,
      DESCRIPTION: 'Directly search AnimeTosho.',
      OPTIONS: options,
      SUPPORTED_STREAM_TYPES: [constants.DEBRID_STREAM_TYPE],
      SUPPORTED_RESOURCES: supportedResources,
      BUILTIN: true,
    };
  }

  protected static override generateManifestUrl(
    userData: UserData,
    services: constants.ServiceId[],
    options: Record<string, any>
  ): string {
    const animetoshoUrl = this.METADATA.URL;

    const config = {
      url: animetoshoUrl,
      apiPath: '/api',
      tmdbAccessToken: userData.tmdbAccessToken,
      tmdbApiKey: userData.tmdbApiKey,
      services: services.map((service) => ({
        id: service,
        credential: this.getServiceCredential(service, userData),
      })),
    };

    const configString = this.base64EncodeJSON(config);
    return `${Env.INTERNAL_URL}/builtins/torznab/${configString}/manifest.json`;
  }
}
