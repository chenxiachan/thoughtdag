import { toast } from './ui-store';
import { t, fmt } from '../i18n';

// A response from a coding agent names files and folders on THIS machine
// ("wrote docs/x.md", "the poster is at /Users/…/poster.png"). Markdown
// turns those into root-relative links, and a browser would resolve them
// against the app's own origin — a web address for a file that lives on
// disk. Here they are recognized and kept local.

const decode = (s: string): string => { try { return decodeURIComponent(s); } catch { return s; } };

/** The local path an href/src denotes, or null for a real web resource.
 *  A RELATIVE path ("./fig1.png", "assets/1.png") is local only when the
 *  writer's working directory is known — the source session's cwd —
 *  and resolves against it. */
export function localPathOf(href: string | undefined | null, base?: string | null): string | null {
  if (!href) return null;
  if (href.startsWith('file://')) {
    try { return decodeURIComponent(new URL(href).pathname); } catch { return null; }
  }
  if (href.startsWith('~/')) return href;
  if (href.startsWith('/')) return href.startsWith('//') ? null : decode(href);
  if (!base || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('?')) return null;
  const parts = base.replace(/\/+$/, '').split('/');
  for (const seg of decode(href).split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') { if (parts.length > 1) parts.pop(); continue; }
    parts.push(seg);
  }
  return parts.join('/');
}

/** Open a local path on this machine through the desktop shell (folder or
 *  file in Finder, image/PDF in its viewer). In the browser there is no
 *  disk to reach: say so instead of navigating anywhere. */
export async function openLocalPath(path: string): Promise<void> {
  const bridge = window.desktopLocal;
  if (!bridge) { toast('info', fmt(t('local.desktopOnly'), { path }), 7000); return; }
  const r = await bridge.open(path).catch(() => ({ ok: false, reason: 'error' }));
  if (!r.ok) toast('error', fmt(t('local.missing'), { path }), 7000);
}

export const basenameOf = (path: string): string => path.split('/').filter(Boolean).pop() ?? path;
