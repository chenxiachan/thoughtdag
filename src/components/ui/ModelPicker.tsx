import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Cpu, KeyRound, RefreshCw, Info, Loader2, ChevronRight, Scale } from 'lucide-react';
import { toast, useUiStore } from '../../lib/ui-store';
import { profileLines } from '../../lib/profile';
import { useModels, setModelsCache, ensureAgentsFresh, recheckAgents, type ModelInfo } from '../../lib/use-models';
import { AGENT_PROVIDER, AGENT_RUNTIMES, LIVE_RUNTIMES, isAgentModel, runtimeOf } from '../../lib/agents/agent-runtime';
import { JUDGE_LABELS, effectiveProvider, judgeConfigured, judgeTripped } from '../../lib/judge';

// Agent-run models fold by runtime: each runtime lists many models, so only
// the runtime holding the current pick opens by itself; the others show their
// name, count and a chevron. Which are open is remembered.
const OPEN_RUNTIMES_KEY = 'thoughtdag.pickerOpenRuntimes';
const runtimeLabelOf = (id: string): string => { const rt = runtimeOf(id); if (rt) return AGENT_RUNTIMES[rt].label; if (id.startsWith('harness/')) return 'Harness'; return id.split('/')[0] || 'agent'; };
const loadOpenRuntimes = (): Set<string> => { try { const v = JSON.parse(localStorage.getItem(OPEN_RUNTIMES_KEY) ?? '[]'); return new Set(Array.isArray(v) ? v : []); } catch { return new Set(); } };
import { refreshStoredProviders, pushProviders, storedProviders } from '../../lib/runtime-providers';
import { IN_HARNESS } from '../../lib/embedded';
import { apiVisionModels } from '../../lib/background-model';
import { fmt } from '../../i18n';
import { useT } from '../../i18n';

interface PickerProps {
  /** Node mode: controlled value (undefined = inherit global) + change handler. */
  value?: string;
  onChange?: (id: string | undefined) => void;
  /** Compact styling for embedding in panel rows. */
  compact?: boolean;
}

