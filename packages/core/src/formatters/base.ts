import { ParsedStream, UserData } from '../db/schemas.js';
import * as constants from '../utils/constants.js';
import { createLogger } from '../utils/logger.js';
import {
  formatBytes,
  formatDuration,
  languageToCode,
  languageToEmoji,
  makeSmall,
} from './utils.js';
import { Env } from '../utils/env.js';

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
  } & typeof DebugToolReplacementConstants;
}

export abstract class BaseFormatter {
  protected config: FormatterConfig;
  protected userData: UserData;

  private regexBuilder: BaseFormatterRegexBuilder;

  constructor(config: FormatterConfig, userData: UserData) {
    this.config = config;
    this.userData = userData;

    this.regexBuilder = new BaseFormatterRegexBuilder(this.convertStreamToParseValue({} as ParsedStream));
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
    let parseValue: ParseValue = {
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
    parseValue.debug = {
      ...DebugToolReplacementConstants,
      json: JSON.stringify({ ...parseValue, debug: undefined }),
      jsonf: JSON.stringify({ ...parseValue, debug: undefined }, (_, value) => value, 2),
    };
    return parseValue;
  }

  protected parseString(str: string, value: ParseValue): string | null {
    if (!str) return null;

    const re = this.regexBuilder.buildRegexExpression();
    let matches: RegExpExecArray | null;

    while (matches = re.exec(str)) {
      if (!matches.groups) continue;

      const index = matches.index as number;


      // Validate - variableName (exists in value)
      const variableDict = value[matches.groups.variableType as keyof ParseValue];
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
    const singleValidModRe = new RegExp(this.regexBuilder.buildModifierRegexPattern() + singleModTerminator, 'gi');
    
    let result = input as any;
    // iterate over modifiers in order of appearance
    for (const modMatch of [...groups.modifiers.matchAll(singleValidModRe)].sort((a, b) => (a.index ?? 0) - (b.index ?? 0))) {
      if (result === undefined) break;
      result = this.applySingleModifier(
        result,
        modMatch[1], // First capture group (the modifier name)
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

  /**
   * @param variable - the variable to apply the modifier to (e.g. `123`, `"TorBox"`, `["English", "Italian"]`, etc.)
   * @param mod - the modifier to apply
   */
  protected applySingleModifier(
    variable: any,
    mod: string,
    tzlocale?: string,
  ): string | boolean | undefined {
    const _mod = mod;
    mod = mod.toLowerCase();

    // CONDITIONAL MODIFIERS
    const isExact = Object.keys(ModifierConstants.conditionalModifiers.exact).includes(mod);
    const isPrefix = Object.keys(ModifierConstants.conditionalModifiers.prefix).some(key => mod.startsWith(key));
    if (isExact || isPrefix) {
      // try to coerce true/false value from modifier
      let conditional: boolean | undefined;
      try {

        // PRE-CHECK(s) -- skip resolving conditional modifier if value DNE, defaulting to false conditional
        if (!ModifierConstants.conditionalModifiers.exact.exists(variable)) {
          conditional = false;
        }

        // EXACT
        else if (isExact) {
          const modAsKey = mod as keyof typeof ModifierConstants.conditionalModifiers.exact;
          conditional = ModifierConstants.conditionalModifiers.exact[modAsKey](variable);
        }

        // PREFIX
        else if (isPrefix) {
          // get the longest prefix match
          const modPrefix = Object.keys(ModifierConstants.conditionalModifiers.prefix).sort((a, b) => b.length - a.length).find(key => mod.startsWith(key))!!;
          
          // Pre-process string value and check to allow for intuitive comparisons
          const stringValue = variable.toString().toLowerCase();
          let stringCheck = mod.substring(modPrefix.length).toLowerCase();
          // remove whitespace from stringCheck if it isn't in stringValue
          stringCheck = !/\s/.test(stringValue) ? stringCheck.replace(/\s/g, '') : stringCheck;

          // parse value/check as if they're numbers (123,456 -> 123456)
          const [parsedNumericValue, parsedNumericCheck] = [Number(stringValue.replace(/,\s/g, '')), Number(stringCheck.replace(/,\s/g, ''))];
          const isNumericComparison = ["<", "<=", ">", ">=", "="].includes(modPrefix) && 
            !isNaN(parsedNumericValue) && !isNaN(parsedNumericCheck);
          
          conditional = ModifierConstants.conditionalModifiers.prefix[modPrefix as keyof typeof ModifierConstants.conditionalModifiers.prefix](
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
    else if (typeof variable === 'string') {
      if (mod in ModifierConstants.stringModifiers)
        return ModifierConstants.stringModifiers[mod as keyof typeof ModifierConstants.stringModifiers](variable);
    }

    // --- ARRAY MODIFIERS ---
    else if (Array.isArray(variable)) {
      if (mod in ModifierConstants.arrayModifiers)
        return ModifierConstants.arrayModifiers[mod as keyof typeof ModifierConstants.arrayModifiers](variable)?.toString();

      // handle hardcoded modifiers here
      switch (true) {
        case mod.startsWith('join(') && mod.endsWith(')'): {
          // Extract the separator from join('separator') or join("separator")
          const separator = _mod.substring(6, _mod.length - 2)
          return variable.join(separator);
        }
      }
    }

    // --- NUMBER MODIFIERS ---
    else if (typeof variable === 'number') {
      if (mod in ModifierConstants.numberModifiers)
        return ModifierConstants.numberModifiers[mod as keyof typeof ModifierConstants.numberModifiers](variable);
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

/**
 * Used to store the actual value of a parsed, and potentially modified, variable
 * or an error message if the parsed/modified result becomes invalid for any reason
 */
type ResolvedVariable = {
  result?: any,
  error?: string | undefined;
};


class BaseFormatterRegexBuilder {
  private hardcodedParseValueKeysForRegexMatching: ParseValue;
  constructor(hardcodedParseValueKeysForRegexMatching: ParseValue) {
    this.hardcodedParseValueKeysForRegexMatching = hardcodedParseValueKeysForRegexMatching;
  }
  /**
   * RegEx Capture Pattern: `<variableType>.<propertyName>`
   */
  public buildVariableRegexPattern(): string {
    const validVariables: (keyof ParseValue)[] = Object.keys(this.hardcodedParseValueKeysForRegexMatching) as (keyof ParseValue)[];
    // Get all valid properties (subkeys) from ParseValue structure
    const validProperties = validVariables.flatMap(sectionKey => {
      const section = this.hardcodedParseValueKeysForRegexMatching[sectionKey as keyof ParseValue];
      if (section && typeof section === 'object' && section !== null) {
        return Object.keys(section);
      }
      return [];
    });
    return `(?<variableName>${validVariables.join('|')})\\.(?<propertyName>${validProperties.join('|')})`;
  }
  /**
   * RegEx Capture Pattern: `::<modifier>`
   */
  public buildModifierRegexPattern(): string {
    const validModifiers = Object.keys(ModifierConstants.modifiers)
      .map(key => key.replace(/[\(\)\'\"\$\^\~\=\>\<]/g, '\\$&'));
    return `::(${validModifiers.join('|')})`;
  }
  /**
   * RegEx Capture Pattern: `::<tzLocale>`
   * 
   * (with named capture group `tzLocale`)
   */
  public buildTZLocaleRegexPattern(): string {
    // TZ Locale pattern (e.g. 'UTC', 'GMT', 'EST', 'PST', 'en-US', 'en-GB', 'Europe/London', 'America/New_York')
    return `::(?<mod_tzlocale>[A-Za-z]{2,3}(?:-[A-Z]{2})?|[A-Za-z]+?/[A-Za-z_]+?)`;
  }
  /**
   * RegEx Capture Pattern: `["<check_true>||<check_false>"]`
   * 
   * (with named capture group `<mod_check_true>` and `<mod_check_false>` and `mod_check`=`"<check_true>||<check_false>"`)
   */
  public buildCheckRegexPattern(): string {
    // Build the conditional check pattern separately
    // Use [^"]* to capture anything except quotes, making it non-greedy
    const checkTrue = `"(?<mod_check_true>[^"]*)"`;
    const checkFalse = `"(?<mod_check_false>[^"]*)"`;
    return `\\[(?<mod_check>${checkTrue}\\|\\|${checkFalse})\\]`;
  }
  /**
   * RegEx Captures: `{ <singleModifiedVariable> (::<comparator>::<singleModifiedVariable>)* (<tz>?) (<[t||f]>?) }`
   */
  public buildRegexExpression(): RegExp {
    const variable = this.buildVariableRegexPattern();
    const modifier = this.buildModifierRegexPattern();
    const modTZLocale = this.buildTZLocaleRegexPattern();
    const checkTF = this.buildCheckRegexPattern();

    const variableAndModifiers = `${variable}(${modifier})*`;
    const regexPattern = `\\{${variableAndModifiers}(?<suffix>(${modTZLocale})?(${checkTF})?)\\}`;

    return new RegExp(regexPattern, 'gi');
  }
}

/**
 * Static Constants
 */
class ModifierConstants {
  static stringModifiers = {
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

  static arrayModifierGetOrDefault = (value: string[], i: number) => value.length > 0 ? String(value[i]) : '';
  static arrayModifiers = {
    'join': (value: string[]) => value.join(", "),
    'length': (value: string[]) => value.length.toString(),
    'first': (value: string[]) => this.arrayModifierGetOrDefault(value, 0),
    'last': (value: string[]) => this.arrayModifierGetOrDefault(value, value.length - 1),
    'random': (value: string[]) => this.arrayModifierGetOrDefault(value, Math.floor(Math.random() * value.length)),
    'sort': (value: string[]) => [...value].sort(),
    'reverse': (value: string[]) => [...value].reverse(),
  }

  static numberModifiers = {
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

  static conditionalModifiers = {
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

  static hardcodedModifiersForRegexMatching = {
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

  static modifiers = {
    ...this.hardcodedModifiersForRegexMatching,
    ...this.stringModifiers,
    ...this.numberModifiers,
    ...this.arrayModifiers,
    ...this.conditionalModifiers.exact,
    ...this.conditionalModifiers.prefix,
  }
}

const DebugToolReplacementConstants = {
  modifier: `
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
Conditional:
  String: {stream.filename}
    filename::exists    {stream.filename::exists["true"||"false"]}
    filename::$Movie    {stream.filename::$Movie["true"||"false"]}
    filename::^mkv    {stream.filename::^mkv["true"||"false"]}
    filename::~Title     {stream.filename::~Title["true"||"false"]}
    filename::=test     {stream.filename::=test["true"||"false"]}
  Number: {stream.size}
    filesize::>=100     {stream.size::>=100["true"||"false"]}
    filesize::>50       {stream.size::>50["true"||"false"]}
    filesize::<=200     {stream.size::<=200["true"||"false"]}
    filesize::<150      {stream.size::<150["true"||"false"]}
  Boolean: {stream.proxied}
    ::istrue {stream.proxied::istrue["true"||"false"]}
    ::isfalse {stream.proxied::isfalse["true"||"false"]}
{tools.newLine}
[Advanced] Multiple modifiers
  <string>::reverse::title::reverse   {config.addonName} -> {config.addonName::reverse::title::reverse}
  <number>::string::reverse           {stream.size} -> {stream.size::string::reverse}
  <array>::string::reverse            {stream.languages} -> {stream.languages::join("::")::reverse}
  <boolean>::length::>=2              {stream.languages} -> {stream.languages::length::>=2["true"||"false"]}
`,
}
