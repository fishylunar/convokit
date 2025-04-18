import { ConvoKitProviderInfo, ConvoKitProviderConstructor } from "./ck/types/ConvoKitProvider";
import { CKTurnListConversation, ConvoKitConversation } from "./ck/types/ConvoKitTypes";
import fs from 'fs/promises';
import Path from 'path';
import { ConvoKitLogging as ckl } from "./ck/ConvoKitLogging";
import { config } from "dotenv";
import { ProviderRegistry } from './ck/ProviderRegistry';
import { PluginRegistry } from './ck/PluginRegistry';
import { loadConfig, getConfig } from './ck/ConvoKitConfig';
import { fileURLToPath, pathToFileURL } from 'url';
import { CKContextOptions, CKContextResult } from './ck/internal_plugins/formatters/ConvoKitContext';
import { CKContextToCKTurnList } from './ck/internal_plugins/formatters/CKTurnList';
import { CKWeightedSample } from './ck/internal_plugins/formatters/CKWeightedSample';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = Path.dirname(__filename);

config(); // Load environment variables

// Store both the provider constructor and its info
interface LoadedProviderModule {
    Provider: ConvoKitProviderConstructor;
    ProviderInfo: ConvoKitProviderInfo;
}

export class ConvoKit {
    private loadedProviderModules: LoadedProviderModule[] = [];
    private convoKitFormattedData: ConvoKitConversation[] = [];
    private ckContextResult: CKContextResult | null = null;
    private ckTurnListConversations: CKTurnListConversation[] = [];
    private sampledConversations: CKTurnListConversation[] = [];

    constructor() {
        // Constructor can be used for initial setup if needed later
    }

    /**
     * Dynamically loads all plugin modules so they self-register.
     */
    private async loadPlugins(): Promise<void> {
        const pluginsBase = Path.join(__dirname, 'plugins');
        for (const type of ['formatters', 'converters', 'filters']) {
            const dir = Path.join(pluginsBase, type);
            try {
                const files = await fs.readdir(dir);
                for (const file of files) {
                    if (file.endsWith('.ts') || file.endsWith('.js')) {
                        const filePath = Path.join(dir, file);
                        ckl.debug('PluginLoader', `Importing plugin module: ${filePath}`);
                        try {
                            await import(pathToFileURL(filePath).href);
                        } catch (importErr) {
                            ckl.error('PluginLoader', `Failed to load plugin module ${filePath}: ${importErr}`);
                        }
                    }
                }
            } catch (err) {
                ckl.debug('PluginLoader', `No plugin directory for type ${type} (${err.message}).`);
            }
        }
    }

    /**
     * Anonymizes provider data by renaming files in the input data directory.
     */
    async anonymizeProviderData(): Promise<void> {
        ckl.time("ConvoKit", "Anonymizing provider data");
        const { inputDataDirName } = getConfig();
        const baseDataDir = Path.join(__dirname, `./${inputDataDirName}`);
        let providerDirs: string[];
        try {
            providerDirs = await fs.readdir(baseDataDir);
        } catch (err) {
            ckl.error("ConvoKit", `Error reading base data directory ${baseDataDir}: ${err.message}`);
            return;
        }
        for (const folder of providerDirs) {
            const providerDir = Path.join(baseDataDir, folder);
            let stat;
            try {
                stat = await fs.stat(providerDir);
            } catch (err) {
                ckl.error("ConvoKit", `Error accessing ${providerDir}: ${err.message}`);
                continue;
            }
            if (!stat.isDirectory()) continue;
            let files: string[];
            try {
                files = await fs.readdir(providerDir);
            } catch (err) {
                ckl.error("ConvoKit", `Error reading directory ${providerDir}: ${err.message}`);
                continue;
            }
            for (const file of files) {
                const oldFilePath = Path.join(providerDir, file);
                const ext = Path.extname(file);
                const newName = crypto.randomBytes(8).toString('hex') + ext;
                const newFilePath = Path.join(providerDir, newName);
                try {
                    await fs.rename(oldFilePath, newFilePath);
                    ckl.debug("ConvoKit", `Renamed ${oldFilePath} to ${newFilePath}`);
                } catch (err) {
                    ckl.error("ConvoKit", `Failed to rename ${oldFilePath}: ${err.message}`);
                }
            }
        }
        ckl.timeEnd("ConvoKit", "Anonymizing provider data");
    }

