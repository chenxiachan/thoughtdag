import React from 'react';
import { SceneShell } from '../SceneShell';
import type { Lang } from '../lang';

/** Scene 2 — 连线即上下文：删一条边，换一个答案 (6.5 s @ 30 fps). */
export const SCENE2_DURATION = 195;

const T = {
  zh: { title: '连线即上下文', sub: '删一条边，换一个答案' },
  en: { title: 'Wires are the context', sub: 'Delete one edge, get a different answer' },
};

export const Scene2: React.FC<{ lang?: Lang }> = ({ lang = 'zh' }) => (
  <SceneShell
    duration={SCENE2_DURATION}
    footage="scene2.mp4"
    title={T[lang].title}
    sub={T[lang].sub}
    left={[
      { kind: 'seal', icon: '✕', color: '#d4574e' },
      { kind: 'drop', dashed: true },
      { kind: 'chip', label: '−47 tok' },
    ]}
    right={[{ kind: 'seal', icon: '✦', color: '#25a06b' }]}
  />
);
