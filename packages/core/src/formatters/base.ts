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
    comparator: string | null;
  };
}

export abstract class BaseFormatter {
  protected config: FormatterConfig;
  protected userData: UserData;

  private cacheManager: BaseFormatterCacheManager;
  private regexBuilder: BaseFormatterRegexBuilder;

  constructor(config: FormatterConfig, userData: UserData) {
    this.config = config;
    this.userData = userData;

    this.cacheManager = new BaseFormatterCacheManager();
    this.regexBuilder = new BaseFormatterRegexBuilder(this.convertStreamToParseValue);
  }

  public format(stream: ParsedStream): { name: string; description: string } {
    const parseValue = this.convertStreamToParseValue(stream);
    const localCache = this.cacheManager.generateLocalCache(parseValue);
    const r = {
      name: this.parseString(this.config.name, parseValue, localCache) || '',
      description: this.parseString(this.config.description, parseValue, localCache) || '',
    };
    localCache.getCacheStats()
    return r;
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


  protected parseString(str: string, value: ParseValue, localCache: BaseFormatterCache): string | null {
    return this.parseStringHelper(str, value, localCache)
  }
  protected parseStringHelper(str: string, value: ParseValue, localCache: BaseFormatterCache): string | null {
    if (!str) return null;

    const replacer = (key: string, value: unknown) => {
      return value;
    };

    value.debug = {
      json: JSON.stringify({ ...value, debug: undefined }, replacer),
      jsonf: JSON.stringify({ ...value, debug: undefined }, replacer, 2),
      modifier: DebugToolReplacementConstants.modifier,
      comparator: DebugToolReplacementConstants.comparator,
    };

    const re = this.regexBuilder.buildRegexExpression();
    let matches: RegExpExecArray | null;

    while (matches = re.exec(str)) {
      if (!matches.groups) continue;
      const index = matches.index as number;
      let properlyHandledSuffix = (matches.groups.suffix_tzlocale ?? "") + (matches.groups.suffix_check ?? "");

      // unhandledStr looks like variableType.propertyName(::<modifier|comparator>)*
      let unhandledStr = matches[0].substring(1, (matches[0].length-1) - properlyHandledSuffix.length);

      const splitOnComparators = unhandledStr.split(RegExp(this.regexBuilder.buildComparatorRegexPattern(), 'gi'));
      let results: ResolvedVariable[] = splitOnComparators.filter((_, i) => i % 2 == 0)
        .map(baseString => this.parseModifiedVariable(baseString, value, localCache, {
            mod_tzlocale: matches?.groups?.suffix_tzlocale ?? undefined
          })
        );
      let foundComparators: (keyof typeof ComparatorConstants.comparatorKeyToFuncs)[] = splitOnComparators.filter((_, i) => i % 2 != 0)
        .map(c => c as keyof typeof ComparatorConstants.comparatorKeyToFuncs);
      
      // skip reducing if there's no comparators
      let result = results.length == 1 ? results[0]
        : results.reduce((prev, cur, i) => {
          if (prev.error !== undefined) return prev
          if (cur.error !== undefined) return cur

          // the comparator key between prev and cur (from splitOnComparators)
          const compareKey = foundComparators[i - 1] as keyof typeof ComparatorConstants.comparatorKeyToFuncs;
          const comparatorFn = ComparatorConstants.comparatorKeyToFuncs[compareKey];
          try {
            return { result: comparatorFn(prev.result, cur.result) };
          } catch (e) {
            return { error: `{unable_to_compare(<${prev.result}>::${compareKey}::<${cur.result}>, ${e})}` };
          }
        });

      // If applicable, cast result to mod_check true/false cases
      if ([true, false].includes(result.result) && matches.groups.mod_check !== undefined) {
        let [check_true, check_false] = [matches.groups.mod_check_true ?? "", matches.groups.mod_check_false ?? ""];
        if (value) {
          check_true = this.parseString(check_true, value, localCache) || check_true;
          check_false = this.parseString(check_false, value, localCache) || check_false;
        }
        result = { result: (result.result ? check_true : check_false) };
      }

      str = this.replaceCharsFromString(str, result.error ?? result.result?.toString(), index, re.lastIndex);
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

  /**
   * @param baseString - string to parse, e.g. `<variableType>.<propertyName>(::<modifier>)*`
   * @param value - ParseValue object
   * @param fullStringModifiers - modifiers that are applied to the entire string (e.g. `::<tzLocale>`)
   * 
   * @returns `{ result: <resolved modified variable> }` or `{ error: "<errorMessage>" }`
   */
  protected parseModifiedVariable(
    _baseString: string,
    value: ParseValue,
    localCache: BaseFormatterCache,
    fullStringModifiers: {
      mod_tzlocale: string | undefined,
    },
  ): ResolvedVariable {
    return localCache.getResolvedVariable(_baseString, () => this.parseModifiedVariableHelper(_baseString, value, localCache, fullStringModifiers));
  }
  protected parseModifiedVariableHelper(
    baseString: string,
    value: ParseValue,
    localCache: BaseFormatterCache,
    fullStringModifiers: {
      mod_tzlocale: string | undefined,
    },
  ): ResolvedVariable {
    const _baseString = baseString;
    // get variableType and propertyName from baseString without regex
    const variableType = baseString.split('.')[0];
    const variableDict = value[variableType as keyof ParseValue];
    if (!variableDict) return { error: `{unknown_variableType(${variableType})}` };
    baseString = baseString.substring(variableType.length + 1);
    const propertyName = baseString.split('::')[0];
    const property = variableDict![propertyName as keyof typeof variableDict] as any;
    if (property === undefined) return { error: `{unknown_propertyName(${variableType}.${propertyName})}` };
    const allModifiers = baseString.substring(propertyName.length);

    const processModifiers = (result: any) => {
      if (allModifiers.length) {
        const singleModTerminator = '(?=::|$)'; // :: if there's multiple modifiers, or $ for the end of the string
        const singleValidModRe = new RegExp(`${this.regexBuilder.buildModifierRegexPattern()}${singleModTerminator}`, 'g');
        
        const sortedModMatches = [...allModifiers.matchAll(singleValidModRe)].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map(regExpExecArray => regExpExecArray[1] /* First capture group, aka the modifier name */);
        let cache_prefix = `${(result ?? "")}`;
        for (const lastModMatched of sortedModMatches) {
          const cacheKeys = [`${result ?? ""}::${lastModMatched}`, `${cache_prefix}::${lastModMatched}`];
          result = localCache.getAnyValue(cacheKeys, () => this.applySingleModifier(result, lastModMatched, fullStringModifiers));

          if (result === undefined) {
            switch (typeof property) {
              case "string": case "number": case "boolean": return { error: `{unknown_${typeof property}_modifier(${lastModMatched})}` };
              case "object": return { error: `{unknown_array_modifier(${lastModMatched})}` };
              default: return { error: `{unknown_modifier(${lastModMatched})}` };
            }
          }
        }
      }
      const cachedResult = localCache.getValue(`${property ?? ""}${allModifiers}`, () => processModifiers(property));
      return { result: cachedResult };
    }

    const result = processModifiers(property);
    localCache.setWithContext(_baseString, {
      requiredContext: {
        [`${variableType}.${propertyName}`]: property,
      },
      value: result,
    });
    return result;
  }

  /**
   * @param variable - the variable to apply the modifier to (e.g. `123`, `"TorBox"`, `["English", "Italian"]`, etc.)
   * @param mod - the modifier to apply
   * @param fullStringModifiers - modifiers that are applied to the entire string (e.g. `::<tzLocale>`)
   * @returns { result: <resolved modified variable> } or { error: "<errorMessage>" }
   */
  protected applySingleModifier(
    variable: any,
    mod: string,
    fullStringModifiers: {
      mod_tzlocale: string | undefined,
    },
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
/**
 * LocalCache is used to store templates for
 * - variables
 * - variables with modifiers
 * 
 * Used to avoid recalculating the same template multiple times
 */
type ValueWithContext = {
  value: ResolvedVariable;
  requiredContext: { [key: string]: any };
};
class BaseFormatterCacheManager {
  private contextCache: Map<string, ValueWithContext> = new Map();
  private cache: Map<string, any> = new Map();

  public constructor() {
    this.cache = new Map();
  }

  public generateLocalCache(parseValue: ParseValue): BaseFormatterCache {
    // filter cache based off of contexts that match value context
    const contextCache = new Map(Array.from(this.cache.entries()).filter(([cacheKey, { requiredContext }]) => Object.keys(requiredContext).every(variableKey => {
      const [variableType, propertyName] = variableKey.split('.');
      const variableDict = parseValue[variableType as keyof ParseValue];
      const variable = variableDict?.[propertyName as keyof typeof variableDict];
      return requiredContext[variableKey] === variable
    })));
    
    return new BaseFormatterCache(contextCache, this.cache);
  }
}

class BaseFormatterCache {
  private contextCache: Map<string, ValueWithContext> = new Map();
  private cache: Map<string, any> = new Map();

  private cacheStats: { cacheHits: number, cacheMisses: number } = { cacheHits: 0, cacheMisses: 0 };
  private contextCacheStats: { cacheHits: number, cacheMisses: number } = { cacheHits: 0, cacheMisses: 0 };

  public constructor(existingContextCache: Map<string, ValueWithContext>, existingCache: Map<string, any>) {
    this.contextCache = existingContextCache;
    this.cache = existingCache;
  }

  // get any value from the cache based off the keys returned and also sets the value for all keys
  public getAnyValue(keys: string[], getFn: () => any): any {
    let found = undefined;
    for (const key of keys) {
      const cachedValue = this.cache.get(key);
      if (cachedValue !== undefined) {
        found = cachedValue;
        break;
      }
    }
    if (found !== undefined) {
      this.cacheStats.cacheHits++;
    }
    else {
      this.cacheStats.cacheMisses++;
      found = getFn();
    }
    for (const key of keys) this.cache.set(key, found);
    return found;
  }

  public getValue(key: string, getFn: () => any): any {
    return this.getAnyValue([key], getFn);
  }

  // NOTE: doesn't set with context as we may need additional logic to find proper context
  public getResolvedVariable(key: string, getFn: () => ResolvedVariable): ResolvedVariable {
    const cachedValue = this.contextCache.get(key);
    if (cachedValue !== undefined) {
      this.cacheStats.cacheHits++;
      return cachedValue.value;
    }
    const result = getFn();
    this.cacheStats.cacheMisses++;
    return result;
  }

  public setWithContext(key: string, context: ValueWithContext): void {
    this.contextCache.set(key, context);
  }

  public set(key: string, value: any): void {
    this.cache.set(key, value);
  }

  public getCacheStats() {
    console.log("--------------------------------");
    console.log("cache keys", Array.from(this.cache.keys()));
    console.log("cache stats", this.cacheStats);
    console.log("context cache keys", Array.from(this.contextCache.keys()));
    console.log("context cache stats", this.contextCacheStats);
    console.log("--------------------------------");
  }
}

class BaseFormatterRegexBuilder {
  private convertStreamToParseValue: (stream: ParsedStream) => ParseValue;
  constructor(convertStreamToParseValue: (stream: ParsedStream) => ParseValue) {
    this.convertStreamToParseValue = convertStreamToParseValue;
  }
  /**
   * RegEx Capture Pattern: `<variableType>.<propertyName>`
   * 
   * (no named capture group)
   */
  public buildVariableRegexPattern(): string {
    // Dynamically build the `variable` regex pattern from ParseValue keys
    const hardcodedDebugParseValue: { debug: ParseValue['debug'] } = {
      debug: { json: null, jsonf: null, modifier: null, comparator: null}
    };
    const hardcodedParseValueKeysForRegexMatching = {
      ...this.convertStreamToParseValue({} as ParsedStream), ...hardcodedDebugParseValue
    };
    const validVariableTypes: (keyof ParseValue)[] = Object.keys(hardcodedParseValueKeysForRegexMatching) as (keyof ParseValue)[];
    // Get all valid properties (subkeys) from ParseValue structure
    const validPropertyNames = validVariableTypes.flatMap(sectionKey => {
      const section = hardcodedParseValueKeysForRegexMatching[sectionKey as keyof ParseValue];
      if (section && typeof section === 'object' && section !== null) {
        return Object.keys(section);
      }
      return []; // @flatMap
    });
    return `(${validVariableTypes.join('|')})\\.(${validPropertyNames.join('|')})`;
  }
  /**
   * RegEx Capture Pattern: `::<modifier>`
   * 
   * (no named capture group)
   */
  public buildModifierRegexPattern(): string {
    const validModifiers = Object.keys(ModifierConstants.modifiers)
      .map(key => key.replace(/[\(\)\'\"\$\^\~\=\>\<]/g, '\\$&'));
    return `::(${validModifiers.join('|')})`;
  }
  /**
   * RegEx Capture Pattern: `::<comparator>::`
   * 
   * (no named capture group)
   */
  public buildComparatorRegexPattern(): string {
    const comparatorKeys = Object.keys(ComparatorConstants.comparatorKeyToFuncs)
    return `::(${comparatorKeys.join("|")})::`
  }
  /**
   * RegEx Capture Pattern: `::<tzLocale>`
   * 
   * (with named capture group `tzLocale`)
   */
  public buildTZLocaleRegexPattern(): string {
    // TZ Locale pattern (e.g. 'UTC', 'GMT', 'EST', 'PST', 'en-US', 'en-GB', 'Europe/London', 'America/New_York')
    return `` // not used for now
    // return `::(?<mod_tzlocale>[A-Za-z]{2,3}(?:-[A-Z]{2})?|[A-Za-z]+?/[A-Za-z_]+?)`;
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
    const comparator = this.buildComparatorRegexPattern();
    const modTZLocale = this.buildTZLocaleRegexPattern();
    const checkTF = this.buildCheckRegexPattern();
    
    const variableAndModifiers = `${variable}(${modifier})*`;
    const regexPattern = `\\{${variableAndModifiers}(${comparator}${variableAndModifiers})*(?<suffix_tzlocale>${modTZLocale})?(?<suffix_check>${checkTF})?\\}`;
    
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

class ComparatorConstants {
  static comparatorKeyToFuncs = {
    "and": (v1: any, v2: any) => v1 && v2,
    "or": (v1: any, v2: any) => v1 || v2,
    "xor": (v1: any, v2: any) => (v1 || v2) && !(v1 && v2),
    "neq": (v1: any, v2: any) => v1 !== v2,
    "equal": (v1: any, v2: any) => v1 === v2,
    "left": (v1: any, _: any) => v1,
    "right": (_: any, v2: any) => v2,
  }
}

class DebugToolReplacementConstants {
  static modifier = `
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
`;
  
  static comparator = `
Comparators: <stream.library({stream.library})>::comparator::<stream.proxied({stream.proxied})>
  ::and:: {stream.library::and::stream.proxied["true"||"false"]}
  ::or:: {stream.library::or::stream.proxied["true"||"false"]}
  ::xor:: {stream.library::xor::stream.proxied["true"||"false"]}
  ::neq:: {stream.library::neq::stream.proxied["true"||"false"]}
  ::equal:: {stream.library::equal::stream.proxied["true"||"false"]}
  ::left:: {stream.library::left::stream.proxied["true"||"false"]}
  ::right:: {stream.library::right::stream.proxied["true"||"false"]}
{tools.newLine}

[Advanced] Multiple Comparators
  Is English
    stream.languages::~English::or::stream.languages::~dub::and::stream.languages::length::>0["Yes"||"Unknown"]  ->  {stream.languages::~English::or::stream.languages::~dub::and::stream.languages::length::>0["Yes"||"Unknown"]}
  Is Fast Enough Link
    service.cached::or::stream.library::or::stream.seeders::>10["true"||"false"]  ->  {service.cached::istrue::or::stream.library::or::stream.seeders::>10["true"||"false"]}
`;
}


/**
 * Cache:
 * 
 * Extract all variables from string, and store them in a map -> this is the "context" for the string
 * 
 * Allow for modifier checks based off the filled variable NOT the {variableType.propertyName}
 * 
 * 
 */