// Dropdown listing every model the server registered (driven by which API
// keys exist in .env), grouped by provider. Without props it edits the
// GLOBAL selection; with value/onChange it edits a per-node override and
// offers an "inherit" entry.
export default function ModelPicker({ value, onChange, compact }: PickerProps) {
  const t = useT();
  const nodeMode = !!onChange;
  const selectedModel = useUiStore((s) => s.selectedModel);
  const setSelectedModel = useUiStore((s) => s.setSelectedModel);
  const data = useModels();
  const [open, setOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  // the effort step unfolded under a just-picked agent model (see pick); closes with the menu
  const [effortStepFor, setEffortStepFor] = useState<string | null>(null);
  const agentEffort = useUiStore((s) => s.agentEffort);
  const [openRuntimes, setOpenRuntimes] = useState<Set<string>>(loadOpenRuntimes);
  const toggleRuntime = (label: string) => setOpenRuntimes((prev) => { const next = new Set(prev); if (next.has(label)) next.delete(label); else next.add(label); try { localStorage.setItem(OPEN_RUNTIMES_KEY, JSON.stringify([...next])); } catch { /* per-session then */ } return next; });
  const rootRef = useRef<HTMLDivElement>(null);

  // the runtimes are asked for their catalogs the first time a picker
  // opens, not at launch: a CLI to start is seconds and memory the launch
  // should not pay for
  useEffect(() => { if (open) ensureAgentsFresh(); }, [open]);
  // …except on an install with no model at all: the button is then the
  // "connect a model" door and the picker never opens, so the agents on this
  // machine would never be asked — a fresh profile with Pi installed saw only
  // "connect a model". Asking once here costs what opening the picker costs.
  const bare = !nodeMode && (data?.models.length ?? 0) === 0 && typeof window !== 'undefined' && !!window.desktopAgents;
  useEffect(() => { if (bare) ensureAgentsFresh(); }, [bare]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  // A successful connect pings the GLOBAL picker open: the user lands on
  // their fresh model list instead of wondering whether anything happened.
  // (adjust-during-render, same pattern as FocusPanel's node switch)
  const ping = useUiStore((s) => s.modelPickerPing);
  const [pingSeen, setPingSeen] = useState(ping);
  if (ping !== pingSeen) {
    setPingSeen(ping);
    if (!nodeMode) setOpen(true);
  }

  const models = data?.models ?? [];
  // Node mode: with one model there is nothing to pin. The GLOBAL picker
  // stays even when the list fetch failed outright (proxy not running) —
  // its empty state IS the connect-a-model door, and a vanished picker
  // would leave the canvas with no way into model setup at all.
  if (nodeMode && models.length < 2) return null;

  // Empty install: the picker IS the call to action. A grey "no model"
  // label reads as a dead control; a keyed accent button reads as the door.
  const noModels = !nodeMode && models.length === 0;
  const agentsAsked = !!data?.runtimes && Object.keys(data.runtimes).length > 0;

  const globalId = selectedModel && models.some((m) => m.id === selectedModel) ? selectedModel : data?.default;
  const activeId = nodeMode ? (value ?? null) : globalId;
  const active = activeId ? models.find((m) => m.id === activeId) : null;
  const providers = [...new Set(models.map((m) => m.provider))];
  // the agent group is listed while the runtimes are still answering, so the
  // picker has somewhere to say so
  if (data?.agentsPending && !providers.includes(AGENT_PROVIDER)) providers.push(AGENT_PROVIDER);
  // a host that looked for runtimes and found none still gets the group: that is where the "not found" rows live
  if (!providers.includes(AGENT_PROVIDER) && data?.runtimes && Object.values(data.runtimes).some((s) => s && !s.installed)) providers.push(AGENT_PROVIDER);


  // Picking an agent model that reports effort levels keeps the menu open and
  // unfolds the effort step right under the entry: the level is a decision the
  // person should see being made, not a row to discover later. OK closes.
  const pick = (id: string | null) => {
    if (nodeMode) onChange!(id ?? undefined);
    else setSelectedModel(id === data?.default ? null : id);
    const m = id ? models.find((x) => x.id === id) : null;
    if (m && isAgentModel(m.id) && (m.efforts?.length ?? 0) > 0) { setEffortStepFor(m.id); return; }
    setOpen(false);
  };
  // the level the next turn will run at, as far as the runtime told us
  const effortWord = (m: ModelInfo | null | undefined): string => {
    if (!m || !isAgentModel(m.id) || !m.efforts?.length) return '';
    return m.efforts.includes(agentEffort) ? agentEffort : (m.defaultEffort ?? '');
  };
  const withEffort = (m: ModelInfo) => (effortWord(m) ? `${m.name} · ${effortWord(m)}` : m.name);

  // a node without its own choice follows the global one: the button still
  // names that model in full (agent · model · effort), the tint says it is inherited
  const globalActive = globalId ? models.find((m) => m.id === globalId) : null;
  const label = nodeMode
    ? (active ? withEffort(active) : (globalActive ? withEffort(globalActive) : t('model.inherit')))
    : (active ? withEffort(active) : (activeId ?? (models.length === 0 ? t('model.none') : null)));

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={(e) => {
          e.stopPropagation();
          // no model yet: the door is the key dialog — unless the host looked for
          // agent CLIs, in which case the picker has something to say (which
          // runtime it did not find, and where; plus the same key entry)
          if (noModels && !agentsAsked) useUiStore.getState().setApiKeyModalOpen(true);
          else { setEffortStepFor(null); setOpen((v) => !v); }
        }}
        className={compact
          ? `text-xs px-3 py-2 rounded-lg transition-colors flex items-center gap-1.5 max-w-[200px] ${value ? 'bg-accent/10 text-accent' : 'bg-wash hover:bg-line text-ink-muted'}`
          : noModels
            ? 'bg-accent/10 backdrop-blur border border-accent/40 rounded-lg h-8 px-2.5 flex items-center gap-1.5 shadow-sm hover:bg-accent/20 transition-colors text-accent max-w-[190px]'
            : 'bg-card/90 backdrop-blur border border-line rounded-lg h-8 px-2.5 flex items-center gap-1.5 shadow-sm hover:bg-wash transition-colors text-ink-muted max-w-[190px]'}
        title={noModels ? t('apikey.entryTitle') : nodeMode && !value ? t('model.inherit') : t('toolbar.model')}
        data-apikey-entry={noModels || undefined}
      >
        {noModels
          ? (data?.agentsPending ? <Loader2 size={14} strokeWidth={1.75} className="shrink-0 animate-spin" /> : <KeyRound size={14} strokeWidth={1.75} className="shrink-0" />)
          : <Cpu size={14} strokeWidth={1.75} className={`shrink-0 ${compact && !value ? '' : 'text-accent'}`} />}
        <span className="text-xs truncate font-medium">{noModels ? t('model.connectCta') : label}</span>
        {!noModels && <ChevronDown size={12} strokeWidth={1.75} className="shrink-0" />}
      </button>

      {open && (
        // Both placements drop DOWN: the compact picker lives in the panel
        // header now (an upward menu would fly off the viewport top)
        <div className="absolute top-9 right-0 bg-card border border-line rounded-xl shadow-xl py-1.5 w-80 max-h-[60vh] overflow-y-auto z-30">
          {nodeMode && (
            <button
              onClick={() => pick(null)}
              className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-wash ${!value ? 'text-accent font-medium' : 'text-ink'}`}
            >
              <span className="truncate flex-1">{t('model.inherit')}</span>
              {!value && <Check size={13} strokeWidth={2} className="shrink-0" />}
            </button>
          )}
          {!nodeMode && <p className="text-2xs text-ink-faint uppercase tracking-wider font-medium px-3 pt-2 pb-0.5" data-picker-answer-header>{t('model.answerGroup')}</p>}
          {providers.map((provider) => (
            <div key={provider}>
              <p className="text-2xs text-ink-faint uppercase tracking-wider font-medium px-3 pt-2 pb-1 flex items-center gap-1.5" title={provider === AGENT_PROVIDER ? t('model.agentGroupHint') : undefined}>
                {provider === AGENT_PROVIDER ? t('model.agentGroup') : provider}
                {provider === AGENT_PROVIDER && <Info size={11} strokeWidth={1.75} className="text-ink-faint/70" data-agent-group-hint />}
                {provider === AGENT_PROVIDER && data?.agentsPending && <Loader2 size={11} className="animate-spin text-ink-faint" data-agent-group-pending />}
              </p>
              {provider === AGENT_PROVIDER && data?.agentsPending && models.filter((m) => m.provider === AGENT_PROVIDER).length === 0 && (
                <p className="text-2xs text-ink-faint px-3 pb-1.5">{t('model.agentGroupLoading')}</p>
              )}
              {provider === AGENT_PROVIDER ? (() => {
                const agentModels = models.filter((m) => m.provider === AGENT_PROVIDER);
                const groups = new Map<string, ModelInfo[]>();
                for (const m of agentModels) { const label = runtimeLabelOf(m.id); const list = groups.get(label) ?? []; list.push(m); groups.set(label, list); }
                const activeLabel = activeId ? runtimeLabelOf(activeId) : null;
                // runtimes the host looked for and did not find: named, with where it looked, and a way to ask again
                const missing = LIVE_RUNTIMES.filter((rt) => data?.runtimes?.[rt] && !data.runtimes[rt]!.installed && !groups.has(AGENT_RUNTIMES[rt].label));
                const missingRows = missing.map((rt) => {
                  const st = data!.runtimes![rt]!; const def = AGENT_RUNTIMES[rt]; const bin = def.prefix.replace(/\/$/, '');
                  const hint = fmt(t('model.runtimeMissingHint'), { bin, dirs: (st.searched ?? []).join('\n') || '—' });
                  return (
                    <div key={`missing-${rt}`} className="px-3 py-1.5 text-xs flex items-center gap-2 text-ink-faint" title={st.error ? `${hint}\n${st.error}` : hint} data-runtime-missing={rt}>
                      <span className="w-3 shrink-0" />
                      <span className="truncate">{fmt(t('model.runtimeMissing'), { name: def.label })}</span>
                      <Info size={11} strokeWidth={1.75} className="shrink-0 text-ink-faint/70" />
                      <button onClick={(e) => { e.stopPropagation(); void recheckAgents(); }} className="ml-auto text-2xs text-accent hover:underline shrink-0" data-runtime-recheck={rt}>{t('model.recheck')}</button>
                    </div>
                  );
                });
                return [...[...groups.entries()].map(([label, list]) => {
                  const isOpen = openRuntimes.has(label) || label === activeLabel || groups.size === 1;
                  const current = list.find((m) => m.id === activeId);
                  return (
                    <div key={label} data-runtime-group={label} data-runtime-open={isOpen ? 'open' : 'closed'}>
                      <button onClick={() => toggleRuntime(label)} className="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-wash transition-colors text-ink-muted" data-runtime-toggle={label}>
                        {isOpen ? <ChevronDown size={12} strokeWidth={1.75} className="text-ink-faint shrink-0" /> : <ChevronRight size={12} strokeWidth={1.75} className="text-ink-faint shrink-0" />}
                        <span className="font-medium text-ink">{label}</span>
                        <span className="text-2xs text-ink-faint">{list.length}</span>
                        {!isOpen && current && <span className="text-2xs text-accent truncate ml-auto max-w-[55%]">{current.name.replace(`${label} · `, '')}</span>}
                      </button>
                      {isOpen && list.map((m, i) => (
                        <div key={m.id}>
                          {/* a runtime serving models through several providers lists them under each provider (#97);
                              the runtime's order is kept within a provider */}
                          {m.vendor && m.vendor !== list[i - 1]?.vendor && (
                            <p className="pl-8 pr-3 pt-1.5 pb-0.5 text-2xs text-ink-faint truncate" data-runtime-vendor={m.vendor}>{m.vendor}</p>
                          )}
                          <button
                            onClick={() => pick(m.id)}
                            title={m.name}
                            className={`w-full text-left pl-8 pr-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-wash ${m.id === activeId ? 'text-accent font-medium' : 'text-ink'}`}
                          >
                            <span className="flex-1 break-words leading-snug">{m.name.replace(` (${m.vendor ?? m.provider})`, '').replace(`${label} · `, '')}</span>
                            {m.vision && <span className="text-2xs text-ink-faint shrink-0">{t('model.vision')}</span>}
                            {m.id === activeId && <Check size={13} strokeWidth={2} className="shrink-0" />}
                          </button>
                          {effortStepFor === m.id && <EffortStep model={m} onDone={() => { setEffortStepFor(null); setOpen(false); }} />}
                        </div>
                      ))}
                    </div>
                  );
                }), ...missingRows];
              })() : models.filter((m) => m.provider === provider).map((m) => (
                <div key={m.id}>
                <button
                  onClick={() => pick(m.id)}
                  title={m.name}
                  className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-wash ${
                    m.id === activeId ? 'text-accent font-medium' : 'text-ink'
                  }`}
                >
                  {/* agent entries carry runtime · model · variant and tell apart only by
                      their tail, so they wrap instead of losing it to an ellipsis (#43) */}
                  <span className={provider === AGENT_PROVIDER ? 'flex-1 break-words leading-snug' : 'truncate flex-1'}>{m.name.replace(` (${m.provider})`, '')}</span>
                  {m.vision && <span className="text-2xs text-ink-faint shrink-0">{t('model.vision')}</span>}
                  {m.id === activeId && <Check size={13} strokeWidth={2} className="shrink-0" />}
                </button>
                {effortStepFor === m.id && <EffortStep model={m} onDone={() => { setEffortStepFor(null); setOpen(false); }} />}
              </div>
              ))}
            </div>
          ))}
          {!nodeMode && <JudgeRow onOpen={() => { setOpen(false); useUiStore.getState().setApiKeyModalOpen(true, 'judge'); }} />}
          {!nodeMode && (
            <div className="flex items-center pr-1 border-t border-line mt-1 pt-1">
            <span className="text-2xs text-ink-faint uppercase tracking-wider font-medium px-3 py-1.5 shrink-0">{t('model.interfaces')}</span>
            {<button
              onClick={() => { setOpen(false); useUiStore.getState().setApiKeyModalOpen(true); }}
              className={`flex-1 text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors hover:bg-wash ${
                models.length === 0 ? 'text-accent font-medium' : 'text-ink-muted'
              }`}
              data-picker-apikey
            >
              <KeyRound size={13} strokeWidth={1.75} className="shrink-0" /> {t('apikey.entryTitle')}
            </button>}
            <button
              onClick={() => {
                setRefreshing(true);
                void refreshStoredProviders()
                  .then((d) => { if (d) setModelsCache(d); })
                  .finally(() => setRefreshing(false));
              }}
              disabled={refreshing}
              title={t('model.refreshList')}
              className="w-6 h-6 rounded-full flex items-center justify-center text-ink-faint hover:text-accent hover:bg-wash transition-colors shrink-0"
              data-model-refresh
            >
              <RefreshCw size={12} strokeWidth={1.75} className={refreshing ? 'animate-spin' : ''} />
            </button>
            </div>
          )}
          {!nodeMode && <GlobalCapabilities />}
        </div>
      )}
    </div>
  );
}

