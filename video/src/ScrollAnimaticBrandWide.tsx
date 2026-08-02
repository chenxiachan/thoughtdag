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
} from 'remotion';

const FPS = 30;
const W = 1920;
const H = 1080;
const INTRO_DURATION = 54;
const NARRATED_INTRO_DURATION = 84;
const STORY_DURATION = 900;
const DURATION = INTRO_DURATION + STORY_DURATION;
const NARRATED_DURATION = NARRATED_INTRO_DURATION + STORY_DURATION;
const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

type Language = 'zh' | 'en';
type Tone = 'purple' | 'green' | 'orange';

export const SCROLL_ANIMATIC_BRAND_WIDE_DURATION = DURATION;
export const SCROLL_ANIMATIC_BRAND_WIDE_NARRATED_DURATION = NARRATED_DURATION;
// eslint-disable-next-line react-refresh/only-export-components -- composition metadata for Root
export const SCROLL_ANIMATIC_BRAND_WIDE_SIZE = {width: W, height: H, fps: FPS};

const colors = {
  ink: '#1d1a24',
  muted: '#716c7a',
  purple: '#6b5ce7',
  purpleSoft: '#eeeafd',
  green: '#35a575',
  greenSoft: '#e5f5ed',
  orange: '#de8b22',
  orangeSoft: '#fff1df',
  paper: '#faf9fc',
};

const copy = {
  zh: {
    hook: ['和 AI 聊得越久', '思路怎么反而越乱？'],
    captions: [
      ['💬', '对话一直', '往下走'],
      ['↗', '思路却常常', '在中途岔开'],
      ['✨', '和 AI 的对话，也应该', '像思维导图一样展开'],
      ['📎', '从原文直接追问', '也把重要的摘到画布'],
      ['🌱', '一个问题', '长出不同方向'],
      ['✂️', '走偏的思路可以留下', '但不必进入上下文'],
      ['✨', '让真正有关的内容', '重新汇合'],
      ['●', '连线决定', 'AI 下一次看见什么'],
    ],
    chatTitle: '一段不断变长的对话',
    messages: [
      '我想把这个问题真正想清楚。',
      '可以先从核心假设开始。',
      '它有哪些证据？',
      '有没有另一种解释？',
      '这张图又说明了什么？',
    ],
    root: ['最初的问题', '我真正想弄清楚什么？', '从这里展开'],
    evidence: ['方向 01', '哪些证据支持这个结论？', '继续追问'],
    alternative: ['方向 02', '有没有另一种解释？', '保留分歧'],
    deeper: ['新的问题', '这个证据可靠吗？', '沿证据继续'],
    detour: ['走偏的思路', '一个有趣，但无关的想法', '仍留在画布'],
    pdf: ['论文.pdf · 第 12 页', '高亮段落', '结果取决于上下文线索。'],
    image: ['图片素材', '选中区域', '从局部继续提问'],
    pdfQuestion: ['从原文追问', '这个证据意味着什么？', '论文.pdf · p.12'],
    imageQuestion: ['摘出的图像', '图中出现两个明显区域', '论文.pdf · p.12'],
    merge: ['重新汇合', '下一步真正需要回答什么？', '只带上有关的内容'],
    excluded: '保留，但不进入上下文',
    finaleLine: '让对话，沿着思考展开',
    search: 'GitHub 搜索',
  },
  en: {
    hook: ['THE LONGER I TALK WITH AI', 'WHY DOES THINKING GET MESSIER?'],
    captions: [
      ['💬', 'Chats keep', 'scrolling down'],
      ['↗', 'But ideas', 'branch along the way'],
      ['✨', 'Conversations with AI should', 'unfold like a mind map'],
      ['📎', 'Ask from the source.', 'Clip what matters.'],
      ['🌱', 'One question', 'grows in many directions'],
      ['✂️', 'Keep the detour', 'leave it out of context'],
      ['✨', 'Bring the relevant parts', 'back together'],
      ['●', 'The wires decide', 'what AI sees next'],
    ],
    chatTitle: 'One conversation keeps growing',
    messages: [
      'I want to really understand this.',
      'Start with the central hypothesis.',
      'What evidence supports it?',
      'Could there be another explanation?',
      'What does this figure show?',
    ],
    root: ['Starting question', 'What am I actually trying to understand?', 'branch from here'],
    evidence: ['Direction 01', 'What evidence supports the claim?', 'keep exploring'],
    alternative: ['Direction 02', 'Could there be another explanation?', 'keep the alternative'],
    deeper: ['New question', 'Is this evidence reliable?', 'follow the evidence'],
    detour: ['Useful detour', 'An interesting but unrelated thought', 'still on the canvas'],
    pdf: ['paper.pdf · page 12', 'Highlighted passage', 'The result depends on contextual cues.'],
    image: ['Image material', 'Selected region', 'Ask from a detail'],
    pdfQuestion: ['Asked from source', 'What does this evidence mean?', 'paper.pdf · p.12'],
    imageQuestion: ['Clipped figure', 'Two distinct regions emerge', 'paper.pdf · p.12'],
    merge: ['Refined again', 'What actually needs answering next?', 'only relevant context'],
    excluded: 'kept, but left out of context',
    finaleLine: 'Let conversations follow the shape of thought',
    search: 'Search GitHub for',
  },
} as const;

