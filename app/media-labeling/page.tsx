'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

interface MediaAsset {
  id: string;
  filename: string;
  s3_url: string;
  cloudflare_url: string;
  title: string;
  media_type: 'image' | 'video' | 'audio';
  metadata: any;
  ai_labels: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
    confidence_scores: Record<string, number[]>;
  };
  manual_labels: {
    scenes: string[];
    objects: string[];
    style: string[];
    mood: string[];
    themes: string[];
    custom_tags: string[];
  };
  processing_status: {
    upload: 'pending' | 'completed' | 'error';
    metadata_extraction: 'pending' | 'completed' | 'error';
    ai_labeling: 'pending' | 'completed' | 'error';
    manual_review: 'pending' | 'completed' | 'error';
  };
  timestamps: {
    uploaded: string;
    metadata_extracted: string | null;
    labeled_ai: string | null;
    labeled_reviewed: string | null;
  };
  labeling_complete: boolean;
  project_id: string | null;
  created_at: string;
  updated_at: string;
  // Audio-specific fields
  lyrics?: string;
  prompt?: string;
  cover_art?: {
    s3_url: string;
    cloudflare_url: string;
    key: string;
  };
}

interface Project {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  asset_counts: {
    total: number;
    images: number;
    videos: number;
    audios: number;
  };
}

const MEDIA_TYPES = ['image', 'video', 'audio'] as const;

function encodePath(url: string) {
  try {
    const u = new URL(url);
    if (/%[0-9A-Fa-f]{2}/.test(u.pathname)) {
      return u.toString();
    }
    u.pathname = u.pathname
      .split('/')
      .map(part => encodeURIComponent(part))
      .join('/');
    return u.toString();
  } catch {
    return url;
  }
}

