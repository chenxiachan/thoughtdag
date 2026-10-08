// The desktop shell's preload bridge (desktop/preload.js). Absent on the
// web app — presence of window.desktop IS the "running in the shell" test.
// Methods beyond checkForUpdates are optional: an older shell may pair with
// a newer page during dev; the page degrades to the shell's own dialogs.
interface DesktopUpdateEvent {
  kind: 'available' | 'downloading' | 'ready' | 'latest' | 'check-failed' | 'download-failed' | 'dev';
  version?: string;
  percent?: number;
}

interface DesktopBridge {
  checkForUpdates: () => Promise<void>;
  downloadUpdate?: () => Promise<void>;
  installUpdate?: () => Promise<void>;
  onUpdateEvent?: (cb: (e: DesktopUpdateEvent) => void) => void;
}

// Fenced read-only primitives over the runner session stores (main.js
// SESSION_ROOTS). All runner knowledge lives in src/lib/atlas/.
interface SessionRoot {
  key: string;
  path: string;
  builtin: boolean;
  exists: boolean;
}

interface DesktopSessionsBridge {
  roots: () => Promise<SessionRoot[]>;
  /** Native directory picker — the ONLY door into the whitelist. */
  addRoot: () => Promise<SessionRoot | null>;
  removeRoot: (key: string) => Promise<void>;
  list: (rootKey: string) => Promise<{ rel: string; size: number; mtime: number }[]>;
  head: (rootKey: string, rel: string, bytes: number) => Promise<string>;
  read: (rootKey: string, rel: string) => Promise<string>;
  /** Line-aligned chunked read — the road for sessions too big for one string. */
  readRange: (rootKey: string, rel: string, start: number, length: number) => Promise<{ text: string; nextStart: number; eof: boolean }>;
  openInCli: (runner: string, cwd: string | null, sessionId: string, mode: 'app' | 'terminal') => Promise<{ opened: boolean; via: 'app' | 'terminal' | ''; command: string }>;
  openTargets: () => Promise<{
    terminals: { id: string; name: string; custom: boolean }[];
    apps: { runner: string; name: string }[];
    prefs: { terminal: string };
    canAddCustom: boolean;
  }>;
  setOpenPrefs: (prefs: { terminal: string }) => Promise<{ terminal: string }>;
  /** Native app picker (macOS) — a user-chosen terminal app joins the registry. */
  addTerminal: () => Promise<{ id: string; name: string } | null>;
  /** One-command handoff installer: ships /thoughtdag ($thoughtdag)
      into the agent's own commands directory, with content-compare
      status and clean removal. */
  commandsStatus?: () => Promise<Record<string, { state: 'installed' | 'outdated' | 'absent' | 'unavailable'; dest: string; invoke: string }>>;
  commandsInstall?: (runner: string) => Promise<{ ok: boolean; dest?: string; error?: string }>;
  commandsRemove?: (runner: string) => Promise<{ ok: boolean; error?: string }>;
  /** Codex app-server read path (Tier 2): real thread names, fork
      lineage, full turns. null whenever the codex CLI is absent. */
  codexThreads?: () => Promise<{
    id: string; sessionId: string; name: string | null; preview: string;
    forkedFromId: string | null; parentThreadId: string | null;
    updatedAt: string | null; cwd: string | null; path: string | null;
  }[] | null>;
  codexThreadRead?: (threadId: string) => Promise<unknown | null>;
  /** thoughtdag:// deep links: push while running, pull once at startup. */
  onDeepLink?: (cb: (url: string) => void) => void;
  pendingDeepLink?: () => Promise<string | null>;
  /** Start watching all live roots; events arrive via onSessionsChanged. */
  watchStart: () => Promise<boolean>;
  onSessionsChanged: (cb: (e: { rootKey: string; rel: string }) => void) => void;
}

/** Local paths a response mentions, opened on this machine. */
interface DesktopLocalBridge {
  open(path: string): Promise<{ ok: boolean; kind?: 'dir' | 'file'; opened?: 'viewer' | 'finder'; reason?: string }>;
  /** data URL for an image file (images only, bounded), null otherwise */
  image(path: string): Promise<string | null>;
}

/** The canvas's own source record for the why layer, kept by the shell
 *  under <thoughtdag home>/canvases/. */
interface DesktopCanvasBridge {
  write(projectId: string, json: string): Promise<{ ok: boolean; file?: string; reason?: string }>;
  remove(projectId: string): Promise<{ ok: boolean }>;
}

/** An agent runtime the shell can hand a turn to (Pi today): its models,
 *  a run on a working directory, the run's events, an abort. */
