import { ConvoKitConversation, ConvoKitMessage, ConvoKitTargetUser } from '../../types/ConvoKitTypes';
import { PluginRegistry } from '../../PluginRegistry';
import type { FilterPluginClass } from '../../types/PluginTypes';
import { ConvoKitLogging as ckl } from '../../ConvoKitLogging';
// --- Default Constants ---
// These will be used if not provided in options
const DEFAULT_MAX_TIME_GAP_MINUTES = 120;
const DEFAULT_NEW_CONVERSATION_MARKER = '<NC>';
const DEFAULT_LINE_DELIMITER = '<NL>';
const DEFAULT_GROUP_TIME_GAP_MINUTES = 5;
const DEFAULT_TIME_WEIGHT = 1;
const DEFAULT_TOTAL_MESSAGES_WEIGHT = 0.5;
const DEFAULT_FREQUENCY_WEIGHT = 0.5;
const DEFAULT_RATIO_WEIGHT = 0.5;
const DEFAULT_LENGTH_WEIGHT = 0.5;
const DEFAULT_MINIMUM_ALLOWED_IMPORTANCE_PER_MESSAGE = 100;
const DEFAULT_MINIMUM_ALLOWED_IMPORTANCE_CHAT = 120;

// Options for CKContext processing including provider-specific target users
export interface CKContextOptions {
    // List of target user IDs mapped by provider name
    targetUsers: ConvoKitTargetUser[];
    maxTimeGapMinutes?: number;
    newConversationMarker?: string;
    lineDelimiter?: string;
    groupTimeGapMinutes?: number;
    timeWeight?: number;
    totalMessagesWeight?: number;
    frequencyWeight?: number;
    ratioWeight?: number;
    lengthWeight?: number;
    minimumAllowedImportancePerMessage?: number;
    minimumAllowedImportanceChat?: number;
}

export interface CKContextResult {
    processedData: string;
    stats: {
        conversationsProcessed: number;
        conversationsSkipped_NoTargetUser: number;
        conversationsSkipped_LowImportance: number;
        conversationsSkipped_NoMessages: number;
        totalMessagesConsidered: number;
        totalMessagesIncluded: number;
        totalMessagesFilteredOut: number;
    };
}

/**
 * Processes an array of ConvoKitConversation objects to generate a formatted training string.
 * Applies filtering, message grouping, importance scoring, and speaker labeling.
 *
 * @param conversations Array of conversation objects to process.
 * @param options Configuration options, including the TARGET_USER_ID.
 * @returns An object containing the combined processed data string and optional statistics.
 */
