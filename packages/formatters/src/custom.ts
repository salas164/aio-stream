import { Config, CustomFormatter, ParsedStream } from '@aiostreams/types';
import { serviceDetails } from '@aiostreams/utils';
import { formatDuration, formatSize } from './utils';

export function customFormat(
  stream: ParsedStream,
  customFormatter: CustomFormatter
): {
  name: string;
  description: string;
} {
  let name: string = '';
  let description: string = '';

  // name

  const templateName =
    parseString(
      customFormatter.name || '',
      convertStreamToParseValue(stream)
    ) || '';

  // description
  const templateDescription =
    parseString(
      customFormatter.description || '',
      convertStreamToParseValue(stream)
    ) || '';

  // Replace placeholders in the template with actual values
  name = templateName;

  description = templateDescription;

  return { name, description };
}

export type ParseValue = {
  stream?: {
    name: string | null;
    size: number | null;
    personal: boolean | null;
    quality: string | null;
    resolution: string | null;
    languages: string[] | null;
    visualTags: string[] | null;
    audioTags: string[] | null;
    releaseGroup: string | null;
    encode: string | null;
    indexer: string | null;
    seeders: number | null;
    age: string | null;
    duration: number | null;
    infoHash: string | null;
    message: string | null;
  };
  provider?: {
    id: string | null;
    shortName: string | null;
    name: string | null;
    cached: boolean | null;
  };
  addon?: {
    id: string;
    name: string;
  };
  debug?: {
    json: string | null;
    jsonf: string | null;
  };
};

const convertStreamToParseValue = (stream: ParsedStream): ParseValue => {
  return {
    stream: {
      name: stream.filename || null,
      size: stream.size || null,
      personal: stream.personal !== undefined ? stream.personal : null,
      quality: stream.quality === 'Unknown' ? null : stream.quality,
      resolution: stream.resolution === 'Unknown' ? null : stream.resolution,
      languages: stream.languages || null,
      visualTags: stream.visualTags,
      audioTags: stream.audioTags,
      releaseGroup:
        stream.releaseGroup === 'Unknown' ? null : stream.releaseGroup,
      encode: stream.encode === 'Unknown' ? null : stream.encode,
      indexer: stream.indexers || null,
      seeders: stream.torrent?.seeders || null,
      age: stream.usenet?.age || null,
      duration: stream.duration || null,
      infoHash: stream.torrent?.infoHash || null,
      message: stream.message || null,
    },
    addon: {
      id: stream.addon.id,
      name: stream.addon.name,
    },
    provider: {
      id: stream.provider?.id || null,
      shortName: stream.provider?.id
        ? serviceDetails.find((service) => service.id === stream.provider?.id)
            ?.shortName || null
        : null,
      name: stream.provider?.id
        ? serviceDetails.find((service) => service.id === stream.provider?.id)
            ?.name || null
        : null,
      cached:
        stream.provider?.cached !== undefined ? stream.provider?.cached : null,
    },
  };
};

function parseString(str: string, value: ParseValue) {
  if (!str) return null;

  const replacer = (key: string, value: unknown) => {
    return value;
  };

  const data = {
    stream: value.stream,
    provider: value.provider,
    addon: value.addon,
  };

  value.debug = {
    json: JSON.stringify(data, replacer),
    jsonf: JSON.stringify(data, replacer, 2),
  };

  const re =
    /\{(?<type>stream|provider|debug|addon)\.(?<prop>\w+)(::(?<mod>(\w+(\([^)]*\))?|<|<=|=|>=|>|\^|\$|~|\/)+))?((::(?<mod_tzlocale>\S+?))|(?<mod_check>\[(?<mod_check_true>".*?")\|\|(?<mod_check_false>".*?")\]))?\}/gi;
  let matches: RegExpExecArray | null;

  while ((matches = re.exec(str))) {
    if (!matches.groups) continue;

    const index = matches.index as number;

    const getV = value[matches.groups.type as keyof ParseValue];

    if (!getV) {
      str = replaceCharsFromString(str, '{unknown_type}', index, re.lastIndex);
      re.lastIndex = index;
      continue;
    }

    const v =
      getV[
        matches.groups.prop as
          | keyof ParseValue['stream']
          | keyof ParseValue['provider']
          | keyof ParseValue['addon']
      ];

    if (v === undefined) {
      str = replaceCharsFromString(str, '{unknown_value}', index, re.lastIndex);
      re.lastIndex = index;
      continue;
    }

    if (matches.groups.mod) {
      str = replaceCharsFromString(
        str,
        modifier(
          matches.groups.mod,
          v,
          matches.groups.mod_tzlocale ?? undefined,
          matches.groups.mod_check_true ?? undefined,
          matches.groups.mod_check_false ?? undefined,
          value
        ),
        index,
        re.lastIndex
      );
      re.lastIndex = index;
      continue;
    }

    str = replaceCharsFromString(str, v, index, re.lastIndex);
    re.lastIndex = index;
  }

  return str
    .replace(/\\n/g, '\n')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .join('\n');
}

