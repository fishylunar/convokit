import {CKTurnListConversation } from '../../../index';

export async function convertToChatML(CKTurnListConversations:CKTurnListConversation[], systemPrompt: string): Promise<string[]> {
  return CKTurnListConversations
    .filter(conv => conv.some(msg => msg.role === 'assistant'))
    .map(conv => {
      const messages = [
        { role: 'system', content: systemPrompt },
        ...conv.map(({ role, content }) => ({ role, content })),
      ];
      return JSON.stringify({ messages })
    })
    
}