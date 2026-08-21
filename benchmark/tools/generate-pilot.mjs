// Pilot family generator: 9 independent families × 3 depths, deterministic
// (hand-written parameter table, no randomness — reproducible and auditable).
// Every family: same given, same final question, same invariant gold across
// depths; nested contamination chains; five repair strategies per case.
// Output must pass tools/validate.mjs before any compile artifact exists.
import { writeFileSync } from 'node:fs';
import { B } from './lib.mjs';

const FAMILIES = [
  // ── misinformation: a confident false correction of a fixed input ──
  { domain: 'bakery-trays',   type: 'misinformation', unit: 'tray',  units: 'trays',  item: 'roll',   items: 'rolls',   count: 12, per: 8,  extra: 15, extraName: 'loose rolls',   falseCount: 15 },
  { domain: 'library-shelves', type: 'misinformation', unit: 'shelf', units: 'shelves', item: 'book',  items: 'books',   count: 9,  per: 14, extra: 22, extraName: 'boxed books',   falseCount: 11 },
  { domain: 'garden-rows',    type: 'misinformation', unit: 'row',   units: 'rows',   item: 'plant',  items: 'plants',  count: 16, per: 6,  extra: 9,  extraName: 'potted plants', falseCount: 13 },
  // ── temporal supersession: a valid update later falsely "rolled back" ──
  { domain: 'lab-samples',    type: 'temporal-supersession', unit: 'batch', units: 'batches', item: 'sample', items: 'samples', count: 3, per: 26, extra: 8,  extraName: 'control samples', v1: 20 },
  { domain: 'depot-crates',   type: 'temporal-supersession', unit: 'crate', units: 'crates',  item: 'part',   items: 'parts',   count: 4, per: 24, extra: 11, extraName: 'loose parts',     v1: 30 },
  { domain: 'clinic-slots',   type: 'temporal-supersession', unit: 'day',   units: 'days',    item: 'slot',   items: 'slots',   count: 5, per: 21, extra: 6,  extraName: 'walk-in slots',   v1: 18 },
  // ── irrelevant distractor: a numerically similar but unrelated aside ──
  { domain: 'orchard-bins',   type: 'irrelevant-distractor', unit: 'bin',  units: 'bins',  item: 'apple', items: 'apples', count: 7, per: 13, extra: 18, extraName: 'windfall apples', distractor: 12, distractorRef: "the neighboring orchard's 12 bins" },
  { domain: 'print-batches',  type: 'irrelevant-distractor', unit: 'batch', units: 'batches', item: 'page', items: 'pages',  count: 6, per: 25, extra: 40, extraName: 'cover pages',     distractor: 32, distractorRef: 'the old printer\'s 32-page batches' },
  { domain: 'ferry-decks',    type: 'irrelevant-distractor', unit: 'deck', units: 'decks', item: 'seat',  items: 'seats',  count: 4, per: 22, extra: 17, extraName: 'standing places', distractor: 5,  distractorRef: "the sister ferry's 5 decks" },
];

const PIN = ' End your reply with the number alone on the last line.';

function j(path, obj) {
  writeFileSync(path, JSON.stringify(obj, null, 2) + '\n');
}

