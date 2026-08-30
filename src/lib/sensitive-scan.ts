import type { ThoughtNode } from '../types';
import { confirmDialog } from './ui-store';
import { t, fmt } from '../i18n';

// Sensitive-content gate for the EXIT doors (share links, exports).
// Mirrored CLI sessions carry tool output — env dumps, keys, tokens —
// and the moment a canvas leaves this machine matters more than any
// time it sits here (the source files already live here). High-
// confidence patterns only; the confirm dialog is the judge, this
// scanner is just the witness. Local automatic backups are NOT gated —
// they never leave the machine and must never be interrupted.
const PATTERNS: { kind: string; re: RegExp }[] = [
  { kind: 'sk-… key', re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { kind: 'GitHub token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { kind: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { kind: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { kind: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { kind: 'JWT', re: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g },
  { kind: 'private key block', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { kind: 'token assignment', re: /\b(?:API_KEY|APIKEY|SECRET|TOKEN|PASSWORD|ACCESS_KEY|AUTH_TOKEN)[A-Z_]*\s*[=:]\s*['"]?[A-Za-z0-9_/+-]{16,}/g },
  { kind: 'HuggingFace token', re: /\bhf_[A-Za-z0-9]{30,}\b/g },
  { kind: 'npm token', re: /\bnpm_[A-Za-z0-9]{30,}\b/g },
];

export interface SensitiveHit { where: string; kind: string; sample: string }

const mask = (m: string): string => (m.length <= 10 ? `${m.slice(0, 4)}…` : `${m.slice(0, 6)}…${m.slice(-2)}`);

function scanText(text: string | undefined, where: string, out: SensitiveHit[]): void {
  if (!text) return;
  for (const { kind, re } of PATTERNS) {
    re.lastIndex = 0;
    const m = re.exec(text);
    if (m) out.push({ where, kind, sample: mask(m[0]) });
    if (out.length >= 20) return;
  }
}

export function scanNodes(nodes: ThoughtNode[]): SensitiveHit[] {
  const hits: SensitiveHit[] = [];
  for (const n of nodes) {
    const label = (n.data.question || n.data.summaries?.[0] || n.id).replace(/\s+/g, ' ').slice(0, 28);
    scanText(n.data.question, label, hits);
    for (const r of n.data.responses ?? []) scanText(r, label, hits);
    for (const a of n.data.attachments ?? []) {
      if (!a.type.startsWith('image/')) scanText(a.content, `${label} · ${a.name}`, hits);
    }
    if (hits.length >= 20) break;
  }
  return hits;
}

/** The gate itself: true = clear to leave the machine. Silent when the
 *  scan finds nothing — the dialog only ever appears with evidence. */
export async function confirmIfSensitive(nodes: ThoughtNode[]): Promise<boolean> {
  const hits = scanNodes(nodes);
  if (hits.length === 0) return true;
  const shown = hits.slice(0, 5).map((h) => `· ${h.where} — ${h.kind}（${h.sample}）`).join('\n');
  const more = hits.length > 5 ? `\n${fmt(t('sensitive.more'), { n: hits.length - 5 })}` : '';
  return confirmDialog({
    title: t('sensitive.title'),
    message: `${fmt(t('sensitive.body'), { n: hits.length })}\n\n${shown}${more}\n\n${t('sensitive.hint')}`,
    confirmLabel: t('sensitive.proceed'),
    danger: true,
  });
}
