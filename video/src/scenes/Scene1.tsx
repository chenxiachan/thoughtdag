import React from 'react';
import { SceneShell } from '../SceneShell';
import type { Lang } from '../lang';

/** Scene 1 — 圈选原文，直接提问 (6.5 s @ 30 fps). */
export const SCENE1_DURATION = 195;

const T = {
  zh: { title: '圈选原文，直接提问', sub: '问题带着页码落进画布，往返可溯' },
  en: { title: 'Select a passage, ask right there', sub: 'The question lands on the canvas, page number included' },
};

// Footage timeline (scene1.mp4, pre-trimmed): drag-select starts ~0.8 s in,
// the streamed answer completes ~6.8 s. startFrom 20 (≈0.67 s) puts the 6.5 s
// window right over the gesture → question → streaming answer arc.
export const Scene1: React.FC<{ lang?: Lang }> = ({ lang = 'zh' }) => (
  <SceneShell
    duration={SCENE1_DURATION}
    footage={`scene1-${lang}.mp4`}
    startFrom={20}
    title={T[lang].title}
    sub={T[lang].sub}
    left={[
      { kind: 'seal', icon: '📖', color: '#3f8fa8' },
      { kind: 'drop' },
      { kind: 'chip', label: 'p.1' },
    ]}
    right={[{ kind: 'seal', icon: '?', color: '#6B5CE7' }]}
  />
);
