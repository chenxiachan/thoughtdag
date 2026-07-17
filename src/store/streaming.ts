import type { StoreApi } from 'zustand';
import { walkUpAncestors } from '../lib/graph';
import { upstreamFingerprint } from './context-builder';
import { pruneHighlights } from '../lib/highlight-match';
import { llmCall, llmCallStream, type ContextMessage, type ImageAttachment } from '../lib/api';
import { countTokens, activeSummary } from '../utils';
import { toast, useUiStore } from '../lib/ui-store';
import { getModelsOnce } from '../lib/use-models';
import { memoryContextBlock, judgeMemory } from '../lib/memory';
import { t, fmt } from '../i18n';
import { isViewerMode } from '../lib/viewer';
import type { Reference } from '../types';
import type { StoreState } from './types';

// Background summary generation — fire and forget. Display channel ONLY:
// the human reads the summary on the map, the model always reads the full
// text. Short answers fit on the card as-is and skip the call.
// The judge sees the MAP itself as context: the takeaway lines already on
// the ancestor path (with their tags). That keeps terminology aligned
// across plaques and classifications aware of what the thinking already
// ruled out or decided — the lines read as one progression, not islands.
export const SUMMARY_MIN_CHARS = 400;
export function generateSummary(nodeId: string, question: string, response: string, setSummary: (id: string, summary: string, forResponse: string, type?: string) => void, mapLines?: string[]) {
  if (response.length < SUMMARY_MIN_CHARS) return;
  const mapBlock = mapLines && mapLines.length > 0
    ? `Takeaway lines already on the map, along this node's ancestor path (oldest first):\n${mapLines.join('\n')}\n\nUse those lines ONLY to align terminology and avoid repeating them. Classify this exchange's epistemic move on its own merits, independent of the lines above.\n\n`
    : '';
  llmCall([
    { role: 'user', content: question },
    { role: 'assistant', content: response },
    { role: 'user', content: `${mapBlock}Write the TAKEAWAY of the above exchange as ONE short line, conclusion first. Hard length limit: at most 48 characters for CJK languages, at most 96 characters otherwise — the line must fit whole on a small map plaque, never truncated. A reader scanning a map of many such lines should see how the thinking progressed. Same language as the question. Classify the epistemic move and prefix the line with exactly one tag: INSIGHT (learned or confirmed something), RULEOUT (killed a hypothesis or option), DECISION (chose among options), PIVOT (reframed the question or direction), OPEN (raised a new unresolved question). Most exchanges are INSIGHT. Format: TAG: takeaway text. Output only that line.` },
  ]).then((raw) => {
    // "TAG: text" — unknown/missing tags degrade to the unmarked default
    const m = raw.trim().match(/^(INSIGHT|RULEOUT|DECISION|PIVOT|OPEN)[:：]\s*(.+)$/is);
    const type = m ? m[1].toLowerCase() : 'insight';
    const text = m ? m[2].trim() : raw.trim();
    // target the version this summary was computed FOR, not whichever
    // version the user has navigated to since
    setSummary(nodeId, text, response, type);
  }).catch(() => {});
}

/** The map lines a fresh takeaway should align with: the ancestor path's
    tagged takeaways (nearest 8), prefixed by the map's opening question. */
export function collectMapLines(nodeId: string, nodes: StoreState['nodes'], edges: StoreState['edges']): string[] {
  const { ordered } = walkUpAncestors(nodeId, nodes, edges);
  const TAG: Record<string, string> = { ruleout: 'RULEOUT', decision: 'DECISION', pivot: 'PIVOT', open: 'OPEN' };
  const lines = ordered
    .filter((n) => n.id !== nodeId)
    .map((n) => {
      const s = activeSummary(n.data);
      if (!s) return null;
      const type = n.data.summaryTypes?.[n.data.responseIndex];
      return `- ${type && TAG[type] ? `${TAG[type]}: ` : ''}${s}`;
    })
    .filter((l): l is string => !!l)
    .slice(-8);
  const root = ordered.find((n) => n.data.isRoot && n.id !== nodeId);
  if (root?.data.question) lines.unshift(`Opening question of the map: ${root.data.question.slice(0, 200)}`);
  return lines;
}

