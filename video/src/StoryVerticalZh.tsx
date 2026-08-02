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
const clamp = {
  extrapolateLeft: 'clamp',
  extrapolateRight: 'clamp',
} as const;

type Scene = {
  id: string;
  seconds: number;
  kicker: string;
  title: string[];
  subtitle: string;
  visual:
    | 'linear'
    | 'branches'
    | 'mindmap'
    | 'pdf'
    | 'reveal'
    | 'context'
    | 'prune'
    | 'merge';
};

const SCENES: Scene[] = [
  {
    id: '01',
    seconds: 6,
    kicker: '01 / 一条看不见的线',
    title: ['为什么对话', '只能一直往下？'],
    subtitle: '为什么和 AI 的对话，只能一直往下？',
    visual: 'linear',
  },
  {
    id: '02',
    seconds: 9,
    kicker: '02 / 真实的思考',
    title: ['思考不会排队', '它会长出分支'],
    subtitle: '真正的思考会分叉，会遇到一篇论文，也会走上一条后来被放弃的路。',
    visual: 'branches',
  },
  {
    id: '03',
    seconds: 8,
    kicker: '03 / 一个新的问题',
    title: ['如果和 AI 的对话', '也能像思维导图？'],
    subtitle: '我开始想：它能不能像思维导图一样展开？',
    visual: 'mindmap',
  },
  {
    id: '04',
    seconds: 12,
    kicker: '04 / 把材料接回来',
    title: ['PDF、对话、想法', '都能汇进来'],
    subtitle: '一个问题长出不同方向，一篇 PDF 接进来，两条走散的思路重新汇合。',
    visual: 'pdf',
  },
  {
    id: '05',
    seconds: 6,
    kicker: '05 / 从问题到产品',
    title: ['于是，我做了', 'ThoughtDAG'],
    subtitle: '于是，我做了 ThoughtDAG。',
    visual: 'reveal',
  },
  {
    id: '06',
    seconds: 9,
    kicker: '06 / 连线即上下文',
    title: ['线不是装饰', '它决定 AI 看见什么'],
    subtitle: '这里，每条连线都决定 AI 下一次会带上哪些内容。',
    visual: 'context',
  },
  {
    id: '07',
    seconds: 6,
    kicker: '07 / 管理，而不是遗忘',
    title: ['剪掉一条线', '不是删掉过去'],
    subtitle: '剪掉一条线，只是这次不再从那里出发。',
    visual: 'prune',
  },
  {
    id: '08',
    seconds: 4,
    kicker: '08 / 重新汇合',
    title: ['让真正有关的', '重新汇合'],
    subtitle: '最后，让有关的内容重新汇合。',
    visual: 'merge',
  },
];

const sceneFrames = SCENES.map((scene) => scene.seconds * FPS);
const starts = sceneFrames.map((_, index) =>
  sceneFrames.slice(0, index).reduce((sum, frames) => sum + frames, 0),
);

export const STORY_VERTICAL_ZH_DURATION = sceneFrames.reduce(
  (sum, frames) => sum + frames,
  0,
);
export const STORY_VERTICAL_ZH_SIZE = {width: W, height: H, fps: FPS};

const Brand: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      top: 48,
      left: 52,
      display: 'flex',
      alignItems: 'center',
      gap: 13,
      zIndex: 20,
      color: '#252230',
      fontFamily: '"PingFang SC", "Noto Sans CJK SC", sans-serif',
      fontSize: 25,
      fontWeight: 750,
      letterSpacing: '-0.02em',
    }}
  >
    <Img src={staticFile('logo.svg')} style={{width: 42, height: 42}} />
    ThoughtDAG
  </div>
);