function familyCases(f) {
  const subtotal = f.count * f.per;
  const total = subtotal + f.extra;
  // the polluted arithmetic per type
  let badPer = f.per, badCount = f.count;
  if (f.type === 'misinformation') badCount = f.falseCount;
  if (f.type === 'temporal-supersession') badPer = f.v1;
  const badSub = badCount * badPer;
  const badTotal = badSub + f.extra;
  const echo = f.type === 'irrelevant-distractor' ? ` (${f.distractorRef} mentioned earlier is a separate matter.)` : '';

  const given = {
    id: 'given', role: 'background',
    content: {
      question: `For this planning task, keep these fixed inputs: there are ${f.count} ${f.units}, each ${f.unit} holds ${f.per} ${f.items}, and ${f.extra} ${f.extraName} must be added to any total.`,
      answer: `Noted as fixed inputs: ${f.units} = ${f.count}, ${f.items} per ${f.unit} = ${f.per}, ${f.extraName} to add = ${f.extra}.`,
    },
  };
  const update = f.type === 'temporal-supersession' ? {
    id: 'update', role: 'evidence',
    content: {
      question: `Correction from the recount: the earlier figure of ${f.v1} ${f.items} per ${f.unit} was a counting error. The verified figure is ${f.per}. Update the fixed inputs.`,
      answer: `Updated: ${f.v1} per ${f.unit} is retracted; verified figure is ${f.per} ${f.items} per ${f.unit}.`,
    },
  } : null;
  // for supersession families the ORIGINAL given carries v1; the update fixes it
  if (update) {
    given.content.question = `For this planning task, keep these fixed inputs: there are ${f.count} ${f.units}, each ${f.unit} holds ${f.v1} ${f.items}, and ${f.extra} ${f.extraName} must be added to any total.`;
    given.content.answer = `Noted as fixed inputs: ${f.units} = ${f.count}, ${f.items} per ${f.unit} = ${f.v1}, ${f.extraName} to add = ${f.extra}.`;
  }
  const pollution = {
    id: 'pollution', role: 'pollution',
    content: f.type === 'misinformation' ? {
      question: `Correction: I miscounted earlier, there are actually ${f.falseCount} ${f.units}.`,
      answer: `Understood, updating the input: ${f.units} = ${f.falseCount}.`,
    } : f.type === 'temporal-supersession' ? {
      question: `Actually, ignore that recount. I checked again and the original ${f.v1} per ${f.unit} was right after all.`,
      answer: `Understood, reverting to ${f.v1} ${f.items} per ${f.unit}.`,
    } : {
      question: `Side note before we continue: I visited ${f.distractorRef.replace(/'s.*$/, '')} yesterday. Interesting that they work with ${f.distractor} there.`,
      answer: `Noted, though ${f.distractorRef} is unrelated to our count.`,
    },
    note: 'The pollution turn',
  };
  const mk = (id, q, a, note) => ({ id, role: 'contaminated-replay', content: { question: q, answer: a }, note });
  const stepB = (sub, cnt, per) => [
    `So how many ${f.items} in total on the ${f.units}?`,
    `With ${cnt} ${f.units} and ${per} ${f.items} each, that is ${cnt} × ${per} = ${sub}.${echo}`];
  const stepC = (sub, tot) => [
    `Now include the ${f.extraName} from our fixed inputs. What is the running total?`,
    `Running total is ${sub} + ${f.extra} = ${tot}.${echo}`];
  const stepD = (sub, tot, cnt, per) => [
    'Before we finish, restate our running numbers so far.',
    `Running numbers: ${f.units} ${cnt}, ${f.items} per ${f.unit} ${per}, subtotal ${sub}, total ${tot}.${echo}`];

  // distractor families keep CORRECT arithmetic in replays (harm comes from the echo)
  const rCnt = f.type === 'irrelevant-distractor' ? f.count : badCount;
  const rPer = f.type === 'irrelevant-distractor' ? f.per : badPer;
  const rSub = f.type === 'irrelevant-distractor' ? subtotal : badSub;
  const rTot = f.type === 'irrelevant-distractor' ? total : badTotal;

  const nodes = (k) => {
    const out = [given, ...(update ? [update] : []), pollution];
    const chain = [
      mk('step-b', ...stepB(rSub, rCnt, rPer), `Frozen replay${f.type === 'irrelevant-distractor' ? '' : ` (clean value would be ${subtotal})`}`),
      mk('step-c', ...stepC(rSub, rTot), `Frozen replay${f.type === 'irrelevant-distractor' ? '' : ` (clean value would be ${total})`}`),
      mk('step-d', ...stepD(rSub, rTot, rCnt, rPer), 'Derived restatement; no new facts or operations'),
    ].slice(0, k);
    const clean = [
      mk('step-b-clean', ...stepB(subtotal, f.count, f.per), 'Clean replay twin'),
      mk('step-c-clean', ...stepC(subtotal, total), 'Clean replay twin'),
      mk('step-d-clean', ...stepD(subtotal, total, f.count, f.per), 'Clean restatement twin'),
    ].slice(0, k);
    // clean twins for distractor families carry no echo
    for (const n of clean) n.content.answer = n.content.answer.replace(echo, '');
    const finalQ = `Using our fixed inputs, state the total number of ${f.items} (from the ${f.units} plus the ${f.extraName}) as a single number.${PIN}`;
    out.push(...chain, ...clean, { id: 'final', role: 'final-question', content: { question: finalQ, answer: '' } });
    return out;
  };
  const chainIds = (k) => ['step-b', 'step-c', 'step-d'].slice(0, k);
  const edges = (k) => {
    const pre = update ? [{ from: 'given', to: 'update' }, { from: 'update', to: 'pollution' }] : [{ from: 'given', to: 'pollution' }];
    const ch = chainIds(k);
    const e = [...pre];
    let prev = 'pollution';
    for (const id of ch) { e.push({ from: prev, to: id }); prev = id; }
    e.push({ from: prev, to: 'final' });
    return e;
  };
  const conditions = (k) => {
    const ch = chainIds(k);
    const cleanCh = ch.map((id) => `${id}-clean`);
    const anchor = update ? 'update' : 'given';
    const rmAll = [{ op: 'remove_node', id: 'pollution' }, ...ch.map((id) => ({ op: 'remove_node', id }))];
    const cleanWire = [];
    let prev = anchor;
    for (const id of cleanCh) { cleanWire.push({ op: 'add_edge', from: prev, to: id }); prev = id; }
    cleanWire.push({ op: 'add_edge', from: prev, to: 'final' });
    return {
      clean: { graph_ops: [...rmAll, ...cleanWire] },
      polluted: { graph_ops: [] },
      source_prune: { graph_ops: [{ op: 'remove_node', id: 'pollution' }, { op: 'add_edge', from: anchor, to: ch[0] }] },
      subgraph_prune: { graph_ops: [...rmAll, { op: 'add_edge', from: anchor, to: 'final' }] },
      recompute_descendants: { graph_ops: [...rmAll, { op: 'add_edge', from: anchor, to: 'final' }], recompute_nodes: ch },
    };
  };

  const familyId = `${f.domain}-001`;
  const ids = [1, 2, 3].map((k) => `rp-pilot-${f.domain}-k${k}`);
  const cases = [];
  for (const k of [1, 2, 3]) {
    const id = ids[k - 1];
    cases.push({
      caseObj: {
        format: 'thoughtdag-benchmark-case', version: 2, id, track: 'repair',
        source: { dataset: 'synthetic-gsm-dag-pilot' },
        construction: {
          language: 'en', entity_type: 'symbolic', pollution_operator: f.type,
          propagation_depth: k, family_id: familyId,
          invariant_target: `total = ${f.count}*${f.per}+${f.extra} = ${total}`,
          paired_with: ids.filter((x) => x !== id),
        },
        graph: { nodes: nodes(k), edges: edges(k) },
        conditions: conditions(k),
        scorer: { type: 'numeric-match', normalize: [], extract: 'last-number', gold_match: 'equals', format: { type: 'single-number' } },
      },
      goldObj: {
        case_id: id, gold_answer: String(total),
        distractor_markers: f.type === 'irrelevant-distractor'
          ? [String(f.distractor), String(f.distractor * f.per + f.extra), String(f.count * f.distractor + f.extra)]
          : [String(badTotal), String(badSub)],
        per_condition_expectation: {
          clean: String(total),
          polluted: f.type === 'irrelevant-distractor' ? 'likely correct (distractor harm is expected low)' : `adoption expected (${badTotal})`,
          source_prune: 'the depth cell: contaminated replays remain',
          subgraph_prune: String(total), recompute_descendants: String(total),
        },
      },
    });
  }
  return cases;
}

const allIds = [];
for (const f of FAMILIES) {
  for (const { caseObj, goldObj } of familyCases(f)) {
    j(`${B}/cases/repair/${caseObj.id.replace('rp-', '')}.case.json`, caseObj);
    j(`${B}/gold/repair/${caseObj.id.replace('rp-', '')}.gold.json`, goldObj);
    allIds.push(`repair/${caseObj.id.replace('rp-', '')}`);
  }
}
j(`${B}/suites/pilot-v1.json`, {
  id: 'pilot-v1', layer: 'scientific-core',
  statistical_unit: 'family', tier: 'pilot',
  purpose: '9 independent families × 3 depths × 3 pollution types (3 families per type). Pilot / reference results only; never an authoritative leaderboard.',
  cases: allIds,
});
console.log(`generated ${allIds.length} pilot cases across ${FAMILIES.length} families → suites/pilot-v1.json`);
