import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  SelectionMode,
  type OnNodesChange,
  type OnEdgesChange,
  type OnConnect,
  type ReactFlowInstance,
  applyNodeChanges,
  applyEdgeChanges,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import 'highlight.js/styles/github.css';
import { BookOpen, Brain, CircleHelp, Dna, Download, Drama, FileText, Frame, GitBranch, KeyRound, LayoutGrid, Loader2, MessageCircleQuestion, Paperclip, Redo2, Scissors, SquareTerminal, StickyNote, Trash2, Undo2, Workflow, X, ListRestart } from 'lucide-react';
import './index.css';
import ThoughtNode from './components/ThoughtNode';
import ParadigmNode from './components/ParadigmNode';
import ContentNode from './components/ContentNode';
import FrameNode from './components/FrameNode';
import ThoughtEdgeView from './components/ThoughtEdgeView';
import FocusPanel from './components/focus-panel';
import SelectionToolbar from './components/SelectionToolbar';
import SearchBar from './components/SearchBar';
import DiagnosticsPanel from './components/DiagnosticsPanel';
import MaterialReader from './components/MaterialReader';
import ProjectSwitcher from './components/ProjectSwitcher';
import { useStore } from './store';
import { useProjects, adoptImportedProject, createProject, createBuiltinParadigm, markInstantiatedFrom } from './store/projects';
import { projectStorageKey } from './store/projects';
import { set as idbSet } from 'idb-keyval';
import { instantiateParadigm } from './lib/paradigm';
import { isContentKind, spawnContentNode, ingestFiles, fetchLinkIntoNode, clipboardTextToMarkdown } from './lib/content';
import { generateId, isImeComposing } from './utils';
import type { Attachment, ThoughtNode as ThoughtNodeType, ThoughtEdge } from './types';
import { processFile, FILE_INPUT_ACCEPT } from './lib/attachments';
import { walkUpAncestors } from './lib/graph';
import { buildContext } from './store/context-builder';
import { exportActiveParadigm, exportActiveProjectJson } from './lib/export';
import { countTokens } from './utils';
import { buildExampleGraph } from './lib/example-graph';
import { COLORS, FRAME_COLORS, PANEL_INSET } from './lib/constants';
import { confirmDialog, toast, useUiStore } from './lib/ui-store';
import ConfirmDialog from './components/ui/ConfirmDialog';
import Toaster from './components/ui/Toaster';
import GlobalTooltip from './components/ui/GlobalTooltip';
import RoleManagerModal from './components/ui/RoleManagerModal';
import MemoryManagerModal from './components/ui/MemoryManagerModal';
import ApiKeyModal from './components/ui/ApiKeyModal';
import LangSwitch from './components/ui/LangSwitch';
import ModelPicker from './components/ui/ModelPicker';
import RoleTemplateChips from './components/ui/RoleTemplateChips';
import SearchToggles from './components/ui/SearchToggles';
import Tutorial from './components/Tutorial';
import { useT, t as ti, fmt, useI18n } from './i18n';
import { useModels } from './lib/use-models';

// One node type key, three renderers: content nodes (notes / files) render
// the same in every mode; otherwise the active project's kind decides
// whether a node is a conversation card or an orchestration step card.
function NodeDispatch(props: Parameters<typeof ThoughtNode>[0]) {
  const isParadigm = useProjects((s) => s.projects.find((p) => p.id === s.activeId)?.kind === 'paradigm');
  if (props.data?.stepKind === 'frame') return <FrameNode {...props} />;
  if (isContentKind(props.data?.stepKind)) return <ContentNode {...props} />;
  return isParadigm ? <ParadigmNode {...props} /> : <ThoughtNode {...props} />;
}
const nodeTypes = { thought: NodeDispatch };
// Overrides the built-in smoothstep so persisted edges need no migration
const edgeTypes = { smoothstep: ThoughtEdgeView };

// Gate on rehydration: the store loads asynchronously from IndexedDB, and
// mounting the canvas only after hydration lets ReactFlow's fitView see the
// restored graph (and avoids flashing the landing input).
export default function App() {
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);
  return (
    <>
      {hydrated && <Canvas />}
      <Toaster />
      <GlobalTooltip />
      <RoleManagerModal />
      <MemoryManagerModal />
      <ApiKeyModal />
      <ConfirmDialog />
      <Tutorial />
    </>
  );
}

