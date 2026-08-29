import { create } from 'zustand';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import { useStore } from './index';
import { activeAbortControllers } from './streaming';
import { flushPendingWrites } from '../lib/persistence';
import { buildRuleOutRuleIn } from '../lib/paradigms/rule-out-rule-in';
import { toast } from '../lib/ui-store';
import { t } from '../i18n';

// Project layer: each canvas persists under its own IndexedDB key; this
// module owns the metadata list and the switching choreography.
// Metadata writes use bare idbSet — the debounced idbStorage has a single
// pending slot reserved for the main store and must not be shared.

const META_KEY = 'thoughtdag:projects';
const LEGACY_KEY = 'thoughtdag';

export const projectStorageKey = (id: string) => `thoughtdag:project:${id}`;

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** 'chat' (default) = conversation canvas; 'paradigm' = orchestration view, no LLM. */
  kind?: 'chat' | 'paradigm';
  /** Provenance: which paradigm this run canvas was instantiated from. */
  instantiatedFrom?: { name: string; at: string };
  /** The CANONICAL-canvas contract: this canvas mirrors one runner
      session. Re-importing that session opens THIS canvas and appends
      only the turns past importedCount — the user's edits, branches, and
      condensations accumulate here and are never orphaned into a fresh
      snapshot. tailNodeId is where the next appendix attaches. */
  sourceSession?: { sessionId: string; runner: string; importedCount: number; tailNodeId: string };
}

/** Update the canonical-canvas ledger after an appendix lands. */
export async function updateSourceSession(projectId: string, patch: Partial<NonNullable<ProjectMeta['sourceSession']>>): Promise<void> {
  useProjects.setState((s) => ({
    projects: s.projects.map((p) => (p.id === projectId && p.sourceSession
      ? { ...p, sourceSession: { ...p.sourceSession, ...patch } } : p)),
  }));
  await saveMeta();
}

/** Stamp paradigm provenance on a project (persisted with the meta list). */
export async function markInstantiatedFrom(projectId: string, paradigmName: string): Promise<void> {
  useProjects.setState((s) => ({
    projects: s.projects.map((p) => (p.id === projectId ? { ...p, instantiatedFrom: { name: paradigmName, at: new Date().toISOString() } } : p)),
  }));
  await saveMeta();
}

interface ProjectsState {
  projects: ProjectMeta[];
  activeId: string | null;
  switching: boolean;
}

export const useProjects = create<ProjectsState>(() => ({
  projects: [],
  activeId: null,
  switching: false,
}));

async function saveMeta(): Promise<void> {
  const { projects, activeId } = useProjects.getState();
  await idbSet(META_KEY, { projects, activeId });
}

// ─── Boot & migration ───────────────────────────────────────────
// Idempotent write order: ① copy graph data → ② write metadata → ③ delete
// legacy key. A crash between steps re-runs the migration harmlessly.
let bootPromise: Promise<void> | null = null;

export function bootProjects(): Promise<void> {
  bootPromise ??= (async () => {
    let meta = await idbGet<{ projects: ProjectMeta[]; activeId: string }>(META_KEY);
    if (!meta || meta.projects.length === 0) {
      const legacy = await idbGet<string>(LEGACY_KEY); // raw persist envelope string
      const id = crypto.randomUUID();
      const now = Date.now();
      if (legacy) await idbSet(projectStorageKey(id), legacy);
      meta = { projects: [{ id, name: 'My Canvas', createdAt: now, updatedAt: now }], activeId: id };
      await idbSet(META_KEY, meta);
      if (legacy) await idbDel(LEGACY_KEY);
    }
    if (!meta.projects.some((p) => p.id === meta.activeId)) {
      meta.activeId = meta.projects[0].id;
    }
    useProjects.setState({ projects: meta.projects, activeId: meta.activeId });
    useStore.persist.setOptions({ name: projectStorageKey(meta.activeId) });
    await useStore.persist.rehydrate(); // fires onFinishHydration → App gate opens
  })().catch(async (e) => {
    console.error('[thoughtdag] project boot failed:', e);
    toast('error', t('toast.projectsLoadFailed'));
    useStore.persist.setOptions({ name: projectStorageKey('recovery') });
    await useStore.persist.rehydrate();
  });
  return bootPromise;
}

