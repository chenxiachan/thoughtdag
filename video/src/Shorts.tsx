import React from 'react';
import { AbsoluteFill, Audio, Img, OffthreadVideo, Series, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';

// Vertical short (1080×1920, ~23s): the hero demo recut for feed pacing.
// Dark stage (shorts are watched in the dark), one big claim per beat,
// footage in a floating window, slide transitions, progress dots. Both
// languages share the beat grid; copy, footage and type scale come from
// the lang prop. Audio is optional: drop bgm.mp3 into video/public and
// flip WITH_BGM below.

type Lang = 'zh' | 'en';

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

// CJK lines are short, so the zh cut carries a larger scale.
const TYPE: Record<Lang, { title: number; sub: number; hook: number; spacing: string }> = {
  en: { title: 86, sub: 40, hook: 86, spacing: '-0.01em' },
  zh: { title: 104, sub: 46, hook: 118, spacing: '0.01em' },
};

const STR: Record<Lang, {
  hook: string[];
  prune: { lines: string[]; sub: string };
  read: { lines: string[]; sub: string };
  map: { lines: string[]; sub: string };
  take: { lines: string[]; sub: string };
  slogan: string;
}> = {
  en: {
    hook: ['My best ideas', 'kept drowning in', 'long AI chats.'],
    prune: { lines: ['Delete one edge.', 'Different answer.'], sub: 'Wires are the context.' },
    read: { lines: ['Ask the paper', 'right there.'], sub: 'Answers land with their page number.' },
    map: { lines: ['Zoom out.', 'Thinking becomes', 'a map.'], sub: 'Every step badged: ruled out, decided, pivoted.' },
    take: { lines: ['Local-first.', 'Take it anywhere.'], sub: 'Your canvas, your files, your models.' },
    slogan: 'Wires are the context.',
  },
  zh: {
    hook: ['和 AI 上下文的', '无限编辑画布'],
    prune: { lines: ['删一条线', '换一个答案'], sub: '连线即上下文' },
    read: { lines: ['指着原文', '就地提问'], sub: '答案带着页码落进画布' },
    map: { lines: ['缩小画布', '思考自成地图'], sub: '每一步都有徽章：排除、决策、转向' },
    take: { lines: ['数据在本地', '随时带走'], sub: '你的画布、你的文件、你的模型' },
    slogan: '连线即上下文',
  },
};

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Dark stage shared by every beat. */
const Stage: React.FC<{ children: React.ReactNode; beat: number }> = ({ children, beat }) => (
  <AbsoluteFill
    style={{
      backgroundColor: '#17151f',
      backgroundImage:
        'radial-gradient(ellipse 90% 45% at 50% 12%, rgba(107,92,231,.30), transparent 70%), radial-gradient(ellipse 70% 40% at 50% 105%, rgba(232,137,12,.10), transparent 70%)',
      fontFamily: "-apple-system, 'Segoe UI', 'PingFang SC', sans-serif",
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
const Title: React.FC<{ lines: string[]; sub?: string; top?: number; size: number; subSize: number; spacing: string }> = ({ lines, sub, top = 150, size, subSize, spacing }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div style={{ position: 'absolute', top, left: 60, right: 60, textAlign: 'center' }}>
      {lines.map((l, i) => {
        const s = spring({ frame: frame - i * 5, fps, config: { damping: 14, stiffness: 160 } });
        return (
          <div
            key={i}
            style={{
              fontSize: size,
              lineHeight: 1.2,
              fontWeight: 800,
              color: '#f2effc',
              letterSpacing: spacing,
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
            fontSize: subSize,
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

const EndBeat: React.FC<{ lang: Lang }> = ({ lang }) => {
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
        <div style={{ fontSize: lang === 'zh' ? 46 : 42, color: '#a7a1c4', marginTop: 20, ...rise(12) }}>{STR[lang].slogan}</div>
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
const WITH_BGM = true;

export const Shorts: React.FC<{ lang: Lang }> = ({ lang }) => {
  const t = TYPE[lang];
  const s = STR[lang];
  const titleProps = { size: t.title, subSize: t.sub, spacing: t.spacing };
  const scene = (n: number) => `scene${n}-${lang}.mp4`;
  return (
    <AbsoluteFill style={{ backgroundColor: '#17151f' }}>
      {WITH_BGM && <Audio src={staticFile('bgm.mp3')} volume={0.85} />}
      <Series>
        {BEATS.map((b, i) => (
          <Series.Sequence key={b.key} durationInFrames={b.frames}>
            <Stage beat={Math.min(i, 4)}>
              {b.key === 'hook' && (
                <BeatWrap frames={75}>
                  <Title top={640} lines={s.hook} {...titleProps} size={t.hook} />
                </BeatWrap>
              )}
              {b.key === 'prune' && (
                <BeatWrap frames={135}>
                  <Title lines={s.prune.lines} sub={s.prune.sub} {...titleProps} />
                  <Footage src={scene(2)} startFrom={30} />
                </BeatWrap>
              )}
              {b.key === 'read' && (
                <BeatWrap frames={135}>
                  <Title lines={s.read.lines} sub={s.read.sub} {...titleProps} />
                  <Footage src={scene(1)} startFrom={82} />
                </BeatWrap>
              )}
              {b.key === 'map' && (
                <BeatWrap frames={135}>
                  <Title lines={s.map.lines} sub={s.map.sub} {...titleProps} />
                  <Footage src={scene(3)} startFrom={40} top={700} />
                </BeatWrap>
              )}
              {b.key === 'take' && (
                <BeatWrap frames={105}>
                  <Title lines={s.take.lines} sub={s.take.sub} {...titleProps} />
                  <Footage src={scene(4)} startFrom={40} />
                </BeatWrap>
              )}
              {b.key === 'end' && <EndBeat lang={lang} />}
            </Stage>
          </Series.Sequence>
        ))}
      </Series>
    </AbsoluteFill>
  );
};

// eslint-disable-next-line react-refresh/only-export-components -- composition metadata for Root, no fast refresh here
export const SHORTS_SIZE = { width: W, height: H, fps: FPS };
