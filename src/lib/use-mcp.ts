import { useEffect, useState } from 'react';
import { API_BASE } from './constants';

export interface McpServerInfo {
  name: string;
  tools: string[];
}

let cache: McpServerInfo[] | null = null;

/** Connected MCP servers, fetched once per session ([] when none / offline). */
export function useMcpServers(): McpServerInfo[] {
  const [servers, setServers] = useState<McpServerInfo[]>(cache ?? []);
  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/tools`)
      .then((r) => r.json())
      .then((d) => {
        cache = d.mcpServers ?? [];
        if (!cancelled) setServers(cache!);
      })
      .catch(() => { cache = []; });
    return () => { cancelled = true; };
  }, []);
  return servers;
}
