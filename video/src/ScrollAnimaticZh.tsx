import React from 'react';
import {
  AbsoluteFill,
  Img,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
} from 'remotion';

const FPS = 30;
const INTRO_DURATION = 1.8 * FPS;
const STORY_DURATION = 30 * FPS;
const DURATION = INTRO_DURATION + STORY_DURATION;
const W = 1080;
const H = 1920;
const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;
type Language = 'zh' | 'en';
const LanguageContext = React.createContext<Language>('zh');
const useLanguage = () => React.useContext(LanguageContext);

export const SCROLL_ANIMATIC_ZH_DURATION = DURATION;
export const SCROLL_ANIMATIC_ZH_SIZE = {width: W, height: H, fps: FPS};
export const SCROLL_ANIMATIC_EN_DURATION = DURATION;
export const SCROLL_ANIMATIC_EN_SIZE = {width: W, height: H, fps: FPS};

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

const punch = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return 1 - Math.pow(1 - t, 4);
};

const segment = (
  frame: number,
  start: number,
  end: number,
  from: number,
  to: number,
) => from + (to - from) * smooth((frame - start) / (end - start));

const fastSegment = (
  frame: number,
  start: number,
  end: number,
  from: number,
  to: number,
) => from + (to - from) * punch((frame - start) / (end - start));

const cameraAt = (frame: number) => {
  if (frame < 105) {
    return {
      x: segment(frame, 0, 105, 650, 650),
      y: segment(frame, 0, 105, 700, 970),
      z: segment(frame, 0, 105, 1.32, 1.2),
    };
  }
  if (frame < 126) {
    return {
      x: fastSegment(frame, 105, 126, 650, 1410),
      y: fastSegment(frame, 105, 126, 970, 600),
      z: fastSegment(frame, 105, 126, 1.2, 1.08),
    };
  }
  if (frame < 200) {
    return {
      x: segment(frame, 126, 200, 1410, 1410),
      y: segment(frame, 126, 200, 600, 630),
      z: segment(frame, 126, 200, 1.08, 1.12),
    };
  }
  if (frame < 217) {
    return {
      x: fastSegment(frame, 200, 217, 1410, 1360),
      y: fastSegment(frame, 200, 217, 630, 1110),
      z: fastSegment(frame, 200, 217, 1.12, 1.03),
    };
  }
  if (frame < 285) {
    return {
      x: segment(frame, 217, 285, 1360, 1360),
      y: segment(frame, 217, 285, 1110, 1190),
      z: segment(frame, 217, 285, 1.03, 1.0),
    };
  }
  if (frame < 300) {
    return {
      x: fastSegment(frame, 285, 300, 1360, 1320),
      y: fastSegment(frame, 285, 300, 1190, 1030),
      z: fastSegment(frame, 285, 300, 1.0, 0.72),
    };
  }
  if (frame < 342) {
    return {
      x: segment(frame, 300, 342, 1320, 1320),
      y: segment(frame, 300, 342, 1030, 1060),
      z: segment(frame, 300, 342, 0.72, 0.76),
    };
  }
  if (frame < 358) {
    return {
      x: fastSegment(frame, 342, 358, 1320, 1100),
      y: fastSegment(frame, 342, 358, 1060, 2240),
      z: fastSegment(frame, 342, 358, 0.76, 0.74),
    };
  }
  if (frame < 450) {
    return {
      x: segment(frame, 358, 450, 1100, 1120),
      y: segment(frame, 358, 450, 2240, 2280),
      z: segment(frame, 358, 450, 0.74, 0.8),
    };
  }
  if (frame < 464) {
    return {
      x: fastSegment(frame, 450, 464, 1120, 1300),
      y: fastSegment(frame, 450, 464, 2280, 2780),
      z: fastSegment(frame, 450, 464, 0.8, 0.84),
    };
  }
  if (frame < 535) {
    return {
      x: segment(frame, 464, 535, 1300, 1300),
      y: segment(frame, 464, 535, 2780, 2800),
      z: segment(frame, 464, 535, 0.84, 0.88),
    };
  }
  if (frame < 548) {
    return {
      x: fastSegment(frame, 535, 548, 1300, 2110),
      y: fastSegment(frame, 535, 548, 2800, 1500),
      z: fastSegment(frame, 535, 548, 0.88, 0.98),
    };
  }
  if (frame < 620) {
    return {
      x: segment(frame, 548, 620, 2110, 2110),
      y: segment(frame, 548, 620, 1500, 1510),
      z: segment(frame, 548, 620, 0.98, 1.02),
    };
  }
  if (frame < 632) {
    return {
      x: fastSegment(frame, 620, 632, 2110, 1500),
      y: fastSegment(frame, 620, 632, 1510, 3400),
      z: fastSegment(frame, 620, 632, 1.02, 0.95),
    };
  }
  if (frame < 735) {
    return {
      x: segment(frame, 632, 735, 1500, 1500),
      y: segment(frame, 632, 735, 3400, 3420),
      z: segment(frame, 632, 735, 0.95, 1.0),
    };
  }
  if (frame < 747) {
    return {
      x: fastSegment(frame, 735, 747, 1500, 1320),
      y: fastSegment(frame, 735, 747, 3420, 1940),
      z: fastSegment(frame, 735, 747, 1.0, 0.46),
    };
  }
  return {
    x: segment(frame, 747, 820, 1320, 1320),
    y: segment(frame, 747, 820, 1940, 1960),
    z: segment(frame, 747, 820, 0.46, 0.5),
  };
};

