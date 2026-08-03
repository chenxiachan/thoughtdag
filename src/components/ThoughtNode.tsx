import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Handle, Position, useReactFlow, useUpdateNodeInternals, type NodeProps } from '@xyflow/react';
import { AlertTriangle, Archive, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Copy, Eye, GitBranch, Globe, Hourglass, Minimize2, Paperclip, RefreshCw, Send, Split, Square, Star, Trash2, UserRound, X } from 'lucide-react';
import 'katex/dist/katex.min.css';
import type { ThoughtNode as ThoughtNodeType } from '../types';
import { useStore } from '../store';
import { useZoomTier } from '../lib/use-map-mode';
import { generateId, isImeComposing , activeSummary, activeTopic, awaitingInput } from '../utils';
import { processFile } from '../lib/attachments';
import { copyText } from '../lib/export';
import { isRunLocked } from '../lib/paradigm';
import { collectExploreMarksKey, type ExploreMark } from '../lib/explore-marks';
import { useUiStore, toast } from '../lib/ui-store';
import SearchToggles from './ui/SearchToggles';
import { Markdown, HighlightedMarkdown } from './Markdown';
import FanOutModal from './FanOutModal';
import ReasoningDisclosure from './ui/ReasoningDisclosure';
import { useT, fmt } from '../i18n';
import MentionSurface from './ui/NodeMention';
import { useMentions } from '../lib/mentions';
import { isViewerMode } from '../lib/viewer';

