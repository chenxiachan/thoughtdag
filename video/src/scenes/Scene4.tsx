import React from 'react';
import { SceneShell } from '../SceneShell';
import type { Lang } from '../lang';

/** Scene 4 — 自动备份写成真实文件 (5.5 s @ 30 fps). */
export const SCENE4_DURATION = 165;

const T = {
  zh: { title: '自动备份写成真实文件', sub: '你的数据，随时带走' },
  en: { title: 'Auto-backup writes real files', sub: 'Your data, always yours to take' },
};

// Footage (scene4.mp4): canvas hold → backup control center dialog →
// export click → success toast. startFrom 24 (0.8 s) so the 5.5 s window
// covers hover → dialog (1.5 s) → export → toast hold.
export const Scene4: React.FC<{ lang?: Lang }> = ({ lang = 'zh' }) => (
  <SceneShell
    duration={SCENE4_DURATION}
    footage={`scene4-${lang}.mp4`}
    startFrom={24}
    title={T[lang].title}
    sub={T[lang].sub}
    left={[
      { kind: 'seal', icon: '📁', color: '#3f8fa8' },
      { kind: 'drop' },
      { kind: 'chip', label: '.json' },
    ]}
    right={[{ kind: 'seal', icon: '🔒', color: '#25a06b' }]}
  />
);
