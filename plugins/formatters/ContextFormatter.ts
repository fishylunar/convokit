import { PluginRegistry, FormatterPluginClass, ConvoKitLogging as ckl } from '../..';
import { ParseToCKContext, CKContextOptions, CKContextResult } from '../../ck/internal_plugins/formatters/ConvoKitContext';

export class ContextFormatter implements FormatterPluginClass {
  PluginInfo = {
    id: 'context',
    name: 'Context Formatter',
    description: 'Formats ConvoKit conversations into CKContext training string',
    version: '1.0.0',
    type: 'formatter' as const
  };

  apply(data: import('../../ck/types/ConvoKitTypes').ConvoKitConversation[], options?: CKContextOptions): CKContextResult | Promise<CKContextResult> {
    if(!options.targetUsers) {
      throw ckl.error("ContextFormatterPlugin", "No target users specified. Please specify target users in the options.");
    }
    return ParseToCKContext(data, options!);
  }
}

// Self-register
PluginRegistry.registerFormatter(ContextFormatter);