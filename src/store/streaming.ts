import type { StoreApi } from 'zustand';
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
      onToolCall: (_name, query) => {
        // Show what's being searched while the answer hasn't started streaming
        set((state) => ({
          nodes: state.nodes.map((n) =>
            n.id === nodeId && !n.data.response
              ? { ...n, data: { ...n.data, response: `🔍 ${query}…` } }
              : n
          ),
        }));
      },
      onSources: (sources) => { references = sources; },
    }, useUiStore.getState().webSearchEnabled);
    activeAbortControllers.delete(nodeId);
    writeFinal(response);
    onSuccess?.(response);
    get().pushHistory();
    generateSummary(nodeId, question, response, get().setSummary);
    triggerWatchers(get, nodeId);
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
 * After a node finishes generating, wake any auto-mode evaluators watching
 * it or one of its STRUCTURAL ancestors. Watch edges are cross-links, so
 * this walk can't loop back through an evaluator; an evaluator finishing
 * its own critique has no structural ancestors and cascades no further
 * (unless it is itself watched — multi-level review is allowed).
 */
function triggerWatchers(get: Get, completedNodeId: string): void {
  const { nodes, edges } = get();

  // Structural ancestors of the completed node, including itself
  const chain = new Set<string>([completedNodeId]);
  const queue = [completedNodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const e of edges) {
      if (e.target === current && !e.data?.isCrossLink && !chain.has(e.source)) {
        chain.add(e.source);
        queue.push(e.source);
      }
    }
  }

  const woken = new Set<string>();
  for (const e of edges) {
    if (!e.data?.isWatch || !chain.has(e.source) || woken.has(e.target)) continue;
    const evaluator = nodes.find((n) => n.id === e.target);
    if (!evaluator?.data.isEvaluator) continue;
    if (evaluator.data.evaluatorTrigger !== 'auto') continue;
    if (evaluator.data.isLoading || activeAbortControllers.has(evaluator.id)) continue;
    woken.add(evaluator.id);
    void get().evaluateNow(evaluator.id);
  }
}