// Track active AbortControllers per node
export const activeAbortControllers = new Map<string, AbortController>();

// Auto-chain budget: how many times each autoRerun node has fired since the
// last MANUAL action. A fresh user action resets all counters, so budgets
// mean "auto rounds per user action" — and loops (writer->critic->writer)
// terminate deterministically when every node exhausts its rounds.
export const autoRunCounts = new Map<string, number>();

type Set = StoreApi<StoreState>['setState'];
type Get = StoreApi<StoreState>['getState'];

/**
 * The one streaming pipeline for filling a node's response:
 * register an AbortController (Stop button) → stream chunks into
 * `data.response` → on completion write response/versions/tokenCount and
 * collapse → pushHistory → kick off the background summary.
 * On abort or error, whatever streamed so far is kept.
 */
export async function runNodeGeneration(
  set: Set,
  get: Get,
  nodeId: string,
  opts: {
    question: string;
    messages: ContextMessage[];
    images?: ImageAttachment[];
    /** append = keep earlier responses as versions (evaluator critique history). */
    versionMode?: 'replace' | 'append';
    /** True when fired by the auto-refresh chain; manual generations reset all budgets. */
    autoChain?: boolean;
    /** Extra work after the final state write, before pushHistory (e.g. re-layout). */
    onSuccess?: (response: string) => void;
  },
): Promise<void> {
  // Read-only viewer: no generation whatsoever — belt-and-braces behind the
  // hidden UI (a missed button must still be inert).
  if (isViewerMode) return;
  const { question, images, onSuccess, versionMode = 'replace' } = opts;
  let { messages } = opts;
  if (!opts.autoChain) autoRunCounts.clear(); // a fresh user action starts a new wave
  const abortController = new AbortController();
  activeAbortControllers.set(nodeId, abortController);

  // A retry is starting — clear any previous failure flag and reasoning buffer
  set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === nodeId && (n.data.generationFailed || n.data.reasoning)
        ? { ...n, data: { ...n.data, generationFailed: undefined, reasoning: undefined } }
        : n
    ),
  }));

  let references: Reference[] | undefined;

  // Model provenance: pinned override, else the global pick, else the
  // server default (resolved lazily; the models list is cached from boot).
  const pinnedModel = get().nodes.find((n) => n.id === nodeId)?.data.model;
  let serverDefaultModel: string | null = null;
  void getModelsOnce().then((d) => { serverDefaultModel = d?.default ?? null; });

  const writeFinal = (response: string, failed = false) => {
    const tokenCount = countTokens(question + response);
    const modelUsed = pinnedModel ?? useUiStore.getState().selectedModel ?? serverDefaultModel ?? undefined;
    // Provenance: fingerprint what this answer depended on, AT completion —
    // the staleness pass compares this against the live upstream fingerprint.
    const contextHash = upstreamFingerprint(nodeId, get().nodes, get().edges);
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        // keep (response, generatedBy, reasoning, generatedAt, editedAt) tuples aligned through the empty-filter
        const kept = versionMode === 'append'
          ? n.data.responses.map((r, i) => ({ r, by: n.data.generatedBy?.[i], rs: n.data.reasonings?.[i], at: n.data.generatedAts?.[i], ed: n.data.editedAts?.[i] })).filter(({ r }) => r)
          : [];
        const now = new Date().toISOString();
        const responses = [...kept.map(({ r }) => r), response];
        const generatedBy = [...kept.map(({ by }) => by), modelUsed];
        const reasonings = [...kept.map(({ rs }) => rs), n.data.reasoning || undefined];
        const generatedAts = [...kept.map(({ at }) => at), now];
        const editedAts = [...kept.map(({ ed }) => ed), undefined];
        return { ...n, data: { ...n.data, response, responses, generatedBy, reasonings, generatedAts, editedAts, reasoning: undefined, responseIndex: responses.length - 1, isLoading: false, tokenCount, generationFailed: failed || undefined, references, highlights: pruneHighlights(n.data.highlights, response), lastContextHash: contextHash, lastGeneratedAt: now } };
      }),
    }));
  };

  // Ambient memory rides the system layer of ordinary generations only —
  // paradigm machine steps stay memory-free (experimental control), digests
  // must stay faithful to the material (no personalization), and
  // fingerprints never see this block (memory edits must not mark answers
  // stale; the block is assembled at generation time, after buildContext).
  const selfData = get().nodes.find((n) => n.id === nodeId)?.data;
  const memBlock = !selfData?.stepKind && !selfData?.digestOf ? memoryContextBlock() : null;
  if (memBlock) {
    const sysEnd = messages[0]?.role === 'system' ? 1 : 0;
    messages = [...messages.slice(0, sysEnd), memBlock, ...messages.slice(sysEnd)];
  }

  try {
    const response = await llmCallStream(messages, (_chunk, fullSoFar) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, response: fullSoFar } } : n
        ),
      }));
    }, abortController.signal, images, {
      onToolCall: (name, query) => {
        // Show what's being searched while the answer hasn't started streaming
        const icon = name === 'arxiv_search' ? '📚' : name === 'semantic_scholar' ? '🎓' : name.startsWith('mcp:') ? '🔧' : '🔍';
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId && !n.data.response
              ? { ...n, data: { ...n.data, response: `${icon} ${query}…` } }
              : n
          ),
        }));
      },
      onSources: (sources) => { references = sources; },
      onReasoning: (_chunk, fullSoFar) => {
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId ? { ...n, data: { ...n.data, reasoning: fullSoFar } } : n
          ),
        }));
      },
    }, (() => {
      // Search permissions live on the node (snapshotted at ask time);
      // legacy nodes without flags follow the current shared defaults
      const selfData = get().nodes.find((n) => n.id === nodeId)?.data;
      return {
        web: selfData?.webSearch ?? useUiStore.getState().webSearchEnabled,
        scholar: selfData?.scholarSearch ?? useUiStore.getState().scholarSearchEnabled,
        mcp: useUiStore.getState().mcpEnabled,
      };
    })(), get().nodes.find((n) => n.id === nodeId)?.data.model);
    activeAbortControllers.delete(nodeId);
    if (!response.trim()) {
      // The stream closed cleanly but the model sent nothing (upstream
      // hiccup, tool-only turn) — silent emptiness reads as a hang, so
      // surface it as a retryable failure instead.
      writeFinal(t('node.emptyResponse'), true);
      return;
    }
    writeFinal(response);
    onSuccess?.(response);
    get().pushHistory();
    generateSummary(nodeId, question, response, get().setSummary, collectMapLines(nodeId, get().nodes, get().edges));
    if (!selfData?.stepKind && !selfData?.digestOf) judgeMemory(question, response);
    triggerAutoReruns(set, get, nodeId);
    triggerParadigmCascade(get, nodeId);
  } catch (err) {
    activeAbortControllers.delete(nodeId);
    const partial = get().nodes.find((n) => n.id === nodeId)?.data.response || '';
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    if (isAbort) {
      // User pressed Stop — keep whatever streamed, no error surfacing
      writeFinal(partial || t('node.stoppedPlaceholder'));
    } else {
      // Real failure: details go to a toast, the node gets a Retry affordance
      const message = err instanceof Error ? err.message : t('toast.unknownError');
      toast('error', fmt(t('toast.generationFailed'), { message }));
      writeFinal(partial || t('node.failedPlaceholder'), true);
    }
    get().pushHistory();
  }
}

