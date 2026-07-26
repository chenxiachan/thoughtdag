import React from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Series, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

// Vertical short (1080×1920, ~23s): the hero demo recut for feed pacing.
// Dark stage (shorts are watched in the dark), one big claim per beat,
// footage in a floating window, slide transitions, progress dots. Audio is
// optional: drop bgm.mp3 into video/public and it lays under everything.

const W = 1080;
const H = 1920;
const FPS = 30;

const BEATS = [
  { key: 'hook', frames: 75 },
  { key: 'prune', frames: 135 },
  { key: 'read', frames: 135 },
  { key: 'map', frames: 135 },
  { key: 'take', frames: 105 },
  { key: 'end', frames: 105 },
] as const;
export const SHORTS_DURATION = BEATS.reduce((s, b) => s + b.frames, 0);

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Dark stage shared by every beat. */
const Stage: React.FC<{ children: React.ReactNode; beat: number }> = ({ children, beat }) => (
  <AbsoluteFill
    style={{
      backgroundColor: '#17151f',
      backgroundImage:
        'radial-gradient(ellipse 90% 45% at 50% 12%, rgba(107,92,231,.30), transparent 70%), radial-gradient(ellipse 70% 40% at 50% 105%, rgba(232,137,12,.10), transparent 70%)',
      fontFamily: "-apple-system, 'Segoe UI', sans-serif",
    }}
  >
    {children}
    {/* progress dots */}
    <div style={{ position: 'absolute', bottom: 84, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 14 }}>
      {BEATS.slice(0, 5).map((b, i) => (
        <div key={b.key} style={{ width: i === beat ? 34 : 10, height: 10, borderRadius: 5, background: i === beat ? '#8b7cf6' : 'rgba(255,255,255,.22)', transition: 'width .2s' }} />
      ))}
    </div>
  </AbsoluteFill>
);

/** Big title that springs in line by line. */
const Title: React.FC<{ lines: string[]; sub?: string; top?: number; accentWord?: string }> = ({ lines, sub, top = 150 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: 'absolute', top, left: 70, right: 70, textAlign: 'center' }}>
      {lines.map((l, i) => {
        const s = spring({ frame: frame - i * 5, fps, config: { damping: 14, stiffness: 160 } });
        return (
          <div
            key={i}
            style={{
              fontSize: 86,
              lineHeight: 1.16,
              fontWeight: 800,
              color: '#f2effc',
              letterSpacing: '-0.01em',
              opacity: s,
              transform: `translateY(${(1 - s) * 46}px)`,
              textWrap: 'balance' as never,
            }}
          >
            {l}
          </div>
        );
      })}
      {sub && (
        <div
          style={{
            fontSize: 40,
            color: '#a7a1c4',
            marginTop: 26,
            opacity: interpolate(frame, [14, 28], [0, 1], clamp),
            transform: `translateY(${interpolate(frame, [14, 28], [18, 0], clamp)}px)`,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
};

/** Footage window sliding up into place. */
const Footage: React.FC<{ src: string; startFrom?: number; top?: number }> = ({ src, startFrom = 0, top = 620 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - 6, fps, config: { damping: 16, stiffness: 130 } });
  const w = 1010;
  const h = (w * 9) / 16;
  return (
    <div
      style={{
        position: 'absolute',
        top,
        left: (W - w) / 2,
        width: w,
        height: h,
        borderRadius: 26,
        overflow: 'hidden',
        border: '1px solid rgba(179,167,255,.25)',
        boxShadow: '0 40px 110px rgba(0,0,0,.55), 0 0 0 1px rgba(0,0,0,.4)',
        opacity: s,
        transform: `translateY(${(1 - s) * 90}px) scale(${0.94 + s * 0.06})`,
      }}
    >
      <OffthreadVideo src={staticFile(src)} startFrom={startFrom} muted style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
    </div>
  );
};

/** Slide-out at the tail of every beat: the whole group lifts and fades. */
const BeatWrap: React.FC<{ children: React.ReactNode; frames: number }> = ({ children, frames }) => {
  const frame = useCurrentFrame();
  const out = interpolate(frame, [frames - 10, frames], [0, 1], clamp);
  const inn = interpolate(frame, [0, 8], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: inn * (1 - out), transform: `translateY(${out * -60}px)` }}>
      {children}
    </AbsoluteFill>
  );
};

