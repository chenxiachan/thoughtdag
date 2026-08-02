import React from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';

const FPS = 30;
const W = 1080;
const H = 1920;
const GAP = 16;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

type Segment = {
  id: string;
  title: string[];
  subtitle: string;
  seconds: number;
  proof: string;
  footage?: {
    file: string;
    startFrom?: number;
    playbackRate?: number;
    crop?: 'center' | 'left';
  };
  visual?: 'linear' | 'graph' | 'end';
};

const SEGMENTS: Segment[] = [
  {
    id: '01',
    title: ['AI 越聊越长', '上下文却越来越隐形'],
    subtitle: 'AI 越聊越长。真正决定答案的上下文，却越来越难看见。',
    seconds: 5.304989,
    proof: '聊天记录显示历史，却没有说明下一次究竟会发送什么',
    visual: 'linear',
  },
  {
    id: '02',
    title: ['把对话', '摊成一张图'],
    subtitle: 'ThoughtDAG 把每一轮问答，放到一张可以编辑的图里。',
    seconds: 4.174014,
    proof: '真实产品录屏 · 缩放后仍能读懂思考结构',
    footage: { file: 'scene3-zh.mp4', startFrom: 8, playbackRate: 0.7 },
  },
  {
    id: '03',
    title: ['连线不是装饰', '它决定模型看见什么'],
    subtitle: '这里，连线不是装饰。沿箭头流入节点的内容，才会发给模型。',
    seconds: 5.933107,
    proof: '实线：完整上游 · 虚线：显式引用 · 未连线：不发送',
    visual: 'graph',
  },
  {
    id: '04',
    title: ['三条分支', '不该拥有同样的权重'],
    subtitle: '一条研究分支有用，另一条已经被排除，还有一段只是无关的岔题。',
    seconds: 6.228027,
    proof: '研究证据 + 晚餐岔题 → 被污染的总结',
    footage: { file: 'scene2-zh.mp4', startFrom: 0, playbackRate: 0.35 },
  },
  {
    id: '05',
    title: ['发送之前', '先检查上下文'],
    subtitle: '打开将发送，你能在生成以前，看见模型到底会读到什么。',
    seconds: 5.474921,
    proof: '将发送 · 节点来源 · token 变化',
    footage: { file: 'scene2-zh.mp4', startFrom: 69, playbackRate: 0.35 },
  },
  {
    id: '06',
    title: ['删一条边', '同一个问题再问一次'],
    subtitle: '删掉一条边，再问完全相同的问题。那段历史，就真的离开了上下文。',
    seconds: 6.748435,
    proof: '−47 tokens · 晚餐分支退出 · 答案原地更新',
    footage: { file: 'scene2-zh.mp4', startFrom: 128, playbackRate: 0.35 },
  },
  {
    id: '07',
    title: ['继续分支', '也可以重新合并'],
    subtitle: '你可以继续分支，也可以把几条证据重新合并。所有变化，都留在图上。',
    seconds: 6.764263,
    proof: '结构本身就是一份可回看的研究过程',
    footage: { file: 'scene3-zh.mp4', startFrom: 34, playbackRate: 0.78 },
  },
  {
    id: '08',
    title: ['材料不连线', '就不进上下文'],
    subtitle: '论文、笔记和引用也能进入画布。没有连线的材料，不会被偷偷塞进提示词。',
    seconds: 7.02907,
    proof: '圈选原文 · 就地提问 · 页码随答案回到画布',
    footage: { file: 'scene1-zh.mp4', startFrom: 20, playbackRate: 0.72, crop: 'left' },
  },
  {
    id: '09',
    title: ['你决定', 'AI 记得什么'],
    subtitle: '这不是让 Agent 替你决定记忆，而是把决定权交还给你。ThoughtDAG，连线即上下文。',
    seconds: 7.303084,
    proof: '开源 · MIT · 本地优先',
    visual: 'end',
  },
];

const segmentFrames = SEGMENTS.map((segment) =>
  Math.ceil((segment.seconds + 0.58) * FPS),
);
const starts = segmentFrames.map((_, index) =>
  segmentFrames.slice(0, index).reduce((sum, frames) => sum + frames, 0),
);

export const PRODUCT_FILM_ZH_DURATION = segmentFrames.reduce(
  (sum, frames) => sum + frames,
  0,
);
export const PRODUCT_FILM_ZH_SIZE = { width: W, height: H, fps: FPS };