const Brand: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      top: 52,
      left: 50,
      zIndex: 30,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      color: '#26232e',
      fontFamily: '"PingFang SC", "Noto Sans CJK SC", sans-serif',
      fontSize: 30,
      fontWeight: 760,
      letterSpacing: '-0.02em',
    }}
  >
    <Img src={staticFile('logo.svg')} style={{width: 52, height: 52}} />
    ThoughtDAG
  </div>
);

const ChatCard: React.FC = () => {
  const frame = useCurrentFrame();
  const language = useLanguage();
  const rows =
    language === 'en'
      ? [
          {text: 'I want to really understand this paper.', user: true},
          {text: 'Start with its central hypothesis.', user: false},
          {text: 'What evidence supports this claim?', user: true},
          {text: 'The experiments support part of it, but…', user: false},
          {text: 'Could there be another explanation?', user: true},
          {text: 'Check the limitations and counterexamples.', user: false},
        ]
      : [
          {text: '我想把这篇论文真正读懂。', user: true},
          {text: '可以先从它的核心假设开始。', user: false},
          {text: '这个结论有哪些证据？', user: true},
          {text: '实验结果支持其中一部分，但……', user: false},
          {text: '有没有另一种解释？', user: true},
          {text: '可以从方法限制和反例继续看。', user: false},
        ];
  const dim = interpolate(frame, [104, 132], [1, 0.3], clamp);
  const shift = interpolate(frame, [104, 130], [0, -34], clamp);

  return (
    <div
      style={{
        position: 'absolute',
        left: 350,
        top: 270,
        width: 600,
        height: 1110,
        overflow: 'hidden',
        borderRadius: 28,
        border: '2px solid #dcd7e5',
        background: 'rgba(255,255,255,.98)',
        boxShadow: '0 32px 88px rgba(52,42,95,.16)',
        opacity: dim,
        transform: `translateX(${shift}px)`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          right: -11,
          top: 539,
          zIndex: 4,
          width: 22,
          height: 22,
          borderRadius: 999,
          border: '5px solid #fff',
          background: '#8f82eb',
          boxShadow: '0 0 0 2px #8f82eb',
        }}
      />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 74,
          padding: '0 24px',
          borderBottom: '1px solid #ebe8f0',
          color: '#918b9e',
          fontFamily: '"PingFang SC", sans-serif',
          fontSize: 17,
          fontWeight: 720,
          letterSpacing: '0.08em',
        }}
      >
        <span>{language === 'en' ? 'AI CHAT' : 'AI 对话'}</span>
        <span>{language === 'en' ? 'KEEPS SCROLLING' : '不断向下'}</span>
      </div>
      <div style={{padding: '28px 26px'}}>
        {rows.map((row, index) => {
          const reveal = spring({
            frame: frame - index * 10,
            fps: FPS,
            config: {damping: 18, stiffness: 125},
          });
          return (
            <div
              key={row.text}
              style={{
                marginTop: index === 0 ? 0 : 18,
                marginLeft: row.user ? 76 : 0,
                marginRight: row.user ? 0 : 58,
                padding: '19px 22px',
                borderRadius: 18,
                color: row.user ? '#574abf' : '#47424f',
                background: row.user ? '#eeeaff' : '#f2f0f5',
                fontFamily: '"PingFang SC", sans-serif',
                fontSize: 25,
                lineHeight: 1.46,
                fontWeight: row.user ? 650 : 520,
                opacity: reveal,
                transform: `translateY(${(1 - reveal) * 22}px)`,
              }}
            >
              {row.text}
            </div>
          );
        })}
        <div
          style={{
            marginTop: 38,
            color: '#96909e',
            fontFamily: '"PingFang SC", sans-serif',
            fontSize: 21,
            lineHeight: 1.55,
            opacity: interpolate(frame, [62, 82], [0, 1], clamp),
          }}
        >
          {language === 'en'
            ? 'More questions, squeezed into the same timeline.'
            : '问题越来越多，却只能挤在同一条时间线上。'}
        </div>
      </div>
    </div>
  );
};

type ThoughtNodeProps = {
  x: number;
  y: number;
  width?: number;
  eyebrow: string;
  title: string;
  note: string;
  color?: 'purple' | 'green' | 'orange';
  start: number;
  ports?: Array<'left' | 'top' | 'bottom'>;
  dimAt?: number;
};

const ThoughtNode: React.FC<ThoughtNodeProps> = ({
  x,
  y,
  width = 440,
  eyebrow,
  title,
  note,
  color = 'purple',
  start,
  ports = [],
  dimAt,
}) => {
  const frame = useCurrentFrame();
  const tone =
    color === 'green'
      ? {border: '#71c59f', chip: '#e5f7ef', text: '#267453'}
      : color === 'orange'
        ? {border: '#e8aa56', chip: '#fff1dc', text: '#9a5c0d'}
        : {border: '#8f82eb', chip: '#eeeaff', text: '#5f51cf'};
  const enter = spring({
    frame: frame - start,
    fps: FPS,
    config: {damping: 17, stiffness: 145},
  });
  const activeOpacity =
    dimAt === undefined
      ? 1
      : interpolate(frame, [dimAt, dimAt + 24], [1, 0.34], clamp);

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height: 250,
        boxSizing: 'border-box',
        overflow: 'hidden',
        borderRadius: 24,
        border: `3px solid ${tone.border}`,
        background: 'rgba(255,255,255,.98)',
        boxShadow: '0 24px 65px rgba(49,39,91,.15)',
        opacity: enter * activeOpacity,
        transform: `translateY(${(1 - enter) * 28}px) scale(${0.94 + enter * 0.06})`,
      }}
    >
      {ports.map((port) => (
        <div
          key={port}
          style={{
            position: 'absolute',
            zIndex: 5,
            width: 20,
            height: 20,
            borderRadius: 999,
            border: '4px solid #fff',
            background: tone.border,
            boxShadow: `0 0 0 2px ${tone.border}`,
            ...(port === 'left'
              ? {left: -11, top: '50%', transform: 'translateY(-50%)'}
              : port === 'top'
                ? {top: -11, left: '50%', transform: 'translateX(-50%)'}
                : {bottom: -11, left: '50%', transform: 'translateX(-50%)'}),
          }}
        />
      ))}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '17px 21px',
          borderBottom: '1px solid #ebe8f0',
          color: '#918b9e',
          fontFamily: '"PingFang SC", sans-serif',
          fontSize: 15,
          fontWeight: 760,
          letterSpacing: '0.08em',
        }}
      >
        <span>{eyebrow}</span>
        <span>↗</span>
      </div>
      <div style={{padding: '24px 24px 27px'}}>
        <div
          style={{
            color: '#282530',
            fontFamily: '"PingFang SC", sans-serif',
            fontSize: 29,
            lineHeight: 1.35,
            fontWeight: 760,
            letterSpacing: '-0.03em',
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'inline-flex',
            marginTop: 18,
            padding: '8px 12px',
            borderRadius: 999,
            color: tone.text,
            background: tone.chip,
            fontFamily: '"PingFang SC", sans-serif',
            fontSize: 16,
            fontWeight: 680,
          }}
        >
          {note}
        </div>
      </div>
    </div>
  );
};

