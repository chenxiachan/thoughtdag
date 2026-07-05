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
import { CircleHelp, FileText, GitBranch, Globe, GraduationCap, LayoutGrid, Loader2, Paperclip, Plug, Redo2, Scissors, Trash2, Undo2, Workflow, X } from 'lucide-react';
import './index.css';
import ThoughtNode from './components/ThoughtNode';
import ThoughtEdgeView from './components/ThoughtEdgeView';
import FocusPanel from './components/focus-panel';
import SelectionToolbar from './components/SelectionToolbar';
import SearchBar from './components/SearchBar';
import ProjectSwitcher from './components/ProjectSwitcher';
import { useStore } from './store';
import type { Attachment, ThoughtNode as ThoughtNodeType, ThoughtEdge } from './types';
import { processFile, FILE_INPUT_ACCEPT } from './lib/attachments';
import { walkUpAncestors } from './lib/graph';
import { buildExampleGraph } from './lib/example-graph';
import { COLORS } from './lib/constants';
import { confirmDialog, useUiStore } from './lib/ui-store';
import { useMcpServers } from './lib/use-mcp';
import ConfirmDialog from './components/ui/ConfirmDialog';
import Toaster from './components/ui/Toaster';
import LangSwitch from './components/ui/LangSwitch';
import ModelPicker from './components/ui/ModelPicker';
import Tutorial from './components/Tutorial';
import { useT, t as ti, fmt, useI18n } from './i18n';

const nodeTypes = { thought: ThoughtNode };
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
      <ConfirmDialog />
      <Tutorial />
    </>
  );
}

