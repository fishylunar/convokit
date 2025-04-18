import { PluginRegistry } from '../../ck/PluginRegistry';
import type { ConverterPluginClass } from '../../ck/types/PluginTypes';
import { convertToChatML } from '../../ck/internal_plugins/converters/CKToChatML';
import type { CKTurnListConversation } from '../../ck/types/ConvoKitTypes';

export class ChatMLConverter implements ConverterPluginClass {
  PluginInfo = {
    id: 'chatml',
    name: 'ChatML Converter',
    description: 'Converts CKTurnListConversations to ChatML JSONL',
    version: '1.0.0',
    type: 'converter' as const
  };

  apply(convs: CKTurnListConversation[], systemPrompt: string): Promise<string[]> {
    return convertToChatML(convs, systemPrompt);
  }
}

// Self-register
PluginRegistry.registerConverter(ChatMLConverter);