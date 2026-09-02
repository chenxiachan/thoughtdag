import type { ThoughtNode, ThoughtEdge } from '../types';
import { compileContextBundle, type ContextBundle } from './context-bundle';
import { useStore } from '../store';
import { useProjects } from '../store/projects';
import { toast } from './ui-store';
import { t, fmt } from '../i18n';

// The experiment loop, outbound half. The working pattern this serves:
// the GRAPH is home (a lean, curated context), CLI sessions are throwaway
// experiment containers. Before each experiment the user takes a node's
// world along — One Rule as a verb: selecting a node selects its context.
//
// The product ships a single opening message to the clipboard: the node's
// compiled context rendered as Markdown, closed by an ANCHOR line naming
// the project, node and bundle. The anchor travels INSIDE the session's
// first user message, so the harvest half can read it back from the
// session file and hang the experiment's yield on the exact node it left
// from — provenance without any side-channel file.

export interface ExperimentAnchor {
  project: string;
  node: string;
  bundle: string;
  /** branch = a side experiment mounted AT the node; continue = the next
      CHAPTER of the main line (context surgery, then onward). Explicit by
      the user's choice of door — never inferred. */
  mode: 'branch' | 'continue';
}

const ANCHOR_RE = /\[ThoughtDAG anchor: project=([\w-]+) node=([\w-]+) bundle=([\w-]+)(?: mode=(branch|continue))?\]/;

export function parseAnchor(text: string): ExperimentAnchor | null {
  const m = text.match(ANCHOR_RE);
  return m ? { project: m[1], node: m[2], bundle: m[3], mode: m[4] === 'continue' ? 'continue' : 'branch' } : null;
}

/** The bundle's Markdown projection — what a fresh CLI session reads as its
 *  opening message. Layer-aware rendering: the compiled items ARE the
 *  content; this only dresses them for a conversational surface. */
export function renderHandoffMarkdown(bundle: ContextBundle, anchor: ExperimentAnchor): string {
  const out: string[] = [];
  out.push(t('exp.mdIntro'));
  out.push('');
  for (const item of bundle.context.messages) {
    const text = item.content[0].text;
    switch (item.source.layer) {
      case 'system':
        out.push(`**${t('exp.mdRole')}** ${text}`);
        break;
      case 'chain':
        out.push(item.role === 'assistant' ? `**A:** ${text}` : `**Q:** ${text}`);
        break;
      default:
        // materials, references, branch passages carry their own fences
        out.push(text);
    }
    out.push('');
  }
  out.push('---');
  out.push(t('exp.mdOutro'));
  out.push('');
  out.push(`[ThoughtDAG anchor: project=${anchor.project} node=${anchor.node} bundle=${anchor.bundle}${anchor.mode === 'continue' ? ' mode=continue' : ''}]`);
  return out.join('\n');
}

/** Outbound: compile the node's context and put the opening message on the
 *  clipboard. Zero extra selection — the node IS the selection. mode
 *  travels in the anchor so the return trip knows which door was used:
 *  branch mounts sideways, continue extends the main line as a chapter. */
export async function takeToExperiment(nodeId: string, mode: 'branch' | 'continue' = 'branch'): Promise<boolean> {
  const st = useStore.getState();
  const project = useProjects.getState().activeId ?? 'default';
  const bundle = await compileContextBundle(nodeId, st.nodes as ThoughtNode[], st.edges as ThoughtEdge[], {
    now: new Date().toISOString(),
    projectId: project,
    staleIds: st.staleIds,
  });
  const anchor: ExperimentAnchor = { project, node: nodeId, bundle: bundle.id, mode };
  // the bundle IS a committed context: record it as one, exact, with its
  // members — the CLI session that opens it answers to this hash
  {
    const members = [...new Set(bundle.context.messages.map((m) => m.source?.node_id).filter((id): id is string => !!id))];
    st.logEvent('commit', nodeId, { kind: 'bundle', sha: bundle.integrity.content_hash, bundle: bundle.id, n: bundle.context.messages.length, ...(members.length ? { m: members.slice(0, 200).join(',') } : {}), ...(members.length > 200 ? { more: true } : {}) });
  }
  const md = renderHandoffMarkdown(bundle, anchor);
  try {
    await navigator.clipboard.writeText(md);
  } catch {
    toast('error', t('exp.clipboardFailed'));
    return false;
  }
  toast('success', fmt(t('exp.copied'), { n: bundle.context.messages.length, tok: bundle.budget.estimated_tokens }), 12000);
  return true;
}