export function ParseToCKContext(
    conversations: ConvoKitConversation[],
    options: CKContextOptions
): CKContextResult {

    ckl.time("CKContext", "Generating CKContext");
    const {
        targetUsers,
        maxTimeGapMinutes = DEFAULT_MAX_TIME_GAP_MINUTES,
        newConversationMarker = DEFAULT_NEW_CONVERSATION_MARKER,
        lineDelimiter = DEFAULT_LINE_DELIMITER,
        groupTimeGapMinutes = DEFAULT_GROUP_TIME_GAP_MINUTES,
        timeWeight = DEFAULT_TIME_WEIGHT,
        totalMessagesWeight = DEFAULT_TOTAL_MESSAGES_WEIGHT,
        frequencyWeight = DEFAULT_FREQUENCY_WEIGHT,
        ratioWeight = DEFAULT_RATIO_WEIGHT,
        lengthWeight = DEFAULT_LENGTH_WEIGHT,
        minimumAllowedImportancePerMessage = DEFAULT_MINIMUM_ALLOWED_IMPORTANCE_PER_MESSAGE,
        minimumAllowedImportanceChat = DEFAULT_MINIMUM_ALLOWED_IMPORTANCE_CHAT,
    } = options;

    // Load filter plugins dynamically (cache instances)
    const filterPluginCtors = PluginRegistry.listFilters();
    const filterPluginCache: Map<string, FilterPluginClass> = new Map();
    for (const id of filterPluginCtors) {
        const Ctor = PluginRegistry.getFilter(id);
        if (Ctor) filterPluginCache.set(id, new Ctor());
    }
    const filters: FilterPluginClass[] = Array.from(filterPluginCache.values());

    // Function to apply filters (Now uses plugin registry)
    function passesFilters(content: string): boolean {
        for (let i = 0; i < filters.length; ++i) {
            const filter = filters[i];
            const result = filter.apply(content);
            if (filter.filterType === 'MUST' && !result) return false;
            if (filter.filterType === 'MUST_NOT' && result) return false;
        }
        return true;
    }

    let allProcessedLines: string[] = [];

    // --- Initialize Stats ---
    let stats = {
        conversationsProcessed: 0,
        conversationsSkipped_NoTargetUser: 0,
        conversationsSkipped_LowImportance: 0,
        conversationsSkipped_NoMessages: 0,
        totalMessagesConsidered: 0,
        totalMessagesIncluded: 0,
        totalMessagesFilteredOut: 0,
    };

    // --- Importance Scoring Function (Optimized) ---
    function calculateImportance(
        msg: ConvoKitMessage,
        sortedMessages: ConvoKitMessage[],
        weights: { time: number, length: number, ratio: number, frequency: number, total: number },
        cached: {
            startTimestamp: number,
            endTimestamp: number,
            rawMessageCount: number,
            maxMessageLength: number,
            conversationDurationMinutes: number,
            authorMessageCounts: Map<string, number>,
            messageLenCache: Map<ConvoKitMessage, number>
        }
    ): number {
        if (cached.rawMessageCount === 0) return 0;
        const msgAuthorId = msg.author.id;
        const targetMessageCount = cached.authorMessageCounts.get(msgAuthorId) || 0;
        const otherMessageCount = cached.rawMessageCount - targetMessageCount;
        const msgLen = cached.messageLenCache.get(msg) || msg.message.trim().length;
        const timeScore = cached.endTimestamp === cached.startTimestamp ? 0 : ((new Date(msg.timestamp).getTime() - cached.startTimestamp) / (cached.endTimestamp - cached.startTimestamp)) * weights.time;
        const lengthScore = (msgLen / cached.maxMessageLength) * weights.length;
        const ratioScore = (targetMessageCount / (otherMessageCount || 1)) * weights.ratio;
        const frequencyScore = (cached.rawMessageCount / cached.conversationDurationMinutes) * weights.frequency;
        const totalScore = timeScore + lengthScore + ratioScore + frequencyScore + weights.total;
        return Math.round(totalScore * 100);
    }

    // Bundle weights for passing to calculateImportance
    const importanceWeights = {
        time: timeWeight,
        length: lengthWeight,
        ratio: ratioWeight,
        frequency: frequencyWeight,
        total: totalMessagesWeight
    };

    // --- Process Each Conversation ---
    for (let index = 0; index < conversations.length; ++index) {
        const convo = conversations[index];
        ckl.info("CKContext", `Processing conversation: ${convo.metadata.conversationId} - ${index + 1} of ${conversations.length}...`);
        // Determine target user ID for this conversation based on provider
        const provider = convo.metadata.providerId;
        let targetEntry: ConvoKitTargetUser | undefined = undefined;
        for (let i = 0; i < targetUsers.length; ++i) {
            if (targetUsers[i].providerId === provider) {
                targetEntry = targetUsers[i];
                break;
            }
        }
        if (!targetEntry) {
            ckl.warn("CKContext", `Skipping conversation ${convo.metadata.conversationId}: no targetUsers entry for provider ${provider}.`);
            stats.conversationsSkipped_NoTargetUser++;
            stats.totalMessagesConsidered += convo.messages.length;
            continue;
        }
        const TARGET_USER_ID = targetEntry.id;
        const conversationMessages = convo.messages;
        stats.totalMessagesConsidered += conversationMessages.length;

        // Check if target user is involved in this conversation
        let hasTarget = false;
        for (let i = 0; i < conversationMessages.length; ++i) {
            if (conversationMessages[i].author.id === TARGET_USER_ID) {
                hasTarget = true;
                break;
            }
        }
        if (!hasTarget) {
            ckl.warn("CKContext", `Skipping conversation ${convo.metadata.conversationId}: target ID ${TARGET_USER_ID} not found.`);
            stats.conversationsSkipped_NoTargetUser++;
            continue;
        }

        // Sort messages by timestamp (essential for processing order and time gaps)
        const sortedMessages = conversationMessages.slice();
        sortedMessages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
        if (sortedMessages.length === 0) {
            ckl.warn("CKContext", `Skipping conversation ${convo.metadata.conversationId}: No messages.`);
            stats.conversationsSkipped_NoMessages++;
            continue;
        }

        // Precompute/cached values for this conversation
        let maxMessageLength = 1;
        let startTimestamp = new Date(sortedMessages[0].timestamp).getTime();
        let endTimestamp = new Date(sortedMessages[sortedMessages.length - 1].timestamp).getTime();
        let authorMessageCounts = new Map<string, number>();
        // Cache message lengths in a Map for performance
        let messageLenCache = new Map<ConvoKitMessage, number>();
        for (let i = 0; i < sortedMessages.length; ++i) {
            const msg = sortedMessages[i];
            const trimmed = msg.message.trim();
            const len = trimmed.length;
            messageLenCache.set(msg, len);
            if (len > maxMessageLength) maxMessageLength = len;
            const id = msg.author.id;
            authorMessageCounts.set(id, (authorMessageCounts.get(id) || 0) + 1);
        }
        const rawMessageCount = sortedMessages.length;
        const conversationDurationMinutes = Math.max(1, (endTimestamp - startTimestamp) / (1000 * 60));
        const cached = { startTimestamp, endTimestamp, rawMessageCount, maxMessageLength, conversationDurationMinutes, authorMessageCounts, messageLenCache };

        const processedMessagesForThisConvo: string[] = [];
        let includedMessagesCount = 0;
        let filteredMessagesCount = 0;
        let sumImportance = 0;
        let importanceCount = 0;
        let lastMessageTimestamp: Date | null = null;
        let newConversationSegments = 0;
        let currentGroupSpeaker: string | null = null;
        let currentGroupMessages: ConvoKitMessage[] = [];
        let currentGroupLastTimestamp: Date | null = null;

        function flushGroup(): void {
            if (currentGroupSpeaker && currentGroupMessages.length > 0 && currentGroupLastTimestamp) {
                let groupContents = '';
                for (let i = 0; i < currentGroupMessages.length; ++i) {
                    if (i > 0) groupContents += ' ';
                    groupContents += currentGroupMessages[i].message.replace(/\r?\n/g, lineDelimiter).trim();
                }
                const firstTs = formatTimestamp(new Date(currentGroupMessages[0].timestamp));
                const score = calculateImportance(currentGroupMessages[currentGroupMessages.length - 1], sortedMessages, importanceWeights, cached);
                processedMessagesForThisConvo.push(`${score}|${currentGroupSpeaker}:${groupContents}|${firstTs}`);
            }
            currentGroupSpeaker = null;
            currentGroupMessages = [];
            currentGroupLastTimestamp = null;
        }

        for (let i = 0; i < sortedMessages.length; ++i) {
            const message = sortedMessages[i];
            if (!message.message || typeof message.message !== 'string' || message.message.trim() === '' || !message.author || !message.author.id || !message.timestamp) {
                continue;
            }
            const currentMessageTimestamp = new Date(message.timestamp);
            if (lastMessageTimestamp) {
                const timeDifferenceMinutes = (currentMessageTimestamp.getTime() - lastMessageTimestamp.getTime()) / (1000 * 60);
                if (timeDifferenceMinutes > maxTimeGapMinutes) {
                    flushGroup();
                    if (processedMessagesForThisConvo.length > 0 && processedMessagesForThisConvo[processedMessagesForThisConvo.length - 1] !== newConversationMarker) {
                        processedMessagesForThisConvo.push(newConversationMarker);
                        newConversationSegments++;
                    }
                    currentGroupSpeaker = null;
                    currentGroupMessages = [];
                    currentGroupLastTimestamp = null;
                }
            }
            if (!passesFilters(message.message)) {
                filteredMessagesCount++;
                continue;
            }
            const importance = calculateImportance(message, sortedMessages, importanceWeights, cached);
            if (importance < minimumAllowedImportancePerMessage) {
                filteredMessagesCount++;
                continue;
            }
            sumImportance += importance;
            importanceCount++;
            const speakerLabel = message.author.id === TARGET_USER_ID ? 'A' : 'U';
            if (currentGroupSpeaker === speakerLabel && currentGroupLastTimestamp) {
                const groupGapMinutes = (currentMessageTimestamp.getTime() - currentGroupLastTimestamp.getTime()) / (1000 * 60);
                if (groupGapMinutes <= groupTimeGapMinutes) {
                    currentGroupMessages.push(message);
                } else {
                    flushGroup();
                    currentGroupSpeaker = speakerLabel;
                    currentGroupMessages = [message];
                }
            } else {
                flushGroup();
                currentGroupSpeaker = speakerLabel;
                currentGroupMessages = [message];
            }
            currentGroupLastTimestamp = currentMessageTimestamp;
            lastMessageTimestamp = currentMessageTimestamp;
            includedMessagesCount++;
        }
        flushGroup();
        if (includedMessagesCount === 0) {
            ckl.warn("CKContext",`Skipping conversation ${convo.metadata.conversationId}: No messages included after filtering/scoring.`);
            stats.conversationsSkipped_NoMessages++;
            stats.totalMessagesFilteredOut += filteredMessagesCount;
            continue;
        }
        const averageConversationImportance = sumImportance / (importanceCount || 1);
        if (averageConversationImportance < minimumAllowedImportanceChat) {
            ckl.warn("CKContext",`  Skipping conversation ${convo.metadata.conversationId}: Average importance ${averageConversationImportance.toFixed(2)} below threshold ${minimumAllowedImportanceChat}.`);
            stats.conversationsSkipped_LowImportance++;
            stats.totalMessagesFilteredOut += filteredMessagesCount;
            continue;
        }
        if (allProcessedLines.length > 0) {
            if (allProcessedLines[allProcessedLines.length - 1] !== newConversationMarker) {
                allProcessedLines.push(newConversationMarker);
            }
        }
        allProcessedLines = allProcessedLines.concat(processedMessagesForThisConvo);
        stats.conversationsProcessed++;
        stats.totalMessagesIncluded += includedMessagesCount;
        stats.totalMessagesFilteredOut += filteredMessagesCount;
        ckl.info("CKContext", `Processed conversation ${convo.metadata.conversationId}: Included ${includedMessagesCount} messages (${newConversationSegments} internal segments).`);
    }
    const combinedOutputString = allProcessedLines.join('\n');
    ckl.timeEnd("CKContext", "Generating CKContext");
    return {
        processedData: combinedOutputString,
        stats: stats
    };
}

// Helper to format timestamp
function formatTimestamp(date: Date): string {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mi = String(date.getMinutes()).padStart(2, '0');
    const ss = String(date.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}