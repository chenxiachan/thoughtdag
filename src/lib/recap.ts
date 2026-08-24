import { useStore } from '../store';
import { toast } from './ui-store';
import { t as ti } from '../i18n';
import { llmCall } from './api';
import { spawnContentNode } from './content';
import { formatStamp } from '../utils';

// The camera lives outside the ReactFlow tree so any caller (bottom dock,
// node context menu) can nudge the viewport; App registers it in onInit.
export const recapCamera: {
  current: { setCenter: (x: number, y: number, o?: object) => void } | null;
} = { current: null };

// Recap as a sticky note: one model call describing what the user was doing
// and what comes next. The note lands UNWIRED near the target node, in the
// first spot that collides with nothing, and the camera nudges over so it
// is actually seen. By the One Rule it never enters context unless wired.
function findFreeSpot(near: { x: number; y: number }): { x: number; y: number } {
  const st = useStore.getState();
  const W = 480, H = 380; // conservative node footprint
  const candidates = [
    { x: near.x + 580, y: near.y }, { x: near.x + 580, y: near.y - 300 },
    { x: near.x + 580, y: near.y + 300 }, { x: near.x - 420, y: near.y },
    { x: near.x, y: near.y - 420 }, { x: near.x, y: near.y + 460 },
    { x: near.x + 900, y: near.y }, { x: near.x + 580, y: near.y + 620 },
  ];
  for (const c of candidates) {
    const clash = st.nodes.some((o) =>
      Math.abs((o.position.x + 260) - (c.x + 140)) < W && Math.abs((o.position.y + 150) - (c.y + 120)) < H);
    if (!clash) return c;
  }
  return { x: near.x + 940, y: near.y + 620 };
}

export async function recapToNote(nodeId: string): Promise<void> {
  const st = useStore.getState();
  const n = st.nodes.find((x) => x.id === nodeId);
  if (!n) return;
  toast('info', ti('continue.generating'));
  try {
    // chain context: the node itself plus up to four upstream takeaways,
    // so "what you were doing" has history and "what comes next" has leaves
    const parents = new Map<string, string[]>();
    for (const e of st.edges.filter((x) => !x.data?.isCrossLink)) {
      parents.set(e.target, [...(parents.get(e.target) ?? []), e.source]);
    }
    const trail: string[] = [];
    let cur: string | undefined = nodeId;
    for (let i = 0; i < 4 && cur; i++) {
      cur = parents.get(cur)?.[0];
      const p = cur ? st.nodes.find((x) => x.id === cur) : undefined;
      const sum = p?.data.summaries?.[p.data.responseIndex] ?? p?.data.question;
      if (sum) trail.unshift(`- ${String(sum).slice(0, 120)}`);
    }
    const sources = new Set(st.edges.filter((e) => !e.data?.isCrossLink).map((e) => e.source));
    const open = st.nodes
      .filter((x) => !sources.has(x.id) && x.data.summaryTypes?.[x.data.responseIndex] === 'open')
      .map((x) => `- ${String(x.data.summaries?.[x.data.responseIndex] ?? x.data.question).slice(0, 120)}`);
    const text = await llmCall([{
      role: 'user',
      content: `${ti('continue.genPrompt')}\n\n${ti('continue.genTrail')}\n${trail.join('\n') || '-'}\n\n[Q] ${n.data.question}\n[A] ${String(n.data.response).slice(0, 2000)}\n\n${ti('continue.genOpen')}\n${open.join('\n') || '-'}`,
    }]);
    const day = formatStamp(new Date().toISOString()).slice(0, 10);
    const spot = findFreeSpot(n.position);
    spawnContentNode('note', spot, {
      question: `**📌 ${day} · ${ti('continue.recapTag')}**\n\n${text.trim()}`,
    });
    recapCamera.current?.setCenter(
      (n.position.x + spot.x) / 2 + 260, (n.position.y + spot.y) / 2 + 140,
      { zoom: 0.75, duration: 600 },
    );
    toast('success', ti('continue.noteDropped'));
  } catch (err) {
    toast('error', err instanceof Error ? err.message : String(err));
  }
}
