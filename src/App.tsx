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
import './index.css';
import ThoughtNode from './components/ThoughtNode';
import FocusPanel from './components/focus-panel';
import SelectionToolbar from './components/SelectionToolbar';
import { useStore } from './store';
import type { Attachment, ThoughtNode as ThoughtNodeType, ThoughtEdge } from './types';
import { processFile, FILE_INPUT_ACCEPT } from './lib/attachments';
import { walkUpAncestors } from './lib/graph';

const nodeTypes = { thought: ThoughtNode };

// Gate on rehydration: the store loads asynchronously from IndexedDB, and
// mounting the canvas only after hydration lets ReactFlow's fitView see the
// restored graph (and avoids flashing the landing input).
export default function App() {
  const [hydrated, setHydrated] = useState(useStore.persist.hasHydrated());
  useEffect(() => useStore.persist.onFinishHydration(() => setHydrated(true)), []);
  if (!hydrated) return null;
  return <Canvas />;
}

function Canvas() {
  const { nodes, edges, setNodes, setEdges, addQuestion, undo, redo, addCrossLink, pushHistory, setSelectedNodeId, setSelectedNodeIds, history, historyIndex } = useStore();
  const [inputValue, setInputValue] = useState('');
  const [rootRole, setRootRole] = useState('');
  const [showRootRole, setShowRootRole] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [isDraggingLanding, setIsDraggingLanding] = useState(false);
  const landingFileRef = useRef<HTMLInputElement>(null);
  const floatingFileRef = useRef<HTMLInputElement>(null);
  const hasNodes = nodes.length > 0;
  const rfInstance = useRef<ReactFlowInstance<ThoughtNodeType, ThoughtEdge> | null>(null);
  const prevNodeCount = useRef(nodes.length);

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

  const deleteEdge = useCallback(
    (edgeId: string) => {
      setEdges(edges.filter((e) => e.id !== edgeId));
      setTimeout(() => pushHistory(), 0);
      setEdgeMenu(null);
    },
    [edges, setEdges, pushHistory]
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
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) { e.preventDefault(); redo(); }
        else { e.preventDefault(); undo(); }
      }
      // Delete/Backspace on multi-select
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeIds.length > 1) {
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;
        e.preventDefault();
        if (confirm(`Delete ${selectedNodeIds.length} selected nodes?`)) {
          batchDelete(selectedNodeIds);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, selectedNodeIds, batchDelete]);

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
          style: { ...e.style, stroke: '#F59E0B', strokeWidth: 3.5, opacity: 1 },
          markerEnd: { type: 'arrowclosed' as const, ...((e.markerEnd && typeof e.markerEnd === 'object') ? e.markerEnd : {}), color: '#F59E0B' },
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
      {/* Canvas — shrinks when panel is open */}
      <div className={`relative h-full transition-all duration-300 ease-in-out ${panelOpen ? 'w-1/2' : 'w-full'}`}>
      <ReactFlow
        onInit={(instance) => { rfInstance.current = instance; }}
        nodes={nodes}
        edges={highlightedEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onEdgeContextMenu={onEdgeContextMenu}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
        defaultEdgeOptions={{
          type: 'smoothstep',
          animated: false,
          style: { stroke: '#6B5CE7', strokeWidth: 2 },
          markerEnd: { type: 'arrowclosed' as const, color: '#6B5CE7', width: 16, height: 16 },
        }}
        proOptions={{ hideAttribution: true }}
        nodeDragThreshold={5}
        selectionMode={SelectionMode.Partial}
        selectionOnDrag
        panOnDrag={[1, 2]}
        connectionLineStyle={{ stroke: '#6B5CE7', strokeDasharray: '8 4', strokeWidth: 2 }}
        onSelectionChange={onSelectionChange}
        onPaneClick={() => { setSelectedNodeId(null); setSelectedNodeIds([]); }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1} color="#E8E5E0" />
        <Controls position="bottom-left" />
        <MiniMap
          nodeColor={(node) => {
            const data = node.data as Record<string, unknown>;
            return data.isRoot ? '#6B5CE7' : '#E08A3C';
          }}
          maskColor="rgba(250,249,247,0.85)"
          style={{ background: '#FFFFFF', border: '1px solid #E8E5E0', borderRadius: '12px' }}
          position="bottom-right"
        />
      </ReactFlow>

      {/* Initial input */}
      {!hasNodes && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="pointer-events-auto w-[500px] animate-fade-in">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-semibold text-[#1A1A1A] mb-2">ThoughtDAG</h1>
              <p className="text-sm text-[#6B6560]">Explore ideas as branching conversations</p>
            </div>
            <div
              className={`bg-white border rounded-2xl px-5 py-4 shadow-lg transition-all ${isDraggingLanding ? 'border-[#6B5CE7] ring-2 ring-[#6B5CE7]/20' : 'border-[#E8E5E0]'}`}
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
                placeholder="What would you like to explore?"
                className="w-full bg-transparent text-[#1A1A1A] text-sm leading-relaxed resize-none focus:outline-none placeholder-[#B8B2A8]"
                rows={3}
                autoFocus
              />
              {/* Pending attachments preview */}
              {pendingAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2 pb-1">
                  {pendingAttachments.map((att) => (
                    <div key={att.id} className="flex items-center gap-1.5 bg-[#F5F3F0] rounded-lg px-2.5 py-1.5 group">
                      {att.thumbnailUrl ? (
                        <img src={att.thumbnailUrl} className="w-6 h-6 rounded object-cover" alt={att.name} />
                      ) : (
                        <span className="text-xs">📄</span>
                      )}
                      <span className="text-xs text-[#6B6560] max-w-[100px] truncate">{att.name}</span>
                      {att.isExtracting && <span className="text-[10px] text-[#6B5CE7] animate-pulse">⏳</span>}
                      {att.numPages != null && <span className="text-[10px] text-[#B8B2A8]">{att.numPages}p</span>}
                      <button
                        onClick={() => setPendingAttachments((p) => p.filter((a) => a.id !== att.id))}
                        className="text-[#B8B2A8] hover:text-red-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                      >✕</button>
                    </div>
                  ))}
                </div>
              )}
              {/* Optional role */}
              <div className="mt-2">
                {!showRootRole ? (
                  <button
                    onClick={() => setShowRootRole(true)}
                    className="text-xs text-[#B8B2A8] hover:text-[#6B6560] transition-colors flex items-center gap-1"
                  >
                    Set role (optional)
                  </button>
                ) : (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#6B6560] font-medium">Role (System Prompt)</span>
                      <button onClick={() => { setShowRootRole(false); setRootRole(''); }} className="text-xs text-[#B8B2A8] hover:text-[#6B6560]">✕</button>
                    </div>
                    <textarea
                      value={rootRole}
                      onChange={(e) => setRootRole(e.target.value)}
                      placeholder="e.g. You are a physicist. Explain using first principles."
                      className="w-full text-xs border border-[#E8E5E0] rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#6B5CE7] bg-[#FAFAF8] resize-none leading-relaxed"
                      rows={2}
                    />
                  </div>
                )}
              </div>
              <div className="flex justify-end mt-2 gap-2">
                <button
                  onClick={() => landingFileRef.current?.click()}
                  className="text-[#B8B2A8] hover:text-[#6B5CE7] hover:bg-[#F5F3F0] rounded-xl px-3 py-2 transition-colors text-sm"
                  title="Attach files"
                >
                  📎
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
                  className="bg-[#6B5CE7] hover:bg-[#5A4BD6] disabled:opacity-30 disabled:cursor-not-allowed text-white text-sm px-5 py-2 rounded-xl transition-all"
                >
                  {pendingAttachments.some(a => a.isExtracting) ? 'Extracting...' : 'Send ↵'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating input */}
      {hasNodes && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10">
          <div
            className="bg-white/90 backdrop-blur border border-[#E8E5E0] rounded-2xl px-4 py-3 shadow-lg w-[400px]"
            onDrop={(e) => { e.preventDefault(); handleFileUpload(e.dataTransfer.files); }}
            onDragOver={(e) => e.preventDefault()}
          >
            <div className="flex gap-2 items-end">
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onPaste={(e) => {
                  const files = Array.from(e.clipboardData.items).filter(i => i.kind === 'file').map(i => i.getAsFile()!).filter(Boolean);
                  if (files.length) handleFileUpload(files);
                }}
                placeholder="New root question..."
                className="flex-1 bg-transparent text-[#1A1A1A] text-sm resize-none focus:outline-none placeholder-[#B8B2A8]"
                rows={1}
              />
              <button
                onClick={() => floatingFileRef.current?.click()}
                className="text-[#B8B2A8] hover:text-[#6B5CE7] transition-colors shrink-0 text-sm"
                title="Attach files"
              >
                📎
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
                className="bg-[#6B5CE7] hover:bg-[#5A4BD6] disabled:opacity-30 text-white text-xs px-3 py-1.5 rounded-xl transition-all shrink-0"
              >
                Send
              </button>
            </div>
            {/* Pending attachments preview */}
            {pendingAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {pendingAttachments.map((att) => (
                  <div key={att.id} className="flex items-center gap-1 bg-[#F5F3F0] rounded-lg px-2 py-1 group">
                    {att.thumbnailUrl ? (
                      <img src={att.thumbnailUrl} className="w-5 h-5 rounded object-cover" alt={att.name} />
                    ) : (
                      <span className="text-[10px]">📄</span>
                    )}
                    <span className="text-[10px] text-[#6B6560] max-w-[80px] truncate">{att.name}</span>
                    <button
                      onClick={() => setPendingAttachments((p) => p.filter((a) => a.id !== att.id))}
                      className="text-[#B8B2A8] hover:text-red-500 text-[10px] opacity-0 group-hover:opacity-100"
                    >✕</button>
                  </div>
                ))}
              </div>
            )}
            {!showRootRole ? (
              <button
                onClick={() => setShowRootRole(true)}
                className="text-[10px] text-[#B8B2A8] hover:text-[#6B6560] transition-colors mt-1.5 flex items-center gap-1"
              >
                Set role
              </button>
            ) : (
              <div className="mt-1.5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-[#6B6560]">Role</span>
                  <button onClick={() => { setShowRootRole(false); setRootRole(''); }} className="text-[10px] text-[#B8B2A8] hover:text-[#6B6560]">✕</button>
                </div>
                <input
                  type="text"
                  value={rootRole}
                  onChange={(e) => setRootRole(e.target.value)}
                  placeholder="e.g. You are a physicist."
                  className="w-full text-xs border border-[#E8E5E0] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#6B5CE7] bg-[#FAFAF8]"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Undo/Redo buttons */}
      <div className="absolute top-4 right-4 z-10 flex gap-1">
        <button
          onClick={undo}
          disabled={historyIndex <= 0}
          className="bg-white/90 backdrop-blur border border-[#E8E5E0] rounded-lg w-8 h-8 flex items-center justify-center shadow-sm hover:bg-[#F5F3F0] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          title="Undo (Cmd+Z)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B6560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
        </button>
        <button
          onClick={redo}
          disabled={historyIndex >= history.length - 1}
          className="bg-white/90 backdrop-blur border border-[#E8E5E0] rounded-lg w-8 h-8 flex items-center justify-center shadow-sm hover:bg-[#F5F3F0] transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          title="Redo (Cmd+Shift+Z)"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B6560" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>

      {/* Multi-select toolbar */}
      {multiSelected && <SelectionToolbar />}

      {/* Edge context menu */}
      {edgeMenu && (
        <div
          className="fixed z-50 bg-white border border-[#E8E5E0] rounded-xl shadow-lg py-1 min-w-[120px]"
          style={{ left: edgeMenu.x, top: edgeMenu.y }}
        >
          <button
            onClick={() => deleteEdge(edgeMenu.edgeId)}
            className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            🗑 Delete edge
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