export default function MediaLabelingPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>('');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [showCompleteOnly, setShowCompleteOnly] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAILabeling, setIsAILabeling] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  // Load assets and projects
  useEffect(() => {
    loadAssets();
    loadProjects();
  }, []);

  // Reset AI labeling state when switching between assets
  useEffect(() => {
    setIsAILabeling(false);
  }, [selectedAsset]);

  const loadAssets = async () => {
    try {
      const params = new URLSearchParams();
      if (mediaTypeFilter) params.append('type', mediaTypeFilter);
      if (projectFilter) params.append('project', projectFilter);

      const response = await fetch(`/api/media-labeling/assets?${params}`);
      const data = await response.json();
      setAssets(data);
    } catch (error) {
      console.error('Error loading assets:', error);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/media-labeling/projects');
      const data = await response.json();
      setProjects(data);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  // Filter assets based on search and filters
  const filteredAssets = useMemo(() => {
    return assets.filter(asset => {
      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch =
          asset.title.toLowerCase().includes(searchLower) ||
          asset.filename.toLowerCase().includes(searchLower) ||
          asset.manual_labels.custom_tags.some(tag => tag.toLowerCase().includes(searchLower)) ||
          asset.manual_labels.style.some(style => style.toLowerCase().includes(searchLower)) ||
          asset.manual_labels.mood.some(mood => mood.toLowerCase().includes(searchLower)) ||
          asset.manual_labels.themes.some(theme => theme.toLowerCase().includes(searchLower)) ||
          (asset.media_type === 'audio' && asset.lyrics && asset.lyrics.toLowerCase().includes(searchLower)) ||
          (asset.media_type === 'audio' && asset.prompt && asset.prompt.toLowerCase().includes(searchLower));

        if (!matchesSearch) return false;
      }

      // Media type filter
      if (mediaTypeFilter && asset.media_type !== mediaTypeFilter) return false;

      // Project filter
      if (projectFilter && asset.project_id !== projectFilter) return false;

      // Complete only filter
      if (showCompleteOnly && !asset.labeling_complete) return false;

      return true;
    });
  }, [assets, searchTerm, mediaTypeFilter, projectFilter, showCompleteOnly]);

  // Create new project
  const createProject = async () => {
    if (!newProjectName.trim()) return;

    try {
      const response = await fetch('/api/media-labeling/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newProjectName,
          description: newProjectDescription
        })
      });

      if (response.ok) {
        const newProject = await response.json();
        setProjects([...projects, newProject]);
        setNewProjectName('');
        setNewProjectDescription('');
        setShowCreateProject(false);
      }
    } catch (error) {
      console.error('Error creating project:', error);
    }
  };

  const runAILabeling = async (assetId: string) => {
    setIsAILabeling(true);
    try {
      const response = await fetch('/api/media-labeling/images/ai-label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assetId })
      });

      if (response.ok) {
        const result = await response.json();
        console.log('AI labeling successful:', result);
        // Refresh the asset data
        await loadAssets();
        // Update selected asset if it's the one we just processed
        if (selectedAsset?.id === assetId) {
          const updatedAsset = assets.find(a => a.id === assetId);
          if (updatedAsset) setSelectedAsset(updatedAsset);
        }
      } else {
        const error = await response.json();
        console.error('AI labeling failed:', error);
      }
    } catch (error) {
      console.error('Error running AI labeling:', error);
    } finally {
      setIsAILabeling(false);
    }
  };

  // Get asset icon based on type
  const getAssetIcon = (asset: MediaAsset) => {
    switch (asset.media_type) {
      case 'image': return '🖼️';
      case 'video': return '🎬';
      case 'audio': return '🎵';
      default: return '📄';
    }
  };

  // Get asset display info
  const getAssetDisplayInfo = (asset: MediaAsset) => {
    switch (asset.media_type) {
      case 'audio':
        const primaryGenre = asset.manual_labels.style.find(s => s) ||
                            asset.ai_labels.style.find(s => s) || 'Unknown Genre';
        return {
          primaryLabel: primaryGenre,
          secondaryInfo: `${Math.round((asset.metadata.duration || 0) / 60)}:${String(Math.round((asset.metadata.duration || 0) % 60)).padStart(2, '0')} | ${asset.metadata.artist || 'Unknown Artist'}`
        };
      case 'image':
        return {
          primaryLabel: asset.manual_labels.style.find(s => s) || 'Image',
          secondaryInfo: `${asset.metadata.width}×${asset.metadata.height} | ${asset.metadata.format || 'Unknown'}`
        };
      case 'video':
        return {
          primaryLabel: asset.manual_labels.style.find(s => s) || 'Video',
          secondaryInfo: `${Math.round((asset.metadata.duration || 0) / 60)}:${String(Math.round((asset.metadata.duration || 0) % 60)).padStart(2, '0')} | ${asset.metadata.format || 'Unknown'}`
        };
      default:
        return {
          primaryLabel: 'Unknown',
          secondaryInfo: 'Unknown format'
        };
    }
  };

  if (assets.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <h1 className="text-3xl font-bold mb-6">Media Labeling System</h1>
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">No media assets found. Upload some files to get started.</p>
          <Button
            onClick={() => setIsUploading(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            + Upload Media
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header with Search and Filters */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-4">Media Labeling System</h1>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="Search assets, titles, tags, lyrics..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Media Type Filter */}
          <div>
            <select
              value={mediaTypeFilter}
              onChange={(e) => {
                setMediaTypeFilter(e.target.value);
                loadAssets();
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All Media</option>
              <option value="audio">🎵 Audio</option>
              <option value="image">🖼️ Images</option>
              <option value="video">🎬 Videos</option>
            </select>
          </div>

          {/* Project Filter */}
          <div>
            <select
              value={projectFilter}
              onChange={(e) => {
                setProjectFilter(e.target.value);
                loadAssets();
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="">All Projects</option>
              {projects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>

          {/* Complete Filter */}
          <div className="flex items-center">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={showCompleteOnly}
                onChange={(e) => setShowCompleteOnly(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm">Complete Only</span>
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center space-x-2">
            <Button
              onClick={() => setShowCreateProject(true)}
              className="px-3 py-1 text-sm bg-purple-600 hover:bg-purple-700"
            >
              + Project
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Asset List */}
        <div className="lg:col-span-1">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              Assets ({filteredAssets.length}/{assets.length})
            </h2>
            <div className="flex items-center space-x-2">
              <div className="text-sm text-gray-500">
                {assets.filter(a => a.labeling_complete).length} complete
              </div>
              <Button
                onClick={() => setIsUploading(true)}
                className={`px-3 py-1 text-sm ${isUploading ? 'bg-gray-400' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {isUploading ? 'Uploading...' : '+ Upload'}
              </Button>
            </div>
          </div>

          <div className="space-y-2 max-h-96 overflow-y-auto">
            {filteredAssets.map((asset) => {
              const displayInfo = getAssetDisplayInfo(asset);
              return (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 ${
                    selectedAsset?.id === asset.id
                      ? 'bg-blue-50 border-blue-300 shadow-md'
                      : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">{getAssetIcon(asset)}</span>
                        <div className="text-sm font-medium truncate">{asset.title}</div>
                      </div>
                      <div className="text-xs text-gray-500 truncate">{asset.filename}</div>
                      <div className="text-xs text-blue-600 mt-1">
                        {displayInfo.primaryLabel}
                      </div>
                      <div className="text-xs text-gray-400 mt-1">
                        {displayInfo.secondaryInfo}
                      </div>
                      {asset.manual_labels.mood.length > 0 && (
                        <div className="text-xs text-purple-600 mt-1">
                          {asset.manual_labels.mood.slice(0, 2).join(', ')}
                          {asset.manual_labels.mood.length > 2 && '...'}
                        </div>
                      )}
                    </div>
                    <div className="ml-2 flex flex-col items-end space-y-1">
                      {asset.labeling_complete && (
                        <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800">✓</span>
                      )}
                      {asset.cover_art && (
                        <span className="text-xs text-gray-400">🖼️</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2">
          {selectedAsset ? (
            <div className="space-y-6 max-h-screen overflow-y-auto">
              {/* Image Gallery Card */}
              {selectedAsset.media_type === 'image' ? (
                <Card className="overflow-hidden">
                  {/* Image Section */}
                  <div className="relative bg-gradient-to-br from-gray-50 to-gray-100 py-12">
                    <div className="flex justify-center">
                      {(selectedAsset.cloudflare_url || selectedAsset.s3_url) ? (
                        <div className="relative group">
                          <img
                            src={encodePath(selectedAsset.cloudflare_url || selectedAsset.s3_url)}
                            alt={selectedAsset.title}
                            className="w-80 h-80 object-cover rounded-xl shadow-xl transition-transform group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-10 rounded-xl transition-all duration-200"></div>
                        </div>
                      ) : (
                        <div className="w-80 h-80 bg-gray-200 rounded-xl flex items-center justify-center">
                          <span className="text-gray-400 text-lg">No preview available</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Content Section */}
                  <div className="p-8">
                    {/* Header */}
                    <div className="flex justify-between items-start mb-8">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-3">
                          <span className="text-3xl">🖼️</span>
                          <h1 className="text-3xl font-bold text-gray-900">{selectedAsset.title}</h1>
                          {selectedAsset.labeling_complete && (
                            <span className="px-3 py-1 text-sm rounded-full bg-green-100 text-green-800 font-medium">
                              ✓ Complete
                            </span>
                          )}
                        </div>
                        <p className="text-gray-600 mb-2">{selectedAsset.filename}</p>
                        <div className="text-sm text-gray-500">
                          Created: {new Date(selectedAsset.created_at).toLocaleDateString()}
                        </div>
                      </div>

                      {/* Action Button */}
                      <Button
                        onClick={() => isAILabeling ? null : runAILabeling(selectedAsset.id)}
                        className={`px-6 py-3 text-sm font-medium ${
                          isAILabeling
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-purple-600 hover:bg-purple-700'
                        }`}
                      >
                        {isAILabeling ? '🤖 Analyzing...' : '🤖 AI Labels'}
                      </Button>
                    </div>

                    {/* Metadata */}
                    {selectedAsset.metadata && (
                      <div className="mb-8">
                        <h3 className="text-xl font-semibold text-gray-700 mb-4">Image Details</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <div className="text-sm text-gray-500 font-medium">Dimensions</div>
                            <div className="text-xl font-bold text-gray-900 mt-1">
                              {selectedAsset.metadata.width}×{selectedAsset.metadata.height}
                            </div>
                          </div>
                          <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <div className="text-sm text-gray-500 font-medium">Format</div>
                            <div className="text-xl font-bold text-gray-900 mt-1">
                              {selectedAsset.metadata.format?.toUpperCase() || 'Unknown'}
                            </div>
                          </div>
                          <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <div className="text-sm text-gray-500 font-medium">File Size</div>
                            <div className="text-xl font-bold text-gray-900 mt-1">
                              {Math.round((selectedAsset.metadata.file_size || 0) / 1024)} KB
                            </div>
                          </div>
                          <div className="text-center p-4 bg-gray-50 rounded-lg">
                            <div className="text-sm text-gray-500 font-medium">Ratio</div>
                            <div className="text-xl font-bold text-gray-900 mt-1">
                              {selectedAsset.metadata.aspect_ratio || '1:1'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* AI Labels */}
                    {selectedAsset.ai_labels && (
                      <div className="space-y-6">
                        <h3 className="text-xl font-semibold text-gray-700">AI Analysis</h3>

                        {/* Scene Description */}
                        {selectedAsset.ai_labels.scenes.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-gray-700 mb-3">Scene Description</h4>
                            <div className="bg-purple-50 border-l-4 border-purple-400 p-6 rounded-r-lg">
                              <p className="text-gray-700 leading-relaxed text-lg">
                                {selectedAsset.ai_labels.scenes[0]}
                              </p>
                            </div>
                          </div>
                        )}

                        {/* Label Categories */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {selectedAsset.ai_labels.objects.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-700 mb-3">Objects</h4>
                              <div className="flex flex-wrap gap-2">
                                {selectedAsset.ai_labels.objects.slice(0, 8).map((object, index) => (
                                  <span key={index} className="px-4 py-2 text-sm bg-blue-100 text-blue-800 rounded-full font-medium">
                                    {object}
                                  </span>
                                ))}
                                {selectedAsset.ai_labels.objects.length > 8 && (
                                  <span className="px-4 py-2 text-sm bg-gray-100 text-gray-600 rounded-full font-medium">
                                    +{selectedAsset.ai_labels.objects.length - 8} more
                                  </span>
                                )}
                              </div>
                            </div>
                          )}

                          {selectedAsset.ai_labels.style.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-700 mb-3">Style</h4>
                              <div className="flex flex-wrap gap-2">
                                {selectedAsset.ai_labels.style.map((style, index) => (
                                  <span key={index} className="px-4 py-2 text-sm bg-green-100 text-green-800 rounded-full font-medium">
                                    {style}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {selectedAsset.ai_labels.mood.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-700 mb-3">Mood</h4>
                              <div className="flex flex-wrap gap-2">
                                {selectedAsset.ai_labels.mood.map((mood, index) => (
                                  <span key={index} className="px-4 py-2 text-sm bg-yellow-100 text-yellow-800 rounded-full font-medium">
                                    {mood}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {selectedAsset.ai_labels.themes.length > 0 && (
                            <div>
                              <h4 className="font-semibold text-gray-700 mb-3">Themes</h4>
                              <div className="flex flex-wrap gap-2">
                                {selectedAsset.ai_labels.themes.map((theme, index) => (
                                  <span key={index} className="px-4 py-2 text-sm bg-orange-100 text-orange-800 rounded-full font-medium">
                                    {theme}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </Card>
              ) : (
                /* Audio Card - Keep existing layout */
                <Card className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl">{getAssetIcon(selectedAsset)}</span>
                      <h2 className="text-2xl font-bold">{selectedAsset.title}</h2>
                    </div>
                    <p className="text-gray-600">{selectedAsset.filename}</p>
                    <div className="text-sm text-gray-500 mt-2">
                      Type: {selectedAsset.media_type} |
                      Created: {new Date(selectedAsset.created_at).toLocaleDateString()}
                    </div>
                    {selectedAsset.labeling_complete && (
                      <span className="inline-block mt-2 px-3 py-1 text-sm rounded-full bg-green-100 text-green-800">
                        ✓ Labeling Complete
                      </span>
                    )}
                  </div>

                  {/* Preview */}
                  <div className="ml-4 flex flex-col items-end space-y-3">
                    {/* Edit Button */}
                    {selectedAsset.media_type === 'audio' && (
                      <Button
                        onClick={() => window.open(`/audio-labeling?song=${selectedAsset.id}`, '_blank')}
                        className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-700"
                      >
                        ✏️ Edit Labels
                      </Button>
                    )}



                    {/* Preview */}
                    <div>
                      {selectedAsset.media_type === 'audio' && selectedAsset.cover_art && (
                        <img
                          src={encodePath(selectedAsset.cover_art.cloudflare_url || selectedAsset.cover_art.s3_url)}
                          alt="Cover art"
                          className="w-32 h-32 object-cover rounded-lg shadow-md"
                        />
                      )}
                      {selectedAsset.media_type === 'video' && (
                        <div className="w-32 h-32 bg-gray-200 rounded-lg flex items-center justify-center">
                          <span className="text-4xl">🎬</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Media Player */}
                {selectedAsset.media_type === 'audio' && (
                  <div className="mb-4">
                    <audio key={selectedAsset.id} controls className="w-full">
                      <source src={encodePath(selectedAsset.s3_url)} type="audio/mpeg" />
                      <source src={encodePath(selectedAsset.cloudflare_url)} type="audio/mpeg" />
                      Your browser does not support the audio element.
                    </audio>
                  </div>
                )}

                {/* Prompt (for audio) */}
                {selectedAsset.media_type === 'audio' && selectedAsset.prompt && (
                  <div className="mb-4">
                    <h3 className="font-semibold text-gray-700 mb-2">Prompt:</h3>
                    <p className="text-sm text-gray-600 bg-amber-50 p-3 rounded-lg border-l-4 border-amber-400">
                      {selectedAsset.prompt}
                    </p>
                  </div>
                )}

                {/* Lyrics (for audio) */}
                {selectedAsset.media_type === 'audio' && selectedAsset.lyrics && (
                  <div className="mb-4">
                    <h3 className="font-semibold text-gray-700 mb-2">Lyrics:</h3>
                    <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-lg border-l-4 border-blue-400 max-h-32 overflow-y-auto whitespace-pre-wrap">
                      {selectedAsset.lyrics}
                    </div>
                  </div>
                )}

                {/* Metadata */}
                <div className="mb-4">
                  <h3 className="font-semibold text-gray-700 mb-2">Metadata:</h3>
                  <div className="text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                    {selectedAsset.media_type === 'audio' && (
                      <>
                        <div>Artist: {selectedAsset.metadata.artist || 'Unknown'}</div>
                        <div>Duration: {Math.round((selectedAsset.metadata.duration || 0) / 60)}:{String(Math.round((selectedAsset.metadata.duration || 0) % 60)).padStart(2, '0')}</div>
                        <div>Bitrate: {selectedAsset.metadata.bitrate || 'Unknown'}</div>
                        <div>Format: {selectedAsset.metadata.format || 'Unknown'}</div>
                      </>
                    )}

                  </div>
                </div>

                {/* AI Labels */}
                {selectedAsset.ai_labels && (
                  <div className="mb-4">
                    <h3 className="font-semibold text-gray-700 mb-2">AI-Generated Labels:</h3>
                    <div className="max-h-80 overflow-y-auto space-y-3 bg-purple-50 p-4 rounded-lg border-l-4 border-purple-400">
                      {selectedAsset.ai_labels.scenes.length > 0 && (
                        <div>
                          <h4 className="font-medium text-purple-700 text-sm mb-2">Scene Description:</h4>
                          <div className="space-y-2">
                            {selectedAsset.ai_labels.scenes.map((scene, index) => (
                              <div key={index} className="bg-purple-100 p-3 rounded text-sm text-purple-800 leading-relaxed">
                                {scene.length > 150 ? (
                                  <details className="cursor-pointer">
                                    <summary className="font-medium hover:text-purple-900">
                                      {scene.substring(0, 150)}...
                                    </summary>
                                    <div className="mt-2 pt-2 border-t border-purple-200">
                                      {scene}
                                    </div>
                                  </details>
                                ) : (
                                  scene
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {selectedAsset.ai_labels.objects.length > 0 && (
                          <div>
                            <h4 className="font-medium text-purple-700 text-sm">Objects:</h4>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedAsset.ai_labels.objects.slice(0, 8).map((object, index) => (
                                <span key={index} className="px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded">
                                  {object}
                                </span>
                              ))}
                              {selectedAsset.ai_labels.objects.length > 8 && (
                                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded">
                                  +{selectedAsset.ai_labels.objects.length - 8} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {selectedAsset.ai_labels.style.length > 0 && (
                          <div>
                            <h4 className="font-medium text-purple-700 text-sm">Style:</h4>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedAsset.ai_labels.style.map((style, index) => (
                                <span key={index} className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                                  {style}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedAsset.ai_labels.mood.length > 0 && (
                          <div>
                            <h4 className="font-medium text-purple-700 text-sm">Mood:</h4>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedAsset.ai_labels.mood.map((mood, index) => (
                                <span key={index} className="px-2 py-1 text-xs bg-yellow-100 text-yellow-800 rounded">
                                  {mood}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedAsset.ai_labels.themes.length > 0 && (
                          <div>
                            <h4 className="font-medium text-purple-700 text-sm">Themes:</h4>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedAsset.ai_labels.themes.map((theme, index) => (
                                <span key={index} className="px-2 py-1 text-xs bg-orange-100 text-orange-800 rounded">
                                  {theme}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Labels */}
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-700">Labels:</h3>

                  {/* Style/Genre */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {selectedAsset.media_type === 'audio' ? 'Genre/Style:' : 'Style:'}
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {selectedAsset.manual_labels.style.map((style, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800"
                        >
                          {style}
                        </span>
                      ))}
                      {selectedAsset.manual_labels.style.length === 0 && (
                        <span className="text-sm text-gray-400">No styles labeled</span>
                      )}
                    </div>
                  </div>

                  {/* Mood */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Mood:</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedAsset.manual_labels.mood.map((mood, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800"
                        >
                          {mood}
                        </span>
                      ))}
                      {selectedAsset.manual_labels.mood.length === 0 && (
                        <span className="text-sm text-gray-400">No moods labeled</span>
                      )}
                    </div>
                  </div>

                  {/* Themes */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Themes:</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedAsset.manual_labels.themes.map((theme, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800"
                        >
                          {theme}
                        </span>
                      ))}
                      {selectedAsset.manual_labels.themes.length === 0 && (
                        <span className="text-sm text-gray-400">No themes labeled</span>
                      )}
                    </div>
                  </div>

                  {/* Custom Tags */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Custom Tags:</label>
                    <div className="flex flex-wrap gap-2">
                      {selectedAsset.manual_labels.custom_tags.map((tag, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-800"
                        >
                          {tag}
                        </span>
                      ))}
                      {selectedAsset.manual_labels.custom_tags.length === 0 && (
                        <span className="text-sm text-gray-400">No custom tags</span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
              )}
            </div>
          ) : (
            <div className="text-center py-8">
              <div className="text-6xl mb-4">🎵🖼️🎬</div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">Select a Media Asset</h3>
              <p className="text-gray-500">Choose an asset from the list to view details and labels.</p>
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {isUploading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">Upload Media</h2>
              <Button
                onClick={() => setIsUploading(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </Button>
            </div>

            <UploadModal
              onClose={() => setIsUploading(false)}
              projects={projects}
              onUploadComplete={() => {
                loadAssets();
                loadProjects();
              }}
            />
          </div>
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateProject && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h2 className="text-xl font-bold mb-4">Create New Project</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Project Name</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Enter project name..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">Description (optional)</label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Enter project description..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex space-x-3">
                <Button
                  onClick={() => setShowCreateProject(false)}
                  className="flex-1 px-4 py-2 bg-gray-500 hover:bg-gray-600"
                >
                  Cancel
                </Button>
                <Button
                  onClick={newProjectName.trim() ? createProject : undefined}
                  className={`flex-1 px-4 py-2 ${
                    newProjectName.trim()
                      ? 'bg-blue-600 hover:bg-blue-700'
                      : 'bg-gray-400 cursor-not-allowed'
                  }`}
                >
                  Create
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Upload Modal Component
interface UploadModalProps {
  onClose: () => void;
  projects: Project[];
  onUploadComplete: () => void;
}

interface UploadFile {
  file: File;
  id: string;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  error?: string;
  previewUrl?: string;
}

function UploadModal({ onClose, projects, onUploadComplete }: UploadModalProps) {
  const [uploadFiles, setUploadFiles] = useState<UploadFile[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Handle file selection
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newFiles: UploadFile[] = Array.from(files)
      .filter(file => {
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
          alert(`${file.name} is not a supported image format. Please upload JPEG, PNG, GIF, or WebP files.`);
          return false;
        }
        if (file.size > 50 * 1024 * 1024) { // 50MB limit
          alert(`${file.name} is too large. Maximum file size is 50MB.`);
          return false;
        }
        return true;
      })
      .map(file => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        progress: 0,
        status: 'pending' as const,
        previewUrl: URL.createObjectURL(file)
      }));

    setUploadFiles(prev => [...prev, ...newFiles]);
  };

  // Handle drag and drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    handleFileSelect(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  // Remove file from upload queue
  const removeFile = (id: string) => {
    setUploadFiles(prev => {
      const file = prev.find(f => f.id === id);
      if (file?.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
      }
      return prev.filter(f => f.id !== id);
    });
  };

  // Upload single file
  const uploadFile = async (uploadFile: UploadFile): Promise<void> => {
    const { file, id } = uploadFile;

    try {
      // Update status to uploading
      setUploadFiles(prev => prev.map(f =>
        f.id === id ? { ...f, status: 'uploading' as const } : f
      ));

      // Step 1: Get presigned URL
      const presignedResponse = await fetch('/api/media-labeling/images/get-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          fileSize: file.size
        }),
      });

      if (!presignedResponse.ok) {
        throw new Error('Failed to get upload URL');
      }

      const { uploadUrl, key } = await presignedResponse.json();

      // Step 2: Upload to S3 with progress tracking
      const xhr = new XMLHttpRequest();

      return new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const progress = Math.round((e.loaded / e.total) * 100);
            setUploadFiles(prev => prev.map(f =>
              f.id === id ? { ...f, progress } : f
            ));
          }
        });

        xhr.addEventListener('load', async () => {
          if (xhr.status === 200) {
            try {
              // Step 3: Complete upload and create asset record
              const completeResponse = await fetch('/api/media-labeling/images/finish-upload', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  key,
                  originalFilename: file.name,
                  projectId: selectedProject || null
                }),
              });

              if (!completeResponse.ok) {
                throw new Error('Failed to complete upload');
              }

              setUploadFiles(prev => prev.map(f =>
                f.id === id ? { ...f, status: 'completed' as const, progress: 100 } : f
              ));
              resolve();
            } catch (error) {
              reject(error);
            }
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });

        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed'));
        });

        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type);
        xhr.send(file);
      });

    } catch (error) {
      console.error('Upload error:', error);
      setUploadFiles(prev => prev.map(f =>
        f.id === id ? {
          ...f,
          status: 'error' as const,
          error: error instanceof Error ? error.message : 'Upload failed'
        } : f
      ));
      throw error;
    }
  };

  // Upload all files
  const uploadAllFiles = async () => {
    setIsUploading(true);

    try {
      // Upload files in batches of 3 to avoid overwhelming the server
      const batchSize = 3;
      const pendingFiles = uploadFiles.filter(f => f.status === 'pending');

      for (let i = 0; i < pendingFiles.length; i += batchSize) {
        const batch = pendingFiles.slice(i, i + batchSize);
        await Promise.allSettled(batch.map(uploadFile));
      }

      // Check if all uploads completed successfully
      const finalFiles = uploadFiles.filter(f => f.status !== 'pending');
      const completedCount = finalFiles.filter(f => f.status === 'completed').length;
      const errorCount = finalFiles.filter(f => f.status === 'error').length;

      if (completedCount > 0) {
        onUploadComplete();
        alert(`${completedCount} file(s) uploaded successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
      }

      if (errorCount === 0) {
        onClose();
      }

    } catch (error) {
      console.error('Batch upload error:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  };

  // Clean up preview URLs on unmount
  useEffect(() => {
    return () => {
      uploadFiles.forEach(file => {
        if (file.previewUrl) {
          URL.revokeObjectURL(file.previewUrl);
        }
      });
    };
  }, []);

  const pendingCount = uploadFiles.filter(f => f.status === 'pending').length;
  const completedCount = uploadFiles.filter(f => f.status === 'completed').length;
  const errorCount = uploadFiles.filter(f => f.status === 'error').length;

  return (
    <div className="space-y-6">
      {/* Project Selection */}
      <div>
        <label className="block text-sm font-medium mb-2">Assign to Project (optional)</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
        >
          <option value="">No Project</option>
          {projects.map(project => (
            <option key={project.id} value={project.id}>{project.name}</option>
          ))}
        </select>
      </div>

      {/* File Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
      >
        <div className="space-y-2">
          <div className="text-4xl">📁</div>
          <div className="text-lg font-medium">Drop images here or click to browse</div>
          <div className="text-sm text-gray-500">
            Supports JPEG, PNG, GIF, WebP up to 50MB each
          </div>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            id="file-upload"
          />
          <label
            htmlFor="file-upload"
            className="inline-block px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            Browse Files
          </label>
        </div>
      </div>

      {/* Upload Queue */}
      {uploadFiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">
              Upload Queue ({uploadFiles.length} files)
            </h3>
            <div className="text-sm text-gray-500">
              {completedCount} completed • {errorCount} errors • {pendingCount} pending
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {uploadFiles.map((uploadFile) => (
              <div
                key={uploadFile.id}
                className="flex items-center space-x-3 p-3 border rounded-lg"
              >
                {/* Preview */}
                {uploadFile.previewUrl && (
                  <img
                    src={uploadFile.previewUrl}
                    alt="Preview"
                    className="w-12 h-12 object-cover rounded"
                  />
                )}

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{uploadFile.file.name}</div>
                  <div className="text-xs text-gray-500">
                    {(uploadFile.file.size / (1024 * 1024)).toFixed(1)} MB
                  </div>

                  {/* Progress Bar */}
                  {uploadFile.status === 'uploading' && (
                    <div className="mt-1">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Uploading...</span>
                        <span>{uploadFile.progress}%</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1">
                        <div
                          className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                          style={{ width: `${uploadFile.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {uploadFile.status === 'error' && uploadFile.error && (
                    <div className="mt-1 text-xs text-red-600">{uploadFile.error}</div>
                  )}
                </div>

                {/* Status & Actions */}
                <div className="flex items-center space-x-2">
                  {uploadFile.status === 'completed' && (
                    <span className="text-green-600 text-sm">✓</span>
                  )}
                  {uploadFile.status === 'error' && (
                    <span className="text-red-600 text-sm">✗</span>
                  )}
                  {uploadFile.status === 'pending' && (
                    <Button
                      onClick={() => removeFile(uploadFile.id)}
                      className="text-gray-400 hover:text-red-600 text-sm"
                    >
                      ✕
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Upload Actions */}
          <div className="flex justify-between items-center pt-4 border-t">
            <Button
              onClick={isUploading ? undefined : () => setUploadFiles([])}
              className={`px-4 py-2 ${
                isUploading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gray-500 hover:bg-gray-600'
              }`}
            >
              Clear All
            </Button>
            <div className="flex space-x-3">
              <Button
                onClick={isUploading ? undefined : onClose}
                className={`px-4 py-2 ${
                  isUploading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gray-500 hover:bg-gray-600'
                }`}
              >
                Cancel
              </Button>
              <Button
                onClick={pendingCount > 0 && !isUploading ? uploadAllFiles : undefined}
                className={`px-4 py-2 ${
                  pendingCount > 0 && !isUploading
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-gray-400 cursor-not-allowed'
                }`}
              >
                {isUploading ? 'Uploading...' : `Upload ${pendingCount} Files`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
