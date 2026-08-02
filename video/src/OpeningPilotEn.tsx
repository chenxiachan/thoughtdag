import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';

const FPS = 30;
const W = 1920;
const H = 1080;
const DURATION = 315;
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const OPENING_PILOT_EN_DURATION = DURATION;
export const OPENING_PILOT_EN_SIZE = {width: W, height: H, fps: FPS};

const ink = '#1d1a24';
const purple = '#6b5ce7';
const purpleSoft = '#eeeafd';

const reveal = (frame: number, from: number, duration = 18) =>
  interpolate(frame, [from, from + duration], [0, 1], clamp);

const Subtitle: React.FC<{
  frame: number;
  start: number;
  end: number;
  children: React.ReactNode;
}> = ({frame, start, end, children}) => {
  const opacity =
    interpolate(frame, [start, start + 8], [0, 1], clamp) *
    interpolate(frame, [end - 7, end], [1, 0], clamp);

  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 54,
        zIndex: 30,
        maxWidth: 1040,
        padding: '13px 25px 15px',
        borderRadius: 14,
        color: '#fff',
        background: 'rgba(24, 21, 31, .82)',
        boxShadow: '0 10px 34px rgba(22, 18, 38, .12)',
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        fontSize: 31,
        fontWeight: 570,
        lineHeight: 1.18,
        letterSpacing: '-0.012em',
        textAlign: 'center',
        opacity,
        transform: `translateX(-50%) translateY(${(1 - opacity) * 8}px)`,
      }}
    >
      {children}
    </div>
  );
};

const Node: React.FC<{
  frame: number;
  delay: number;
  x: number;
  y: number;
  label: string;
  title: string;
  tone?: 'purple' | 'green' | 'orange';
}> = ({frame, delay, x, y, label, title, tone = 'purple'}) => {
  const p = spring({
    fps: FPS,
    frame: frame - delay,
    config: {damping: 18, stiffness: 130, mass: 0.86},
  });
  const palette = {
    purple: {accent: purple, border: '#bdb4f2', soft: purpleSoft},
    green: {accent: '#269d6b', border: '#9bd5bd', soft: '#e5f5ed'},
    orange: {accent: '#dd881c', border: '#f0bf76', soft: '#fff1df'},
  }[tone];

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: 470,
        height: 188,
        overflow: 'hidden',
        border: `2px solid ${palette.border}`,
        borderRadius: 22,
        background: '#fff',
        boxShadow: '0 24px 64px rgba(49, 40, 88, .13)',
        opacity: p,
        transform: `translateY(${(1 - p) * 24}px) scale(${0.94 + p * 0.06})`,
        transformOrigin: 'center',
      }}
    >
      <div
        style={{
          height: 43,
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          color: palette.accent,
          background: palette.soft,
          fontSize: 13,
          fontWeight: 820,
          letterSpacing: '.1em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          padding: '22px 23px',
          color: ink,
          fontSize: 29,
          fontWeight: 740,
          lineHeight: 1.18,
          letterSpacing: '-0.018em',
        }}
      >
        {title}
      </div>
      <div
        style={{
          position: 'absolute',
          right: -8,
          top: 86,
          width: 16,
          height: 16,
          border: '4px solid #fff',
          borderRadius: 99,
          background: palette.accent,
          boxShadow: `0 0 0 2px ${palette.accent}`,
        }}
      />
      {tone !== 'purple' ? (
        <div
          style={{
            position: 'absolute',
            left: -8,
            top: 86,
            width: 16,
            height: 16,
            border: '4px solid #fff',
            borderRadius: 99,
            background: palette.accent,
            boxShadow: `0 0 0 2px ${palette.accent}`,
          }}
        />
      ) : null}
    </div>
  );
};

const BranchEdge: React.FC<{
  frame: number;
  delay: number;
  path: string;
  color: string;
}> = ({frame, delay, path, color}) => {
  const p = interpolate(frame, [delay, delay + 26], [0, 1], clamp);
  return (
    <path
      d={path}
      fill="none"
      stroke={color}
      strokeWidth={6}
      strokeLinecap="round"
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - p}
      opacity={0.28 + p * 0.72}
    />
  );
};

