import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const W = 1920;
const H = 1080;
const FPS = 30;

const DURATIONS = {
  hook: 75,
  linear: 96,
  branch: 105,
  sources: 150,
  prune: 180,
  merge: 105,
  protocol: 135,
  finale: 135,
} as const;

const STORY_TIMELINE = {
  setup: 0,
  growth: 75,
  crisis: 195,
  pause: 300,
  pivot: 375,
  action: 480,
  payoff: 660,
  finale: 765,
  end: 915,
} as const;

export const SCROLL_ANIMATIC_EN_WIDE_DURATION = STORY_TIMELINE.end;
export const SCROLL_ANIMATIC_EN_WIDE_SIZE = {width: W, height: H, fps: FPS};
export const SCROLL_ANIMATIC_ZH_WIDE_DURATION = STORY_TIMELINE.end;
export const SCROLL_ANIMATIC_ZH_WIDE_SIZE = {width: W, height: H, fps: FPS};

const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
const ink = '#17151f';
const muted = '#716c7d';
const purple = '#6b5ce7';
const purpleSoft = '#eeeafd';
const green = '#25a06b';
const greenSoft = '#e4f5ed';
const orange = '#e8890c';
const orangeSoft = '#fff1dd';

const fadeScene = (frame: number, duration: number, fadeIn = 10, fadeOut = 10) => {
  const enter = fadeIn === 0 ? 1 : interpolate(frame, [0, fadeIn], [0, 1], clamp);
  const leave =
    fadeOut === 0
      ? 1
      : interpolate(frame, [duration - fadeOut, duration], [1, 0], clamp);
  return enter * leave;
};

const reveal = (frame: number, from: number, duration = 14) =>
  interpolate(frame, [from, from + duration], [0, 1], clamp);

const rise = (frame: number, from: number, distance = 22) => {
  const value = reveal(frame, from, 16);
  return {
    opacity: value,
    transform: `translateY(${(1 - value) * distance}px)`,
  };
};

const cardShadow = '0 24px 70px rgba(51, 43, 91, 0.13), 0 4px 16px rgba(51, 43, 91, 0.08)';

const PaperBackground: React.FC<{dark?: boolean}> = ({dark = false}) => (
  <AbsoluteFill
    style={{
      background: dark ? '#09090c' : '#f9f8fb',
      backgroundImage: dark
        ? 'radial-gradient(ellipse 62% 58% at 50% 40%, rgba(107,92,231,.16), transparent 68%)'
        : 'radial-gradient(ellipse 60% 45% at 50% 0%, rgba(107,92,231,.10), transparent 72%), radial-gradient(circle, rgba(91,79,140,.12) 1.05px, transparent 1.15px)',
      backgroundSize: dark ? '100% 100%' : '100% 100%, 27px 27px',
    }}
  />
);

const BrandBar: React.FC<{frame: number}> = ({frame}) => (
  <div
    style={{
      position: 'absolute',
      left: 54,
      top: 38,
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      ...rise(frame, 2, 10),
      zIndex: 20,
    }}
  >
    <Img src={staticFile('logo.svg')} style={{width: 38, height: 38}} />
    <div style={{fontSize: 23, fontWeight: 760, letterSpacing: '-0.03em', color: ink}}>
      ThoughtDAG
    </div>
    <div style={{width: 86, height: 2, marginLeft: 6, background: purple}} />
  </div>
);

type Tone = 'purple' | 'green' | 'orange' | 'neutral';
type StoryLang = 'en' | 'zh';

const tones: Record<Tone, {border: string; soft: string; accent: string}> = {
  purple: {border: '#bdb4f2', soft: purpleSoft, accent: purple},
  green: {border: '#9bd5bd', soft: greenSoft, accent: green},
  orange: {border: '#f0bf76', soft: orangeSoft, accent: orange},
  neutral: {border: '#dcd7e5', soft: '#f2f0f5', accent: '#777183'},
};

const NodeCard: React.FC<{
  frame: number;
  delay: number;
  x: number;
  y: number;
  width: number;
  height?: number;
  tone?: Tone;
  label: string;
  title: string;
  body?: string;
  chip?: string;
  dimmed?: boolean;
  emphasis?: number;
}> = ({
  frame,
  delay,
  x,
  y,
  width,
  height = 176,
  tone = 'purple',
  label,
  title,
  body,
  chip,
  dimmed = false,
  emphasis = 0,
}) => {
  const p = spring({
    fps: FPS,
    frame: frame - delay,
    config: {damping: 17, stiffness: 145, mass: 0.82},
  });
  const toneStyle = tones[tone];
  const glow = emphasis * 0.18;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height,
        borderRadius: 22,
        overflow: 'hidden',
        border: `2px solid ${toneStyle.border}`,
        background: '#fff',
        boxShadow: `${cardShadow}, 0 0 0 ${10 + emphasis * 5}px rgba(107,92,231,${glow})`,
        opacity: p * (dimmed ? 0.34 : 1),
        transform: `translateY(${(1 - p) * 28}px) scale(${0.94 + p * 0.06})`,
        transformOrigin: 'center',
        zIndex: 6,
      }}
    >
      <div
        style={{
          height: 44,
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: toneStyle.accent,
          background: toneStyle.soft,
          fontSize: 13,
          fontWeight: 800,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
        }}
      >
        <span>{label}</span>
        <span style={{fontSize: 16}}>↗</span>
      </div>
      <div style={{padding: '18px 20px 19px'}}>
        <div
          style={{
            color: ink,
            fontSize: width > 410 ? 25 : 22,
            lineHeight: 1.15,
            letterSpacing: '-0.015em',
            fontWeight: 760,
          }}
        >
          {title}
        </div>
        {body ? (
          <div style={{marginTop: 9, color: muted, fontSize: 16, lineHeight: 1.34}}>{body}</div>
        ) : null}
        {chip ? (
          <div
            style={{
              display: 'inline-flex',
              marginTop: 12,
              padding: '6px 10px',
              borderRadius: 999,
              color: toneStyle.accent,
              background: toneStyle.soft,
              fontSize: 13,
              lineHeight: 1,
              fontWeight: 760,
            }}
          >
            {chip}
          </div>
        ) : null}
      </div>
      <div
        style={{
          position: 'absolute',
          left: -7,
          top: '50%',
          width: 12,
          height: 12,
          marginTop: -6,
          borderRadius: 8,
          border: `2px solid ${toneStyle.accent}`,
          background: '#fff',
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: -7,
          top: '50%',
          width: 12,
          height: 12,
          marginTop: -6,
          borderRadius: 8,
          border: `2px solid ${toneStyle.accent}`,
          background: '#fff',
        }}
      />
    </div>
  );
};