const LogoMark: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      top: 54,
      left: 54,
      display: 'flex',
      alignItems: 'center',
      gap: 14,
      color: '#282535',
      fontSize: 26,
      fontWeight: 760,
      letterSpacing: '-0.02em',
      zIndex: 10,
    }}
  >
    <Img src={staticFile('logo.svg')} style={{ width: 44, height: 44 }} />
    ThoughtDAG
  </div>
);

const Progress: React.FC<{ index: number }> = ({ index }) => (
  <div
    style={{
      position: 'absolute',
      left: 54,
      right: 54,
      bottom: 38,
      display: 'grid',
      gridTemplateColumns: `repeat(${SEGMENTS.length}, 1fr)`,
      gap: 8,
      zIndex: 10,
    }}
  >
    {SEGMENTS.map((segment, i) => (
      <div
        key={segment.id}
        style={{
          height: 6,
          borderRadius: 999,
          background: i <= index ? (i === index ? '#6b5ce7' : '#b7afea') : '#ddd9e9',
        }}
      />
    ))}
  </div>
);

const Subtitle: React.FC<{ text: string; proof: string; duration: number }> = ({
  text,
  proof,
  duration,
}) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(
    frame,
    [0, 8, duration - 10, duration],
    [0, 1, 1, 0],
    clamp,
  );
  return (
    <div
      style={{
        position: 'absolute',
        left: 54,
        right: 54,
        bottom: 92,
        zIndex: 12,
        opacity,
      }}
    >
      <div
        style={{
          padding: '24px 30px 26px',
          border: '1.5px solid rgba(67,58,107,.18)',
          borderRadius: 24,
          background: 'rgba(255,255,255,.92)',
          boxShadow: '0 16px 52px rgba(55,45,100,.12)',
          backdropFilter: 'blur(18px)',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            color: '#24212c',
            fontSize: 38,
            lineHeight: 1.5,
            fontWeight: 650,
            letterSpacing: '0.01em',
          }}
        >
          {text}
        </div>
        <div
          style={{
            marginTop: 13,
            color: '#6b5ce7',
            fontSize: 24,
            fontWeight: 650,
            letterSpacing: '0.02em',
          }}
        >
          {proof}
        </div>
      </div>
    </div>
  );
};

const Headline: React.FC<{ lines: string[] }> = ({ lines }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return (
    <div
      style={{
        position: 'absolute',
        top: 148,
        left: 54,
        right: 54,
        textAlign: 'center',
        zIndex: 8,
      }}
    >
      {lines.map((line, index) => {
        const entrance = spring({
          frame: frame - index * 5,
          fps,
          config: { damping: 16, stiffness: 145 },
        });
        return (
          <div
            key={line}
            style={{
              color: index === lines.length - 1 ? '#6b5ce7' : '#211f29',
              fontSize: 74,
              lineHeight: 1.16,
              fontWeight: 820,
              letterSpacing: '-0.045em',
              opacity: entrance,
              transform: `translateY(${(1 - entrance) * 34}px)`,
            }}
          >
            {line}
          </div>
        );
      })}
    </div>
  );
};