const smooth = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
};

const punch = (value: number) => {
  const t = Math.max(0, Math.min(1, value));
  return 1 - Math.pow(1 - t, 4);
};

const move = (frame: number, start: number, end: number, from: number, to: number, fast = false) =>
  from + (to - from) * (fast ? punch((frame - start) / (end - start)) : smooth((frame - start) / (end - start)));

const cameraAt = (frame: number) => {
  if (frame < 90) return {x: 520, y: 650, z: move(frame, 0, 90, 1.08, 1.0)};
  if (frame < 108) {
    return {
      x: move(frame, 90, 108, 520, 1260, true),
      y: move(frame, 90, 108, 650, 650, true),
      z: move(frame, 90, 108, 1, 0.92, true),
    };
  }
  if (frame < 195) return {x: 1280, y: move(frame, 108, 195, 650, 820), z: 0.92};
  if (frame < 214) {
    return {
      x: move(frame, 195, 214, 1280, 1450, true),
      y: move(frame, 195, 214, 820, 850, true),
      z: move(frame, 195, 214, 0.92, 0.59, true),
    };
  }
  if (frame < 300) return {x: 1450, y: 850, z: move(frame, 214, 300, 0.59, 0.62)};
  if (frame < 320) {
    return {
      x: move(frame, 300, 320, 1450, 2330, true),
      y: move(frame, 300, 320, 850, 790, true),
      z: move(frame, 300, 320, 0.62, 0.8, true),
    };
  }
  if (frame < 420) return {x: 2330, y: move(frame, 320, 420, 790, 820), z: 0.8};
  if (frame < 440) {
    return {
      x: move(frame, 420, 440, 2330, 1320, true),
      y: move(frame, 420, 440, 820, 920, true),
      z: move(frame, 420, 440, 0.8, 0.7, true),
    };
  }
  if (frame < 535) return {x: 1320, y: move(frame, 440, 535, 920, 960), z: 0.7};
  if (frame < 552) {
    return {
      x: move(frame, 535, 552, 1320, 1700, true),
      y: move(frame, 535, 552, 960, 1170, true),
      z: move(frame, 535, 552, 0.7, 0.96, true),
    };
  }
  if (frame < 645) return {x: 1700, y: 1170, z: move(frame, 552, 645, 0.96, 1.01)};
  if (frame < 664) {
    return {
      x: move(frame, 645, 664, 1700, 2750, true),
      y: move(frame, 645, 664, 1170, 900, true),
      z: move(frame, 645, 664, 1.01, 0.67, true),
    };
  }
  if (frame < 754) return {x: 2750, y: 900, z: move(frame, 664, 754, 0.67, 0.71)};
  if (frame < 772) {
    return {
      x: move(frame, 754, 772, 2750, 1830, true),
      y: move(frame, 754, 772, 900, 880, true),
      z: move(frame, 754, 772, 0.71, 0.48, true),
    };
  }
  return {x: 1830, y: 880, z: move(frame, 772, 830, 0.48, 0.5)};
};

const reveal = (frame: number, start: number, duration = 16) =>
  interpolate(frame, [start, start + duration], [0, 1], clamp);

const windowOpacity = (frame: number, start: number, end: number, fade = 12) =>
  interpolate(frame, [start, start + fade, end - fade, end], [0, 1, 1, 0], clamp);

const toneStyles: Record<Tone, {main: string; soft: string; border: string}> = {
  purple: {main: colors.purple, soft: colors.purpleSoft, border: '#bdb4f2'},
  green: {main: colors.green, soft: colors.greenSoft, border: '#9cd6bd'},
  orange: {main: colors.orange, soft: colors.orangeSoft, border: '#efbf79'},
};

