'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';

interface KeyframeStill {
  id: string;
  parent_video_id: string;
  project_id: string | null;
  timestamp: string;
  frame_number: number;
  filename: string;
  title: string;
  s3_url: string;
  cloudflare_url: string;
  reusable_as_image: boolean;
  source_info: {
    video_filename: string;
    timestamp: string;
    frame_number: number;
    extraction_method: string;
  };
  metadata: {
    quality: number;
    resolution: { width: number; height: number };
    file_size: number;
    format: string;
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
    last_used: string | null;
  };
}

interface Project {
  id: string;
  name: string;
}

export default function KeyframeBrowserPage() {
  const [keyframes, setKeyframes] = useState<KeyframeStill[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKeyframe, setSelectedKeyframe] = useState<KeyframeStill | null>(null);
  const [showModal, setShowModal] = useState(false);

  // Filter states
  const [excludeProject, setExcludeProject] = useState('');
  const [minQuality, setMinQuality] = useState<number>(60);
  const [hasAiLabels, setHasAiLabels] = useState<boolean>(false);
  const [minResolution, setMinResolution] = useState<number>(512);

  useEffect(() => {
    fetchProjects();
    performSearch();
  }, []);

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

  const performSearch = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (searchQuery.trim()) params.append('q', searchQuery.trim());
      if (excludeProject) params.append('exclude_project', excludeProject);
      if (minQuality > 0) params.append('min_quality', minQuality.toString());
      if (hasAiLabels) params.append('has_ai_labels', 'true');
      if (minResolution > 0) {
        params.append('min_width', minResolution.toString());
        params.append('min_height', minResolution.toString());
      }

      const response = await fetch(`/api/media-labeling/keyframes/search?${params.toString()}`);
      if (response.ok) {
        const data = await response.json();
        setKeyframes(data.keyframes || []);
      } else {
        console.error('Search failed:', response.statusText);
        setKeyframes([]);
      }
    } catch (error) {
      console.error('Error searching keyframes:', error);
      setKeyframes([]);
    } finally {
      setLoading(false);
    }
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
          newTitle: `Reused: ${selectedKeyframe?.title}`,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        alert(`Keyframe successfully converted to image asset in project!`);
        setShowModal(false);
        // Refresh search to update usage tracking
        performSearch();
      } else {
        alert('Failed to convert keyframe to image');
      }
    } catch (error) {
      console.error('Error converting keyframe:', error);
      alert('Error converting keyframe to image');
    }
  };

  const openKeyframeModal = (keyframe: KeyframeStill) => {
    setSelectedKeyframe(keyframe);
    setShowModal(true);
  };

  const formatFileSize = (bytes: number): string => {
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    if (bytes === 0) return '0 Bytes';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Keyframe Browser</h1>
          <p className="text-gray-600">
            Discover and reuse keyframes from videos across all your projects
          </p>
        </div>

        {/* Search and Filters */}
        <Card className="p-6 mb-8">
          <div className="space-y-4">
            {/* Search Bar */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Search Keyframes
              </label>
              <div className="flex gap-3">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by title, video filename, scenes, objects, themes..."
                  className="flex-1 p-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  onKeyPress={(e) => e.key === 'Enter' && performSearch()}
                />
                <Button
                  onClick={performSearch}
                  disabled={loading}
                  className="px-6"
                >
                  {loading ? 'Searching...' : 'Search'}
                </Button>
              </div>
            </div>

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Exclude Project
                </label>
                <select
                  value={excludeProject}
                  onChange={(e) => setExcludeProject(e.target.value)}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Include all projects</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      Exclude: {project.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Quality: {minQuality}
                </label>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={minQuality}
                  onChange={(e) => setMinQuality(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Min Resolution: {minResolution}px
                </label>
                <input
                  type="range"
                  min="0"
                  max="2048"
                  step="128"
                  value={minResolution}
                  onChange={(e) => setMinResolution(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="hasAiLabels"
                  checked={hasAiLabels}
                  onChange={(e) => setHasAiLabels(e.target.checked)}
                  className="mr-2"
                />
                <label htmlFor="hasAiLabels" className="text-sm font-medium text-gray-700">
                  Has AI Labels Only
                </label>
              </div>
            </div>

            <Button
              onClick={performSearch}
              variant="outline"
              className="w-full"
              disabled={loading}
            >
              Apply Filters
            </Button>
          </div>
        </Card>

        {/* Results Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            {loading ? 'Searching...' : `Found ${keyframes.length} reusable keyframes`}
          </h2>
          {keyframes.length > 0 && (
            <div className="text-sm text-gray-600">
              Total reuses: {keyframes.reduce((sum, k) => sum + k.usage_tracking.times_reused, 0)}
            </div>
          )}
        </div>

        {/* Keyframes Grid */}
        {loading ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-4">⏳</div>
            <div className="text-lg text-gray-600">Searching keyframes...</div>
          </div>
        ) : keyframes.length === 0 ? (
          <Card className="p-12 text-center">
            <div className="text-gray-500">
              <div className="text-4xl mb-4">🔍</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No keyframes found</h3>
              <p>Try adjusting your search terms or filters</p>
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {keyframes.map((keyframe) => (
                             <div
                 key={keyframe.id}
                 className="cursor-pointer hover:shadow-lg transition-shadow group"
                 onClick={() => openKeyframeModal(keyframe)}
               >
                 <Card>
                <div className="relative">
                  <img
                    src={keyframe.cloudflare_url}
                    alt={keyframe.title}
                    className="w-full aspect-video object-cover rounded-t-lg"
                  />

                  {/* Quality Badge */}
                  <div className="absolute top-2 left-2 bg-white bg-opacity-90 text-xs px-2 py-1 rounded">
                    Q: {keyframe.metadata.quality}
                  </div>

                  {/* Timestamp */}
                  <div className="absolute bottom-2 right-2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded">
                    {keyframe.timestamp}
                  </div>

                  {/* Usage Badge */}
                  {keyframe.usage_tracking.times_reused > 0 && (
                    <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs px-2 py-1 rounded">
                      ↻ {keyframe.usage_tracking.times_reused}
                    </div>
                  )}
                </div>

                <div className="p-4">
                  <h3 className="font-semibold text-gray-900 mb-1 truncate">
                    {keyframe.title}
                  </h3>

                  <p className="text-sm text-gray-600 mb-2 truncate">
                    From: {keyframe.source_info.video_filename}
                  </p>

                  <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
                    <span>{keyframe.metadata.resolution.width}×{keyframe.metadata.resolution.height}</span>
                    <span>{formatFileSize(keyframe.metadata.file_size)}</span>
                  </div>

                  {/* AI Labels Preview */}
                  {keyframe.ai_labels && (
                    <div className="space-y-1">
                      {keyframe.ai_labels.mood.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {keyframe.ai_labels.mood.slice(0, 2).map((mood) => (
                            <span
                              key={mood}
                              className="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded"
                            >
                              {mood}
                            </span>
                          ))}
                        </div>
                      )}

                      {keyframe.ai_labels.objects.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {keyframe.ai_labels.objects.slice(0, 3).map((object) => (
                            <span
                              key={object}
                              className="text-xs bg-green-100 text-green-800 px-1.5 py-0.5 rounded"
                            >
                              {object}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Card>
              </div>
            ))}
          </div>
        )}

        {/* Keyframe Detail Modal */}
        {showModal && selectedKeyframe && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-xl font-semibold">Keyframe Details</h3>
                  <button
                    onClick={() => setShowModal(false)}
                    className="text-gray-400 hover:text-gray-600 text-2xl"
                  >
                    ×
                  </button>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <img
                      src={selectedKeyframe.cloudflare_url}
                      alt={selectedKeyframe.title}
                      className="w-full rounded-lg shadow-lg"
                    />
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Basic Info</h4>
                      <div className="space-y-2 text-sm">
                        <div><strong>Title:</strong> {selectedKeyframe.title}</div>
                        <div><strong>Source Video:</strong> {selectedKeyframe.source_info.video_filename}</div>
                        <div><strong>Timestamp:</strong> {selectedKeyframe.timestamp}</div>
                        <div><strong>Quality:</strong> {selectedKeyframe.metadata.quality}/100</div>
                        <div><strong>Resolution:</strong> {selectedKeyframe.metadata.resolution.width}×{selectedKeyframe.metadata.resolution.height}</div>
                        <div><strong>File Size:</strong> {formatFileSize(selectedKeyframe.metadata.file_size)}</div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Usage Tracking</h4>
                      <div className="space-y-2 text-sm">
                        <div><strong>Times Reused:</strong> {selectedKeyframe.usage_tracking.times_reused}</div>
                        <div><strong>Projects Used In:</strong> {selectedKeyframe.usage_tracking.projects_used_in.length}</div>
                        {selectedKeyframe.usage_tracking.last_used && (
                          <div><strong>Last Used:</strong> {new Date(selectedKeyframe.usage_tracking.last_used).toLocaleDateString()}</div>
                        )}
                      </div>
                    </div>

                    {selectedKeyframe.ai_labels && (
                      <div>
                        <h4 className="font-medium text-gray-900 mb-2">AI Analysis</h4>
                        <div className="space-y-3 text-sm">
                          {selectedKeyframe.ai_labels.scenes.length > 0 && (
                            <div>
                              <strong>Scenes:</strong>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {selectedKeyframe.ai_labels.scenes.map((scene) => (
                                  <span key={scene} className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-xs">
                                    {scene}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {selectedKeyframe.ai_labels.objects.length > 0 && (
                            <div>
                              <strong>Objects:</strong>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {selectedKeyframe.ai_labels.objects.map((object) => (
                                  <span key={object} className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs">
                                    {object}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {selectedKeyframe.ai_labels.mood.length > 0 && (
                            <div>
                              <strong>Mood:</strong>
                              <div className="flex flex-wrap gap-1 mt-1">
                                {selectedKeyframe.ai_labels.mood.map((mood) => (
                                  <span key={mood} className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">
                                    {mood}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div>
                      <h4 className="font-medium text-gray-900 mb-2">Convert to Image Asset</h4>
                      <p className="text-sm text-gray-600 mb-3">
                        Reuse this keyframe as a standalone image asset in a project.
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
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
