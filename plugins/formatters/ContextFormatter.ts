import { PluginRegistry, FormatterPluginClass, ConvoKitLogging as ckl } from '../../index.js';
import { ParseToCKContext, CKContextOptions, CKContextResult } from '../../ck/internal_plugins/formatters/ConvoKitContext';

export class ContextFormatter implements FormatterPluginClass {
  PluginInfo = {
    id: 'context',
    name: 'Context Formatter',
    description: 'Formats ConvoKit conversations into CKContext training string',
    version: '1.0.0',
    type: 'formatter' as const
  };

  async apply(data: import('../../ck/types/ConvoKitTypes').ConvoKitConversation[], options?: CKContextOptions): Promise<CKContextResult> {
    if(!options || !options.targetUsers || options.targetUsers.length === 0) {
      return Promise.reject(new Error("No target users specified. Please specify target users in the options."));
    }
    return ParseToCKContext(data, options);
  }
}

// Self-register
PluginRegistry.registerFormatter(ContextFormatter);