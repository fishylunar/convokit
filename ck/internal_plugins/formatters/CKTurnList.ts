import { loadConfig, ConvoKitLogging as ckl, CKTurnListConversation } from '../../../index';

// Load config once at the start
let configLoaded = false;
let shouldMergeConsecutiveMessages = false;

async function ensureConfigLoaded():Promise<void> {
    if (!configLoaded) {
        try {
            const config = await loadConfig();
            shouldMergeConsecutiveMessages = config.shouldMergeConsecutiveMessages ?? false;
            configLoaded = true;
        } catch (err) {
            // Log error during initial load attempt, but allow logging functions to work
            console.error(`[ERROR] ${new Date().toISOString()} - ConvoKitConfig: Failed to load config initially: ${err.message}`);
            // Use default logging settings if config fails
        }
    }
}

export async function CKContextToCKTurnList(CKContext: string): Promise<CKTurnListConversation[]> {
  await ensureConfigLoaded(); // Ensure config is loaded before processing
  ckl.time("CKContextToCKTurnList", "Converting CKContext to CKTurnList");
  const conversations:CKTurnListConversation[] = [];
  let currentConv:CKTurnListConversation = [];
  let mergedConsecutiveMessagesCount:number = 0;
  // split CKContext string into lines
  const CKContextLines = CKContext.split('\n');

  for await (const line of CKContextLines) {
    if (line.trim() === '<NC>') {
      if (currentConv.length > 0) conversations.push(currentConv);
      currentConv = [];
      continue;
    }
    const match = line.match(/^(\d+)\|([UA]):(.*)\|([0-9\- :]+)$/);
    if (!match) {
      ckl.warn('Skipped line (did not match expected format):', line);
      continue;
    }
    const [ , importanceStr, speaker, text, timestamp ] = match;
    const importance = parseInt(importanceStr, 10);
    const role = speaker === 'U' ? 'user' : 'assistant';
    let content = text.replace(/<NL>/g, '\n').trim();

    // Merge consecutive messages by same speaker
    if (currentConv.length > 0 && currentConv[currentConv.length - 1].role === role) {
      if(shouldMergeConsecutiveMessages) {
        mergedConsecutiveMessagesCount++;
        currentConv[currentConv.length - 1].content += '\n' + content;
      } else {
        currentConv.push({ importance, role, content, timestamp });
      }
      // importance will be averaged later if needed
    } else {
      currentConv.push({ importance, role, content, timestamp });
    }
  }
  if (currentConv.length > 0) conversations.push(currentConv);
  if (shouldMergeConsecutiveMessages) {
    ckl.info('Merged consecutive messages:', mergedConsecutiveMessagesCount);
  }
  ckl.timeEnd("CKContextToCKTurnList", "Converting CKContext to CKTurnList");
  return conversations;
}