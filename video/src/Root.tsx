import React from 'react';
import { Composition } from 'remotion';
import { Hero, HERO_DURATION } from './Hero';
import { Shorts, SHORTS_DURATION, SHORTS_SIZE } from './Shorts';
import {
  ProductFilmZh,
  PRODUCT_FILM_ZH_DURATION,
  PRODUCT_FILM_ZH_SIZE,
} from './ProductFilmZh';
import {
  StoryVerticalZh,
  STORY_VERTICAL_ZH_DURATION,
  STORY_VERTICAL_ZH_SIZE,
} from './StoryVerticalZh';
import {
  ScrollAnimaticEn,
  ScrollAnimaticZh,
  SCROLL_ANIMATIC_EN_DURATION,
  SCROLL_ANIMATIC_EN_SIZE,
  SCROLL_ANIMATIC_ZH_DURATION,
  SCROLL_ANIMATIC_ZH_SIZE,
} from './ScrollAnimaticZh';
import {
  ScrollAnimaticEnWide,
  ScrollAnimaticZhWide,
  SCROLL_ANIMATIC_EN_WIDE_DURATION,
  SCROLL_ANIMATIC_EN_WIDE_SIZE,
  SCROLL_ANIMATIC_ZH_WIDE_DURATION,
  SCROLL_ANIMATIC_ZH_WIDE_SIZE,
} from './ScrollAnimaticEnWide';
import {
  ScrollAnimaticBrandEnWide,
  ScrollAnimaticBrandEnWideNarrated,
  ScrollAnimaticBrandZhWide,
  ScrollAnimaticBrandZhWideNarrated,
  SCROLL_ANIMATIC_BRAND_WIDE_DURATION,
  SCROLL_ANIMATIC_BRAND_WIDE_NARRATED_DURATION,
  SCROLL_ANIMATIC_BRAND_WIDE_SIZE,
} from './ScrollAnimaticBrandWide';
import {
  OpeningPilotEn,
  OPENING_PILOT_EN_DURATION,
  OPENING_PILOT_EN_SIZE,
} from './OpeningPilotEn';

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
    <Composition
      id="ProductFilmZh"
      component={ProductFilmZh}
      durationInFrames={PRODUCT_FILM_ZH_DURATION}
      fps={PRODUCT_FILM_ZH_SIZE.fps}
      width={PRODUCT_FILM_ZH_SIZE.width}
      height={PRODUCT_FILM_ZH_SIZE.height}
    />
    <Composition
      id="StoryVerticalZh"
      component={StoryVerticalZh}
      durationInFrames={STORY_VERTICAL_ZH_DURATION}
      fps={STORY_VERTICAL_ZH_SIZE.fps}
      width={STORY_VERTICAL_ZH_SIZE.width}
      height={STORY_VERTICAL_ZH_SIZE.height}
    />
    <Composition
      id="ScrollAnimaticZh"
      component={ScrollAnimaticZh}
      durationInFrames={SCROLL_ANIMATIC_ZH_DURATION}
      fps={SCROLL_ANIMATIC_ZH_SIZE.fps}
      width={SCROLL_ANIMATIC_ZH_SIZE.width}
      height={SCROLL_ANIMATIC_ZH_SIZE.height}
    />
    <Composition
      id="ScrollAnimaticEn"
      component={ScrollAnimaticEn}
      durationInFrames={SCROLL_ANIMATIC_EN_DURATION}
      fps={SCROLL_ANIMATIC_EN_SIZE.fps}
      width={SCROLL_ANIMATIC_EN_SIZE.width}
      height={SCROLL_ANIMATIC_EN_SIZE.height}
    />
    <Composition
      id="ScrollAnimaticEnWide"
      component={ScrollAnimaticEnWide}
      durationInFrames={SCROLL_ANIMATIC_EN_WIDE_DURATION}
      fps={SCROLL_ANIMATIC_EN_WIDE_SIZE.fps}
      width={SCROLL_ANIMATIC_EN_WIDE_SIZE.width}
      height={SCROLL_ANIMATIC_EN_WIDE_SIZE.height}
    />
    <Composition
      id="ScrollAnimaticZhWide"
      component={ScrollAnimaticZhWide}
      durationInFrames={SCROLL_ANIMATIC_ZH_WIDE_DURATION}
      fps={SCROLL_ANIMATIC_ZH_WIDE_SIZE.fps}
      width={SCROLL_ANIMATIC_ZH_WIDE_SIZE.width}
      height={SCROLL_ANIMATIC_ZH_WIDE_SIZE.height}
    />
    <Composition
      id="ScrollAnimaticBrandZhWide"
      component={ScrollAnimaticBrandZhWide}
      durationInFrames={SCROLL_ANIMATIC_BRAND_WIDE_DURATION}
      fps={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.fps}
      width={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.width}
      height={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.height}
    />
    <Composition
      id="ScrollAnimaticBrandEnWide"
      component={ScrollAnimaticBrandEnWide}
      durationInFrames={SCROLL_ANIMATIC_BRAND_WIDE_DURATION}
      fps={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.fps}
      width={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.width}
      height={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.height}
    />
    <Composition
      id="OpeningPilotEn"
      component={OpeningPilotEn}
      durationInFrames={OPENING_PILOT_EN_DURATION}
      fps={OPENING_PILOT_EN_SIZE.fps}
      width={OPENING_PILOT_EN_SIZE.width}
      height={OPENING_PILOT_EN_SIZE.height}
    />
    <Composition
      id="ScrollAnimaticBrandEnWideNarrated"
      component={ScrollAnimaticBrandEnWideNarrated}
      durationInFrames={SCROLL_ANIMATIC_BRAND_WIDE_NARRATED_DURATION}
      fps={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.fps}
      width={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.width}
      height={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.height}
    />
    <Composition
      id="ScrollAnimaticBrandZhWideNarrated"
      component={ScrollAnimaticBrandZhWideNarrated}
      durationInFrames={SCROLL_ANIMATIC_BRAND_WIDE_NARRATED_DURATION}
      fps={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.fps}
      width={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.width}
      height={SCROLL_ANIMATIC_BRAND_WIDE_SIZE.height}
    />
  </>
);
