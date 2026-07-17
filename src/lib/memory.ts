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

/** Content type — the constitution keys admission rules off this, in CODE,
    so tuning the judge's wording can never silently move the bar. */
export type MemoryCategory = 'preference' | 'identity' | 'project';

export interface MemoryEntry {
  id: string;
  text: string;
  kind: 'auto' | 'manual' | 'imported';
  /** preference/identity/project; absent on legacy and manual entries. */
  category?: MemoryCategory;
  /** Where it came from: canvas name for auto entries. */
  project?: string;
  at: string; // ISO date
}

// ── The memory constitution (rules live here, NOT in the judge prompt) ──
//   preference  what they like: language, style, format, tools, models.
//               Free to add; new observations may overwrite old ones.
//   identity    who they are: role, field, long-term projects. Only enters
//               when the user STATED it (evidence gate) — never inferred.
//   project     what they're doing now. Free to add, but decays: entries
//               untouched for PROJECT_DECAY_DAYS stop flowing into context
//               (kept in the manager — archive, not deletion).
//   Never stored: product mechanics, one-off task details, verbatim blocks,
//   credentials (pattern-blocked below as a code-level backstop).
const PROJECT_DECAY_DAYS = 45;
const SESSION_ADD_CAP = 3; // auto-writes per canvas per session; updates free
const CREDENTIAL_PATTERN = /sk-[a-zA-Z0-9_-]{8,}|api[ _-]?key|password|token|secret/i;
const sessionAddCounts = new Map<string, number>();

/** True when this entry should ride the context block (decay filter). */
function entryActive(m: MemoryEntry): boolean {
  if (m.category !== 'project') return true;
  const ageDays = (Date.now() - new Date(m.at).getTime()) / 86_400_000;
  return ageDays <= PROJECT_DECAY_DAYS;
}

/** The [Memory] context block, or null when disabled/empty. Stale project
    entries are filtered out here (decay = archive, not deletion). */
export function memoryContextBlock(): ContextMessage | null {
  const { memoryEnabled, memories } = useUiStore.getState();
  if (!memoryEnabled) return null;
  const active = memories.filter(entryActive);
  if (active.length === 0) return null;
  const lines = active.map((m) => `- ${m.text}`);
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

// Version discipline: bump when the wording changes, and run the golden
// set first (scripts/test-memory-judge.mjs) — admission behavior must
// change by DECISION, not as a side effect of prompt tuning. The judge only
// OBSERVES and CLASSIFIES; every admission rule it must obey lives in
// admissionCheck below, where a wording drift cannot move it.
export const JUDGE_PROMPT_VERSION = 2;
const JUDGE_PROMPT =
  'You maintain a user\'s long-term memory for an AI workspace. Above is the list of EXISTING memory entries (possibly empty), then ONE exchange from the current session. ' +
  'Decide whether the exchange reveals something DURABLE about the user, and CLASSIFY it: ' +
  '"preference" = how they like things done (language, style, format, tools, models); ' +
  '"identity" = who they are (role, field, expertise, long-term research agenda); ' +
  '"project" = what they are working on right now. ' +
  'Also report evidence: "stated" if the user said it about themselves in so many words, "inferred" if you are concluding it from behavior. ' +
  'NOT memories: content questions, one-off task details, general knowledge, facts about how this workspace itself works, verbatim text blocks, credentials. ' +
  'If a new observation covers the same topic as an existing entry, prefer update over add. Be conservative: most exchanges contain nothing. ' +
  'Reply with EXACTLY one line of JSON, nothing else: {"action":"none"} or {"action":"add","category":"preference|identity|project","evidence":"stated|inferred","text":"..."} or {"action":"update","id":"...","category":"...","evidence":"...","text":"..."} . ' +
  'The text must be ONE short sentence, in the same language the user writes in.';

interface JudgeVerdict {
  action?: string;
  id?: string;
  text?: string;
  category?: string;
  evidence?: string;
}

/** The constitution, applied. Returns a rejection reason or null (= allowed). */
export function admissionCheck(
  verdict: JudgeVerdict,
  existing: MemoryEntry[],
  projectName: string | undefined,
): string | null {
  const text = (verdict.text ?? '').trim();
  if (!text) return 'empty';
  if (CREDENTIAL_PATTERN.test(text)) return 'credential-like';
  const category = verdict.category as MemoryCategory | undefined;
  if (!category || !['preference', 'identity', 'project'].includes(category)) return 'no-category';
  // Identity is the slow-moving layer: only what the user actually said.
  if (category === 'identity' && verdict.evidence !== 'stated') return 'identity-inferred';
  if (verdict.action === 'add') {
    if (existing.some((m) => m.text === text)) return 'duplicate';
    const capKey = projectName ?? '(none)';
    if ((sessionAddCounts.get(capKey) ?? 0) >= SESSION_ADD_CAP) return 'session-cap';
  }
  if (verdict.action === 'update' && !existing.some((m) => m.id === verdict.id)) return 'unknown-id';
  return null;
}

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
      const verdict = JSON.parse(match[0]) as JudgeVerdict;
      if (verdict.action !== 'add' && verdict.action !== 'update') return;
      const fresh = useUiStore.getState().memories; // re-read: turns may race
      if (admissionCheck(verdict, fresh, projectName) !== null) return;
      const text = (verdict.text ?? '').trim();
      const category = verdict.category as MemoryCategory;
      if (verdict.action === 'add') {
        const capKey = projectName ?? '(none)';
        sessionAddCounts.set(capKey, (sessionAddCounts.get(capKey) ?? 0) + 1);
        const entry: MemoryEntry = { id: generateId(), text, kind: 'auto', category, project: projectName, at: new Date().toISOString() };
        useUiStore.getState().setMemories([...fresh, entry]);
        toast('info', fmt(t('memory.saved'), { t: text.slice(0, 60) }), 8000, {
          label: t('memory.undo'),
          run: () => {
            const now = useUiStore.getState().memories;
            useUiStore.getState().setMemories(now.filter((m) => m.id !== entry.id));
          },
        });
      } else {
        const before = fresh.find((m) => m.id === verdict.id)!;
        setMemories(fresh.map((m) => (m.id === verdict.id ? { ...m, text, category, at: new Date().toISOString() } : m)));
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