const Edge: React.FC<{
  d: string;
  start: number;
  color?: string;
  width?: number;
  duration?: number;
}> = ({d, start, color = '#6b5ce7', width = 7, duration = 42}) => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [start, start + duration], [0, 1], clamp);
  return (
    <path
      d={d}
      pathLength={1}
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeDasharray={1}
      strokeDashoffset={1 - reveal}
      opacity={0.92}
    />
  );
};

const PrunableEdge: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = interpolate(frame, [252, 278], [0, 1], clamp);
  const exit = interpolate(frame, [574, 598], [1, 0], clamp);
  const reveal = Math.min(enter, exit);
  return (
    <path
      d="M1680 1180 C1810 1240 2070 1240 2200 1400"
      pathLength={1}
      fill="none"
      stroke="#e7a655"
      strokeWidth={6}
      strokeLinecap="round"
      strokeDasharray={1}
      strokeDashoffset={1 - reveal}
      opacity={reveal * 0.92}
    />
  );
};

const CutSpark: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [568, 577, 592, 604],
    [0, 1, 1, 0],
    clamp,
  );
  const scale = spring({
    frame: frame - 570,
    fps: FPS,
    config: {damping: 13, stiffness: 190},
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: 1980,
        top: 1250,
        zIndex: 20,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 68,
        height: 68,
        borderRadius: 999,
        color: '#fff',
        background: '#e7a655',
        boxShadow: '0 0 0 16px rgba(231,166,85,.18), 0 18px 44px rgba(156,91,12,.24)',
        fontFamily: '"PingFang SC", sans-serif',
        fontSize: 35,
        fontWeight: 820,
        opacity,
        transform: `scale(${0.7 + scale * 0.3})`,
      }}
    >
      ×
    </div>
  );
};

