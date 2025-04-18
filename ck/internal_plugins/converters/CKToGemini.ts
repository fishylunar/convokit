import {CKTurnListConversation, GeminiMessage, GeminiConversation } from '../../types/ConvoKitTypes'

export async function convertToGemini(CKTurnListConversations:CKTurnListConversation[], systemPrompt: string): Promise<string[]> {
    let GeminiConversations: string[] = [];
    await CKTurnListConversations.forEach(CKTurnListConversation => {
        let GeminiConversation: GeminiConversation = {
            systemInstruction: {
                role: "system",
                parts: [{ text: systemPrompt }]
              },
              contents: []
        }
        const messages: GeminiMessage[] =CKTurnListConversation.map(({ role, content }) => ({
            role: role === 'user' ? 'user' : 'model',
            parts: [{ text: content }],
        }));
        GeminiConversation.contents.push(...messages);
        GeminiConversations.push(JSON.stringify(GeminiConversation));
    })
    return GeminiConversations;
}