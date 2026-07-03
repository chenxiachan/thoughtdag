import { llmCall } from '../lib/api';

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