interface DesktopAgentModel {
  provider: string;
  id: string;
  name: string;
  reasoning: boolean;
  vision: boolean;
  /** the effort levels the runtime accepts for this model, in its own words (read from the CLI); empty = none */
  efforts?: string[];
  /** the runtime's own default among them, when it says */
  defaultEffort?: string | null;
}

interface DesktopAgentRunRequest {
  /** which runtime runs the turn (default: pi) */
  runtime?: 'pi' | 'codex' | 'claude-code';
  /** absolute working directory the agent runs in */
  cwd: string;
  prompt: string;
  images?: { type: 'image'; data: string; mimeType: string }[];
  /** continue this session file (absolute path) instead of opening a fresh one */
  sessionPath?: string;
  /** branch the current session at this entry (with sessionPath) */
  forkEntryId?: string;
  model?: { provider: string; id: string };
  /** an effort level in the runtime's own words (one it listed for the model); absent or unknown = the runtime's default */
  effort?: string;
  thinkingLevel?: string;
  /** rules this conversation already allowed for good (the `rule` of earlier approvals): a matching ask is allowed without asking, on the record */
  allowRules?: string[];
}

interface DesktopAgentsBridge {
  /** what this host can do beyond the calls: a native folder dialog */
  capabilities?: { nativePicker: boolean };
  /** where the runtime's binary is, or null when not installed */
  available(): Promise<Record<string, string | null>>;
  models(runtime?: 'pi' | 'codex' | 'claude-code'): Promise<{ installed: boolean; models: DesktopAgentModel[]; default: string | null; thinkingLevel?: string | null; /** where the host looked, when the CLI was not found (PATH, the login shell's PATH, the usual homes) */ searched?: string[]; error?: string }>;
  /** resolves with the run id at once; events follow through onEvent */
  run(request: DesktopAgentRunRequest): Promise<string>;
  abort(runId: string): Promise<boolean>;
  /** the shell-managed working directory of a canvas, created on demand */
  workspace(canvasId: string): Promise<string>;
  /** the person's answer to a runtime's question during a run */
  answer(runId: string, requestId: string, response: { confirmed: boolean; scope?: 'session' } | { value: string } | { cancelled: true }): Promise<boolean>;
  /** a folder picked in the system dialog, or null */
  pickCwd(): Promise<string | null>;
  /** the boundary guard's tuning for a working directory */
  guardWrite(cwd: string, config: { mode: 'ask' | 'allow'; allow: string[] }): Promise<boolean>;
  /** the canvas's materials written under <cwd>/.thoughtdag/materials */
  writeMaterials(cwd: string, files: { name: string; content: string; encoding?: 'utf8' | 'base64' }[]): Promise<{ dir: string | null; written: string[] }>;
  /** the local backup, written by the HOST instead of the browser.
   *
   *  The File System Access API is a browser capability: it needs a handle,
   *  which only lives in the page that asked for it. Chromium's directory
   *  picker never returns inside the harness's Windows frame (#66), so the
   *  canvas cannot hold a handle there. When the host offers this call, the
   *  backup stores a plain PATH string instead and the host writes the file
   *  — no handle, no permission prompt at boot.
   *
   *  Absent on every host that cannot write files (the plain web app), which
   *  is exactly the signal to stay on the handle path. */
  backupJson?(dir: string, name: string, json: string): Promise<{ file: string }>;
  onEvent(cb: (payload: { runId: string; event: Record<string, unknown> & { type: string } }) => void): void;
}