const Header: React.FC<Pick<Scene, 'kicker' | 'title'>> = ({kicker, title}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const inSpring = spring({
    frame,
    fps,
    config: {damping: 18, stiffness: 130},
  });

  return (
    <div
      style={{
        position: 'absolute',
        top: 145,
        left: 60,
        right: 60,
        zIndex: 10,
        fontFamily: '"PingFang SC", "Noto Sans CJK SC", sans-serif',
        opacity: inSpring,
        transform: `translateY(${(1 - inSpring) * 34}px)`,
      }}
    >
      <div
        style={{
          color: '#6b5ce7',
          fontSize: 23,
          fontWeight: 700,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          marginBottom: 18,
        }}
      >
        {kicker}
      </div>
      {title.map((line, index) => (
        <div
          key={line}
          style={{
            color: index === title.length - 1 ? '#6b5ce7' : '#1f1d26',
            fontSize: 71,
            lineHeight: 1.15,
            fontWeight: 840,
            letterSpacing: '-0.055em',
          }}
        >
          {line}
        </div>
      ))}
    </div>
  );
};

const Subtitle: React.FC<{text: string; duration: number}> = ({
  text,
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
        left: 52,
        right: 52,
        bottom: 260,
        zIndex: 30,
        opacity,
        padding: '25px 30px 27px',
        background: 'rgba(255,255,255,.94)',
        border: '1px solid rgba(82,72,128,.16)',
        borderRadius: 24,
        boxShadow: '0 18px 55px rgba(47,39,85,.13)',
        color: '#292632',
        fontFamily: '"PingFang SC", "Noto Sans CJK SC", sans-serif',
        fontSize: 37,
        lineHeight: 1.48,
        fontWeight: 650,
        textAlign: 'center',
      }}
    >
      {text}
    </div>
  );
};