    // Load provider modules dynamically
    async loadProviders(): Promise<void> {
        await loadConfig();

        // Load plugin classes
        await this.loadPlugins();

        // Dynamically import all provider modules so they self-register
        const providersDir = Path.join(__dirname, 'providers');
        try {
            const providerFiles = await fs.readdir(providersDir);
            for (const file of providerFiles) {
                if (file.endsWith('.ts') || file.endsWith('.js')) {
                    const modulePath = Path.join(providersDir, file);
                    await import(modulePath);
                }
            }
        } catch (err) {
            ckl.error('ConvoKit', `Error loading provider modules: ${err}`);
        }

        const { inputDataDirName } = getConfig();
        this.loadedProviderModules = [];
        const inputDataDir = `./${inputDataDirName}`;

        // For each registered provider, check data folder and instantiate
        let dirsInInputDirectory: string[] = [];
        try {
            dirsInInputDirectory = await fs.readdir(inputDataDir);
        } catch (err) {
            ckl.error('ConvoKit', `Error reading input data directory ${inputDataDir}: ${err}`);
        }
        for (const entry of ProviderRegistry.list()) {
            const { id, ctor: ProviderClass, info: ProviderInfo } = entry;
            ckl.info('ConvoKit', `Loading provider [${id}]: ${ProviderInfo.name} v${ProviderInfo.version}`);
            const providerDirName = ProviderInfo.InputDataInfo.directoryName;
            if (!dirsInInputDirectory.includes(providerDirName)) {
                ckl.warn('ConvoKit', `Input directory missing for provider ${id}: ${providerDirName}. Skipping.`);
                continue;
            }
            const providerDataDir = Path.join(inputDataDir, providerDirName);
            let providerFiles: string[] = [];
            try {
                providerFiles = await fs.readdir(providerDataDir);
            } catch (err) {
                ckl.warn('ConvoKit', `Cannot read data directory for provider ${id}: ${err}. Skipping.`);
                continue;
            }
            const matchingFiles = providerFiles.filter(f => f.endsWith(ProviderInfo.InputDataInfo.fileExtension));
            if (matchingFiles.length === 0) {
                ckl.warn('ConvoKit', `No matching files for provider ${id} in ${providerDataDir}. Skipping.`);
                continue;
            }
            this.loadedProviderModules.push({ Provider: ProviderClass, ProviderInfo });
        }
        ckl.info('ConvoKit', `Loaded ${this.loadedProviderModules.length} providers via registry.`);
    }

    // Process data using loaded providers
    async processDataFromProviders(): Promise<ConvoKitConversation[]> {
        this.convoKitFormattedData = []; // Clear previous results
        const inputDataDir = `./${getConfig().inputDataDirName}`;

        if (!getConfig().inputDataDirName) {
            ckl.error("ConvoKit", "INPUT_DATA_DIR_NAME environment variable is not set. Cannot process data.");
            return [];
        }

        const processingPromises = this.loadedProviderModules.map(async (providerModule) => {
            const providerInfo = providerModule.ProviderInfo;
            const providerDataDir = Path.join(inputDataDir, providerInfo.InputDataInfo.directoryName);
            ckl.info(`Provider: ${providerInfo.name}`, `Loading data from ${providerDataDir}`);

            try {
                const inputDataFiles = (await fs.readdir(providerDataDir))
                    .filter(file => file.endsWith(providerInfo.InputDataInfo.fileExtension));

                for (const file of inputDataFiles) {
                    const filePath = Path.join(providerDataDir, file);
                    try {
                        const fileContent = await fs.readFile(filePath, 'utf8');
                        const chat_data = JSON.parse(fileContent);
                        const providerInstance = new providerModule.Provider(chat_data);
                        const isCompatible = providerInstance.Test();
                        if (isCompatible) {
                            const llmConvoKitFormat = providerInstance.Convert();
                            this.convoKitFormattedData.push(llmConvoKitFormat);
                            ckl.info(`Provider: ${providerInfo.name}`, `Converted data from ${file} to ConvoKit format`);
                        } else {
                            ckl.error(`Provider: ${providerInfo.name}`, `Data in ${file} is NOT compatible with the provider.`);
                        }
                    } catch (err) {
                        ckl.error(`Provider: ${providerInfo.name}`, `Error processing file ${file}: ${err}`);
                    }
                }
            } catch (err) {
                ckl.error(`Provider: ${providerInfo.name}`, `Error reading directory ${providerDataDir}: ${err}`);
            }
        });
        await Promise.all(processingPromises);
        ckl.info("ConvoKit", `Provider processing complete. Total conversations formatted: ${this.convoKitFormattedData.length}`);
        return this.convoKitFormattedData;
    }

