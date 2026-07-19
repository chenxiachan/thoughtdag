import React from 'react';
import { Composition } from 'remotion';
import { Hero, HERO_DURATION } from './Hero';

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
  </>
);
