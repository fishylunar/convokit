import fs from 'fs/promises';
import path from 'path';

/** Defines the structure for identifying a target user within a specific provider. */
export interface ConvoKitTargetUser { providerId: string; id: string; }

/**
 * Shape of the ConvoKit configuration.
 */
export interface ConvoKitConfig {
  /** Name of the input data directory (relative to project root). */
  inputDataDirName: string;
  /** Name of the output data directory. */
  outputDataDirName: string;
  /** List of target user IDs per provider for context processing. */
  targetUsers: ConvoKitTargetUser[];
  /** Number of samples for weighted sampling. */
  sampleSize: number;
  /** System prompt used in ChatML/Gemini exports. */
  systemPrompt: string;
  /** optional, Enable or disable debug logs */
  enableDebugging?: boolean
  /** optional, Enable or disable performance stats (timers) */
  enablePerformanceStats?: boolean
  /** optional, Whether or not if we should merge consecutive messages when converting to CKTurnList */
  shouldMergeConsecutiveMessages?: boolean
  /** optional, Whether or not to show warnings */
  enableWarnings?: boolean
  /** optional, Whether or not we should anonymize provider conversation ids */
  anonymizeProviderConversationIds?: boolean
}

const CONFIG_FILE = 'convokit.config.json';

let _config: ConvoKitConfig | null = null;

/**
 * Loads and validates ConvoKit configuration from a JSON file and environment variables.
 * @throws Error if required configuration is missing or invalid.
 */
export async function loadConfig(): Promise<ConvoKitConfig> {
  if (_config) return _config;
  // Load config file if present
  let fileConfig: Partial<ConvoKitConfig> = {};
  try {
    const raw = await fs.readFile(path.resolve(process.cwd(), CONFIG_FILE), 'utf8');
    fileConfig = JSON.parse(raw);
  } catch {
    // ignore missing or invalid file
  }
  // Merge env vars and file settings
  const env = process.env;

  // Helper to parse boolean env vars
  function parseEnvBool(varName: string, defaultValue: boolean): boolean {
    return env[varName] === undefined ? defaultValue : env[varName] === 'true';
  }

  // Parse TARGET_USERS env var as JSON array if provided
  let envTargetUsers: ConvoKitTargetUser[] = [];
  if (env.TARGET_USERS) {
    try {
      const parsed = JSON.parse(env.TARGET_USERS);
      if (Array.isArray(parsed)) envTargetUsers = parsed;
    } catch {
      // ignore parse errors
    }
  }
  const config: any = {
    inputDataDirName: fileConfig.inputDataDirName || env.CK_INPUT_DATA_DIR_NAME,
    outputDataDirName: fileConfig.outputDataDirName || env.CK_OUTPUT_DATA_DIR_NAME || 'output_data',
    targetUsers: fileConfig.targetUsers || envTargetUsers,
    sampleSize: Number(fileConfig.sampleSize || env.CK_SAMPLE_SIZE || 5000),
    systemPrompt: fileConfig.systemPrompt || env.CK_SYSTEM_PROMPT || '',
    enableDebugging: fileConfig.enableDebugging !== undefined ? fileConfig.enableDebugging : parseEnvBool('CK_ENABLE_DEBUGGING', false),
    enablePerformanceStats: fileConfig.enablePerformanceStats !== undefined ? fileConfig.enablePerformanceStats : parseEnvBool('CK_ENABLE_PERFORMANCE_STATS', true),
    shouldMergeConsecutiveMessages: fileConfig.shouldMergeConsecutiveMessages !== undefined ? fileConfig.shouldMergeConsecutiveMessages : parseEnvBool('CK_SHOULD_MERGE_CONSECUTIVE_MESSAGES', false),
    enableWarnings: fileConfig.enableWarnings !== undefined ? fileConfig.enableWarnings : parseEnvBool('CK_ENABLE_WARNINGS', true),
    anonymizeProviderConversationIds: fileConfig.anonymizeProviderConversationIds !== undefined ? fileConfig.anonymizeProviderConversationIds : parseEnvBool('CK_ANONYMIZE_PROVIDER_CONVERSATION_IDS', false),
  };

  // Validate required fields
  const missing: string[] = [];
  if (!config.inputDataDirName) missing.push('inputDataDirName or environment variable INPUT_DATA_DIR_NAME');
  if (!Array.isArray(config.targetUsers) || config.targetUsers.length === 0) missing.push('targetUsers or environment variable TARGET_USERS');
  if (!config.sampleSize || isNaN(config.sampleSize)) missing.push('sampleSize or environment variable SAMPLE_SIZE');
  if (!config.systemPrompt) missing.push('systemPrompt or environment variable SYSTEM_PROMPT');
  if (missing.length) {
    throw new Error(`Missing configuration: ${missing.join(', ')}`);
  }
  _config = config as ConvoKitConfig;
  return _config;
}

/**
 * Retrieves the loaded ConvoKit configuration synchronously.
 * @throws Error if configuration is not loaded yet.
 */
export function getConfig(): ConvoKitConfig {
  if (!_config) {
    throw new Error('ConvoKit configuration has not been loaded. Call loadConfig() first.');
  }
  return _config;
}