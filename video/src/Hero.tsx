import React from 'react';
import { Series } from 'remotion';
import { Scene1, SCENE1_DURATION } from './scenes/Scene1';
import { Scene2, SCENE2_DURATION } from './scenes/Scene2';
import { Scene3, SCENE3_DURATION } from './scenes/Scene3';
import { Scene4, SCENE4_DURATION } from './scenes/Scene4';
import { Scene5, SCENE5_DURATION } from './scenes/Scene5';
import type { Lang } from './lang';

export const HERO_DURATION =
  SCENE1_DURATION + SCENE2_DURATION + SCENE3_DURATION + SCENE4_DURATION + SCENE5_DURATION;

export const Hero: React.FC<{ lang?: Lang }> = ({ lang = 'zh' }) => (
  <Series>
    <Series.Sequence durationInFrames={SCENE1_DURATION}><Scene1 lang={lang} /></Series.Sequence>
    <Series.Sequence durationInFrames={SCENE2_DURATION}><Scene2 lang={lang} /></Series.Sequence>
    <Series.Sequence durationInFrames={SCENE3_DURATION}><Scene3 lang={lang} /></Series.Sequence>
    <Series.Sequence durationInFrames={SCENE4_DURATION}><Scene4 lang={lang} /></Series.Sequence>
    <Series.Sequence durationInFrames={SCENE5_DURATION}><Scene5 lang={lang} /></Series.Sequence>
  </Series>
);