const ThoughtNode: React.FC<{
  frame: number;
  start: number;
  x: number;
  y: number;
  width?: number;
  tone?: Tone;
  copy: readonly [string, string, string];
  dim?: number;
}> = ({frame, start, x, y, width = 410, tone = 'purple', copy: nodeCopy, dim = 0}) => {
  const shown = spring({
    fps: FPS,
    frame: frame - start,
    config: {damping: 17, stiffness: 145, mass: 0.82},
  });
  const style = toneStyles[tone];
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width,
        height: 180,
        boxSizing: 'border-box',
        overflow: 'hidden',
        border: `2px solid ${style.border}`,
        borderRadius: 24,
        background: '#fff',
        boxShadow: '0 22px 62px rgba(54,45,95,.14), 0 4px 14px rgba(54,45,95,.08)',
        opacity: shown * (1 - dim * 0.7),
        transform: `translateY(${(1 - shown) * 30}px) scale(${0.94 + shown * 0.06})`,
        zIndex: 8,
      }}
    >
      <div
        style={{
          display: 'flex',
          height: 42,
          padding: '0 18px',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: style.main,
          background: style.soft,
          fontSize: 13,
          fontWeight: 820,
          letterSpacing: '.07em',
          textTransform: 'uppercase',
        }}
      >
        <span>{nodeCopy[0]}</span>
        <span>↗</span>
      </div>
      <div style={{padding: '18px 20px 19px'}}>
        <div
          style={{
            color: colors.ink,
            fontSize: 24,
            lineHeight: 1.16,
            fontWeight: 780,
            letterSpacing: '-.02em',
          }}
        >
          {nodeCopy[1]}
        </div>
        <div
          style={{
            display: 'inline-flex',
            marginTop: 13,
            padding: '6px 10px',
            borderRadius: 999,
            color: style.main,
            background: style.soft,
            fontSize: 13,
            fontWeight: 760,
          }}
        >
          {nodeCopy[2]}
        </div>
      </div>
      {[
        {left: -7, top: '50%', transform: 'translateY(-50%)'},
        {right: -7, top: '50%', transform: 'translateY(-50%)'},
        {left: '50%', top: -7, transform: 'translateX(-50%)'},
        {left: '50%', bottom: -7, transform: 'translateX(-50%)'},
      ].map((port, index) => (
        <div
          key={index}
          style={{
            position: 'absolute',
            width: 14,
            height: 14,
            borderRadius: 7,
            background: '#fff',
            border: `3px solid ${style.main}`,
            ...port,
          }}
        />
      ))}
    </div>
  );
};

const Edge: React.FC<{
  frame: number;
  start: number;
  d: string;
  tone?: Tone;
  end?: number;
  dashed?: boolean;
}> = ({frame, start, d, tone = 'purple', end, dashed = false}) => {
  const draw = reveal(frame, start, 22);
  const fade = end ? 1 - reveal(frame, end, 9) : 1;
  return (
    <path
      d={d}
      pathLength={1}
      fill="none"
      stroke={toneStyles[tone].main}
      strokeWidth={6}
      strokeLinecap="round"
      strokeDasharray={dashed ? '0.035 0.025' : 1}
      strokeDashoffset={dashed ? 0 : 1 - draw}
      opacity={draw * fade}
      style={{filter: `drop-shadow(0 4px 7px ${toneStyles[tone].main}33)`}}
    />
  );
};

