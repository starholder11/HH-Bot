'use client';

import React, { useRef, useEffect, useState } from 'react';

interface ScaleTransitionProps {
  children: React.ReactNode;
  from?: number;
  to?: number;
  duration?: number;
  delay?: number;
  loop?: boolean;
  trigger?: 'load' | 'hover' | 'scroll';
  easing?: 'ease' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'bounce';
  className?: string;
}

export default function ScaleTransition({ 
  children, 
  from = 0,
  to = 1,
  duration = 600,
  delay = 0,
  loop = false,
  trigger = 'load',
  easing = 'ease-out',
  className = ''
}: ScaleTransitionProps) {
  const elementRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    if (trigger === 'load') {
      const timer = setTimeout(() => setIsVisible(true), delay);
      return () => clearTimeout(timer);
    }

    if (trigger === 'scroll') {
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setIsVisible(true);
            if (!loop) observer.disconnect();
          } else if (loop) {
            setIsVisible(false);
          }
        },
        { threshold: 0.1 }
      );

      observer.observe(element);
      return () => observer.disconnect();
    }
  }, [trigger, delay, loop]);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const shouldAnimate = trigger === 'hover' ? isHovered : isVisible;
    if (!shouldAnimate) return;

    const easingMap = {
      'ease': 'ease',
      'ease-in': 'ease-in',
      'ease-out': 'ease-out',
      'ease-in-out': 'ease-in-out',
      'bounce': 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
    };

    const keyframes = [
      { transform: `scale(${from})`, opacity: from === 0 ? 0 : 1 },
      { transform: `scale(${to})`, opacity: 1 }
    ];

    const animation = element.animate(keyframes, {
      duration,
      iterations: loop ? Infinity : 1,
      easing: easingMap[easing],
      fill: 'forwards'
    });

    return () => animation.cancel();
  }, [isVisible, isHovered, from, to, duration, loop, trigger, easing]);

  // Set initial scale if not triggered yet
  const getInitialStyle = () => {
    if ((trigger === 'load' && !isVisible) || (trigger === 'scroll' && !isVisible)) {
      return { 
        transform: `scale(${from})`,
        opacity: from === 0 ? 0 : 1,
        transformOrigin: 'center'
      };
    }
    return { transformOrigin: 'center' };
  };

  return (
    <div 
      ref={elementRef}
      className={`${className}`}
      onMouseEnter={() => trigger === 'hover' && setIsHovered(true)}
      onMouseLeave={() => trigger === 'hover' && setIsHovered(false)}
      style={getInitialStyle()}
    >
      {children}
    </div>
  );
}