// ─── Switching ──────────────────────────────────────────────────
// Danger window: between setOptions and rehydrate completion, any setState
// would write the OLD graph under the NEW key. Defenses: abort all streams
// first (drain), and the `switching` flag disables the switcher UI.
let suppressTouch = false;

async function drainGenerations(): Promise<void> {
  for (const controller of activeAbortControllers.values()) controller.abort();
  const deadline = Date.now() + 1000;
  while (activeAbortControllers.size > 0 && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 30));
  }
  await new Promise((r) => setTimeout(r, 0)); // let the final abort writes reach the debounce queue
}

export async function switchProject(id: string): Promise<void> {
  const { activeId, switching, projects } = useProjects.getState();
  if (switching || id === activeId || !projects.some((p) => p.id === id)) return;
  useProjects.setState({ switching: true });
  try {
    await drainGenerations();
    await flushPendingWrites();
    suppressTouch = true;
    useStore.persist.setOptions({ name: projectStorageKey(id) });
    await useStore.persist.rehydrate();
    useStore.setState({ selectedNodeId: null, selectedNodeIds: [] });
    useProjects.setState({ activeId: id });
    await saveMeta();
  } finally {
    suppressTouch = false;
    useProjects.setState({ switching: false });
  }
}

// ─── CRUD ───────────────────────────────────────────────────────
export async function createProject(name = 'Untitled', kind: 'chat' | 'paradigm' = 'chat'): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();
  useProjects.setState((s) => ({
    projects: [...s.projects, { id, name, createdAt: now, updatedAt: now, kind }],
  }));
  await saveMeta();
  await switchProject(id); // empty key rehydrates to an empty canvas
  return id;
}

export async function renameProject(id: string, name: string): Promise<void> {
  useProjects.setState((s) => ({
    projects: s.projects.map((p) => (p.id === id ? { ...p, name } : p)),
  }));
  await saveMeta();
}

export async function deleteProject(id: string): Promise<void> {
  const { projects, activeId } = useProjects.getState();
  if (id === activeId) {
    const rest = projects.filter((p) => p.id !== id);
    if (rest.length > 0) await switchProject(rest[0].id);
    else await createProject('My Canvas');
  }
  await idbDel(projectStorageKey(id));
  useProjects.setState((s) => ({ projects: s.projects.filter((p) => p.id !== id) }));
  await saveMeta();
}

// Register a project entry for graph data already written to its storage key
// (used by JSON import) and switch to it.
export async function adoptImportedProject(
  id: string,
  name: string,
  kind: 'chat' | 'paradigm' = 'chat',
  extras?: Partial<Pick<ProjectMeta, 'instantiatedFrom' | 'sourceSession'>>,
): Promise<void> {
  const now = Date.now();
  useProjects.setState((s) => ({
    projects: [...s.projects, { id, name, createdAt: now, updatedAt: now, kind, ...extras }],
  }));
  await saveMeta();
  await switchProject(id);
}

// Seed a new paradigm project with the built-in rule-out/rule-in score and
// switch to it (shared by the landing page and the project switcher).
export async function createBuiltinParadigm(lang: 'en' | 'zh'): Promise<void> {
  const { name, nodes, edges } = buildRuleOutRuleIn(lang);
  const id = crypto.randomUUID();
  await idbSet(projectStorageKey(id), JSON.stringify({ state: { nodes, edges }, version: 1 }));
  await adoptImportedProject(id, name, 'paradigm');
}

if (import.meta.env.DEV) {
  Object.assign(window, { __projects: useProjects });
}

// ─── updatedAt bookkeeping ──────────────────────────────────────
let touchTimer: ReturnType<typeof setTimeout> | null = null;
useStore.subscribe((state, prev) => {
  if (suppressTouch) return;
  if (state.nodes === prev.nodes && state.edges === prev.edges) return;
  if (touchTimer) clearTimeout(touchTimer);
  touchTimer = setTimeout(() => {
    const { activeId } = useProjects.getState();
    if (!activeId) return;
    useProjects.setState((s) => ({
      projects: s.projects.map((p) => (p.id === activeId ? { ...p, updatedAt: Date.now() } : p)),
    }));
    void saveMeta();
  }, 1000);
});
