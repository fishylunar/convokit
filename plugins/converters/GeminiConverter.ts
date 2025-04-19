import { PluginRegistry, type CKTurnListConversation, type ConverterPluginClass } from '../..';
import { convertToGemini } from '../../ck/internal_plugins/converters/CKToGemini';

export class GeminiConverter implements ConverterPluginClass {
  PluginInfo = {
    id: 'gemini',
    name: 'Gemini Converter',
    description: 'Converts CKTurnListConversations to Gemini JSONL',
    version: '1.0.0',
    type: 'converter' as const
  };

  apply(convs: CKTurnListConversation[], systemPrompt: string): Promise<string[]> {
    return convertToGemini(convs, systemPrompt);
  }
}

// Self-register
PluginRegistry.registerConverter(GeminiConverter);