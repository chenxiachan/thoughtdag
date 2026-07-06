import type { StoreApi } from 'zustand';
import { walkUpAncestors } from '../lib/graph';
import { llmCall, llmCallStream, type ContextMessage, type ImageAttachment } from '../lib/api';
import { countTokens } from '../utils';
import { toast, useUiStore } from '../lib/ui-store';
import { t, fmt } from '../i18n';
import type { Reference } from '../types';
import type { StoreState } from './types';

// Background summary generation — fire and forget
export function generateSummary(nodeId: string, question: string, response: string, setSummary: (id: string, summary: string) => void) {
  llmCall([
    { role: 'user', content: question },
    { role: 'assistant', content: response },
    { role: 'user', content: 'Summarize the above Q&A in 1-2 sentences, around 80-110 characters. Use the same language as the question. Output only the summary text, no ellipsis, no quotes, no prefix.' },
  ]).then((summary) => {
    setSummary(nodeId, summary);
  }).catch(() => {});
}

// Track active AbortControllers per node
export const activeAbortControllers = new Map<string, AbortController>();

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
    /** Extra work after the final state write, before pushHistory (e.g. re-layout). */
    onSuccess?: (response: string) => void;
  },
): Promise<void> {
  const { question, messages, images, onSuccess, versionMode = 'replace' } = opts;
  const abortController = new AbortController();
  activeAbortControllers.set(nodeId, abortController);

  // A retry is starting — clear any previous failure flag
  set((state) => ({
    nodes: state.nodes.map((n) =>
      n.id === nodeId && n.data.generationFailed
        ? { ...n, data: { ...n.data, generationFailed: undefined } }
        : n
    ),
  }));

  let references: Reference[] | undefined;

  const writeFinal = (response: string, failed = false) => {
    const tokenCount = countTokens(question + response);
    set((state) => ({
      nodes: state.nodes.map((n) => {
        if (n.id !== nodeId) return n;
        const responses = versionMode === 'append'
          ? [...n.data.responses.filter((r) => r), response]
          : [response];
        return { ...n, data: { ...n.data, response, responses, responseIndex: responses.length - 1, isLoading: false, isCollapsed: true, tokenCount, generationFailed: failed || undefined, references } };
      }),
    }));
  };

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
    }, {
      web: useUiStore.getState().webSearchEnabled,
      scholar: useUiStore.getState().scholarSearchEnabled,
      mcp: useUiStore.getState().mcpEnabled,
    }, get().nodes.find((n) => n.id === nodeId)?.data.model);
    activeAbortControllers.delete(nodeId);
    writeFinal(response);
    onSuccess?.(response);
    get().pushHistory();
    generateSummary(nodeId, question, response, get().setSummary);
    triggerAutoReruns(set, get, nodeId);
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
function triggerAutoReruns(set: Set, get: Get, completedNodeId: string): void {
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

  // 2) rerun any autoRerun node that (now) has the completed node upstream
  const { nodes, edges } = get();
  for (const n of nodes) {
    const auto = n.data.autoRerun ?? n.data.evaluatorTrigger === 'auto'; // legacy graphs
    if (!auto || n.id === completedNodeId) continue;
    if (n.data.isLoading || activeAbortControllers.has(n.id)) continue;
    const { ordered } = walkUpAncestors(n.id, nodes, edges);
    if (ordered.some((a) => a.id === completedNodeId)) {
      void get().rerunNode(n.id);
    }
  }
}
