// Result + story canvases. Result canvas = input graph with the model's
// answers written in (final answer; recompute intermediates from the trace).
// Story canvas = every condition side by side, each in a labeled frame with
// its verdict, so one canvas tells the whole intervention story.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { loadCase, applyOps, wireRecompute, toProductGraph, canvasFile, LAYOUTS, CASES, B } from './lib.mjs';

const RUN_ID = process.argv[2] ?? 'gate-v2-glm45flash-2026-08-16';
mkdirSync(`${B}/canvases/results`, { recursive: true });

const FRAME_W = 900, FRAME_GAP = 140;

// Narrative panel order + titles: the story reads left to right as ONE
// experiment. Node deletion cannot be shown inside a single mutating graph,
// so ordered verdict-labeled panels are the honest form (DESIGN.md v3).
const NARRATIVES = {
  repair: [
    ['clean', 'How it should go'],
    ['polluted', 'The pollution lands'],
    ['source_prune', 'Cut the source only'],
    ['subgraph_prune', 'Cut the whole subgraph'],
    ['recompute_descendants', 'Cut and recompute'],
  ],
  'branch-merge': [
    ['selected_merge', 'The chosen merge'],
    ['linear_all', 'Everything wired in'],
    ['linear_all_padded', 'Same length, clean content'],
    ['wrong_merge_irrelevant', 'Wrong merge: distractor'],
    ['wrong_merge_conflict', 'Wrong merge: conflict'],
    ['single_branch', 'One branch only'],
  ],
  condense: [
    ['raw_full', 'The whole log'],
    ['dropped_detours', 'Detours dropped'],
    ['fixed_condense', 'Condensed, nothing lost'],
    ['lossy_condense', 'Condensed, one fact lost'],
  ],
};

for (const [track, name] of CASES) {
  const { c } = loadCase(track, name);
  const results = JSON.parse(readFileSync(`${B}/runs/${RUN_ID}/results.json`, 'utf8'))
    .filter((r) => r.case_id === c.id);
  const storyNodes = [], storyEdges = [];
  let fx = 0;
  const order = NARRATIVES[track] ?? Object.keys(c.conditions).map((k) => [k, k]);

  for (const [cond, storyTitle] of order) {
    const spec = c.conditions[cond];
    if (!spec) continue;
    const trace = JSON.parse(readFileSync(`${B}/runs/${RUN_ID}/traces/${c.id}.${cond}.trace.json`, 'utf8'));
    const result = results.find((r) => r.condition === cond);

    let g = applyOps(c.graph, spec.graph_ops);
    if (spec.recompute_nodes?.length) {
      g = wireRecompute(g, spec.recompute_nodes, c.graph.nodes);
      for (const step of trace.steps.filter((s) => s.kind === 'recompute')) {
        const gn = g.nodes.find((n) => n.id === step.node);
        if (gn) gn.content.answer = step.raw_response.choices[0].message.content ?? '';
      }
    }
    const fin = g.nodes.find((n) => n.id === 'final');
    if (fin) fin.content.answer = result.answer_raw;

    // ── per-condition result canvas ──
    const { nodes, edges } = toProductGraph(g, LAYOUTS[c.id]);
    writeFileSync(`${B}/canvases/results/${c.id}.${cond}.thoughtdag.json`,
      JSON.stringify(canvasFile(`${c.id} · ${cond} · ${result.answer_correct ? '✓' : '✗'}`, nodes, edges), null, 2));

    // ── slice into the story canvas, offset into its own frame ──
    const maxY = Math.max(...nodes.map((n) => n.position.y)) + 480;
    storyNodes.push({
      id: `frame-${cond}`, type: 'thought',
      position: { x: fx - 60, y: -140 }, width: FRAME_W, height: maxY + 300,
      data: {
        question: `${storyTitle} · ${result.answer_correct ? '✓' : '✗'} ${String(result.answer_extracted).slice(0, 20)}`,
        response: '', responses: [''], responseIndex: 0,
        isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
        tokenCount: 0, highlights: [], highlightMode: 'off',
        attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
        roleMode: 'inherit', isRoot: false, isBranch: false,
        stepKind: 'frame', frameColor: result.answer_correct ? 'green' : 'red', frameCarry: false,
      },
    });
    for (const n of nodes) {
      const sx = n.position.x * 0.42; // compress the wide layouts into the frame
      storyNodes.push({ ...n, id: `${cond}--${n.id}`, position: { x: fx + sx, y: n.position.y } });
    }
    for (const e of edges) {
      storyEdges.push({ ...e, id: `${cond}--${e.id}`, source: `${cond}--${e.source}`, target: `${cond}--${e.target}` });
    }
    fx += FRAME_W + FRAME_GAP;
  }
  writeFileSync(`${B}/canvases/results/${c.id}.story.thoughtdag.json`,
    JSON.stringify(canvasFile(`${c.id} · story`, storyNodes, storyEdges), null, 2));
  console.log(`${c.id}: ${Object.keys(c.conditions).length} result canvases + story canvas`);
}
console.log('canvases complete');