const ChatPanel: React.FC<{frame: number; language: Language}> = ({frame, language}) => {
  const text = copy[language];
  return (
    <div
      style={{
        position: 'absolute',
        left: 210,
        top: 330,
        width: 600,
        height: 650,
        overflow: 'hidden',
        border: '1px solid #ded9e8',
        borderRadius: 28,
        background: 'rgba(255,255,255,.94)',
        boxShadow: '0 28px 76px rgba(54,45,95,.15)',
        zIndex: 7,
      }}
    >
      <div
        style={{
          height: 58,
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: '#77717f',
          background: '#f0eef4',
          fontSize: 14,
          fontWeight: 800,
        }}
      >
        <span>{text.chatTitle}</span>
        <span style={{color: colors.purple}}>•••</span>
      </div>
      <div style={{padding: '25px 28px'}}>
        {text.messages.map((message, index) => {
          const shown = reveal(frame, 8 + index * 15, 10);
          const user = index % 2 === 0;
          return (
            <div
              key={message}
              style={{
                width: index === 4 ? 390 : 430,
                marginTop: index === 0 ? 0 : 18,
                marginLeft: user ? 100 : 0,
                padding: '16px 18px',
                borderRadius: user ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                color: user ? '#fff' : colors.ink,
                background: user ? colors.purple : '#f1eff5',
                fontSize: 19,
                lineHeight: 1.35,
                fontWeight: 650,
                opacity: shown,
                transform: `translateY(${(1 - shown) * 18}px)`,
              }}
            >
              {message}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SourceMaterials: React.FC<{frame: number; language: Language}> = ({frame, language}) => {
  const text = copy[language];
  const shown = reveal(frame, 300, 16);
  const selected = reveal(frame, 330, 15);
  const passageFlight = reveal(frame, 336, 8) * (1 - reveal(frame, 354, 8));
  const figureFlight = reveal(frame, 352, 8) * (1 - reveal(frame, 370, 8));
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 1940,
          top: 260,
          width: 530,
          height: 555,
          overflow: 'hidden',
          border: '1px solid #ded9e8',
          borderRadius: 24,
          background: '#fff',
          boxShadow: '0 24px 70px rgba(54,45,95,.14)',
          opacity: shown,
          transform: `translateY(${(1 - shown) * 24}px)`,
          zIndex: 7,
        }}
      >
        <div
          style={{
            height: 48,
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#77717f',
            background: '#f0eef4',
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          <span>{text.pdf[0]}</span>
          <span>PDF</span>
        </div>
        <div style={{padding: '28px 34px', color: '#3a3640'}}>
          <div style={{fontFamily: 'Georgia, serif', fontSize: 28, fontWeight: 700}}>
            {text.pdf[1]}
          </div>
          <div style={{marginTop: 24, fontFamily: 'Georgia, serif', fontSize: 17, lineHeight: 1.72}}>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor
            incididunt ut labore et dolore magna aliqua.
          </div>
          <div
            style={{
              marginTop: 20,
              padding: '14px 16px',
              borderRadius: 10,
              color: '#27694e',
              background: colors.greenSoft,
              fontFamily: 'Georgia, serif',
              fontSize: 19,
              lineHeight: 1.45,
              opacity: selected,
              boxShadow: `0 0 0 ${selected * 8}px rgba(53,165,117,.08)`,
            }}
          >
            {text.pdf[2]}
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: 2190,
          top: 930,
          width: 530,
          height: 370,
          overflow: 'hidden',
          border: '1px solid #ded9e8',
          borderRadius: 24,
          background: '#fff',
          boxShadow: '0 24px 70px rgba(54,45,95,.14)',
          opacity: reveal(frame, 318, 16),
          zIndex: 7,
        }}
      >
        <div
          style={{
            height: 48,
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: '#77717f',
            background: '#f0eef4',
            fontSize: 13,
            fontWeight: 800,
          }}
        >
          <span>{text.image[0]}</span>
          <span>{text.image[1]}</span>
        </div>
        <div style={{position: 'relative', height: 322, background: '#f7f5fa'}}>
          {[
            [80, 70, colors.purple],
            [190, 92, colors.green],
            [315, 68, colors.orange],
            [140, 205, '#9c90ea'],
            [330, 218, '#67bd96'],
          ].map(([x, y, color], index) => (
            <div
              key={index}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width: 20,
                height: 20,
                borderRadius: 10,
                background: color,
                boxShadow: `0 0 0 8px ${color}22`,
              }}
            />
          ))}
          <div
            style={{
              position: 'absolute',
              left: 55,
              top: 45,
              width: 205,
              height: 105,
              border: `4px solid ${colors.purple}`,
              borderRadius: 14,
              opacity: selected,
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: 42,
              bottom: 36,
              padding: '9px 12px',
              borderRadius: 999,
              color: colors.orange,
              background: colors.orangeSoft,
              fontSize: 14,
              fontWeight: 780,
            }}
          >
            {text.image[2]}
          </div>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: move(frame, 336, 354, 2132, 2765, true),
          top: move(frame, 336, 354, 535, 558, true),
          width: 270,
          height: 72,
          border: `3px solid ${colors.green}`,
          borderRadius: 12,
          background: colors.greenSoft,
          boxShadow: '0 18px 50px rgba(53,165,117,.22)',
          opacity: passageFlight,
          transform: `scale(${move(frame, 336, 354, 1, 0.42, true)})`,
          transformOrigin: 'center',
          zIndex: 18,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: move(frame, 352, 370, 2250, 2820, true),
          top: move(frame, 352, 370, 1023, 1170, true),
          width: 205,
          height: 105,
          border: `4px solid ${colors.purple}`,
          borderRadius: 14,
          background: 'rgba(238,234,253,.78)',
          boxShadow: '0 18px 50px rgba(107,92,231,.2)',
          opacity: figureFlight,
          transform: `scale(${move(frame, 352, 370, 1, 0.42, true)})`,
          transformOrigin: 'center',
          zIndex: 18,
        }}
      />
    </>
  );
};

