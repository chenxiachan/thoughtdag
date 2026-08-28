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
  return codexSessionConversation(text);
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
  return codexSessionAsBranch(text, anchorNode);
}
