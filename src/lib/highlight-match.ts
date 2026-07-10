// Highlights are captured from the RENDERED answer but must be located in
// the markdown SOURCE: a literal string match breaks the moment a selection
// crosses **bold**, `code`, a list marker or a soft line break — the mark
// then silently never renders. The fuzzy pattern below tolerates markdown
// punctuation between characters and normalizes whitespace runs, and is the
// single matcher shared by the response renderer (<mark>), the context
// builder ([Important] tags) and stale-highlight pruning — so "does this
// highlight still exist" always means the same thing everywhere.
const MD_NOISE = '[*_`~()#>\\[\\]-]*';

export function fuzzyHighlightRegex(text: string): RegExp | null {
  const chars = [...text.trim()];
  if (chars.length === 0) return null;
  const parts: string[] = [];
  let pendingWs = false;
  for (const ch of chars) {
    if (/\s/.test(ch)) { pendingWs = true; continue; }
    const escaped = ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (parts.length === 0) parts.push(escaped);
    else if (pendingWs) parts.push(`${MD_NOISE}\\s+${MD_NOISE}${escaped}`);
    else parts.push(`${MD_NOISE}${escaped}`);
    pendingWs = false;
  }
  try {
    // Leading/trailing noise is swallowed into the match, so a wrapper
    // (<mark>, [Important]) encloses the WHOLE **bold** span instead of
    // splitting its delimiters apart.
    return new RegExp(MD_NOISE + parts.join('') + MD_NOISE, 'g');
  } catch {
    return null;
  }
}

export function highlightFoundIn(haystack: string, text: string): boolean {
  const re = fuzzyHighlightRegex(text);
  return re ? re.test(haystack) : false;
}

/** Drop highlights that no longer appear in the (new) response text —
    called whenever a node's displayed answer changes (generation, version
    switch, manual edit), so ghost highlights never outlive their text. */
export function pruneHighlights<T extends { text: string }>(highlights: T[] | undefined, response: string): T[] {
  const list = highlights ?? [];
  const kept = list.filter((h) => highlightFoundIn(response, h.text));
  return kept.length === list.length ? list : kept;
}