const Caption: React.FC<{frame: number; language: Language}> = ({frame, language}) => {
  const captions = copy[language].captions;
  const windows = [
    [0, 94],
    [100, 194],
    [200, 295],
    [302, 414],
    [422, 528],
    [536, 642],
    [650, 752],
    [760, 828],
  ] as const;
  const positions: React.CSSProperties[] = [
    {left: 85, top: 100, width: 720},
    {right: 85, bottom: 82, width: 820},
    {left: 85, top: 92, width: 1180},
    {right: 65, top: 92, width: 760},
    {left: 85, bottom: 82, width: 850},
    {left: 85, bottom: 82, width: 980},
    {right: 85, bottom: 82, width: 930},
    {left: 85, top: 90, width: 930},
  ];
  return (
    <>
      {captions.map((caption, index) => {
        const opacity = windowOpacity(frame, windows[index][0], windows[index][1]);
        return (
          <div
            key={caption[2]}
            style={{
              position: 'absolute',
              ...positions[index],
              boxSizing: 'border-box',
              paddingLeft: 86,
              color: colors.ink,
              fontFamily:
                language === 'zh'
                  ? '"PingFang SC", "Noto Sans CJK SC", sans-serif'
                  : "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontSize: language === 'zh' ? 56 : 52,
              lineHeight: 1.08,
              fontWeight: 840,
              letterSpacing: language === 'zh' ? '-.035em' : '-.025em',
              textShadow: '0 2px 18px rgba(255,255,255,.98), 0 2px 42px rgba(255,255,255,.94)',
              opacity,
              transform: `translateY(${(1 - opacity) * 14}px)`,
              zIndex: 40,
            }}
          >
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                display: 'grid',
                placeItems: 'center',
                width: 60,
                height: 60,
                borderRadius: 19,
                color: colors.purple,
                background: 'rgba(238,234,253,.96)',
                boxShadow: '0 12px 34px rgba(74,61,145,.14)',
                fontSize: 30,
              }}
            >
              {caption[0]}
            </div>
            <span>{caption[1]}</span>{' '}
            <span style={{color: colors.purple, whiteSpace: 'nowrap'}}>{caption[2]}</span>
          </div>
        );
      })}
    </>
  );
};

const Brand: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      left: 48,
      top: 36,
      zIndex: 50,
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      color: colors.ink,
      fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      fontSize: 24,
      fontWeight: 780,
    }}
  >
    <Img src={staticFile('logo.svg')} style={{width: 40, height: 40}} />
    ThoughtDAG
    <div style={{width: 78, height: 2, marginLeft: 4, background: colors.purple}} />
  </div>
);

