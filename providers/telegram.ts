
import { ConvoKitConversation, ConvoKitMessage, ConvoKitProvider,
    ProviderRegistry, getConfig, loadConfig,
    ConvoKitLogging as ckl } from '../index';
// Ensure configuration is loaded before defining provider logic that might depend on it.
await loadConfig();

interface TelegramChat {
    name: string | null; // Name of the chat receiver
    type: string; // eg "personal_chat"
    id: number;
    messages: TelegramMessage[];
}

interface TelegramMessage {
    // All messages have these properties
    id: number;
    type: string; // "message" or "service" as far as i can tell - Service messages could be like "User joined telegram"
    date: Date;
    date_unixtime: string;

    // Only used on service messages
    actor?: string; // Possibly only from service messages
    actor_id?: string; // Possibly only from service messages - Might be who triggered the service message.
    action?: string; // Possibly only from service messages - eg: "joined_telegram"

    // Used on normal messages
    from: string | null; // Sender display name - Null if the sender has deleted their account
    from_id: string; // Sender ID

    // Photo only stuff
    photo?: string; // URL to the photo
    photo_file_size?: number; // Size of the photo (in bytes)

    // Generic photo / video stuff
    width?: number; // Width of the photo
    height?: number; // Height of the photo
    duration_seconds?: number; // Duration of the media (in seconds) // Video only

    // Could be files or videos
    file?: string; // URL to the file
    file_name?: string; // Name of the file
    file_size?: number; // Size of the file (in bytes)
    thumbnail?: string; // URL to the thumbnail
    thumbnail_size?: number; // Size of the thumbnail (in bytes)

    media_type?: string; // Type of the media (eg: "video_file", "sticker")
    mime_type?: string; // Mime type of the media (eg: "video/mp4", "image/webp")

    text: string; // The text of the message
    text_entities: TelegramMessageTextEntity[]; // The text entities of the message
}

interface TelegramMessageTextEntity {
    type: string; // eg plain
    text: string; // The text of the message
}

function checkIfCompatible(chat_data: TelegramChat): boolean {
    if (!chat_data || typeof chat_data !== 'object') {
        ckl.warn("Provider: Telegram", ' Telegram data not compatible! - chat_data is not an object');
        return false;
    }
    if (typeof chat_data.name !== 'string' && chat_data.name !== null) {
        ckl.warn("Provider: Telegram", ' Telegram data not compatible! - chat_data.name is neither a string nor null');
        return false;
    }
    if (typeof chat_data.type !== 'string') {
        ckl.warn("Provider: Telegram", ' Telegram data not compatible! - chat_data.type is not a string');
        return false;
    }
    if (typeof chat_data.id !== 'number') {
        ckl.warn("Provider: Telegram", ' Telegram data not compatible! - chat_data.id is not a string');
        return false;
    }
    if (!Array.isArray(chat_data.messages)) {
        ckl.warn("Provider: Telegram", ' Telegram data not compatible! - chat_data.messages is not an array');
        return false;
    }
    if (chat_data.messages.length === 0) {
        ckl.warn("Provider: Telegram", ' Telegram data not compatible! - chat_data.messages is empty');
        return false;
    }
    for (const message of chat_data.messages) {
        if (!message || typeof message !== 'object') {
            ckl.warn("Provider: Telegram", ' failed: a message is not an object');
            return false;
        }
        if (typeof message.id !== 'number') {
            ckl.debug(`checkIfCompatible failed: message.id is not a string (got: ${message.id})`);
            return false;
        }
        if (typeof message.type !== 'string') {
            ckl.debug(`checkIfCompatible failed: message.type is not a string (got: ${message.type})`);
            return false;
        }
        try {
            new Date(message.date);
        } catch (e) {
            ckl.debug(`checkIfCompatible failed: message.date is not a valid date (got: ${message.date})`);
            ckl.error("Provider: Telegram", e);
            return false;
        }
        if (typeof message.date_unixtime !== 'string') {
            ckl.warn("Provider: Telegram", ' failed: message.date_unixtime is not a number');
            return false;
        }
        if (message.type === 'message') {
            if (typeof message.from !== 'string' && message.from !== null) {
                ckl.warn("Provider: Telegram", ' failed: message.from is neither a string nor null');
                return false;
            }
            if (typeof message.from_id !== 'string') {
                ckl.warn("Provider: Telegram", ' failed: message.from_id is not a string');
                return false;
            }
        } else if (message.type === 'service') {
            if (message.actor && typeof message.actor !== 'string') {
                ckl.warn("Provider: Telegram", ' failed: message.actor is not a string');
                return false;
            }
            if (message.actor_id && typeof message.actor_id !== 'string') {
                ckl.warn("Provider: Telegram", ' failed: message.actor_id is not a string');
                return false;
            }
            if (message.action && typeof message.action !== 'string') {
                ckl.warn("Provider: Telegram", ' failed: message.action is not a string');
                return false;
            }
        }
        if (typeof message.text !== 'string') {
            ckl.warn("Provider: Telegram", ' failed: message.text is not a string');
            return false;
        }
        if (!Array.isArray(message.text_entities)) {
            ckl.warn("Provider: Telegram", ' failed: message.text_entities is not an array');
            return false;
        }
        for (const entity of message.text_entities) {
            if (typeof entity.type !== 'string') {
                ckl.warn("Provider: Telegram", ' failed: an entity.type is not a string');
                return false;
            }
            if (typeof entity.text !== 'string') {
                ckl.warn("Provider: Telegram", ' failed: an entity.text is not a string');
                return false;
            }
        }
    }
    return true;
}