/**
 * Two generic primitives fire after any node finishes generating:
 *
 * 1. followsTip edges slide forward — an edge marked followsTip keeps
 *    pointing at the newest node of the thread it grew from, so whatever
 *    consumes it (a reviewer, a live summary) always sees the tip.
 * 2. autoRerun nodes regenerate — any node with autoRerun whose ancestor
 *    set (standard context walk, after edges slid) contains the completed
 *    node reruns itself in place. Chains of autoRerun nodes cascade
 *    naturally; the DAG has no cycles to worry about.
 */
/**
 * Paradigm cascade: an instantiated paradigm executes itself forward. When a
 * node completes, every STRUCTURAL child tagged stepKind 'prompt' that has
 * never produced a response starts automatically — but only once ALL of its
 * structural parents are complete (a human parent counts as complete when its
 * question is filled; failed parents block until retried). Human nodes are
 * never auto-run, so the run pauses wherever the paradigm put a person.
 * Each prompt node is filled at most once (only empty nodes fire) — no loops.
 * Ordinary canvases are untouched: nothing there carries stepKind 'prompt'.
 */
export function triggerParadigmCascade(get: Get, completedNodeId: string): void {
  if (useUiStore.getState().autoRefreshPaused) return; // same global brake
  const { nodes, edges } = get();
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const isComplete = (id: string): boolean => {
    const n = byId.get(id);
    if (!n || n.data.isLoading) return false;
    if (n.data.stepKind === 'human') return !!n.data.question.trim();
    // Content nodes: complete when they hold material. An EMPTY note/file/
    // link in a paradigm is a material slot — the cascade waits for the
    // human to fill it, same pause semantics as a human turn.
    if (n.data.stepKind === 'note' || n.data.stepKind === 'link') return !!n.data.question.trim();
    if (n.data.stepKind === 'file') return (n.data.attachments?.length ?? 0) > 0;
    return !!n.data.response && !n.data.generationFailed;
  };
  for (const edge of edges) {
    if (edge.source !== completedNodeId || edge.data?.isCrossLink) continue;
    const child = byId.get(edge.target);
    if (!child || child.data.stepKind !== 'prompt') continue;
    if (child.data.response || child.data.isLoading || child.data.generationFailed) continue;
    const parentIds = edges.filter((e) => e.target === child.id && !e.data?.isCrossLink).map((e) => e.source);
    if (!parentIds.every(isComplete)) continue; // fan-in: wait for all parents
    // rerunNode sets isLoading synchronously before awaiting, so a sibling
    // completion arriving next tick sees the child as busy — no double fire.
    void get().rerunNode(child.id, { auto: true });
  }
}

