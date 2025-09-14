import { Addon, Option, Stream, UserData } from '../db';
import { Preset, baseOptions } from './preset';
import { Env, RESOURCES, ServiceId, constants } from '../utils';
import { StremThruPreset } from './stremthru';
import { BuiltinAddonPreset } from './builtin';

export class ProwlarrPreset extends BuiltinAddonPreset {
  static override get METADATA() {
    const supportedResources = [constants.STREAM_RESOURCE];
    const options: Option[] = [
      {
        id: 'name',
        name: 'Name',
        description: 'What to call this addon',
        type: 'string',
        required: true,
        default: 'Prowlarr',
      },
      {
        id: 'timeout',
        name: 'Timeout',
        description: 'The timeout for this addon',
        type: 'number',
        default: Env.DEFAULT_TIMEOUT,
        constraints: {
          min: Env.MIN_TIMEOUT,
          max: Env.MAX_TIMEOUT,
        },
      },
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
      ID: 'prowlarr',
      NAME: 'Prowlarr',
      LOGO: 'https://raw.githubusercontent.com/Prowlarr/Prowlarr/refs/heads/develop/Logo/256.png',
      URL: `${Env.INTERNAL_URL}/builtins/prowlarr`,
      TIMEOUT: Env.DEFAULT_TIMEOUT,
      USER_AGENT: Env.DEFAULT_USER_AGENT,
      SUPPORTED_SERVICES: StremThruPreset.supportedServices,
      DESCRIPTION:
        'Directly search a Prowlarr instance for results with your services.',
      OPTIONS: options,
      SUPPORTED_STREAM_TYPES: [constants.DEBRID_STREAM_TYPE],
      SUPPORTED_RESOURCES: supportedResources,
      BUILTIN: true,
    };
  }

  static async generateAddons(
    userData: UserData,
    options: Record<string, any>
  ): Promise<Addon[]> {
    const usableServices = this.getUsableServices(userData, options.services);
    if (
      (!usableServices || usableServices.length === 0) &&
      !options.enableP2P
    ) {
      throw new Error(
        `${this.METADATA.NAME} requires at least one usable service, but none were found. Please enable at least one of the following services: ${this.METADATA.SUPPORTED_SERVICES.join(
          ', '
        )}`
      );
    }
    return [
      this.generateAddon(
        userData,
        options,
        usableServices?.map((service) => service.id) || []
      ),
    ];
  }

  private static generateAddon(
    userData: UserData,
    options: Record<string, any>,
    services: ServiceId[]
  ): Addon {
    return {
      name: options.name || this.METADATA.NAME,
      manifestUrl: this.generateManifestUrl(userData, services, options),
      enabled: true,
      library: options.libraryAddon ?? false,
      resources: options.resources || undefined,
      timeout: options.timeout || this.METADATA.TIMEOUT,
      preset: {
        id: '',
        type: this.METADATA.ID,
        options: options,
      },
      formatPassthrough:
        options.formatPassthrough ?? options.streamPassthrough ?? false,
      resultPassthrough: options.resultPassthrough ?? false,
      forceToTop: options.forceToTop ?? false,
      headers: {
        'User-Agent': this.METADATA.USER_AGENT,
      },
    };
  }

  protected static generateManifestUrl(
    userData: UserData,
    services: ServiceId[],
    options: Record<string, any>
  ) {
    const config = {
      url: Env.BUILTIN_PROWLARR_URL,
      apiKey: Env.BUILTIN_PROWLARR_API_KEY,
      indexers: Env.BUILTIN_PROWLARR_INDEXERS || [],
      tmdbAccessToken: userData.tmdbAccessToken,
      tmdbApiKey: userData.tmdbApiKey,
      services: services.map((service) => ({
        id: service,
        credential: this.getServiceCredential(service, userData),
      })),
    };

    const configString = this.base64EncodeJSON(config);
    return `${this.METADATA.URL}/${configString}/manifest.json`;
  }
}
