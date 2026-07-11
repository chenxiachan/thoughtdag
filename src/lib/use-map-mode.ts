import { useRef } from 'react';
import { useStore as useRfStore } from '@xyflow/react';

/**
 * Map mode with hysteresis: cards render as MAP LABELS below zoom 0.8 and
 * only unfold into working cards above 0.9 — no flapping at the boundary,
 * and unfolding happens close enough that only a handful of cards fit the
 * viewport (so "everything expands at once" cannot happen by construction).
 */
export function useMapMode(): boolean {
  const ref = useRef(false);
  return useRfStore((s) => {
    const z = s.transform[2];
    if (z <= 0.8) ref.current = true;
    else if (z >= 0.9) ref.current = false;
    return ref.current;
  });
}