const Edge: React.FC<{
  frame: number;
  delay: number;
  d: string;
  tone?: Tone;
  end?: number;
  width?: number;
  opacity?: number;
}> = ({frame, delay, d, tone = 'purple', end, width = 5, opacity = 0.9}) => {
  const enter = reveal(frame, delay, 20);
  const leave = end === undefined ? 1 : 1 - reveal(frame, end, 15);
  const progress = Math.min(enter, leave);
  const color = tones[tone].accent;

  return (
    <path
      d={d}
      pathLength={1}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={1}
      strokeDashoffset={1 - progress}
      opacity={progress * opacity}
    />
  );
};

const Caption: React.FC<{
  frame: number;
  delay?: number;
  eyebrow?: string;
  title: React.ReactNode;
  detail?: string;
  x?: number;
  y?: number;
  width?: number;
  align?: 'left' | 'center';
}> = ({
  frame,
  delay = 0,
  eyebrow,
  title,
  detail,
  x = 110,
  y = 170,
  width = 660,
  align = 'left',
}) => (
  <div
    style={{
      position: 'absolute',
      left: align === 'center' ? '50%' : x,
      top: y,
      width,
      textAlign: align,
      transform:
        align === 'center'
          ? `translateX(-50%) translateY(${(1 - reveal(frame, delay, 16)) * 20}px)`
          : `translateY(${(1 - reveal(frame, delay, 16)) * 20}px)`,
      opacity: reveal(frame, delay, 16),
      zIndex: 14,
    }}
  >
    {eyebrow ? (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: align === 'center' ? 'center' : 'flex-start',
          gap: 11,
          color: purple,
          fontSize: 15,
          fontWeight: 840,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
        }}
      >
        <span style={{width: 30, height: 3, background: purple}} />
        {eyebrow}
      </div>
    ) : null}
    <div
      style={{
        marginTop: eyebrow ? 18 : 0,
        color: ink,
        fontSize: 64,
        lineHeight: 1.02,
        letterSpacing: '-0.025em',
        fontWeight: 820,
      }}
    >
      {title}
    </div>
    {detail ? (
      <div
        style={{
          maxWidth: align === 'center' ? 820 : 580,
          margin: align === 'center' ? '22px auto 0' : '22px 0 0',
          color: muted,
          fontSize: 22,
          lineHeight: 1.38,
        }}
      >
        {detail}
      </div>
    ) : null}
  </div>
);