// ── The decision model's row: one switch, one line of state, the dialog a click away ──
function JudgeRow({ onOpen }: { onOpen: () => void }) {
  const t = useT();
  const judgeCfg = useUiStore((s) => s.judge);
  const setJudge = useUiStore((s) => s.setJudge);
  const on = judgeCfg.provider !== 'off';
  const configured = judgeConfigured(judgeCfg);
  const tripped = judgeTripped();
  const state = !on ? t('judge.stateOff') : !configured ? t('judge.stateNoApi') : tripped ? t('judge.stateTripped') : fmt(t('judge.stateOn'), { j: JUDGE_LABELS[effectiveProvider(judgeCfg)] });
  return (
    <div className="border-t border-line mt-1 pt-1" data-picker-judge-row data-judge-state={!on ? 'off' : !configured ? 'no-api' : tripped ? 'tripped' : 'on'}>
      <div className="px-3 py-1.5 flex items-center gap-2">
        <button onClick={onOpen} className="flex-1 min-w-0 text-left flex items-center gap-2 group" title={t('judge.does')} data-picker-judge>
          <Scale size={13} strokeWidth={1.75} className="shrink-0 text-accent" />
          <span className="min-w-0">
            <span className="block text-xs text-ink font-medium group-hover:text-accent">{t('judge.rowTitle')}</span>
            <span className="block text-2xs text-ink-faint truncate">{state}{on && !configured ? <span className="text-accent ml-1">{t('judge.goConfigure')}</span> : null}</span>
          </span>
        </button>
        <button role="switch" aria-checked={on} onClick={(e) => { e.stopPropagation(); setJudge({ provider: on ? 'off' : 'none' }); }} className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${on ? 'bg-accent' : 'bg-line-strong'}`} data-picker-judge-toggle>
          <span className={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-3.5' : ''}`} />
        </button>
      </div>
    </div>
  );
}