const StoryWorld: React.FC<{language: Language; showCaptions?: boolean}> = ({
  language,
  showCaptions = true,
}) => {
  const frame = useCurrentFrame();
  const text = copy[language];
  const camera = cameraAt(frame);
  const detourCut = reveal(frame, 574, 10);
  const speedBlur =
    interpolate(frame, [88, 96, 106, 112], [0, 3.2, 3.2, 0], clamp) +
    interpolate(frame, [193, 201, 211, 217], [0, 3, 3, 0], clamp) +
    interpolate(frame, [298, 307, 317, 323], [0, 3.5, 3.5, 0], clamp) +
    interpolate(frame, [418, 427, 437, 443], [0, 3.2, 3.2, 0], clamp) +
    interpolate(frame, [533, 540, 550, 556], [0, 3.3, 3.3, 0], clamp) +
    interpolate(frame, [643, 651, 662, 668], [0, 3.5, 3.5, 0], clamp) +
    interpolate(frame, [752, 760, 770, 776], [0, 3, 3, 0], clamp);

  const worldOpacity = 1 - reveal(frame, 822, 16);
  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        color: colors.ink,
        background: colors.paper,
        backgroundImage:
          'radial-gradient(ellipse 55% 45% at 50% 0%, rgba(107,92,231,.10), transparent 72%), radial-gradient(circle, rgba(91,79,140,.13) 1.05px, transparent 1.15px)',
        backgroundSize: '100% 100%, 27px 27px',
        fontFamily:
          language === 'zh'
            ? '"PingFang SC", "Noto Sans CJK SC", sans-serif'
            : "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 3700,
          height: 1800,
          opacity: worldOpacity,
          filter: `blur(${speedBlur}px)`,
          transformOrigin: '0 0',
          transform: `translate(${W / 2 - camera.x * camera.z}px, ${
            H / 2 - camera.y * camera.z
          }px) scale(${camera.z})`,
        }}
      >
        <ChatPanel frame={frame} language={language} />
        <SourceMaterials frame={frame} language={language} />
        <svg
          width={3700}
          height={1800}
          style={{position: 'absolute', inset: 0, overflow: 'visible', zIndex: 5}}
        >
          <Edge frame={frame} start={92} d="M810 655 C930 655 930 510 1050 510" />
          <Edge frame={frame} start={126} d="M1260 600 C1260 680 1040 690 1040 760" tone="green" />
          <Edge frame={frame} start={140} d="M1260 600 C1260 680 1590 690 1590 760" tone="orange" />
          <Edge frame={frame} start={175} d="M1040 940 C1040 1010 940 1020 940 1100" tone="green" />
          <Edge
            frame={frame}
            start={188}
            end={584}
            d="M1590 940 C1590 1015 1690 1035 1690 1120"
            tone="orange"
          />
          <Edge
            frame={frame}
            start={348}
            d="M2470 540 C2550 540 2580 560 2670 560"
            tone="orange"
          />
          <Edge frame={frame} start={648} d="M1230 850 C2050 850 2450 870 3200 870" tone="green" />
          <Edge frame={frame} start={662} d="M1140 1190 C2050 1190 2450 1010 3200 870" tone="green" />
          <Edge frame={frame} start={676} d="M3080 560 C3270 560 3270 710 3415 780" />
          <Edge frame={frame} start={688} d="M3140 1200 C3290 1200 3300 1035 3415 960" />
        </svg>

        <ThoughtNode frame={frame} start={92} x={1050} y={420} copy={text.root} />
        <ThoughtNode
          frame={frame}
          start={122}
          x={850}
          y={760}
          width={380}
          tone="green"
          copy={text.evidence}
        />
        <ThoughtNode
          frame={frame}
          start={136}
          x={1400}
          y={760}
          width={380}
          tone="orange"
          copy={text.alternative}
        />
        <ThoughtNode
          frame={frame}
          start={170}
          x={750}
          y={1100}
          width={390}
          tone="green"
          copy={text.deeper}
        />
        <ThoughtNode
          frame={frame}
          start={182}
          x={1500}
          y={1120}
          width={380}
          tone="orange"
          copy={text.detour}
          dim={detourCut}
        />
        <ThoughtNode
          frame={frame}
          start={346}
          x={2670}
          y={470}
          width={410}
          tone="orange"
          copy={text.pdfQuestion}
        />
        <ThoughtNode
          frame={frame}
          start={366}
          x={2730}
          y={1110}
          width={410}
          copy={text.imageQuestion}
        />
        <ThoughtNode
          frame={frame}
          start={674}
          x={3200}
          y={780}
          width={430}
          tone="green"
          copy={text.merge}
        />

        <div
          style={{
            position: 'absolute',
            left: 1710,
            top: 1040,
            padding: '12px 17px',
            borderRadius: 999,
            color: colors.orange,
            background: colors.orangeSoft,
            border: '1px solid #efbf79',
            fontSize: 15,
            fontWeight: 800,
            opacity: detourCut,
            zIndex: 20,
          }}
        >
          {text.excluded}
        </div>
        <div
          style={{
            position: 'absolute',
            left: 1604,
            top: 989,
            width: 92,
            height: 92,
            opacity: detourCut,
            transform: `scale(${0.7 + detourCut * 0.3})`,
            zIndex: 20,
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: 43,
              top: 2,
              width: 7,
              height: 88,
              borderRadius: 7,
              background: '#d4574e',
              transform: 'rotate(43deg)',
              boxShadow: '0 0 0 12px rgba(212,87,78,.1)',
            }}
          />
        </div>
      </div>
      <Brand />
      {showCaptions ? <Caption frame={frame} language={language} /> : null}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: `${interpolate(frame, [0, 825], [0, 100], clamp)}%`,
          height: 5,
          background: colors.purple,
          zIndex: 60,
          opacity: worldOpacity,
        }}
      />
      <Finale frame={frame} language={language} />
    </AbsoluteFill>
  );
};