const SceneShell: React.FC<{
  frame: number;
  duration: number;
  children: React.ReactNode;
  scaleFrom?: number;
}> = ({frame, duration, children, scaleFrom = 1.025}) => {
  const scale = interpolate(frame, [0, Math.min(duration - 1, 32)], [scaleFrom, 1], clamp);
  return (
    <AbsoluteFill
      style={{
        opacity: fadeScene(frame, duration),
        transform: `scale(${scale})`,
        transformOrigin: 'center',
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <PaperBackground />
      {children}
      <BrandBar frame={frame} />
    </AbsoluteFill>
  );
};

const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const shock = spring({
    fps: FPS,
    frame,
    config: {damping: 14, stiffness: 180, mass: 0.72},
  });
  const second = reveal(frame, 24, 16);
  const line = reveal(frame, 48, 18);

  return (
    <AbsoluteFill
      style={{
        opacity: fadeScene(frame, DURATIONS.hook, 4, 8),
        color: '#f6f3ff',
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <PaperBackground dark />
      <div
        style={{
          position: 'absolute',
          left: 160,
          right: 160,
          top: 285,
          textAlign: 'center',
          transform: `scale(${0.91 + shock * 0.09})`,
          opacity: shock,
        }}
      >
        <div
          style={{
            color: '#9a90d9',
            fontSize: 18,
            fontWeight: 820,
            letterSpacing: '.13em',
            textTransform: 'uppercase',
          }}
        >
          A different way to talk with AI
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 82,
            lineHeight: 1.02,
            letterSpacing: '-0.025em',
            fontWeight: 820,
          }}
        >
          What if your conversations
          <br />
          <span style={{opacity: second}}>
            could unfold <span style={{color: '#8172ff'}}>like a map?</span>
          </span>
        </div>
        <div
          style={{
            width: `${line * 460}px`,
            height: 3,
            margin: '42px auto 0',
            background: 'linear-gradient(90deg, transparent, #8172ff, transparent)',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

const ChatPanel: React.FC<{frame: number}> = ({frame}) => {
  const rows = [
    ['user', 'I want to really understand this paper.'],
    ['ai', 'Start with its central hypothesis.'],
    ['user', 'What evidence supports the claim?'],
    ['ai', 'The experiments support part of it, but…'],
    ['user', 'Could there be another explanation?'],
    ['ai', 'Check the limitations and counterexamples.'],
  ] as const;
  return (
    <div
      style={{
        position: 'absolute',
        left: 890,
        top: 150,
        width: 800,
        height: 760,
        borderRadius: 28,
        border: '1px solid #ded9e8',
        background: '#fff',
        boxShadow: cardShadow,
        overflow: 'hidden',
        ...rise(frame, 4, 26),
      }}
    >
      <div
        style={{
          height: 58,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#8a8494',
          background: '#f4f2f7',
          fontSize: 14,
          fontWeight: 800,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
        }}
      >
        <span>AI chat</span>
        <span>keeps scrolling</span>
      </div>
      <div style={{padding: '24px 32px'}}>
        {rows.map(([role, copy], index) => {
          const p = reveal(frame, 8 + index * 9, 11);
          const squeeze = interpolate(frame, [38, 84], [0, index * 4], clamp);
          return (
            <div
              key={copy}
              style={{
                width: role === 'user' ? '72%' : '78%',
                marginLeft: role === 'user' ? 'auto' : 0,
                marginTop: index === 0 ? 0 : 15 - squeeze * 0.24,
                padding: '16px 20px',
                borderRadius: 14,
                color: role === 'user' ? '#453a9f' : '#34313c',
                background: role === 'user' ? purpleSoft : '#f2f0f4',
                fontSize: 21,
                lineHeight: 1.28,
                opacity: p,
                transform: `translateY(${(1 - p) * 16}px) scaleY(${1 - squeeze * 0.002})`,
              }}
            >
              {copy}
            </div>
          );
        })}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 32,
          right: 32,
          bottom: 24,
          paddingTop: 16,
          borderTop: '1px solid #ebe7ef',
          color: '#a09aa9',
          fontSize: 17,
          opacity: reveal(frame, 58, 15),
        }}
      >
        More questions, squeezed into the same timeline…
      </div>
    </div>
  );
};

const LinearScene: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <SceneShell frame={frame} duration={DURATIONS.linear} scaleFrom={1.04}>
      <Caption
        frame={frame}
        delay={5}
        eyebrow="01 · The problem"
        title={
          <>
            Chats scroll.
            <br />
            <span style={{color: purple}}>Ideas don’t.</span>
          </>
        }
        detail="A transcript shows what was said, but not which thoughts should continue."
        x={120}
        y={280}
        width={650}
      />
      <ChatPanel frame={frame} />
    </SceneShell>
  );
};

const BranchScene: React.FC = () => {
  const frame = useCurrentFrame();
  const camera = interpolate(frame, [0, 52, 150], [1.08, 1.02, 0.94], clamp);
  const pan = interpolate(frame, [0, 150], [40, -18], clamp);
  return (
    <SceneShell frame={frame} duration={DURATIONS.branch} scaleFrom={1}>
      <Caption
        frame={frame}
        delay={3}
        title={
          <>
            One question.
            <br />
            <span style={{color: purple}}>Many directions.</span>
          </>
        }
        x={112}
        y={145}
        width={610}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateX(${pan}px) scale(${camera})`,
          transformOrigin: '66% 54%',
        }}
      >
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, zIndex: 2}}>
          <Edge frame={frame} delay={20} d="M620 585 C740 585 720 350 850 350" />
          <Edge frame={frame} delay={32} d="M620 585 C745 585 730 665 850 665" tone="orange" />
          <Edge frame={frame} delay={52} d="M1240 350 C1340 350 1330 245 1430 245" tone="green" />
          <Edge frame={frame} delay={62} d="M1240 350 C1355 350 1345 470 1430 470" tone="green" />
          <Edge frame={frame} delay={70} d="M1240 665 C1360 665 1340 755 1430 755" tone="orange" />
        </svg>
        <NodeCard
          frame={frame}
          delay={8}
          x={230}
          y={490}
          width={390}
          tone="purple"
          label="Starting question"
          title="What does this paper actually show?"
          chip="Branch from here"
        />
        <NodeCard
          frame={frame}
          delay={28}
          x={850}
          y={265}
          width={390}
          tone="green"
          label="Direction 01"
          title="What evidence supports the claim?"
          chip="Follow the evidence"
        />
        <NodeCard
          frame={frame}
          delay={40}
          x={850}
          y={580}
          width={390}
          tone="orange"
          label="Direction 02"
          title="Could there be another explanation?"
          chip="Keep the alternative"
        />
        <NodeCard
          frame={frame}
          delay={62}
          x={1430}
          y={160}
          width={350}
          height={164}
          tone="green"
          label="Evidence"
          title="Is the effect reliable?"
        />
        <NodeCard
          frame={frame}
          delay={72}
          x={1430}
          y={385}
          width={350}
          height={164}
          tone="green"
          label="Evidence"
          title="What changes across conditions?"
        />
        <NodeCard
          frame={frame}
          delay={82}
          x={1430}
          y={670}
          width={350}
          height={164}
          tone="orange"
          label="Alternative"
          title="Which assumption could fail?"
        />
      </div>
    </SceneShell>
  );
};

const sourceCopy = {
  en: {
    file: 'paper.pdf · p. 12',
    media: 'PDF + image',
    title: 'Evidence for the proposed mechanism',
    body: 'We observed that the effect appeared only in the experimental condition and disappeared when the contextual cue was removed.',
    highlight: 'Critically, the result depends on more than the prompt alone.',
  },
  zh: {
    file: '论文.pdf · 第 12 页',
    media: 'PDF + 图片',
    title: '支持这一机制的证据',
    body: '我们发现，该效应只在实验条件下出现；移除上下文线索后，效应随之消失。',
    highlight: '关键在于，结果并不只由提示词决定。',
  },
} as const;

const SourcePanel: React.FC<{frame: number; lang?: StoryLang}> = ({frame, lang = 'en'}) => {
  const copy = sourceCopy[lang];
  return (
  <div
    style={{
      position: 'absolute',
      left: 130,
      top: 170,
      width: 650,
      height: 760,
      borderRadius: 26,
      overflow: 'hidden',
      border: '1px solid #dcd7e5',
      background: '#fff',
      boxShadow: cardShadow,
      ...rise(frame, 8, 25),
      zIndex: 5,
    }}
  >
    <div
      style={{
        height: 52,
        padding: '0 20px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#f1eff5',
        color: '#7a7485',
        fontSize: 14,
        fontWeight: 780,
      }}
    >
      <span>{copy.file}</span>
      <span>{copy.media}</span>
    </div>
    <div style={{padding: '30px 40px', color: '#302d36'}}>
      <div style={{fontFamily: 'Georgia, serif', fontSize: 30, fontWeight: 700}}>
        {copy.title}
      </div>
      <div style={{marginTop: 24, fontFamily: 'Georgia, serif', fontSize: 17, lineHeight: 1.6}}>
        {copy.body}
      </div>
      <div
        style={{
          marginTop: 18,
          padding: '10px 12px',
          borderRadius: 8,
          background: '#dff3e9',
          fontFamily: 'Georgia, serif',
          fontSize: 17,
          lineHeight: 1.55,
        }}
      >
        {copy.highlight}
      </div>
      <div
        style={{
          position: 'relative',
          height: 286,
          marginTop: 30,
          border: '1px solid #e5e0e9',
          borderRadius: 14,
          background: '#f7f5fa',
        }}
      >
        {[
          [70, 60, purple],
          [190, 88, '#b1a7f2'],
          [330, 60, green],
          [440, 128, '#76c4a1'],
          [120, 205, '#9b90e6'],
          [310, 220, orange],
          [475, 205, '#edb358'],
        ].map(([x, y, color], index) => (
          <div
            key={index}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: 18,
              height: 18,
              borderRadius: 9,
              background: color,
              boxShadow: `0 0 0 7px ${color}22`,
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: 38,
            top: 35,
            width: 225,
            height: 108,
            border: `3px solid ${purple}`,
            borderRadius: 12,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: 28,
            bottom: 30,
            width: 235,
            height: 110,
            border: `3px solid ${orange}`,
            borderRadius: 12,
          }}
        />
      </div>
    </div>
  </div>
  );
};

const SourcesScene: React.FC = () => {
  const frame = useCurrentFrame();
  const cameraX = interpolate(frame, [0, 150], [30, -20], clamp);
  return (
    <SceneShell frame={frame} duration={DURATIONS.sources} scaleFrom={1.015}>
      <SourcePanel frame={frame} />
      <svg
        width={W}
        height={H}
        style={{position: 'absolute', inset: 0, zIndex: 3, transform: `translateX(${cameraX}px)`}}
      >
        <Edge frame={frame} delay={36} d="M590 515 C760 515 790 453 930 453" tone="purple" />
        <Edge frame={frame} delay={52} d="M565 750 C770 750 790 763 930 763" tone="green" />
        <Edge frame={frame} delay={76} d="M1350 453 C1450 453 1450 623 1540 623" tone="purple" />
        <Edge frame={frame} delay={84} d="M1350 763 C1450 763 1450 623 1540 623" tone="green" />
      </svg>
      <NodeCard
        frame={frame}
        delay={42}
        x={930}
        y={365}
        width={420}
        tone="purple"
        label="Ask from a passage"
        title="What does this highlighted claim mean?"
        chip="p. 12"
      />
      <NodeCard
        frame={frame}
        delay={58}
        x={930}
        y={675}
        width={420}
        tone="green"
        label="Ask from an image"
        title="What does this clustered region show?"
        chip="image region"
      />
      <NodeCard
        frame={frame}
        delay={90}
        x={1540}
        y={525}
        width={310}
        height={196}
        tone="purple"
        label="New thread"
        title="Source-grounded questions"
        chip="page-linked"
      />
      <Caption
        frame={frame}
        delay={8}
        title={
          <>
            A PDF. An image.
            <br />
            <span style={{color: purple}}>A new line of thought.</span>
          </>
        }
        x={1030}
        y={92}
        width={760}
      />
    </SceneShell>
  );
};

const PruneScene: React.FC = () => {
  const frame = useCurrentFrame();
  const cut = reveal(frame, 92, 8);
  const before = 1 - reveal(frame, 102, 12);
  const after = reveal(frame, 106, 14);
  const pulse = frame > 58 && frame < 102 ? 0.5 + Math.sin(frame / 2.7) * 0.5 : 0;

  return (
    <SceneShell frame={frame} duration={DURATIONS.prune} scaleFrom={1.02}>
      <Caption
        frame={frame}
        delay={4}
        title={
          <>
            Keep the thought.
            <br />
            <span style={{color: purple}}>Shape the context.</span>
          </>
        }
        x={110}
        y={135}
        width={900}
      />
      <svg width={W} height={H} style={{position: 'absolute', inset: 0, zIndex: 3}}>
        <Edge frame={frame} delay={24} d="M565 585 C690 585 700 390 815 390" tone="green" />
        <Edge
          frame={frame}
          delay={35}
          end={96}
          d="M565 585 C690 585 700 725 815 725"
          tone="orange"
          width={6 + pulse * 3}
        />
        <Edge frame={frame} delay={50} d="M1205 390 C1315 390 1300 565 1410 565" tone="green" />
        <Edge
          frame={frame}
          delay={58}
          end={96}
          d="M1205 725 C1315 725 1300 565 1410 565"
          tone="orange"
          width={6 + pulse * 3}
        />
      </svg>
      <NodeCard
        frame={frame}
        delay={12}
        x={175}
        y={495}
        width={390}
        tone="purple"
        label="Same prompt"
        title="Summarize what actually needs answering"
        chip="unchanged"
      />
      <NodeCard
        frame={frame}
        delay={30}
        x={815}
        y={305}
        width={390}
        tone="green"
        label="Relevant evidence"
        title="The effect depends on contextual cues"
        chip="keep in context"
      />
      <NodeCard
        frame={frame}
        delay={42}
        x={815}
        y={640}
        width={390}
        tone="orange"
        label="Useful detour"
        title="What should I eat tonight?"
        chip={cut > 0.5 ? 'kept on canvas' : 'currently connected'}
        dimmed={cut > 0.5}
      />
      <div
        style={{
          position: 'absolute',
          left: 1262,
          top: 625,
          width: 94,
          height: 94,
          zIndex: 12,
          opacity: cut,
          transform: `scale(${0.72 + cut * 0.28}) rotate(${-14 + cut * 14}deg)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 44,
            top: 4,
            width: 6,
            height: 86,
            borderRadius: 6,
            background: '#d4574e',
            transform: 'rotate(38deg)',
            boxShadow: '0 0 0 12px rgba(212,87,78,.12)',
          }}
        />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 1410,
          top: 455,
          width: 390,
          height: 250,
          borderRadius: 24,
          border: `2px solid ${before > 0.4 ? '#efbd72' : '#9bd5bd'}`,
          background: '#fff',
          boxShadow: cardShadow,
          overflow: 'hidden',
          opacity: reveal(frame, 62, 14),
          zIndex: 7,
        }}
      >
        <div
          style={{
            height: 48,
            padding: '0 19px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: before > 0.4 ? '#a86609' : green,
            background: before > 0.4 ? orangeSoft : greenSoft,
            fontSize: 13,
            fontWeight: 820,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          <span>{before > 0.4 ? 'Polluted answer' : 'Clean answer'}</span>
          <span>{before > 0.4 ? '3 sources' : '2 sources'}</span>
        </div>
        <div style={{position: 'relative', padding: '22px 22px'}}>
          <div style={{position: 'absolute', inset: '22px', opacity: before}}>
            <div style={{color: ink, fontSize: 25, fontWeight: 760, lineHeight: 1.2}}>
              Research summary… and hot pot for dinner.
            </div>
            <div style={{marginTop: 16, color: '#a86609', fontSize: 16}}>
              Unrelated branch entered the request
            </div>
          </div>
          <div style={{position: 'absolute', inset: '22px', opacity: after}}>
            <div style={{color: ink, fontSize: 25, fontWeight: 760, lineHeight: 1.2}}>
              The result depends on contextual cues.
            </div>
            <div style={{marginTop: 16, color: green, fontSize: 16, fontWeight: 720}}>
              Same prompt · −47 tokens · regenerated
            </div>
          </div>
        </div>
      </div>
    </SceneShell>
  );
};