const PdfPage: React.FC = () => {
  const frame = useCurrentFrame();
  const enter = spring({
    frame: frame - 360,
    fps: FPS,
    config: {damping: 18, stiffness: 125},
  });
  const highlight = interpolate(frame, [392, 435], [0, 1], clamp);
  const paragraphOpacity = interpolate(frame, [376, 406], [0.42, 1], clamp);

  return (
    <div
      style={{
        position: 'absolute',
        left: 330,
        top: 1810,
        width: 820,
        height: 880,
        boxSizing: 'border-box',
        overflow: 'hidden',
        border: '2px solid #d9d5e2',
        borderRadius: 24,
        background: '#fff',
        boxShadow: '0 36px 100px rgba(46,38,82,.18)',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 36}px) scale(${0.96 + enter * 0.04})`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 68,
          padding: '0 24px',
          color: '#8b8596',
          background: '#f2f0f6',
          borderBottom: '1px solid #e6e2ea',
          fontFamily: '"PingFang SC", sans-serif',
          fontSize: 16,
          fontWeight: 720,
        }}
      >
        <span>📄 research-paper.pdf</span>
        <span>12 / 24</span>
      </div>
      <div
        style={{
          padding: '54px 66px',
          color: '#3a3640',
          fontFamily: 'Georgia, "Times New Roman", serif',
        }}
      >
        <div
          style={{
            color: '#27232d',
            fontSize: 35,
            lineHeight: 1.25,
            fontWeight: 700,
          }}
        >
          3. Evidence for the proposed mechanism
        </div>
        <div
          style={{
            marginTop: 42,
            fontSize: 23,
            lineHeight: 1.72,
            opacity: 0.58,
          }}
        >
          The observed effect was selective to the experimental condition and
          remained stable across the two replication cohorts.
        </div>
        <div
          style={{
            position: 'relative',
            marginTop: 36,
            padding: '18px 20px',
            fontSize: 26,
            lineHeight: 1.68,
            opacity: paragraphOpacity,
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              width: `${highlight * 100}%`,
              borderRadius: 12,
              background: '#dff5ea',
              boxShadow: 'inset 4px 0 0 #69b993',
            }}
          />
          <span style={{position: 'relative'}}>
            Crucially, the effect disappeared when the contextual cue was
            removed, suggesting that the result depends on the selected
            evidence rather than the prompt alone.
          </span>
        </div>
        <div
          style={{
            marginTop: 38,
            fontSize: 23,
            lineHeight: 1.72,
            opacity: 0.4,
          }}
        >
          This distinction constrains the range of plausible alternative
          explanations and motivates a targeted follow-up analysis.
        </div>
      </div>
    </div>
  );
};

const ImageAsset: React.FC = () => {
  const frame = useCurrentFrame();
  const language = useLanguage();
  const enter = spring({
    frame: frame - 370,
    fps: FPS,
    config: {damping: 18, stiffness: 130},
  });
  const focusA = interpolate(frame, [402, 426], [0, 1], clamp);
  const focusB = interpolate(frame, [418, 442], [0, 1], clamp);
  const dots = [
    [92, 128, '#6b5ce7'],
    [154, 198, '#b9b2e9'],
    [224, 118, '#8e82e8'],
    [298, 238, '#e7a655'],
    [370, 150, '#73c8a2'],
    [450, 278, '#6b5ce7'],
    [116, 336, '#73c8a2'],
    [246, 372, '#d7d2e0'],
    [392, 392, '#e7a655'],
    [488, 94, '#b9b2e9'],
  ] as const;

  return (
    <div
      style={{
        position: 'absolute',
        left: 1210,
        top: 1830,
        width: 650,
        height: 720,
        overflow: 'hidden',
        boxSizing: 'border-box',
        border: '2px solid #d9d5e2',
        borderRadius: 24,
        background: '#fff',
        boxShadow: '0 34px 90px rgba(46,38,82,.16)',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 34}px) scale(${0.96 + enter * 0.04})`,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 68,
          padding: '0 24px',
          color: '#8b8596',
          background: '#f2f0f6',
          borderBottom: '1px solid #e6e2ea',
          fontFamily: '"PingFang SC", sans-serif',
          fontSize: 16,
          fontWeight: 720,
        }}
      >
        <span>🖼️ experiment-figure.png</span>
        <span>{language === 'en' ? '2 REGIONS' : '2 个区域'}</span>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 38,
          right: 38,
          top: 104,
          height: 520,
          overflow: 'hidden',
          borderRadius: 18,
          background:
            'linear-gradient(145deg, #f8f7fc 0%, #ece9f6 52%, #f6f3eb 100%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            opacity: 0.4,
            backgroundImage:
              'linear-gradient(rgba(85,76,117,.10) 1px, transparent 1px), linear-gradient(90deg, rgba(85,76,117,.10) 1px, transparent 1px)',
            backgroundSize: '42px 42px',
          }}
        />
        {dots.map(([x, y, color], index) => (
          <div
            key={`${x}-${y}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: index % 3 === 0 ? 24 : 17,
              height: index % 3 === 0 ? 24 : 17,
              borderRadius: 999,
              background: color,
              boxShadow: `0 0 0 8px ${color}20`,
            }}
          />
        ))}
        <div
          style={{
            position: 'absolute',
            left: 54,
            top: 84,
            width: 220,
            height: 180,
            border: '3px solid #6b5ce7',
            borderRadius: 16,
            opacity: focusA,
            transform: `scale(${0.94 + focusA * 0.06})`,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 10,
              bottom: -43,
              padding: '7px 11px',
              borderRadius: 999,
              color: '#5f51cf',
              background: '#eeeaff',
              fontFamily: '"PingFang SC", sans-serif',
              fontSize: 15,
              fontWeight: 680,
            }}
          >
            {language === 'en' ? 'Why does this cluster?' : '这里为什么聚集？'}
          </span>
        </div>
        <div
          style={{
            position: 'absolute',
            right: 45,
            bottom: 58,
            width: 190,
            height: 160,
            border: '3px solid #e7a655',
            borderRadius: 16,
            opacity: focusB,
            transform: `scale(${0.94 + focusB * 0.06})`,
          }}
        >
          <span
            style={{
              position: 'absolute',
              right: 8,
              top: -43,
              padding: '7px 11px',
              borderRadius: 999,
              color: '#9a5c0d',
              background: '#fff1dc',
              fontFamily: '"PingFang SC", sans-serif',
              fontSize: 15,
              fontWeight: 680,
              whiteSpace: 'nowrap',
            }}
          >
            {language === 'en' ? 'Is this region anomalous?' : '这是异常区域吗？'}
          </span>
        </div>
      </div>
    </div>
  );
};

const EvidenceChip: React.FC = () => {
  const frame = useCurrentFrame();
  const language = useLanguage();
  const enter = spring({
    frame: frame - 462,
    fps: FPS,
    config: {damping: 16, stiffness: 150},
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: 1310,
        top: 2650,
        width: 500,
        height: 250,
        boxSizing: 'border-box',
        overflow: 'hidden',
        border: '3px solid #69b993',
        borderRadius: 24,
        background: 'rgba(255,255,255,.98)',
        boxShadow: '0 26px 70px rgba(43,104,76,.16)',
        opacity: enter,
        transform: `translateX(${(1 - enter) * -42}px) scale(${0.94 + enter * 0.06})`,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: -11,
          left: '50%',
          width: 20,
          height: 20,
          borderRadius: 999,
          border: '4px solid #fff',
          background: '#69b993',
          boxShadow: '0 0 0 2px #69b993',
          transform: 'translateX(-50%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: -11,
          left: '50%',
          width: 20,
          height: 20,
          borderRadius: 999,
          border: '4px solid #fff',
          background: '#69b993',
          boxShadow: '0 0 0 2px #69b993',
          transform: 'translateX(-50%)',
        }}
      />
      <div
        style={{
          padding: '17px 21px',
          color: '#838d87',
          borderBottom: '1px solid #e5eee9',
          fontFamily: '"PingFang SC", sans-serif',
          fontSize: 15,
          fontWeight: 760,
          letterSpacing: '0.08em',
        }}
      >
        {language === 'en' ? 'PDF REGION · PAGE 12' : 'PDF 区域提问 · 第 12 页'}
      </div>
      <div style={{padding: '24px'}}>
        <div
          style={{
            color: '#282e2a',
            fontFamily: '"PingFang SC", sans-serif',
            fontSize: 29,
            lineHeight: 1.35,
            fontWeight: 760,
          }}
        >
          {language === 'en'
            ? 'The effect disappears when context cues are removed'
            : '移除情境线索后，效应消失'}
        </div>
        <div
          style={{
            display: 'inline-flex',
            marginTop: 17,
            padding: '8px 12px',
            borderRadius: 999,
            color: '#267453',
            background: '#e5f7ef',
            fontFamily: '"PingFang SC", sans-serif',
            fontSize: 16,
            fontWeight: 680,
          }}
        >
          {language === 'en' ? 'Question generated from source' : '由素材产生的问答'}
        </div>
      </div>
    </div>
  );
};

const TravelingDot: React.FC = () => {
  const frame = useCurrentFrame();
  const move = interpolate(frame, [200, 280], [0, 1], clamp);
  const x =
    move < 0.48
      ? segment(move, 0, 0.48, 1410, 1040)
      : segment(move, 0.48, 1, 1040, 1120);
  const y =
    move < 0.48
      ? segment(move, 0, 0.48, 710, 930)
      : segment(move, 0.48, 1, 930, 1390);
  const opacity = interpolate(
    frame,
    [196, 206, 272, 288],
    [0, 1, 1, 0],
    clamp,
  );
  return (
    <div
      style={{
        position: 'absolute',
        left: x - 14,
        top: y - 14,
        width: 28,
        height: 28,
        borderRadius: 999,
        background: '#6b5ce7',
        boxShadow: '0 0 0 11px rgba(107,92,231,.14), 0 0 28px rgba(107,92,231,.55)',
        opacity,
      }}
    />
  );
};

const Caption: React.FC = () => {
  const frame = useCurrentFrame();
  const language = useLanguage();
  type CaptionSpec = {
    start: number;
    end: number;
    icon: string;
    before: string;
    highlight: string;
    position: React.CSSProperties;
    fontSize?: number;
  };
  const zhCaptions: CaptionSpec[] = [
    {
      start: 0,
      end: 112,
      icon: '💬',
      before: '对话一直',
      highlight: '往下走',
      position: {left: 62, bottom: 270, width: 650},
    },
    {
      start: 120,
      end: 205,
      icon: '↗',
      before: '思路却常常',
      highlight: '在中途岔开',
      position: {left: 62, top: 510, width: 760},
    },
    {
      start: 220,
      end: 278,
      icon: '🌱',
      before: '一个问题，',
      highlight: '长出不同方向',
      position: {right: 62, bottom: 480, width: 760},
    },
    {
      start: 282,
      end: 358,
      icon: '✨',
      before: '和 AI 的对话，也应该',
      highlight: '像思维导图一样展开',
      position: {left: 62, top: 250, width: 900},
    },
    {
      start: 360,
      end: 450,
      icon: '📎',
      before: 'PDF、图片，',
      highlight: '也能成为思考的起点',
      position: {left: 62, bottom: 340, width: 830},
    },
    {
      start: 464,
      end: 535,
      icon: '🔎',
      before: '在不同区域提问，',
      highlight: '长出新的对话',
      position: {right: 62, bottom: 455, width: 880},
    },
    {
      start: 548,
      end: 620,
      icon: '✂️',
      before: '走偏的思路可以留下，',
      highlight: '但不必进入上下文',
      position: {right: 50, top: 400, width: 600},
      fontSize: 54,
    },
    {
      start: 632,
      end: 735,
      icon: '✨',
      before: '让真正有关的内容，',
      highlight: '重新汇合',
      position: {left: 62, bottom: 460, width: 880},
    },
  ];
  const enCaptions: CaptionSpec[] = [
    {
      start: 0,
      end: 112,
      icon: '💬',
      before: 'Chats keep',
      highlight: 'scrolling down',
      position: {left: 62, bottom: 270, width: 760},
      fontSize: 57,
    },
    {
      start: 120,
      end: 205,
      icon: '↗',
      before: 'But ideas',
      highlight: 'branch along the way',
      position: {left: 62, top: 510, width: 860},
      fontSize: 55,
    },
    {
      start: 220,
      end: 278,
      icon: '🌱',
      before: 'One question.',
      highlight: 'Many directions.',
      position: {right: 62, bottom: 480, width: 820},
      fontSize: 56,
    },
    {
      start: 282,
      end: 358,
      icon: '✨',
      before: 'Conversations with AI should',
      highlight: 'unfold like a mind map',
      position: {left: 62, top: 250, width: 940},
      fontSize: 52,
    },
    {
      start: 360,
      end: 450,
      icon: '📎',
      before: 'PDFs and images can',
      highlight: 'become starting points',
      position: {left: 62, bottom: 340, width: 900},
      fontSize: 54,
    },
    {
      start: 464,
      end: 535,
      icon: '🔎',
      before: 'Ask from any region.',
      highlight: 'Grow a new conversation.',
      position: {right: 62, bottom: 455, width: 940},
      fontSize: 52,
    },
    {
      start: 548,
      end: 620,
      icon: '✂️',
      before: 'Keep the detour.',
      highlight: 'Leave it out of context.',
      position: {right: 50, top: 400, width: 720},
      fontSize: 52,
    },
    {
      start: 632,
      end: 735,
      icon: '✨',
      before: 'Bring the relevant parts',
      highlight: 'back together',
      position: {left: 62, bottom: 460, width: 920},
      fontSize: 54,
    },
  ];
  const captions = language === 'en' ? enCaptions : zhCaptions;
  return (
    <>
      {captions.map((caption) => {
        const opacity = interpolate(
          frame,
          [caption.start, caption.start + 16, caption.end - 18, caption.end],
          [0, 1, 1, 0],
          clamp,
        );
        const y = interpolate(
          frame,
          [caption.start, caption.start + 18],
          [20, 0],
          clamp,
        );
        return (
          <div
            key={caption.highlight}
            style={{
              position: 'absolute',
              zIndex: 40,
              ...caption.position,
              boxSizing: 'border-box',
              padding: '12px 10px 14px 94px',
              overflow: 'hidden',
              color: '#292631',
              fontFamily: '"PingFang SC", "Noto Sans CJK SC", sans-serif',
              fontSize: caption.fontSize ?? 59,
              lineHeight: 1.12,
              fontWeight: 820,
              letterSpacing: '-0.055em',
              textShadow:
                '0 2px 18px rgba(255,255,255,.98), 0 2px 42px rgba(255,255,255,.9)',
              opacity,
              transform: `translateY(${y}px)`,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 13,
                bottom: 15,
                width: 6,
                borderRadius: 999,
                background: '#6b5ce7',
                boxShadow: '0 0 20px rgba(107,92,231,.34)',
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 20,
                top: 12,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 56,
                height: 56,
                borderRadius: 18,
                color: '#5f51cf',
                background: 'rgba(238,234,255,.94)',
                boxShadow: '0 12px 34px rgba(74,61,145,.12)',
                fontSize: 30,
                fontWeight: 850,
              }}
            >
              {caption.icon}
            </div>
            <span>{caption.before}</span>{' '}
            <span
              style={{
                display: 'inline-block',
                color: '#6b5ce7',
                whiteSpace: 'nowrap',
              }}
            >
              {caption.highlight}
            </span>
          </div>
        );
      })}
    </>
  );
};

const ClimaxPulse: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = interpolate(
    frame,
    [700, 735, 792, 812],
    [0, 1, 1, 0],
    clamp,
  );
  return (
    <div
      style={{
        position: 'absolute',
        left: 1180,
        top: 3060,
        width: 640,
        height: 640,
        borderRadius: 999,
        opacity: pulse,
        transform: `scale(${0.7 + pulse * 0.55})`,
        background:
          'radial-gradient(circle, rgba(105,185,147,.30) 0%, rgba(107,92,231,.14) 34%, transparent 70%)',
        boxShadow:
          '0 0 0 2px rgba(105,185,147,.12), 0 0 120px rgba(107,92,231,.20)',
        pointerEvents: 'none',
      }}
    />
  );
};

const EntryShock: React.FC = () => {
  const frame = useCurrentFrame();
  const ring = spring({
    frame,
    fps: FPS,
    config: {damping: 16, stiffness: 135},
  });
  const opacity = interpolate(frame, [0, 4, 14, 22], [0.7, 0.38, 0.1, 0], clamp);
  return (
    <AbsoluteFill
      style={{
        zIndex: 70,
        alignItems: 'center',
        justifyContent: 'center',
        pointerEvents: 'none',
        opacity,
      }}
    >
      <div
        style={{
          width: 820,
          height: 820,
          borderRadius: 999,
          border: '2px solid rgba(107,92,231,.26)',
          transform: `scale(${0.18 + ring * 1.5})`,
          boxShadow:
            '0 0 80px rgba(107,92,231,.14), inset 0 0 80px rgba(107,92,231,.08)',
        }}
      />
    </AbsoluteFill>
  );
};

const Finale: React.FC = () => {
  const frame = useCurrentFrame();
  const language = useLanguage();
  const fade = interpolate(frame, [805, 825], [0, 1], clamp);
  const reveal = spring({
    frame: frame - 825,
    fps: FPS,
    config: {damping: 20, stiffness: 95},
  });
  const searchReveal = spring({
    frame: frame - 846,
    fps: FPS,
    config: {damping: 18, stiffness: 125},
  });
  return (
    <AbsoluteFill
      style={{
        zIndex: 100,
        alignItems: 'center',
        justifyContent: 'center',
        background: '#fbfbfd',
        opacity: fade,
        fontFamily: '"PingFang SC", "Noto Sans CJK SC", sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          transform: `translateY(${(1 - reveal) * 24}px)`,
          opacity: reveal,
        }}
      >
        <Img
          src={staticFile('logo.svg')}
          style={{
            width: 184,
            height: 184,
          }}
        />
        <div
          style={{
            marginTop: 38,
            color: '#201e25',
            fontSize: 78,
            lineHeight: 1,
            fontWeight: 790,
            letterSpacing: '-0.05em',
          }}
        >
          ThoughtDAG
        </div>
        <div
          style={{
            marginTop: 30,
            color: '#8b8792',
            fontSize: 34,
            fontWeight: 520,
            letterSpacing: '0.04em',
          }}
        >
          {language === 'en'
            ? 'Let conversations follow the shape of thought'
            : '让对话，沿着思考展开'}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 15,
            marginTop: 42,
            padding: '17px 27px',
            border: '2px solid #e4e1e8',
            borderRadius: 999,
            color: '#514d58',
            background: '#fff',
            boxShadow: '0 12px 38px rgba(37,31,52,.07)',
            fontSize: 27,
            fontWeight: 610,
            letterSpacing: '-0.01em',
            opacity: searchReveal,
            transform: `translateY(${(1 - searchReveal) * 14}px)`,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 34,
              height: 34,
              borderRadius: 999,
              color: '#fff',
              background: '#24212a',
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                cx="10.5"
                cy="10.5"
                r="5.2"
                stroke="white"
                strokeWidth="2.2"
              />
              <path
                d="M14.5 14.5L19 19"
                stroke="white"
                strokeWidth="2.2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          {language === 'en' ? 'Search GitHub for' : 'GitHub 搜索'}
          <span style={{color: '#6b5ce7', fontWeight: 780}}>ThoughtDAG</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const IntroHook: React.FC = () => {
  const frame = useCurrentFrame();
  const language = useLanguage();
  const firstLine = spring({
    frame: frame - 6,
    fps: FPS,
    config: {damping: 17, stiffness: 170},
  });
  const secondLine = spring({
    frame: frame - 16,
    fps: FPS,
    config: {damping: 15, stiffness: 190},
  });
  const exit = interpolate(frame, [42, 54], [0, 1], clamp);
  const glow = interpolate(frame, [0, 10, 38, 54], [0, 1, 0.7, 0], clamp);

  return (
    <AbsoluteFill
      style={{
        zIndex: 200,
        overflow: 'hidden',
        color: '#fff',
        fontFamily: '"PingFang SC", "Noto Sans CJK SC", sans-serif',
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
          background: '#08080b',
          transform: `translateX(${-exit * 108}%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          width: '50.5%',
          height: '100%',
          background: '#08080b',
          transform: `translateX(${exit * 108}%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 126,
          right: 126,
          top: '50%',
          transform: `translateY(-50%) scale(${1 + exit * 0.08})`,
          opacity: 1 - exit,
          textAlign: 'center',
          fontSize: 70,
          lineHeight: 1.22,
          fontWeight: 790,
          letterSpacing: '-0.055em',
        }}
      >
        <div
          style={{
            opacity: firstLine,
            transform: `translateY(${(1 - firstLine) * 24}px)`,
          }}
        >
          {language === 'en' ? 'The longer I talk with AI' : '和 AI 聊得越久'}
        </div>
        <div
          style={{
            marginTop: 18,
            opacity: secondLine,
            transform: `translateY(${(1 - secondLine) * 28}px)`,
          }}
        >
          {language === 'en' ? 'why does thinking get ' : '思路怎么反而'}
          <span style={{color: '#8e7cff'}}>
            {language === 'en' ? 'messier?' : '越乱？'}
          </span>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: 'calc(50% + 168px)',
          width: 8,
          height: 8,
          marginLeft: -4,
          borderRadius: 999,
          background: '#8e7cff',
          opacity: glow * (1 - exit),
          transform: `scale(${1 + glow * 0.6})`,
          boxShadow: '0 0 34px rgba(142,124,255,.72)',
        }}
      />
    </AbsoluteFill>
  );
};

const ScrollStory: React.FC = () => {
  const frame = useCurrentFrame();
  const language = useLanguage();
  const camera = cameraAt(frame);
  const progress = interpolate(frame, [0, STORY_DURATION], [0, 1], clamp);
  const speedBlur =
    interpolate(frame, [102, 108, 120, 129], [0, 3, 3, 0], clamp) +
    interpolate(frame, [197, 203, 212, 220], [0, 4, 4, 0], clamp) +
    interpolate(frame, [282, 288, 296, 303], [0, 4.5, 4.5, 0], clamp) +
    interpolate(frame, [339, 345, 354, 361], [0, 5, 5, 0], clamp) +
    interpolate(frame, [447, 452, 460, 467], [0, 5.8, 5.8, 0], clamp) +
    interpolate(frame, [532, 537, 544, 551], [0, 6.5, 6.5, 0], clamp) +
    interpolate(frame, [617, 622, 629, 635], [0, 7.3, 7.3, 0], clamp) +
    interpolate(frame, [732, 737, 744, 750], [0, 8.2, 8.2, 0], clamp);
  const cameraTilt =
    interpolate(frame, [102, 114, 129], [0, -0.3, 0], clamp) +
    interpolate(frame, [197, 208, 220], [0, 0.4, 0], clamp) +
    interpolate(frame, [339, 351, 361], [0, -0.55, 0], clamp) +
    interpolate(frame, [447, 458, 467], [0, 0.65, 0], clamp) +
    interpolate(frame, [532, 542, 551], [0, -0.72, 0], clamp) +
    interpolate(frame, [617, 626, 635], [0, 0.78, 0], clamp) +
    interpolate(frame, [732, 741, 750], [0, -0.9, 0], clamp);
  const worldOpacity = interpolate(frame, [802, 826], [1, 0], clamp);
  const energy = interpolate(frame, [0, 790], [0, 1], clamp);
  const entry = spring({
    frame,
    fps: FPS,
    config: {damping: 14, stiffness: 150},
  });
  const entryScale = interpolate(entry, [0, 1], [1.1, 1], clamp);
  const entryBlur = interpolate(frame, [0, 10, 22], [12, 3, 0], clamp);
  const entryOpacity = interpolate(frame, [0, 5, 16], [0, 0.84, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        background: '#f8f6fb',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.46,
          backgroundImage:
            'radial-gradient(circle, rgba(82,73,118,.20) 1px, transparent 1px)',
          backgroundSize: '24px 24px',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: W / 2,
          top: H / 2,
          width: 2600,
          height: 3900,
          transformOrigin: '0 0',
          transform: `scale(${camera.z * entryScale}) translate(${-camera.x}px, ${-camera.y}px) rotate(${cameraTilt}deg)`,
          filter: `blur(${speedBlur + entryBlur}px) saturate(${1 + energy * 0.16})`,
          opacity: worldOpacity * entryOpacity,
          willChange: 'transform',
        }}
      >
        <ClimaxPulse />
        <ChatCard />
        <svg
          width="2600"
          height="3900"
          style={{position: 'absolute', inset: 0, overflow: 'visible'}}
        >
          <Edge
            d="M950 820 C1080 820 1080 585 1180 585"
            start={108}
            color="#8f82eb"
          />
          <Edge
            d="M1410 710 C1410 825 1100 810 1040 930"
            start={196}
            duration={34}
          />
          <Edge
            d="M1410 710 C1410 825 1620 810 1680 930"
            start={203}
            duration={32}
          />
          <Edge
            d="M1040 1180 C1040 1300 1120 1300 1120 1390"
            start={239}
            color="#69b993"
            duration={28}
          />
          <Edge
            d="M1680 1180 C1680 1300 1580 1300 1580 1390"
            start={248}
            color="#d99b50"
            duration={26}
          />
          <PrunableEdge />
          <Edge
            d="M1120 1640 C1120 2050 1960 2260 1560 2650"
            start={492}
            color="#69b993"
            duration={24}
          />
          <Edge
            d="M1580 1640 C1580 2050 270 2260 900 2650"
            start={505}
            color="#d99b50"
            duration={22}
          />
          <Edge
            d="M900 2900 C900 3110 1370 3120 1500 3300"
            start={638}
            color="#69b993"
            duration={18}
          />
          <Edge
            d="M1560 2900 C1560 3120 1540 3160 1500 3300"
            start={650}
            color="#69b993"
            duration={15}
          />
        </svg>

        <ThoughtNode
          x={1180}
          y={460}
          width={460}
          eyebrow={language === 'en' ? 'Starting question' : '最初的问题'}
          title={
            language === 'en'
              ? 'What does this paper actually show?'
              : '这篇论文真正说明了什么？'
          }
          note={language === 'en' ? 'Branch from here' : '从这里展开'}
          start={120}
          ports={['left', 'bottom']}
        />
        <ThoughtNode
          x={820}
          y={930}
          width={440}
          eyebrow={language === 'en' ? 'Direction 01' : '方向 01'}
          title={language === 'en' ? 'What evidence supports the claim?' : '结论有哪些证据？'}
          note={language === 'en' ? 'Follow the evidence' : '沿证据继续'}
          color="green"
          start={210}
          ports={['top', 'bottom']}
        />
        <ThoughtNode
          x={1460}
          y={930}
          width={440}
          eyebrow={language === 'en' ? 'Direction 02' : '方向 02'}
          title={language === 'en' ? 'Could there be another explanation?' : '有没有另一种解释？'}
          note={language === 'en' ? 'Keep the alternative' : '保留分歧'}
          color="orange"
          start={218}
          ports={['top', 'bottom']}
        />
        <ThoughtNode
          x={900}
          y={1390}
          width={440}
          eyebrow={language === 'en' ? 'New question' : '新的问题'}
          title={language === 'en' ? 'Is this evidence reliable?' : '这个证据可靠吗？'}
          note={language === 'en' ? 'Continue downward' : '继续向下'}
          color="green"
          start={255}
          ports={['top']}
        />
        <ThoughtNode
          x={1360}
          y={1390}
          width={440}
          eyebrow={language === 'en' ? 'Another route' : '另一条路'}
          title={
            language === 'en'
              ? 'Do the limitations change the conclusion?'
              : '方法限制改变结论吗？'
          }
          note={language === 'en' ? 'A separate branch' : '另一条分支'}
          color="orange"
          start={265}
          ports={['top']}
        />
        <PdfPage />
        <ImageAsset />
        <EvidenceChip />
        <ThoughtNode
          x={650}
          y={2650}
          width={500}
          eyebrow={language === 'en' ? 'Image region question' : '图片区域提问'}
          title={
            language === 'en'
              ? 'What does this clustered region mean?'
              : '这个聚集区域意味着什么？'
          }
          note={language === 'en' ? 'Question from source' : '由素材产生的问答'}
          color="orange"
          start={478}
          ports={['top', 'bottom']}
        />
        <ThoughtNode
          x={1980}
          y={1400}
          width={440}
          eyebrow={language === 'en' ? 'Excluded' : '已经排除'}
          title={
            language === 'en'
              ? 'This hypothesis stays out of context'
              : '这个假设不再进入上下文'
          }
          note={language === 'en' ? 'Still on the canvas' : '仍然留在画布'}
          color="orange"
          start={270}
          dimAt={580}
          ports={['top']}
        />
        <CutSpark />
        <ThoughtNode
          x={1250}
          y={3300}
          width={500}
          eyebrow={language === 'en' ? 'Refined again' : '重新提纯'}
          title={
            language === 'en'
              ? 'What actually needs answering next?'
              : '下一步，真正需要回答什么？'
          }
          note={language === 'en' ? 'Only relevant context' : '只带上有关的内容'}
          color="green"
          start={662}
          ports={['top']}
        />
        <TravelingDot />
      </div>

      <div style={{opacity: worldOpacity * entryOpacity}}>
        <Brand />
        <Caption />
      </div>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 116,
          width: `${progress * 100}%`,
          height: 4,
          borderRadius: 999,
          background: '#6b5ce7',
          zIndex: 50,
          opacity: worldOpacity,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          boxShadow: 'inset 0 -220px 150px rgba(248,246,251,.92)',
        }}
      />
      <EntryShock />
      <Finale />
    </AbsoluteFill>
  );
};

const ScrollAnimatic: React.FC<{language: Language}> = ({language}) => (
  <LanguageContext.Provider value={language}>
    <AbsoluteFill style={{background: '#08080b'}}>
      <Sequence from={INTRO_DURATION} durationInFrames={STORY_DURATION}>
        <ScrollStory />
      </Sequence>
      <IntroHook />
    </AbsoluteFill>
  </LanguageContext.Provider>
);

export const ScrollAnimaticZh: React.FC = () => <ScrollAnimatic language="zh" />;
export const ScrollAnimaticEn: React.FC = () => <ScrollAnimatic language="en" />;
