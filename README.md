# ConvoKit: Flexible Conversation Processing & Export Toolkit

ConvoKit is a TypeScript-based framework for ingesting, normalizing, filtering, sampling, formatting, and exporting chat or conversation data for LLM training and analysis. It provides:

- A **provider registry** to plug in new data sources (Discord, Slack, custom exports, etc.).  
- A **plugin registry** for formatters, converters, and filters to transform and export data to ChatML, Gemini JSONL, custom context formats, and more.  
- A fully configurable, extensible pipeline: ingest → normalize → filter → importance‑score → sample → format → export.

ConvoKit saves you time building data preprocessing pipelines and lets you focus on models and prompts.

---

## Table of Contents

- Key Features  
- What It Can & Cannot Do  
- Who Should Use It  
- Installation  
- Quick Start  
- Configuration  
- Provider Registry  
  - Built‑in Providers  
  - Writing Your Own Provider  
- Plugin Registry  
  - Formatters  
  - Converters  
  - Filters  
  - Writing Your Own Plugin  
- Contributing  
- License  

---

## Key Features

- **Dynamic Provider Loading**  
  Automatically discover and load data providers from your project’s providers folder.

- **Normalized Conversation Format**  
  All data converges to a `ConvoKitConversation` interface: metadata + message arrays.

- **Context Formatting**  
  Generate a single, line-delimited training string (`CKContext`) with options for time‑gaps, new‑conversation markers, and importance scoring.

- **Turn‑List Conversion**  
  Break context into turn lists (`CKTurnListConversation`) for sampling or LLM‑specific export.

- **Weighted Sampling**  
  Sample by conversation importance to focus on high‑value exchanges.

- **Export Plugins**  
  Export to ChatML JSONL, Gemini JSONL, or add your own converter for other LLM formats.

- **Filter Plugins**  
  Drop unwanted messages (e.g. links‑only, emoji‑only, code‑only) via a simple plugin API.

---

## What It Can & Cannot Do

Can:
- Ingest JSON exports from Discord (via DiscordChatExporter), or any custom source you add via the **Provider Registry**.  
- Normalize and filter conversations by message content, length, or custom rules.  
- Score message & conversation importance automatically based on time, length, and frequency.  
- Sample highly‑important conversations for training budgets.  
- Export to popular LLM chat formats (ChatML, Gemini), or easily extendable.

Cannot:
- Perform LLM inference or model training directly. - **Yet ;)**
- Resolve references across conversations (thread linking across channels).  
- Guarantee perfect import schema for every data source—you may need to write a provider to handle custom formats.  
- Handle binary or non‑JSON data without extending a provider to preprocess it.

---

## Who Should Use It

- **NLP / ML Engineers** preparing chat‑based LLM fine‑tuning or analysis datasets.  
- **Bot / Chat Service Developers** needing to transform raw chat logs into structured training data.  
- **Researchers** studying conversation dynamics or designing importance‑based sampling strategies.  
- **Community Contributors** eager to add support for new platforms or export formats.

---

