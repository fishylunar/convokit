import fs from 'fs/promises';
import Path from 'path'
import { config } from "dotenv";
import { ConvoKitLogging as ckl, ConvoKit as CK, loadConfig, getConfig } from "./index"

config(); // Load environment variables from .env file
await loadConfig(); // Load configuration


// Main execution function
async function main(): Promise<void> {
    ckl.time("Main", "Total processing time");
    const ConvoKit = new CK();

    // Lets load a custom provider we made
    // await ConvoKit.addProviderFromFile("./telegram")
    /* Does the same as:
    await import("./telegram") 
    */

    // Load providers
    await ConvoKit.loadProviders();

    // Anonymize data
    await ConvoKit.anonymizeProviderData();
    
    // Process data from all loaded providers
    const ConvoKitFormattedData = await ConvoKit.processDataFromProviders();
    if (ConvoKitFormattedData.length === 0) {
        ckl.warn("Main", "No data was processed from providers. Exiting.");
        return;
    }

    // Parse to CKContext format
    const contextOptions = {
        targetUsers: getConfig().targetUsers,
        // Example optional context options:
        // minimumAllowedImportancePerMessage: 200
        // minimumAllowedImportanceChat: 20
    };

    if (!contextOptions.targetUsers) {
        ckl.error("Main", "targetUsers environment variable is not set. Cannot parse context.");
        return;
    }

    const contextResult = await ConvoKit.parseToContext(contextOptions);

    // Log processing summary from contextResult.stats
    ckl.info("Main", '--- CKContext Processing Summary ---');
    ckl.info("Main", `Total conversations received: ${ConvoKitFormattedData.length}`); // Use length from processed data
    if (contextResult && contextResult.stats) {
        ckl.info("Main", `Conversations processed successfully: ${contextResult.stats.conversationsProcessed}`);
        ckl.info("Main", `Conversations skipped (No target user): ${contextResult.stats.conversationsSkipped_NoTargetUser}`);
        ckl.info("Main", `Conversations skipped (Low importance): ${contextResult.stats.conversationsSkipped_LowImportance}`);
        ckl.info("Main", `Conversations skipped (No messages / All filtered): ${contextResult.stats.conversationsSkipped_NoMessages}`);
        ckl.info("Main", `Total messages considered: ${contextResult.stats.totalMessagesConsidered}`);
        ckl.info("Main", `Total messages included in output: ${contextResult.stats.totalMessagesIncluded}`);
        ckl.info("Main", `Total messages filtered out (content/importance): ${contextResult.stats.totalMessagesFilteredOut}`);
    } else {
        ckl.info("Main", "Could not retrieve processing stats.");
    }
    ckl.info("Main", `--------------------------`);

    if (!contextResult || !contextResult.processedData) {
        ckl.error("Main", "Failed to generate CKContext data.");
        return;
    }

    // Save CKContext data
    const outputDir = getConfig().outputDataDirName;
    await fs.mkdir(outputDir, { recursive: true }); // Ensure output directory exists
    const contextFile = Path.join(outputDir, 'ck_context.txt');
    await fs.writeFile(contextFile, contextResult.processedData, 'utf8');
    ckl.info("Main", `CKContext data saved to ${contextFile}`);

    // Convert to Intermediate (Turn List)
    const ckTurnListConversations = await ConvoKit.convertToCKTurnList();
    if (ckTurnListConversations.length === 0) {
        ckl.warn("Main", "No intermediate conversations were generated.");
        return;
    }
    let totalMessagesInCKTurnListConversations = 0;
    ckl.info("CKTurnList", "Number of conversations in CKTurnList format: ", ckTurnListConversations.length);
    ckTurnListConversations.forEach((conversation) => {
        totalMessagesInCKTurnListConversations += conversation.length;
    });
    ckl.info("CKTurnList", "Total messages in CKTurnList format: ", totalMessagesInCKTurnListConversations);

    // Get Weighted Sample
    const sampledConversations = await ConvoKit.getWeightedSample(getConfig().sampleSize);
    if (sampledConversations.length === 0) {
        ckl.warn("Main", "No sampled conversations were generated.");
        return;
    }
    ckl.info("CKWeighted", "Number of conversations in sampled CKTurnList format: ", sampledConversations.length);
    const sampledFile = Path.join(outputDir, 'ck_weighted_conversations.json');
    await fs.writeFile(sampledFile, JSON.stringify(sampledConversations, null, 2), 'utf8');
    ckl.info("Main", `Sampled conversations saved to ${sampledFile}`);

    // Export to ChatML
    const systemPrompt = getConfig().systemPrompt;
    
    const chatML = await ConvoKit.exportToChatML(systemPrompt);
    if (chatML.length > 0) {
        const chatMLFile = Path.join(outputDir, 'dataset.chatml.jsonl');
        await fs.writeFile(chatMLFile, chatML.join("\n"), 'utf8');
        ckl.info("Main", `ChatML format saved to ${chatMLFile}`);
    } else {
        ckl.warn("Main", "No data generated for ChatML export.");
    }

    // Export to Gemini
    const gemini = await ConvoKit.exportToGemini(systemPrompt);
    if (gemini.length > 0) {
        const geminiFile = Path.join(outputDir, 'dataset.gemini.jsonl');
        await fs.writeFile(geminiFile, gemini.join("\n"), 'utf8');
        ckl.info("Main", `Gemini format saved to ${geminiFile}`);
    } else {
        ckl.warn("Main", "No data generated for Gemini export.");
    }

    ckl.info("Main", "Processing finished.");
    ckl.timeEnd("Main", "Total processing time");
}

// Execute the main function
main().catch(error => {
    ckl.error("Main", `Unhandled error occurred: ${error}`);
    process.exit(1);
});
