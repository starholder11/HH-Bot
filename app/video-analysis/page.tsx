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
    overall_analysis?: any;
    keyframe_analysis?: any[];
    analysis_metadata?: any;
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
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [analysisType, setAnalysisType] = useState<'comprehensive' | 'style_focus' | 'mood_themes'>('comprehensive');
  const [keyframeStrategy, setKeyframeStrategy] = useState<'adaptive' | 'uniform' | 'scene_change'>('adaptive');
  const [targetFrames, setTargetFrames] = useState<number>(8);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState('');
  const [selectedKeyframe, setSelectedKeyframe] = useState<KeyframeStill | null>(null);
  const [showKeyframeModal, setShowKeyframeModal] = useState(false);

  // Load videos and projects on mount
  useEffect(() => {
    fetchVideos();
    fetchProjects();
  }, []);

  const fetchVideos = async () => {
    try {
      const response = await fetch('/api/media-labeling/assets?type=video');
      if (response.ok) {
        const allAssets = await response.json();
        setVideos(allAssets.filter((asset: any) => asset.media_type === 'video'));
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

  const triggerVideoAnalysis = async (videoId: string) => {
    if (!videoId) return;

    setIsAnalyzing(true);
    setAnalysisProgress('Initializing video analysis...');

    try {
      const response = await fetch('/api/media-labeling/videos/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoId,
          analysisType,
          keyframeStrategy,
          targetFrames,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setAnalysisProgress('Analysis complete! Refreshing video data...');

        // Refresh the video data to show new analysis results
        await fetchVideos();

        // Update selected video with new data
        const updatedVideo = videos.find(v => v.id === videoId);
        if (updatedVideo) {
          setSelectedVideo(updatedVideo);
        }

        setAnalysisProgress('');
        alert('Video analysis completed successfully!');
      } else {
        const error = await response.text();
        console.error('Analysis failed:', error);
        setAnalysisProgress('');
        alert(`Analysis failed: ${error}`);
      }
    } catch (error) {
      console.error('Error during analysis:', error);
      setAnalysisProgress('');
      alert('Analysis failed due to network error');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  const openKeyframeModal = (keyframe: KeyframeStill) => {
    setSelectedKeyframe(keyframe);
    setShowKeyframeModal(true);
  };

  const convertKeyframeToImage = async (keyframeId: string, targetProjectId: string) => {
    try {
      const response = await fetch('/api/media-labeling/keyframes/convert-to-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          keyframeId,
          targetProjectId,
          newTitle: `Keyframe from ${selectedVideo?.title}`,
        }),
      });

      if (response.ok) {
        const newImageAsset = await response.json();
        alert(`Keyframe converted to image asset: ${newImageAsset.title}`);
        setShowKeyframeModal(false);
      } else {
        alert('Failed to convert keyframe to image');
      }
    } catch (error) {
      console.error('Error converting keyframe:', error);
      alert('Error converting keyframe to image');
    }
  };

  const filteredVideos = selectedProject
    ? videos.filter(v => v.project_id === selectedProject)
    : videos;

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Video Analysis Dashboard</h1>
          <p className="text-gray-600">
            Analyze videos with GPT-4V, extract keyframes, and manage reusable assets
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Left Panel - Video List & Controls */}
          <div className="lg:col-span-1 space-y-6">
            {/* Project Filter */}
            <Card className="p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Filter by Project
              </label>
              <select
                value={selectedProject}
                onChange={(e) => setSelectedProject(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </Card>

            {/* Analysis Configuration */}
            <Card className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Analysis Settings</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Analysis Type
                  </label>
                  <select
                    value={analysisType}
                    onChange={(e) => setAnalysisType(e.target.value as any)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="comprehensive">Comprehensive Analysis</option>
                    <option value="style_focus">Style & Aesthetics Focus</option>
                    <option value="mood_themes">Mood & Themes Focus</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Keyframe Strategy
                  </label>
                  <select
                    value={keyframeStrategy}
                    onChange={(e) => setKeyframeStrategy(e.target.value as any)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="adaptive">Adaptive (Smart Defaults)</option>
                    <option value="uniform">Uniform Distribution</option>
                    <option value="scene_change">Scene Change Detection</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
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
            </Card>

            {/* Video List */}
            <Card className="p-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Videos ({filteredVideos.length})
              </h3>

              <div className="space-y-3 max-h-96 overflow-y-auto">
                {filteredVideos.map((video) => (
                  <div
                    key={video.id}
                    className={`p-3 border rounded-md cursor-pointer transition-colors ${
                      selectedVideo?.id === video.id
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedVideo(video)}
                  >
                    <div className="font-medium text-gray-900 truncate">{video.title}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatDuration(video.metadata.duration)} • {formatFileSize(video.metadata.file_size)}
                    </div>
                    <div className="flex gap-2 mt-2">
                      {video.processing_status.ai_labeling === 'completed' && (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                          Analyzed
                        </span>
                      )}
                      {video.keyframe_stills && video.keyframe_stills.length > 0 && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
                          {video.keyframe_stills.length} Keyframes
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {filteredVideos.length === 0 && (
                  <div className="text-center text-gray-500 py-8">
                    No videos found. Upload videos from the Media Labeling page.
                  </div>
                )}
              </div>
            </Card>
          </div>

          {/* Right Panel - Video Analysis Results */}
          <div className="lg:col-span-2 space-y-6">
            {selectedVideo ? (
              <>
                {/* Video Details */}
                <Card className="p-6">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">{selectedVideo.title}</h2>
                      <p className="text-gray-600 mt-1">
                        {selectedVideo.metadata.width}×{selectedVideo.metadata.height} • {formatDuration(selectedVideo.metadata.duration)} • {selectedVideo.metadata.format}
                      </p>
                    </div>
                    <Button
                      onClick={() => triggerVideoAnalysis(selectedVideo.id)}
                      disabled={isAnalyzing}
                      className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
                    >
                      {isAnalyzing ? 'Analyzing...' : 'Analyze Video'}
                    </Button>
                  </div>

                  {/* Video Player */}
                  <div className="mb-6">
                    <video
                      controls
                      className="w-full max-w-2xl mx-auto rounded-lg shadow-lg"
                      poster={selectedVideo.keyframe_stills?.[0]?.cloudflare_url}
                    >
                      <source src={selectedVideo.cloudflare_url} type="video/mp4" />
                      Your browser does not support the video tag.
                    </video>
                  </div>

                  {/* Analysis Progress */}
                  {analysisProgress && (
                    <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="flex items-center">
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                        <span className="text-blue-800">{analysisProgress}</span>
                      </div>
                    </div>
                  )}
                </Card>

                {/* AI Analysis Results */}
                {selectedVideo.ai_labels && (
                  <Card className="p-6">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">AI Analysis Results</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Scenes</h4>
                        <div className="space-y-1">
                          {selectedVideo.ai_labels.scenes.map((scene, index) => (
                            <div key={index} className="text-sm text-gray-700 p-2 bg-gray-50 rounded">
                              {scene}
                            </div>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Objects</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedVideo.ai_labels.objects.map((object, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full"
                            >
                              {object}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Style</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedVideo.ai_labels.style.map((style, index) => (
                            <span
                              key={index}
                              className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full"
                            >
                              {style}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">Mood & Themes</h4>
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            {selectedVideo.ai_labels.mood.map((mood, index) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full"
                              >
                                {mood}
                              </span>
                            ))}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {selectedVideo.ai_labels.themes.map((theme, index) => (
                              <span
                                key={index}
                                className="px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full"
                              >
                                {theme}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Card>
                )}

                {/* Keyframe Timeline */}
                {selectedVideo.keyframe_stills && selectedVideo.keyframe_stills.length > 0 && (
                  <Card className="p-6">
                    <h3 className="text-xl font-semibold text-gray-900 mb-4">
                      Keyframe Timeline ({selectedVideo.keyframe_stills.length} frames)
                    </h3>

                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                      {selectedVideo.keyframe_stills.map((keyframe) => (
                        <div
                          key={keyframe.id}
                          className="cursor-pointer group"
                          onClick={() => openKeyframeModal(keyframe)}
                        >
                          <div className="relative">
                            <img
                              src={keyframe.cloudflare_url}
                              alt={`Keyframe at ${keyframe.timestamp}`}
                              className="w-full aspect-video object-cover rounded-lg shadow-md group-hover:shadow-lg transition-shadow"
                            />
                            <div className="absolute bottom-1 right-1 bg-black bg-opacity-75 text-white text-xs px-1 rounded">
                              {keyframe.timestamp}
                            </div>
                            {keyframe.reusable_as_image && (
                              <div className="absolute top-1 right-1 bg-green-500 text-white text-xs px-1 rounded">
                                Reusable
                              </div>
                            )}
                          </div>
                          <div className="mt-2 text-xs text-gray-600">
                            Quality: {keyframe.metadata.quality}/100
                          </div>
                          {keyframe.usage_tracking.times_reused > 0 && (
                            <div className="text-xs text-blue-600">
                              Reused {keyframe.usage_tracking.times_reused} times
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                )}
              </>
            ) : (
              <Card className="p-12 text-center">
                <div className="text-gray-500">
                  <div className="text-4xl mb-4">🎬</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Video</h3>
                  <p>Choose a video from the list to view analysis results and keyframes</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Keyframe Modal */}
      {showKeyframeModal && selectedKeyframe && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-start mb-4">
                <h3 className="text-xl font-semibold">Keyframe Details</h3>
                <button
                  onClick={() => setShowKeyframeModal(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div>
                  <img
                    src={selectedKeyframe.cloudflare_url}
                    alt={`Keyframe at ${selectedKeyframe.timestamp}`}
                    className="w-full rounded-lg shadow-lg"
                  />
                </div>

                <div className="space-y-4">
                  <div>
                    <h4 className="font-medium text-gray-900 mb-2">Metadata</h4>
                    <div className="space-y-1 text-sm text-gray-600">
                      <div>Timestamp: {selectedKeyframe.timestamp}</div>
                      <div>Frame: #{selectedKeyframe.frame_number}</div>
                      <div>Quality: {selectedKeyframe.metadata.quality}/100</div>
                      <div>Resolution: {selectedKeyframe.metadata.resolution.width}×{selectedKeyframe.metadata.resolution.height}</div>
                      <div>Reused: {selectedKeyframe.usage_tracking.times_reused} times</div>
                    </div>
                  </div>

                  {selectedKeyframe.ai_labels && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">AI Labels</h4>
                      <div className="space-y-2">
                        {selectedKeyframe.ai_labels.scenes.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-gray-700">Scenes:</div>
                            <div className="text-sm text-gray-600">
                              {selectedKeyframe.ai_labels.scenes.join(', ')}
                            </div>
                          </div>
                        )}
                        {selectedKeyframe.ai_labels.objects.length > 0 && (
                          <div>
                            <div className="text-sm font-medium text-gray-700">Objects:</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedKeyframe.ai_labels.objects.map((obj, index) => (
                                <span
                                  key={index}
                                  className="px-2 py-1 bg-purple-100 text-purple-800 text-xs rounded-full"
                                >
                                  {obj}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedKeyframe.reusable_as_image && (
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Convert to Image Asset</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Convert this keyframe to a standalone image asset for reuse in other projects.
                      </p>
                      <select
                        className="w-full p-2 border border-gray-300 rounded-md mb-3"
                        onChange={(e) => {
                          if (e.target.value) {
                            convertKeyframeToImage(selectedKeyframe.id, e.target.value);
                          }
                        }}
                        defaultValue=""
                      >
                        <option value="">Select target project...</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
