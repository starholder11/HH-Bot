'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';

interface VideoAsset {
  id: string;
  filename: string;
  title: string;
  s3_url: string;
  cloudflare_url: string;
  project_id: string | null;
  metadata: {
    duration: number;
    width: number;
    height: number;
    format: string;
    file_size: number;
  };
  ai_labels?: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
  };
  keyframe_stills?: KeyframeStill[];
  processing_status: {
    upload: string;
    keyframe_extraction?: string;
    ai_labeling: string;
  };
  timestamps: {
    uploaded: string;
    keyframes_extracted?: string | null;
    labeled_ai: string | null;
  };
}

interface KeyframeStill {
  id: string;
  parent_video_id: string;
  timestamp: string;
  frame_number: number;
  s3_url: string;
  cloudflare_url: string;
  reusable_as_image: boolean;
  metadata: {
    quality: number;
    resolution: { width: number; height: number };
  };
  processing_status?: {
    extraction: string;
    ai_labeling: string;
    manual_review: string;
  };
  ai_labels?: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
  };
  usage_tracking: {
    times_reused: number;
    projects_used_in: string[];
  };
}

interface Project {
  project_id: string;
  name: string;
  description?: string;
}

export default function VideoEditorPage() {
  const [selectedVideo, setSelectedVideo] = useState<VideoAsset | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [analysisType, setAnalysisType] = useState<'comprehensive' | 'style_focus' | 'mood_themes'>('comprehensive');
  const [keyframeStrategy, setKeyframeStrategy] = useState<'adaptive' | 'uniform' | 'scene_change'>('adaptive');
  const [targetFrames, setTargetFrames] = useState<number>(8);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalysisSettings, setShowAnalysisSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Filename editing state
  const [isEditingFilename, setIsEditingFilename] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const [isRenamingFile, setIsRenamingFile] = useState(false);

  // Get asset ID from URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const assetId = params.get('asset');
    if (assetId) {
      fetchVideoAsset(assetId);
      // Projects are loaded lazily when user clicks dropdown
    }
  }, []);

  // Click outside to close settings dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowAnalysisSettings(false);
      }
    }

    if (showAnalysisSettings) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showAnalysisSettings]);

  const fetchVideoAsset = async (assetId: string) => {
    try {
      // Direct API call to fetch single asset by ID (much faster!)
      const response = await fetch(`/api/media-labeling/assets/${assetId}`);
      if (response.ok) {
        const video = await response.json();
        if (video.media_type === 'video') {
          setSelectedVideo(video);
        } else {
          console.error('Asset is not a video:', video.media_type);
        }
      } else {
        console.error('Video asset not found:', response.status);
      }
    } catch (error) {
      console.error('Error fetching video asset:', error);
    }
  };

  const fetchProjects = async () => {
    try {
      const response = await fetch('/api/media-labeling/projects');
      if (response.ok) {
        const projectsData = await response.json();
        setProjects(projectsData);
      }
    } catch (error) {
      console.error('Error fetching projects:', error);
    }
  };

  // Lazy load projects when user interacts with project dropdown
  const handleProjectDropdownClick = () => {
    if (projects.length === 0) {
      fetchProjects();
    }
  };

  // Project assignment functions
  const updateProjectAssignment = async (projectId: string | null) => {
    if (!selectedVideo) return;

    try {
      const response = await fetch(`/api/media-labeling/assets/${selectedVideo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId })
      });

      const result = await response.json();

      if (response.ok) {
        // Update the selected video with the new data
        setSelectedVideo(result);
        // Refresh the video data
        await fetchVideoAsset(selectedVideo.id);
      } else {
        throw new Error(result.error || 'Failed to update project assignment');
      }
    } catch (error) {
      console.error('Project assignment error:', error);
    }
  };

  const handleAnalyzeVideo = async () => {
    if (!selectedVideo) return;

    const currentStatus = selectedVideo.processing_status?.ai_labeling || 'not_started';
    const isReAnalysis = currentStatus === 'completed';

    setIsAnalyzing(true);
    try {
      const requestBody = {
        assetId: selectedVideo.id,
        strategy: keyframeStrategy,
        targetFrames: targetFrames,
        force: isReAnalysis
      };

      const response = await fetch('/api/media-labeling/videos/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        // Refresh video data
        await fetchVideoAsset(selectedVideo.id);
      } else {
        const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));
        throw new Error(errorData.error || `Analysis failed with status ${response.status}`);
      }
    } catch (error) {
      console.error('Analyze error:', error);
      alert(`Analysis failed: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Get analysis status for display
  const getAnalysisStatus = (video: VideoAsset) => {
    const status = video.processing_status?.ai_labeling || 'not_started';
    const hasResults = video.ai_labels && (
      video.ai_labels.scenes?.length > 0 ||
      video.ai_labels.objects?.length > 0 ||
      video.ai_labels.style?.length > 0 ||
      video.ai_labels.mood?.length > 0 ||
      video.ai_labels.themes?.length > 0
    );

    const hasKeyframes = video.keyframe_stills && video.keyframe_stills.length > 0;
    const pendingKeyframes = hasKeyframes && video.keyframe_stills ? video.keyframe_stills.filter(kf =>
      ['pending', 'triggering', 'processing'].includes(kf.processing_status?.ai_labeling || '')
    ).length : 0;
    const totalKeyframes = hasKeyframes && video.keyframe_stills ? video.keyframe_stills.length : 0;

    const failedKeyframes = hasKeyframes && video.keyframe_stills ? video.keyframe_stills.filter(kf =>
      ['failed', 'error'].includes(kf.processing_status?.ai_labeling || '')
    ).length : 0;

    switch (status) {
      case 'completed':
        if (pendingKeyframes > 0) {
          return {
            status: 'processing',
            label: `Processing Keyframes (${totalKeyframes - pendingKeyframes}/${totalKeyframes})`,
            color: 'blue'
          };
        }
        if (failedKeyframes > 0) {
          return {
            status: 'failed',
            label: `Failed (${failedKeyframes}/${totalKeyframes} keyframes failed)`,
            color: 'red'
          };
        }
        return {
          status: 'completed',
          label: hasResults ? 'Analyzed' : 'Analyzed (minimal results)',
          color: 'green'
        };
      case 'processing':
        return { status: 'processing', label: 'Processing', color: 'blue' };
      case 'triggering':
        return { status: 'processing', label: 'Starting...', color: 'blue' };
      case 'pending':
        return { status: 'processing', label: 'In Progress', color: 'blue' };
      case 'failed':
      case 'error':
        return { status: 'failed', label: 'Failed', color: 'red' };
      case 'not_started':
      default:
        return { status: 'not_started', label: 'Not Analyzed', color: 'gray' };
    }
  };

  const formatDuration = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  // Filename editing functions
  const startFilenameEdit = () => {
    if (!selectedVideo) return;
    setNewFilename(selectedVideo.filename);
    setIsEditingFilename(true);
  };

  const cancelFilenameEdit = () => {
    setIsEditingFilename(false);
    setNewFilename('');
  };

  const saveFilename = async () => {
    if (!selectedVideo || !newFilename.trim()) return;

    const oldTitle = selectedVideo.title;
    const oldFilename = selectedVideo.filename;
    const updatedVideo = {
      ...selectedVideo,
      title: newFilename.trim(),
      filename: newFilename.trim()
    };

    setSelectedVideo(updatedVideo);
    setIsEditingFilename(false);
    setNewFilename('');

    try {
      setIsRenamingFile(true);
      const response = await fetch(`/api/media-labeling/assets/${selectedVideo.id}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newFilename: newFilename.trim() })
      });

      const result = await response.json();

      if (response.ok) {
        setSelectedVideo(result.asset);
      } else {
        setSelectedVideo({
          ...selectedVideo,
          title: oldTitle,
          filename: oldFilename
        });
        setIsEditingFilename(true);
        setNewFilename(newFilename.trim());
        throw new Error(result.error || 'Failed to rename file');
      }
    } catch (error) {
      console.error('Rename error:', error);
      alert(`Failed to rename: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setIsRenamingFile(false);
    }
  };

  if (!selectedVideo) {
    return (
      <div className="p-6 text-center">
        <div className="text-gray-400 text-6xl mb-4">🎬</div>
        <h3 className="text-lg font-medium text-gray-900 mb-2">Loading Video...</h3>
        <p className="text-gray-500">Please wait while we load the video data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Video Player Section - This is the main asset div */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          {/* Single Top Row: Name (edit) | Analyze (settings) */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center space-x-6 flex-1">
              {/* Name Section */}
              <div className="flex items-center space-x-2">
                <span className="text-xl">🎬</span>
                {isEditingFilename ? (
                  <div className="flex items-center space-x-2">
                    <div className="flex-1">
                      <input
                        type="text"
                        value={newFilename}
                        onChange={(e) => setNewFilename(e.target.value)}
                        className="text-lg font-semibold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 min-w-[200px]"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveFilename();
                          if (e.key === 'Escape') cancelFilenameEdit();
                        }}
                      />
                      <div className="text-xs text-gray-500 mt-1">ID: {selectedVideo.id}</div>
                    </div>
                    <Button
                      onClick={() => {
                        if (!isRenamingFile && newFilename.trim()) {
                          saveFilename();
                        }
                      }}
                      className={`px-2 py-1 text-xs ${
                        isRenamingFile || !newFilename.trim()
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-700'
                      }`}
                    >
                      {isRenamingFile ? '...' : '✓'}
                    </Button>
                    <Button
                      onClick={cancelFilenameEdit}
                      className="px-1.5 py-0.5 text-xs bg-gray-300 hover:bg-gray-400 rounded text-gray-700 transition-colors"
                    >
                      ✕
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <div className="flex-1">
                      <h2 className="text-lg font-semibold text-gray-900">{selectedVideo.title}</h2>
                      <div className="text-xs text-gray-500">ID: {selectedVideo.id}</div>
                    </div>
                    <Button
                      onClick={startFilenameEdit}
                      className="px-1.5 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
                    >
                      edit
                    </Button>
                  </div>
                )}
              </div>

              {/* Project Selector */}
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Project:</span>
                <select
                  value={selectedVideo.project_id || ''}
                  onChange={(e) => updateProjectAssignment(e.target.value || null)}
                  onClick={handleProjectDropdownClick}
                  className="border border-gray-300 rounded px-2 py-1 bg-white text-gray-700 text-sm"
                >
                  <option value="">No Project</option>
                  {projects.map(project => (
                    <option key={project.project_id} value={project.project_id}>
                      {project.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Analyze (settings) Button */}
            <div className="relative">
              <div className="flex items-center space-x-2">
                {(() => {
                  const status = selectedVideo.processing_status?.ai_labeling || 'not_started';
                  const isActive = ['triggering', 'pending', 'processing'].includes(status);
                  const isFailed = ['failed', 'error'].includes(status);

                  if (status === 'completed') {
                    return (
                      <Button
                        onClick={handleAnalyzeVideo}
                        className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
                      >
                        Re-analyze
                      </Button>
                    );
                  }

                  if (isFailed) {
                    return (
                      <Button
                        onClick={handleAnalyzeVideo}
                        className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
                      >
                        Retry
                      </Button>
                    );
                  }

                  return (
                    <Button
                      onClick={handleAnalyzeVideo}
                      disabled={isAnalyzing || isActive}
                      className="bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 disabled:opacity-50"
                    >
                      {isAnalyzing || isActive ? 'Analyzing...' : 'Analyze'}
                    </Button>
                  );
                })()}

                <button
                  onClick={() => setShowAnalysisSettings(!showAnalysisSettings)}
                  className="text-blue-600 hover:text-blue-800 text-sm underline"
                >
                  (settings)
                </button>
              </div>

              {/* Settings Dropdown */}
              {showAnalysisSettings && (
                <div ref={settingsRef} className="absolute right-0 top-12 z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-4 w-72">
                  <h4 className="font-medium text-gray-900 mb-3">Analysis Settings</h4>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Analysis Type
                      </label>
                      <select
                        value={analysisType}
                        onChange={(e) => setAnalysisType(e.target.value as any)}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="comprehensive">Comprehensive Analysis</option>
                        <option value="style_focus">Style & Aesthetics Focus</option>
                        <option value="mood_themes">Mood & Themes Focus</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Keyframe Strategy
                      </label>
                      <select
                        value={keyframeStrategy}
                        onChange={(e) => setKeyframeStrategy(e.target.value as any)}
                        className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="adaptive">Adaptive (Smart Defaults)</option>
                        <option value="uniform">Uniform Distribution</option>
                        <option value="scene_change">Scene Change Detection</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Target Keyframes: {targetFrames}
                      </label>
                      <input
                        type="range"
                        min="2"
                        max="16"
                        value={targetFrames}
                        onChange={(e) => setTargetFrames(parseInt(e.target.value))}
                        className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-xs text-gray-500 mt-1">
                        <span>2</span>
                        <span>16</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100">
                      <button
                        onClick={() => setShowAnalysisSettings(false)}
                        className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 px-3 rounded text-sm transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Video Metadata */}
          <p className="text-sm text-gray-500 mb-3">
            {formatDuration(selectedVideo.metadata.duration)} • {selectedVideo.metadata.format}
          </p>

          {/* Analysis Progress Indicator */}
          {isAnalyzing && (
            <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-blue-900">
                    Analysis in Progress
                  </div>
                  <div className="text-xs text-blue-700 mt-1">
                    Extracting keyframes and running GPT-4V analysis... This may take 15-30 seconds.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="p-6">
          <div className="bg-gray-100 rounded-lg aspect-video flex items-center justify-center">
            <video
              key={selectedVideo.id}
              controls
              className="w-full h-full rounded-lg"
              poster={selectedVideo.keyframe_stills?.[0]?.cloudflare_url}
            >
              <source src={selectedVideo.cloudflare_url} type="video/mp4" />
              Your browser does not support the video tag.
            </video>
          </div>
        </div>
      </div>

      {/* AI Analysis Results */}
      {selectedVideo.ai_labels && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Video-Level AI Analysis</h3>

          <div className="grid grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Overall Scenes</h4>
              <div className="space-y-2">
                {selectedVideo.ai_labels.scenes.slice(0, 3).map((scene, index) => (
                  <div key={index} className="text-sm text-gray-700 p-2 bg-gray-50 rounded">
                    {scene}
                  </div>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Objects & Style</h4>
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1">
                  {selectedVideo.ai_labels.objects.slice(0, 6).map((object, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded"
                    >
                      {object}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1">
                  {selectedVideo.ai_labels.style.map((style, index) => (
                    <span
                      key={index}
                      className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded"
                    >
                      {style}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Mood</h4>
              <div className="flex flex-wrap gap-1">
                {selectedVideo.ai_labels.mood.map((mood, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded"
                  >
                    {mood}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Themes</h4>
              <div className="flex flex-wrap gap-1">
                {selectedVideo.ai_labels.themes.map((theme, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded"
                  >
                    {theme}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Keyframes */}
      {selectedVideo.keyframe_stills && selectedVideo.keyframe_stills.length > 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Keyframes ({selectedVideo.keyframe_stills.length})
          </h3>

          <div className="space-y-6">
            {selectedVideo.keyframe_stills.map((keyframe, index) => (
              <div key={keyframe.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex gap-6">
                  {/* Keyframe Image */}
                  <div className="flex-shrink-0">
                    <div className="relative">
                      <img
                        src={keyframe.cloudflare_url}
                        alt={`Frame at ${keyframe.timestamp}`}
                        className="w-48 aspect-video object-cover rounded border border-gray-200"
                      />
                      <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                        {keyframe.timestamp}
                      </div>
                      {keyframe.metadata?.quality && (
                        <div className="absolute top-2 left-2 bg-green-500 text-white text-xs px-2 py-1 rounded">
                          Q{keyframe.metadata.quality}
                        </div>
                      )}
                    </div>
                    <div className="text-center mt-2 text-sm text-gray-600">
                      Frame #{keyframe.frame_number}
                    </div>
                  </div>

                  {/* Keyframe AI Labels */}
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium text-gray-900">Frame {index + 1} Analysis</h4>
                      <div className="flex items-center gap-2">
                        {keyframe.processing_status?.ai_labeling === 'completed' && (
                          <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                            ✓ Analyzed
                          </span>
                        )}
                        {keyframe.processing_status?.ai_labeling === 'processing' && (
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded">
                            Processing...
                          </span>
                        )}
                        {keyframe.processing_status?.ai_labeling === 'failed' && (
                          <span className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded">
                            Failed
                          </span>
                        )}
                        {keyframe.processing_status?.ai_labeling === 'pending' && (
                          <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">
                            Pending
                          </span>
                        )}
                      </div>
                    </div>

                    {keyframe.ai_labels ? (
                      <div className="space-y-4">
                        {/* Scene Description */}
                        {keyframe.ai_labels.scenes && keyframe.ai_labels.scenes.length > 0 && (
                          <div>
                            <h5 className="text-sm font-medium text-gray-700 mb-2">Scene Description</h5>
                            <div className="text-sm text-gray-600 p-3 bg-purple-50 rounded border-l-4 border-purple-400">
                              {keyframe.ai_labels.scenes[0]}
                            </div>
                          </div>
                        )}

                        {/* Labels Grid */}
                        <div className="grid grid-cols-2 gap-4">
                          {/* Objects */}
                          {keyframe.ai_labels.objects && keyframe.ai_labels.objects.length > 0 && (
                            <div>
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Objects</h5>
                              <div className="flex flex-wrap gap-1">
                                {keyframe.ai_labels.objects.slice(0, 6).map((object, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                                  >
                                    {object}
                                  </span>
                                ))}
                                {keyframe.ai_labels.objects.length > 6 && (
                                  <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                                    +{keyframe.ai_labels.objects.length - 6}
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Style */}
                          {keyframe.ai_labels.style && keyframe.ai_labels.style.length > 0 && (
                            <div>
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Style</h5>
                              <div className="flex flex-wrap gap-1">
                                {keyframe.ai_labels.style.map((style, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded"
                                  >
                                    {style}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Mood */}
                          {keyframe.ai_labels.mood && keyframe.ai_labels.mood.length > 0 && (
                            <div>
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Mood</h5>
                              <div className="flex flex-wrap gap-1">
                                {keyframe.ai_labels.mood.map((mood, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded"
                                  >
                                    {mood}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Themes */}
                          {keyframe.ai_labels.themes && keyframe.ai_labels.themes.length > 0 && (
                            <div>
                              <h5 className="text-sm font-medium text-gray-700 mb-2">Themes</h5>
                              <div className="flex flex-wrap gap-1">
                                {keyframe.ai_labels.themes.map((theme, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2 py-1 bg-orange-100 text-orange-800 text-xs rounded"
                                  >
                                    {theme}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        {keyframe.processing_status?.ai_labeling === 'pending' ? (
                          'AI analysis pending...'
                        ) : keyframe.processing_status?.ai_labeling === 'processing' ? (
                          'AI analysis in progress...'
                        ) : keyframe.processing_status?.ai_labeling === 'failed' ? (
                          'AI analysis failed'
                        ) : (
                          'No AI analysis available'
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Keyframes</h3>
          <div className="text-center py-8">
            {isAnalyzing || selectedVideo.processing_status?.keyframe_extraction === 'processing' ? (
              <div className="space-y-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <div className="text-blue-600 font-medium">Extracting keyframes...</div>
                <p className="text-gray-500 text-sm">
                  Processing video and generating keyframe thumbnails
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-gray-400 text-4xl">🎬</div>
                <p className="text-gray-500 mb-4">
                  {selectedVideo.processing_status?.ai_labeling === 'completed'
                    ? 'No keyframes were generated for this video'
                    : 'Keyframes will appear here after analysis'}
                </p>
                {selectedVideo.processing_status?.ai_labeling !== 'pending' && !isAnalyzing && (
                  <Button
                    onClick={handleAnalyzeVideo}
                    disabled={isAnalyzing}
                    className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 disabled:opacity-50"
                  >
                    {isAnalyzing ? 'Re-analyzing...' : 'Re-analyze Video'}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
