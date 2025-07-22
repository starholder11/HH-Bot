'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/Button';
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
  id: string;
  name: string;
  description?: string;
}

export default function VideoAnalysisPage() {
  const [videos, setVideos] = useState<VideoAsset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<VideoAsset | null>(null);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null); // Add ID tracking
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [analysisType, setAnalysisType] = useState<'comprehensive' | 'style_focus' | 'mood_themes'>('comprehensive');
  const [keyframeStrategy, setKeyframeStrategy] = useState<'adaptive' | 'uniform' | 'scene_change'>('adaptive');
  const [targetFrames, setTargetFrames] = useState<number>(8);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [hasInitialLoaded, setHasInitialLoaded] = useState(false);

  // Load videos and projects on mount
  useEffect(() => {
    fetchVideos();
    fetchProjects();
  }, []);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Enhanced polling logic - poll when there are any pending videos OR when actively analyzing
  useEffect(() => {
    const hasPendingVideos = videos.some(video =>
      ['triggering', 'pending', 'processing'].includes(video.processing_status?.ai_labeling || '') ||
      ['pending', 'processing'].includes(video.processing_status?.keyframe_extraction || '')
    );

    const shouldPoll = isAnalyzing || hasPendingVideos;

    if (shouldPoll && !pollingInterval) {
      // Start polling every 3 seconds when there are pending videos or during analysis
      const interval = setInterval(() => {
        console.log('[video-analysis] Polling for updates... (pending videos or analysis in progress)');
        fetchVideos();
      }, 3000);
      setPollingInterval(interval);
    } else if (!shouldPoll && pollingInterval) {
      // Stop polling when no pending videos and no active analysis
      console.log('[video-analysis] Stopping polling - no pending videos or analysis');
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }
  }, [isAnalyzing, pollingInterval]);

  // Start polling when videos are first loaded if there are pending videos
  useEffect(() => {
    if (videos.length > 0 && !pollingInterval) {
      const hasPendingVideos = videos.some(video =>
        ['triggering', 'pending', 'processing'].includes(video.processing_status?.ai_labeling || '') ||
        ['pending', 'processing'].includes(video.processing_status?.keyframe_extraction || '')
      );

      if (hasPendingVideos) {
        console.log('[video-analysis] Starting initial polling for pending videos');
        const interval = setInterval(() => {
          fetchVideos();
        }, 3000);
        setPollingInterval(interval);
      }
    }
  }, [videos.length]);

  // Sync selectedVideo with selectedVideoId whenever videos array changes
  useEffect(() => {
    console.log('[video-analysis] Videos updated, syncing selected video. Videos:', videos.length, 'Selected ID:', selectedVideoId);

    if (selectedVideoId && videos.length > 0) {
      const foundVideo = videos.find(v => v.id === selectedVideoId);
      if (foundVideo) {
        console.log('[video-analysis] Found and updating selected video:', foundVideo.title);
        setSelectedVideo(foundVideo);
      } else {
        console.log('[video-analysis] Selected video ID not found in videos, clearing selection');
        setSelectedVideo(null);
        setSelectedVideoId(null);
      }
    } else if (!hasInitialLoaded && videos.length > 0) {
      // Auto-select first video only on initial load
      console.log('[video-analysis] Auto-selecting first video on initial load');
      setSelectedVideo(videos[0]);
      setSelectedVideoId(videos[0].id);
      setHasInitialLoaded(true);
    } else if (!hasInitialLoaded) {
      // Mark as initially loaded even if no videos
      setHasInitialLoaded(true);
    }
  }, [videos, selectedVideoId, hasInitialLoaded]);

  // Detect analysis completion and stop isAnalyzing flag
  useEffect(() => {
    if (selectedVideo && isAnalyzing) {
      const status = selectedVideo.processing_status?.ai_labeling || 'not_started';
      const isCompleted = ['completed', 'failed', 'error'].includes(status);

      if (isCompleted) {
        console.log('[video-analysis] Analysis completed for:', selectedVideo.title, 'Status:', status);
        setIsAnalyzing(false);
      }
    }
  }, [selectedVideo, isAnalyzing]);

  const fetchVideos = async () => {
    try {
      console.log('[video-analysis] Starting fetchVideos...');
      const response = await fetch('/api/media-labeling/assets?type=video');
      console.log('[video-analysis] Fetch response status:', response.status, response.ok);

      if (response.ok) {
        const data = await response.json();
        console.log('[video-analysis] Raw API data received:', data?.length || 'not an array', typeof data);

        // Handle both array and object response formats
        const videoAssets = Array.isArray(data) ? data : (data.assets || []);
        console.log('[video-analysis] Video assets extracted:', videoAssets.length);

        const videos = videoAssets.filter((asset: any) => asset.media_type === 'video');
        console.log('[video-analysis] Filtered videos with media_type="video":', videos.length);

        console.log('[video-analysis] Fetched', videos.length, 'videos');
        setVideos(videos);
      } else {
        console.error('[video-analysis] Fetch failed with status:', response.status);
      }
    } catch (error) {
      console.error('Error fetching videos:', error);
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

    // Use Lambda in production on Vercel, or when explicitly enabled via env var
  const USE_LAMBDA = process.env.NEXT_PUBLIC_USE_LAMBDA === 'true' ||
                     (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app'));

  const handleAnalyzeVideo = async () => {
    if (!selectedVideo) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch('/api/media-labeling/videos/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId: selectedVideo.id,
          strategy: keyframeStrategy,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log('[video-analysis] Analysis completed:', result);

        // Refresh videos to get updated data
        await fetchVideos();

        // Update selected video
        const updatedVideos = await fetch('/api/media-labeling/assets?type=video');
        if (updatedVideos.ok) {
          const data = await updatedVideos.json();
          const videoAssets = Array.isArray(data) ? data : (data.assets || []);
          const videos = videoAssets.filter((v: any) => v.media_type === 'video');
          const updatedVideo = videos.find((v: any) => v.id === selectedVideo.id);
          if (updatedVideo) {
            setSelectedVideo(updatedVideo);
          }
        }
      } else {
        const error = await response.json();
        console.error('[video-analysis] Analysis failed:', error);
        alert(`Analysis failed: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Analysis error:', error);
      alert(`Analysis failed: ${error}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Enhanced video selection handler
  const handleVideoSelect = (video: VideoAsset) => {
    console.log('[video-analysis] Selecting video:', video.title, 'ID:', video.id, 'Status:', video.processing_status?.ai_labeling);

    // Always create a fresh reference to prevent stale state issues
    const videoToSelect = { ...video };
    setSelectedVideo(videoToSelect);
    setSelectedVideoId(videoToSelect.id); // Update ID tracking

    // Reset manual analysis state when switching videos
    setIsAnalyzing(false);
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

    // Check keyframe labeling status
    const hasKeyframes = video.keyframe_stills && video.keyframe_stills.length > 0;
    const pendingKeyframes = hasKeyframes && video.keyframe_stills ? video.keyframe_stills.filter(kf =>
      ['pending', 'triggering', 'processing'].includes(kf.processing_status?.ai_labeling || '')
    ).length : 0;
    const totalKeyframes = hasKeyframes && video.keyframe_stills ? video.keyframe_stills.length : 0;

    switch (status) {
      case 'completed':
        if (hasResults) {
          // Video analysis complete, check keyframes
          if (pendingKeyframes > 0) {
            return {
              status: 'processing',
              label: `Processing Keyframes (${totalKeyframes - pendingKeyframes}/${totalKeyframes})`,
              color: 'blue'
            };
          }
          return { status: 'completed', label: 'Analyzed', color: 'green' };
        }
        return { status: 'failed', label: 'Failed', color: 'red' };

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

  const formatFileSize = (bytes: number) => {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(1)} MB`;
  };

  const filteredVideos = selectedProject
    ? videos.filter(v => v.project_id === selectedProject)
    : videos;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Video Analysis Dashboard</h1>
          <p className="text-gray-600">
            Analyze videos with GPT-4V, extract keyframes, and manage reusable assets
          </p>
        </div>

        <div className="grid grid-cols-12 gap-8">
          {/* Left Sidebar */}
          <div className="col-span-3 space-y-6">
            {/* Project Filter */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Filter by Project</h3>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Analysis Settings */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">Analysis Settings</h3>

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
                    min="3"
                    max="20"
                    value={targetFrames}
                    onChange={(e) => setTargetFrames(parseInt(e.target.value))}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>3</span>
                    <span>20</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Videos List */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-3">
                Videos ({filteredVideos.length})
              </h3>

              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredVideos.map((video) => (
                  <div
                    key={video.id}
                    className={`p-3 border rounded cursor-pointer transition-colors text-sm ${
                      selectedVideo?.id === video.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                    onClick={() => handleVideoSelect(video)}
                  >
                    <div className="font-medium text-gray-900 truncate">{video.title}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDuration(video.metadata.duration)} • {formatFileSize(video.metadata.file_size)}
                    </div>
                    <div className="flex gap-1 mt-2">
                      {(() => {
                        const analysisStatus = getAnalysisStatus(video);
                        return (
                          <div className="flex items-center gap-1">
                            {analysisStatus.status === 'processing' && (
                              <div className="animate-spin rounded-full h-3 w-3 border border-blue-600 border-t-transparent"></div>
                            )}
                            <span className={`px-2 py-1 text-xs rounded ${
                              analysisStatus.color === 'green' ? 'bg-green-100 text-green-800' :
                              analysisStatus.color === 'red' ? 'bg-red-100 text-red-800' :
                              analysisStatus.color === 'yellow' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {analysisStatus.label}
                            </span>
                          </div>
                        );
                      })()}
                      {video.keyframe_stills && video.keyframe_stills.length > 0 && (
                        <span className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded">
                          {video.keyframe_stills.length} keyframes
                        </span>
                      )}
                      {video.processing_status?.ai_labeling === 'completed' &&
                       video.ai_labels &&
                       (video.ai_labels.scenes?.length > 0 || video.ai_labels.objects?.length > 0) && (
                        <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-xs rounded">
                          ✨ AI Analyzed
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {filteredVideos.length === 0 && (
                  <div className="text-center text-gray-500 py-8 text-sm">
                    No videos found. Upload videos from the Media Labeling page.
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="col-span-9">
            {selectedVideo ? (
              <div className="space-y-6">
                {/* Video Player Section */}
                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <div>
                        <h2 className="text-xl font-semibold text-gray-900">{selectedVideo.title}</h2>
                        <p className="text-sm text-gray-500 mt-1">
                          {formatDuration(selectedVideo.metadata.duration)} • {selectedVideo.metadata.format}
                        </p>
                      </div>
                      {(() => {
                        const status = selectedVideo.processing_status?.ai_labeling || 'not_started';
                        const isActive = ['triggering', 'pending', 'processing'].includes(status);
                        const isFailed = ['failed', 'error'].includes(status);

                        if (status === 'completed') {
                          return (
                            <Button
                              onClick={handleAnalyzeVideo}
                              className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700"
                            >
                              Re-analyze Video
                            </Button>
                          );
                        }

                        if (isFailed) {
                          return (
                            <Button
                              onClick={handleAnalyzeVideo}
                              className="bg-red-600 text-white px-6 py-2 rounded-md hover:bg-red-700"
                            >
                              Retry Analysis
                            </Button>
                          );
                        }

                        return (
                          <Button
                            onClick={handleAnalyzeVideo}
                            disabled={isAnalyzing || isActive}
                            className="bg-black text-white px-6 py-2 rounded-md hover:bg-gray-800 disabled:opacity-50"
                          >
                            {isAnalyzing || isActive ? 'Analyzing...' : 'Analyze Video'}
                          </Button>
                        );
                      })()}
                    </div>

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
                        <div className="mt-3">
                          <div className="text-xs text-blue-600">
                            🔍 Checking for updates every 3 seconds
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
            ) : (
              <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
                <div className="text-gray-400 text-6xl mb-4">🎬</div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Video</h3>
                <p className="text-gray-500">Choose a video from the sidebar to start analyzing</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
