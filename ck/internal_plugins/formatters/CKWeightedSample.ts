import { ConvoKitLogging as ckl, CKTurnListConversation } from "../../../";

export async function CKWeightedSample(CKTurnListConversations: CKTurnListConversation[], Samples: number): Promise<CKTurnListConversation[]> {
  ckl.time("CKWeightedSample", "Creating weighted sample");
  // Calculate weights (sum of importance for each conversation)
  const weights = CKTurnListConversations.map(CKTurnListConversation => CKTurnListConversation.reduce((s, m) => s + m.importance, 0));
  const total = weights.reduce((a, b) => a + b, 0);

  function pickOne():CKTurnListConversation {
    let r = Math.random() * total;
    for (let i = 0; i < CKTurnListConversations.length; i++) {
      r -= weights[i];
      if (r <= 0) return CKTurnListConversations[i];
    }
    return CKTurnListConversations[CKTurnListConversations.length - 1];
  }

  const result: CKTurnListConversation[] = [];
  for (let i = 0; i < Samples; i++) result.push(pickOne());
  ckl.timeEnd("CKWeightedSample", "Creating weighted sample");
  return result;
}
