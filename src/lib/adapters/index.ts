import type { ImportableConversation } from '../import-chat';

// Runner session dispatch: each adapter probes the text and answers null
// when the shape isn't its own. Order is by strictness of the signature
// (both look for distinctive line shapes, so misfires don't happen — but
// the contract is: first recognizer wins).
export async function anyRunnerSessionConversation(text: string): Promise<ImportableConversation | null> {
  const { claudeCodeSessionConversation } = await import('./claude-code-session');
  const cc = claudeCodeSessionConversation(text);
  if (cc) return cc;
  const { codexSessionConversation } = await import('./codex-session');
  const codex = codexSessionConversation(text);
  if (codex) return codex;
  const { dshSessionConversation } = await import('./dsh-session');
  return dshSessionConversation(text);
}

/** Streaming dispatch: chunks of line-aligned text flow through BOTH
 *  collectors (their per-line cost is one JSON.parse and their state stays
 *  small); whichever recognizes the session wins, claude-code first —
 *  same precedence as the string path. This is the ONLY road for sessions
 *  too big for one V8 string (a 619MB rollout is a real file). */
export async function streamRunnerConversation(
  read: () => Promise<string | null>,
): Promise<ImportableConversation | null> {
  const { ClaudeSessionCollector } = await import('./claude-code-session');
  const { CodexSessionCollector } = await import('./codex-session');
  const { DshSessionCollector } = await import('./dsh-session');
  const cc = new ClaudeSessionCollector();
  const codex = new CodexSessionCollector();
  const dsh = new DshSessionCollector();
  let carry = '';
  for (let chunk = await read(); chunk !== null; chunk = await read()) {
    if (!chunk) continue;
    const text = carry + chunk;
    const lines = text.split('\n');
    carry = lines.pop() ?? '';
    for (const ln of lines) { cc.feedLine(ln); codex.feedLine(ln); dsh.feedLine(ln); }
  }
  if (carry) { cc.feedLine(carry); codex.feedLine(carry); dsh.feedLine(carry); }
  return cc.toConversation() ?? codex.toConversation() ?? dsh.toConversation();
}

/** Harvest dispatch: whichever adapter recognizes the session builds the
 *  branch that hangs off the experiment's departure node. */
export async function anyRunnerSessionAsBranch(
  text: string,
  anchorNode: { id: string; x: number; y: number },
): Promise<{ nodes: import('../../types').ThoughtNode[]; edges: import('../../types').ThoughtEdge[]; turnCount: number } | null> {
  const { claudeCodeSessionAsBranch } = await import('./claude-code-session');
  const cc = claudeCodeSessionAsBranch(text, anchorNode);
  if (cc) return cc;
  const { codexSessionAsBranch } = await import('./codex-session');
  const codex = codexSessionAsBranch(text, anchorNode);
  if (codex) return codex;
  const { dshSessionAsBranch } = await import('./dsh-session');
  return dshSessionAsBranch(text, anchorNode);
}