const BrowserImage: React.FC<{
  file: string;
  fromScale?: number;
  toScale?: number;
  objectPosition?: string;
  tint?: string;
}> = ({
  file,
  fromScale = 1,
  toScale = 1.07,
  objectPosition = 'center center',
  tint,
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const enter = spring({
    frame: frame - 5,
    fps: FPS,
    config: {damping: 18, stiffness: 115},
  });
  const scale = interpolate(
    frame,
    [0, durationInFrames],
    [fromScale, toScale],
    clamp,
  );

  return (
    <div
      style={{
        position: 'absolute',
        left: 38,
        right: 38,
        top: 450,
        height: 1050,
        borderRadius: 34,
        overflow: 'hidden',
        border: '1px solid #ddd8ed',
        background: '#fff',
        boxShadow: '0 34px 100px rgba(59,49,110,.16)',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 54}px) scale(${0.97 + enter * 0.03})`,
      }}
    >
      <Img
        src={staticFile(file)}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition,
          transform: `scale(${scale})`,
        }}
      />
      {tint ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: tint,
            mixBlendMode: 'multiply',
            pointerEvents: 'none',
          }}
        />
      ) : null}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.5)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
};

type NodeData = {
  x: number;
  y: number;
  w: number;
  label: string;
  note: string;
  color: string;
  delay: number;
};

const GraphNode: React.FC<NodeData> = ({
  x,
  y,
  w,
  label,
  note,
  color,
  delay,
}) => {
  const frame = useCurrentFrame();
  const grow = spring({
    frame: frame - delay,
    fps: FPS,
    config: {damping: 15, stiffness: 155},
  });
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        padding: '22px 24px',
        borderRadius: 22,
        background: '#fff',
        border: `2px solid ${color}`,
        boxShadow: '0 15px 45px rgba(48,39,91,.13)',
        opacity: grow,
        transform: `scale(${0.82 + grow * 0.18})`,
        transformOrigin: 'center center',
        fontFamily: '"PingFang SC", "Noto Sans CJK SC", sans-serif',
      }}
    >
      <div style={{color: '#26232e', fontSize: 28, fontWeight: 760}}>{label}</div>
      <div style={{color: '#777184', fontSize: 20, marginTop: 7}}>{note}</div>
    </div>
  );
};

const Edge: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  delay: number;
  color?: string;
}> = ({x1, y1, x2, y2, delay, color = '#8d80e8'}) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [delay, delay + 18], [0, 1], clamp);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <div
      style={{
        position: 'absolute',
        left: x1,
        top: y1,
        width: length * progress,
        height: 4,
        borderRadius: 999,
        background: color,
        transformOrigin: 'left center',
        transform: `rotate(${angle}deg)`,
        boxShadow: `0 0 12px ${color}55`,
      }}
    />
  );
};

const MindMap: React.FC<{mode?: 'grow' | 'merge'}> = ({mode = 'grow'}) => {
  const isMerge = mode === 'merge';
  return (
    <div
      style={{
        position: 'absolute',
        left: 38,
        right: 38,
        top: 445,
        height: 1040,
        overflow: 'hidden',
        borderRadius: 34,
        background:
          'radial-gradient(circle at 50% 45%, rgba(114,97,230,.11), transparent 42%), #f8f7fc',
        border: '1px solid #dfdbea',
        boxShadow: '0 34px 100px rgba(59,49,110,.14)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.36,
          backgroundImage:
            'radial-gradient(circle, rgba(90,81,129,.22) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />
      {!isMerge ? (
        <>
          <Edge x1={488} y1={504} x2={270} y2={285} delay={10} />
          <Edge x1={505} y1={505} x2={742} y2={285} delay={19} />
          <Edge x1={470} y1={540} x2={250} y2={760} delay={28} color="#54a980" />
          <Edge x1={530} y1={540} x2={760} y2={760} delay={37} color="#e29b54" />
          <GraphNode x={371} y={445} w={260} label="最初的问题" note="从这里开始" color="#6b5ce7" delay={0} />
          <GraphNode x={100} y={205} w={292} label="假设 A" note="继续验证" color="#8d80e8" delay={13} />
          <GraphNode x={610} y={205} w={292} label="另一种解释" note="保留分歧" color="#8d80e8" delay={22} />
          <GraphNode x={76} y={735} w={314} label="论文证据" note="PDF · 第 12 页" color="#54a980" delay={31} />
          <GraphNode x={618} y={735} w={314} label="后来放弃的路" note="仍然留在图上" color="#e29b54" delay={40} />
        </>
      ) : (
        <>
          <Edge x1={260} y1={315} x2={500} y2={555} delay={0} />
          <Edge x1={742} y1={315} x2={520} y2={555} delay={4} />
          <Edge x1={500} y1={640} x2={500} y2={845} delay={9} color="#54a980" />
          <GraphNode x={68} y={230} w={330} label="论文里的证据" note="一条研究分支" color="#8d80e8" delay={0} />
          <GraphNode x={604} y={230} w={330} label="对话里的推论" note="另一条思考分支" color="#8d80e8" delay={3} />
          <GraphNode x={346} y={515} w={312} label="重新汇合" note="只带上有关的内容" color="#54a980" delay={10} />
          <GraphNode x={346} y={825} w={312} label="新的问题" note="从提纯后的上下文出发" color="#54a980" delay={18} />
        </>
      )}
    </div>
  );
};

const PdfVisual: React.FC = () => {
  const frame = useCurrentFrame();
  const split = frame < 190;
  return (
    <div
      style={{
        position: 'absolute',
        left: 38,
        right: 38,
        top: 445,
        height: 1040,
        borderRadius: 34,
        overflow: 'hidden',
        border: '1px solid #ddd8ed',
        background: '#fff',
        boxShadow: '0 34px 100px rgba(59,49,110,.15)',
      }}
    >
      <OffthreadVideo
        muted
        src={staticFile(split ? 'scene1-zh.mp4' : 'scene3-zh.mp4')}
        startFrom={split ? 18 : 34}
        playbackRate={split ? 0.72 : 0.78}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: split ? '31% center' : 'center center',
          transform: split ? 'scale(1.32)' : 'scale(1.16)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 24,
          top: 24,
          padding: '12px 18px',
          borderRadius: 999,
          color: '#fff',
          background: 'rgba(40,35,61,.78)',
          fontFamily: '"PingFang SC", sans-serif',
          fontSize: 21,
          fontWeight: 680,
        }}
      >
        {split ? '把 PDF 里的证据接进来' : '让走散的思路重新汇合'}
      </div>
    </div>
  );
};

const Reveal: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const grow = spring({
    frame,
    fps,
    config: {damping: 14, stiffness: 100},
  });
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 28,
        background:
          'radial-gradient(circle at 50% 52%, rgba(107,92,231,.20), transparent 35%)',
      }}
    >
      <Img
        src={staticFile('logo.svg')}
        style={{
          width: 240,
          height: 240,
          opacity: grow,
          transform: `scale(${0.65 + grow * 0.35}) rotate(${(1 - grow) * -8}deg)`,
          filter: 'drop-shadow(0 28px 45px rgba(80,65,180,.22))',
        }}
      />
      <div
        style={{
          color: '#282431',
          fontFamily: '"PingFang SC", sans-serif',
          fontSize: 70,
          fontWeight: 840,
          letterSpacing: '-0.05em',
          opacity: grow,
        }}
      >
        ThoughtDAG
      </div>
      <div
        style={{
          color: '#6b5ce7',
          fontFamily: '"PingFang SC", sans-serif',
          fontSize: 30,
          fontWeight: 700,
          letterSpacing: '0.14em',
          opacity: grow,
        }}
      >
        连线即上下文
      </div>
    </div>
  );
};

const SceneVisual: React.FC<{scene: Scene}> = ({scene}) => {
  switch (scene.visual) {
    case 'linear':
      return (
        <BrowserImage
          file="story-site/story-p10.png"
          fromScale={1.05}
          toScale={1.13}
          objectPosition="center 74%"
        />
      );
    case 'branches':
      return (
        <BrowserImage
          file="story-site/story-p25.png"
          fromScale={1.08}
          toScale={1.17}
          objectPosition="center 64%"
        />
      );
    case 'mindmap':
      return <MindMap />;
    case 'pdf':
      return <PdfVisual />;
    case 'reveal':
      return <Reveal />;
    case 'context':
      return (
        <BrowserImage
          file="story-site/story-p70.png"
          fromScale={1.08}
          toScale={1.16}
          objectPosition="center 58%"
        />
      );
    case 'prune':
      return (
        <div
          style={{
            position: 'absolute',
            left: 38,
            right: 38,
            top: 445,
            height: 1040,
            borderRadius: 34,
            overflow: 'hidden',
            border: '1px solid #ddd8ed',
            boxShadow: '0 34px 100px rgba(59,49,110,.15)',
            background: '#fff',
          }}
        >
          <OffthreadVideo
            muted
            src={staticFile('scene2-zh.mp4')}
            startFrom={122}
            playbackRate={0.38}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center center',
              transform: 'scale(1.16)',
            }}
          />
        </div>
      );
    case 'merge':
      return <MindMap mode="merge" />;
  }
};

const StoryScene: React.FC<{scene: Scene; index: number; duration: number}> = ({
  scene,
  index,
  duration,
}) => {
  const frame = useCurrentFrame();
  const fade = interpolate(
    frame,
    [0, 8, duration - 8, duration],
    [0, 1, 1, 0],
    clamp,
  );

  return (
    <AbsoluteFill
      style={{
        opacity: fade,
        background:
          'linear-gradient(180deg, #fbfafc 0%, #f5f3f9 58%, #efedf5 100%)',
      }}
    >
      {scene.visual !== 'reveal' ? (
        <>
          <Brand />
          <Header kicker={scene.kicker} title={scene.title} />
        </>
      ) : null}
      <SceneVisual scene={scene} />
      <Subtitle text={scene.subtitle} duration={duration} />
      <div
        style={{
          position: 'absolute',
          left: 52,
          right: 52,
          top: 112,
          height: 5,
          borderRadius: 999,
          overflow: 'hidden',
          background: '#ded9ea',
          zIndex: 40,
        }}
      >
        <div
          style={{
            width: `${((index + frame / duration) / SCENES.length) * 100}%`,
            height: '100%',
            background: '#6b5ce7',
          }}
        />
      </div>
    </AbsoluteFill>
  );
};

export const StoryVerticalZh: React.FC = () => (
  <AbsoluteFill style={{background: '#f7f5fa'}}>
    <Audio src={staticFile('bgm.mp3')} volume={0.045} loop />
    {SCENES.map((scene, index) => {
      const duration = sceneFrames[index];
      return (
        <Sequence
          key={scene.id}
          from={starts[index]}
          durationInFrames={duration}
          premountFor={FPS}
        >
          <StoryScene scene={scene} index={index} duration={duration} />
          <Audio
            src={staticFile(`narration/story-vertical-zh/${scene.id}.mp3`)}
            volume={1}
          />
        </Sequence>
      );
    })}
  </AbsoluteFill>
);
