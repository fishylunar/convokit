#!/usr/bin/env node
import { Command, Option } from 'commander';
import { ConvoKit } from './index';
import { ConvoKitLogging as ckl } from './ck/ConvoKitLogging';
import fs from 'fs/promises';
import Path from 'path';
import { loadConfig, ConvoKitConfig } from './ck/ConvoKitConfig';
import { CKContextOptions, CKContextResult } from './ck/internal_plugins/formatters/ConvoKitContext';
import { ProviderRegistry } from './ck/ProviderRegistry';
import { PluginRegistry } from './ck/PluginRegistry';

const program = new Command();

// --- Helper Functions ---

async function initializeConvoKit(providerIds?: string[]): Promise<{ ck: ConvoKit, config: ConvoKitConfig }> {
    let config: ConvoKitConfig;
    try {
        config = await loadConfig();
    } catch (error) {
        console.error('CLI', `Failed to load configuration: ${error.message}`);
        console.info('CLI', 'Ensure convokit.config.json exists or environment variables are set.');
        console.info('CLI', 'You can create an example config using: npx convokit create-config');
        process.exit(1);
    }

    const ck = new ConvoKit();
    try {
        // Load all providers and plugins first to populate registries
        await ck.loadProviders(); // This loads config, plugins, and providers

        // Filter which providers to actually *use* based on the command option
        if (providerIds && providerIds.length > 0) {
            const availableProviders = ProviderRegistry.list().map(p => p.id);
            const invalidProviders = providerIds.filter(id => !availableProviders.includes(id));
            if (invalidProviders.length > 0) {
                throw new Error(`Unknown provider(s) specified: ${invalidProviders.join(', ')}. Available: ${availableProviders.join(', ')}`);
            }
            // Modify the internal list of providers to use for processing
            (ck as any).loadedProviderModules = (ck as any).loadedProviderModules.filter((mod: any) => {
                const registeredId = ProviderRegistry.findIdByConstructor(mod.Provider);
                return registeredId ? providerIds.includes(registeredId) : false;
            });
            if ((ck as any).loadedProviderModules.length === 0) {
                throw new Error(`None of the specified providers (${providerIds.join(', ')}) have corresponding data folders or files in '${config.inputDataDirName}'.`);
            }
            ckl.info('CLI', `Using specified providers: ${providerIds.join(', ')}`);
        } else {
            const loadedProviderIds = (ck as any).loadedProviderModules.map((mod: any) => ProviderRegistry.findIdByConstructor(mod.Provider)).filter((id: string | undefined) => id);
            ckl.info('CLI', `Using all available providers with data: ${loadedProviderIds.join(', ')}`);
        }

    } catch (error) {
        ckl.error('CLI', `Initialization failed: ${error.message}`);
        process.exit(1);
    }
    return { ck, config };
}

async function runPipelineToContext(ck: ConvoKit, config: ConvoKitConfig): Promise<CKContextResult> {
    ckl.info('CLI', 'Processing provider data...');
    const processedData = await ck.processDataFromProviders();
    if (!processedData || processedData.length === 0) {
        throw new Error("No data generated from providers. Check input data directory and provider configurations.");
    }
    ckl.info('CLI', `Processing complete. ${processedData.length} conversations processed.`);

    if (!config.targetUsers || config.targetUsers.length === 0) {
        throw new Error("Target Users are required for context generation. Set 'targetUsers' in config.");
    }

    ckl.info('CLI', 'Parsing data to CKContext format...');
    const contextOptions: CKContextOptions = {
        targetUsers: config.targetUsers,
        minimumAllowedImportanceChat: config.minImportanceChat,
        minimumAllowedImportancePerMessage: config.minImportanceMessage,
    };
    const contextResult = await ck.parseToContext(contextOptions);
    ckl.info('CLI', 'Parsing to CKContext complete.');
    ckl.info('CLI', `Context Stats: ${JSON.stringify(contextResult.stats)}`);
    return contextResult;
}