## Possibly upcomming features

  - **Personality** Generate a deep and comprehensive personality prompt based off your output ck_context
  - **Fine-tuning** Fine-tune models with exported training data (Currently mainly looking at Gemini) **(Contributions welcome!)**
  - **Model Testing** Test your fine-tuned model via the terminal (Currently mainly looking at Gemini) **(Contributions welcome!)**
  - **Unit Tests** Adding unit tests would help keep everything maintainable and stable (or so i've heard)

## Installation

```bash
npm i convokit
```

---

## Quick Start

```ts
import { ConvoKit, loadConfig, getConfig } from 'convokit';
import { config } from 'dotenv';

config();
await loadConfig();

async function run() {
  const ck = new ConvoKit();
  await ck.loadProviders(); // This will load all included providers, and the providers in the LocalProvidersDir if set (in config)
  // We also automatically load all included plugins & the plugins in LocalPluginsDir if set (in config)
  const convoData = await ck.processDataFromProviders();

  const context = await ck.parseToContext({ targetUsers: getConfig().targetUsers });
  await ck.convertToCKTurnList();
  await ck.getWeightedSample(getConfig().sampleSize);
  const chatml = await ck.exportToChatML(getConfig().systemPrompt);
  const gemini = await ck.exportToGemini(getConfig().systemPrompt);
  // Do whatever you want with the outputs
}
run();
```

> make sure you have set up providers and dir structure first


---

## Configuration

By default, ConvoKit reads convokit.config.json or environment variables - Here is an example config file

```jsonc
{
  "inputDataDirName": "InputData",
  "outputDataDirName": "OutputData",
  "targetUsers": [
    { "providerId": "discord", "id": "YOUR_DISCORD_USER_ID" }
  ],
  "sampleSize": 5000,
  "systemPrompt": "You are a helpful assistant.",
  "enableDebugging": false,
  "enablePerformanceStats": false,
  "shouldMergeConsecutiveMessages": true,
  "enableWarnings": true,
  "anonymizeProviderConversationIds": false,
  "localProvidersDir": "LocalProviders",
  "localPluginsDir": "LocalPlugins",
}
```

| Key                                     | Description                                                                          |
|-----------------------------------------|--------------------------------------------------------------------------------------|
| inputDataDirName                  | Directory containing raw chat exports (relative to project root).                    |
| outputDataDirName                 | Directory to write formatted outputs.                                                |
| targetUsers                       | JSON array mapping each provider to a target user ID for context generation.         |
| sampleSize                              | Number of conversations to sample by importance.                                     |
| systemPrompt                            | System prompt used in ChatML/Gemini exports.                                          |
| enableDebugging (optional)              | Enable or disable debug-level logs.                                                  |
| enablePerformanceStats (optional)       | Enable or disable performance stats (timers).                                        |
| shouldMergeConsecutiveMessages (optional)| Merge consecutive messages when converting to CKTurnList.                          |
| enableWarnings (optional)               | Toggle the display of warning messages.                                              |
| anonymizeProviderConversationIds (optional)| Anonymize provider conversation IDs to protect sensitive data.                  |
| localProviderDirectory (optional)| Directory name of where to load custom providers from.                  |
| localPluginDirectory (optional)| Directory name of where to load custom plugins from. (Contains a folder for each plugin type (formatters, filters, converters)! ) |

---

## Directory Structure

In your `convokit.config.json` file you set a inputDataDirName, in here you will need to have a directory for each provider. In there you should store the exported data.

Example for use with the Discord provider, with **inputDataDirName** set to `InputData`:

```plaintext
convokit/
├── index.ts
├── convokit.config.json
├── ... other files and folders
└── InputData
    └── discord
        └── Direct Messages - fishylunar [000000000000000].json
```

> Note: the filenames of the exported data doesnt matter, but the extension does.


---
## Provider Registry

ConvoKit discovers providers from providers via `ProviderRegistry`. Each provider must:

1. Implement `ConvoKitProvider` with `Test()` and `Convert()`.  
2. Export a static `ProviderInfo` object.  
3. Register itself via `ProviderRegistry.register(id, ProviderClass, ProviderInfo)`.

### Built‑in Providers

- **Discord** (`providers/discord.ts`): Reads JSON exports from DiscordChatExporter.

### Writing Your Own Provider

1. Create `/providers/MyPlatform.ts`.  

> To make a local provider, put the `MyPlatform.ts` file in the LocalProvidersDir you specified in your config. If you are contributing and making a provider to be included in ConvoKit, put it in `/providers/MyPlatform.ts`

2. Define your data schema, compatibility check, and conversion:

```ts
export const ProviderInfo = {
  name: "MyPlatform Exporter",
  description: "Imports MyPlatform chat JSON.",
  version: "1.0.0",
  author: "You",
  InputDataInfo: { directoryName: "MyPlatform", fileExtension: ".json" }
};

export class Provider implements ConvoKitProvider {
  constructor(private raw: any) {}
  Test(): boolean {
    // return true if raw matches your schema
  }
  Convert(): ConvoKitConversation {
    // transform raw → ConvoKitConversation
  }
}

// Self-register
ProviderRegistry.register("myplatform", Provider, ProviderInfo);
```

3. Place your exports in `InputData/MyPlatform/*.json`.  
4. Run `ck.loadProviders()` and `ck.processDataFromProviders()` to include your data.

---

## Plugin Registry

Plugins extend ConvoKit’s pipeline at three points:

1. **Formatters** (formatters)  
2. **Converters** (converters)  
3. **Filters** (filters)

They self‑register via `PluginRegistry.registerFormatter/Converter/Filter()`.

### Formatters

- **Context Formatter** (`id: context`): Builds the CKContext string with importance and markers.

### Converters

- **ChatML Converter** (`id: chatml`): Exports LLM chatml JSONL.  
- **Gemini Converter** (`id: gemini`): Exports Gemini‑style JSONL.

### Filters

- **LinkOnlyFilter** (`id: link-only`): Excludes messages that are URLs only.

---

### Writing Your Own Plugin

1. **Formatters**  
   ```ts
   export class MyFormatter implements FormatterPluginClass {
     PluginInfo = { id: "myfmt", name: "...", type: "formatter", version: "1.0.0" };
     apply(data, options) { /* return CKContextResult */ }
   }
   PluginRegistry.registerFormatter(MyFormatter);
   ```

2. **Converters**  
   ```ts
   export class MyConverter implements ConverterPluginClass {
     PluginInfo = { id: "myconv", name: "...", type: "converter", version: "1.0.0" };
     async apply(convs, prompt) { /* return string[] */ }
   }
   PluginRegistry.registerConverter(MyConverter);
   ```

3. **Filters**  
   ```ts
   export class MyFilter implements FilterPluginClass {
     PluginInfo = { id: "myfilter", name: "...", type: "filter", version: "1.0.0" };
     filterType: 'MUST' | 'MUST_NOT' = 'MUST_NOT';
     apply(content) { /* return boolean */ }
   }
   PluginRegistry.registerFilter(MyFilter);
   ```

---

## Contributing

Contributions are very welcome!  
- **Suggest a feature** via GitHub Issues.  
- **Report bugs** or raise PRs to fix them.  
- **Add new providers** (Slack, Teams, custom exports).  
- **Write plugins** for new formats or filters.  

---

## License

This project is licensed under the MIT License.  
Feel free to use, modify, and distribute as you see fit!