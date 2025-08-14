'use client';

import dynamic from 'next/dynamic';
import { ComponentType } from 'react';

// Dynamically import transform components for SSR safety
const ScrollingText = dynamic(() => import('./ScrollingText'), { ssr: false });
const FadeTransition = dynamic(() => import('./FadeTransition'), { ssr: false });
const SlideTransition = dynamic(() => import('./SlideTransition'), { ssr: false });
const RotateTransition = dynamic(() => import('./RotateTransition'), { ssr: false });
const ScaleTransition = dynamic(() => import('./ScaleTransition'), { ssr: false });

export interface TransformComponentProps {
  children: React.ReactNode;
  [key: string]: any;
}

export const TransformComponents: Record<string, ComponentType<TransformComponentProps>> = {
  ScrollingText,
  FadeTransition,
  SlideTransition,
  RotateTransition,
  ScaleTransition,
};

export type TransformType = keyof typeof TransformComponents;

export const TRANSFORM_PRESETS = {
  'Star Wars Scroll': {
    component: 'ScrollingText',
    props: {
      direction: 'up',
      duration: 30000,
      loop: true,
    }
  },
  'Fade In': {
    component: 'FadeTransition',
    props: {
      direction: 'in',
      duration: 1000,
      trigger: 'scroll'
    }
  },
  'Slide Up': {
    component: 'SlideTransition',
    props: {
      direction: 'up',
      distance: 50,
      duration: 800,
      trigger: 'scroll'
    }
  },
  'Bounce In': {
    component: 'ScaleTransition',
    props: {
      from: 0,
      to: 1,
      duration: 600,
      easing: 'bounce',
      trigger: 'scroll'
    }
  },
  'Rotate on Hover': {
    component: 'RotateTransition',
    props: {
      degrees: 15,
      duration: 300,
      trigger: 'hover'
    }
  },
  'Marquee Left': {
    component: 'ScrollingText',
    props: {
      direction: 'left',
      duration: 15000,
      loop: true,
    }
  }
} as const;

export type TransformPreset = keyof typeof TRANSFORM_PRESETS;
