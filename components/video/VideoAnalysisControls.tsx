'use client';

import React from 'react';
import { Button } from '@/components/ui/button';

interface VideoAnalysisControlsProps {
  analysisType: 'comprehensive' | 'style_focus' | 'mood_themes';
  keyframeStrategy: 'adaptive' | 'uniform' | 'scene_change';
  targetFrames: number;
  isAnalyzing: boolean;
  onAnalysisTypeChange: (type: 'comprehensive' | 'style_focus' | 'mood_themes') => void;
  onKeyframeStrategyChange: (strategy: 'adaptive' | 'uniform' | 'scene_change') => void;
  onTargetFramesChange: (frames: number) => void;
  onTriggerAnalysis: () => void;
}

export function VideoAnalysisControls({
  analysisType,
  keyframeStrategy,
  targetFrames,
  isAnalyzing,
  onAnalysisTypeChange,
  onKeyframeStrategyChange,
  onTargetFramesChange,
  onTriggerAnalysis,
}: VideoAnalysisControlsProps) {
  return (
    <div className="space-y-6">
      {/* Analysis Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Analysis Type
        </label>
        <select
          value={analysisType}
          onChange={(e) => onAnalysisTypeChange(e.target.value as any)}
          className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isAnalyzing}
        >
          <option value="comprehensive">Comprehensive Analysis</option>
          <option value="style_focus">Style & Aesthetics Focus</option>
          <option value="mood_themes">Mood & Themes Focus</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {analysisType === 'comprehensive' && 'Complete scene, object, style, mood, and theme analysis'}
          {analysisType === 'style_focus' && 'Focused analysis on visual style, aesthetics, and cinematography'}
          {analysisType === 'mood_themes' && 'Emphasis on emotional tone, atmosphere, and thematic content'}
        </p>
      </div>

      {/* Keyframe Strategy */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Keyframe Extraction Strategy
        </label>
        <select
          value={keyframeStrategy}
          onChange={(e) => onKeyframeStrategyChange(e.target.value as any)}
          className="w-full p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          disabled={isAnalyzing}
        >
          <option value="adaptive">Adaptive (Smart Defaults)</option>
          <option value="uniform">Uniform Distribution</option>
          <option value="scene_change">Scene Change Detection</option>
        </select>
        <p className="text-xs text-gray-500 mt-1">
          {keyframeStrategy === 'adaptive' && 'Automatically chooses the best strategy based on video length and content'}
          {keyframeStrategy === 'uniform' && 'Evenly distributed frames throughout the video duration'}
          {keyframeStrategy === 'scene_change' && 'Extracts frames at detected scene transitions (best for longer videos)'}
        </p>
      </div>

      {/* Target Frames */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Target Keyframes: {targetFrames}
        </label>
        <input
          type="range"
          min="3"
          max="20"
          value={targetFrames}
          onChange={(e) => onTargetFramesChange(parseInt(e.target.value))}
          className="w-full"
          disabled={isAnalyzing}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>3 frames</span>
          <span>20 frames</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          More frames provide detailed analysis but increase processing time and cost
        </p>
      </div>

      {/* Analysis Button */}
      <Button
        onClick={onTriggerAnalysis}
        disabled={isAnalyzing}
        className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-3 px-4 rounded-md hover:from-blue-700 hover:to-blue-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium"
      >
        {isAnalyzing ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Analyzing Video...
          </div>
        ) : (
          'Start GPT-4V Analysis'
        )}
      </Button>

      {/* Analysis Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
        <div className="text-sm text-blue-800">
          <div className="font-medium mb-1">Analysis includes:</div>
          <ul className="text-xs space-y-1">
            <li>• Keyframe extraction with quality filtering</li>
            <li>• GPT-4V visual scene understanding</li>
            <li>• Object detection and categorization</li>
            <li>• Style and aesthetic analysis</li>
            <li>• Mood and thematic content identification</li>
            <li>• Reusable keyframe asset creation</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
