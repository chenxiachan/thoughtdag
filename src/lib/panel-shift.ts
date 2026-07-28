import { useUiStore } from './ui-store';
import { useStore } from '../store';
import { PANEL_INSET } from './constants';
import type { ThoughtData } from '../types';

/** Horizontal screen-pixel shift that recenters a node in the strip of
    canvas the focus panel leaves visible — without it, "center on node"
    parks the node underneath the panel. 0 when the panel mode is off or
    the target is canvas material (content nodes never open the panel).
    Screen pixels: divide by zoom for world units, and the visual center
    of the visible strip sits half the shift left of the screen center. */
export function panelShift(nodeId: string): number {
  const ui = useUiStore.getState();
  if (!ui.panelOpen) return 0;
  const kind = (useStore.getState().nodes.find((n) => n.id === nodeId)?.data as ThoughtData | undefined)?.stepKind;
  if (kind === 'note' || kind === 'file' || kind === 'link' || kind === 'frame') return 0;
  return ui.panelWidth + PANEL_INSET + 12;
}