// ── Effort step: unfolds under the agent model just picked ──
// The runtime's own levels, in its own words (read from the CLI, never
// translated). The first option is its default, named when it says. The
// choice is global like the model choice; OK closes the menu.
function EffortStep({ model, onDone }: { model: ModelInfo; onDone: () => void }) {
  const t = useT();
  const effort = useUiStore((s) => s.agentEffort);
  const setEffort = useUiStore((s) => s.setAgentEffort);
  const levels = model.efforts ?? [];
  const value = levels.includes(effort) ? effort : '';
  return (
    <div className="mx-3 mb-1.5 mt-0.5 rounded-lg bg-wash/70 border border-line px-2 py-1.5 flex items-center gap-2" title={t('model.effortHint')} data-agent-effort>
      <span className="text-2xs text-ink-faint uppercase tracking-wider font-medium shrink-0">{t('model.effort')}</span>
      <select
        value={value}
        onChange={(e) => setEffort(e.target.value)}
        onClick={(e) => e.stopPropagation()}
        autoFocus
        className="flex-1 min-w-0 text-2xs text-ink bg-card border border-line rounded-md px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-accent/40"
        data-agent-effort-select
      >
        <option value="">{model.defaultEffort ? fmt(t('model.effortDefaultKnown'), { level: model.defaultEffort }) : t('model.effortDefault')}</option>
        {levels.map((l) => <option key={l} value={l}>{l}</option>)}
      </select>
      <button onClick={(e) => { e.stopPropagation(); onDone(); }} className="text-2xs px-2 py-1 rounded-md bg-accent text-white hover:bg-accent/90 transition-colors shrink-0" data-agent-effort-ok>{t('model.effortConfirm')}</button>
    </div>
  );
}