function modifier(
  mod: string,
  value: unknown,
  tzlocale?: string,
  check_true?: string,
  check_false?: string,
  _value?: ParseValue
): string {
  mod = mod.toLowerCase();
  check_true = check_true?.slice(1, -1);
  check_false = check_false?.slice(1, -1);

  if (Array.isArray(value)) {
    switch (true) {
      case mod === 'join':
        return value.join(', ');
      case mod.startsWith('join(') && mod.endsWith(')'):
        // Extract the separator from join(separator)
        // e.g. join(' - ')
        const separator = mod
          .substring(5, mod.length - 1)
          .replace(/^['"]|['"]$/g, '');
        return value.join(separator);
      case mod == 'length':
        return value.length.toString();
      case mod == 'first':
        return value.length > 0 ? String(value[0]) : '';
      case mod == 'last':
        return value.length > 0 ? String(value[value.length - 1]) : '';
      case mod == 'random':
        return value.length > 0
          ? String(value[Math.floor(Math.random() * value.length)])
          : '';
      case mod == 'sort':
        return [...value].sort().join(', ');
      case mod == 'reverse':
        return [...value].reverse().join(', ');
      case mod == 'exists': {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_array_modifier(${mod})}`;

        if (_value) {
          return value.length > 0
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value.length > 0 ? check_true : check_false;
      }
      default:
        return `{unknown_array_modifier(${mod})}`;
    }
  } else if (typeof value === 'string') {
    switch (true) {
      case mod == 'upper':
        return value.toUpperCase();
      case mod == 'lower':
        return value.toLowerCase();
      case mod == 'title':
        return value.charAt(0).toUpperCase() + value.slice(1);
      case mod == 'length':
        return value.length.toString();
      case mod == 'reverse':
        return value.split('').reverse().join('');
      case mod == 'base64':
        return btoa(value);
      case mod == 'string':
        return value;
      case mod == 'exists': {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_str_modifier(${mod})}`;

        if (_value) {
          return value != 'null' && value
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value != 'null' && value ? check_true : check_false;
      }
      case mod.startsWith('='): {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_str_modifier(${mod})}`;

        const check = mod.replace('=', '');

        if (!check) return `{unknown_str_modifier(${mod})}`;

        if (_value) {
          return value.toLowerCase() == check
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value.toLowerCase() == check ? check_true : check_false;
      }
      case mod.startsWith('$'): {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_str_modifier(${mod})}`;

        const check = mod.replace('$', '');

        if (!check) return `{unknown_str_modifier(${mod})}`;

        if (_value) {
          return value.toLowerCase().startsWith(check)
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value.toLowerCase().startsWith(check) ? check_true : check_false;
      }
      case mod.startsWith('^'): {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_str_modifier(${mod})}`;

        const check = mod.replace('^', '');

        if (!check) return `{unknown_str_modifier(${mod})}`;

        if (_value) {
          return value.toLowerCase().endsWith(check)
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value.toLowerCase().endsWith(check) ? check_true : check_false;
      }
      case mod.startsWith('~'): {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_str_modifier(${mod})}`;

        const check = mod.replace('~', '');

        if (!check) return `{unknown_str_modifier(${mod})}`;

        if (_value) {
          return value.toLowerCase().includes(check)
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value.toLowerCase().includes(check) ? check_true : check_false;
      }
      default:
        return `{unknown_str_modifier(${mod})}`;
    }
  } else if (typeof value === 'number') {
    switch (true) {
      case mod == 'comma':
        return value.toLocaleString();
      case mod == 'hex':
        return value.toString(16);
      case mod == 'octal':
        return value.toString(8);
      case mod == 'binary':
        return value.toString(2);
      case mod == 'bytes':
        return formatSize(value);
      case mod == 'string':
        return value.toString();
      case mod == 'time':
        return formatDuration(value);
      case mod.startsWith('>='): {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_int_modifier(${mod})}`;

        const check = Number(mod.replace('>=', ''));

        if (Number.isNaN(check)) return `{unknown_int_modifier(${mod})}`;

        if (_value) {
          return value >= check
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value >= check ? check_true : check_false;
      }
      case mod.startsWith('>'): {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_int_modifier(${mod})}`;

        const check = Number(mod.replace('>', ''));

        if (Number.isNaN(check)) return `{unknown_int_modifier(${mod})}`;

        if (_value) {
          return value > check
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value > check ? check_true : check_false;
      }
      case mod.startsWith('='): {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_int_modifier(${mod})}`;

        const check = Number(mod.replace('=', ''));

        if (Number.isNaN(check)) return `{unknown_int_modifier(${mod})}`;

        if (_value) {
          return value == check
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value == check ? check_true : check_false;
      }
      case mod.startsWith('<='): {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_int_modifier(${mod})}`;

        const check = Number(mod.replace('<=', ''));

        if (Number.isNaN(check)) return `{unknown_int_modifier(${mod})}`;

        if (_value) {
          return value <= check
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value <= check ? check_true : check_false;
      }
      case mod.startsWith('<'): {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_int_modifier(${mod})}`;

        const check = Number(mod.replace('<', ''));

        if (Number.isNaN(check)) return `{unknown_int_modifier(${mod})}`;

        if (_value) {
          return value < check
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value < check ? check_true : check_false;
      }
      default:
        return `{unknown_int_modifier(${mod})}`;
    }
  } else if (typeof value === 'boolean') {
    switch (true) {
      case mod == 'istrue': {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_bool_modifier(${mod})}`;

        if (_value) {
          return value
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return value ? check_true : check_false;
      }
      case mod == 'isfalse': {
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_bool_modifier(${mod})}`;

        if (_value) {
          return !value
            ? parseString(check_true, _value) || check_true
            : parseString(check_false, _value) || check_false;
        }

        return !value ? check_true : check_false;
      }
      default:
        return `{unknown_bool_modifier(${mod})}`;
    }
  }

  if (
    typeof check_false == 'string' &&
    (['>', '>=', '=', '<=', '<', '~', '$', '^'].some((modif) =>
      mod.startsWith(modif)
    ) ||
      ['istrue', 'exists'].includes(mod))
  ) {
    if (_value) return parseString(check_false, _value) || check_false;
    return check_false;
  }

  return `{unknown_modifier(${mod})}`;
}

function replaceCharsFromString(
  str: string,
  replace: string,
  start: number,
  end: number
): string {
  return str.slice(0, start) + replace + str.slice(end);
}