const MergeScene: React.FC = () => {
  const frame = useCurrentFrame();
  const zoom = interpolate(frame, [0, 60, 150], [1.07, 1, 0.95], clamp);
  return (
    <SceneShell frame={frame} duration={DURATIONS.merge} scaleFrom={1}>
      <Caption
        frame={frame}
        delay={4}
        title={
          <>
            Bring only what matters
            <br />
            <span style={{color: purple}}>forward.</span>
          </>
        }
        x={900}
        y={135}
        width={900}
      />
      <div style={{position: 'absolute', inset: 0, transform: `scale(${zoom})`, transformOrigin: '48% 62%'}}>
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, zIndex: 3}}>
          <Edge frame={frame} delay={20} d="M500 340 C650 340 645 560 790 560" tone="green" />
          <Edge frame={frame} delay={32} d="M500 585 C650 585 645 560 790 560" tone="purple" />
          <Edge frame={frame} delay={44} d="M500 830 C650 830 645 560 790 560" tone="green" />
          <Edge frame={frame} delay={68} d="M1220 560 C1360 560 1340 580 1470 580" tone="purple" />
        </svg>
        <NodeCard
          frame={frame}
          delay={10}
          x={120}
          y={255}
          width={380}
          tone="green"
          label="Evidence A"
          title="The effect appears only in one condition"
          chip="selected"
        />
        <NodeCard
          frame={frame}
          delay={24}
          x={120}
          y={500}
          width={380}
          tone="purple"
          label="Evidence B"
          title="The contextual cue changes the outcome"
          chip="selected"
        />
        <NodeCard
          frame={frame}
          delay={38}
          x={120}
          y={745}
          width={380}
          tone="green"
          label="Counterexample"
          title="The prompt alone cannot explain the result"
          chip="selected"
        />
        <NodeCard
          frame={frame}
          delay={56}
          x={790}
          y={455}
          width={430}
          height={215}
          tone="purple"
          label="Merge point"
          title="What actually needs answering next?"
          body="Only the selected paths flow forward."
          chip="3 incoming branches"
          emphasis={0.7}
        />
        <NodeCard
          frame={frame}
          delay={80}
          x={1470}
          y={465}
          width={360}
          height={230}
          tone="green"
          label="Synthesis"
          title="A focused answer with visible provenance"
          body="Every input remains inspectable."
          chip="clean context"
          emphasis={1}
        />
      </div>
    </SceneShell>
  );
};

