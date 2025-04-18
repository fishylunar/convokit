
import { ConvoKitConversation, ConvoKitMessage } from '../ck/types/ConvoKitTypes';
import { ConvoKitProvider } from '../ck/types/ConvoKitProvider';
import { ProviderRegistry } from '../ck/ProviderRegistry';
import { getConfig, loadConfig } from '../ck/ConvoKitConfig';

// Ensure configuration is loaded before defining provider logic that might depend on it.
await loadConfig();

interface Guild {
    id: string;
    name: string;
    iconUrl: string;
}

interface Channel {
    id: string;
    type: string;
    categoryId: string | null;
    category: string | null;
    name: string;
    topic: string | null;
}

interface DateRange {
    after: string | null;
    before: string | null;
}

interface Author {
    id: string;
    name: string;
    discriminator: string;
    nickname: string | null;
    color: string | null;
    isBot: boolean;
    roles: string[];
    avatarUrl: string;
}

interface Message {
    id: string;
    type: string;
    timestamp: string;
    timestampEdited: string | null;
    callEndedTimestamp: string | null;
    isPinned: boolean;
    content: string;
    author: Author;
    attachments: any[];
    embeds: any[];
    stickers: any[];
    reactions: any[];
    mentions: any[];
    inlineEmojis: any[];
}

interface DiscordData {
    guild: Guild;
    channel: Channel;
    dateRange: DateRange;
    exportedAt: string;
    messages: Message[];
    messageCount: number;
}

function checkIfCompatible(chat_data: DiscordData): boolean {
// Check that the input (chat_data) conforms to the type of DiscordData
    if (!chat_data || typeof chat_data !== 'object') {
        return false;
    }
    if (!chat_data.guild || typeof chat_data.guild !== 'object') {
        return false;
    }
    if (!chat_data.channel || typeof chat_data.channel !== 'object') {
        return false;
    }
    if (!chat_data.dateRange || typeof chat_data.dateRange !== 'object') {
        return false;
    }
    if (!chat_data.exportedAt || typeof chat_data.exportedAt !== 'string') {
        return false;
    }
    if (!Array.isArray(chat_data.messages)) {
        return false;
    }
    if (typeof chat_data.messageCount !== 'number') {
        return false;
    }
    if (chat_data.messages.length !== chat_data.messageCount) {
        return false;
    }
    for (const message of chat_data.messages) {
        if (!message || typeof message !== 'object') {
            return false;
        }
        if (!message.author || typeof message.author !== 'object') {
            return false;
        }
        if (!message.attachments || !Array.isArray(message.attachments)) {
            return false;
        }
        if (!message.embeds || !Array.isArray(message.embeds)) {
            return false;
        }
        if (!message.stickers || !Array.isArray(message.stickers)) {
            return false;
        }
        if (!message.reactions || !Array.isArray(message.reactions)) {
            return false;
        }
        if (!message.mentions || !Array.isArray(message.mentions)) {
            return false;
        }
        if (!message.inlineEmojis || !Array.isArray(message.inlineEmojis)) {
            return false;
        }
    }
    return true;
}

function getSenderAndReceiverInfo(chat_data: DiscordData): { sender: { id: string | null, name: string }, receiver: { id: string | null, name: string | null } } {
    const expectedSenderName = chat_data.channel.name;
    let senderId: string | null = null;
    let receiverId: string | null = null;
    let receiverName: string | null = null;

    for (const message of chat_data.messages) {
        if (message.author.name === expectedSenderName || message.author.nickname === expectedSenderName) {
            senderId = message.author.id;
        }
        if (message.author.name !== expectedSenderName && message.author.nickname !== expectedSenderName) {
            receiverId = message.author.id;
            receiverName = message.author.name;
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

function convertToLLMConvoKitFormat(chat_data: DiscordData): ConvoKitConversation {
    let conversationId = chat_data.channel.id;
    if(getConfig().anonymizeProviderConversationIds) {
        conversationId = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    }
    const { sender, receiver } = getSenderAndReceiverInfo(chat_data);
    const messages: ConvoKitMessage[] = chat_data.messages.map((message) => ({
        timestamp: new Date(message.timestamp),
        message: message.content,
        author: {
            id: message.author.id,
            name: message.author.name,
            nickname: message.author.nickname || null,
        }
    }));
    const metadata = {
        conversationId: conversationId,
        exportedAt: new Date(chat_data.exportedAt),
        messageCount: chat_data.messageCount,
        messageSenderId: sender.id || null,
        messageSenderName: chat_data.channel.name,
        messageReceiverId: receiver.id || null,
        messageReceiverName: receiver.name || null,
        providerId: 'discord',
    }
    return {
        metadata,
        messages,
    };
}

export const ProviderInfo = {
    name: "Discord (DiscordChatExporter)",
    description: "Discord chat data exported using DiscordChatExporter. Will read from the Discord_ChatExporter folder.",
    version: "1.0.0",
    author: "LLMConvoKit",
    InputDataInfo: {
        fileExtension: ".json",
        directoryName: "Discord",
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
        return convertToLLMConvoKitFormat(this.Data);
    }
}

// Self-register the provider
ProviderRegistry.register('discord', Provider, ProviderInfo);