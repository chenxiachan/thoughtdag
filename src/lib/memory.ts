import { llmCall, type ContextMessage } from './api';
import { getModelsOnce } from './use-models';
import { toast, useUiStore } from './ui-store';
import { generateId } from '../utils';
import { t, fmt } from '../i18n';

// Ambient long-term memory. The contract, agreed 2026-07:
//   - the model decides what to WRITE (a cheap background judge per turn)
//     and what to USE (the whole compact library rides the system layer;
//     relevance is judged while answering — no retrieval hop);
//   - writes announce themselves (toast with undo): visible ≠ manual;
//   - one global switch, ON by default; the manager is the only place to
//     curate; every entry carries provenance ("real memories have origins");
//   - paradigm machine steps never receive memories (experimental control).

export interface MemoryEntry {
  id: string;
  text: string;
  kind: 'auto' | 'manual' | 'imported';
  /** Where it came from: canvas name for auto entries. */
  project?: string;
  at: string; // ISO date
}

/** The [Memory] context block, or null when disabled/empty. */
export function memoryContextBlock(): ContextMessage | null {
  const { memoryEnabled, memories } = useUiStore.getState();
  if (!memoryEnabled || memories.length === 0) return null;
  const lines = memories.map((m) => `- ${m.text}`);
  return {
    role: 'user',
    content: `[Memory] Durable notes about this user, recorded across earlier sessions. Use them ONLY where relevant; never recite them, never treat them as part of the current question:\n${lines.join('\n')}`,
  };
}

/** Rough token weight of the enabled library (panel display). */
export function memoryTokens(countTokens: (s: string) => number): number {
  const { memories } = useUiStore.getState();
  return countTokens(memories.map((m) => m.text).join('\n'));
}

const JUDGE_PROMPT =
  'You maintain a user\'s long-term memory for an AI workspace. Above is the list of EXISTING memory entries (possibly empty), then ONE exchange from the current session. ' +
  'Decide whether the exchange reveals something DURABLE about the user: identity, role, preferences, ongoing projects, or stable facts they stated about themselves or their work. ' +
  'Content questions, one-off tasks and general knowledge are NOT memories. Be conservative: most exchanges contain nothing. ' +
  'Reply with EXACTLY one line of JSON, nothing else: {"action":"none"} or {"action":"add","text":"..."} or {"action":"update","id":"...","text":"..."} . ' +
  'The text must be ONE short sentence, in the same language the user writes in.';

/**
 * Fire-and-forget write judge, called after ordinary generations. Runs on
 * the server's default model (cheap/free tier), never the flagship pick.
 */
export function judgeMemory(question: string, response: string, projectName?: string): void {
  const { memoryEnabled, memories, setMemories } = useUiStore.getState();
  if (!memoryEnabled || question.trim().length < 8) return;
  void (async () => {
    try {
      const bg = (await getModelsOnce())?.default ?? undefined;
      const existing = memories.slice(0, 40).map((m) => `${m.id}: ${m.text}`).join('\n') || '(none)';
      const raw = await llmCall([
        { role: 'user', content: `Existing memory entries:\n${existing}\n\nExchange:\nUser: ${question.slice(0, 2000)}\nAssistant: ${response.slice(0, 2000)}\n\n${JUDGE_PROMPT}` },
      ], undefined, bg);
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) return;
      const verdict = JSON.parse(match[0]) as { action?: string; id?: string; text?: string };
      const text = (verdict.text ?? '').trim();
      const fresh = useUiStore.getState().memories; // re-read: turns may race
      if (verdict.action === 'add' && text) {
        if (fresh.some((m) => m.text === text)) return;
        const entry: MemoryEntry = { id: generateId(), text, kind: 'auto', project: projectName, at: new Date().toISOString() };
        useUiStore.getState().setMemories([...fresh, entry]);
        toast('info', fmt(t('memory.saved'), { t: text.slice(0, 60) }), 8000, {
          label: t('memory.undo'),
          run: () => {
            const now = useUiStore.getState().memories;
            useUiStore.getState().setMemories(now.filter((m) => m.id !== entry.id));
          },
        });
      } else if (verdict.action === 'update' && text && verdict.id) {
        if (!fresh.some((m) => m.id === verdict.id)) return;
        const before = fresh.find((m) => m.id === verdict.id)!;
        setMemories(fresh.map((m) => (m.id === verdict.id ? { ...m, text, at: new Date().toISOString() } : m)));
        toast('info', fmt(t('memory.updated'), { t: text.slice(0, 60) }), 8000, {
          label: t('memory.undo'),
          run: () => {
            const now = useUiStore.getState().memories;
            useUiStore.getState().setMemories(now.map((m) => (m.id === verdict.id ? before : m)));
          },
        });
      }
    } catch { /* background judge failures are silent by design */ }
  })();
}