const Hook: React.FC<{frame: number}> = ({frame}) => {
  const first = reveal(frame, 10, 18);
  const second = reveal(frame, 24, 18);
  const exit = interpolate(frame, [66, 84], [0, 1], clamp);
  const copyExit = interpolate(frame, [57, 67], [0, 1], clamp);
  const dot = spring({
    fps: FPS,
    frame: frame - 49,
    config: {damping: 15, stiffness: 180},
  });

  return (
    <AbsoluteFill
      style={{
        zIndex: 20,
        overflow: 'hidden',
        color: '#f7f4ff',
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: '50.5%',
          height: '100%',
          background: '#09090c',
          transform: `translateX(${-exit * 104}%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: '50.5%',
          height: '100%',
          background: '#09090c',
          transform: `translateX(${exit * 104}%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 56% 70% at 50% 42%, rgba(107,92,231,.2), transparent 70%)',
          opacity: 1 - exit,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 250,
          right: 250,
          top: '50%',
          textAlign: 'center',
          opacity: 1 - copyExit,
          transform: `translateY(-52%) scale(${1 + copyExit * 0.025})`,
        }}
      >
        <div
          style={{
            fontSize: 78,
            lineHeight: 1.06,
            fontWeight: 790,
            letterSpacing: '-0.012em',
            opacity: first,
            transform: `translateY(${(1 - first) * 18}px)`,
          }}
        >
          Why does every AI conversation
        </div>
        <div
          style={{
            marginTop: 15,
            color: '#9185ff',
            fontSize: 82,
            lineHeight: 1.05,
            fontWeight: 820,
            letterSpacing: '-0.01em',
            opacity: second,
            transform: `translateY(${(1 - second) * 18}px)`,
          }}
        >
          become one long thread?
        </div>
        <div
          style={{
            width: 9,
            height: 9,
            margin: '44px auto 0',
            borderRadius: 99,
            background: '#9185ff',
            opacity: dot * (1 - copyExit),
            transform: `scale(${0.5 + dot * 0.9})`,
            boxShadow: '0 0 32px rgba(145,133,255,.74)',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

export const OpeningPilotEn: React.FC = () => {
  const frame = useCurrentFrame();
  const canvas = reveal(frame, 62, 22);
  const camera = interpolate(frame, [72, DURATION], [1.045, 0.93], clamp);
  const panX = interpolate(frame, [72, DURATION], [70, -18], clamp);

  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        background: '#faf9fc',
        fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: canvas * 0.52,
          backgroundImage:
            'radial-gradient(ellipse 60% 45% at 50% 0%, rgba(107,92,231,.12), transparent 72%), radial-gradient(circle, rgba(91,79,140,.13) 1px, transparent 1.2px)',
          backgroundSize: '100% 100%, 27px 27px',
        }}
      />

      <div
        style={{
          position: 'absolute',
          left: 56,
          top: 40,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 13,
          color: ink,
          fontSize: 24,
          fontWeight: 760,
          letterSpacing: '-0.025em',
          opacity: reveal(frame, 72, 16),
        }}
      >
        <Img src={staticFile('logo.svg')} style={{width: 40, height: 40}} />
        ThoughtDAG
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: canvas,
          transform: `translateX(${panX}px) scale(${camera})`,
          transformOrigin: '52% 52%',
        }}
      >
        <svg width={W} height={H} style={{position: 'absolute', inset: 0, overflow: 'visible'}}>
          <BranchEdge
            frame={frame}
            delay={151}
            path="M690 548 C805 548 820 350 960 350"
            color="#269d6b"
          />
          <BranchEdge
            frame={frame}
            delay={175}
            path="M690 548 C820 548 820 734 960 734"
            color="#dd881c"
          />
          <circle cx="690" cy="548" r="7" fill={purple} opacity={reveal(frame, 132, 10)} />
        </svg>

        <Node
          frame={frame}
          delay={72}
          x={interpolate(frame, [72, 145], [725, 220], clamp)}
          y={454}
          label="Starting question"
          title="What am I actually trying to understand?"
        />
        <Node
          frame={frame}
          delay={163}
          x={960}
          y={256}
          label="Direction 01"
          title="What evidence supports it?"
          tone="green"
        />
        <Node
          frame={frame}
          delay={187}
          x={960}
          y={640}
          label="Direction 02"
          title="Could there be another explanation?"
          tone="orange"
        />
      </div>

      <Hook frame={frame} />

      <Subtitle frame={frame} start={71} end={150}>
        My thinking became harder to see.
      </Subtitle>
      <Subtitle frame={frame} start={151} end={224}>
        Thoughts don’t move in a straight line.
      </Subtitle>
      <Subtitle frame={frame} start={225} end={304}>
        They branch.
      </Subtitle>
    </AbsoluteFill>
  );
};
