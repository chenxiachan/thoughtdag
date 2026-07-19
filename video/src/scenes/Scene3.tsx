import React from 'react';
import { SceneShell } from '../SceneShell';
import type { Lang } from '../lang';

/** Scene 3 — 缩小画布，思考自成地图 (6.5 s @ 30 fps). */
export const SCENE3_DURATION = 195;

const T = {
  zh: { title: '缩小画布，思考自成地图', sub: '卡片 → 收获句门牌 → 认知徽章' },
  en: { title: 'Zoom out — thinking becomes a map', sub: 'Cards → takeaway plaques → cognitive badges' },
};

// Footage (scene3.mp4): work tier hold → smooth zoom to map tier → glyph tier.
// The 6.5 s window truncates inside the final static glyph hold — clean cut.
export const Scene3: React.FC<{ lang?: Lang }> = ({ lang = 'zh' }) => (
  <SceneShell
    duration={SCENE3_DURATION}
    footage={`scene3-${lang}.mp4`}
    title={T[lang].title}
    sub={T[lang].sub}
    left={[
      { kind: 'seal', icon: '✦', color: '#25a06b' },
      { kind: 'drop' },
      { kind: 'seal', icon: '?', color: '#6B5CE7' },
    ]}
    right={[
      { kind: 'seal', icon: '✕', color: '#d4574e' },
      { kind: 'drop' },
      { kind: 'seal', icon: '⚖', color: '#5f51cf' },
      { kind: 'drop' },
      { kind: 'seal', icon: '↩', color: '#e8890c' },
    ]}
  />
);
