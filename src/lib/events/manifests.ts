import type { AdapterManifest } from './types';

// Honest values for the two adapters that exist. `messages` is partial in
// both: the collectors merge a turn's assistant text into one record.
// `contextSurface` is unknown in both: neither log says what the model
// actually received.

const OBS_FULL = { basis: 'observed', completeness: 'full' } as const;
const OBS_PART = { basis: 'observed', completeness: 'partial' } as const;
const UNKNOWN = { basis: 'inferred', completeness: 'unknown' } as const;

export const CLAUDE_CODE_MANIFEST: AdapterManifest = {
  runner: 'claude-code', schema: 'cc-jsonl/2026-09',
  turns: OBS_FULL,
  parenting: OBS_FULL,      // parentUuid is written on every message
  messages: OBS_PART,       // one assistant record per turn
  toolPairing: OBS_FULL,    // tool_use.id ↔ tool_result.tool_use_id
  artifactTouch: OBS_PART,  // shell commands are not parsed for files
  compaction: OBS_PART,     // the boundary is marked; what it replaced is not
  contextSurface: UNKNOWN,
};

export const CODEX_MANIFEST: AdapterManifest = {
  runner: 'codex', schema: 'codex-rollout/2026-09',
  turns: OBS_FULL,
  parenting: OBS_PART,      // rollouts are linear; forks live in the app-server thread store
  messages: OBS_PART,
  toolPairing: OBS_FULL,    // call_id pairs function_call with its output
  artifactTouch: OBS_PART,  // only apply_patch names files
  compaction: OBS_PART,
  contextSurface: UNKNOWN,
};

// The canvas is ThoughtDAG's own record. Turns and wires are exact; there
// are no tool calls; a request's context is exact from the day commits
// were logged and only an upstream fingerprint before that.
export const THOUGHTDAG_MANIFEST: AdapterManifest = {
  runner: 'thoughtdag', schema: 'thoughtdag-canvas/1',
  turns: OBS_FULL,
  parenting: OBS_FULL,      // the wires ARE the structure
  messages: OBS_FULL,       // hand-made nodes carry their text whole
  toolPairing: UNKNOWN,     // no tools run on the canvas
  artifactTouch: OBS_FULL,  // attachments and references are explicit
  compaction: UNKNOWN,      // condensing is a new node, not a replacement
  contextSurface: OBS_PART, // exact for logged commits, upstream-only before
};

export const DSH_MANIFEST: AdapterManifest = {
  runner: 'dsh', schema: 'dsh-events/2026-09',
  turns: OBS_FULL,          // user/message events (source.kind=user) bound every turn
  parenting: OBS_FULL,      // turns are linear; a continued session is a new file
  messages: OBS_PART,       // assistant text folds per step; reasoning is dropped
  toolPairing: OBS_FULL,    // tool/call ↔ tool/result pair by callId
  artifactTouch: UNKNOWN,   // run_code arguments are code, not declared file ops
  compaction: UNKNOWN,      // no boundary event observed in the log yet
  contextSurface: OBS_PART, // request/context carries provider+model+window, never messages
};

export const MANIFESTS: Record<string, AdapterManifest> = {
  'claude-code': CLAUDE_CODE_MANIFEST,
  codex: CODEX_MANIFEST,
  dsh: DSH_MANIFEST,
  thoughtdag: THOUGHTDAG_MANIFEST,
};