// ── Capabilities: the engine-room report at the picker's foot ──
// What this installation can do, what is missing (the ONLY place that
// hints at hidden features), and the one extra model choice: which
// vision model reads images and recognizes scanned pages.
const CAPS_OPEN_KEY = 'thoughtdag.pickerCapsOpen';
function GlobalCapabilities() {
  const t = useT();
  const [capsOpen, setCapsOpen] = useState<boolean>(() => { try { return localStorage.getItem(CAPS_OPEN_KEY) === 'open'; } catch { return false; } });
  const data = useModels();
  const visionModelPref = useUiStore((s) => s.visionModelPref);
  const setVisionModelPref = useUiStore((s) => s.setVisionModelPref);
  const searchEnginePref = useUiStore((s) => s.searchEnginePref);
  const setSearchEnginePref = useUiStore((s) => s.setSearchEnginePref);
  const anysearchKey = useUiStore((s) => s.anysearchKey);
  const [anysearchDraft, setAnysearchDraft] = useState(anysearchKey);
  const saveAnysearchKey = async () => {
    const k = anysearchDraft.trim();
    if (k === anysearchKey) return;
    useUiStore.getState().setAnysearchKey(k);
    toast('success', t(k ? 'caps.anysearchSaved' : 'caps.anysearchCleared'));
    // capability refresh so the hosted worker re-reports the engine
    if (storedProviders().length > 0) {
      try { setModelsCache(await pushProviders(storedProviders())); } catch { /* best-effort */ }
    }
  };
  const memoryEnabled = useUiStore((s) => s.memoryEnabled);
  const setMemoryEnabled = useUiStore((s) => s.setMemoryEnabled);
  const memoryCount = useUiStore((s) => profileLines(s.profile).length);
  const setMemoryManagerOpen = useUiStore((s) => s.setMemoryManagerOpen);
  const caps = data?.capabilities;
  // the image readers: an agent sees images inside its own runs, it does not read one for the canvas
  const visionModels = apiVisionModels(data?.models ?? []);
  // an old proxy / offline fetch reports nothing — say nothing, not "missing"
  if (!caps) return null;
  const hasVision = visionModels.length > 0;
  const dot = (on: boolean) => (
    <span className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${on ? 'bg-emerald-500' : 'bg-line-strong'}`} />
  );
  const anysearchKeyRow = (hintKey: 'caps.anysearchHintQuota' | 'caps.anysearchHintEnable') => (
    <div className="mt-1">
      <input
        type="password"
        value={anysearchDraft}
        onChange={(e) => setAnysearchDraft(e.target.value)}
        onBlur={() => void saveAnysearchKey()}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        onClick={(e) => e.stopPropagation()}
        placeholder={t('caps.anysearchKeyPlaceholder')}
        data-anysearch-key
        className="w-full text-2xs text-ink-muted bg-wash border border-line rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/40 placeholder-ink-faint font-mono"
      />
      <p className="text-2xs text-ink-faint leading-relaxed mt-0.5">
        {t(hintKey)}{' '}
        <a href="https://www.anysearch.com" target="_blank" rel="noreferrer" className="text-accent hover:underline" onClick={(e) => e.stopPropagation()}>anysearch.com</a>
      </p>
    </div>
  );
  return (
    <div className="border-t border-line mt-1.5 pt-1 pb-1" data-picker-caps data-picker-caps-open={capsOpen ? 'open' : 'closed'}>
      <button onClick={() => setCapsOpen((v) => { try { localStorage.setItem(CAPS_OPEN_KEY, v ? 'closed' : 'open'); } catch { /* per-session */ } return !v; })} className="w-full text-left px-3 pt-1 pb-1 flex items-center gap-1.5 hover:bg-wash transition-colors" data-picker-caps-toggle>
        {capsOpen ? <ChevronDown size={12} strokeWidth={1.75} className="text-ink-faint" /> : <ChevronRight size={12} strokeWidth={1.75} className="text-ink-faint" />}
        <span className="text-2xs text-ink-faint uppercase tracking-wider font-medium">{t('caps.title')}</span>
        {!capsOpen && <span className="ml-auto flex items-center gap-1.5">{dot(!!caps?.webSearch)}<span className="text-2xs text-ink-faint">{t('caps.webSearch')}</span>{dot(memoryEnabled)}<span className="text-2xs text-ink-faint">{t('caps.memory')}</span></span>}
      </button>
      {capsOpen && <>
      <div className="px-3 py-1 flex items-start gap-2">
        {dot(!!caps?.webSearch)}
        <div className="flex-1 min-w-0">
          <p className="text-2xs text-ink-muted font-medium">{t('caps.webSearch')}</p>
          {/* inside the harness the host's own web search serves its models
              (its service is set in the harness), an own OpenRouter interface
              searches as :online; the engine picker and the AnySearch key
              would be dead controls there (#72) */}
          {caps?.webSearch && IN_HARNESS ? (
            <p className="text-2xs text-ink-faint leading-relaxed mt-0.5">{t('caps.webSearchViaInterface')}</p>
          ) : caps?.webSearch ? (
            <select
              value={searchEnginePref}
              onChange={(e) => setSearchEnginePref(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              title={t('caps.enginePickTitle')}
              className="mt-1 w-full text-2xs text-ink-muted bg-wash border border-line rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/40"
            >
              <option value="server">{fmt(t('caps.engineServer'), { engine: caps.searchEngine })}</option>
              <option value="search_std">{t('caps.engineStd')}</option>
              <option value="search_pro">{t('caps.enginePro')}</option>
              {(caps.anysearch || anysearchKey) && <option value="anysearch">{t('caps.engineAnysearch')}</option>}
              {(caps.deepseekSearch || searchEnginePref === 'deepseek') && <option value="deepseek">{t('caps.engineDeepseek')}</option>}
            </select>
          ) : (
            <p className="text-2xs text-ink-faint leading-relaxed mt-0.5">{t(IN_HARNESS ? 'caps.webSearchOffHost' : 'caps.webSearchOff')}</p>
          )}
          {!IN_HARNESS && caps?.webSearch && searchEnginePref === 'anysearch' && anysearchKeyRow('caps.anysearchHintQuota')}
          {!IN_HARNESS && caps?.webSearch && searchEnginePref === 'deepseek' && (
            <p className="text-2xs text-ink-faint leading-relaxed mt-0.5" data-deepseek-search-hint>{t(caps.deepseekSearch ? 'caps.deepseekHintBilled' : 'caps.deepseekHintNoKey')}</p>
          )}
          {!IN_HARNESS && !caps?.webSearch && anysearchKeyRow('caps.anysearchHintEnable')}
        </div>
      </div>
      <div className="px-3 py-1 flex items-start gap-2">
        {dot(true)}
        <p className="text-2xs text-ink-faint leading-relaxed flex-1">
          <span className="text-ink-muted font-medium">{t('caps.scholar')}</span>{' · '}{t('caps.scholarDesc')}
        </p>
      </div>
      <div className="px-3 py-1 flex items-start gap-2">
        {dot(memoryEnabled)}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          <p className="text-2xs text-ink-muted font-medium flex-1">
            {t('caps.memory')}
            <span className="text-ink-faint font-normal"> · {memoryCount}</span>
          </p>
          <button
            onClick={(e) => { e.stopPropagation(); setMemoryManagerOpen(true); }}
            className="text-2xs text-ink-faint hover:text-accent underline decoration-dotted transition-colors shrink-0"
          >
            {t('memory.manage')}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); setMemoryEnabled(!memoryEnabled); }}
            title={t('caps.memoryTitle')}
            className={`text-2xs px-2 py-0.5 rounded-full transition-colors shrink-0 ${memoryEnabled ? 'bg-accent/10 text-accent' : 'bg-wash text-ink-faint'}`}
          >
            {memoryEnabled ? t('caps.on') : t('caps.off')}
          </button>
        </div>
      </div>
      <div className="px-3 py-1 flex items-start gap-2">
        {dot(hasVision)}
        <div className="flex-1 min-w-0">
          <p className="text-2xs text-ink-muted font-medium">{t('caps.vision')}</p>
          {hasVision ? (
            <select
              value={visionModels.some((m) => m.id === visionModelPref) ? visionModelPref : 'auto'}
              onChange={(e) => setVisionModelPref(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              title={t('caps.visionPickTitle')}
              className="mt-1 w-full text-2xs text-ink-muted bg-wash border border-line rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent/40"
            >
              <option value="auto">{t('caps.visionAuto')}</option>
              {visionModels.map((m) => (
                <option key={m.id} value={m.id}>{m.id.split('/').pop()}</option>
              ))}
            </select>
          ) : (
            <p className="text-2xs text-ink-faint leading-relaxed mt-0.5">{t('caps.visionOff')}</p>
          )}
        </div>
      </div>
      </>}
    </div>
  );
}