function Canvas() {
  const { nodes, edges, setNodes, setEdges, addQuestion, undo, redo, addCrossLink, setSelectedNodeId, setSelectedNodeIds, history, historyIndex, relayout } = useStore();
  const t = useT();
  const setTutorialOpen = useUiStore((s) => s.setTutorialOpen);
  const webSearchEnabled = useUiStore((s) => s.webSearchEnabled);
  const setWebSearchEnabled = useUiStore((s) => s.setWebSearchEnabled);
  const scholarSearchEnabled = useUiStore((s) => s.scholarSearchEnabled);
  const setScholarSearchEnabled = useUiStore((s) => s.setScholarSearchEnabled);
  const mcpEnabled = useUiStore((s) => s.mcpEnabled);
  const setMcpEnabled = useUiStore((s) => s.setMcpEnabled);
  const mcpServers = useMcpServers();
  const [inputValue, setInputValue] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [rootRole, setRootRole] = useState('');
  const [showRootRole, setShowRootRole] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isDraggingLanding, setIsDraggingLanding] = useState(false);
  const landingFileRef = useRef<HTMLInputElement>(null);
  const floatingFileRef = useRef<HTMLInputElement>(null);
  const floatingInputRef = useRef<HTMLTextAreaElement>(null);
  const hasNodes = nodes.length > 0;
  const rfInstance = useRef<ReactFlowInstance<ThoughtNodeType, ThoughtEdge> | null>(null);
  const prevNodeCount = useRef(nodes.length);
  const lang = useI18n((s) => s.lang);

  const loadExample = useCallback(() => {
    const { nodes: exNodes, edges: exEdges } = buildExampleGraph(lang);
    const st = useStore.getState();
    st.setNodes([...st.nodes, ...exNodes.filter((n) => !st.nodes.some((x) => x.id === n.id))]);
    st.setEdges([...st.edges, ...exEdges.filter((e) => !st.edges.some((x) => x.id === e.id))]);
    st.pushHistory();
    setTimeout(() => rfInstance.current?.fitView({ duration: 500, padding: 0.1 }), 100);
  }, [lang]);

  // First run ever: seed the example canvas so newcomers land on a living
  // graph (incl. the context-pruning ⚖️ demo) instead of a blank page.
  useEffect(() => {
    if (nodes.length === 0 && !localStorage.getItem('thoughtdag.seeded')) {
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

  const onNodesChange: OnNodesChange = useCallback(
    (changes) => setNodes(applyNodeChanges(changes, nodes) as typeof nodes),
    [nodes, setNodes]
  );

  const onEdgesChange: OnEdgesChange = useCallback(
    (changes) => setEdges(applyEdgeChanges(changes, edges)),
    [edges, setEdges]
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

  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const selectedNodeIds = useStore((s) => s.selectedNodeIds);
  const panelOpen = !!selectedNodeId;
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
        if (!inField && selectedNodeId && !e.metaKey && !e.ctrlKey && !e.altKey) {
          const { nodes: ns, edges: es } = useStore.getState();
          // Space: collapse/expand the selected node
          if (e.key === ' ') {
            e.preventDefault();
            useStore.getState().toggleCollapse(selectedNodeId);
            return;
          }
          // R: regenerate
          if (e.key === 'r' || e.key === 'R') {
            e.preventDefault();
            void useStore.getState().regenerate(selectedNodeId);
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
  }, [undo, redo, selectedNodeId, selectedNodeIds, setSelectedNodeId, setSelectedNodeIds, batchDelete, edges, deleteEdges]);

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
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
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
  const highlightedEdges = useMemo((): ThoughtEdge[] => {
    const activeIds = selectedNodeIds.length > 0 ? selectedNodeIds : (selectedNodeId ? [selectedNodeId] : []);
    if (activeIds.length === 0) return edges;

    // Walk up from each selected node, collect all ancestor edge ids
    const { visitedEdgeIds: ancestorEdgeIds } = walkUpAncestors(activeIds, nodes, edges);

    return edges.map((e) => {
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

  // Re-center canvas when panel opens/closes
  useEffect(() => {
    if (rfInstance.current && hasNodes) {
      setTimeout(() => {
        rfInstance.current?.fitView({ duration: 300, padding: 0.2 });
      }, 50);
    }
  }, [panelOpen, hasNodes]);

  return (
    <div className="w-full h-full flex">
      {/* Canvas — takes the remaining width when the panel is open */}
      <div
        className={`relative h-full ${panelOpen ? 'flex-1 min-w-0' : 'w-full'}`}
        onDoubleClick={(e) => {
          // Double-click on empty canvas → start a new root question
          if ((e.target as HTMLElement).classList.contains('react-flow__pane')) {
            floatingInputRef.current?.focus();
          }
        }}
      >
      <ReactFlow
        onInit={(instance) => { rfInstance.current = instance; }}
        nodes={nodes}
        edges={highlightedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
      {!hasNodes && (
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
              className={`bg-card border rounded-xl px-5 py-4 shadow-lg transition-all focus-within:border-accent/50 focus-within:shadow-xl ${isDraggingLanding ? 'border-accent ring-2 ring-accent/20' : 'border-line'}`}
              onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingLanding(false); handleFileUpload(e.dataTransfer.files); }}
              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDraggingLanding(true); }}
              onDragLeave={() => setIsDraggingLanding(false)}
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
              {/* Optional role */}
              <div className="mt-2">
                {!showRootRole ? (
                  <button
                    onClick={() => setShowRootRole(true)}
                    className="text-xs text-ink-faint hover:text-ink-muted transition-colors flex items-center gap-1"
                  >
                    {t('landing.setRole')}
                  </button>
                ) : (
                  <div className="space-y-1">
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
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end mt-2 gap-2">
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

      {/* Floating input — centered on the full canvas; docks below the project
          switcher when the panel narrows the canvas (avoids toolbar collision) */}
      {hasNodes && (
        <div className={`absolute z-10 ${panelOpen ? 'top-16 left-4' : 'top-4 left-1/2 -translate-x-1/2'}`}>
          <div
            className="bg-card/90 backdrop-blur border border-line rounded-xl px-4 py-3 shadow-lg w-[400px] transition-colors focus-within:border-accent/50"
            onDrop={(e) => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="flex gap-2 items-end">
              <textarea
                ref={floatingInputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.items).filter(i => i.kind === 'file').map(i => i.getAsFile()!).filter(Boolean);
                  if (files.length) handleFileUpload(files);
                }}
                placeholder={t('canvas.newRootPlaceholder')}
                className="flex-1 bg-transparent text-ink text-sm resize-none focus:outline-none placeholder-ink-faint"
                rows={1}
              />
              <button
                onClick={() => floatingFileRef.current?.click()}
                className="text-ink-faint hover:text-accent transition-colors shrink-0 text-sm"
                title={t('common.attachFiles')}
              >
                <Paperclip size={16} strokeWidth={1.75} />
              </button>
              <input
                ref={floatingFileRef}
                type="file"
                multiple
                accept={FILE_INPUT_ACCEPT}
                className="hidden"
                onChange={(e) => { handleFileUpload(e.target.files || []); e.target.value = ''; }}
              />
              <button
                onClick={handleSubmit}
                disabled={!inputValue.trim()}
                className="bg-accent hover:bg-accent-strong disabled:opacity-30 text-white text-xs px-3 py-1.5 rounded-xl transition-all shrink-0"
              >
                {t('common.send')}
              </button>
            </div>
            {/* Pending attachments preview */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {pendingAttachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-1 bg-wash rounded-lg px-2 py-1 group">
                    {att.thumbnailUrl ? (
                      <img src={att.thumbnailUrl} className="w-5 h-5 rounded object-cover" alt={att.name} />
                    ) : (
                      <span className="text-2xs"><FileText size={16} strokeWidth={1.75} /></span>
                    )}
                    <span className="text-2xs text-ink-muted max-w-[80px] truncate">{att.name}</span>
                    <button
                      onClick={() => setPendingAttachments((p) => p.filter((a) => a.id !== att.id))}
                      className="text-ink-faint hover:text-red-500 text-2xs opacity-0 group-hover:opacity-100"
                    ><X size={14} strokeWidth={1.75} /></button>
                  </div>
                ))}
              </div>
            )}
            {!showRootRole ? (
              <button
                onClick={() => setShowRootRole(true)}
                className="text-2xs text-ink-faint hover:text-ink-muted transition-colors mt-1.5 flex items-center gap-1"
              >
                {t('canvas.setRole')}
              </button>
            ) : (
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-ink-muted">{t('canvas.role')}</span>
                  <button onClick={() => { setShowRootRole(false); setRootRole(''); }} className="text-2xs text-ink-faint hover:text-ink-muted"><X size={14} strokeWidth={1.75} /></button>
                </div>
                <input
                  type="text"
                  value={rootRole}
                  onChange={(e) => setRootRole(e.target.value)}
                  placeholder={t('canvas.rolePlaceholder')}
                  className="w-full text-xs border border-line rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent bg-surface"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Project switcher */}
      <ProjectSwitcher onSwitched={() => {
        prevNodeCount.current = useStore.getState().nodes.length;
        setTimeout(() => rfInstance.current?.fitView({ duration: 300, padding: 0.2 }), 50);
      }} />

      {/* Toolbar: web search, language, tutorial, relayout, undo/redo */}
      <div className="absolute top-4 right-4 z-10 flex gap-1.5 items-center">
        <ModelPicker />
        <button
          onClick={() => setWebSearchEnabled(!webSearchEnabled)}
          className={`bg-card/90 backdrop-blur border rounded-lg w-8 h-8 flex items-center justify-center shadow-sm transition-colors ${
            webSearchEnabled
              ? 'border-accent/40 text-accent hover:bg-accent/10'
              : 'border-line text-ink-faint hover:bg-wash'
          }`}
          title={webSearchEnabled ? t('toolbar.webSearch') : t('toolbar.webSearchOff')}
        >
          <Globe size={15} strokeWidth={1.75} />
        </button>
        <button
          onClick={() => setScholarSearchEnabled(!scholarSearchEnabled)}
          className={`bg-card/90 backdrop-blur border rounded-lg w-8 h-8 flex items-center justify-center shadow-sm transition-colors ${
            scholarSearchEnabled
              ? 'border-accent/40 text-accent hover:bg-accent/10'
              : 'border-line text-ink-faint hover:bg-wash'
          }`}
          title={scholarSearchEnabled ? t('toolbar.scholarSearch') : t('toolbar.scholarSearchOff')}
        >
          <GraduationCap size={15} strokeWidth={1.75} />
        </button>
        {mcpServers.length > 0 && (
          <button
            onClick={() => setMcpEnabled(!mcpEnabled)}
            className={`bg-card/90 backdrop-blur border rounded-lg w-8 h-8 flex items-center justify-center shadow-sm transition-colors ${
              mcpEnabled
                ? 'border-accent/40 text-accent hover:bg-accent/10'
                : 'border-line text-ink-faint hover:bg-wash'
            }`}
            title={`${mcpEnabled ? t('toolbar.mcp') : t('toolbar.mcpOff')} — ${mcpServers.map((s) => `${s.name} (${s.tools.length})`).join(', ')}`}
          >
            <Plug size={15} strokeWidth={1.75} />
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

      {/* Focus Panel — right side */}
      <FocusPanel onFocusNode={(id) => {
        const node = nodes.find(n => n.id === id);
        if (node && rfInstance.current) {
          rfInstance.current.setCenter(node.position.x + 240, node.position.y + 100, { duration: 300, zoom: rfInstance.current.getZoom() });
        }
      }} />
    </div>
  );
}
