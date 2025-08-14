'use client';

import React, { useRef, useEffect } from 'react';

interface ScrollingTextProps {
  children: React.ReactNode;
  direction?: 'up' | 'down' | 'left' | 'right';
  duration?: number;
  loop?: boolean;
  className?: string;
}

export default function ScrollingText({ 
  children, 
  direction = 'up', 
  duration = 30000, 
  loop = true,
  className = ''
}: ScrollingTextProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    const content = contentRef.current;
    if (!container || !content) return;

    const isVertical = direction === 'up' || direction === 'down';
    const isReverse = direction === 'down' || direction === 'right';
    
    // Calculate scroll distance
    const containerSize = isVertical ? container.clientHeight : container.clientWidth;
    const contentSize = isVertical ? content.scrollHeight : content.scrollWidth;
    const scrollDistance = contentSize + containerSize;

    // Apply animation
    const keyframes = [
      { transform: `translate${isVertical ? 'Y' : 'X'}(${isReverse ? -scrollDistance : containerSize}px)` },
      { transform: `translate${isVertical ? 'Y' : 'X'}(${isReverse ? containerSize : -scrollDistance}px)` }
    ];

    const animation = content.animate(keyframes, {
      duration,
      iterations: loop ? Infinity : 1,
      easing: 'linear'
    });

    return () => animation.cancel();
  }, [direction, duration, loop]);

  return (
    <div 
      ref={containerRef}
      className={`overflow-hidden relative w-full h-full ${className}`}
      style={{ position: 'relative' }}
    >
      <div
        ref={contentRef}
        className="absolute"
        style={{
          whiteSpace: direction === 'left' || direction === 'right' ? 'nowrap' : 'normal',
          width: direction === 'left' || direction === 'right' ? 'max-content' : '100%',
        }}
      >
        {children}
      </div>
    </div>
  );
}