const MiniNode: React.FC<{x: number; y: number; color: string; width?: number}> = ({
  x,
  y,
  color,
  width = 140,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      width,
      height: 72,
      borderRadius: 13,
      border: `2px solid ${color}`,
      background: '#fff',
      boxShadow: '0 8px 18px rgba(50,40,90,.09)',
    }}
  >
    <div style={{height: 15, background: `${color}22`, borderRadius: '11px 11px 0 0'}} />
    <div style={{width: '56%', height: 6, margin: '16px 12px 0', borderRadius: 5, background: color}} />
    <div style={{width: '72%', height: 5, margin: '8px 12px 0', borderRadius: 5, background: '#ddd8e5'}} />
  </div>
);

const ProtocolScene: React.FC = () => {
  const frame = useCurrentFrame();
  const map = reveal(frame, 2, 18);
  const zoom = interpolate(frame, [0, 80], [1.15, 0.88], clamp);
  const wash = reveal(frame, 24, 18);
  return (
    <SceneShell frame={frame} duration={DURATIONS.protocol} scaleFrom={1}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: map * (1 - wash * 0.72),
          transform: `scale(${zoom})`,
          transformOrigin: 'center',
        }}
      >
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, zIndex: 2}}>
          <Edge frame={frame} delay={5} d="M350 430 C520 430 500 270 680 270" />
          <Edge frame={frame} delay={8} d="M350 430 C520 430 500 580 680 580" tone="orange" />
          <Edge frame={frame} delay={12} d="M820 270 C970 270 960 400 1110 400" tone="green" />
          <Edge frame={frame} delay={16} d="M820 580 C970 580 960 400 1110 400" tone="orange" />
          <Edge frame={frame} delay={20} d="M1250 400 C1400 400 1390 620 1520 620" tone="green" />
          <Edge frame={frame} delay={24} d="M850 820 C1120 820 1250 620 1520 620" />
        </svg>
        <MiniNode x={210} y={394} color={purple} />
        <MiniNode x={680} y={234} color={green} />
        <MiniNode x={680} y={544} color={orange} />
        <MiniNode x={1110} y={364} color={purple} />
        <MiniNode x={710} y={784} color={purple} />
        <MiniNode x={1520} y={584} color={green} width={170} />
      </div>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `rgba(249,248,251,${wash * 0.86})`,
          zIndex: 7,
        }}
      />
      <Caption
        frame={frame}
        delay={28}
        title={
          <>
            The graph is not a picture of context.
            <br />
            <span style={{color: purple}}>It is the context.</span>
          </>
        }
        y={350}
        width={1500}
        align="center"
      />
    </SceneShell>
  );
};