async function runFullExportPipeline(ck: ConvoKit, config: ConvoKitConfig, converterId: string): Promise<string[]> {
    await runPipelineToContext(ck, config);

    ckl.info('CLI', 'Converting to CKTurnList format...');
    const turnListData = await ck.convertToCKTurnList();
    if (!turnListData || turnListData.length === 0) {
        throw new Error("Conversion to TurnList resulted in no data.");
    }
    ckl.info('CLI', `Conversion to CKTurnList complete. ${turnListData.length} conversations in list.`);

    ckl.info('CLI', `Generating ${config.sampleSize} weighted samples...`);
    const sampledData = await ck.getWeightedSample(config.sampleSize);
    if (!sampledData || sampledData.length === 0) {
        throw new Error("Sampling resulted in no data.");
    }
    ckl.info('CLI', `Sampling complete. ${sampledData.length} conversations sampled.`);

    ckl.info('CLI', `Exporting data to ${converterId} format...`);
    if (!ck.listConverters().includes(converterId)) {
        throw new Error(`Unsupported export format: ${converterId}. Available converters: ${ck.listConverters().join(', ')}`);
    }
    const exportedData = await ck.runConverter(converterId, config.systemPrompt);
    ckl.info('CLI', `Export complete. ${exportedData.length} items exported.`);
    return exportedData;
}

async function saveOutput(outputPath: string, data: any, asJson: boolean = true): Promise<void> {
    const absolutePath = Path.resolve(outputPath);
    try {
        const content = asJson ? JSON.stringify(data, null, 2) : String(data);
        await fs.writeFile(absolutePath, content);
        ckl.success('CLI', `Output saved successfully to ${absolutePath}`);
    } catch (error) {
        ckl.error('CLI', `Failed to write output to ${absolutePath}: ${error.message}`);
        process.exit(1);
    }
}

// --- CLI Commands ---

program
    .name('convokit')
    .description('CLI tool for the ConvoKit conversation processing framework.')
    .version('1.0.2'); // TODO: Link to package.json version

program
    .command('create-config')
    .alias('cfg')
    .description('Create an example convokit.config.json file in the current directory.')
    .action(async () => {
        const exampleConfigPath = Path.resolve(__dirname, '..', 'convokit.config.json.example'); // Adjust path as needed
        const targetConfigPath = Path.resolve(process.cwd(), 'convokit.config.json');
        try {
            await fs.copyFile(exampleConfigPath, targetConfigPath, fs.constants.COPYFILE_EXCL);
            ckl.success('CLI', `Example configuration file created at ${targetConfigPath}`);
            ckl.info('CLI', 'Please edit this file with your specific settings.');
        } catch (error) {
            if (error.code === 'EEXIST') {
                ckl.error('CLI', `Configuration file already exists at ${targetConfigPath}.`);
            } else {
                ckl.error('CLI', `Failed to create configuration file: ${error.message}`);
            }
            process.exit(1);
        }
    });

