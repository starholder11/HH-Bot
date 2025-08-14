'use client';

import React, { useRef, useEffect, useState } from 'react';

interface FadeTransitionProps {
  children: React.ReactNode;
  direction?: 'in' | 'out' | 'in-out';
  duration?: number;
  delay?: number;
  loop?: boolean;
  trigger?: 'load' | 'hover' | 'scroll';
  className?: string;
}

export default function FadeTransition({ 
  children, 
  direction = 'in',
  duration = 1000,
  delay = 0,
  loop = false,
  trigger = 'load',
  className = ''
}: FadeTransitionProps) {
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
    if (!shouldAnimate && direction === 'in') return;

    let keyframes: Keyframe[] = [];
    
    switch (direction) {
      case 'in':
        keyframes = [
          { opacity: 0 },
          { opacity: 1 }
        ];
        break;
      case 'out':
        keyframes = [
          { opacity: 1 },
          { opacity: 0 }
        ];
        break;
      case 'in-out':
        keyframes = [
          { opacity: 0 },
          { opacity: 1 },
          { opacity: 1 },
          { opacity: 0 }
        ];
        break;
    }

    const animation = element.animate(keyframes, {
      duration: direction === 'in-out' ? duration * 2 : duration,
      iterations: loop ? Infinity : 1,
      easing: 'ease-in-out',
      fill: 'forwards'
    });

    return () => animation.cancel();
  }, [isVisible, isHovered, direction, duration, loop, trigger]);

  return (
    <div 
      ref={elementRef}
      className={`${className}`}
      onMouseEnter={() => trigger === 'hover' && setIsHovered(true)}
      onMouseLeave={() => trigger === 'hover' && setIsHovered(false)}
      style={{ 
        opacity: (trigger === 'load' && !isVisible) || (trigger === 'scroll' && !isVisible) ? 0 : undefined 
      }}
    >
      {children}
    </div>
  );
}
