// Rough token estimate (~4 chars per token).
export function countTokens(text: string): number {
  // CJK characters run ~1 token each in modern BPEs; Latin ~4 chars/token.
  // The old length/4 undercounted Chinese ~4x, which made every token
  // price tag in the UI dishonest.
  let cjk = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if ((c >= 0x2e80 && c <= 0x9fff) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xffef) || (c >= 0x3000 && c <= 0x303f)) cjk++;
  }
  return Math.ceil(cjk + (text.length - cjk) / 4);
}

/** True while Enter is confirming an IME composition (pinyin etc.) — such
    an Enter must NEVER submit; it is picking a candidate word. */
export function isImeComposing(e: { nativeEvent?: { isComposing?: boolean }; keyCode?: number }): boolean {
  return !!e.nativeEvent?.isComposing || e.keyCode === 229;
}

let idCounter = 0;
export function generateId(): string {
  return `node-${Date.now()}-${idCounter++}`;
}

/** The display summary for a node's ACTIVE version (map layer only). */
/** A node still waiting for ITS OWN question: an empty ask node, or a
    paradigm human turn. Everywhere this is non-null, question inputs fill
    THIS node (editQuestion / submitHumanTurn) instead of spawning a child —
    the canvas card and the focus panel share this single source. */
export function awaitingInput(data: { stepKind?: string; question: string; response: string; isLoading: boolean; generationFailed?: boolean }): 'ask' | 'human' | null {
  if (data.stepKind === 'human' && !data.question) return 'human';
  if (!data.stepKind && !data.question && !data.response && !data.isLoading && !data.generationFailed) return 'ask';
  return null;
}

export function activeSummary(data: { summaries?: (string | undefined | null)[]; responseIndex: number; summary?: string }): string | undefined {
  return data.summaries?.[data.responseIndex] ?? data.summary ?? undefined;
}

/** The micro topic for the active version — the ≤6-char noun phrase narrow
    surfaces show. Older canvases have none; callers fall back to the summary. */
export function activeTopic(data: { summaryTopics?: (string | undefined | null)[]; responseIndex: number }): string | undefined {
  return data.summaryTopics?.[data.responseIndex] ?? undefined;
}
