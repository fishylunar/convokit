import  {CKTurnListConversation } from '../../types/ConvoKitTypes';
import { ConvoKitLogging as ckl } from "../../ConvoKitLogging";
import { loadConfig, getConfig } from '../../ConvoKitConfig';

await loadConfig();

export async function CKContextToCKTurnList(CKContext: string): Promise<CKTurnListConversation[]> {
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
      if(getConfig().shouldMergeConsecutiveMessages) {
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
  if (getConfig().shouldMergeConsecutiveMessages) {
    ckl.info('Merged consecutive messages:', mergedConsecutiveMessagesCount);
  }
  ckl.timeEnd("CKContextToCKTurnList", "Converting CKContext to CKTurnList");
  return conversations;
}