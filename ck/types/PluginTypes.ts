/* eslint-disable no-unused-vars */

/**
 * Metadata common to all plugins.
 */
export interface PluginInfo {
  id: string;
  name: string;
  description: string;
  version: string;
  type: 'formatter' | 'converter' | 'filter';
}

/**
 * Formatter plugin contract.
 */
export interface FormatterPluginClass {
  /**
   * Plugin metadata.
   */
  PluginInfo: PluginInfo;
  /**
   * Applies formatting to an array of conversations.
   */
  apply(
    data: import('./ConvoKitTypes').ConvoKitConversation[],
    options?: import('../internal_plugins/formatters/ConvoKitContext').CKContextOptions
  ): import('../internal_plugins/formatters/ConvoKitContext').CKContextResult | Promise<import('../internal_plugins/formatters/ConvoKitContext').CKContextResult>;
}

/**
 * Converter plugin contract.
 */
export interface ConverterPluginClass {
  PluginInfo: PluginInfo;
  apply(
    convs: import('./ConvoKitTypes').CKTurnListConversation[],
    systemPrompt: string
  ): Promise<string[]>;
}

/**
 * Filter plugin contract.
 */
export interface FilterPluginClass {
  PluginInfo: PluginInfo;
  /**
   * Indicates whether this filter is a hard inclusion (MUST) or exclusion (MUST_NOT).
   */
  filterType: 'MUST' | 'MUST_NOT';
  /**
   * Applies the filter to content; returns true if the content matches the filter predicate.
   */
  apply(content: string): boolean;
}