const HookBeat: React.FC = () => (
  <BeatWrap frames={75}>
    <Title top={640} lines={['My best ideas', 'kept drowning in', 'long AI chats.']} />
  </BeatWrap>
);

const PruneBeat: React.FC = () => (
  <BeatWrap frames={135}>
    <Title lines={['Delete one edge.', 'Different answer.']} sub="Wires are the context." />
    <Footage src="scene2-en.mp4" startFrom={30} />
  </BeatWrap>
);

const ReadBeat: React.FC = () => (
  <BeatWrap frames={135}>
    <Title lines={['Ask the paper', 'right there.']} sub="Answers land with their page number." />
    <Footage src="scene1-en.mp4" startFrom={82} />
  </BeatWrap>
);

const MapBeat: React.FC = () => (
  <BeatWrap frames={135}>
    <Title lines={['Zoom out.', 'Thinking becomes', 'a map.']} sub="Every step badged: ruled out, decided, pivoted." />
    <Footage src="scene3-en.mp4" startFrom={40} top={700} />
  </BeatWrap>
);

const TakeBeat: React.FC = () => (
  <BeatWrap frames={105}>
    <Title lines={['Local-first.', 'Take it anywhere.']} sub="Your canvas, your files, your models." />
    <Footage src="scene4-en.mp4" startFrom={40} />
  </BeatWrap>
);

const EndBeat: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const rise = (from: number) => {
    const s = spring({ frame: frame - from, fps, config: { damping: 15, stiffness: 140 } });
    return { opacity: s, transform: `translateY(${(1 - s) * 30}px)` };
  };
  return (
    <BeatWrap frames={105}>
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <Img src={staticFile('logo.svg')} style={{ width: 170, ...rise(0) }} />
        <div style={{ fontSize: 92, fontWeight: 800, color: '#f2effc', marginTop: 44, ...rise(6) }}>ThoughtDAG</div>
        <div style={{ fontSize: 42, color: '#a7a1c4', marginTop: 20, ...rise(12) }}>Wires are the context.</div>
        <div
          style={{
            fontSize: 34,
            fontFamily: "'SF Mono', Menlo, monospace",
            color: '#8b7cf6',
            marginTop: 60,
            padding: '18px 44px',
            border: '1.5px solid rgba(139,124,246,.45)',
            borderRadius: 999,
            ...rise(18),
          }}
        >
          github.com/chenxiachan/thoughtdag
        </div>
      </AbsoluteFill>
    </BeatWrap>
  );
};

// Soundtrack: drop a track as video/public/bgm.mp3 (YouTube Audio Library
// is safe and free for YouTube use), then flip this to true and re-render.
const WITH_BGM = false;

export const ShortsEn: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: '#17151f' }}>
    {WITH_BGM && <Audio src={staticFile('bgm.mp3')} volume={0.85} />}
    <Series>
      {BEATS.map((b, i) => (
        <Series.Sequence key={b.key} durationInFrames={b.frames}>
          <Stage beat={Math.min(i, 4)}>
            {b.key === 'hook' && <HookBeat />}
            {b.key === 'prune' && <PruneBeat />}
            {b.key === 'read' && <ReadBeat />}
            {b.key === 'map' && <MapBeat />}
            {b.key === 'take' && <TakeBeat />}
            {b.key === 'end' && <EndBeat />}
          </Stage>
        </Series.Sequence>
      ))}
    </Series>
  </AbsoluteFill>
);

export const SHORTS_SIZE = { width: W, height: H, fps: FPS };