export default function ThoughtNode({ id, data }: NodeProps<ThoughtNodeType>) {
  // Actions are stable references: selecting them one by one (instead of a
  // bare useStore() destructure) means this card no longer re-renders on
  // EVERY store change — with N cards mounted that multiplied every
  // streamed chunk into N markdown re-renders.
  const deleteNode = useStore((s) => s.deleteNode);
  const toggleCollapse = useStore((s) => s.toggleCollapse);
  const setEditing = useStore((s) => s.setEditing);
  const editQuestion = useStore((s) => s.editQuestion);
  const submitHumanTurn = useStore((s) => s.submitHumanTurn);
  const stopGeneration = useStore((s) => s.stopGeneration);
  const setEditingResponse = useStore((s) => s.setEditingResponse);
  const editResponse = useStore((s) => s.editResponse);
  const addHighlight = useStore((s) => s.addHighlight);
  const navigateVersion = useStore((s) => s.navigateVersion);
  const deleteVersion = useStore((s) => s.deleteVersion);
  const setSelectedNodeId = useStore((s) => s.setSelectedNodeId);
  const selectedNodeId = useStore((s) => s.selectedNodeId);
  const addAttachment = useStore((s) => s.addAttachment);
  const rerunNode = useStore((s) => s.rerunNode);
  const t = useT();
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [fanoutOpen, setFanoutOpen] = useState(false);
  // fan-out placeholder shows its expand button until branches exist
  const hasFanoutChildren = useStore((s) => s.edges.some((e) => e.source === id && e.data?.isBranchFromSelection));
  const [selectedText, setSelectedText] = useState('');
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const inlineDraftKey = `inline:${id}`;
  const [inputValue, setInputValueState] = useState(() => useUiStore.getState().drafts[inlineDraftKey] ?? '');
  const mention = useMentions(id);
  const setInputValue = (v: string) => {
    setInputValueState(v);
    useUiStore.getState().setDraft(inlineDraftKey, v);
  };
  const [branchFromText, setBranchFromText] = useState('');
  const [branchYRatio, setBranchYRatio] = useState(0.5);
  const [editValue, setEditValue] = useState(data.question);
  const [editResponseValue, setEditResponseValue] = useState(data.response);
  const responseRef = useRef<HTMLDivElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);
  const questionTaRef = useRef<HTMLTextAreaElement>(null);
  const addQuestion = useStore((s) => s.addQuestion);
  const rf = useReactFlow();
  const zoomTier = useZoomTier();
  const mapMode = zoomTier !== 'work';

  // ── Paradigm run semantics (instantiated human/prompt steps) ──
  const isHuman = data.stepKind === 'human';
  // Awaiting its own question (empty ask node / human turn): shared
  // predicate — the focus panel derives the same state from it.
  const awaiting = awaitingInput(data);
  const isAwaitingHuman = awaiting === 'human';
  // A prompt step that hasn't started yet — the cascade runs it once all its
  // structural parents complete (triggerParadigmCascade in store/streaming).
  const isWaitingUpstream = data.stepKind === 'prompt' && !data.response && !data.isLoading && !data.generationFailed;
  const isParadigmNode = isHuman || data.stepKind === 'prompt';
  const isAwaitingAsk = awaiting === 'ask';
  // isEditing is node-level state shared with the focus panel. When the
  // panel is open on THIS node, the panel owns the editor: rendering a
  // second textarea here made the two fight over focus, and the loser's
  // blur-submit closed both within one frame (the "double-click does
  // nothing" bug). Pending asks / human turns keep their card box — the
  // panel renders those read-only.
  const panelOwnsEditor = useUiStore((s) => s.panelOpen) && selectedNodeId === id && !isParadigmNode;
  // While any paradigm step is incomplete the run is in progress: structure
  // is fixed (no follow-ups, no deletion) until the performance finishes.
  const runLocked = useStore((s) => isParadigmNode && isRunLocked(s.nodes));
  // Map labels represent completed steps (their takeaway). A node WAITING
  // for human input has nothing to summarize — its identity is the input
  // box. And while a paradigm run is in progress the canvas is a DASHBOARD
  // (waiting/running states are what the human watches), not a map. Both
  // keep their working form at every zoom.
  const zoomedOut = mapMode && !isAwaitingHuman && !isAwaitingAsk && !(isParadigmNode && runLocked);
  // Glyph tier: the node collapses to one seal — the thinking's skeleton
  const glyphTier = zoomTier === 'glyph' && zoomedOut;
  // Handles move to hug the seal at glyph tier — tell React Flow to re-measure
  const updateNodeInternals = useUpdateNodeInternals();
  useEffect(() => { updateNodeInternals(id); }, [glyphTier, id, updateNodeInternals]);
  // Upstream changed since this answer was written (see recomputeStaleness)
  const isStale = useStore((s) => s.staleIds.includes(id));
  // Lit while its condense-dialog segment row is hovered — the list points,
  // the canvas answers.
  const condenseLit = useUiStore((s) => s.condenseHighlightIds.includes(id));
  // Page-anchored questions wear a p.N chip that reopens the reader right
  // there — the material node this question grew from is the reader target
  const anchorMaterialId = useStore((s) => {
    if (!data.anchor) return null;
    const e = s.edges.find((e) =>
      e.target === id && !e.data?.isCrossLink &&
      s.nodes.some((n) => n.id === e.source && (n.data.stepKind === 'file' || n.data.stepKind === 'link' || n.data.stepKind === 'note')));
    return e?.source ?? null;
  });
  const openReaderAtAnchor = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data.anchor || !anchorMaterialId) return;
    useUiStore.getState().setReaderNodeId(anchorMaterialId, { page: data.anchor.page, threadId: id });
  };

  // Sync local edit buffer when the response changes externally (streaming, undo)
  const [prevResponse, setPrevResponse] = useState(data.response);
  if (prevResponse !== data.response) {
    setPrevResponse(data.response);
    setEditResponseValue(data.response);
  }

  // React Flow mounts new nodes visibility:hidden until measured, so the
  // textarea's autoFocus fires against a hidden element and is dropped.
  // Re-focus a fresh ask / human slot shortly after mount instead.
  useEffect(() => {
    if (!isAwaitingAsk && !isAwaitingHuman) return;
    const timer = setTimeout(() => questionTaRef.current?.focus(), 80);
    return () => clearTimeout(timer);
    // mount-only: a node awaits input exactly once, at creation
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 0 && responseRef.current?.contains(selection.anchorNode)) {
      const text = selection.toString().trim();
      setSelectedText(text);
      const range = selection.getRangeAt(0);
      const rangeRect = range.getBoundingClientRect();
      const nodeRect = nodeRef.current?.getBoundingClientRect();
      if (nodeRect) {
        setSelectionPos({
          x: rangeRect.left + rangeRect.width / 2 - nodeRect.left,
          y: rangeRect.top - nodeRect.top - 48,
        });
      }
    } else {
      setSelectedText('');
      setSelectionPos(null);
    }
  }, []);

  useEffect(() => {
    if (isViewerMode) return; // no selection menu (branch/highlight are writes)
    document.addEventListener('mouseup', handleTextSelection);
    return () => document.removeEventListener('mouseup', handleTextSelection);
  }, [handleTextSelection]);

  const handleBranch = () => {
    setBranchFromText(selectedText);
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0 && nodeRef.current) {
      const range = selection.getRangeAt(0);
      const selRect = range.getBoundingClientRect();
      const nodeRect = nodeRef.current.getBoundingClientRect();
      const ratio = Math.max(0.1, Math.min(0.9, (selRect.top + selRect.height / 2 - nodeRect.top) / nodeRect.height));
      setBranchYRatio(ratio);
    }
    setInputValue('');
    setSelectedText('');
    setSelectionPos(null);
  };

  const handleHighlight = () => {
    if (!selectedText) return;
    addHighlight(id, { id: generateId(), text: selectedText });
    setSelectedText('');
    setSelectionPos(null);
    window.getSelection()?.removeAllRanges();
  };

  const handleSubmitBranch = () => {
    if (!inputValue.trim()) return;
    addQuestion(inputValue.trim(), {
      parentId: id,
      branchContext: branchFromText || undefined,
      branchYRatio: branchFromText ? branchYRatio : undefined,
      mentions: mention.mentions.map((x) => x.nodeId),
    });
    mention.clear();
    setInputValue('');
    setBranchFromText('');
    setSelectedText('');
    setSelectionPos(null);
  };

  const handleDoubleClickQuestion = (e: React.MouseEvent) => {
    e.stopPropagation(); // inline edit, not the panel
    if (isViewerMode) return;
    // Editing mid-generation is ambiguous by design: stop first, then edit.
    if (data.isLoading) { toast('info', t('question.lockedWhileGenerating')); return; }
    setEditValue(data.question);
    setEditing(id, true);
  };

  const handleDoubleClickResponse = (e: React.MouseEvent) => {
    e.stopPropagation(); // inline edit, not the panel
    if (isViewerMode) return;
    setEditResponseValue(data.response);
    setEditingResponse(id, true);
  };

  const handleEditSubmit = () => {
    if (!editValue.trim()) return;
    // Unchanged question = the user opened the editor to read or copy, not
    // to regenerate — closing must never cost them their answer.
    if (editValue.trim() === data.question) { setEditing(id, false); return; }
    if (isHuman) {
      // Human turn: record the question only — no generation on this node;
      // downstream prompt steps answer (and the cascade advances).
      submitHumanTurn(id, editValue.trim());
    } else {
      editQuestion(id, editValue.trim());
    }
  };

  const handleResponseEditSubmit = () => {
    editResponse(id, editResponseValue);
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && !isImeComposing(e)) { e.preventDefault(); handleEditSubmit(); }
    if (e.key === 'Escape') setEditing(id, false);
  };

  // Click-away must NEVER fire a generation: mid-edit trips to copy text
  // elsewhere used to submit the half-written question. Unchanged drafts
  // close silently (the editor was opened to read); changed drafts stay
  // open and wait for an explicit Enter.
  const handleEditBlur = () => {
    if (editValue.trim() === data.question) setEditing(id, false);
  };

  const autoGrowTa = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(400, el.scrollHeight)}px`;
  };

  const handleResponseEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setEditingResponse(id, false);
  };

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (mention.invokeKey(e)) return; // @-picker owns the key
    if (e.key === 'Enter' && !e.shiftKey && !isImeComposing(e)) { e.preventDefault(); handleSubmitBranch(); }
    if (e.key === 'Escape') { setBranchFromText(''); }
  };

  const isRoot = data.isRoot;
  const isBranch = data.isBranch;
  const hasMultipleVersions = data.responses.length > 1;

  const highlightedTexts = new Set(data.highlights.map((h) => h.text));
  // Passages child branches explore from, marked in this answer (derived
  // from the children — nothing stored here). Click jumps to the branch.
  const exploreMarksKey = useStore((s) => collectExploreMarksKey(id, s.nodes, s.edges));
  const exploreMarks = useMemo(() => JSON.parse(exploreMarksKey) as ExploreMark[], [exploreMarksKey]);
  const exploreSpecs = exploreMarks.map((m) => ({
    text: m.text,
    nodeId: m.nodeId,
    title: `${t('node.exploredHere')} · ${m.question.slice(0, 80)}`,
  }));
  const handleResponseClick = (e: React.MouseEvent) => {
    const m = (e.target as HTMLElement).closest?.('mark[data-explore-target]');
    if (!m) return;
    if (window.getSelection()?.toString()) return; // a drag-select, not a click
    e.stopPropagation();
    const childId = m.getAttribute('data-explore-target');
    const child = childId ? rf.getNode(childId) : undefined;
    if (!child || !childId) return;
    setSelectedNodeId(childId);
    rf.setCenter(child.position.x + 260, child.position.y + 110, { zoom: rf.getZoom(), duration: 300 });
  };
  // Map layer: the display summary for the ACTIVE version. Long answers wear
  // it instead of raw text; the full answer lives one double-click away.
  const versionSummary = activeSummary(data);
  const takeawayType = data.summaryTypes?.[data.responseIndex] ?? undefined;
  // Reasoning of the ACTIVE version (models that emit it); display only
  const versionReasoning = data.reasonings?.[data.responseIndex] ?? undefined;
  // Only the rare, high-signal moves wear a badge — a map where every node
  // has one is a map where none do. insight = the unmarked default.
  const TYPE_BADGE: Record<string, { glyph: string; cls: string; solid: string; key: string; nudge?: string }> = {
    ruleout: { glyph: '✕', cls: 'text-red-500 bg-red-50', solid: 'bg-red-500 text-white', key: 'takeaway.ruleout' },
    // ⚖'s ink sits low in its em box (tall ascent, glyph rides the baseline),
    // so a centered line box leaves it optically LOW — nudge up to visual
    // center (pixel-measured on macOS system fonts; em unit tracks font size)
    decision: { glyph: '⚖', cls: 'text-accent bg-accent/10', solid: 'bg-accent text-white', key: 'takeaway.decision', nudge: 'block -translate-y-[0.08em]' },
    pivot: { glyph: '↩', cls: 'text-warm bg-warm/10', solid: 'bg-warm text-white', key: 'takeaway.pivot' },
    open: { glyph: '?', cls: 'text-amber-600 bg-amber-500/10', solid: 'bg-amber-500 text-white', key: 'takeaway.open' },
    // glyph tier only: steps WITH a takeaway spark; plain steps stay dots
    insight: { glyph: '✦', cls: 'text-sky-600 bg-sky-500/10', solid: 'bg-sky-500 text-white', key: 'takeaway.insight' },
  };
  const badge = takeawayType && takeawayType !== 'insight' && TYPE_BADGE[takeawayType] ? TYPE_BADGE[takeawayType] : null;
  // The glyph seal: typed moves keep their seal; insight sparks; evaluators
  // wear their red eye; everything else is a neutral waypoint dot
  const glyphSeal = takeawayType && TYPE_BADGE[takeawayType]
    ? TYPE_BADGE[takeawayType]
    : (versionSummary ? TYPE_BADGE.insight : null);
  // Stale at glyph tier: the seal itself wears the amber ring — there is no
  // card corner left to pin the dot to
  const staleRing = isStale && glyphTier ? ' ring-4 ring-amber-400' : '';
  const showSummaryCard = !!versionSummary && data.response.length > 400 && !data.isLoading && !data.isEditingResponse;

  return (
    <div
      ref={nodeRef}
      className={glyphTier
        ? `w-[520px] animate-fade-in transition-all duration-200 ${data.archived ? 'opacity-35 saturate-50 ' : ''}${selectedNodeId === id ? 'glyph-selected ' : ''}`
        : `thought-node rounded-xl w-[520px] animate-fade-in transition-all duration-200 ${zoomedOut ? 'map-node ' : ''}${condenseLit ? 'condense-lit ' : ''}${data.archived ? 'opacity-35 saturate-50 ' : ''}${isWaitingUpstream ? 'opacity-60 ' : ''}${
        data.isEvaluator ? 'evaluator-node' : isHuman ? 'human-node' : isBranch ? 'orange-node' : isRoot ? 'root-node' : 'branch-node'
      } ${data.isLoading ? 'loading-border' : ''} ${selectedNodeId === id ? 'ring-2 ring-accent !border-accent selected-glow' : ''} ${isDropTarget ? 'ring-2 ring-accent/50 ring-dashed' : ''}`}
      onClick={() => setSelectedNodeId(id)}
      onDoubleClick={() => {
        // Double-click opens the panel (single click only selects); inner
        // editors (question/response) stop propagation to stay inline
        setSelectedNodeId(id);
        useUiStore.getState().setPanelOpen(true);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDropTarget(false);
        for (const file of Array.from(e.dataTransfer.files)) {
          await processFile(file, {
            add: (att) => addAttachment(id, att),
            update: (attId, patch) => useStore.getState().setAttachmentData(id, attId, patch),
          });
        }
        setSelectedNodeId(id);
      }}
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDropTarget(true); }}
      onDragLeave={() => setIsDropTarget(false)}
    >
      <Handle type="target" position={Position.Top} id="top" className={`!bg-accent !border-2 !border-white tdag-handle ${zoomedOut ? '!w-6 !h-6 tdag-handle-lg' : '!w-3.5 !h-3.5'}`} />
      {/* Side anchors: NOT interaction targets — the system routes dashed
          reference edges through them so cross-chain lines never cut across
          the vertical chain grammar. Two handles for people (top in, bottom
          out); four anchors for the layout. */}
      <Handle type="target" position={Position.Left} id="left" isConnectable={false} className="!bg-transparent !w-0 !h-0 !border-0 !pointer-events-none" style={glyphTier ? { top: '50%', left: 'calc(50% - 56px)' } : { top: '40%' }} />

      {/* Stale dot pins to the CARD's corner — at glyph tier the card is
          gone (one centered seal), so the seal wears an amber ring instead
          of a dot floating where the card used to be */}
      {isStale && zoomedOut && !glyphTier && (
        <span className="absolute top-2.5 right-2.5 w-3.5 h-3.5 rounded-full bg-amber-500 z-10" title={t('node.staleBadge')} />
      )}
      {zoomedOut && !glyphTier && badge && (
        // The cognitive move owns the plaque's top-left corner: a solid seal
        // (no translucency — edges passing behind must not bleed through),
        // glyph sized for map distance
        <span
          title={t(badge.key as Parameters<typeof t>[0])}
          className={`absolute -top-5 -left-5 w-14 h-14 rounded-2xl text-4xl font-bold flex items-center justify-center border-2 border-card shadow-md z-10 ${badge.solid}`}
          data-map-badge
        >
          <span className={badge.nudge}>{badge.glyph}</span>
        </span>
      )}
      {glyphTier ? (
        // Glyph tier: the node IS one seal — the skeleton of the thinking.
        // Typed moves keep their color, takeaway-bearing steps spark ✦,
        // evaluators wear the red eye, digests the book, plain steps a dot.
        <div
          className="drag-handle cursor-grab active:cursor-grabbing w-full h-32 flex items-center justify-center"
          title={[
            data.isEvaluator
              ? t('evaluator.badge')
              : data.digestOf
                ? t('reader.viewDigest')
                : glyphSeal
                  ? t(glyphSeal.key as Parameters<typeof t>[0])
                  : null,
            data.question ? `${t('panel.question')}: ${data.question.replace(/\s+/g, ' ').slice(0, 120)}` : null,
            versionSummary ? `${t('panel.response')}: ${versionSummary}` : null,
          ].filter(Boolean).join('\n')}
          data-glyph-node
        >
          {data.isEvaluator ? (
            <span className={`w-28 h-28 rounded-[2rem] bg-watch text-white flex items-center justify-center border-4 border-card shadow-lg${staleRing}`}>
              <Eye size={60} strokeWidth={2} />
            </span>
          ) : data.digestOf ? (
            <span className={`w-28 h-28 rounded-[2rem] bg-teal-500 text-white flex items-center justify-center border-4 border-card shadow-lg${staleRing}`}>
              <BookOpen size={60} strokeWidth={2} />
            </span>
          ) : glyphSeal ? (
            <span className={`w-28 h-28 rounded-[2rem] text-7xl font-bold flex items-center justify-center border-4 border-card shadow-lg ${glyphSeal.solid}${staleRing}`}>
              <span className={glyphSeal.nudge}>{glyphSeal.glyph}</span>
            </span>
          ) : (
            <span className={`w-14 h-14 rounded-full bg-ink/25 border-4 border-card shadow-md${staleRing}`} />
          )}
        </div>
      ) : zoomedOut ? (
        // Map label: the TAKEAWAY is the headline (what this step yielded),
        // the question a readable eyebrow — the zoomed-out canvas reads like
        // a lab notebook's table of contents, not a pile of shrunken
        // documents. EXCEPT the root: its opening question IS the map's
        // title — the reader's entry point — so there question leads and
        // the takeaway is the subtitle.
        <div
          className="drag-handle cursor-grab active:cursor-grabbing px-6 py-5 relative"
          onDoubleClick={(e) => {
            e.stopPropagation();
            // a plaque is a map label: double-click dives to working scale
            const n = rf.getNode(id);
            if (n) rf.setCenter(n.position.x + 260, n.position.y + 120, { zoom: 1, duration: 300 });
          }}
        >
          {(versionSummary || data.response) ? (
            isRoot ? (
              <>
                <div className="text-2xl font-semibold text-ink leading-snug line-clamp-3">
                  {data.question}
                </div>
                <div className="text-lg text-ink-muted leading-snug line-clamp-2 mt-1.5">
                  {versionSummary || data.response.replace(/[#*`>-]/g, '').slice(0, 140)}
                </div>
              </>
            ) : (
              // Thinning by signal: badged turns (ruled out / decided /
              // pivoted / open) keep the full takeaway in full ink — the
              // map's landmarks. Unbadged waypoints shrink to their micro
              // topic (when the judge wrote one) in muted ink, so the
              // turning points read first.
              <>
                <div className="text-lg text-ink-muted leading-snug line-clamp-2">
                  {data.question}
                </div>
                <div className={`text-2xl font-semibold leading-snug line-clamp-3 mt-1.5 ${badge ? 'text-ink' : 'text-ink-muted'}`}>
                  {(badge ? versionSummary : (activeTopic(data) ?? versionSummary)) || data.response.replace(/[#*`>-]/g, '').slice(0, 140)}
                </div>
              </>
            )
          ) : (
            <div className="text-2xl font-semibold text-ink leading-snug line-clamp-3">
              {data.question}
            </div>
          )}
        </div>
      ) : (
      <>
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-line cursor-grab active:cursor-grabbing drag-handle">
        <div className="flex items-center gap-2">
          <button onClick={() => toggleCollapse(id)} className={`hover:bg-wash rounded-lg w-7 h-7 flex items-center justify-center transition-all text-sm font-bold ${data.isCollapsed ? 'text-accent bg-accent/10' : 'text-ink-faint'}`}>
            {data.isCollapsed ? <ChevronRight size={18} strokeWidth={1.75} /> : <ChevronDown size={18} strokeWidth={1.75} />}
          </button>
          <span className="text-xs text-ink-faint font-mono">{data.tokenCount} tok</span>
          {data.condensedFrom && data.condensedFrom.length > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                // provenance travels by chip, context by wires: highlight the
                // original run and glide the viewport onto it
                const src = useStore.getState().nodes.filter((n) => data.condensedFrom!.includes(n.id));
                if (src.length === 0) return;
                useUiStore.getState().setCondenseHighlightIds(data.condensedFrom!);
                const xs = src.map((n) => n.position.x), ys = src.map((n) => n.position.y);
                rf.fitBounds({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) + 520 - Math.min(...xs), height: Math.max(...ys) + 240 - Math.min(...ys) }, { duration: 350, padding: 0.2 });
                window.setTimeout(() => useUiStore.getState().setCondenseHighlightIds([]), 2600);
              }}
              title={t('node.condensedFromTitle')}
              data-condensed-from
              className="text-2xs bg-accent/10 text-accent hover:bg-accent/20 px-1.5 py-0.5 rounded-md flex items-center gap-1 font-medium transition-colors"
            >
              <Minimize2 size={11} strokeWidth={1.75} /> {fmt(t('node.condensedFrom'), { n: String(data.condensedFrom.length) })}
            </button>
          )}
          {isStale && !data.isLoading && (
            <button
              onClick={(e) => { e.stopPropagation(); if (!isViewerMode) void rerunNode(id, {}); }}
              title={t('node.staleTitle')}
              className="text-2xs bg-amber-500/10 text-amber-600 hover:bg-amber-500/25 px-1.5 py-0.5 rounded-md flex items-center gap-1 font-medium transition-colors"
            >
              <RefreshCw size={11} strokeWidth={1.75} /> {t('node.staleBadge')}
            </button>
          )}
          {data.archived && (
            <span className="text-2xs bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded-md flex items-center gap-1 font-medium" title={t('archive.badgeTitle')}>
              <Archive size={11} strokeWidth={1.75} /> {t('archive.badge')}
            </span>
          )}
          {isHuman && (
            <span className="text-2xs bg-warm/10 text-warm px-1.5 py-0.5 rounded-md flex items-center gap-1 font-medium">
              <UserRound size={11} strokeWidth={1.75} /> {isAwaitingHuman ? t('paradigm.yourTurn') : t('paradigm.kind.human')}
            </span>
          )}
          {isWaitingUpstream && (
            <span className="text-2xs bg-wash text-ink-faint px-1.5 py-0.5 rounded-md flex items-center gap-1 font-medium">
              <Hourglass size={11} strokeWidth={1.75} /> {t('paradigm.waitingUpstream')}
            </span>
          )}
          {data.isEvaluator ? (
            <span className="text-2xs bg-watch/10 text-watch px-1.5 py-0.5 rounded-md flex items-center gap-1 font-medium">
              <Eye size={12} strokeWidth={1.75} /> {t('evaluator.badge')}
            </span>
          ) : data.appliedRole && (
            <span className="text-2xs bg-accent/10 text-accent px-1.5 py-0.5 rounded-md truncate max-w-[120px]" title={data.appliedRole}>
              {data.appliedRole.slice(0, 20)}{data.appliedRole.length > 20 ? '…' : ''}
            </span>
          )}
          {data.model && (
            <span className="text-2xs bg-wash text-ink-muted px-1.5 py-0.5 rounded-md font-mono truncate max-w-[130px]" title={data.model}>
              {data.model}
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {data.isLoading && (
            <button
              onClick={(e) => { e.stopPropagation(); stopGeneration(id); }}
              title={t('actions.stop')}
              className="text-white bg-red-500 hover:bg-red-600 rounded-full w-7 h-7 flex items-center justify-center transition-colors"
            >
              <Square size={10} strokeWidth={1.75} fill="currentColor" />
            </button>
          )}
          {!(isParadigmNode && runLocked) && !isViewerMode && (
            <button onClick={() => deleteNode(id)} className="text-ink-faint hover:text-red-500 hover:bg-red-50 rounded-full w-7 h-7 flex items-center justify-center transition-colors" title={t('common.delete')}>
              <X size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>
      </div>

      {!data.isCollapsed && (
        <div className="px-5 py-4">
          {/* The passage this branch explores: without it the user loses
              the thread that spawned the node. Page-anchored ones carry a
              p.N chip that reopens the reader at that page, thread open —
              the same provenance grammar as the digest's page buttons. */}
          {data.branchContext && (
            <div className="mb-2.5 text-xs pl-3 py-1.5 pr-2 border-l-2 border-warm bg-warm/10 rounded-r text-ink-muted flex items-start gap-1.5">
              <GitBranch size={13} strokeWidth={1.75} className="text-warm shrink-0 mt-0.5" />
              <span className="italic leading-relaxed min-w-0">
                “{(data.anchor ? data.branchContext.replace(/^\(p\.\s?\d+\)\s*/, '') : data.branchContext).slice(0, 180)}{data.branchContext.length > 180 ? '…' : ''}”
              </span>
              {data.anchor && anchorMaterialId && (
                <button
                  onClick={openReaderAtAnchor}
                  title={fmt(t('node.openAtPage'), { n: data.anchor.page })}
                  className="ml-auto shrink-0 text-2xs font-mono text-accent bg-accent/10 hover:bg-accent/20 rounded-full px-1.5 py-0.5 transition-colors"
                >
                  p.{data.anchor.page}
                </button>
              )}
            </div>
          )}
          {/* Question */}
          {(data.isEditing && !panelOwnsEditor) || isAwaitingHuman || isAwaitingAsk ? (
            <div>
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleEditKeyDown}
                onBlur={isHuman || isAwaitingAsk ? undefined : handleEditBlur} // click-away keeps the draft, never generates
                onInput={(e) => autoGrowTa(e.currentTarget)}
                ref={(el) => { questionTaRef.current = el; autoGrowTa(el); }}
                placeholder={data.instruction || (isAwaitingAsk ? t('node.askPlaceholder') : undefined)}
                className={`w-full bg-wash border rounded-xl p-3 text-sm text-ink resize-none focus:outline-none focus:ring-2 ${
                  isHuman ? 'border-warm focus:ring-warm/20' : 'border-accent focus:ring-accent/20'
                }`}
                rows={2}
                autoFocus
              />
              {/* What Enter will do is invisible without being told — the
                  hint switches as soon as the draft actually differs. */}
              {!isHuman && !isAwaitingAsk && (
                <div className="text-2xs text-ink-faint mt-1 px-1">
                  {editValue.trim() !== data.question ? t('question.editHintChanged') : t('question.editHintUnchanged')}
                </div>
              )}
              {isHuman && (
                <div className="flex justify-end mt-1.5">
                  <button
                    onClick={handleEditSubmit}
                    disabled={!editValue.trim()}
                    className="text-xs bg-warm hover:opacity-85 disabled:opacity-30 disabled:cursor-not-allowed text-white px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5"
                  >
                    <Send size={12} strokeWidth={1.75} /> {t('paradigm.start')}
                  </button>
                </div>
              )}
            </div>
          ) : (
            // Long pasted questions must not stretch the card: same pattern
            // as the answer block — cap the height, scroll inside (nowheel
            // keeps the wheel on the text, not the canvas zoom).
            <div
              onDoubleClick={handleDoubleClickQuestion}
              className="text-sm text-ink font-semibold mb-3 cursor-pointer hover:bg-wash rounded-xl px-2 py-1.5 -mx-1 transition-colors max-h-[180px] overflow-y-auto nowheel nopan"
            >
              {data.question}
            </div>
          )}

          {/* Highlights */}
          {data.highlights.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1">
              {data.highlights.map((h) => (
                <span key={h.id} className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                  <Star size={14} strokeWidth={1.75} />
                  {h.text.slice(0, 30)}{h.text.length > 30 ? '…' : ''}
                </span>
              ))}
            </div>
          )}

          {/* Response — a human turn / pending ask has none by design; a
              waiting prompt step shows its pending state instead of an empty box */}
          {isHuman || isAwaitingAsk ? null : isWaitingUpstream ? (
            <div className="border-2 border-dashed border-line rounded-xl py-3 px-3 text-xs text-ink-faint flex items-center gap-2">
              <Hourglass size={13} strokeWidth={1.75} /> {t('paradigm.waitingUpstream')}
            </div>
          ) : data.isLoading ? (
            data.response && !data.restreaming ? (
              // Streaming: show the live tail of the response on the canvas
              <div className="text-sm text-ink-muted leading-relaxed px-3 py-2.5 bg-surface rounded-xl max-h-[180px] overflow-hidden flex flex-col justify-end whitespace-pre-wrap break-words">
                {data.response.length > 400 ? '…' + data.response.slice(-400) : data.response}
                <span className="inline-block w-2 h-4 bg-accent animate-pulse rounded-sm" />
              </div>
            ) : data.reasoning ? (
              // Reasoning models think before they answer — show the live
              // tail of the thinking, visually quieter than an answer
              <div className="px-3 py-2.5 bg-wash/70 rounded-xl max-h-[140px] overflow-hidden flex flex-col justify-end">
                <div className="text-2xs text-ink-faint mb-1">💭 {t('node.reasoningLive')}</div>
                <div className="text-xs text-ink-faint italic leading-relaxed whitespace-pre-wrap break-words">
                  {data.reasoning.length > 300 ? '…' + data.reasoning.slice(-300) : data.reasoning}
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm text-ink-muted">
                <span className="animate-pulse text-accent">●</span> {t('common.thinking')}
              </div>
            )
          ) : data.isEditingResponse ? (
            <div>
              <textarea
                value={editResponseValue}
                onChange={(e) => setEditResponseValue(e.target.value)}
                onKeyDown={handleResponseEditKeyDown}
                className="w-full bg-wash border border-accent rounded-xl p-3 text-sm text-ink resize-y focus:outline-none focus:ring-2 focus:ring-accent/20 min-h-[100px]"
                rows={6}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setEditingResponse(id, false)} className="text-xs text-ink-muted hover:text-ink px-3 py-1.5 rounded-lg hover:bg-wash transition-colors">{t('common.cancel')}</button>
                <button onClick={handleResponseEditSubmit} className="text-xs bg-accent hover:bg-accent-strong text-white px-4 py-1.5 rounded-lg transition-colors">{t('common.save')}</button>
              </div>
            </div>
          ) : (
            showSummaryCard ? (
              // the map shows the landmark, not the terrain photo: an auto
              // summary of THIS version (display only — the model reads the
              // full text; double-click opens the panel for humans)
              <div className="px-3 py-2.5 bg-surface rounded-xl nopan" title={t('node.summaryTitle')}>
                <span className="text-2xs bg-wash text-ink-faint px-1.5 py-0.5 rounded-full">{t('node.summaryLabel')}</span>
                {badge && (
                  <span title={t(badge.key as Parameters<typeof t>[0])} className={`text-2xs px-1.5 py-0.5 rounded-full ml-1.5 font-medium ${badge.cls}`}>
                    {badge.glyph} {t(badge.key as Parameters<typeof t>[0])}
                  </span>
                )}
                <div className="text-sm text-ink-muted leading-relaxed mt-1.5">{versionSummary}</div>
              </div>
            ) : (
            <>
            {versionReasoning && (
              <ReasoningDisclosure text={versionReasoning} />
            )}
            <div
              ref={responseRef}
              onDoubleClick={handleDoubleClickResponse}
              onClick={handleResponseClick}
              className="markdown-body text-sm text-ink leading-relaxed max-h-[400px] overflow-y-auto cursor-text nopan nodrag nowheel px-3 py-2.5 bg-surface rounded-xl"
            >
              {highlightedTexts.size > 0 || exploreSpecs.length > 0 ? (
                <HighlightedMarkdown content={data.response} highlights={highlightedTexts} exploreMarks={exploreSpecs} />
              ) : (
                <Markdown>{data.response}</Markdown>
              )}
            </div>
            </>
            )
          )}

          {/* Fan-out placeholder: the human decides when to expand */}
          {data.stepKind === 'fanout' && !hasFanoutChildren && !data.isLoading && (
            <div className="mt-2">
              <button
                onClick={(e) => { e.stopPropagation(); setFanoutOpen(true); }}
                title={t('paradigm.expandTitle')}
                className="w-full border-2 border-dashed border-warm/50 hover:border-warm hover:bg-warm/5 text-warm rounded-xl py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors"
              >
                <Split size={16} strokeWidth={1.75} />
                {fmt(t('paradigm.expand'), { n: data.fanoutRoles?.length ?? 0 })}
              </button>
              {fanoutOpen && (
                <FanOutModal
                  parentId={id}
                  initialQuestion={data.question}
                  initialRoles={data.fanoutRoles}
                  onClose={() => setFanoutOpen(false)}
                />
              )}
            </div>
          )}

          {/* Web references consulted for this response (compact) */}
          {(data.references?.length ?? 0) > 0 && !data.isLoading && !data.isEditingResponse && (
            <div className="mt-2 px-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-faint">
              <Globe size={11} strokeWidth={1.75} className="shrink-0" />
              {data.references!.slice(0, 3).map((r, i) =>
                r.url ? (
                  <a key={i} href={r.url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-accent/80 hover:text-accent hover:underline nopan">
                    [{i + 1}] {r.title.length > 44 ? r.title.slice(0, 44) + '…' : r.title}
                  </a>
                ) : (
                  <span key={i}>[{i + 1}] {r.title.slice(0, 44)}</span>
                )
              )}
              {data.references!.length > 3 && <span>+{data.references!.length - 3}</span>}
            </div>
          )}

          {/* Response action row — LLM-chat convention: the actions that act
              on THIS answer live right under it (regenerate = new version in
              place; the sibling-branch variant lives in the panel's ⋯ menu) */}
          {data.response && !data.isLoading && !data.isEditingResponse && !isHuman && !isAwaitingAsk && !data.generationFailed && (
            <div className="mt-1.5 flex items-center gap-0.5 text-ink-faint">
              {!isViewerMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); void rerunNode(id, {}); }}
                  className={`rounded-full w-6 h-6 flex items-center justify-center transition-colors ${data.isEvaluator ? 'hover:text-watch hover:bg-red-50' : 'hover:text-accent hover:bg-wash'}`}
                  title={data.isEvaluator ? t('evaluator.rerun') : t('common.regenerate')}
                >
                  <RefreshCw size={14} strokeWidth={1.75} />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); void copyText(data.response); }}
                className="rounded-full w-6 h-6 flex items-center justify-center hover:text-accent hover:bg-wash transition-colors"
                title={t('actions.copyResponse')}
              >
                <Copy size={13} strokeWidth={1.75} />
              </button>
              {(data.generatedBy?.[data.responseIndex]) && (
                <span
                  className="text-2xs text-ink-faint font-mono ml-1 truncate max-w-[150px]"
                  title={t('node.generatedByTitle')}
                >
                  {data.generatedBy[data.responseIndex]!.split('/').pop()}
                </span>
              )}
              {hasMultipleVersions && (
                <div className="flex items-center gap-1 text-xs text-ink-muted ml-1">
                  <button onClick={(e) => { e.stopPropagation(); navigateVersion(id, 'prev'); }} className="hover:text-accent hover:bg-wash rounded-full w-5 h-5 flex items-center justify-center transition-colors"><ChevronLeft size={14} strokeWidth={1.75} /></button>
                  <span className="text-accent font-medium">v{data.responseIndex + 1}/{data.responses.length}</span>
                  <button onClick={(e) => { e.stopPropagation(); navigateVersion(id, 'next'); }} className="hover:text-accent hover:bg-wash rounded-full w-5 h-5 flex items-center justify-center transition-colors"><ChevronRight size={14} strokeWidth={1.75} /></button>
                  {!isViewerMode && (
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteVersion(id, data.responseIndex); }}
                      className="text-ink-faint hover:text-red-500 hover:bg-red-50 rounded-full w-5 h-5 flex items-center justify-center transition-colors"
                      title={t('common.deleteVersion')}
                    >
                      <Trash2 size={13} strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Failed generation: retry in place */}
          {data.generationFailed && !data.isLoading && (
            <div className="mt-2 flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertTriangle size={14} strokeWidth={1.75} className="shrink-0" />
              {t('common.generationFailed')}
              {hasMultipleVersions && (
                <span className="flex items-center gap-1 text-ink-muted shrink-0" title={t('node.backToVersionTitle')}>
                  <button onClick={(e) => { e.stopPropagation(); navigateVersion(id, 'prev'); }} className="hover:text-accent rounded-full w-5 h-5 flex items-center justify-center"><ChevronLeft size={14} strokeWidth={1.75} /></button>
                  v{data.responseIndex + 1}/{data.responses.length}
                  <button onClick={(e) => { e.stopPropagation(); navigateVersion(id, 'next'); }} className="hover:text-accent rounded-full w-5 h-5 flex items-center justify-center"><ChevronRight size={14} strokeWidth={1.75} /></button>
                </span>
              )}
              {!isViewerMode && (
                <button
                  onClick={(e) => { e.stopPropagation(); editQuestion(id, data.question); }}
                  className="ml-auto bg-card border border-red-200 hover:bg-red-100 text-red-600 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1"
                >
                  <RefreshCw size={12} strokeWidth={1.75} /> {t('common.retry')}
                </button>
              )}
            </div>
          )}

          {/* Branch context indicator when branching from selection */}
          {branchFromText && (
            <div className="mt-3 text-xs pl-3 py-2 pr-2 border-l-3 border-accent bg-accent/5 rounded-r">
              <span className="text-accent font-medium"><GitBranch size={14} strokeWidth={1.75} className="inline" /> {t('node.exploringFrom')}</span>
              <p className="text-ink-muted mt-1 leading-relaxed">&ldquo;{branchFromText.slice(0, 150)}{branchFromText.length > 150 ? '...' : ''}&rdquo;</p>
            </div>
          )}

          {/* Inline continue input — hidden while a paradigm run is in
              progress (the structure IS the paradigm); returns on unlock */}
          {!data.isLoading && !data.isEditingResponse && !isAwaitingAsk && !(isParadigmNode && runLocked) && !isViewerMode && selectedNodeId !== id && (
            <div className="mt-3 pt-3 border-t border-line relative">
              <MentionSurface m={mention} text={inputValue} setText={setInputValue} />
              <div className="flex items-end gap-2 bg-wash rounded-xl px-4 py-2.5 transition-shadow focus-within:ring-1 focus-within:ring-accent/40">
                <textarea
                  rows={1}
                  ref={mention.bindAnchor}
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    mention.track(e.target.value, e.target.selectionStart ?? e.target.value.length);
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={handleInputKeyDown}
                  placeholder={t('common.followUp')}
                  className="flex-1 bg-transparent text-sm text-ink placeholder-ink-faint focus:outline-none resize-none leading-relaxed max-h-[120px] overflow-y-auto nowheel nopan nodrag"
                />
                <SearchToggles size={15} />
                <button
                  onClick={handleSubmitBranch}
                  disabled={!inputValue.trim()}
                  className="text-ink-faint hover:text-accent disabled:opacity-30 disabled:hover:text-ink-faint transition-colors shrink-0 rounded-full w-7 h-7 flex items-center justify-center hover:bg-line"
                >
                  <Send size={18} strokeWidth={1.75} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Collapsed view — question + summary */}
      {data.isCollapsed && (
        <div className="px-5 py-3">
          <div className="text-sm text-ink font-semibold truncate flex items-center gap-1.5">
            {data.question.slice(0, 80)}{data.question.length > 80 ? '…' : ''}
            {(data.attachments?.length > 0) && (
              <span className="text-2xs bg-wash text-ink-muted px-1.5 py-0.5 rounded-full shrink-0"><Paperclip size={12} strokeWidth={1.75} className="inline" />{data.attachments.length}</span>
            )}
            {(data.references?.length ?? 0) > 0 && (
              <span className="text-2xs bg-wash text-ink-muted px-1.5 py-0.5 rounded-full shrink-0"><Globe size={12} strokeWidth={1.75} className="inline" /> {data.references!.length}</span>
            )}
          </div>
          {versionSummary ? (
            <div className="text-xs text-ink-faint mt-1.5 leading-relaxed line-clamp-2">
              {versionSummary}
            </div>
          ) : data.response ? (
            <div className="text-xs text-ink-faint mt-1.5 leading-relaxed line-clamp-2 italic">
              {data.response.replace(/[#*`>-]/g, '').slice(0, 120)}{data.response.length > 120 ? '…' : ''}
            </div>
          ) : null}
        </div>
      )}

      </>
      )}

      <Handle type="source" position={Position.Bottom} id="continue" className={`!bg-accent !border-2 !border-white tdag-handle ${zoomedOut ? '!w-6 !h-6 tdag-handle-lg' : '!w-3.5 !h-3.5'}`} />
      <Handle
        type="source"
        position={Position.Right}
        id="branch"
        isConnectable={false}
        className="!bg-transparent !w-0 !h-0 !border-0 !pointer-events-none"
        style={glyphTier ? { top: '50%', left: 'calc(50% + 56px)', right: 'auto' } : { top: '50%' }}
      />

      {/* Floating toolbar for text selection */}
      {selectedText && selectionPos && (
        <div
          style={{
            position: 'absolute',
            left: Math.max(0, Math.min(selectionPos.x, 400)),
            top: Math.max(-40, selectionPos.y),
            transform: 'translateX(-50%)',
            zIndex: 9999,
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          <div className="flex gap-1 bg-card border border-line rounded-xl shadow-lg p-1 animate-fade-in">
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleBranch(); }}
              className="bg-accent hover:bg-accent-strong text-white text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer"
            >
              <GitBranch size={14} strokeWidth={1.75} className="inline" /> {t('common.explore')}
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); handleHighlight(); }}
              className="bg-amber-500 hover:bg-amber-400 text-white text-xs px-3 py-1.5 rounded-lg transition-all whitespace-nowrap cursor-pointer"
            >
              <Star size={14} strokeWidth={1.75} className="inline" /> {t('common.highlight')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
