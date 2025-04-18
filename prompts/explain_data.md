# Parsing and understanding ck_context.txt
You will receive a sequence of lines representing a conversation.  Each line is one of:

  • <NC>
    – This marks the end of one conversation and the start of another.

  • {SCORE}|{SPEAKER}:{TEXT}|{TIMESTAMP}
    – SCORE: integer importance  
    – SPEAKER: “U” for user, “A” for assistant  
    – TEXT: the full utterance, with all original new‑lines replaced by <NL>  
    – TIMESTAMP: ISO‑style timestamp of the first message in this batch

Rules for parsing:
  1. Split each non‑<NC> line on “|” into exactly three fields.
  2. In TEXT, treat every <NL> as a true newline.
  3. When you see <NC> alone, reset context and begin a new conversation.
  4. Consecutive messages by the same speaker (within a brief interval) are merged; you’ll reconstruct any internal breaks from <NL>.
  5. Do not invent or omit any content—just rehydrate the original dialogue.

Parse and reconstruct accordingly.

