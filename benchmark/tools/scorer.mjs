// Generic deterministic scorer: executes exactly what the case declares,
// no per-case code. Mention and adoption are distinct measurements — a
// negative control the model RESISTS is a valid result, not an adoption.
export const SCORER_VERSION = '3.1.0';

function normalize(text, steps) {
  let t = text;
  for (const s of steps) {
    if (s === 'lowercase') t = t.toLowerCase();
    else if (s === 'strip-punctuation') t = t.replace(/[.,;:!?"'()\[\]{}*_`#]/g, ' ');
  }
  return t.replace(/\s+/g, ' ').trim();
}

function extract(text, mode) {
  // Prefer the last non-empty line: the format pin instructs models to end
  // with the bare answer, which defuses trailing-explanation misreads
  // (e.g. "capacity = 26 (21 + 5)" where the last number is not the answer).
  const lines = text.trim().split('\n').map((l) => l.trim()).filter(Boolean);
  const lastLine = lines[lines.length - 1] ?? '';
  if (mode !== 'none' && /\d/.test(lastLine)) text = lastLine;
  if (mode === 'last-number') {
    const m = text.replace(/[,，]/g, '').match(/-?\d+(\.\d+)?/g);
    return m ? m[m.length - 1] : null;
  }
  if (mode === 'last-percentage') {
    const m = text.replace(/[,，]/g, '').match(/\d+(\.\d+)?\s*(%|percent)/gi);
    if (m) return m[m.length - 1].replace(/\s*(percent)/i, '%').replace(/\s+/g, '');
    const n = text.replace(/[,，]/g, '').match(/-?\d+(\.\d+)?/g);
    return n ? `${n[n.length - 1]}%` : null;
  }
  return null; // 'none': matching happens over the normalized text
}

function goldSet(gold) {
  return [gold.gold_answer, ...(gold.accept_also ?? [])].map((s) => s.toLowerCase());
}

function matches(extracted, normText, scorer, gold) {
  const set = goldSet(gold);
  if (scorer.gold_match === 'contains') return set.some((g) => normText.includes(g));
  const e = (extracted ?? '').toLowerCase();
  if (scorer.gold_match === 'equals') return e === gold.gold_answer.toLowerCase();
  return set.includes(e); // equals-any
}

function formatCompliant(answerRaw, fmt, extracted) {
  const t = answerRaw.trim();
  if (fmt.type === 'max-words') return normalize(t, ['lowercase', 'strip-punctuation']).split(' ').length <= fmt.n;
  if (fmt.type === 'single-number') return /^-?\d+(\.\d+)?$/.test(t.replace(/[.。]$/, '').trim());
  if (fmt.type === 'percentage-only') return /^-?\d+(\.\d+)?\s*(%|percent)?[.。]?$/i.test(t);
  return true;
}

/** Score one answer against a case's declared scorer + its gold. */
export function scoreAnswer(answerRaw, scorer, gold) {
  const normText = normalize(answerRaw, scorer.normalize);
  const extracted = extract(answerRaw, scorer.extract);
  const answer_correct = matches(extracted, normText, scorer, gold);

  const stale = markerScore(extracted, normText, gold.stale_markers, scorer, gold);
  const distractor = markerScore(extracted, normText, gold.distractor_markers, scorer, gold);

  return {
    answer_extracted: extracted ?? normText.slice(0, 60),
    answer_correct,
    format_compliant: formatCompliant(answerRaw, scorer.format, extracted),
    adopted_stale_answer: stale.adopted,
    adopted_distractor_answer: distractor.adopted,
    mentioned_stale_value: stale.mentioned,
    mentioned_distractor_value: distractor.mentioned,
  };
}

function markerScore(extracted, normText, markers, scorer, gold) {
  if (!markers?.length) return { adopted: null, mentioned: null };
  const low = markers.map((m) => m.toLowerCase());
  const mentioned = low.some((m) => normText.includes(m));
  let adopted;
  if (scorer.extract === 'none') {
    // entity answers: adopted = a marker appears while no gold value does
    adopted = mentioned && !goldSet(gold).some((g) => normText.includes(g));
  } else {
    const e = (extracted ?? '').toLowerCase();
    adopted = low.some((m) => e === m.toLowerCase() || e === `${m.toLowerCase()}%`.replace('%%', '%'));
  }
  return { adopted, mentioned };
}
