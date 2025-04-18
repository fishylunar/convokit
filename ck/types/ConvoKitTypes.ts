export interface ConvoKitTargetUser {
    providerId: string;
    /** The unique identifier for the target user (e.g., User ID, username, email). */
    id: string;
}

export interface ConvoKitMessage {
    timestamp: Date;
    message: string;
    author: {
        id: string;
        name: string;
        nickname: string | null;
    }
}
export interface ConvoKitConversation {
    metadata: {
        conversationId: string;
        exportedAt: Date;
        messageCount: number;
        messageSenderId: string;
        messageSenderName: string;
        messageReceiverId: string;
        messageReceiverName: string;
        providerId: string;
    };
    messages: ConvoKitMessage[];
}

export type CKTurnListMessage = {
    importance: number;
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  };
  
export type CKTurnListConversation =CKTurnListMessage[];
  
export interface GeminiMessagePart {
    text: string;
}
export interface GeminiMessage {
    role: 'user' | 'model';
    parts: GeminiMessagePart[];
}
export interface GeminiSystemInstruction {
    role: 'system';
    parts: GeminiMessagePart[];
}
export interface GeminiConversation {
    systemInstruction: GeminiSystemInstruction;
    contents: GeminiMessage[];
}