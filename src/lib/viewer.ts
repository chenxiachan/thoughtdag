import type { ThoughtNode, ThoughtEdge } from '../types';

// Read-only viewer: the link IS the canvas. Graph data travels in the URL
// hash (#view=<deflate+base64url>), so nothing touches a server and the
// viewer is just this same static app with every write path closed:
// persistence is a no-op (a visitor's clicks can't overwrite their own
// canvases), generation actions early-return, and the mutating UI hides.

export const isViewerMode =
  typeof window !== 'undefined' && window.location.hash.startsWith('#view=');

const b64url = {
  encode(bytes: Uint8Array): string {
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  decode(s: string): Uint8Array {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  },
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([bytes as BlobPart]).stream().pipeThrough(stream));
  return new Uint8Array(await out.arrayBuffer());
}

export interface ViewerPayload {
  nodes: ThoughtNode[];
  edges: ThoughtEdge[];
}

/** Serialize a graph into a shareable read-only URL (current origin + path). */
export async function buildViewerLink(nodes: ThoughtNode[], edges: ThoughtEdge[]): Promise<string> {
  const clean: ViewerPayload = {
    nodes: nodes.map((n) => ({
      ...n,
      selected: false,
      data: { ...n.data, isLoading: false, isEditing: false, isEditingResponse: false, reasoning: undefined },
    })),
    edges: edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
  };
  const bytes = new TextEncoder().encode(JSON.stringify(clean));
  const packed = await pipe(bytes, new CompressionStream('deflate-raw'));
  return `${window.location.origin}${window.location.pathname}#view=${b64url.encode(packed)}`;
}

export async function decodeViewerHash(hash: string): Promise<ViewerPayload> {
  const packed = b64url.decode(hash.replace(/^#view=/, ''));
  const bytes = await pipe(packed, new DecompressionStream('deflate-raw'));
  return JSON.parse(new TextDecoder().decode(bytes)) as ViewerPayload;
}

/** Boot path for viewer mode: silence persistence, then load the graph from
    the hash straight into the in-memory store. Replaces bootProjects(). */
export async function bootViewer(): Promise<void> {
  // (persistence is already a no-op: store/index.ts picks the storage by
  // isViewerMode at creation time, so no early set() can race this boot)
  const { useStore } = await import('../store');
  try {
    const { nodes, edges } = await decodeViewerHash(window.location.hash);
    useStore.setState({
      nodes,
      edges,
      history: [{ nodes, edges }],
      historyIndex: 0,
      selectedNodeId: null,
      selectedNodeIds: [],
    });
  } catch (err) {
    console.error('[thoughtdag] viewer link decode failed:', err);
  }
}
