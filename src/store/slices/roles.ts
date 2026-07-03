import type { StateCreator } from 'zustand';
import { resolveAvailableRoles } from '../context-builder';
import type { StoreState, RoleSlice } from '../types';

export const createRoleSlice: StateCreator<StoreState, [], [], RoleSlice> = (set, get) => ({
  setRolePrompt: (nodeId: string, rolePrompt: string) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, rolePrompt: rolePrompt || undefined } } : n
      ),
    }));
    get().pushHistory();
  },

  setRoleSource: (nodeId: string, sourceNodeId: string | undefined) => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, roleSourceNodeId: sourceNodeId } } : n
      ),
    }));
    get().pushHistory();
  },

  getAvailableRoles: (nodeId: string) => {
    return resolveAvailableRoles(nodeId, get().nodes, get().edges);
  },

  setRoleMode: (nodeId: string, mode: 'inherit' | 'set-next' | 'reset') => {
    get().pushHistory();
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, roleMode: mode } } : n
      ),
    }));
    get().pushHistory();
  },
});
