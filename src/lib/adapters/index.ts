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
