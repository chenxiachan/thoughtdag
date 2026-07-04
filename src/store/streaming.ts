import type { StoreApi } from 'zustand';
import { llmCall, llmCallStream, type ContextMessage, type ImageAttachment } from '../lib/api';
import { countTokens } from '../utils';
import { toast } from '../lib/ui-store';
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
    /** Extra work after the final state write, before pushHistory (e.g. re-layout). */
    onSuccess?: (response: string) => void;
  },
): Promise<void> {
  const { question, messages, images, onSuccess } = opts;
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

  const writeFinal = (response: string, failed = false) => {
    const tokenCount = countTokens(question + response);
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId
          ? { ...n, data: { ...n.data, response, responses: [response], responseIndex: 0, isLoading: false, isCollapsed: true, tokenCount, generationFailed: failed || undefined } }
          : n
      ),
    }));
  };

  try {
    const response = await llmCallStream(messages, (_chunk, fullSoFar) => {
      set((state) => ({
        nodes: state.nodes.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, response: fullSoFar } } : n
        ),
      }));
    }, abortController.signal, images);
    activeAbortControllers.delete(nodeId);
    writeFinal(response);
    onSuccess?.(response);
    get().pushHistory();
    generateSummary(nodeId, question, response, get().setSummary);
  } catch (err) {
    activeAbortControllers.delete(nodeId);
    const partial = get().nodes.find((n) => n.id === nodeId)?.data.response || '';
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    if (isAbort) {
      // User pressed Stop — keep whatever streamed, no error surfacing
      writeFinal(partial || '(generation stopped)');
    } else {
      // Real failure: details go to a toast, the node gets a Retry affordance
      const message = err instanceof Error ? err.message : 'Unknown error';
      toast('error', `Generation failed: ${message}`);
      writeFinal(partial || '_Generation failed._', true);
    }
    get().pushHistory();
  }
}