    // Parse raw ConvoKit data into CKContext format
    async parseToContext(options: CKContextOptions): Promise<CKContextResult> {
        if (!this.convoKitFormattedData.length) {
            ckl.warn("ConvoKit", "No ConvoKit formatted data available to parse. Run processDataFromProviders() first.");
            // Return a default empty result or throw an error
            return { processedData: '', stats: { conversationsProcessed: 0, conversationsSkipped_NoTargetUser: 0, conversationsSkipped_LowImportance: 0, conversationsSkipped_NoMessages: 0, totalMessagesConsidered: 0, totalMessagesIncluded: 0, totalMessagesFilteredOut: 0 } };
        }
        this.ckContextResult = await this.runFormatter('context', options);
        return this.ckContextResult;
    }

    // Convert CKContext string to CKIntermediate format (Turn List)
    async convertToCKTurnList(): Promise<CKTurnListConversation[]> {
        if (!this.ckContextResult || !this.ckContextResult.processedData) {
            ckl.warn("ConvoKit", "No CKContext data available to convert. Run parseToContext() first.");
            return [];
        }
        this.ckTurnListConversations = await CKContextToCKTurnList(this.ckContextResult.processedData);
        return this.ckTurnListConversations;
    }

    // Get weighted sample from CKIntermediate conversations
    async getWeightedSample(samples: number): Promise<CKTurnListConversation[]> {
        if (this.ckTurnListConversations.length === 0) {
            ckl.warn("ConvoKit", "No intermediate conversations available for sampling. Run convertToCKTurnList() first.");
            return [];
        }
        this.sampledConversations = await CKWeightedSample(this.ckTurnListConversations, samples);
        return this.sampledConversations;
    }

    // Convert sampled conversations to ChatML format
    async exportToChatML(systemPrompt: string): Promise<string[]> {
        if (!this.sampledConversations.length) {
            ckl.warn("ConvoKit", "No sampled conversations available for ChatML export. Run getWeightedSample() first.");
            return [];
        }
        return await this.runConverter('chatml', systemPrompt);
    }

    // Convert sampled conversations to Gemini format
    async exportToGemini(systemPrompt: string): Promise<string[]> {
        if (!this.sampledConversations.length) {
            ckl.warn("ConvoKit", "No sampled conversations available for Gemini export. Run getWeightedSample() first.");
            return [];
        }
        return await this.runConverter('gemini', systemPrompt);
    }

    /**
     * List registered provider IDs.
     */
    listProviders(): string[] {
        return ProviderRegistry.list().map(entry => entry.id);
    }

    /**
     * List all registered formatter plugin IDs.
     */
    listFormatters(): string[] {
        return PluginRegistry.listFormatters();
    }

    /**
     * List all registered converter plugin IDs.
     */
    listConverters(): string[] {
        return PluginRegistry.listConverters();
    }

    /**
     * List all registered filter plugin IDs.
     */
    listFilters(): string[] {
        return PluginRegistry.listFilters();
    }

    /**
     * Runs a registered formatter plugin by ID on current formatted data.
     * @param id Formatter plugin ID.
     * @param options Optional context options.
     */
    async runFormatter(id: string, options?: CKContextOptions): Promise<CKContextResult> {
        const pluginCtor = PluginRegistry.getFormatter(id);
        if (!pluginCtor) throw new Error(`Formatter plugin "${id}" not found.`);
        const plugin = new pluginCtor();
        return await plugin.apply(this.convoKitFormattedData, options);
    }

    /**
     * Runs a registered converter plugin by ID on current sampled conversations.
     * @param id Converter plugin ID.
     * @param systemPrompt System prompt string for converter.
     */
    async runConverter(id: string, systemPrompt: string): Promise<string[]> {
        const pluginCtor = PluginRegistry.getConverter(id);
        if (!pluginCtor) throw new Error(`Converter plugin "${id}" not found.`);
        const plugin = new pluginCtor();
        return await plugin.apply(this.sampledConversations, systemPrompt);
    }

    /**
     * Tests a content string against a registered filter plugin.
     * @param id Filter plugin ID.
     * @param content Message content to test.
     * @returns True if content passes the filter, false otherwise.
     */
    runFilter(id: string, content: string): boolean {
        const pluginCtor = PluginRegistry.getFilter(id);
        if (!pluginCtor) throw new Error(`Filter plugin "${id}" not found.`);
        const plugin = new pluginCtor();
        const result = plugin.apply(content);
        return plugin.filterType === 'MUST' ? result : !result;
    }

    // --- Getters for internal state ---
    getFormattedData(): ConvoKitConversation[] {
        return this.convoKitFormattedData;
    }

    getContextResult(): CKContextResult | null {
        return this.ckContextResult;
    }

    getIntermediateConversations(): CKTurnListConversation[] {
        return this.ckTurnListConversations;
    }

    getSampledConversations(): CKTurnListConversation[] {
        return this.sampledConversations;
    }

}