function Canvas() {
  const { nodes, edges, setNodes, setEdges, addQuestion, undo, redo, addCrossLink, setSelectedNodeId, setSelectedNodeIds, history, historyIndex, relayout } = useStore();
  const t = useT();
  const setTutorialOpen = useUiStore((s) => s.setTutorialOpen);
  const annotationsHidden = useUiStore((s) => s.annotationsHidden);
  const setAnnotationsHidden = useUiStore((s) => s.setAnnotationsHidden);
  const [inputValue, setInputValue] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [rootRole, setRootRole] = useState('');
  const [showRootRole, setShowRootRole] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isDraggingLanding, setIsDraggingLanding] = useState(false);
  const landingFileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);
  const hasNodes = nodes.length > 0;
  const rfInstance = useRef<ReactFlowInstance<ThoughtNodeType, ThoughtEdge> | null>(null);
  const prevNodeCount = useRef(nodes.length);
  const lang = useI18n((s) => s.lang);
  const isParadigm = useProjects((s) => s.projects.find((p) => p.id === s.activeId)?.kind === 'paradigm');

  // No configured model anywhere (.env empty, no stored browser key):
  // surface the key dialog once — the app is inert until a model exists.
  const modelData = useModels();
  const keyPrompted = useRef(false);
  useEffect(() => {
    if (keyPrompted.current || !modelData) return;
    if (modelData.models.length === 0) {
      keyPrompted.current = true;
      useUiStore.getState().setApiKeyModalOpen(true);
    }
  }, [modelData]);

  const loadExample = useCallback(() => {
    const { nodes: exNodes, edges: exEdges } = buildExampleGraph(lang);
    const st = useStore.getState();
    st.setNodes([...st.nodes, ...exNodes.filter((n) => !st.nodes.some((x) => x.id === n.id))]);
    st.setEdges([...st.edges, ...exEdges.filter((e) => !st.edges.some((x) => x.id === e.id))]);
    st.pushHistory();
    setTimeout(() => rfInstance.current?.fitView({ duration: 500, padding: 0.1 }), 100);
  }, [lang]);

  // ── Orchestration (paradigm) mode helpers ──
  const addStep = useCallback((kind: 'human' | 'prompt') => {
    const st = useStore.getState();
    const last = st.nodes[st.nodes.length - 1];
    const pos = last ? { x: last.position.x, y: last.position.y + 340 } : { x: 120, y: 80 };
    const id = generateId();
    st.setNodes([...st.nodes, {
      id, type: 'thought', position: pos, dragHandle: '.drag-handle',
      data: {
        question: '', instruction: '', stepKind: kind,
        response: '', responses: [], responseIndex: -1,
        isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
        tokenCount: 0, highlights: [], highlightMode: 'tag',
        attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
        roleMode: 'inherit', isRoot: st.nodes.length === 0, isBranch: false,
      },
    }]);
    st.pushHistory();
  }, []);

  // After a project switch (from the switcher or the landing shortcuts):
  // reset the recenter baseline and refit the viewport.
  const afterProjectSwitch = useCallback(() => {
    prevNodeCount.current = useStore.getState().nodes.length;
    setTimeout(() => rfInstance.current?.fitView({ duration: 300, padding: 0.2 }), 50);
  }, []);

  // ── Content palette + canvas paste/drop: material lands where you point ──
  const lastMouse = useRef<{ x: number; y: number } | null>(null);

  // Frame: a labeled background region for wayfinding — never in context
  const spawnFrame = useCallback((pos: { x: number; y: number }) => {
    const st = useStore.getState();
    const id = generateId();
    st.setNodes([...st.nodes, {
      id, type: 'thought', position: pos, width: 640, height: 420, zIndex: -1, dragHandle: '.drag-handle',
      data: {
        question: '', stepKind: 'frame',
        response: '', responses: [], responseIndex: -1,
        isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
        tokenCount: 0, highlights: [], highlightMode: 'tag',
        attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
        roleMode: 'inherit', isRoot: false, isBranch: false,
      },
    }]);
    st.pushHistory();
  }, []);

  // Dropped-file gate: accept what we can actually parse (images, PDF,
  // text/code). Word and friends would ingest as binary soup — reject with
  // an actionable hint instead.
  const filterDroppedFiles = useCallback((list: FileList | File[]): File[] => {
    const ok: File[] = [];
    for (const f of Array.from(list)) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (f.type.startsWith('image/') || f.type === 'application/pdf' || f.type.startsWith('text/')
        || ['pdf', 'txt', 'md', 'csv', 'json', 'yaml', 'yml', 'toml', 'js', 'ts', 'tsx', 'jsx', 'py', 'sh', 'c', 'cpp', 'h', 'java', 'rs', 'go', 'rb', 'swift', 'css', 'html', 'xml', 'sql', 'tex', 'bib'].includes(ext)) {
        ok.push(f);
      } else {
        toast('info', fmt(ti('toast.unsupportedFile'), { name: f.name }));
      }
    }
    return ok;
  }, []);

  // Ask node: an ordinary Q&A node dropped EMPTY — wire material in, then
  // type the question; it answers from whatever the edges carry.
  const spawnAskNode = useCallback((pos: { x: number; y: number }): string => {
    const st = useStore.getState();
    const id = generateId();
    st.setNodes([...st.nodes, {
      id, type: 'thought', position: pos, dragHandle: '.drag-handle',
      data: {
        question: '', response: '', responses: [], responseIndex: -1,
        isCollapsed: false, isEditing: false, isEditingResponse: false, isLoading: false,
        tokenCount: 0, highlights: [], highlightMode: 'tag',
        attachments: [], excludedAttachmentIds: [], includedAttachmentIds: [],
        roleMode: 'inherit', isRoot: false, isBranch: false,
        webSearch: useUiStore.getState().webSearchEnabled,
        scholarSearch: useUiStore.getState().scholarSearchEnabled,
      },
    }]);
    st.pushHistory();
    return id;
  }, []);
  // Material-first entry: every dropped document becomes a material node;
  // the reader opens on the first readable one (PDF/text render instantly,
  // extraction fills the model channel in the background). Attachments to
  // the root question remain an EXPLICIT action (the paperclip).
  const startFromDocuments = useCallback((list: FileList | File[]) => {
    const files = filterDroppedFiles(list);
    if (files.length === 0) return;
    let readerTarget: string | null = null;
    files.forEach((f, i) => {
      const id = spawnContentNode('file', { x: 120 + (i % 3) * 480, y: 120 + Math.floor(i / 3) * 620 });
      void ingestFiles(id, [f]);
      if (!readerTarget && !f.type.startsWith('image/')) readerTarget = id;
    });
    if (readerTarget) useUiStore.getState().setReaderNodeId(readerTarget);
    setTimeout(() => rfInstance.current?.fitView({ duration: 400, padding: 0.2 }), 120);
  }, [filterDroppedFiles]);

  const flowPosAt = useCallback((screen?: { x: number; y: number } | null) => {
    const at = rfInstance.current?.screenToFlowPosition(screen ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }) ?? { x: 140, y: 140 };
    return { x: at.x - 200, y: at.y - 60 };
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => { lastMouse.current = { x: e.clientX, y: e.clientY }; };
    // Canvas paste: text → note, a lone URL → link snapshot, files → file
    // node with the image/document itself. Inputs keep their own paste.
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const meta = useProjects.getState();
      const isPara = meta.projects.find((p) => p.id === meta.activeId)?.kind === 'paradigm';
      if (useStore.getState().nodes.length === 0 && !isPara) return; // the landing owns paste
      const dt = e.clipboardData;
      if (!dt) return;
      const pos = flowPosAt(lastMouse.current);
      // TEXT WINS: Word/Excel copies carry text AND a bitmap rendering of
      // the selection — the user copied words, not a picture of words.
      // Only image-only clipboards (screenshots, copied images) become
      // file nodes. Tab-separated tables turn into markdown tables.
      const text = dt.getData('text/plain').trim();
      if (text) {
        e.preventDefault();
        if (/^https?:\/\/\S+$/.test(text)) {
          const id = spawnContentNode('link', pos, { linkUrl: text });
          void fetchLinkIntoNode(id, text);
        } else {
          spawnContentNode('note', pos, { question: clipboardTextToMarkdown(text) });
        }
        return;
      }
      const files = Array.from(dt.files);
      if (files.length > 0) {
        e.preventDefault();
        const id = spawnContentNode('file', pos);
        void ingestFiles(id, files);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('paste', onPaste);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('paste', onPaste); };
  }, [flowPosAt]);

  const instantiate = useCallback(async () => {
    const st = useStore.getState();
    if (st.nodes.length === 0) return;
    const { nodes: cNodes, edges: cEdges } = instantiateParadigm(st.nodes, st.edges);
    const meta = useProjects.getState();
    const pname = meta.projects.find((p) => p.id === meta.activeId)?.name ?? 'Paradigm';
    const id = crypto.randomUUID();
    await idbSet(projectStorageKey(id), JSON.stringify({ state: { nodes: cNodes, edges: cEdges }, version: 1 }));
    await adoptImportedProject(id, `▶ ${pname}`, 'chat');
    await markInstantiatedFrom(id, pname); // provenance rides in the backup
    prevNodeCount.current = useStore.getState().nodes.length;
    setTimeout(() => rfInstance.current?.fitView({ duration: 400, padding: 0.15 }), 150);
  }, []);

  // First run ever: seed the example canvas so newcomers land on a living
  // graph (incl. the context-pruning ⚖️ demo) instead of a blank page.
  useEffect(() => {
    if (nodes.length === 0 && !isParadigm && !localStorage.getItem('thoughtdag.seeded')) {
      localStorage.setItem('thoughtdag.seeded', 'yes');
      loadExample();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (nodes.length > prevNodeCount.current && rfInstance.current) {
      const newest = nodes[nodes.length - 1];
      if (newest) {
        setTimeout(() => {
          rfInstance.current?.setCenter(
            newest.position.x + 220,
            newest.position.y + 110,
            { zoom: 1, duration: 400 }
          );
        }, 100);
      }
    }
    prevNodeCount.current = nodes.length;
  }, [nodes]);

  // Apply React Flow changes against the LIVE store state, never the render
  // closure: a click that both mutates a node (e.g. submitting a human turn)
  // and emits a selection change in the same tick would otherwise clobber
  // the mutation with the stale pre-render snapshot.
  const onNodesChange: OnNodesChange = useCallback(
    (changes) => {
      const current = useStore.getState().nodes;
      setNodes(applyNodeChanges(changes, current) as typeof current);
    },
    [setNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges(applyEdgeChanges(changes, useStore.getState().edges)),
    [setEdges]
  );

  // Edge right-click context menu
  const [edgeMenu, setEdgeMenu] = useState<{ x: number; y: number; edgeId: string } | null>(null);

  const onEdgeContextMenu = useCallback(
    (event: React.MouseEvent, edge: { id: string }) => {
      event.preventDefault();
      setEdgeMenu({ x: event.clientX, y: event.clientY, edgeId: edge.id });
    },
    []
  );

  // Close menu on click anywhere
  useEffect(() => {
    if (!edgeMenu) return;
    const handler = () => setEdgeMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [edgeMenu]);

  const deleteEdges = useStore((s) => s.deleteEdges);

  const deleteEdge = useCallback(
    (edgeId: string) => {
      deleteEdges([edgeId]);
      setEdgeMenu(null);
    },
    [deleteEdges]
  );

  const onConnect: OnConnect = useCallback(
    (connection) => {
      if (connection.source && connection.target) {
        addCrossLink(connection.source, connection.target);
      }
    },
    [addCrossLink]
  );

  // Wire-drag must never start a text selection in the cards it crosses
  const onConnectStart = useCallback(() => {
    window.getSelection()?.removeAllRanges();
    document.body.classList.add('tdag-connecting');
  }, []);
  // Dropping a wire on empty canvas = "continue from here": a fresh ask
  // node at the drop point, wired as a solid child (same as a follow-up).
  // Wiring to an EXISTING node stays a dashed reference — the distinction
  // is newborn vs. existing conversation, not which handle you aimed at.
  const onConnectEnd = useCallback<NonNullable<React.ComponentProps<typeof ReactFlow>['onConnectEnd']>>((event, connectionState) => {
    document.body.classList.remove('tdag-connecting');
    if (isParadigm) return;
    if (connectionState.isValid) return; // landed on a handle — onConnect owns it
    if (connectionState.fromHandle?.type !== 'source' || !connectionState.fromNode) return;
    const parentId = connectionState.fromNode.id;
    // Dropped on a card (not a handle): connect as a reference — aiming at
    // the card is enough. Materials and frames accept nothing (One Rule).
    const overNode = (event.target as HTMLElement)?.closest?.('.react-flow__node');
    if (overNode) {
      const targetId = overNode.getAttribute('data-id');
      if (targetId && targetId !== parentId) {
        const tgt = useStore.getState().nodes.find((n) => n.id === targetId);
        const kind = tgt?.data.stepKind ?? '';
        if (tgt && !['note', 'file', 'link', 'frame'].includes(kind)) {
          useStore.getState().addCrossLink(parentId, targetId);
        }
      }
      return;
    }
    const { clientX, clientY } = 'changedTouches' in event ? event.changedTouches[0] : event;
    const pos = flowPosAt({ x: clientX, y: clientY });
    const st = useStore.getState();
    if (st.nodes.find((n) => n.id === parentId)?.data.stepKind === 'frame') return;
    const newId = spawnAskNode(pos);
    st.setEdges([...useStore.getState().edges, {
      id: `edge-${parentId}-${newId}`,
      source: parentId,
      target: newId,
      sourceHandle: 'continue',
      targetHandle: 'top',
      type: 'smoothstep',
      style: { stroke: COLORS.accent, strokeWidth: 2 },
      animated: false,
      markerEnd: { type: 'arrowclosed' as const, color: COLORS.accent, width: 18, height: 18 },
      data: {},
    }]);
    useStore.getState().pushHistory();
  }, [isParadigm, flowPosAt, spawnAskNode]);

  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedNodeIds = useStore((s) => s.selectedNodeIds);
  // Content nodes and frames are edited in place on the canvas — no panel.
  // The panel is a MODE: double-click opens it, its X closes it; while on,
  // it follows the selection. Single clicks only select (no side effects).
  const panelMode = useUiStore((s) => s.panelOpen);
  const staleCount = useStore((s) => s.staleIds.length);
  const livePanelWidth = useUiStore((s) => s.panelWidth);
  const selectedKind = nodes.find((nd) => nd.id === selectedNodeId)?.data.stepKind;
  const selectedIsContent = isContentKind(selectedKind) || selectedKind === 'frame';
  const panelOpen = panelMode && !!selectedNodeId && !isParadigm && !selectedIsContent;
  const multiSelected = selectedNodeIds.length > 1;
  const batchDelete = useStore((s) => s.batchDelete);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // While the confirm dialog is open it owns the keyboard
      if (useUiStore.getState().confirmRequest) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) { e.preventDefault(); redo(); }
        else { e.preventDefault(); undo(); }
      }
      // Cmd+F: node search (replaces browser find on the canvas)
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }
      {
        const target = e.target as HTMLElement;
        const inField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
        if (!inField && selectedNodeId && !isParadigm && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const { nodes: ns, edges: es } = useStore.getState();
          // Space: collapse/expand the selected node
          if (e.key === ' ') {
            e.preventDefault();
            useStore.getState().toggleCollapse(selectedNodeId);
            return;
          }
          // R: regenerate in place (same semantic as the UI button)
          if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            void useStore.getState().rerunNode(selectedNodeId, {});
            return;
          }
          // Arrow keys: walk the DAG (structural edges only)
          if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
            const structural = es.filter((ed) => !ed.data?.isCrossLink);
            let nextId: string | undefined;
            if (e.key === 'ArrowUp') {
              nextId = structural.find((ed) => ed.target === selectedNodeId)?.source;
            } else if (e.key === 'ArrowDown') {
              nextId = structural.find((ed) => ed.source === selectedNodeId)?.target;
            } else {
              const parentEdge = structural.find((ed) => ed.target === selectedNodeId);
              const siblings = parentEdge
                ? structural.filter((ed) => ed.source === parentEdge.source).map((ed) => ed.target)
                : ns.filter((n) => !structural.some((ed) => ed.target === n.id)).map((n) => n.id);
              const idx = siblings.indexOf(selectedNodeId);
              if (idx !== -1 && siblings.length > 1) {
                nextId = siblings[(idx + (e.key === 'ArrowRight' ? 1 : siblings.length - 1)) % siblings.length];
              }
            }
            if (nextId) {
              e.preventDefault();
              setSelectedNodeId(nextId);
              const target2 = ns.find((n) => n.id === nextId);
              if (target2) rfInstance.current?.setCenter(target2.position.x + 260, target2.position.y + 110, { zoom: 1, duration: 300 });
            }
            return;
          }
        }
      }
      // Esc: step out — clear multi-selection first, then close the panel
      if (e.key === 'Escape') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        if (selectedNodeIds.length > 1) {
          setSelectedNodeIds([]);
        } else if (selectedNodeId) {
          setSelectedNodeId(null);
        }
        return;
      }
      // Delete/Backspace: multi-selected nodes (confirm) or selected edges
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;
        if (selectedNodeIds.length > 1) {
          e.preventDefault();
          void confirmDialog({
            title: ti('confirm.deleteNodesTitle'),
            message: fmt(ti('confirm.deleteNodes'), { n: selectedNodeIds.length }),
            confirmLabel: ti('common.delete'),
            danger: true,
          }).then((ok) => { if (ok) batchDelete(selectedNodeIds); });
        } else {
          const selectedEdgeIds = edges.filter((ed) => ed.selected).map((ed) => ed.id);
          if (selectedEdgeIds.length > 0) {
            e.preventDefault();
            deleteEdges(selectedEdgeIds);
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedNodeId, selectedNodeIds, setSelectedNodeId, setSelectedNodeIds, batchDelete, edges, deleteEdges, isParadigm]);

  const handleSubmit = () => {
    if (!inputValue.trim()) return;
    addQuestion(inputValue.trim(), {
      rolePrompt: rootRole.trim() || undefined,
      initialAttachments: pendingAttachments.length > 0 ? pendingAttachments : undefined,
    });
    setInputValue('');
    setRootRole('');
    setShowRootRole(false);
    setPendingAttachments([]);
  };

  const handleFileUpload = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) {
      await processFile(file, {
        add: (att) => setPendingAttachments((prev) => [...prev, att]),
        update: (attId, patch) => setPendingAttachments((prev) => prev.map((a) =>
          a.id === attId ? { ...a, ...patch } : a
        )),
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isImeComposing(e)) { e.preventDefault(); handleSubmit(); }
  };

  const onSelectionChange = useCallback(({ nodes: selectedNodes }: { nodes: { id: string }[] }) => {
    const ids = selectedNodes.map((n) => n.id);
    if (ids.length > 1) {
      setSelectedNodeIds(ids);
    } else if (ids.length === 1) {
      setSelectedNodeId(ids[0]);
    }
    // don't clear on 0 — paneClick handles that
  }, [setSelectedNodeId, setSelectedNodeIds]);

  // Highlight ancestor edges for selected node(s)
  // Frame navigator: named regions become a jumpable table of contents
  const frames = useMemo(() => nodes.filter((n) => n.data.stepKind === 'frame'), [nodes]);
  const [frameNavOpen, setFrameNavOpen] = useState(false);
  const frameNavRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!frameNavOpen) return;
    const handler = (e: MouseEvent) => {
      if (!frameNavRef.current?.contains(e.target as Node)) setFrameNavOpen(false);
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [frameNavOpen]);

  // Annotation view mode: hide frames + UNLINKED content nodes (linked
  // material stays — it's part of the reasoning record). A filter over the
  // render, not a layer system: the semantic layering already lives in edges.
  const displayNodes = useMemo((): typeof nodes => {
    if (!annotationsHidden) return nodes;
    return nodes.map((n) => {
      const k = n.data.stepKind;
      const unlinkedContent = isContentKind(k) && !edges.some((e) => e.source === n.id || e.target === n.id);
      return (k === 'frame' || unlinkedContent) ? { ...n, hidden: true } : n;
    });
  }, [nodes, edges, annotationsHidden]);

  const highlightedEdges = useMemo((): ThoughtEdge[] => {
    // Visual law: SOLID = structural (conversation, layout, cascade),
    // DASHED = bypass (references, watch). Explore branches are structural,
    // so legacy dashed-orange branch edges are normalized to solid here
    // (styles persist per edge; this fixes old canvases centrally).
    const base = edges.map((e) => e.data?.isBranchFromSelection
      ? { ...e, animated: false, style: { ...e.style, strokeDasharray: undefined } }
      : e);
    const activeIds = selectedNodeIds.length > 0 ? selectedNodeIds : (selectedNodeId ? [selectedNodeId] : []);
    if (activeIds.length === 0) return base;

    // Walk up from each selected node, collect all ancestor edge ids
    const { visitedEdgeIds: ancestorEdgeIds } = walkUpAncestors(activeIds, nodes, edges);

    return base.map((e) => {
      if (ancestorEdgeIds.has(e.id)) {
        return {
          ...e,
          style: { ...e.style, stroke: COLORS.trace, strokeWidth: 3.5, opacity: 1 },
          markerEnd: { type: 'arrowclosed' as const, ...((e.markerEnd && typeof e.markerEnd === 'object') ? e.markerEnd : {}), color: COLORS.trace },
          zIndex: 10,
        };
      }
      // Dim non-ancestor edges
      return {
        ...e,
        style: { ...e.style, strokeWidth: 1.5, opacity: 0.2 },
        zIndex: 0,
      };
    });
  }, [nodes, edges, selectedNodeId, selectedNodeIds]);

  // The panel is an overlay — the canvas never resizes. When it opens (or
  // the selection moves while it is open), nudge the viewport only if the
  // selected node would be hidden underneath the panel.
  useEffect(() => {
    if (!panelOpen || !selectedNodeId) return;
    const timer = setTimeout(() => {
      const rf = rfInstance.current;
      if (!rf) return;
      const node = useStore.getState().nodes.find((n) => n.id === selectedNodeId);
      if (!node) return;
      const vp = rf.getViewport();
      const nodeRight = (node.position.x + (node.measured?.width ?? node.width ?? 480)) * vp.zoom + vp.x;
      const visibleRight = window.innerWidth - useUiStore.getState().panelWidth - PANEL_INSET - 24;
      if (nodeRight > visibleRight) {
        rf.setViewport({ ...vp, x: vp.x - (nodeRight - visibleRight) }, { duration: 300 });
      }
    }, 60);
    return () => clearTimeout(timer);
  }, [panelOpen, selectedNodeId]);

  return (
    <div className="relative w-full h-full">
      {/* Canvas — full width always; the focus panel floats on top of it */}
      <div
        className="relative h-full w-full"
        onDoubleClick={(e) => {
          // Double-click on empty canvas → drop an ask node right there
          // (same gesture family as double-click-on-node = open panel)
          if ((e.target as HTMLElement).classList.contains('react-flow__pane') && !isParadigm) {
            spawnAskNode(flowPosAt({ x: e.clientX, y: e.clientY }));
          }
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('application/thoughtdag-content') || e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (!hasNodes && !isParadigm) setIsDraggingLanding(true);
          }
        }}
        onDrop={(e) => {
          const el = e.target as HTMLElement;
          // Landing (empty canvas): dropping a document means "start from
          // this material" — file nodes + the reader, not attachments
          if (!hasNodes && !isParadigm && e.dataTransfer.files.length > 0) {
            e.preventDefault();
            setIsDraggingLanding(false);
            startFromDocuments(e.dataTransfer.files);
            return;
          }
          // Drops land on the empty pane OR inside a frame region (frames
          // cover large areas; a file dropped there should still land)
          const overNode = el.closest?.('.react-flow__node');
          const overFrame = overNode && useStore.getState().nodes.find((n) => n.id === overNode.getAttribute('data-id'))?.data.stepKind === 'frame';
          if (!el.classList?.contains('react-flow__pane') && !overFrame) return;
          const pos = flowPosAt({ x: e.clientX, y: e.clientY });
          const paletteKind = e.dataTransfer.getData('application/thoughtdag-content');
          if (paletteKind === 'ask') {
            e.preventDefault();
            spawnAskNode(pos);
            return;
          }
          if (paletteKind === 'frame') {
            e.preventDefault();
            spawnFrame(pos);
            return;
          }
          if (paletteKind === 'note' || paletteKind === 'file') {
            e.preventDefault();
            spawnContentNode(paletteKind, pos);
            return;
          }
          if (e.dataTransfer.files.length > 0) {
            e.preventDefault();
            const files = filterDroppedFiles(e.dataTransfer.files);
            if (files.length === 0) return;
            const id = spawnContentNode('file', pos);
            void ingestFiles(id, files);
          }
        }}
      >
      <ReactFlow
        onInit={(instance) => {
          rfInstance.current = instance;
          // Debug: expose the flow instance for screenshot/e2e scripts (DEV only)
          if (import.meta.env.DEV) (window as unknown as { __rf?: typeof instance }).__rf = instance;
        }}
        nodes={displayNodes}
        edges={highlightedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        deleteKeyCode={null}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { stroke: COLORS.accent, strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed' as const, color: COLORS.accent, width: 18, height: 18 },
        }}
        proOptions={{ hideAttribution: true }}
        nodeDragThreshold={5}
        connectionRadius={40}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag
        panOnDrag={[1, 2]}
        zoomOnDoubleClick={false}
        connectionLineStyle={{ stroke: COLORS.accent, strokeDasharray: '8 4', strokeWidth: 2 }}
        onSelectionChange={onSelectionChange}
        onPaneClick={() => { setSelectedNodeId(null); setSelectedNodeIds([]); }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#E8E5E0" />
        <Controls position="bottom-left" />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as Record<string, unknown>;
            return data.isRoot ? COLORS.accent : data.isBranch ? COLORS.warm : COLORS.line;
          }}
          maskColor="rgba(250,249,247,0.7)"
          style={{ background: COLORS.card, border: `1px solid ${COLORS.line}`, borderRadius: '10px', width: 160, height: 110 }}
          pannable
          position="bottom-right"
        />
      </ReactFlow>

      {/* Initial input */}
      {!hasNodes && isParadigm && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto">
            <p className="text-sm text-ink-muted mb-1 font-medium">{t('paradigm.emptyTitle')}</p>
            <p className="text-xs text-ink-faint mb-4 max-w-sm leading-relaxed">{t('paradigm.emptyHint')}</p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => addStep('human')}
                className="text-sm border-2 border-dashed border-warm/60 text-warm hover:bg-warm/10 px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <MessageCircleQuestion size={15} strokeWidth={1.75} /> {t('paradigm.addHuman')}
              </button>
              <button
                onClick={() => addStep('prompt')}
                className="text-sm border-2 border-dashed border-accent/50 text-accent hover:bg-accent/10 px-4 py-2.5 rounded-xl transition-colors flex items-center gap-1.5"
              >
                <SquareTerminal size={15} strokeWidth={1.75} /> {t('paradigm.addPrompt')}
              </button>
            </div>
          </div>
        </div>
      )}
      {!hasNodes && !isParadigm && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden">
          {/* Watermark: faint DAG sketches anchoring the corners */}
          <svg className="absolute -left-10 top-[8%] w-[360px] h-[300px] opacity-[0.35] pointer-events-none" viewBox="0 0 360 300" aria-hidden>
            <path d="M80 40 C80 90 80 90 80 130 M80 170 C80 210 80 210 80 250" stroke={COLORS.line} strokeWidth="2" fill="none" />
            <path d="M95 150 C150 150 150 90 205 88" stroke={COLORS.line} strokeWidth="2" strokeDasharray="6 5" fill="none" />
            <circle cx="80" cy="30" r="7" fill={COLORS.line} />
            <circle cx="80" cy="150" r="7" fill="none" stroke={COLORS.line} strokeWidth="2.5" />
            <circle cx="80" cy="262" r="7" fill={COLORS.line} />
            <circle cx="218" cy="88" r="7" fill={COLORS.line} />
          </svg>
          <svg className="absolute right-[-30px] bottom-[10%] w-[320px] h-[280px] opacity-[0.35] pointer-events-none" viewBox="0 0 320 280" aria-hidden>
            <path d="M240 30 C240 80 240 80 240 120 M240 160 C240 200 240 200 240 240" stroke={COLORS.line} strokeWidth="2" fill="none" />
            <path d="M225 140 C170 140 170 210 115 212" stroke={COLORS.line} strokeWidth="2" strokeDasharray="6 5" fill="none" />
            <circle cx="240" cy="20" r="7" fill={COLORS.line} />
            <circle cx="240" cy="140" r="7" fill="none" stroke={COLORS.line} strokeWidth="2.5" />
            <circle cx="240" cy="252" r="7" fill={COLORS.line} />
            <circle cx="102" cy="212" r="7" fill={COLORS.line} />
          </svg>

          <div className="pointer-events-auto w-[560px] animate-fade-in relative">
            <div className="text-center mb-8">
              {/* Mark: a tiny DAG lighting up — main chain in accent, explore branch in warm */}
              <svg width="52" height="52" viewBox="0 0 44 44" className="mx-auto mb-4" aria-hidden>
                <circle className="dag-pop" style={{ animationDelay: '0.05s' }} cx="22" cy="7" r="3.5" fill={COLORS.accent} />
                <line className="dag-pop" style={{ animationDelay: '0.2s' }} x1="22" y1="11" x2="22" y2="19" stroke={COLORS.accent} strokeWidth="2" strokeLinecap="round" />
                <circle className="dag-pop" style={{ animationDelay: '0.35s' }} cx="22" cy="22" r="3.5" fill="none" stroke={COLORS.accent} strokeWidth="2.5" />
                <line className="dag-pop" style={{ animationDelay: '0.5s' }} x1="22" y1="25" x2="22" y2="33" stroke={COLORS.accent} strokeWidth="2" strokeLinecap="round" />
                <circle className="dag-pop" style={{ animationDelay: '0.65s' }} cx="22" cy="37" r="3.5" fill={COLORS.accent} opacity="0.35" />
                <line className="dag-pop" style={{ animationDelay: '0.8s' }} x1="25.5" y1="23.5" x2="33" y2="28.5" stroke={COLORS.warm} strokeWidth="2" strokeLinecap="round" strokeDasharray="3 3" />
                <circle className="dag-pop" style={{ animationDelay: '0.95s' }} cx="36" cy="30" r="3.5" fill={COLORS.warm} />
              </svg>
              <h1 className="text-4xl font-semibold tracking-tight text-ink mb-2.5">ThoughtDAG</h1>
              <p className="text-sm text-ink-muted">{t('landing.tagline')}</p>
            </div>
            <div
              className="bg-card border border-line rounded-xl px-5 py-4 shadow-lg transition-all focus-within:border-accent/50 focus-within:shadow-xl"
            >
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.items).filter(i => i.kind === 'file').map(i => i.getAsFile()!).filter(Boolean);
                  if (files.length) handleFileUpload(files);
                }}
                placeholder={t('landing.placeholder')}
                className="w-full bg-transparent text-ink text-sm leading-relaxed resize-none focus:outline-none placeholder-ink-faint"
                rows={3}
                autoFocus
              />
              {/* Pending attachments preview */}
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 pb-1">
                  {pendingAttachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-1.5 bg-wash rounded-lg px-2.5 py-1.5 group">
                      {att.thumbnailUrl ? (
                        <img src={att.thumbnailUrl} className="w-6 h-6 rounded object-cover" alt={att.name} />
                      ) : (
                        <span className="text-xs"><FileText size={16} strokeWidth={1.75} /></span>
                      )}
                      <span className="text-xs text-ink-muted max-w-[100px] truncate">{att.name}</span>
                      {att.isExtracting && <span className="text-2xs text-accent"><Loader2 className="animate-spin" size={12} strokeWidth={1.75} /></span>}
                      {att.numPages != null && <span className="text-2xs text-ink-faint">{att.numPages}p</span>}
                      <button
                        onClick={() => setPendingAttachments((p) => p.filter((a) => a.id !== att.id))}
                        className="text-ink-faint hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      ><X size={14} strokeWidth={1.75} /></button>
                    </div>
                  ))}
                </div>
              )}
              {/* Role area: opened from the tray icon — an ask-time option,
                  not a decision the landing asks you to make up front */}
              {showRootRole && (
                <div className="space-y-1 mt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-ink-muted font-medium">{t('landing.roleLabel')}</span>
                    <button onClick={() => { setShowRootRole(false); setRootRole(''); }} className="text-xs text-ink-faint hover:text-ink-muted"><X size={14} strokeWidth={1.75} /></button>
                  </div>
                  <textarea
                    value={rootRole}
                    onChange={(e) => setRootRole(e.target.value)}
                    placeholder={t('landing.rolePlaceholder')}
                    className="w-full text-xs border border-line rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent bg-surface resize-none leading-relaxed"
                    rows={2}
                    autoFocus
                  />
                  <RoleTemplateChips onPick={setRootRole} />
                </div>
              )}
              <div className="flex items-center justify-end mt-2 gap-2">
                <SearchToggles />
                <button
                  onClick={() => setShowRootRole(!showRootRole)}
                  title={t('landing.roleTrayTitle')}
                  className={`rounded-full w-8 h-8 flex items-center justify-center transition-colors shrink-0 ${
                    showRootRole || rootRole ? 'text-accent bg-accent/10 hover:bg-accent/20' : 'text-ink-faint hover:text-ink-muted hover:bg-line'
                  }`}
                >
                  <Drama size={16} strokeWidth={1.75} />
                </button>
                <button
                  onClick={() => landingFileRef.current?.click()}
                  className="text-ink-faint hover:text-accent hover:bg-wash rounded-xl px-3 py-2 transition-colors text-sm"
                  title={t('landing.attach')}
                >
                  <Paperclip size={16} strokeWidth={1.75} />
                </button>
                <input
                  ref={landingFileRef}
                  type="file"
                  multiple
                  accept={FILE_INPUT_ACCEPT}
                  className="hidden"
                  onChange={(e) => { handleFileUpload(e.target.files || []); e.target.value = ''; }}
                />
                <button
                  onClick={handleSubmit}
                  disabled={!inputValue.trim() || pendingAttachments.some(a => a.isExtracting)}
                  className="bg-accent hover:bg-accent-strong disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm px-5 py-2 rounded-xl transition-all"
                >
                  {pendingAttachments.some(a => a.isExtracting) ? t('landing.extracting') : t('landing.send')}
                </button>
              </div>
            </div>

            {/* Second entrance: start from a document (material-first). The
                whole landing is the drop target; this card names the gesture. */}
            <div
              onClick={() => docFileRef.current?.click()}
              className={`mt-3 border-2 border-dashed rounded-xl px-5 py-3.5 cursor-pointer transition-all text-center bg-card/60 backdrop-blur ${
                isDraggingLanding ? 'border-accent bg-accent/5 ring-2 ring-accent/20' : 'border-line hover:border-accent/40 hover:bg-accent/5'
              }`}
            >
              <div className="flex items-center justify-center gap-2 text-sm text-ink-muted font-medium">
                <BookOpen size={15} strokeWidth={1.75} className="text-accent" /> {t('landing.docStart')}
              </div>
              <p className="text-2xs text-ink-faint mt-1.5">{t('landing.docFormats')}</p>
              <p className="text-2xs text-ink-faint mt-0.5">{t('landing.docPrivacy')}</p>
            </div>
            <input
              ref={docFileRef}
              type="file"
              multiple
              accept={FILE_INPUT_ACCEPT}
              className="hidden"
              onChange={(e) => { startFromDocuments(e.target.files || []); e.target.value = ''; }}
            />

            {/* What makes this different — three quiet cards */}
            <div className="grid grid-cols-3 gap-3 mt-6">
              {([
                { icon: GitBranch, title: 'landing.feature1.title', desc: 'landing.feature1.desc' },
                { icon: Workflow, title: 'landing.feature2.title', desc: 'landing.feature2.desc' },
                { icon: Scissors, title: 'landing.feature3.title', desc: 'landing.feature3.desc' },
              ] as const).map(({ icon: Icon, title, desc }) => (
                <div key={title} className="bg-card/70 backdrop-blur border border-line/70 rounded-xl px-4 py-3.5 hover:border-line-strong hover:-translate-y-0.5 transition-all">
                  <Icon size={16} strokeWidth={1.75} className="text-accent mb-2" />
                  <h3 className="text-xs font-semibold text-ink mb-1">{t(title)}</h3>
                  <p className="text-2xs text-ink-faint leading-relaxed">{t(desc)}</p>
                </div>
              ))}
            </div>

            {/* Paradigm entrance — the testbed door, level with the chat input */}
            <div className="mt-3 bg-card/70 backdrop-blur border border-line/70 rounded-xl px-4 py-3 flex items-center gap-3 hover:border-line-strong transition-colors">
              <Dna size={16} strokeWidth={1.75} className="text-accent shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-semibold text-ink mb-0.5">{t('landing.paradigmTitle')}</h3>
                <p className="text-2xs text-ink-faint leading-relaxed">{t('landing.paradigmDesc')}</p>
              </div>
              <button
                onClick={() => void createBuiltinParadigm(lang).then(afterProjectSwitch)}
                className="text-2xs bg-accent/10 text-accent hover:bg-accent/20 font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                {t('paradigm.exampleRuleOut')}
              </button>
              <button
                onClick={() => void createProject(ti('paradigm.badge'), 'paradigm').then(afterProjectSwitch)}
                className="text-2xs text-ink-muted hover:text-ink hover:bg-wash font-medium px-3 py-1.5 rounded-lg transition-colors shrink-0"
              >
                + {t('paradigm.newParadigm')}
              </button>
            </div>

            <div className="text-center mt-5 flex items-center justify-center gap-5">
              <button
                onClick={loadExample}
                className="text-xs text-accent hover:text-accent-strong font-medium transition-colors inline-flex items-center gap-1.5"
              >
                <Workflow size={14} strokeWidth={1.75} /> {t('landing.loadExample')}
              </button>
              <button
                onClick={() => setTutorialOpen(true)}
                className="text-xs text-ink-muted hover:text-accent transition-colors inline-flex items-center gap-1.5"
              >
                <CircleHelp size={14} strokeWidth={1.75} /> {t('landing.howItWorks')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Project switcher */}
      <ProjectSwitcher onSwitched={afterProjectSwitch} />

      {/* Content palette — canvas material, both modes. Click drops at the
          viewport center; DRAG drops at the pointer. Paste works anywhere:
          text → note, a URL → link snapshot, image/files → file node. */}
      {(hasNodes || isParadigm) && (
        <div className="absolute top-1/2 -translate-y-1/2 left-4 z-10 flex flex-col gap-1.5 bg-card/90 backdrop-blur border border-line rounded-xl p-1.5 shadow-sm">
          {!isParadigm && (
            <button
              onClick={() => spawnAskNode(flowPosAt(null))}
              draggable
              onDragStart={(e) => { e.dataTransfer.setData('application/thoughtdag-content', 'ask'); e.dataTransfer.effectAllowed = 'copy'; }}
              title={t('palette.askTitle')}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-accent hover:bg-accent/10 transition-colors cursor-grab"
            >
              <MessageCircleQuestion size={17} strokeWidth={1.75} />
            </button>
          )}
          <button
            onClick={() => spawnContentNode('note', flowPosAt(null))}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('application/thoughtdag-content', 'note'); e.dataTransfer.effectAllowed = 'copy'; }}
            title={t('palette.noteTitle')}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-amber-600 hover:bg-amber-500/10 transition-colors cursor-grab"
          >
            <StickyNote size={17} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => spawnContentNode('file', flowPosAt(null))}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('application/thoughtdag-content', 'file'); e.dataTransfer.effectAllowed = 'copy'; }}
            title={t('palette.fileTitle')}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:bg-wash transition-colors cursor-grab"
          >
            <Paperclip size={17} strokeWidth={1.75} />
          </button>
          <button
            onClick={() => spawnFrame(flowPosAt(null))}
            draggable
            onDragStart={(e) => { e.dataTransfer.setData('application/thoughtdag-content', 'frame'); e.dataTransfer.effectAllowed = 'copy'; }}
            title={t('palette.frameTitle')}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-ink-muted hover:bg-wash transition-colors cursor-grab"
          >
            <Frame size={17} strokeWidth={1.75} />
          </button>
        </div>
      )}

      {/* Toolbar: web search, language, tutorial, relayout, undo/redo.
          Positioned relative to the VISIBLE canvas: when the overlay panel
          is open it slides left instead of hiding underneath. */}
      <div
        className="absolute top-4 z-10 flex gap-1.5 items-center transition-[right] duration-200"
        style={{ right: panelOpen ? livePanelWidth + PANEL_INSET + 12 : 16 }}
      >
        {isParadigm && (
          <>
            <button
              onClick={() => addStep('human')}
              className="bg-card/90 backdrop-blur border border-warm/40 rounded-lg h-8 px-3 flex items-center gap-1.5 shadow-sm hover:bg-warm/10 transition-colors text-warm text-xs font-medium"
            >
              <MessageCircleQuestion size={14} strokeWidth={1.75} /> {t('paradigm.addHuman')}
            </button>
            <button
              onClick={() => addStep('prompt')}
              className="bg-card/90 backdrop-blur border border-accent/40 rounded-lg h-8 px-3 flex items-center gap-1.5 shadow-sm hover:bg-accent/10 transition-colors text-accent text-xs font-medium"
            >
              <SquareTerminal size={14} strokeWidth={1.75} /> {t('paradigm.addPrompt')}
            </button>
            <button
              onClick={() => void instantiate()}
              title={t('paradigm.instantiateTitle')}
              className="bg-ink text-white rounded-lg h-8 px-3 flex items-center gap-1.5 shadow-sm hover:bg-ink/85 transition-colors text-xs font-medium"
            >
              ▶ {t('paradigm.instantiate')}
            </button>
          </>
        )}
        {!isParadigm && <ModelPicker />}
        <button
          onClick={() => useUiStore.getState().setMemoryManagerOpen(true)}
          className="bg-card/90 backdrop-blur border border-line rounded-lg w-8 h-8 flex items-center justify-center shadow-sm hover:bg-wash transition-colors text-ink-faint hover:text-accent"
          title={t('memory.entryTitle')}
        >
          <Brain size={15} strokeWidth={1.75} />
        </button>
        {!hasNodes && (
          <button
            onClick={() => useUiStore.getState().setApiKeyModalOpen(true)}
            className="bg-card/90 backdrop-blur border border-line rounded-lg w-8 h-8 flex items-center justify-center shadow-sm hover:bg-wash transition-colors text-ink-faint hover:text-accent"
            title={t('apikey.entryTitle')}
            data-apikey-entry
          >
            <KeyRound size={15} strokeWidth={1.75} />
          </button>
        )}
        {!isParadigm && (<>
        </>)}
        {/* Batch replay: visible only when something is stale. Price at the
            decision point — N generations is the one many-calls-per-click
            action in the app, so it confirms with a token estimate. */}
        {staleCount > 0 && !isParadigm && (
          <button
            onClick={() => {
              const { nodes: ns, edges: es, staleIds } = useStore.getState();
              const estTok = staleIds.reduce((sum, sid) => {
                const blanked = ns.map((x) => x.id === sid ? { ...x, data: { ...x.data, question: '', response: '' } } : x);
                const { layerTokens } = buildContext(sid, blanked, es);
                const q = ns.find((x) => x.id === sid)?.data.question ?? '';
                return sum + layerTokens.material + layerTokens.reference + layerTokens.chain + countTokens(q);
              }, 0);
              void confirmDialog({
                title: t('replay.confirmTitle'),
                message: fmt(t('replay.confirmMsg'), { n: staleCount, tok: estTok.toLocaleString() }),
                confirmLabel: t('replay.confirmBtn'),
              }).then((ok) => { if (ok) void useStore.getState().replayStale(); });
            }}
            className="bg-amber-500/10 backdrop-blur border border-amber-500/40 rounded-lg h-8 px-3 flex items-center gap-1.5 shadow-sm hover:bg-amber-500/20 transition-colors text-amber-600 text-xs font-medium"
            title={t('replay.chipTitle')}
          >
            <ListRestart size={14} strokeWidth={1.75} /> {fmt(t('replay.chip'), { n: staleCount })}
          </button>
        )}
        {hasNodes && frames.length > 0 && (
          <div ref={frameNavRef} className="relative">
            <button
              onClick={() => setFrameNavOpen((v) => !v)}
              className={`bg-card/90 backdrop-blur border rounded-lg w-8 h-8 flex items-center justify-center shadow-sm transition-colors ${
                frameNavOpen ? 'border-accent/40 text-accent' : 'border-line text-ink-faint hover:bg-wash'
              }`}
              title={t('toolbar.frames')}
            >
              <Frame size={15} strokeWidth={1.75} />
            </button>
            {frameNavOpen && (
              <div className="absolute right-0 top-full mt-1.5 bg-card border border-line rounded-xl shadow-lg py-1 w-[230px] max-h-[320px] overflow-y-auto z-30 animate-fade-in">
                {frames.map((f) => (
                  <button
                    key={f.id}
                    onClick={() => {
                      setFrameNavOpen(false);
                      rfInstance.current?.fitBounds(
                        { x: f.position.x, y: f.position.y, width: f.width ?? 640, height: f.height ?? 420 },
                        { duration: 400, padding: 0.15 },
                      );
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-ink hover:bg-wash transition-colors flex items-center gap-2"
                  >
                    <span className={`w-2.5 h-2.5 rounded-sm shrink-0 ${(FRAME_COLORS[f.data.frameColor ?? 'gray'] ?? FRAME_COLORS.gray).dot}`} />
                    <span className="truncate">{f.data.question || t('frame.untitled')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {hasNodes && (
          <button
            onClick={() => setAnnotationsHidden(!annotationsHidden)}
            className={`bg-card/90 backdrop-blur border rounded-lg w-8 h-8 flex items-center justify-center shadow-sm transition-colors ${
              annotationsHidden
                ? 'border-accent/40 text-accent hover:bg-accent/10'
                : 'border-line text-ink-faint hover:bg-wash'
            }`}
            title={annotationsHidden ? t('toolbar.showAnnotations') : t('toolbar.hideAnnotations')}
          >
            <StickyNote size={15} strokeWidth={1.75} />
          </button>
        )}
        <LangSwitch />
        <button
          onClick={() => setTutorialOpen(true)}
          className="bg-card/90 backdrop-blur border border-line rounded-lg w-8 h-8 flex items-center justify-center shadow-sm hover:bg-wash transition-colors text-ink-muted hover:text-accent"
          title={t('landing.howItWorks')}
        >
          <CircleHelp size={15} strokeWidth={1.75} />
        </button>
        {hasNodes && !isParadigm && (
          <DiagnosticsPanel onLocate={(id) => {
            const n = useStore.getState().nodes.find((x) => x.id === id);
            if (n) {
              setSelectedNodeId(id);
              rfInstance.current?.setCenter(n.position.x + 260, n.position.y + 110, { zoom: 1, duration: 350 });
            }
          }} />
        )}
        {hasNodes && (
          <button
            onClick={() => (isParadigm ? exportActiveParadigm() : exportActiveProjectJson())}
            className="bg-card/90 backdrop-blur border border-line rounded-lg w-8 h-8 flex items-center justify-center shadow-sm hover:bg-wash transition-colors text-ink-muted hover:text-accent"
            title={isParadigm ? t('paradigm.exportParadigm') : t('switcher.exportBackup')}
          >
            <Download size={15} strokeWidth={1.75} />
          </button>
        )}
        {hasNodes && (
          <button
            onClick={() => {
              void confirmDialog({
                title: t('confirm.relayoutTitle'),
                message: t('confirm.relayoutMsg'),
                confirmLabel: t('toolbar.relayout'),
              }).then((ok) => {
                if (!ok) return;
                relayout();
                setTimeout(() => rfInstance.current?.fitView({ duration: 400, padding: 0.15 }), 50);
              });
            }}
            className="bg-card/90 backdrop-blur border border-line rounded-lg w-8 h-8 flex items-center justify-center shadow-sm hover:bg-wash transition-colors text-ink-muted hover:text-accent"
            title={t('toolbar.relayout')}
          >
            <LayoutGrid size={15} strokeWidth={1.75} />
          </button>
        )}
        <button
          onClick={undo}
          disabled={historyIndex <= 0}
          className="bg-card/90 backdrop-blur border border-line rounded-lg w-8 h-8 flex items-center justify-center shadow-sm hover:bg-wash transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          title={t('canvas.undo')}
        >
          <Undo2 size={16} strokeWidth={1.75} />
        </button>
        <button
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          className="bg-card/90 backdrop-blur border border-line rounded-lg w-8 h-8 flex items-center justify-center shadow-sm hover:bg-wash transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          title={t('canvas.redo')}
        >
          <Redo2 size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* Multi-select toolbar */}
      {multiSelected && <SelectionToolbar />}

      {/* Cmd+F node search */}
      <SearchBar
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onLocate={(id) => {
          const n = useStore.getState().nodes.find((x) => x.id === id);
          if (n) {
            setSelectedNodeId(id);
            rfInstance.current?.setCenter(n.position.x + 260, n.position.y + 110, { zoom: 1, duration: 350 });
          }
          setSearchOpen(false);
        }}
      />

      {/* Edge context menu */}
      {edgeMenu && (
        <div
          className="fixed z-50 bg-card border border-line rounded-xl shadow-lg py-1 min-w-[120px]"
          style={{ left: edgeMenu.x, top: edgeMenu.y }}
        >
          <button
            onClick={() => deleteEdge(edgeMenu.edgeId)}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1.5"
          >
            <Trash2 size={14} strokeWidth={1.75} />
            {t('canvas.deleteEdge')}
          </button>
        </div>
      )}
      </div>

      {/* Focus Panel — floating overlay on the right; never for orchestration
          or content nodes, which are edited in place on the canvas */}
      {panelOpen && <FocusPanel onFocusNode={(id) => {
        const node = nodes.find(n => n.id === id);
        if (node && rfInstance.current) {
          // Center the node in the strip of canvas the panel leaves visible
          const zoom = rfInstance.current.getZoom();
          rfInstance.current.setCenter(
            node.position.x + 240 + useUiStore.getState().panelWidth / (2 * zoom),
            node.position.y + 100,
            { duration: 300, zoom },
          );
        }
      }} />}

      {/* Material reading overlay: select a passage, ask, the node lands on
          the canvas immediately (a view onto the material, not a container) */}
      <MaterialReader onLocate={(id) => {
        const n = useStore.getState().nodes.find((x) => x.id === id);
        if (n) {
          setSelectedNodeId(id);
          rfInstance.current?.setCenter(n.position.x + 260, n.position.y + 110, { zoom: 1, duration: 350 });
        }
      }} />
    </div>
  );
}
