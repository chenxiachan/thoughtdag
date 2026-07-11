import { Globe, GraduationCap, Plug } from 'lucide-react';
import { useUiStore } from '../../lib/ui-store';
import { useMcpServers } from '../../lib/use-mcp';
import { useT } from '../../i18n';

// Per-ask search permissions, shown next to every input that asks. The two
// toggles edit the shared default (ui-store, persisted); each new node
// snapshots them at creation, so reruns keep behaving the same way.
export default function SearchToggles({ size = 16 }: { size?: number }) {
  const web = useUiStore((s) => s.webSearchEnabled);
  const setWeb = useUiStore((s) => s.setWebSearchEnabled);
  const scholar = useUiStore((s) => s.scholarSearchEnabled);
  const setScholar = useUiStore((s) => s.setScholarSearchEnabled);
  const mcp = useUiStore((s) => s.mcpEnabled);
  const setMcp = useUiStore((s) => s.setMcpEnabled);
  // external knowledge (Zotero / Obsidian / ...): the plug only exists when
  // servers are actually connected — no dead buttons
  const mcpServers = useMcpServers();
  const t = useT();

  const cls = (on: boolean) =>
    `transition-colors shrink-0 rounded-full w-8 h-8 flex items-center justify-center ${
      on ? 'text-accent bg-accent/10 hover:bg-accent/20' : 'text-ink-faint hover:text-ink-muted hover:bg-line'
    }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setWeb(!web)}
        title={web ? t('toolbar.webSearch') : t('toolbar.webSearchOff')}
        className={cls(web)}
      >
        <Globe size={size} strokeWidth={1.75} />
      </button>
      <button
        type="button"
        onClick={() => setScholar(!scholar)}
        title={scholar ? t('toolbar.scholarSearch') : t('toolbar.scholarSearchOff')}
        className={cls(scholar)}
      >
        <GraduationCap size={size} strokeWidth={1.75} />
      </button>
      {mcpServers.length > 0 && (
        <button
          type="button"
          onClick={() => setMcp(!mcp)}
          title={`${mcp ? t('toolbar.mcp') : t('toolbar.mcpOff')}\n${mcpServers.map((s) => `${s.name} (${s.tools.length})`).join(' · ')}`}
          className={cls(mcp)}
        >
          <Plug size={size} strokeWidth={1.75} />
        </button>
      )}
    </>
  );
}
