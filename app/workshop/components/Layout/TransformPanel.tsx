'use client';

import React, { useState } from 'react';
import { TRANSFORM_PRESETS, TransformPreset } from './transforms';

type TransformConfig = {
  component: string;
  props?: Record<string, any>;
  animation?: {
    type: 'scroll' | 'fade' | 'slide' | 'rotate' | 'scale' | 'custom';
    duration?: number;
    direction?: 'up' | 'down' | 'left' | 'right';
    loop?: boolean;
    customCSS?: string;
  };
  container?: {
    overflow: 'visible' | 'hidden' | 'scroll' | 'auto';
    background?: string;
    border?: string;
    borderRadius?: string;
  };
};

interface TransformPanelProps {
  transform?: TransformConfig;
  onTransformChange: (transform: TransformConfig | undefined) => void;
  onClose: () => void;
}

export default function TransformPanel({ transform, onTransformChange, onClose }: TransformPanelProps) {
  const [selectedPreset, setSelectedPreset] = useState<TransformPreset | 'custom' | 'none'>('none');
  const [customTransform, setCustomTransform] = useState<TransformConfig>(
    transform || {
      component: 'FadeTransition',
      props: {
        direction: 'in',
        duration: 1000,
        trigger: 'scroll'
      }
    }
  );

  const handlePresetChange = (preset: TransformPreset | 'custom' | 'none') => {
    setSelectedPreset(preset);
    
    if (preset === 'none') {
      onTransformChange(undefined);
    } else if (preset === 'custom') {
      onTransformChange(customTransform);
    } else {
      const presetConfig = TRANSFORM_PRESETS[preset];
      onTransformChange(presetConfig);
    }
  };

  const handleCustomChange = (updates: Partial<TransformConfig>) => {
    const updated = { ...customTransform, ...updates };
    setCustomTransform(updated);
    if (selectedPreset === 'custom') {
      onTransformChange(updated);
    }
  };

  const handleCustomPropChange = (key: string, value: any) => {
    const updatedProps = { ...customTransform.props, [key]: value };
    handleCustomChange({ props: updatedProps });
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-neutral-900 rounded-lg border border-neutral-700 w-full max-w-2xl max-h-[80vh] overflow-auto">
        <div className="flex items-center justify-between p-4 border-b border-neutral-700">
          <h3 className="text-lg font-medium text-white">Transform Effects</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-white text-xl font-bold"
          >
            ×
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Preset Selection */}
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-3">
              Choose Transform
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => handlePresetChange('none')}
                className={`p-3 rounded border text-left ${
                  selectedPreset === 'none'
                    ? 'border-blue-500 bg-blue-500/20 text-white'
                    : 'border-neutral-600 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                <div className="font-medium">None</div>
                <div className="text-xs text-neutral-400">No animation</div>
              </button>
              
              {Object.keys(TRANSFORM_PRESETS).map((preset) => (
                <button
                  key={preset}
                  onClick={() => handlePresetChange(preset as TransformPreset)}
                  className={`p-3 rounded border text-left ${
                    selectedPreset === preset
                      ? 'border-blue-500 bg-blue-500/20 text-white'
                      : 'border-neutral-600 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                  }`}
                >
                  <div className="font-medium">{preset}</div>
                  <div className="text-xs text-neutral-400">
                    {TRANSFORM_PRESETS[preset as TransformPreset].component}
                  </div>
                </button>
              ))}
              
              <button
                onClick={() => handlePresetChange('custom')}
                className={`p-3 rounded border text-left ${
                  selectedPreset === 'custom'
                    ? 'border-blue-500 bg-blue-500/20 text-white'
                    : 'border-neutral-600 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                }`}
              >
                <div className="font-medium">Custom</div>
                <div className="text-xs text-neutral-400">Configure manually</div>
              </button>
            </div>
          </div>

          {/* Custom Configuration */}
          {selectedPreset === 'custom' && (
            <div className="space-y-4 p-4 bg-neutral-800 rounded-lg">
              <h4 className="font-medium text-white">Custom Configuration</h4>
              
              {/* Component Selection */}
              <div>
                <label className="block text-sm text-neutral-300 mb-2">Component</label>
                <select
                  value={customTransform.component}
                  onChange={(e) => handleCustomChange({ component: e.target.value })}
                  className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded text-white"
                >
                  <option value="FadeTransition">Fade Transition</option>
                  <option value="SlideTransition">Slide Transition</option>
                  <option value="ScaleTransition">Scale Transition</option>
                  <option value="RotateTransition">Rotate Transition</option>
                  <option value="ScrollingText">Scrolling Text</option>
                </select>
              </div>

              {/* Component-specific props */}
              <div className="grid grid-cols-2 gap-4">
                {/* Duration */}
                <div>
                  <label className="block text-sm text-neutral-300 mb-2">Duration (ms)</label>
                  <input
                    type="number"
                    value={customTransform.props?.duration || 1000}
                    onChange={(e) => handleCustomPropChange('duration', parseInt(e.target.value))}
                    className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded text-white"
                  />
                </div>

                {/* Delay */}
                <div>
                  <label className="block text-sm text-neutral-300 mb-2">Delay (ms)</label>
                  <input
                    type="number"
                    value={customTransform.props?.delay || 0}
                    onChange={(e) => handleCustomPropChange('delay', parseInt(e.target.value))}
                    className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded text-white"
                  />
                </div>

                {/* Trigger */}
                <div>
                  <label className="block text-sm text-neutral-300 mb-2">Trigger</label>
                  <select
                    value={customTransform.props?.trigger || 'load'}
                    onChange={(e) => handleCustomPropChange('trigger', e.target.value)}
                    className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded text-white"
                  >
                    <option value="load">On Load</option>
                    <option value="scroll">On Scroll</option>
                    <option value="hover">On Hover</option>
                  </select>
                </div>

                {/* Loop */}
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="loop"
                    checked={customTransform.props?.loop || false}
                    onChange={(e) => handleCustomPropChange('loop', e.target.checked)}
                    className="rounded"
                  />
                  <label htmlFor="loop" className="text-sm text-neutral-300">Loop</label>
                </div>
              </div>

              {/* Direction for applicable components */}
              {(['SlideTransition', 'ScrollingText'].includes(customTransform.component)) && (
                <div>
                  <label className="block text-sm text-neutral-300 mb-2">Direction</label>
                  <select
                    value={customTransform.props?.direction || 'up'}
                    onChange={(e) => handleCustomPropChange('direction', e.target.value)}
                    className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded text-white"
                  >
                    <option value="up">Up</option>
                    <option value="down">Down</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              )}

              {/* Scale-specific props */}
              {customTransform.component === 'ScaleTransition' && (
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-2">From Scale</label>
                    <input
                      type="number"
                      step="0.1"
                      value={customTransform.props?.from || 0}
                      onChange={(e) => handleCustomPropChange('from', parseFloat(e.target.value))}
                      className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-300 mb-2">To Scale</label>
                    <input
                      type="number"
                      step="0.1"
                      value={customTransform.props?.to || 1}
                      onChange={(e) => handleCustomPropChange('to', parseFloat(e.target.value))}
                      className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-300 mb-2">Easing</label>
                    <select
                      value={customTransform.props?.easing || 'ease-out'}
                      onChange={(e) => handleCustomPropChange('easing', e.target.value)}
                      className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded text-white"
                    >
                      <option value="ease">Ease</option>
                      <option value="ease-in">Ease In</option>
                      <option value="ease-out">Ease Out</option>
                      <option value="ease-in-out">Ease In Out</option>
                      <option value="bounce">Bounce</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Rotate-specific props */}
              {customTransform.component === 'RotateTransition' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-neutral-300 mb-2">Degrees</label>
                    <input
                      type="number"
                      value={customTransform.props?.degrees || 360}
                      onChange={(e) => handleCustomPropChange('degrees', parseInt(e.target.value))}
                      className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-neutral-300 mb-2">Axis</label>
                    <select
                      value={customTransform.props?.axis || 'z'}
                      onChange={(e) => handleCustomPropChange('axis', e.target.value)}
                      className="w-full p-2 bg-neutral-700 border border-neutral-600 rounded text-white"
                    >
                      <option value="x">X-axis</option>
                      <option value="y">Y-axis</option>
                      <option value="z">Z-axis</option>
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Preview */}
          {selectedPreset !== 'none' && (
            <div className="p-4 bg-neutral-800 rounded-lg">
              <h4 className="font-medium text-white mb-3">Preview</h4>
              <div className="h-24 bg-neutral-700 rounded border-2 border-dashed border-neutral-600 flex items-center justify-center">
                <div className="text-neutral-400 text-sm">Transform preview will appear here</div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-neutral-700">
          <button
            onClick={onClose}
            className="px-4 py-2 text-neutral-300 hover:text-white"
          >
            Cancel
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
