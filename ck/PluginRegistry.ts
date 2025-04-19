import { ConvoKitLogging as ckl, PluginInfo, FormatterPluginClass, ConverterPluginClass, FilterPluginClass } from '..';

/**
 * Registry for all available plugins (formatters, converters, filters).
 */
export class PluginRegistry {
  private static formatters = new Map<string, new () => FormatterPluginClass>();
  private static converters = new Map<string, new () => ConverterPluginClass>();
  private static filters = new Map<string, new () => FilterPluginClass>();

  /**
   * Registers a formatter plugin class. Uses PluginInfo.id as key.
   */
  static registerFormatter(pluginCtor: new () => FormatterPluginClass): void {
    // Instantiate plugin to read its PluginInfo instance field
    const instance = new pluginCtor();
    const info: PluginInfo = instance.PluginInfo;
    if (this.formatters.has(info.id)) {
      throw new Error(`Formatter plugin with id "${info.id}" already registered.`);
    }
    this.formatters.set(info.id, pluginCtor);
    ckl.info('PluginRegistry', `Registered formatter plugin: ${info.id}`);
  }

  /**
   * Retrieves a registered formatter plugin constructor by ID.
   */
  static getFormatter(id: string): new () => FormatterPluginClass | undefined {
    return this.formatters.get(id);
  }

  /**
   * Lists all registered formatter plugin IDs.
   */
  static listFormatters(): string[] {
    return Array.from(this.formatters.keys());
  }

  /**
   * Registers a converter plugin class.
   */
  static registerConverter(pluginCtor: new () => ConverterPluginClass): void {
    const instance = new pluginCtor();
    const info: PluginInfo = instance.PluginInfo;
    if (this.converters.has(info.id)) {
      throw new Error(`Converter plugin with id "${info.id}" already registered.`);
    }
    this.converters.set(info.id, pluginCtor);
    ckl.info('PluginRegistry', `Registered converter plugin: ${info.id}`);
  }

  /**
   * Retrieves a registered converter plugin constructor by ID.
   */
  static getConverter(id: string): new () => ConverterPluginClass | undefined {
    return this.converters.get(id);
  }

  /**
   * Lists all registered converter plugin IDs.
   */
  static listConverters(): string[] {
    return Array.from(this.converters.keys());
  }

  /**
   * Registers a filter plugin class.
   */
  static registerFilter(pluginCtor: new () => FilterPluginClass): void {
    const instance = new pluginCtor();
    const info: PluginInfo = instance.PluginInfo;
    if (this.filters.has(info.id)) {
      throw new Error(`Filter plugin with id "${info.id}" already registered.`);
    }
    this.filters.set(info.id, pluginCtor);
    ckl.info('PluginRegistry', `Registered filter plugin: ${info.id}`);
  }

  /**
   * Retrieves a registered filter plugin constructor by ID.
   */
  static getFilter(id: string): new () => FilterPluginClass | undefined {
    return this.filters.get(id);
  }

  /**
   * Lists all registered filter plugin IDs.
   */
  static listFilters(): string[] {
    return Array.from(this.filters.keys());
  }
}