function getSenderAndReceiverInfo(chat_data: TelegramChat): { sender: { id: string | null, name: string }, receiver: { id: string | null, name: string | null } } {
    const expectedSenderName = chat_data.name;
    let senderId: string | null = null;
    let receiverId: string | null = null;
    let receiverName: string | null = null;

    for (const message of chat_data.messages) {
        if (message.from === expectedSenderName || message.from === null && expectedSenderName === null) {
            senderId = message.from_id
        }
        if (message.from !== expectedSenderName && message.from !== null) {
            receiverId = message.from_id;
            receiverName = message.from;
        }
    }
    return { sender: {
        id: senderId,
        name: expectedSenderName,
    }, receiver: {
        id: receiverId,
        name: receiverName,
    } };
}

function convertToConvoKitFormat(chat_data: TelegramChat): ConvoKitConversation {
    let conversationId = chat_data.id.toString();
    if(getConfig().anonymizeProviderConversationIds) {
        conversationId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
    const { sender, receiver } = getSenderAndReceiverInfo(chat_data);
    const messages: ConvoKitMessage[] = chat_data.messages.map((message) => ({
        timestamp: new Date(message.date),
        message: message.text,
        author: {
            id: message.from_id,
            name: message.from,
            nickname: message.from || null,
        }
    }));
    const metadata = {
        conversationId: conversationId,
        exportedAt: null,
        messageCount: chat_data.messages.length,
        messageSenderId: sender.id || null,
        messageSenderName: sender.name || null,
        messageReceiverId: receiver.id || null,
        messageReceiverName: receiver.name || null,
        providerId: 'telegram',
    }
    return {
        metadata,
        messages,
    };
}

export const ProviderInfo = {
    name: "Telegram",
    description: "Telegram chat data exported using Telegram Desktop (JSON). Will read from the Telegram folder.",
    version: "1.0.0",
    author: "ConvoKit",
    InputDataInfo: {
        fileExtension: ".json",
        directoryName: "Telegram",
    }
}

export class Provider implements ConvoKitProvider  {
    Data = null;
    constructor(chat_data: any) {
        this.Data = chat_data;
    }

    ProviderInfo = ProviderInfo;
    
    Test(): boolean {
        return checkIfCompatible(this.Data);
    }
    Convert(): ConvoKitConversation {
        return convertToConvoKitFormat(this.Data);
    }
}

// Self-register the provider
ProviderRegistry.register('telegram', Provider, ProviderInfo);