const FinaleScene: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const logo = spring({
    fps,
    frame: frame - 6,
    config: {damping: 18, stiffness: 120, mass: 0.9},
  });
  const wordmark = reveal(frame, 20, 18);
  const tagline = reveal(frame, 36, 18);
  const search = reveal(frame, 54, 18);
  const fadeOut = interpolate(frame, [DURATIONS.finale - 14, DURATIONS.finale], [1, 0], clamp);
  return (
    <AbsoluteFill
      style={{
        opacity: fadeScene(frame, DURATIONS.finale, 10, 0) * fadeOut,
        background: '#fbfafc',
        color: ink,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div style={{textAlign: 'center', transform: 'translateY(-20px)'}}>
        <Img
          src={staticFile('logo.svg')}
          style={{
            width: 164,
            height: 164,
            opacity: logo,
            transform: `scale(${0.78 + logo * 0.22})`,
          }}
        />
        <div
          style={{
            marginTop: 26,
            fontSize: 78,
            fontWeight: 820,
            letterSpacing: '-0.02em',
            opacity: wordmark,
            transform: `translateY(${(1 - wordmark) * 16}px)`,
          }}
        >
          ThoughtDAG
        </div>
        <div
          style={{
            marginTop: 16,
            color: muted,
            fontSize: 28,
            letterSpacing: '-0.02em',
            opacity: tagline,
            transform: `translateY(${(1 - tagline) * 12}px)`,
          }}
        >
          Let conversations follow the shape of thought
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 12,
            marginTop: 34,
            padding: '14px 22px',
            border: '1px solid #ddd8e5',
            borderRadius: 999,
            background: '#fff',
            boxShadow: '0 12px 30px rgba(50,40,90,.09)',
            color: '#4e4858',
            fontSize: 18,
            fontWeight: 680,
            opacity: search,
            transform: `translateY(${(1 - search) * 10}px)`,
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              background: ink,
              fontSize: 14,
            }}
          >
            ⌕
          </span>
          Search GitHub for <span style={{color: purple}}>ThoughtDAG</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const windowOpacity = (
  frame: number,
  start: number,
  end: number,
  fadeIn = 12,
  fadeOut = 12,
) =>
  interpolate(
    frame,
    [start, start + fadeIn, end - fadeOut, end],
    [0, 1, 1, 0],
    clamp,
  );

const storyPosition = (
  frame: number,
  from: {x: number; y: number},
  to: {x: number; y: number},
) => {
  const progress = reveal(frame, STORY_TIMELINE.pivot, 42);
  return {
    x: interpolate(progress, [0, 1], [from.x, to.x], clamp),
    y: interpolate(progress, [0, 1], [from.y, to.y], clamp),
  };
};

const StoryCard: React.FC<{
  frame: number;
  delay: number;
  from: {x: number; y: number};
  to: {x: number; y: number};
  width: number;
  tone: Tone;
  label: string;
  title: string;
  chip?: string;
  dimmed?: boolean;
  emphasis?: number;
}> = ({
  frame,
  delay,
  from,
  to,
  width,
  tone,
  label,
  title,
  chip,
  dimmed = false,
  emphasis = 0,
}) => {
  const position = storyPosition(frame, from, to);
  const appear = spring({
    fps: FPS,
    frame: frame - delay,
    config: {damping: 17, stiffness: 150, mass: 0.8},
  });
  const toneStyle = tones[tone];
  return (
    <div
      style={{
        position: 'absolute',
        left: position.x,
        top: position.y,
        width,
        minHeight: 126,
        borderRadius: 18,
        overflow: 'hidden',
        border: `2px solid ${toneStyle.border}`,
        background: '#fff',
        boxShadow: `${cardShadow}, 0 0 0 ${emphasis * 12}px rgba(107,92,231,${
          emphasis * 0.12
        })`,
        opacity: appear * (dimmed ? 0.3 : 1),
        transform: `translateY(${(1 - appear) * 22}px) scale(${0.95 + appear * 0.05})`,
        zIndex: 8,
      }}
    >
      <div
        style={{
          height: 34,
          padding: '0 15px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: toneStyle.accent,
          background: toneStyle.soft,
          fontSize: 11,
          fontWeight: 820,
          letterSpacing: '.08em',
          textTransform: 'uppercase',
        }}
      >
        <span>{label}</span>
        <span>↗</span>
      </div>
      <div style={{padding: '15px 17px 16px'}}>
        <div
          style={{
            color: ink,
            fontSize: 20,
            lineHeight: 1.15,
            letterSpacing: '-0.012em',
            fontWeight: 760,
          }}
        >
          {title}
        </div>
        {chip ? (
          <div
            style={{
              display: 'inline-flex',
              marginTop: 9,
              padding: '5px 8px',
              borderRadius: 999,
              color: toneStyle.accent,
              background: toneStyle.soft,
              fontSize: 11,
              fontWeight: 760,
            }}
          >
            {chip}
          </div>
        ) : null}
      </div>
    </div>
  );
};

const StoryCaption: React.FC<{
  frame: number;
  start: number;
  end: number;
  children: React.ReactNode;
  lang?: StoryLang;
  center?: boolean;
  y?: number;
  width?: number;
}> = ({frame, start, end, children, lang = 'en', center = false, y = 105, width = 850}) => {
  const opacity = windowOpacity(frame, start, end, 12, 10);
  return (
    <div
      style={{
        position: 'absolute',
        left: center ? '50%' : 105,
        top: y,
        width,
        color: ink,
        fontSize: 68,
        lineHeight: lang === 'zh' ? 1.04 : 0.98,
        letterSpacing: lang === 'zh' ? '.015em' : '-0.018em',
        fontWeight: 840,
        textAlign: center ? 'center' : 'left',
        opacity,
        transform: center
          ? `translateX(-50%) translateY(${(1 - opacity) * 14}px)`
          : `translateY(${(1 - opacity) * 14}px)`,
        zIndex: 30,
      }}
    >
      {children}
    </div>
  );
};

const storyCopy = {
  en: {
    chatTitle: 'One conversation',
    chatScroll: 'keeps scrolling',
    root: ['Starting question', 'What does this paper actually show?', 'from the PDF'],
    evidence: ['Evidence', 'What evidence supports the claim?', 'highlighted passage'],
    image: ['Figure', 'What does this region in the image show?', 'selected region'],
    counter: ['Counterexample', 'When does the explanation fail?', 'keep exploring'],
    detour: ['Useful detour', 'Which unrelated idea did this suggest?', 'still in the thread', 'kept, not included'],
    answerLabel: 'Next answer',
    answerPaths: '3 selected paths',
    answerTitle: 'The effect depends on contextual cues.',
    answerMeta: 'Context visible · answer regenerated',
    hiddenRequest: 'Next request · context hidden in the transcript',
    setup: ['ONE PAPER.', 'ONE QUESTION.'],
    growth: ['THEN MORE', 'QUESTIONS.'],
    crisis: ['WHAT WILL THE MODEL', 'REMEMBER NEXT?'],
    pause: ['I COULDN’T SEE', 'THE CONTEXT ANYMORE.'],
    pivot: ['SO I TURNED THE CONVERSATION', 'INTO A MAP.'],
    action: ['KEEP THE THOUGHT.', 'SHAPE THE CONTEXT.'],
    payoff: ['NOW I CAN EDIT', 'WHAT AI REMEMBERS NEXT.'],
    principle: ['THE GRAPH IS', 'THE CONTEXT'],
    search: 'Search GitHub for',
  },
  zh: {
    chatTitle: '一段对话',
    chatScroll: '还在不断变长',
    root: ['最初的问题', '这篇论文究竟说明了什么？', '来自 PDF'],
    evidence: ['证据', '哪些证据支持这个结论？', '高亮段落'],
    image: ['图片', '这片区域说明了什么？', '选中区域'],
    counter: ['反例', '这个解释什么时候会失效？', '继续追问'],
    detour: ['意外的想法', '它还让我想到了一件别的事', '仍在对话里', '保留，但不带入'],
    answerLabel: '下一次回答',
    answerPaths: '3 条选中路径',
    answerTitle: '结果取决于上下文线索。',
    answerMeta: '上下文清晰可见 · 已重新生成',
    hiddenRequest: '下一次请求 · 上下文藏在聊天记录里',
    setup: ['一篇论文', '一个问题'],
    growth: ['然后，问题', '越来越多'],
    crisis: ['下一次回答', 'AI 究竟会记得什么？'],
    pause: ['可我已经', '看不见上下文了'],
    pivot: ['所以，我把对话', '摊开成一张图'],
    action: ['想法可以留下', '上下文由我决定'],
    payoff: ['现在，我能决定', 'AI 下一次记得什么'],
    principle: ['连线，就是', '上下文'],
    search: '在 GitHub 搜索',
  },
} as const;

const UnifiedResearchStory: React.FC<{lang: StoryLang}> = ({lang}) => {
  const frame = useCurrentFrame();
  const copy = storyCopy[lang];
  const pivot = reveal(frame, STORY_TIMELINE.pivot, 42);
  const cut = reveal(frame, 555, 9);
  const merge = reveal(frame, 585, 18);
  const clean = reveal(frame, 624, 16);
  const pauseWash = windowOpacity(
    frame,
    STORY_TIMELINE.pause,
    STORY_TIMELINE.pivot + 10,
    9,
    12,
  );
  const chatOpacity = 1 - pivot;
  const sourceScale = interpolate(pivot, [0, 1], [0.82, 0.52], clamp);
  const sourceShiftY = interpolate(pivot, [0, 1], [130, 350], clamp);
  const requestStress = windowOpacity(
    frame,
    STORY_TIMELINE.crisis + 10,
    STORY_TIMELINE.pause + 8,
    12,
    10,
  );

  const rootFrom = {x: 820, y: 275};
  const rootTo = {x: 515, y: 500};
  const evidenceFrom = {x: 875, y: 420};
  const evidenceTo = {x: 950, y: 255};
  const imageFrom = {x: 820, y: 560};
  const imageTo = {x: 950, y: 430};
  const counterFrom = {x: 875, y: 700};
  const counterTo = {x: 950, y: 605};
  const detourFrom = {x: 820, y: 835};
  const detourTo = {x: 950, y: 780};

  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        color: ink,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <PaperBackground />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          transform: `translateY(${sourceShiftY}px) scale(${sourceScale})`,
          transformOrigin: 'top left',
          opacity: interpolate(frame, [720, 760], [1, 0.45], clamp),
          zIndex: 4,
        }}
      >
        <SourcePanel frame={frame} lang={lang} />
      </div>

      <div
        style={{
          position: 'absolute',
          left: 755,
          top: 230,
          width: 980,
          height: 770,
          borderRadius: 28,
          border: '1px solid #ded9e8',
          background: 'rgba(255,255,255,.8)',
          boxShadow: cardShadow,
          opacity: chatOpacity * reveal(frame, 18, 14),
          zIndex: 2,
        }}
      >
        <div
          style={{
            height: 54,
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#827c8c',
            background: '#f1eff5',
            borderRadius: '27px 27px 0 0',
            fontSize: 13,
            fontWeight: 820,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          <span>{copy.chatTitle}</span>
          <span style={{color: requestStress > 0.4 ? orange : '#827c8c'}}>
            {copy.chatScroll}
          </span>
        </div>
      </div>

      <svg width={W} height={H} style={{position: 'absolute', inset: 0, zIndex: 6}}>
        <g opacity={pivot}>
          <Edge frame={frame} delay={392} d="M410 635 C465 635 465 563 515 563" />
          <Edge frame={frame} delay={410} d="M865 563 C900 563 910 318 950 318" tone="green" />
          <Edge frame={frame} delay={420} d="M865 563 C905 563 910 493 950 493" />
          <Edge frame={frame} delay={430} d="M865 563 C905 563 910 668 950 668" tone="green" />
          <Edge
            frame={frame}
            delay={440}
            end={558}
            d="M865 563 C905 563 910 843 950 843"
            tone="orange"
          />
          <g opacity={merge}>
            <Edge frame={frame} delay={578} d="M1310 318 C1420 318 1400 574 1510 574" tone="green" />
            <Edge frame={frame} delay={588} d="M1310 493 C1420 493 1400 574 1510 574" />
            <Edge frame={frame} delay={598} d="M1310 668 C1420 668 1400 574 1510 574" tone="green" />
          </g>
        </g>
      </svg>

      <StoryCard
        frame={frame}
        delay={28}
        from={rootFrom}
        to={rootTo}
        width={350}
        tone="purple"
        label={copy.root[0]}
        title={copy.root[1]}
        chip={copy.root[2]}
      />
      <StoryCard
        frame={frame}
        delay={92}
        from={evidenceFrom}
        to={evidenceTo}
        width={360}
        tone="green"
        label={copy.evidence[0]}
        title={copy.evidence[1]}
        chip={copy.evidence[2]}
      />
      <StoryCard
        frame={frame}
        delay={122}
        from={imageFrom}
        to={imageTo}
        width={360}
        tone="purple"
        label={copy.image[0]}
        title={copy.image[1]}
        chip={copy.image[2]}
      />
      <StoryCard
        frame={frame}
        delay={152}
        from={counterFrom}
        to={counterTo}
        width={360}
        tone="green"
        label={copy.counter[0]}
        title={copy.counter[1]}
        chip={copy.counter[2]}
      />
      <StoryCard
        frame={frame}
        delay={180}
        from={detourFrom}
        to={detourTo}
        width={360}
        tone="orange"
        label={copy.detour[0]}
        title={copy.detour[1]}
        chip={cut > 0.5 ? copy.detour[3] : copy.detour[2]}
        dimmed={cut > 0.5}
      />

      <div
        style={{
          position: 'absolute',
          left: 1510,
          top: 485,
          width: 335,
          minHeight: 178,
          borderRadius: 22,
          overflow: 'hidden',
          border: `2px solid ${green}`,
          background: '#fff',
          boxShadow: `${cardShadow}, 0 0 0 ${clean * 14}px rgba(37,160,107,${
            clean * 0.12
          })`,
          opacity: clean,
          transform: `translateX(${(1 - clean) * 24}px) scale(${0.96 + clean * 0.04})`,
          zIndex: 9,
        }}
      >
        <div
          style={{
            height: 38,
            padding: '0 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: green,
            background: greenSoft,
            fontSize: 11,
            fontWeight: 820,
            letterSpacing: '.08em',
            textTransform: 'uppercase',
          }}
        >
          <span>{copy.answerLabel}</span>
          <span>{copy.answerPaths}</span>
        </div>
        <div style={{padding: '18px'}}>
          <div style={{fontSize: 22, lineHeight: 1.16, fontWeight: 780}}>
            {copy.answerTitle}
          </div>
          <div style={{marginTop: 12, color: green, fontSize: 13, fontWeight: 760}}>
            {copy.answerMeta}
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: 882,
          top: 748,
          width: 78,
          height: 78,
          zIndex: 18,
          opacity: cut,
          transform: `scale(${0.7 + cut * 0.3})`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 36,
            top: 0,
            width: 6,
            height: 78,
            borderRadius: 6,
            background: '#d4574e',
            transform: 'rotate(42deg)',
            boxShadow: '0 0 0 11px rgba(212,87,78,.1)',
          }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          right: 90,
          bottom: 64,
          padding: '13px 18px',
          borderRadius: 999,
          color: orange,
          background: orangeSoft,
          border: '1px solid #efbd72',
          fontSize: 14,
          fontWeight: 820,
          letterSpacing: '.07em',
          textTransform: 'uppercase',
          opacity: requestStress,
          transform: `translateY(${(1 - requestStress) * 12}px)`,
          zIndex: 20,
        }}
      >
        {copy.hiddenRequest}
      </div>

      <StoryCaption frame={frame} start={0} end={STORY_TIMELINE.growth} lang={lang} y={100}>
        {copy.setup[0]}
        <br />
        <span style={{color: purple}}>{copy.setup[1]}</span>
      </StoryCaption>
      <StoryCaption
        frame={frame}
        start={STORY_TIMELINE.growth}
        end={STORY_TIMELINE.crisis}
        lang={lang}
        y={92}
      >
        {copy.growth[0]}
        <br />
        <span style={{color: purple}}>{copy.growth[1]}</span>
      </StoryCaption>
      <StoryCaption
        frame={frame}
        start={STORY_TIMELINE.crisis}
        end={STORY_TIMELINE.pause}
        lang={lang}
        y={90}
        width={1050}
      >
        {copy.crisis[0]}
        <br />
        <span style={{color: orange}}>{copy.crisis[1]}</span>
      </StoryCaption>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `rgba(249,248,251,${pauseWash * 0.91})`,
          backdropFilter: `blur(${pauseWash * 8}px)`,
          zIndex: 24,
          pointerEvents: 'none',
        }}
      />
      <StoryCaption
        frame={frame}
        start={STORY_TIMELINE.pause}
        end={STORY_TIMELINE.pivot}
        lang={lang}
        center
        y={410}
        width={1400}
      >
        {copy.pause[0]}
        <br />
        <span style={{color: purple}}>{copy.pause[1]}</span>
      </StoryCaption>
      <StoryCaption
        frame={frame}
        start={STORY_TIMELINE.pivot}
        end={STORY_TIMELINE.action}
        lang={lang}
        center
        y={92}
        width={1550}
      >
        {copy.pivot[0]}
        <br />
        <span style={{color: purple}}>{copy.pivot[1]}</span>
      </StoryCaption>
      <StoryCaption
        frame={frame}
        start={STORY_TIMELINE.action}
        end={STORY_TIMELINE.payoff}
        lang={lang}
        y={90}
        width={900}
      >
        {copy.action[0]}
        <br />
        <span style={{color: purple}}>{copy.action[1]}</span>
      </StoryCaption>
      <StoryCaption
        frame={frame}
        start={STORY_TIMELINE.payoff}
        end={STORY_TIMELINE.finale}
        lang={lang}
        center
        y={92}
        width={1500}
      >
        {copy.payoff[0]}
        <br />
        <span style={{color: purple}}>{copy.payoff[1]}</span>
      </StoryCaption>
      <BrandBar frame={frame} />
    </AbsoluteFill>
  );
};

