import { useCallback, useRef, useState } from 'react';
import type { ThoughtNode } from '../types';

// @-mentions: the keyboard's way of drawing a wire. Typing @ in an ask box
// opens a node picker; picking attaches a chip (resolved by node id, never
// by parsing the text back) and leaves a readable @「title」 marker in the
// question. On submit, mentions that aren't already in the new node's
// context get a REAL dashed reference edge — the graph stays honest, the
// hands stay on the keyboard. Mentions already upstream become precise
// designators ("that turn about X") with nothing double-injected.

export interface Mention { nodeId: string; title: string }

export function nodeMentionTitle(n: ThoughtNode): string {
  return n.data.question.replace(/\s+/g, ' ').trim().slice(0, 40) || '—';
}

/** Shared mention state for one ask box. */
export function useMentions(selfNodeId?: string) {
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [query, setQuery] = useState<string | null>(null); // null = picker closed
  const anchorRef = useRef<HTMLTextAreaElement | null>(null);
  // The picker's keyboard handler, registered by MentionSurface — the host
  // textarea invokes it first and stops if it consumed the key.
  const keyHandlerRef = useRef<(e: React.KeyboardEvent) => boolean>(() => false);

  const bindAnchor = useCallback((el: HTMLTextAreaElement | null) => { anchorRef.current = el; }, []);
  const setKeyHandler = useCallback((fn: (e: React.KeyboardEvent) => boolean) => { keyHandlerRef.current = fn; }, []);
  const invokeKey = useCallback((e: React.KeyboardEvent) => keyHandlerRef.current(e), []);

  /** Call from onChange with the fresh text — tracks the trailing @query
      under the caret to drive the picker. */
  const track = useCallback((text: string, caret: number) => {
    const before = text.slice(0, caret);
    const m = before.match(/@([^@\s「」]{0,30})$/);
    setQuery(m ? m[1] : null);
  }, []);

  const close = useCallback(() => setQuery(null), []);
  const remove = useCallback((nodeId: string) => {
    setMentions((prev) => prev.filter((x) => x.nodeId !== nodeId));
  }, []);
  const clear = useCallback(() => { setMentions([]); setQuery(null); }, []);

  /** Replace the trailing @query with the readable marker and attach the chip. */
  const pick = useCallback((node: ThoughtNode, text: string, setText: (v: string) => void) => {
    const title = nodeMentionTitle(node);
    const el = anchorRef.current;
    const caret = el ? el.selectionStart : text.length;
    const before = text.slice(0, caret).replace(/@([^@\s「」]{0,30})$/, `@「${title}」`);
    setText(before + text.slice(caret));
    setMentions((prev) => (prev.some((x) => x.nodeId === node.id) ? prev : [...prev, { nodeId: node.id, title }]));
    setQuery(null);
    setTimeout(() => el?.focus(), 0);
  }, []);

  return { mentions, query, track, close, remove, clear, pick, bindAnchor, setKeyHandler, invokeKey, selfNodeId };
}

export type MentionState = ReturnType<typeof useMentions>;