function triggerAutoReruns(set: Set, get: Get, completedNodeId: string): void {
  if (useUiStore.getState().autoRefreshPaused) return; // global kill switch
  // 1) slide followsTip edges whose source thread just grew: the completed
  //    node's STRUCTURAL ancestor chain reaching an edge's source means
  //    that edge's thread extended past its current anchor.
  const chain = new Set<string>([completedNodeId]);
  const queue = [completedNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of get().edges) {
      if (e.target === current && !e.data?.isCrossLink && !chain.has(e.source)) {
        chain.add(e.source);
        queue.push(e.source);
      }
    }
  }
  const needsSlide = get().edges.some(
    (e) => e.data?.followsTip && e.source !== completedNodeId && chain.has(e.source)
  );
  if (needsSlide) {
    set((state) => ({
      edges: state.edges.map((e) =>
        e.data?.followsTip && e.source !== completedNodeId && chain.has(e.source)
          ? { ...e, id: `watch-${completedNodeId}-${e.target}`, source: completedNodeId }
          : e
      ),
    }));
  }

  // 2) rerun any autoRerun node that (now) has the completed node upstream,
  //    within its per-wave budget (autoRerunRounds, default 1)
  const { nodes, edges } = get();
  for (const n of nodes) {
    const auto = n.data.autoRerun ?? n.data.evaluatorTrigger === 'auto'; // legacy graphs
    if (!auto || n.id === completedNodeId) continue;
    if (n.data.isLoading || activeAbortControllers.has(n.id)) continue;
    const spent = autoRunCounts.get(n.id) ?? 0;
    if (spent >= (n.data.autoRerunRounds ?? 1)) continue; // budget exhausted this wave
    const { ordered } = walkUpAncestors(n.id, nodes, edges);
    if (ordered.some((a) => a.id === completedNodeId)) {
      autoRunCounts.set(n.id, spent + 1);
      void get().rerunNode(n.id, { auto: true });
    }
  }
}
