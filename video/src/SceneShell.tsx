import React from 'react';
import { AbsoluteFill, OffthreadVideo, interpolate, staticFile, useCurrentFrame } from 'remotion';

/**
 * Shared picture-in-picture stage for footage scenes:
 * dot-grid canvas backdrop, browser-style window holding the real recording,
 * caption below the window, hand-drawn brand elements (seals / flow lines /
 * chips) in the side margins — the visual language of the storyboard drafts.
 */

const W = 1920;
const WIN_W = 1440;
const WIN_X = (W - WIN_W) / 2; // 240 per side margin
const WIN_Y = 56;
const BAR_H = 40;
const VID_H = (WIN_W * 9) / 16; // 810 (footage is 16:9)
const WIN_H = BAR_H + VID_H;

export type Decor =
  | { kind: 'seal'; icon: string; color: string }
  | { kind: 'drop'; dashed?: boolean }
  | { kind: 'chip'; label: string };

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

const DecorItem: React.FC<{ d: Decor; frame: number; index: number }> = ({ d, frame, index }) => {
  const delay = 10 + index * 6;
  const opacity = interpolate(frame, [delay, delay + 12], [0, 1], clamp);
  const rise = interpolate(frame, [delay, delay + 12], [14, 0], clamp);
  // Slow breathing drift so the margins feel alive without stealing focus.
  const drift = Math.sin((frame + index * 23) / 38) * 4;
  const style: React.CSSProperties = { opacity, transform: `translateY(${rise + drift}px)` };

  if (d.kind === 'drop') {
    return (
      <div
        style={{
          ...style,
          width: 2,
          height: 44,
          background: d.dashed
            ? 'repeating-linear-gradient(180deg, rgba(107,92,231,.55) 0 6px, transparent 6px 12px)'
            : 'rgba(107,92,231,.35)',
        }}
      />
    );
  }
  if (d.kind === 'chip') {
    return (
      <div
        style={{
          ...style,
          background: '#fff',
          border: '1.5px solid #cfc8ef',
          color: '#5f51cf',
          borderRadius: 999,
          padding: '7px 18px',
          fontSize: 20,
          fontWeight: 600,
          fontFamily: "'SF Mono', Menlo, monospace",
          boxShadow: '0 4px 14px rgba(60,50,120,.10)',
        }}
      >
        {d.label}
      </div>
    );
  }
  return (
    <div
      style={{
        ...style,
        width: 60,
        height: 60,
        borderRadius: 18,
        background: d.color,
        border: '2.5px solid rgba(255,255,255,.4)',
        color: '#fff',
        fontSize: 28,
        fontWeight: 700,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 8px 22px rgba(60,50,120,.22)',
        fontFamily: "-apple-system, 'PingFang SC', sans-serif",
      }}
    >
      {d.icon}
    </div>
  );
};

const DecorColumn: React.FC<{ items: Decor[]; side: 'left' | 'right'; frame: number }> = ({
  items,
  side,
  frame,
}) => (
  <div
    style={{
      position: 'absolute',
      [side]: 0,
      top: WIN_Y,
      width: WIN_X,
      height: WIN_H,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
    }}
  >
    {items.map((d, i) => (
      <DecorItem key={i} d={d} frame={frame} index={i} />
    ))}
  </div>
);

export const SceneShell: React.FC<{
  duration: number;
  footage: string;
  startFrom?: number;
  title: string;
  sub: string;
  left?: Decor[];
  right?: Decor[];
}> = ({ duration, footage, startFrom = 0, title, sub, left = [], right = [] }) => {
  const frame = useCurrentFrame();
  const sceneOpacity = interpolate(frame, [0, 10, duration - 10, duration], [0, 1, 1, 0], clamp);
  const winScale = interpolate(frame, [0, 14], [0.975, 1], clamp);
  const capOpacity = interpolate(frame, [8, 22], [0, 1], clamp);
  const capRise = interpolate(frame, [8, 22], [12, 0], clamp);

  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity,
        background: '#faf9fc',
        backgroundImage:
          'radial-gradient(ellipse 60% 40% at 50% 0%, rgba(107,92,231,.07), transparent 70%), radial-gradient(circle, #e7e3f2 1.2px, transparent 1.4px)',
        backgroundSize: '100% 100%, 26px 26px',
        fontFamily: "-apple-system, 'PingFang SC', 'Noto Sans SC', sans-serif",
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: WIN_X,
          top: WIN_Y,
          width: WIN_W,
          height: WIN_H,
          borderRadius: 18,
          overflow: 'hidden',
          border: '1px solid #e2ddef',
          boxShadow: '0 30px 80px rgba(60,50,120,.16), 0 4px 18px rgba(60,50,120,.08)',
          background: '#fff',
          transform: `scale(${winScale})`,
        }}
      >
        <div
          style={{
            height: BAR_H,
            background: '#f1eff7',
            borderBottom: '1px solid #e5e1f0',
            display: 'flex',
            alignItems: 'center',
            padding: '0 18px',
            gap: 8,
          }}
        >
          <div style={{ width: 12, height: 12, borderRadius: 6, background: '#d9d3ea' }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: '#d9d3ea' }} />
          <div style={{ width: 12, height: 12, borderRadius: 6, background: '#d9d3ea' }} />
          <div
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 15,
              color: '#8b86a3',
              fontFamily: "'SF Mono', Menlo, monospace",
              marginRight: 44, // optically re-center against the traffic lights
            }}
          >
            app.thoughtdag.workers.dev
          </div>
        </div>
        <OffthreadVideo
          src={staticFile(footage)}
          startFrom={startFrom}
          muted
          style={{ width: WIN_W, height: VID_H, objectFit: 'cover', display: 'block' }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          top: WIN_Y + WIN_H + 26,
          left: 0,
          right: 0,
          textAlign: 'center',
          opacity: capOpacity,
          transform: `translateY(${capRise}px)`,
        }}
      >
        <div style={{ fontSize: 40, fontWeight: 700, color: '#1c1a24' }}>{title}</div>
        <div style={{ fontSize: 23, color: '#6b6878', marginTop: 8 }}>{sub}</div>
      </div>

      <DecorColumn items={left} side="left" frame={frame} />
      <DecorColumn items={right} side="right" frame={frame} />
    </AbsoluteFill>
  );
};
