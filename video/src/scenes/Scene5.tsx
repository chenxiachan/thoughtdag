import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import type { Lang } from '../lang';

/** Scene 5 — end card: real product logo, wordmark, slogan on a dark stage. */
export const SCENE5_DURATION = 90; // 3s @ 30fps

const SLOGAN: Record<Lang, string> = {
  zh: '思考值得一张地图。',
  en: 'Your thinking deserves a map.',
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Staggered entrance: fade in while drifting up. */
const rise = (frame: number, from: number, to: number) => ({
  opacity: interpolate(frame, [from, to], [0, 1], clamp),
  transform: `translateY(${interpolate(frame, [from, to], [18, 0], clamp)}px)`,
});

export const Scene5: React.FC<{ lang?: Lang }> = ({ lang = 'zh' }) => {
  const frame = useCurrentFrame();
  const fadeOut = interpolate(frame, [SCENE5_DURATION - 12, SCENE5_DURATION], [1, 0], clamp);
  return (
    <AbsoluteFill
      style={{
        backgroundColor: '#17151f',
        backgroundImage: 'radial-gradient(ellipse at 50% 20%, rgba(107,92,231,.25), transparent 65%)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: fadeOut,
        fontFamily: "-apple-system, 'PingFang SC', 'Noto Sans SC', sans-serif",
      }}
    >
      <Img src={staticFile('logo.svg')} style={{ width: 120, ...rise(frame, 0, 15) }} />
      <div style={{ fontSize: 52, fontWeight: 700, color: '#edeaf8', marginTop: 30, ...rise(frame, 8, 24) }}>
        ThoughtDAG
      </div>
      <div style={{ fontSize: 26, color: '#a7a1c4', marginTop: 14, ...rise(frame, 16, 32) }}>
        {SLOGAN[lang]}
      </div>
    </AbsoluteFill>
  );
};