const StoryFinale: React.FC<{lang: StoryLang}> = ({lang}) => {
  const frame = useCurrentFrame();
  const copy = storyCopy[lang];
  const principle = windowOpacity(frame, 0, 72, 10, 12);
  const logo = spring({
    fps: FPS,
    frame: frame - 56,
    config: {damping: 18, stiffness: 120, mass: 0.9},
  });
  const wordmark = reveal(frame, 70, 16);
  const search = reveal(frame, 92, 15);
  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        background: '#fbfafc',
        color: ink,
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 440,
          width: 1500,
          textAlign: 'center',
          fontSize: lang === 'zh' ? 76 : 72,
          lineHeight: lang === 'zh' ? 1.08 : 1,
          letterSpacing: lang === 'zh' ? '.02em' : '-0.018em',
          fontWeight: 840,
          opacity: principle,
          transform: 'translateX(-50%)',
        }}
      >
        {copy.principle[0]} <span style={{color: purple}}>{copy.principle[1]}</span>
      </div>
      <div
        style={{
          textAlign: 'center',
          opacity: logo,
          transform: `translateY(-8px) scale(${0.9 + logo * 0.1})`,
        }}
      >
        <Img src={staticFile('logo.svg')} style={{width: 164, height: 164}} />
        <div
          style={{
            marginTop: 24,
            fontSize: 80,
            fontWeight: 840,
            letterSpacing: '-0.018em',
            opacity: wordmark,
          }}
        >
          ThoughtDAG
        </div>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 15,
            marginTop: 28,
            padding: '16px 27px',
            borderRadius: 999,
            background: '#f0edf6',
            color: muted,
            boxShadow: '0 12px 34px rgba(58, 48, 95, .12)',
            fontSize: 26,
            fontWeight: 760,
            opacity: search,
          }}
        >
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 36,
              height: 36,
              borderRadius: 18,
              color: '#fff',
              background: ink,
              fontSize: 21,
            }}
          >
            ⌕
          </span>
          {copy.search} <span style={{color: purple}}>ThoughtDAG</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ScrollAnimaticWide: React.FC<{lang: StoryLang}> = ({lang}) => (
  <AbsoluteFill style={{background: '#f9f8fb'}}>
    <Audio
      src={staticFile('audio/scroll-animatic-en-wide/heartbeat-master.wav')}
      volume={1}
    />
    <Sequence from={0} durationInFrames={STORY_TIMELINE.finale}>
      <UnifiedResearchStory lang={lang} />
    </Sequence>
    <Sequence
      from={STORY_TIMELINE.finale}
      durationInFrames={STORY_TIMELINE.end - STORY_TIMELINE.finale}
    >
      <StoryFinale lang={lang} />
    </Sequence>
  </AbsoluteFill>
);

export const ScrollAnimaticEnWide: React.FC = () => <ScrollAnimaticWide lang="en" />;
export const ScrollAnimaticZhWide: React.FC = () => <ScrollAnimaticWide lang="zh" />;