const WindowFrame: React.FC<{
  footage: NonNullable<Segment['footage']>;
}> = ({ footage }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({
    frame: frame - 6,
    fps,
    config: { damping: 17, stiffness: 120 },
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: 34,
        right: 34,
        top: 430,
        height: 780,
        overflow: 'hidden',
        borderRadius: 28,
        border: '1.5px solid #ddd8ed',
        background: '#fff',
        boxShadow: '0 34px 90px rgba(59,49,110,.16)',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 54}px) scale(${0.96 + enter * 0.04})`,
      }}
    >
      <div
        style={{
          height: 50,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 20px',
          background: '#f3f0f8',
          borderBottom: '1px solid #e5e0ef',
        }}
      >
        {[0, 1, 2].map((n) => (
          <span
            key={n}
            style={{ width: 13, height: 13, borderRadius: 999, background: '#cfc9df' }}
          />
        ))}
        <span
          style={{
            marginLeft: 16,
            color: '#8c86a0',
            fontFamily: "'SF Mono', Menlo, monospace",
            fontSize: 18,
          }}
        >
          app.thoughtdag.workers.dev
        </span>
      </div>
      <OffthreadVideo
        src={staticFile(footage.file)}
        startFrom={footage.startFrom ?? 0}
        playbackRate={footage.playbackRate ?? 1}
        muted
        style={{
          width: '100%',
          height: 730,
          objectFit: 'cover',
          objectPosition: footage.crop === 'left' ? '34% center' : 'center',
          transform: 'scale(1.08)',
        }}
      />
    </div>
  );
};

const LinearVisual: React.FC = () => {
  const frame = useCurrentFrame();
  const rows = [
    ['你', '帮我比较三种研究方法'],
    ['AI', '先从第一种开始，它的优点是……'],
    ['你', '如果假设不成立呢？'],
    ['AI', '可以考虑另一条路线……'],
    ['你', '顺便问，晚饭吃什么？'],
    ['AI', '附近有一家新开的餐厅。'],
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: 76,
        right: 76,
        top: 440,
        height: 830,
      }}
    >
      {rows.map(([who, text], index) => {
        const appear = interpolate(frame, [index * 6, index * 6 + 12], [0, 1], clamp);
        const fade = index < 3 ? interpolate(frame, [65, 115], [1, 0.18], clamp) : 1;
        return (
          <div
            key={text}
            style={{
              marginLeft: who === '你' ? 160 : 0,
              marginRight: who === 'AI' ? 120 : 0,
              marginBottom: 18,
              padding: '22px 26px',
              borderRadius: 22,
              background: who === '你' ? '#eeeafd' : '#fff',
              border: `1.5px solid ${who === '你' ? '#d8d0fb' : '#dedbe4'}`,
              boxShadow: '0 12px 30px rgba(51,45,80,.07)',
              opacity: appear * fade,
              transform: `translateY(${(1 - appear) * 24}px)`,
              color: '#34303f',
              fontSize: 29,
              lineHeight: 1.4,
            }}
          >
            <strong style={{ color: who === '你' ? '#6b5ce7' : '#e8890c', marginRight: 14 }}>
              {who}
            </strong>
            {text}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          right: 6,
          top: 112,
          width: 170,
          padding: '16px 18px',
          borderRadius: 18,
          background: '#fff2df',
          color: '#a85a00',
          fontSize: 25,
          fontWeight: 740,
          textAlign: 'center',
          transform: `rotate(-3deg) scale(${0.96 + 0.04 * Math.sin(frame / 10)})`,
        }}
      >
        下一次到底
        <br />
        会发送什么？
      </div>
    </div>
  );
};

const GraphVisual: React.FC = () => {
  const frame = useCurrentFrame();
  const reveal = interpolate(frame, [10, 65], [0, 1], clamp);
  const pulse = 0.55 + Math.sin(frame / 8) * 0.18;
  const nodes = [
    { x: 90, y: 90, label: '研究问题', accent: '#6b5ce7' },
    { x: 90, y: 355, label: '证据 A', accent: '#6b5ce7' },
    { x: 540, y: 355, label: '无关岔题', accent: '#e8890c' },
    { x: 315, y: 650, label: '新的总结', accent: '#25a06b' },
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: 58,
        right: 58,
        top: 430,
        height: 860,
        borderRadius: 30,
        border: '1.5px solid #ded9eb',
        backgroundColor: '#fbfafc',
        backgroundImage: 'radial-gradient(circle, #ddd8e8 1.4px, transparent 1.5px)',
        backgroundSize: '24px 24px',
        boxShadow: '0 28px 80px rgba(60,50,120,.12)',
        overflow: 'hidden',
      }}
    >
      <svg width="964" height="860" style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <marker id="film-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="8" markerHeight="8" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#6b5ce7" />
          </marker>
        </defs>
        <path d="M 250 205 C 250 275 250 290 250 355" fill="none" stroke="#6b5ce7" strokeWidth="7" markerEnd="url(#film-arrow)" opacity={reveal} />
        <path d="M 250 470 C 250 580 395 560 455 650" fill="none" stroke="#6b5ce7" strokeWidth="8" markerEnd="url(#film-arrow)" opacity={reveal} />
        <path d="M 700 470 C 700 580 570 560 515 650" fill="none" stroke="#e8890c" strokeWidth="5" strokeDasharray="13 11" opacity={0.35 + pulse * 0.25} />
      </svg>
      {nodes.map((node, index) => {
        const entrance = interpolate(frame, [index * 9, index * 9 + 15], [0, 1], clamp);
        return (
          <div
            key={node.label}
            style={{
              position: 'absolute',
              left: node.x,
              top: node.y,
              width: 330,
              height: 118,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 22,
              border: `3px solid ${node.accent}`,
              background: '#fff',
              boxShadow: '0 14px 32px rgba(55,48,90,.12)',
              color: '#292631',
              fontSize: 34,
              fontWeight: 760,
              opacity: entrance,
              transform: `scale(${0.93 + entrance * 0.07})`,
            }}
          >
            {node.label}
          </div>
        );
      })}
      <div
        style={{
          position: 'absolute',
          left: 75,
          bottom: 34,
          color: '#6b5ce7',
          fontSize: 26,
          fontWeight: 700,
        }}
      >
        沿紫色实线流入的内容，才会发给模型
      </div>
    </div>
  );
};

const EndVisual: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const enter = spring({ frame, fps, config: { damping: 16, stiffness: 115 } });
  return (
    <div
      style={{
        position: 'absolute',
        left: 54,
        right: 54,
        top: 455,
        height: 820,
        borderRadius: 34,
        background:
          'radial-gradient(circle at 50% 22%, rgba(107,92,231,.21), transparent 35%), linear-gradient(160deg, #242030, #15131d)',
        boxShadow: '0 36px 100px rgba(31,25,62,.28)',
        color: '#f6f3ff',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: enter,
        transform: `scale(${0.95 + enter * 0.05})`,
      }}
    >
      <Img src={staticFile('logo.svg')} style={{ width: 170, height: 170 }} />
      <div style={{ marginTop: 38, fontSize: 78, fontWeight: 820, letterSpacing: '-0.04em' }}>
        ThoughtDAG
      </div>
      <div style={{ marginTop: 22, fontSize: 42, color: '#c8c0f7', fontWeight: 680 }}>
        连线即上下文
      </div>
      <div
        style={{
          marginTop: 58,
          padding: '17px 30px',
          border: '1.5px solid rgba(184,174,247,.45)',
          borderRadius: 999,
          color: '#bdb4ff',
          fontFamily: "'SF Mono', Menlo, monospace",
          fontSize: 25,
        }}
      >
        github.com/chenxiachan/thoughtdag
      </div>
    </div>
  );
};

const SegmentScene: React.FC<{
  segment: Segment;
  index: number;
  duration: number;
}> = ({ segment, index, duration }) => {
  const frame = useCurrentFrame();
  const sceneOpacity = interpolate(
    frame,
    [0, 8, duration - 8, duration],
    [0, 1, 1, 0],
    clamp,
  );
  return (
    <AbsoluteFill
      style={{
        opacity: sceneOpacity,
        overflow: 'hidden',
        backgroundColor: '#f7f5fa',
        backgroundImage:
          'radial-gradient(circle at 50% 6%, rgba(107,92,231,.11), transparent 30%), radial-gradient(circle, rgba(86,77,120,.10) 1px, transparent 1.2px)',
        backgroundSize: '100% 100%, 28px 28px',
        fontFamily: "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Noto Sans SC', sans-serif",
      }}
    >
      <LogoMark />
      <Headline lines={segment.title} />
      {segment.footage && <WindowFrame footage={segment.footage} />}
      {segment.visual === 'linear' && <LinearVisual />}
      {segment.visual === 'graph' && <GraphVisual />}
      {segment.visual === 'end' && <EndVisual />}
      <Subtitle text={segment.subtitle} proof={segment.proof} duration={duration} />
      <Progress index={index} />
    </AbsoluteFill>
  );
};

export const ProductFilmZh: React.FC = () => (
  <AbsoluteFill style={{ background: '#f7f5fa' }}>
    <Audio src={staticFile('bgm.mp3')} volume={0.12} loop />
    {SEGMENTS.map((segment, index) => (
      <Sequence
        key={segment.id}
        from={starts[index]}
        durationInFrames={segmentFrames[index]}
      >
        <Audio
          src={staticFile(`narration/product-film-zh/${segment.id}.mp3`)}
          volume={1}
        />
        <SegmentScene
          segment={segment}
          index={index}
          duration={segmentFrames[index]}
        />
      </Sequence>
    ))}
  </AbsoluteFill>
);
