'use client';

import React, { useRef, useEffect, useState } from 'react';

interface RotateTransitionProps {
  children: React.ReactNode;
  degrees?: number;
  direction?: 'clockwise' | 'counterclockwise';
  duration?: number;
  delay?: number;
  loop?: boolean;
  trigger?: 'load' | 'hover' | 'scroll';
  axis?: 'x' | 'y' | 'z';
  className?: string;
}

export default function RotateTransition({ 
  children, 
  degrees = 360,
  direction = 'clockwise',
  duration = 2000,
  delay = 0,
  loop = false,
  trigger = 'load',
  axis = 'z',
  className = ''
}: RotateTransitionProps) {
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

    const finalDegrees = direction === 'counterclockwise' ? -degrees : degrees;
    const rotateProperty = `rotate${axis.toUpperCase()}`;
    
    const keyframes = [
      { transform: `${rotateProperty}(0deg)` },
      { transform: `${rotateProperty}(${finalDegrees}deg)` }
    ];

    const animation = element.animate(keyframes, {
      duration,
      iterations: loop ? Infinity : 1,
      easing: 'ease-in-out',
      fill: 'forwards'
    });

    return () => animation.cancel();
  }, [isVisible, isHovered, degrees, direction, duration, loop, trigger, axis]);

  return (
    <div 
      ref={elementRef}
      className={`${className}`}
      onMouseEnter={() => trigger === 'hover' && setIsHovered(true)}
      onMouseLeave={() => trigger === 'hover' && setIsHovered(false)}
      style={{ 
        transformOrigin: 'center',
        transformStyle: 'preserve-3d'
      }}
    >
      {children}
    </div>
  );
}