// ── the why layer: what was asked, answered and remembered across the local agents ──
/** One hit of find: a turn of a session, or an entry of a memory file. */
interface WhyFindHit {
  kind: 'turn' | 'memory';
  session: string;
  runner: 'claude-code' | 'codex' | 'dsh' | 'pi' | 'thoughtdag';
  title: string;
  /** the project the hit is about: the session's cwd, or a memory entry's own */
  cwd: string;
  file: string;
  turn: number;
  at: string | null;
  where: 'Q' | 'A' | 'M';
  snippet: string;
  open: string;
}
interface WhyFindResult { phrase: string; turns: number; sessions: number; hits: WhyFindHit[] }
/** One turn as a full-reach recall sees it: the head of its question and answer, no phrase needed. */
interface WhyTurnHead { kind: 'turn' | 'memory'; session: string; runner: WhyFindHit['runner']; title: string; cwd: string; file: string; turn: number; at: string | null; q: string; a: string; open: string }
/** One turn (or memory entry) in full. */
interface WhyRecalledTurn {
  kind: 'turn' | 'memory';
  runner: WhyFindHit['runner'];
  session: string;
  title: string;
  turn: number;
  at?: string;
  file: string;
  cwd: string;
  question: string;
  response: string;
  tools: { name: string; op?: string; paths?: string[]; call?: string }[];
}
interface WhyMemoryFile { id: string; runner: WhyFindHit['runner']; file: string; title: string; cwd: string; entries: number; mtime: number; headings: string[] }
interface DesktopWhyBridge {
  status(): Promise<{ available: boolean; home?: string; error?: string }>;
  find(phrase: string, opts?: { scope?: 'q' | 'a' | 'm' | 'all'; limit?: number; cwd?: string }): Promise<WhyFindResult>;
  /** every turn the index knows, newest first (limit 0 = the count alone) */
  turns(opts?: { offset?: number; limit?: number; head?: number }): Promise<{ total: number; turns: WhyTurnHead[]; /** a count asked of a stale index: the rebuild runs in the background, ask again later */ refreshing?: boolean }>;
  recall(session: string, turn: number): Promise<WhyRecalledTurn>;
  memories(): Promise<WhyMemoryFile[]>;
  /** near words from the indexed text for a mistyped term */
  suggest(term: string, k?: number): Promise<WhySuggestions>;
  /** the topic table, its counts, and the labelling job's state */
  topics(): Promise<WhyTopics>;
  setTopics(topics: { id?: string; name: string; description?: string }[]): Promise<WhyTopic[]>;
  /** label every unlabelled turn with the judge, in the background; the judge's key rides in `call` and is not kept */
  labelStart(call: WhyJudgeCall, opts?: { batch?: number; max?: number }): Promise<WhyLabelStatus>;
  labelStop(): Promise<WhyLabelStatus>;
  /** turns labelled with any of these topics */
  byTopic(ids: string[], opts?: { minP?: number; limit?: number }): Promise<{ hits: (WhyFindHit & { topics: Record<string, number> })[]; total: number }>;
  /** a spread of past questions, for proposing topics */
  sample(n?: number): Promise<string[]>;
  /** every topic's document state */
  dossiers(): Promise<WhyDossierSummary[]>;
  dossier(topicId: string): Promise<WhyDossier | null>;
  /** `consumePending` names the inbox facts an update read; they leave, later filings stay */
  setDossier(topicId: string, d: Partial<WhyDossier> & { consumePending?: string[] }): Promise<WhyDossier>;
  deleteDossier(topicId: string): Promise<void>;
  /** file a fact for a later merge */
  dossierPending(topicId: string, item: { text: string; from?: string }): Promise<WhyDossier>;
  /** the topic's labelled turns the document has not read, with excerpts */
  dossierNewTurns(topicId: string, opts?: { limit?: number }): Promise<{ hits: (WhyFindHit & { topics: Record<string, number> })[]; excerpts: { key: string; q: string; a: string }[]; total: number }>;
}
interface WhyDossierSentence { text: string; src: string[] }
interface WhyDossierSource { session: string; turn: number; runner: string; title: string; at: string | null; open: string; kind: 'turn' | 'memory' }
interface WhyDossier {
  topicId: string;
  sections: { what: WhyDossierSentence[]; decisions: WhyDossierSentence[]; now: WhyDossierSentence[]; open: WhyDossierSentence[] };
  sources: Record<string, WhyDossierSource>;
  covered: string[];
  pending: { id: string; text: string; at: string; from?: string }[];
  changelog: { at: string; note: string }[];
  builtAt: string | null;
  updatedAt: string;
}
interface WhyDossierSummary { topicId: string; name: string; built: boolean; builtAt: string | null; updatedAt: string; lead: string; sentences: number; covered: number; pending: number; newTurns: number; labeled: number }
interface WhyTopic { id: string; name: string; description: string }
interface WhyLabelStatus { running: boolean; done: number; total: number; labeled: number; errors: number; startedAt: string | null; finishedAt: string | null; lastError: string | null; stopRequested: boolean }
interface WhyTopics { topics: (WhyTopic & { count: number })[]; labeled: number; turns: number; status: WhyLabelStatus }
interface WhyJudgeCall { url: string; headers: Record<string, string>; model?: string; wrap?: 'cloudflare' }
interface WhySuggestions { term: string; known: number; suggestions: { term: string; count: number; distance: number }[] }

interface Window {
  desktop?: DesktopBridge;
  desktopWhy?: DesktopWhyBridge;
  desktopSessions?: DesktopSessionsBridge;
  desktopLocal?: DesktopLocalBridge;
  desktopCanvas?: DesktopCanvasBridge;
  desktopAgents?: DesktopAgentsBridge;
}
