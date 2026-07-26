import React from 'react';
import { Composition } from 'remotion';
import { Hero, HERO_DURATION } from './Hero';
import { Shorts, SHORTS_DURATION, SHORTS_SIZE } from './Shorts';

export const Root: React.FC = () => (
  <>
    <Composition
      id="Hero"
      component={Hero}
      durationInFrames={HERO_DURATION}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ lang: 'zh' as const }}
    />
    <Composition
      id="HeroEn"
      component={Hero}
      durationInFrames={HERO_DURATION}
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ lang: 'en' as const }}
    />
    <Composition
      id="ShortsEn"
      component={Shorts}
      durationInFrames={SHORTS_DURATION}
      fps={SHORTS_SIZE.fps}
      width={SHORTS_SIZE.width}
      height={SHORTS_SIZE.height}
      defaultProps={{ lang: 'en' as const }}
    />
    <Composition
      id="ShortsZh"
      component={Shorts}
      durationInFrames={SHORTS_DURATION}
      fps={SHORTS_SIZE.fps}
      width={SHORTS_SIZE.width}
      height={SHORTS_SIZE.height}
      defaultProps={{ lang: 'zh' as const }}
    />
  </>
);
