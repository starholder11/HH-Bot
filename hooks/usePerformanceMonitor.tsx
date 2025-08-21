import { useState, useEffect, useRef, useCallback } from 'react';
import { getMemoryStats, type MemoryStats } from '@/utils/spatial/memory-management';

export interface PerformanceMetrics {
  fps: number;
  frameTime: number; // ms
  memory: MemoryStats;
  renderCalls: number;
  triangles: number;
  points: number;
  lines: number;
}

export interface PerformanceConfig {
  updateInterval: number; // ms
  sampleSize: number; // number of frames to average
  enabled: boolean;
}

const DEFAULT_CONFIG: PerformanceConfig = {
  updateInterval: 1000, // Update every second
  sampleSize: 60, // Average over 60 frames
  enabled: true,
};

/**
 * Hook for monitoring 3D scene performance
 */
export function usePerformanceMonitor(
  renderer?: any, // THREE.WebGLRenderer
  config: Partial<PerformanceConfig> = {}
) {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    fps: 0,
    frameTime: 0,
    memory: { geometries: 0, textures: 0, materials: 0, programs: 0, totalMemoryMB: 0 },
    renderCalls: 0,
    triangles: 0,
    points: 0,
    lines: 0,
  });

  const [isRecording, setIsRecording] = useState(false);
  
  // Performance tracking state
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const updateIntervalRef = useRef<number>();
  const animationFrameRef = useRef<number>();

  // Record frame timing
  const recordFrame = useCallback(() => {
    if (!finalConfig.enabled) return;

    const now = performance.now();
    const frameTime = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    // Add to frame times array
    frameTimesRef.current.push(frameTime);
    
    // Keep only the last N frames
    if (frameTimesRef.current.length > finalConfig.sampleSize) {
      frameTimesRef.current.shift();
    }

    // Continue recording
    if (isRecording) {
      animationFrameRef.current = requestAnimationFrame(recordFrame);
    }
  }, [finalConfig.enabled, finalConfig.sampleSize, isRecording]);

  // Calculate metrics from recorded data
  const calculateMetrics = useCallback((): PerformanceMetrics => {
    const frameTimes = frameTimesRef.current;
    
    if (frameTimes.length === 0) {
      return metrics; // Return current metrics if no data
    }

    // Calculate average frame time
    const avgFrameTime = frameTimes.reduce((sum, time) => sum + time, 0) / frameTimes.length;
    const fps = 1000 / avgFrameTime;

    // Get memory stats from renderer
    let memory: MemoryStats = { geometries: 0, textures: 0, materials: 0, programs: 0, totalMemoryMB: 0 };
    let renderCalls = 0;
    let triangles = 0;
    let points = 0;
    let lines = 0;

    if (renderer) {
      try {
        memory = getMemoryStats(renderer);
        const info = renderer.info;
        renderCalls = info.render.calls;
        triangles = info.render.triangles;
        points = info.render.points;
        lines = info.render.lines;
      } catch (error) {
        console.warn('Failed to get renderer stats:', error);
      }
    }

    return {
      fps: Math.round(fps * 10) / 10, // Round to 1 decimal
      frameTime: Math.round(avgFrameTime * 100) / 100, // Round to 2 decimals
      memory,
      renderCalls,
      triangles,
      points,
      lines,
    };
  }, [renderer, metrics]);

  // Start/stop recording
  const startRecording = useCallback(() => {
    if (!finalConfig.enabled) return;
    
    setIsRecording(true);
    lastFrameTimeRef.current = performance.now();
    frameTimesRef.current = [];
    
    // Start frame recording
    animationFrameRef.current = requestAnimationFrame(recordFrame);
    
    // Start periodic updates
    updateIntervalRef.current = window.setInterval(() => {
      const newMetrics = calculateMetrics();
      setMetrics(newMetrics);
    }, finalConfig.updateInterval);
  }, [finalConfig.enabled, finalConfig.updateInterval, recordFrame, calculateMetrics]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }
    
    if (updateIntervalRef.current) {
      clearInterval(updateIntervalRef.current);
    }
  }, []);

  // Auto-start when enabled
  useEffect(() => {
    if (finalConfig.enabled) {
      startRecording();
    } else {
      stopRecording();
    }

    return () => {
      stopRecording();
    };
  }, [finalConfig.enabled, startRecording, stopRecording]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopRecording();
    };
  }, [stopRecording]);

  // Reset metrics
  const reset = useCallback(() => {
    frameTimesRef.current = [];
    setMetrics({
      fps: 0,
      frameTime: 0,
      memory: { geometries: 0, textures: 0, materials: 0, programs: 0, totalMemoryMB: 0 },
      renderCalls: 0,
      triangles: 0,
      points: 0,
      lines: 0,
    });
  }, []);

  // Get performance grade
  const getPerformanceGrade = useCallback((): 'excellent' | 'good' | 'fair' | 'poor' => {
    if (metrics.fps >= 55) return 'excellent';
    if (metrics.fps >= 40) return 'good';
    if (metrics.fps >= 25) return 'fair';
    return 'poor';
  }, [metrics.fps]);

  // Check if performance is acceptable
  const isPerformanceAcceptable = useCallback((): boolean => {
    return metrics.fps >= 30 && metrics.frameTime <= 33.33; // 30 FPS threshold
  }, [metrics.fps, metrics.frameTime]);

  return {
    metrics,
    isRecording,
    startRecording,
    stopRecording,
    reset,
    getPerformanceGrade,
    isPerformanceAcceptable,
    enabled: finalConfig.enabled,
  };
}

