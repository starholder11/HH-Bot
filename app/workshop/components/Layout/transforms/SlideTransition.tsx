'use client';

import React, { useRef, useEffect, useState } from 'react';

interface SlideTransitionProps {
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right';
  distance?: number;
  duration?: number;
  delay?: number;
  loop?: boolean;
  trigger?: 'load' | 'hover' | 'scroll';
  className?: string;
}

export default function SlideTransition({ 
  children, 
  direction = 'up',
  distance = 50,
  duration = 800,
  delay = 0,
  loop = false,
  trigger = 'load',
  className = ''
}: SlideTransitionProps) {
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

    let transform = '';
    switch (direction) {
      case 'up':
        transform = `translateY(${distance}px)`;
        break;
      case 'down':
        transform = `translateY(-${distance}px)`;
        break;
      case 'left':
        transform = `translateX(${distance}px)`;
        break;
      case 'right':
        transform = `translateX(-${distance}px)`;
        break;
    }

    const keyframes = [
      { transform, opacity: 0 },
      { transform: 'translate(0, 0)', opacity: 1 }
    ];

    const animation = element.animate(keyframes, {
      duration,
      iterations: loop ? Infinity : 1,
      easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
      fill: 'forwards'
    });

    return () => animation.cancel();
  }, [isVisible, isHovered, direction, distance, duration, loop, trigger]);

  // Set initial transform if not triggered yet
  const getInitialStyle = () => {
    if ((trigger === 'load' && !isVisible) || (trigger === 'scroll' && !isVisible)) {
      let transform = '';
      switch (direction) {
        case 'up':
          transform = `translateY(${distance}px)`;
          break;
        case 'down':
          transform = `translateY(-${distance}px)`;
          break;
        case 'left':
          transform = `translateX(${distance}px)`;
          break;
        case 'right':
          transform = `translateX(-${distance}px)`;
          break;
      }
      return { transform, opacity: 0 };
    }
    return {};
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
