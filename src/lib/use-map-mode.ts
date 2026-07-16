import { useRef } from 'react';
import { useStore as useRfStore } from '@xyflow/react';

/**
 * Semantic zoom, three tiers with hysteresis at both boundaries:
 *
 *   work  (zoom >= 0.9)   — full cards: read the content
 *   map   (~0.4 – 0.9)    — takeaway plaques: read what each step yielded
 *   glyph (zoom < ~0.35)  — one seal per node: read how the thinking moved
 *
 * Dual thresholds per boundary prevent flapping; unfolding to work mode
 * happens close enough that only a handful of cards fit the viewport.
 */
export type ZoomTier = 'work' | 'map' | 'glyph';

export function useZoomTier(): ZoomTier {
  const ref = useRef<ZoomTier>('work');
  return useRfStore((s) => {
    const z = s.transform[2];
    const cur = ref.current;
    if (cur === 'work') {
      if (z <= 0.8) ref.current = z <= 0.32 ? 'glyph' : 'map';
    } else if (cur === 'map') {
      if (z >= 0.9) ref.current = 'work';
      else if (z <= 0.32) ref.current = 'glyph';
    } else {
      if (z >= 0.9) ref.current = 'work';
      else if (z >= 0.4) ref.current = 'map';
    }
    return ref.current;
  });
}

/** Legacy boolean view: true whenever cards are folded (map OR glyph). */
export function useMapMode(): boolean {
  return useZoomTier() !== 'work';
}