program
    .command('providers')
    .description('List available built-in and local providers.')
    .action(async () => {
        ckl.info('CLI', 'Listing available providers...');
        let localDir: string | undefined;
        try {
            const config = await loadConfig();
            localDir = config.localProvidersDir;
        } catch { /* Ignore config loading errors for listing */ }

        const ck = new ConvoKit();
        try {
            await ck.loadProviders();

            const providers = ProviderRegistry.list();
            if (providers.length === 0) {
                ckl.warn('CLI', 'No providers found or registered.');
                return;
            }
            ckl.info('CLI', '------------------------------------');
            providers.forEach(p => {
                ckl.info('CLI', `ID: ${p.id}`);
                ckl.info('CLI', `  Name: ${p.info.name}`);
                ckl.info('CLI', `  Version: ${p.info.version}`);
                ckl.info('CLI', `  Author: ${p.info.author}`);
                ckl.info('CLI', `  Input Dir: ${p.info.InputDataInfo.directoryName}`);
                ckl.info('CLI', `  Input Ext: ${p.info.InputDataInfo.fileExtension}`);
                ckl.info('CLI', '------------------------------------');
            });
            if (localDir) {
                ckl.info('CLI', `(Local providers loaded from: ${localDir})`);
            }
        } catch (error) {
            ckl.error('CLI', `Failed to list providers: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('plugins')
    .description('List available built-in and local plugins (formatters, converters, filters).')
    .action(async () => {
        ckl.info('CLI', 'Listing available plugins...');
        let localDir: string | undefined;
        try {
            const config = await loadConfig();
            localDir = config.localPluginsDir;
        } catch { /* Ignore config loading errors for listing */ }

        const ck = new ConvoKit();
        try {
            await ck.loadProviders();

            const listPlugins = (type: string, lister: () => string[]):void => {
                const plugins = lister();
                if (plugins.length > 0) {
                    ckl.info('CLI', `--- ${type.toUpperCase()} ---`);
                    plugins.forEach(id => {
                        const pluginInfo = PluginRegistry.getPluginInfo(id);
                        if (pluginInfo) {
                            ckl.info('CLI', `  ID: ${pluginInfo.id}`);
                            ckl.info('CLI', `    Name: ${pluginInfo.name}`);
                            ckl.info('CLI', `    Version: ${pluginInfo.version}`);
                        } else {
                            ckl.warn('CLI', `  ID: ${id} (Info not found - registration issue?)`);
                        }
                    });
                } else {
                    ckl.info('CLI', `--- No ${type.toUpperCase()} registered ---`);
                }
            };

            listPlugins('Formatters', PluginRegistry.listFormatters);
            listPlugins('Converters', PluginRegistry.listConverters);
            listPlugins('Filters', PluginRegistry.listFilters);

            if (localDir) {
                ckl.info('CLI', `(Local plugins loaded from: ${localDir})`);
            }

        } catch (error) {
            ckl.error('CLI', `Failed to list plugins: ${error.message}`);
            process.exit(1);
        }
    });

const providersOption = new Option(
    '-p, --providers <ids>',
    'Comma-separated list of provider IDs to use (e.g., discord,telegram). Uses all available if omitted.'
).argParser((value) => value.split(',').map(s => s.trim()).filter(s => s));

program
    .command('context')
    .description('Process data and generate CKContext output. Outputs plain text context by default.')
    .addOption(providersOption)
    .addOption(new Option('-o, --output <file>', 'Output file path for the CKContext result.'))
    .addOption(new Option('--stats', 'Output the full JSON object including stats, instead of just the context text.'))
    .action(async (options) => {
        ckl.info('CLI', 'Starting CKContext generation...');
        try {
            const { ck, config } = await initializeConvoKit(options.providers);
            const contextResult = await runPipelineToContext(ck, config);

            if (options.output) {
                if (options.stats) {
                    // Save the full JSON object (stats + processedData)
                    await saveOutput(options.output, contextResult, true);
                } else {
                    // Save only the processedData string as plain text
                    await saveOutput(options.output, contextResult.processedData, false);
                }
            } else {
                ckl.warn('CLI', 'CKContext generated in memory. Use --output to save.');
                ckl.info('CLI', `Generated context string length: ${contextResult.processedData.length}`);
                if (options.stats) {
                    ckl.info('CLI', `Stats: ${JSON.stringify(contextResult.stats)}`);
                }
            }
            ckl.success('CLI', 'CKContext generation finished.');
        } catch (error) {
            ckl.error('CLI', `CKContext generation failed: ${error.message}`);
            process.exit(1);
        }
    });

program
    .command('export')
    .description('Run the full pipeline (process, context, turnlist, sample) and export to a specified format.')
    .argument('<converter_id>', 'The ID of the converter plugin to use (e.g., chatml, gemini).')
    .addOption(providersOption)
    .addOption(new Option('-o, --output <file>', 'Output file path for the exported data (JSON array of strings).'))
    .action(async (converterId, options) => {
        ckl.info('CLI', `Starting export process for format: ${converterId}...`);
        try {
            const { ck, config } = await initializeConvoKit(options.providers);
            const exportedData = await runFullExportPipeline(ck, config, converterId);

            if (options.output) {
                await saveOutput(options.output, exportedData);
            } else {
                ckl.warn('CLI', 'Exported data generated in memory. Use --output to save.');
                ckl.info('CLI', `Generated ${exportedData.length} export items.`);
            }
            ckl.success('CLI', 'Export process finished.');
        } catch (error) {
            ckl.error('CLI', `Export failed: ${error.message}`);
            process.exit(1);
        }
    });

program.parseAsync(process.argv)
    .catch(err => {
        ckl.error('CLI', `Unhandled error: ${err.message}`);
        console.error(err.stack);
        process.exit(1);
    });