const IntroHook: React.FC<{language: Language}> = ({language}) => {
  const frame = useCurrentFrame();
  const text = copy[language];
  const first = spring({
    fps: FPS,
    frame: frame - 5,
    config: {damping: 17, stiffness: 170},
  });
  const second = spring({
    fps: FPS,
    frame: frame - 15,
    config: {damping: 15, stiffness: 190},
  });
  const exit = interpolate(frame, [42, 54], [0, 1], clamp);
  return (
    <AbsoluteFill
      style={{
        zIndex: 200,
        overflow: 'hidden',
        color: '#fff',
        fontFamily:
          language === 'zh'
            ? '"PingFang SC", "Noto Sans CJK SC", sans-serif'
            : "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
          left: 170,
          right: 170,
          top: '50%',
          textAlign: 'center',
          fontSize: language === 'zh' ? 76 : 68,
          lineHeight: 1.18,
          fontWeight: 830,
          letterSpacing: language === 'zh' ? '-.04em' : '.015em',
          opacity: 1 - exit,
          transform: `translateY(-50%) scale(${1 + exit * 0.08})`,
        }}
      >
        <div style={{opacity: first, transform: `translateY(${(1 - first) * 24}px)`}}>
          {text.hook[0]}
        </div>
        <div
          style={{
            marginTop: 16,
            opacity: second,
            transform: `translateY(${(1 - second) * 28}px)`,
          }}
        >
          <span style={{color: '#8e7cff'}}>{text.hook[1]}</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const NarratedIntroHook: React.FC<{language: Language}> = ({language}) => {
  const frame = useCurrentFrame();
  const first = reveal(frame, 10, 18);
  const second = reveal(frame, 24, 18);
  const copyExit = interpolate(frame, [57, 67], [0, 1], clamp);
  const exit = interpolate(frame, [66, 84], [0, 1], clamp);
  const question =
    language === 'zh'
      ? ['为什么和 AI 聊着聊着', '总会变成一条长长的对话？']
      : ['Why does every AI conversation', 'become one long thread?'];

  return (
    <AbsoluteFill
      style={{
        zIndex: 200,
        overflow: 'hidden',
        color: '#f7f4ff',
        fontFamily:
          language === 'zh'
            ? '"PingFang SC", "Noto Sans CJK SC", sans-serif'
            : "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
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
          left: 230,
          right: 230,
          top: '50%',
          textAlign: 'center',
          opacity: 1 - copyExit,
          transform: `translateY(-52%) scale(${1 + copyExit * 0.025})`,
        }}
      >
        <div
          style={{
            fontSize: language === 'zh' ? 78 : 78,
            lineHeight: 1.06,
            fontWeight: 790,
            letterSpacing: language === 'zh' ? '-.035em' : '-.012em',
            opacity: first,
            transform: `translateY(${(1 - first) * 18}px)`,
          }}
        >
          {question[0]}
        </div>
        <div
          style={{
            marginTop: 15,
            color: '#9185ff',
            fontSize: language === 'zh' ? 82 : 82,
            lineHeight: 1.05,
            fontWeight: 820,
            letterSpacing: language === 'zh' ? '-.035em' : '-.01em',
            opacity: second,
            transform: `translateY(${(1 - second) * 18}px)`,
          }}
        >
          {question[1]}
        </div>
      </div>
    </AbsoluteFill>
  );
};

type SubtitleCue = {
  start: number;
  end: number;
  en: string;
  zh: string;
};

const narratedSubtitleCues: SubtitleCue[] = [
  {start: 87, end: 140, en: 'My thinking became harder to see.', zh: '我的思路，反而越来越难看清。'},
  {start: 158, end: 213, en: 'Thoughts don’t move in a straight line.', zh: '思考从来不是一条直线。'},
  {start: 266, end: 289, en: 'They branch.', zh: '它会分叉。'},
  {
    start: 359,
    end: 443,
    en: 'Then a paper or an image opened a new path.',
    zh: '一篇论文，或者一张图片，又会打开一条新的路径。',
  },
  {start: 485, end: 527, en: 'I didn’t need more answers.', zh: '我并不需要更多答案。'},
  {start: 531, end: 562, en: 'I needed structure.', zh: '我需要的是结构。'},
  {start: 590, end: 634, en: 'Every branch could stay.', zh: '每一条分支都可以留下。'},
  {
    start: 645,
    end: 707,
    en: 'Only the connected ones became context.',
    zh: '但只有连上的部分，才会成为上下文。',
  },
  {start: 709, end: 747, en: 'The detour stayed.', zh: '走偏的思路也还在。'},
  {
    start: 750,
    end: 794,
    en: 'The right ideas came together.',
    zh: '真正有关的想法重新汇合。',
  },
  {
    start: 811,
    end: 874,
    en: 'The wires decide what AI sees next.',
    zh: '连线决定 AI 下一次看见什么。',
  },
  {start: 890, end: 929, en: 'That became ThoughtDAG.', zh: '这就是 ThoughtDAG。'},
];

const NarratedSubtitles: React.FC<{language: Language}> = ({language}) => {
  const frame = useCurrentFrame();
  return (
    <>
      {narratedSubtitleCues.map((cue) => {
        const opacity = windowOpacity(frame, cue.start, cue.end, 8, 7);
        return (
          <div
            key={`${cue.start}-${language}`}
            style={{
              position: 'absolute',
              left: '50%',
              bottom: 48,
              zIndex: 300,
              maxWidth: language === 'zh' ? 1120 : 1060,
              padding: language === 'zh' ? '13px 28px 15px' : '13px 25px 15px',
              borderRadius: 14,
              color: '#fff',
              background: 'rgba(24, 21, 31, .82)',
              boxShadow: '0 10px 34px rgba(22, 18, 38, .12)',
              fontFamily:
                language === 'zh'
                  ? '"PingFang SC", "Noto Sans CJK SC", sans-serif'
                  : "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
              fontSize: language === 'zh' ? 34 : 31,
              fontWeight: language === 'zh' ? 620 : 570,
              lineHeight: 1.2,
              letterSpacing: language === 'zh' ? '.01em' : '-.012em',
              textAlign: 'center',
              opacity,
              transform: `translateX(-50%) translateY(${(1 - opacity) * 8}px)`,
            }}
          >
            {language === 'zh' ? cue.zh : cue.en}
          </div>
        );
      })}
    </>
  );
};

const Finale: React.FC<{frame: number; language: Language}> = ({frame, language}) => {
  const text = copy[language];
  const fade = reveal(frame, 822, 18);
  const logo = spring({
    fps: FPS,
    frame: frame - 828,
    config: {damping: 19, stiffness: 105},
  });
  const search = spring({
    fps: FPS,
    frame: frame - 852,
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
        fontFamily:
          language === 'zh'
            ? '"PingFang SC", "Noto Sans CJK SC", sans-serif'
            : "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity: logo,
          transform: `translateY(${(1 - logo) * 26}px) scale(${0.94 + logo * 0.06})`,
        }}
      >
        <Img src={staticFile('logo.svg')} style={{width: 176, height: 176}} />
        <div
          style={{
            marginTop: 24,
            color: colors.ink,
            fontSize: 82,
            lineHeight: 1,
            fontWeight: 840,
            letterSpacing: '-.035em',
          }}
        >
          ThoughtDAG
        </div>
        <div
          style={{
            marginTop: 22,
            color: '#85808c',
            fontSize: 28,
            fontWeight: 560,
            letterSpacing: language === 'zh' ? '.03em' : '-.01em',
          }}
        >
          {text.finaleLine}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 15,
            marginTop: 32,
            padding: '16px 27px',
            border: '2px solid #e4e1e8',
            borderRadius: 999,
            color: '#514d58',
            background: '#fff',
            boxShadow: '0 12px 38px rgba(37,31,52,.08)',
            fontSize: 30,
            fontWeight: 680,
            opacity: search,
            transform: `translateY(${(1 - search) * 14}px)`,
          }}
        >
          <span
            style={{
              display: 'grid',
              placeItems: 'center',
              width: 40,
              height: 40,
              borderRadius: 20,
              color: '#fff',
              background: colors.ink,
              fontSize: 20,
            }}
          >
            ⌕
          </span>
          {text.search}
          <span style={{color: colors.purple, fontWeight: 820}}>ThoughtDAG</span>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ScrollAnimaticBrandWide: React.FC<{language: Language}> = ({language}) => (
  <AbsoluteFill style={{background: '#08080b'}}>
    <Audio
      src={staticFile('audio/scroll-animatic-zh/brand-wide-rhythm-master.wav')}
      volume={1}
    />
    <Sequence from={INTRO_DURATION} durationInFrames={STORY_DURATION}>
      <StoryWorld language={language} />
    </Sequence>
    <IntroHook language={language} />
  </AbsoluteFill>
);

export const ScrollAnimaticBrandZhWide: React.FC = () => (
  <ScrollAnimaticBrandWide language="zh" />
);

export const ScrollAnimaticBrandEnWide: React.FC = () => (
  <ScrollAnimaticBrandWide language="en" />
);

const ScrollAnimaticBrandWideNarrated: React.FC<{language: Language}> = ({language}) => (
  <AbsoluteFill style={{background: '#08080b'}}>
    <Sequence
      from={INTRO_DURATION}
      durationInFrames={NARRATED_DURATION - INTRO_DURATION}
    >
      <StoryWorld language={language} showCaptions={false} />
    </Sequence>
    <NarratedIntroHook language={language} />
    <NarratedSubtitles language={language} />
  </AbsoluteFill>
);

export const ScrollAnimaticBrandZhWideNarrated: React.FC = () => (
  <ScrollAnimaticBrandWideNarrated language="zh" />
);

export const ScrollAnimaticBrandEnWideNarrated: React.FC = () => (
  <ScrollAnimaticBrandWideNarrated language="en" />
);