/**
 * Performance Monitor Component
 */
export function PerformanceMonitor({ 
  renderer, 
  position = 'top-right',
  compact = false 
}: {
  renderer?: any;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  compact?: boolean;
}) {
  const { metrics, getPerformanceGrade, isPerformanceAcceptable } = usePerformanceMonitor(renderer);

  const positionClasses = {
    'top-left': 'top-3 left-3',
    'top-right': 'top-3 right-3',
    'bottom-left': 'bottom-3 left-3',
    'bottom-right': 'bottom-3 right-3',
  };

  const grade = getPerformanceGrade();
  const gradeColors = {
    excellent: 'text-green-400',
    good: 'text-yellow-400',
    fair: 'text-orange-400',
    poor: 'text-red-400',
  };

  if (compact) {
    return (
      <div className={`absolute ${positionClasses[position]} bg-black/60 text-white text-xs px-2 py-1 rounded font-mono`}>
        <span className={gradeColors[grade]}>{metrics.fps.toFixed(1)} FPS</span>
        {!isPerformanceAcceptable() && <span className="text-red-400 ml-2">⚠</span>}
      </div>
    );
  }

  return (
    <div className={`absolute ${positionClasses[position]} bg-black/80 text-white text-xs p-3 rounded font-mono min-w-48`}>
      <div className="font-semibold mb-2">Performance</div>
      
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>FPS:</span>
          <span className={gradeColors[grade]}>{metrics.fps.toFixed(1)}</span>
        </div>
        
        <div className="flex justify-between">
          <span>Frame:</span>
          <span>{metrics.frameTime.toFixed(2)}ms</span>
        </div>
        
        <div className="flex justify-between">
          <span>Calls:</span>
          <span>{metrics.renderCalls}</span>
        </div>
        
        <div className="flex justify-between">
          <span>Triangles:</span>
          <span>{metrics.triangles.toLocaleString()}</span>
        </div>
        
        <div className="flex justify-between">
          <span>Textures:</span>
          <span>{metrics.memory.textures}</span>
        </div>
        
        <div className="flex justify-between">
          <span>Geometries:</span>
          <span>{metrics.memory.geometries}</span>
        </div>

        {!isPerformanceAcceptable() && (
          <div className="text-red-400 text-center mt-2">
            ⚠ Performance Warning
          </div>
        )}
      </div>
    </div>
  );
}
