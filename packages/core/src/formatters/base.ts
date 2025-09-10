import { ParsedStream, UserData } from '../db';
// import { constants, Env, createLogger } from '../utils';
import * as constants from '../utils/constants';
import { createLogger } from '../utils/logger';
import {
  formatBytes,
  formatDuration,
  languageToCode,
  languageToEmoji,
  makeSmall,
} from './utils';
import { Env } from '../utils/env';

const logger = createLogger('formatter');

/**
 *
 * The custom formatter code in this file was adapted from https://github.com/diced/zipline/blob/trunk/src/lib/parser/index.ts
 *
 * The original code is licensed under the MIT License.
 *
 * MIT License
 *
 * Copyright (c) 2023 dicedtomato
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export interface FormatterConfig {
  name: string;
  description: string;
}

export interface ParseValue {
  config?: {
    addonName: string | null;
  };
  stream?: {
    filename: string | null;
    folderName: string | null;
    size: number | null;
    folderSize: number | null;
    library: boolean | null;
    quality: string | null;
    resolution: string | null;
    languages: string[] | null;
    uLanguages: string[] | null;
    languageEmojis: string[] | null;
    uLanguageEmojis: string[] | null;
    languageCodes: string[] | null;
    uLanguageCodes: string[] | null;
    smallLanguageCodes: string[] | null;
    uSmallLanguageCodes: string[] | null;
    wedontknowwhatakilometeris: string[] | null;
    uWedontknowwhatakilometeris: string[] | null;
    visualTags: string[] | null;
    audioTags: string[] | null;
    releaseGroup: string | null;
    regexMatched: string | null;
    encode: string | null;
    audioChannels: string[] | null;
    indexer: string | null;
    year: string | null;
    title: string | null;
    season: number | null;
    seasons: number[] | null;
    episode: number | null;
    seasonEpisode: string[] | null;
    seeders: number | null;
    age: string | null;
    duration: number | null;
    infoHash: string | null;
    type: string | null;
    message: string | null;
    proxied: boolean | null;
  };
  service?: {
    id: string | null;
    shortName: string | null;
    name: string | null;
    cached: boolean | null;
  };
  addon?: {
    name: string | null;
    presetId: string | null;
    manifestUrl: string | null;
  };
  debug?: {
    json: string | null;
    jsonf: string | null;
    modifier: string | null;
  };
}

const stringModifiers = {
  'upper': (value: string) => value.toUpperCase(),
  'lower': (value: string) => value.toLowerCase(),
  'title': (value: string) => value
            .split(' ')
            .map((word) => word.toLowerCase())
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' '),
  'length': (value: string) => value.length.toString(),
  'reverse': (value: string) => value.split('').reverse().join(''),
  'base64': (value: string) => btoa(value),
  'string': (value: string) => value,
}

const arrayModifierGetOrDefault = (value: string[], i: number) => value.length > 0 ? String(value[i]) : '';
const arrayModifiers = {
  'join': (value: string[]) => value.join(", "),
  'length': (value: string[]) => value.length.toString(),
  'first': (value: string[]) => arrayModifierGetOrDefault(value, 0),
  'last': (value: string[]) => arrayModifierGetOrDefault(value, value.length - 1),
  'random': (value: string[]) => arrayModifierGetOrDefault(value, Math.floor(Math.random() * value.length)),
  'sort': (value: string[]) => [...value].sort(),
  'reverse': (value: string[]) => [...value].reverse(),
}

const numberModifiers = {
  'comma': (value: number) => value.toLocaleString(),
  'hex': (value: number) => value.toString(16),
  'octal': (value: number) => value.toString(8),
  'binary': (value: number) => value.toString(2),
  'bytes': (value: number) => formatBytes(value, 1000),
  'bytes10': (value: number) => formatBytes(value, 1000),
  'bytes2': (value: number) => formatBytes(value, 1024),
  'string': (value: number) => value.toString(),
  'time': (value: number) => formatDuration(value),
}

export const conditionalModifiers = {
  exact: {
    'istrue': (value: any) => value === true,
    'isfalse': (value: any) => value === false,
    'exists': (value: any) => {
      // Handle null, undefined, empty strings, empty arrays
      if (value === undefined || value === null) return false;
      if (typeof value === 'string') return /\S/.test(value); // has at least one non-whitespace character
      if (Array.isArray(value)) return value.length > 0;
      // For other types (numbers, booleans, objects), consider them as "existing"
      return true;
    },
  },

  prefix: {
    '$': (value: string, check: string) => value.startsWith(check),
    '^': (value: string, check: string) => value.endsWith(check),
    '~': (value: string, check: string) => value.includes(check),
    '=': (value: string, check: string) => value == check,
    '>=': (value: string | number, check: string | number) => value >= check,
    '>': (value: string | number, check: string | number) => value > check,
    '<=': (value: string | number, check: string | number) => value <= check,
    '<': (value: string | number, check: string | number) => value < check,
  },
}

const hardcodedModifiersForRegexMatching = {
  "join('.*?')": null,
  'join(".*?")': null,
  "$.*?": null,
  "^.*?": null,
  "~.*?": null,
  "=.*?": null,
  ">=.*?": null,
  ">.*?": null,
  "<=.*?": null,
  "<.*?": null,
}

const modifiers = {
  ...hardcodedModifiersForRegexMatching,
  ...stringModifiers,
  ...numberModifiers,
  ...arrayModifiers,
  ...conditionalModifiers.exact,
  // ...conditionalModifiers.prefix,
}

const debugModifierToolReplacement = `
String: {config.addonName}
  ::upper {config.addonName::upper}
  ::lower {config.addonName::lower}
  ::title {config.addonName::title}
  ::length {config.addonName::length}
  ::reverse {config.addonName::reverse}
{tools.newLine}

Number: {stream.size}
  ::bytes {stream.size::bytes}
  ::time {stream.size::time}
  ::hex {stream.size::hex}
  ::octal {stream.size::octal}
  ::binary {stream.size::binary}
{tools.newLine}

Array: {stream.languages}
  ::join('-separator-') {stream.languages::join("-separator-")}
  ::length {stream.languages::length}
  ::first {stream.languages::first}
  ::last {stream.languages::last}
{tools.newLine}

Boolean: {stream.proxied}
  ::istrue {stream.proxied::istrue["true"||"false"]}
  ::isfalse {stream.proxied::isfalse["true"||"false"]}
{tools.newLine}

Conditional:
  filename::exists    {stream.filename::exists["true"||"false"]}
  filename::$Movie    {stream.filename::$Movie["true"||"false"]}
  filename::^Title    {stream.filename::^Title["true"||"false"]}
  filename::~test     {stream.filename::~test["true"||"false"]}
  filename::=test     {stream.filename::=test["true"||"false"]}
  filesize::>=100     {stream.size::>=100["true"||"false"]}
  filesize::>50       {stream.size::>50["true"||"false"]}
  filesize::<=200     {stream.size::<=200["true"||"false"]}
  filesize::<150      {stream.size::<150["true"||"false"]}
{tools.newLine}

[Advanced] Multiple modifiers
  <string>::reverse::title::reverse   {config.addonName} -> {config.addonName::reverse::title::reverse}
  <number>::string::reverse           {stream.size} -> {stream.size::string::reverse}
  <array>::string::reverse            {stream.languages} -> {stream.languages::join("::")::reverse}
  <boolean>::length::>=2              {stream.languages} -> {stream.languages::length::>=2["true"||"false"]}
`;

export abstract class BaseFormatter {
  protected config: FormatterConfig;
  protected userData: UserData;

  constructor(config: FormatterConfig, userData: UserData) {
    this.config = config;
    this.userData = userData;
  }

  public format(stream: ParsedStream): { name: string; description: string } {
    const parseValue = this.convertStreamToParseValue(stream);
    return {
      name: this.parseString(this.config.name, parseValue) || '',
      description: this.parseString(this.config.description, parseValue) || '',
    };
  }

  protected convertStreamToParseValue(stream: ParsedStream): ParseValue {
    const languages = stream.parsedFile?.languages || null;
    const userSpecifiedLanguages = [
      ...new Set([
        ...(this.userData.preferredLanguages || []),
        ...(this.userData.requiredLanguages || []),
        ...(this.userData.includedLanguages || []),
      ]),
    ];

    const sortedLanguages = languages
      ? [...languages].sort((a, b) => {
          const aIndex = userSpecifiedLanguages.indexOf(a as any);
          const bIndex = userSpecifiedLanguages.indexOf(b as any);

          const aInUser = aIndex !== -1;
          const bInUser = bIndex !== -1;

          return aInUser && bInUser
            ? aIndex - bIndex
            : aInUser
              ? -1
              : bInUser
                ? 1
                : languages.indexOf(a) - languages.indexOf(b);
        })
      : null;

    const onlyUserSpecifiedLanguages = sortedLanguages?.filter((lang) =>
      userSpecifiedLanguages.includes(lang as any)
    );
    return {
      config: {
        addonName: this.userData.addonName || Env.ADDON_NAME,
      },
      stream: {
        filename: stream.filename || null,
        folderName: stream.folderName || null,
        size: stream.size || null,
        folderSize: stream.folderSize || null,
        library: stream.library !== undefined ? stream.library : null,
        quality: stream.parsedFile?.quality || null,
        resolution: stream.parsedFile?.resolution || null,
        languages: sortedLanguages || null,
        uLanguages: onlyUserSpecifiedLanguages || null,
        languageEmojis: sortedLanguages
          ? sortedLanguages
              .map((lang) => languageToEmoji(lang) || lang)
              .filter((value, index, self) => self.indexOf(value) === index)
          : null,
        uLanguageEmojis: onlyUserSpecifiedLanguages
          ? onlyUserSpecifiedLanguages
              .map((lang) => languageToEmoji(lang) || lang)
              .filter((value, index, self) => self.indexOf(value) === index)
          : null,
        languageCodes: sortedLanguages
          ? sortedLanguages
              .map((lang) => languageToCode(lang) || lang.toUpperCase())
              .filter((value, index, self) => self.indexOf(value) === index)
          : null,
        uLanguageCodes: onlyUserSpecifiedLanguages
          ? onlyUserSpecifiedLanguages
              .map((lang) => languageToCode(lang) || lang.toUpperCase())
              .filter((value, index, self) => self.indexOf(value) === index)
          : null,
        smallLanguageCodes: sortedLanguages
          ? sortedLanguages
              .map((lang) => languageToCode(lang) || lang)
              .filter((value, index, self) => self.indexOf(value) === index)
              .map((code) => makeSmall(code))
          : null,
        uSmallLanguageCodes: onlyUserSpecifiedLanguages
          ? onlyUserSpecifiedLanguages
              .map((lang) => languageToCode(lang) || lang)
              .filter((value, index, self) => self.indexOf(value) === index)
              .map((code) => makeSmall(code))
          : null,
        wedontknowwhatakilometeris: sortedLanguages
          ? sortedLanguages
              .map((lang) => languageToEmoji(lang) || lang)
              .map((emoji) => emoji.replace('🇬🇧', '🇺🇸🦅'))
              .filter((value, index, self) => self.indexOf(value) === index)
          : null,
        uWedontknowwhatakilometeris: onlyUserSpecifiedLanguages
          ? onlyUserSpecifiedLanguages
              .map((lang) => languageToEmoji(lang) || lang)
              .map((emoji) => emoji.replace('🇬🇧', '🇺🇸🦅'))
              .filter((value, index, self) => self.indexOf(value) === index)
          : null,
        visualTags: stream.parsedFile?.visualTags || null,
        audioTags: stream.parsedFile?.audioTags || null,
        releaseGroup: stream.parsedFile?.releaseGroup || null,
        regexMatched: stream.regexMatched?.name || null,
        encode: stream.parsedFile?.encode || null,
        audioChannels: stream.parsedFile?.audioChannels || null,
        indexer: stream.indexer || null,
        seeders: stream.torrent?.seeders ?? null,
        year: stream.parsedFile?.year || null,
        type: stream.type || null,
        title: stream.parsedFile?.title || null,
        season: stream.parsedFile?.season || null,
        seasons: stream.parsedFile?.seasons || null,
        episode: stream.parsedFile?.episode || null,
        seasonEpisode: stream.parsedFile?.seasonEpisode || null,
        duration: stream.duration || null,
        infoHash: stream.torrent?.infoHash || null,
        age: stream.age || null,
        message: stream.message || null,
        proxied: stream.proxied !== undefined ? stream.proxied : null,
      },
      addon: {
        name: stream.addon?.name || null,
        presetId: stream.addon?.preset?.type || null,
        manifestUrl: stream.addon?.manifestUrl || null,
      },
      service: {
        id: stream.service?.id || null,
        shortName: stream.service?.id
          ? Object.values(constants.SERVICE_DETAILS).find(
              (service) => service.id === stream.service?.id
            )?.shortName || null
          : null,
        name: stream.service?.id
          ? Object.values(constants.SERVICE_DETAILS).find(
              (service) => service.id === stream.service?.id
            )?.name || null
          : null,
        cached:
          stream.service?.cached !== undefined ? stream.service?.cached : null,
      },
    };
  }

  // Build the modifier regex pattern from modifier keys
  protected buildModifierRegexPattern(): string {
    const validModifiers = Object.keys(modifiers)
      .map(key => key.replace(/[\(\)\'\"\$\^\~\=\>\<]/g, '\\$&'));
    return `::(${validModifiers.join('|')})`;
  }

  protected buildRegexExpression(): RegExp {
    // Dynamically build the `variable` regex pattern from ParseValue keys
    // Futureproof: if we add new keys to ParseValue interface, we must add them here too
    const hardcodedParseValueKeysForRegexMatching = this.convertStreamToParseValue({} as ParsedStream);
    const validVariables: (keyof ParseValue)[] = Object.keys(hardcodedParseValueKeysForRegexMatching) as (keyof ParseValue)[];
    // Get all valid properties (subkeys) from ParseValue structure
    const validProperties = validVariables.flatMap(sectionKey => {
      const section = hardcodedParseValueKeysForRegexMatching[sectionKey as keyof ParseValue];
      if (section && typeof section === 'object' && section !== null) {
        return Object.keys(section);
      }
      return [];
    });
    const variable = `(?<variableName>${validVariables.join('|')})\\.(?<propertyName>${validProperties.join('|')})`;

    const singleValidModifier = this.buildModifierRegexPattern();
    
    // Build the conditional check pattern separately
    // Use [^"]* to capture anything except quotes, making it non-greedy
    const checkTrue = `"(?<mod_check_true>[^"]*)"`;
    const checkFalse = `"(?<mod_check_false>[^"]*)"`;
    const checkTF = `\\[(?<mod_check>${checkTrue}\\|\\|${checkFalse})\\]`;

    // TZ Locale pattern (e.g. 'UTC', 'GMT', 'EST', 'PST', 'en-US', 'en-GB', 'Europe/London', 'America/New_York')
    const modTZLocale = `::(?<mod_tzlocale>[A-Za-z]{2,3}(?:-[A-Z]{2})?|[A-Za-z]+?/[A-Za-z_]+?)`;

    const regexPattern = `\\{${variable}(?<modifiers>(${singleValidModifier})+)?(${modTZLocale})?(${checkTF})?\\}`;
    
    return new RegExp(regexPattern, 'gi')
  }

  protected parseString(str: string, value: ParseValue): string | null {
    if (!str) return null;

    const replacer = (key: string, value: unknown) => {
      return value;
    };

    value.debug = {
      json: JSON.stringify({ ...value, debug: undefined }, replacer),
      jsonf: JSON.stringify({ ...value, debug: undefined }, replacer, 2),
      modifier: debugModifierToolReplacement,
    };

    const re = this.buildRegexExpression();
    let matches: RegExpExecArray | null;

    while (matches = re.exec(str)) {
      if (!matches.groups) continue;

      const index = matches.index as number;

      // Validate - variableName (exists in value)
      const variableDict = value[matches.groups.variableName as keyof ParseValue];
      if (!variableDict) {
        str = this.replaceCharsFromString(
          str,
          '{unknown_variableName}',
          index,
          re.lastIndex
        );
        re.lastIndex = index;
        continue;
      }

      // Validate - property: variableDict[propertyName]
      const property = variableDict[matches.groups.propertyName as keyof typeof variableDict];
      if (property === undefined) {
        str = this.replaceCharsFromString(
          str,
          '{unknown_propertyName}',
          index,
          re.lastIndex
        );
        re.lastIndex = index;
        continue;
      }

      // Validate and Process - Modifier(s)
      if (matches.groups.modifiers) {
        let result = this.applyModifiers(matches.groups, property, value);
        // handle unknown modifier result
        if (result === undefined) {
          result = `{unknown_modifier(${matches.groups.modifiers})}`;
          if (['string', 'number', 'boolean', 'object', 'array'].includes(typeof property)) {
            result = `{unknown_${typeof property}_modifier(${matches.groups.modifiers})}`;
          }
        }
        str = this.replaceCharsFromString(
          str,
          result,
          index,
          re.lastIndex
        );
        re.lastIndex = index;
        continue;
      }

      str = this.replaceCharsFromString(str, property, index, re.lastIndex);
      re.lastIndex = index;
    }

    return str
      .replace(/\\n/g, '\n')
      .split('\n')
      .filter(
        (line) => line.trim() !== '' && !line.includes('{tools.removeLine}')
      )
      .join('\n')
      .replace(/\{tools.newLine\}/g, '\n');
  }

  protected applyModifiers(
    groups: {[key: string]: string},
    input: any,
    parseValue: ParseValue,
  ): string | undefined {
    const singleModTerminator = '((::)|($))'; // :: if there's multiple modifiers or $ for the end of the string
    const singleValidModRe = new RegExp(this.buildModifierRegexPattern() + singleModTerminator, 'gi');
    
    let result = input as any;
    // iterate over modifiers in order of appearance
    for (const modMatch of [...groups.modifiers.matchAll(singleValidModRe)].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
      if (result === undefined) break;
      result = this.applySingleModifier(
        modMatch[1], // First capture group (the modifier name)
        result,
        groups.mod_tzlocale ?? "",
      );
    }

    // handle unknown modifier result
    switch (typeof result) {
      case 'undefined': return undefined;
      case 'boolean':
        let check_true = groups.mod_check_true ?? "";
        let check_false = groups.mod_check_false ?? "";
        if (typeof check_true !== 'string' || typeof check_false !== 'string')
          return `{unknown_conditional_modifier_check_true_or_false}`;
        
        if (parseValue) {
          check_true = this.parseString(check_true, parseValue) || check_true;
          check_false = this.parseString(check_false, parseValue) || check_false;
        }
        return result ? check_true : check_false;
      default:
        return result;
    }
  }

  protected applySingleModifier(
    mod: string,
    input: any,
    tzlocale?: string,
  ): string | boolean | undefined {
    const _mod = mod;
    mod = mod.toLowerCase();

    // CONDITIONAL MODIFIERS
    const isExact = Object.keys(conditionalModifiers.exact).includes(mod);
    const isPrefix = Object.keys(conditionalModifiers.prefix).some(key => mod.startsWith(key));
    if (isExact || isPrefix) {
      // try to coerce true/false value from modifier
      let conditional: boolean | undefined;
      try {

        // PRE-CHECK(s) -- skip resolving conditional modifier if value DNE, defaulting to false conditional
        if (!conditionalModifiers.exact.exists(input)) {
          conditional = false;
        }
        
        // EXACT
        else if (isExact) {
          const modAsKey = mod as keyof typeof conditionalModifiers.exact;
          conditional = conditionalModifiers.exact[modAsKey](input);
        }
        
        // PREFIX
        else if (isPrefix) {
          // get the longest prefix match
          const modPrefix = Object.keys(conditionalModifiers.prefix).sort((a, b) => b.length - a.length).find(key => mod.startsWith(key))!!;
          
          // Pre-process string value and check to allow for intuitive comparisons
          const stringValue = input.toString().toLowerCase();
          let stringCheck = mod.substring(modPrefix.length).toLowerCase();
          // remove whitespace from stringCheck if it isn't in stringValue
          stringCheck = !/\s/.test(stringValue) ? stringCheck.replace(/\s/g, '') : stringCheck;
          
          // parse value/check as if they're numbers (123,456 -> 123456)
          const [parsedNumericValue, parsedNumericCheck] = [Number(stringValue.replace(/,\s/g, '')), Number(stringCheck.replace(/,\s/g, ''))];
          const isNumericComparison = ["<", "<=", ">", ">=", "="].includes(modPrefix) && 
            !isNaN(parsedNumericValue) && !isNaN(parsedNumericCheck);
          
          conditional = conditionalModifiers.prefix[modPrefix as keyof typeof conditionalModifiers.prefix](
            isNumericComparison ? parsedNumericValue as any : stringValue, 
            isNumericComparison ? parsedNumericCheck as any : stringCheck,
          );
        }
      } catch (error) {
        conditional = false;
      }
      return conditional;
    }

    // --- STRING MODIFIERS ---
    else if (typeof input === 'string') {
      if (mod in stringModifiers)
        return stringModifiers[mod as keyof typeof stringModifiers](input);
    }

    // --- ARRAY MODIFIERS ---
    else if (Array.isArray(input)) {
      if (mod in arrayModifiers)
        return arrayModifiers[mod as keyof typeof arrayModifiers](input)?.toString();

      // handle hardcoded modifiers here
      switch (true) {
        case mod.startsWith('join(') && mod.endsWith(')'): {
          // Extract the separator from join('separator') or join("separator")
          const separator = _mod.substring(6, _mod.length - 2)
          return input.join(separator);
        }
      }
    }

    // --- NUMBER MODIFIERS ---
    else if (typeof input === 'number') {
      if (mod in numberModifiers)
        return numberModifiers[mod as keyof typeof numberModifiers](input);
    }

    return undefined;
  }

  protected replaceCharsFromString(
    str: string,
    replace: string,
    start: number,
    end: number
  ): string {
    return str.slice(0, start) + replace + str.slice(end);
  }
}
