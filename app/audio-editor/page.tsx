'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { COMPREHENSIVE_GENRES, COMPREHENSIVE_MOODS, COMPREHENSIVE_THEMES } from '@/lib/enhanced-music-analysis';

interface SongData {
  id: string;
  filename: string;
  s3_url?: string;
  cloudflare_url?: string;
  title?: string;
  prompt?: string;
  lyrics: string;
  project_id?: string | null;
  cover_art?: {
    s3_url: string;
    cloudflare_url: string;
    key: string;
  };
  auto_analysis: {
    enhanced_analysis: {
      primary_genre: string;
      styles: string[];
      energy_level: number;
      emotional_intensity: number;
      mood: string[];
      themes: string[];
      vocals: string;
      word_count: number;
      sentiment_score: number;
      prompt: string[]; // renamed from production_style
    };
    content_type: string;
    word_count: number;
    sentiment_score: number;
  };
  manual_labels: {
    primary_genre: string;
    styles: string[];
    energy_level: number;
    emotional_intensity: number;
    mood: string[];
    themes: string[];
    tempo: number;
    vocals: string;
    language: string;
    explicit: boolean;
    instrumental: boolean;
    // Custom fields for user additions
    custom_styles: string[];
    custom_moods: string[];
    custom_themes: string[];
  };
  created_at: string;
  updated_at: string;
  labeling_complete: boolean;
}

interface Project {
  id: string;
  name: string;
  description?: string;
}

const CDN_DOMAIN = process.env.NEXT_PUBLIC_CLOUDFRONT_DOMAIN || process.env.NEXT_PUBLIC_CDN || 'cdn.yourdomain.com';

function encodePath(url: string) {
  try {
    const u = new URL(url);
    // replace placeholder domain
    if (u.hostname === 'cdn.yourdomain.com' && CDN_DOMAIN) {
      u.hostname = CDN_DOMAIN;
    }
    // If already percent-encoded, leave as-is
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

export default function AudioEditorPage() {
  const [songs, setSongs] = useState<SongData[]>([]);
  const [selectedSong, setSelectedSong] = useState<SongData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [moodFilter, setMoodFilter] = useState('');
  const [showCompleteOnly, setShowCompleteOnly] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  // Form state for custom inputs
  const [customStyleInput, setCustomStyleInput] = useState('');
  const [customMoodInput, setCustomMoodInput] = useState('');
  const [customThemeInput, setCustomThemeInput] = useState('');

  // Search state for filtering options
  const [styleSearch, setStyleSearch] = useState('');
  const [moodSearch, setMoodSearch] = useState('');
  const [themeSearch, setThemeSearch] = useState('');

  // Form state for editable core fields
  const [editingTitle, setEditingTitle] = useState(false);
  const [editingPrompt, setEditingPrompt] = useState(false);
  const [editingLyrics, setEditingLyrics] = useState(false);
  const [tempTitle, setTempTitle] = useState('');
  const [tempPrompt, setTempPrompt] = useState('');
  const [tempLyrics, setTempLyrics] = useState('');

  // Upload state
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadError, setUploadError] = useState('');

  // Enhanced form options
  const primaryGenreOptions = Object.keys(COMPREHENSIVE_GENRES);
  // Deduplicate styles across genres to avoid duplicate React keys
  const allStyleOptions = Array.from(new Set(Object.values(COMPREHENSIVE_GENRES).flat())).sort();
  const vocalsOptions = ["male", "female", "both", "none"];

  useEffect(() => {
    loadSongs();
    loadProjects();
  }, []);

  // Filtered songs based on search and filters
  const filteredSongs = useMemo(() => {
    const visible = songs.filter(song => {
      const matchesSearch = !searchTerm ||
        song.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        song.filename.toLowerCase().includes(searchTerm.toLowerCase()) ||
        song.prompt?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        song.lyrics.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesGenre = !genreFilter ||
        song.manual_labels.primary_genre === genreFilter;

      const matchesMood = !moodFilter ||
        (song.manual_labels.mood && song.manual_labels.mood.includes(moodFilter)) ||
        (song.manual_labels.custom_moods && song.manual_labels.custom_moods.includes(moodFilter));

      const matchesComplete = !showCompleteOnly || song.labeling_complete;

      return matchesSearch && matchesGenre && matchesMood && matchesComplete;
    });

    // Alphabetical sort by title fallback filename
    return visible.sort((a, b) => {
      const aName = (a.title || a.filename).toLowerCase();
      const bName = (b.title || b.filename).toLowerCase();
      return aName.localeCompare(bName);
    });
  }, [songs, searchTerm, genreFilter, moodFilter, showCompleteOnly]);

  const loadSongs = async () => {
    try {
      const response = await fetch('/api/audio-labeling/songs');
      if (response.ok) {
        const songsData = await response.json();
        setSongs(songsData);
        // Check for asset parameter in URL
        const urlParams = new URLSearchParams(window.location.search);
        const assetId = urlParams.get('asset');
        if (assetId) {
          const targetSong = songsData.find((song: SongData) => song.id === assetId);
          if (targetSong) {
            setSelectedSong(targetSong);
          }
        } else if (songsData.length > 0 && !selectedSong) {
          setSelectedSong(songsData[0]);
        }
      }
    } catch (error) {
      console.error('Error loading songs:', error);
    }
  };

  const loadProjects = async () => {
    try {
      const response = await fetch('/api/media-labeling/projects');
      if (response.ok) {
        const projectsData = await response.json();
        setProjects(projectsData);
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  // Project assignment function
  const updateProjectAssignment = async (projectId: string | null) => {
    if (!selectedSong) return;

    try {
      const response = await fetch(`/api/audio-labeling/songs/${selectedSong.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId })
      });

      const result = await response.json();

      if (response.ok) {
        // Update the selected song with the new data
        setSelectedSong({...selectedSong, project_id: projectId});
        // Refresh the songs list to show updated project assignment
        await loadSongs();
      } else {
        throw new Error(result.error || 'Failed to update project assignment');
      }
    } catch (error) {
      console.error('Project assignment error:', error);
    }
  };

  const handleUpdateLabels = async (updates: Partial<SongData['manual_labels']>) => {
    if (!selectedSong) return;

    try {
      console.log('PATCH labels', updates);
      const response = await fetch(`/api/audio-labeling/songs/${selectedSong.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ manual_labels: updates }),
      });

      if (response.ok) {
        const updatedSong = await response.json();
        console.log('Updated song', updatedSong);
        setSongs(songs.map(s => s.id === selectedSong.id ? updatedSong : s));
        setSelectedSong(updatedSong);
      } else {
        console.error('Patch failed', await response.text());
      }
    } catch (error) {
      console.error('Error updating labels:', error);
    }
  };

  // Handle updating core song data (title, prompt, lyrics)
  const handleUpdateCoreData = async (updates: { title?: string; prompt?: string; lyrics?: string }) => {
    if (!selectedSong) return;

    try {
      const response = await fetch(`/api/audio-labeling/songs/${selectedSong.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (response.ok) {
        const updatedSong = await response.json();
        setSongs(songs.map(s => s.id === selectedSong.id ? updatedSong : s));
        setSelectedSong(updatedSong);
      }
    } catch (error) {
      console.error('Error updating core data:', error);
    }
  };

  // Functions for editing core fields
  const startEditingTitle = () => {
    setTempTitle(selectedSong?.title || '');
    setEditingTitle(true);
  };

  const startEditingPrompt = () => {
    setTempPrompt(selectedSong?.prompt || '');
    setEditingPrompt(true);
  };

  const startEditingLyrics = () => {
    setTempLyrics(selectedSong?.lyrics || '');
    setEditingLyrics(true);
  };

  const saveTitle = async () => {
    if (tempTitle.trim() !== (selectedSong?.title || '')) {
      await handleUpdateCoreData({ title: tempTitle.trim() });
    }
    setEditingTitle(false);
  };

  const savePrompt = async () => {
    if (tempPrompt.trim() !== (selectedSong?.prompt || '')) {
      await handleUpdateCoreData({ prompt: tempPrompt.trim() });
    }
    setEditingPrompt(false);
  };

  const saveLyrics = async () => {
    if (tempLyrics.trim() !== (selectedSong?.lyrics || '')) {
      await handleUpdateCoreData({ lyrics: tempLyrics.trim() });
    }
    setEditingLyrics(false);
  };

  const cancelEdit = () => {
    setEditingTitle(false);
    setEditingPrompt(false);
    setEditingLyrics(false);
    setTempTitle('');
    setTempPrompt('');
    setTempLyrics('');
  };

  const handleCoverArtUpload = async (file: File) => {
    if (!selectedSong) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('coverArt', file);

      const response = await fetch(`/api/audio-labeling/songs/${selectedSong.id}/cover-art`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Cover art upload success:', result);

        // Reload songs first to get fresh data
        const songsResponse = await fetch('/api/audio-labeling/songs');
        if (songsResponse.ok) {
          const songsData = await songsResponse.json();
          setSongs(songsData);

          // Find and update the selected song with fresh data from the reload
          const updatedSong = songsData.find((s: SongData) => s.id === selectedSong.id);
          if (updatedSong) {
            console.log('Updated selected song with fresh cover art:', updatedSong.cover_art);
            setSelectedSong(updatedSong);
          }
        }
      } else {
        const error = await response.text();
        console.error('Cover art upload failed:', error);
      }
    } catch (error) {
      console.error('Cover art upload error:', error);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCheckboxChange = (
    field: 'styles' | 'mood' | 'themes',
    value: string,
    checked: boolean
  ) => {
    if (!selectedSong) return;

    console.log('Checkbox change', { field, value, checked });

    const existing = selectedSong.manual_labels[field];
    const currentValues = Array.isArray(existing) ? existing : [];
    const newValues = checked
      ? Array.from(new Set([...currentValues, value]))
      : currentValues.filter(v => v !== value);

    handleUpdateLabels({ [field]: newValues });
  };

  const handleSliderChange = (field: 'energy_level' | 'emotional_intensity' | 'tempo', value: number) => {
    if (!selectedSong) return;
    handleUpdateLabels({ [field]: value });
  };

  const handleDropdownChange = (field: 'primary_genre' | 'vocals' | 'language', value: string) => {
    if (!selectedSong) return;
    handleUpdateLabels({ [field]: value });
  };

  const handleBooleanChange = (field: 'explicit' | 'instrumental', value: boolean) => {
    handleUpdateLabels({ [field]: value });
  };

  // Custom field handlers
  const addCustomStyle = () => {
    if (!selectedSong || !customStyleInput.trim()) return;
    const currentCustom = selectedSong.manual_labels.custom_styles || [];
    if (!currentCustom.includes(customStyleInput.trim())) {
      handleUpdateLabels({
        custom_styles: [...currentCustom, customStyleInput.trim()]
      });
    }
    setCustomStyleInput('');
  };

  const addCustomMood = () => {
    if (!selectedSong || !customMoodInput.trim()) return;
    const currentCustom = selectedSong.manual_labels.custom_moods || [];
    if (!currentCustom.includes(customMoodInput.trim())) {
      handleUpdateLabels({
        custom_moods: [...currentCustom, customMoodInput.trim()]
      });
    }
    setCustomMoodInput('');
  };

  const addCustomTheme = () => {
    if (!selectedSong || !customThemeInput.trim()) return;
    const currentCustom = selectedSong.manual_labels.custom_themes || [];
    if (!currentCustom.includes(customThemeInput.trim())) {
      handleUpdateLabels({
        custom_themes: [...currentCustom, customThemeInput.trim()]
      });
    }
    setCustomThemeInput('');
  };

  const removeCustomItem = (field: 'custom_styles' | 'custom_moods' | 'custom_themes', value: string) => {
    if (!selectedSong) return;
    const currentValues = selectedSong.manual_labels[field] || [];
    handleUpdateLabels({
      [field]: currentValues.filter(v => v !== value)
    });
  };

  // Combined lists for checkboxes (predefined + custom) with search filtering
  const getAllStyleOptions = (searchTerm: string = '') => {
    const predefined = allStyleOptions;
    const custom = selectedSong?.manual_labels.custom_styles || [];
    const allOptions = Array.from(new Set([...predefined, ...custom])).sort();

    if (!searchTerm) return allOptions;
    return allOptions.filter(style =>
      style.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const getAllMoodOptions = (searchTerm: string = '') => {
    const predefined = COMPREHENSIVE_MOODS;
    const custom = selectedSong?.manual_labels.custom_moods || [];
    const allOptions = Array.from(new Set([...predefined, ...custom])).sort();

    if (!searchTerm) return allOptions;
    return allOptions.filter(mood =>
      mood.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const getAllThemeOptions = (searchTerm: string = '') => {
    const predefined = COMPREHENSIVE_THEMES;
    const custom = selectedSong?.manual_labels.custom_themes || [];
    const allOptions = Array.from(new Set([...predefined, ...custom])).sort();

    if (!searchTerm) return allOptions;
    return allOptions.filter(theme =>
      theme.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  // Upload functions
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadError('');
    setUploadProgress(0);

    try {
      // Step 1: Get presigned URL
      setUploadProgress(10);
      const presignedResponse = await fetch('/api/audio-labeling/get-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: file.name,
          fileSize: file.size,
          title: file.name.replace(/\.[^/.]+$/, '') // Remove extension for title check
        }),
      });

      const presignedData = await presignedResponse.json();

      if (!presignedResponse.ok) {
        throw new Error(presignedData.error || 'Failed to get upload URL');
      }

      // Step 2: Upload directly to S3
      setUploadProgress(30);
      const uploadResponse = await fetch(presignedData.uploadUrl, {
        method: 'PUT',
        body: file,
        headers: {
          'Content-Type': 'audio/mpeg',
        },
      });

      if (!uploadResponse.ok) {
        throw new Error('Failed to upload file to S3');
      }

      // Step 3: Complete the upload (extract metadata and create song entry)
      setUploadProgress(80);
      const completeResponse = await fetch('/api/audio-labeling/finish-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          s3Url: presignedData.s3Url,
          cloudflareUrl: presignedData.cloudflareUrl,
          key: presignedData.key,
          originalFilename: file.name
        }),
      });

      const completeData = await completeResponse.json();

      if (!completeResponse.ok) {
        throw new Error(completeData.error || 'Failed to complete upload');
      }

      // Step 4: Success! Refresh songs and select the new one
      setUploadProgress(100);
      await loadSongs();
      const updatedSongs = await fetch('/api/audio-labeling/songs').then(r => r.json());
      setSongs(updatedSongs);

      // Find and select the newly uploaded song
      const newSong = updatedSongs.find((s: any) => s.id === completeData.song.id);
      if (newSong) {
        setSelectedSong(newSong);
      }

      setShowUploadModal(false);

    } catch (error) {
      setUploadError(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const closeUploadModal = () => {
    if (!isUploading) {
      setShowUploadModal(false);
      setUploadError('');
      setUploadProgress(0);
    }
  };

  if (!selectedSong) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-gray-600 mb-4">No audio selected.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {selectedSong && (
        <div className="space-y-6">
          {/* Song Info with Cover Art */}
          <Card className="p-6">
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                {/* Top Row: Title (edit) | Category Selector */}
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-4 flex-1">
                    {/* Title Section */}
                    {editingTitle ? (
                      <div className="flex items-center space-x-2 flex-1">
                        <span className="text-xl">🎵</span>
                        <input
                          type="text"
                          value={tempTitle}
                          onChange={(e) => setTempTitle(e.target.value)}
                          onKeyPress={(e) => e.key === 'Enter' && saveTitle()}
                          className="text-2xl font-bold border-b-2 border-blue-500 bg-transparent focus:outline-none flex-1"
                          autoFocus
                        />
                        <Button onClick={saveTitle} className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700">
                          ✓
                        </Button>
                        <Button onClick={cancelEdit} className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600">
                          ✕
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2 group flex-1">
                        <span className="text-xl">🎵</span>
                        <h2 className="text-2xl font-bold">{selectedSong.title}</h2>
                        <Button
                          onClick={startEditingTitle}
                          className="opacity-0 group-hover:opacity-100 px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700 transition-opacity"
                        >
                          edit
                        </Button>
                      </div>
                    )}

                    {/* Category Selector */}
                    <div className="flex items-center space-x-2">
                      <span className="text-sm text-gray-600 font-medium">Project:</span>
                      <select
                        value={selectedSong.project_id || ''}
                        onChange={(e) => updateProjectAssignment(e.target.value || null)}
                        className="border border-gray-300 rounded px-3 py-2 bg-white text-gray-700 text-sm focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">No Project</option>
                        {projects.map(project => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>

                  </div>
                </div>

                <p className="text-gray-600">{selectedSong.filename}</p>

                {selectedSong.labeling_complete && (
                  <span className="inline-block mt-2 px-3 py-1 text-sm rounded-full bg-green-100 text-green-800">
                    ✓ Labeling Complete
                  </span>
                )}
              </div>

              {/* Cover Art Section */}
              <div className="ml-4 text-center">
                {(() => {
                  console.log('Cover art check:', {
                    hasCoverArt: !!selectedSong.cover_art,
                    coverArtData: selectedSong.cover_art,
                    songId: selectedSong.id,
                    songTitle: selectedSong.title
                  });
                  return null;
                })()}
                {selectedSong.cover_art ? (
                  (() => {
                    const cf = selectedSong.cover_art.cloudflare_url;
                    const s3 = selectedSong.cover_art.s3_url;
                    const imgSrc = cf && !cf.includes('your-bucket') ? `${cf}?v=${Date.now()}` : s3;
                    return (
                  <div className="relative group">
                    <img
                      src={imgSrc}
                      alt="Cover art"
                      className="w-32 h-32 object-cover rounded-lg shadow-md"
                      onLoad={() => console.log('Cover art loaded successfully')}
                      onError={(e) => {
                        if (imgSrc !== s3) {
                          (e.currentTarget as HTMLImageElement).src = s3;
                        } else {
                          console.error('Cover art failed to load from both sources', e);
                        }
                      }}
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all duration-200 rounded-lg flex items-center justify-center">
                      <label className="opacity-0 group-hover:opacity-100 cursor-pointer bg-white text-gray-800 px-3 py-1 rounded-lg text-sm font-medium transition-all duration-200">
                        <span>Edit</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) handleCoverArtUpload(file);
                          }}
                          disabled={isUploading}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>
                    );
                  })()
                ) : (
                  <div className="w-32 h-32 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50 hover:bg-gray-100 transition-colors">
                    <label className="cursor-pointer text-center text-gray-500 hover:text-gray-700">
                      <div className="text-3xl mb-2">🖼️</div>
                      <div className="text-xs font-medium">Add Cover Art</div>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleCoverArtUpload(file);
                        }}
                        disabled={isUploading}
                        className="hidden"
                      />
                    </label>
                  </div>
                )}
                {isUploading && (
                  <div className="text-xs text-blue-600 mt-2">Uploading...</div>
                )}
              </div>
            </div>

            {/* Audio Player */}
            {selectedSong.cloudflare_url && (
              <div className="mb-4">
                <audio key={selectedSong.id} controls className="w-full">
                  {selectedSong.s3_url && (
                    <source src={encodePath(selectedSong.s3_url)} type="audio/mpeg" />
                  )}
                  <source src={encodePath(selectedSong.cloudflare_url)} type="audio/mpeg" />
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Production Prompt */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-gray-700">Prompt:</h3>
                {!editingPrompt && (
                  <Button
                    onClick={startEditingPrompt}
                    className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700"
                  >
                    Edit
                  </Button>
                )}
              </div>
              {editingPrompt ? (
                <div className="space-y-2">
                  <textarea
                    value={tempPrompt}
                    onChange={(e) => setTempPrompt(e.target.value)}
                    className="w-full p-3 border border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical min-h-[80px]"
                    placeholder="Enter production prompt/style description..."
                    autoFocus
                  />
                  <div className="flex space-x-2">
                    <Button onClick={savePrompt} className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700">
                      Save
                    </Button>
                    <Button onClick={cancelEdit} className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={`text-sm p-3 rounded-lg border-l-4 ${selectedSong.prompt ? 'text-gray-600 bg-amber-50 border-amber-400' : 'text-gray-400 bg-gray-50 border-gray-300'}`}>
                  {selectedSong.prompt || <em>No prompt provided - click Edit to add</em>}
                </div>
              )}
            </div>

            {/* Lyrics */}
            <div className="mb-4">
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-gray-700">Lyrics:</h3>
                {!editingLyrics && (
                  <Button
                    onClick={startEditingLyrics}
                    className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-700"
                  >
                    Edit
                  </Button>
                )}
              </div>
              {editingLyrics ? (
                <div className="space-y-2">
                  <textarea
                    value={tempLyrics}
                    onChange={(e) => setTempLyrics(e.target.value)}
                    className="w-full p-3 border border-blue-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-vertical min-h-[200px] font-mono text-sm"
                    placeholder="Enter song lyrics..."
                    autoFocus
                  />
                  <div className="flex space-x-2">
                    <Button onClick={saveLyrics} className="px-3 py-1 text-sm bg-green-600 hover:bg-green-700">
                      Save
                    </Button>
                    <Button onClick={cancelEdit} className="px-3 py-1 text-sm bg-gray-500 hover:bg-gray-600">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className={`text-sm p-3 rounded-lg max-h-40 overflow-y-auto whitespace-pre-wrap font-mono ${selectedSong.lyrics ? 'text-gray-600 bg-gray-50' : 'text-gray-400 bg-gray-50 border-2 border-dashed border-gray-300'}`}>
                  {selectedSong.lyrics || <em>No lyrics provided - click Edit to add</em>}
                </div>
              )}
            </div>

            {/* Manual Labels Summary */}
            <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border-l-4 border-green-400">
              <h3 className="font-semibold text-green-800 mb-3">🎵 Manual Labels Summary</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <strong>Primary Genre:</strong> <span className="text-green-700">
                    {selectedSong.manual_labels.primary_genre || <em className="text-gray-400">Not set</em>}
                  </span>
                  {(selectedSong.manual_labels.styles?.length > 0 || selectedSong.manual_labels.custom_styles?.length > 0) && (
                    <div className="text-xs text-gray-600 mt-1">
                      <strong>Styles:</strong>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {[
                          ...(selectedSong.manual_labels.styles || []),
                          ...(selectedSong.manual_labels.custom_styles || [])
                        ].map((style, index) => (
                          <span key={index} className="inline-block bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                            {style}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <strong>Vocals:</strong> <span className="text-purple-700">
                    {selectedSong.manual_labels.vocals || <em className="text-gray-400">Not set</em>}
                  </span>
                </div>
                <div>
                  <strong>Mood:</strong>
                  {(() => {
                    const allMoods = [
                      ...(selectedSong.manual_labels.mood || []),
                      ...(selectedSong.manual_labels.custom_moods || [])
                    ];
                    return allMoods.length > 0 ? (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {allMoods.map((mood, index) => (
                          <span key={index} className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                            {mood}
                          </span>
                        ))}
                      </div>
                    ) : <em className="text-gray-400">Not set</em>;
                  })()}
                </div>
                <div>
                  <strong>Energy/Intensity/Tempo:</strong> <span className="text-red-700">
                    {selectedSong.manual_labels.energy_level || 0}/10 • {selectedSong.manual_labels.emotional_intensity || 0}/10 • {selectedSong.manual_labels.tempo || 0}/10
                  </span>
                </div>
                {(() => {
                  const allThemes = [
                    ...(selectedSong.manual_labels.themes || []),
                    ...(selectedSong.manual_labels.custom_themes || [])
                  ];
                  return allThemes.length > 0 && (
                    <div className="md:col-span-2">
                      <strong>Themes:</strong>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {allThemes.map((theme, index) => (
                          <span key={index} className="inline-block bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
                            {theme}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <div className="md:col-span-2">
                  <strong>Labeling Status:</strong> {selectedSong.labeling_complete ? (
                    <span className="text-green-600 font-medium">✓ Complete</span>
                  ) : (
                    <span className="text-amber-600 font-medium">⚠ Incomplete</span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Manual Labeling Form */}
          <Card className="p-6">
            <h3 className="text-xl font-semibold mb-6">🎯 Manual Labels</h3>

            {/* Primary Genre & Styles */}
            <div className="mb-6">
              <h4 className="font-semibold mb-3 text-gray-800">Primary Genre & Styles</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Primary Genre</label>
                  <select
                    value={selectedSong.manual_labels.primary_genre}
                    onChange={(e) => handleDropdownChange('primary_genre', e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select Primary Genre</option>
                    {primaryGenreOptions.map(genre => (
                      <option key={genre} value={genre}>{genre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Vocals</label>
                  <select
                    value={selectedSong.manual_labels.vocals}
                    onChange={(e) => handleDropdownChange('vocals', e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    {vocalsOptions.map(option => (
                      <option key={option} value={option}>
                        {option.charAt(0).toUpperCase() + option.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="mt-4">
                <div className="flex justify-between items-center mb-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Styles ({(selectedSong.manual_labels.styles?.length || 0) + (selectedSong.manual_labels.custom_styles?.length || 0)} selected{styleSearch ? `, ${getAllStyleOptions(styleSearch).length} shown` : ''})
                  </label>
                  <div className="flex items-center space-x-2">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search styles..."
                        value={styleSearch}
                        onChange={(e) => setStyleSearch(e.target.value)}
                        onKeyDown={(e) => e.key === 'Escape' && setStyleSearch('')}
                        className="px-2 py-1 text-xs border border-gray-300 rounded bg-blue-50 pr-6"
                      />
                      {styleSearch && (
                        <button
                          onClick={() => setStyleSearch('')}
                          className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                          title="Clear search (Esc)"
                        >
                          ×
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      placeholder="Add custom style"
                      value={customStyleInput}
                      onChange={(e) => setCustomStyleInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && addCustomStyle()}
                      className="px-2 py-1 text-xs border border-gray-300 rounded"
                    />
                    <Button
                      onClick={addCustomStyle}
                      className="px-3 py-1 text-xs"
                    >
                      Add
                    </Button>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 max-h-48 overflow-y-auto border border-gray-200 p-4 rounded-lg bg-gray-50">
                  {getAllStyleOptions(styleSearch).map(style => {
                    const isCustom = selectedSong.manual_labels.custom_styles?.includes(style);
                    const isSelected = selectedSong.manual_labels.styles?.includes(style);
                    return (
                      <div key={style} className="flex items-center space-x-2 text-sm hover:bg-white rounded p-1 group">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => handleCheckboxChange('styles', style, e.target.checked)}
                          className="rounded"
                        />
                        <span className={`truncate flex-1 ${isCustom ? 'text-blue-600 font-medium' : ''}`}>
                          {style}
                        </span>
                        {isCustom && (
                          <button
                            onClick={() => removeCustomItem('custom_styles', style)}
                            className="text-red-500 hover:text-red-700 text-xs opacity-0 group-hover:opacity-100"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Sliders */}
            <div className="mb-6">
              <h4 className="font-semibold mb-3 text-gray-800">Energy & Intensity</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Energy Level: <span className="font-bold text-blue-600">{selectedSong.manual_labels.energy_level}/10</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={selectedSong.manual_labels.energy_level}
                    onChange={(e) => handleSliderChange('energy_level', parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-blue"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Low</span>
                    <span>High</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Emotional Intensity: <span className="font-bold text-red-600">{selectedSong.manual_labels.emotional_intensity}/10</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={selectedSong.manual_labels.emotional_intensity}
                    onChange={(e) => handleSliderChange('emotional_intensity', parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-red"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Calm</span>
                    <span>Intense</span>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Tempo: <span className="font-bold text-green-600">{selectedSong.manual_labels.tempo}/10</span>
                  </label>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={selectedSong.manual_labels.tempo}
                    onChange={(e) => handleSliderChange('tempo', parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider-green"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Slow</span>
                    <span>Fast</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mood */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-gray-800">
                  Mood ({(selectedSong.manual_labels.mood?.length || 0) + (selectedSong.manual_labels.custom_moods?.length || 0)} selected{moodSearch ? `, ${getAllMoodOptions(moodSearch).length} shown` : ''})
                </h4>
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search moods..."
                      value={moodSearch}
                      onChange={(e) => setMoodSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setMoodSearch('')}
                      className="px-2 py-1 text-xs border border-gray-300 rounded bg-green-50 pr-6"
                    />
                    {moodSearch && (
                      <button
                        onClick={() => setMoodSearch('')}
                        className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                        title="Clear search (Esc)"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Add custom mood"
                    value={customMoodInput}
                    onChange={(e) => setCustomMoodInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addCustomMood()}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                  <Button
                    onClick={addCustomMood}
                    className="px-3 py-1 text-xs"
                  >
                    Add
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto border border-gray-200 p-4 rounded-lg bg-gray-50">
                {getAllMoodOptions(moodSearch).map(mood => {
                  const isCustom = selectedSong.manual_labels.custom_moods?.includes(mood);
                  const isSelected = selectedSong.manual_labels.mood?.includes(mood);
                  return (
                    <div key={mood} className="flex items-center space-x-2 text-sm hover:bg-white rounded p-1 group">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleCheckboxChange('mood', mood, e.target.checked)}
                        className="rounded"
                      />
                      <span className={`truncate flex-1 ${isCustom ? 'text-blue-600 font-medium' : ''}`}>
                        {mood}
                      </span>
                      {isCustom && (
                        <button
                          onClick={() => removeCustomItem('custom_moods', mood)}
                          className="text-red-500 hover:text-red-700 text-xs opacity-0 group-hover:opacity-100"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Themes */}
            <div className="mb-6">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-semibold text-gray-800">
                  Themes ({(selectedSong.manual_labels.themes?.length || 0) + (selectedSong.manual_labels.custom_themes?.length || 0)} selected{themeSearch ? `, ${getAllThemeOptions(themeSearch).length} shown` : ''})
                </h4>
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search themes..."
                      value={themeSearch}
                      onChange={(e) => setThemeSearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Escape' && setThemeSearch('')}
                      className="px-2 py-1 text-xs border border-gray-300 rounded bg-purple-50 pr-6"
                    />
                    {themeSearch && (
                      <button
                        onClick={() => setThemeSearch('')}
                        className="absolute right-1 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                        title="Clear search (Esc)"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    placeholder="Add custom theme"
                    value={customThemeInput}
                    onChange={(e) => setCustomThemeInput(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && addCustomTheme()}
                    className="px-2 py-1 text-xs border border-gray-300 rounded"
                  />
                  <Button
                    onClick={addCustomTheme}
                    className="px-3 py-1 text-xs"
                  >
                    Add
                  </Button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-gray-200 p-4 rounded-lg bg-gray-50">
                {getAllThemeOptions(themeSearch).map(theme => {
                  const isCustom = selectedSong.manual_labels.custom_themes?.includes(theme);
                  const isSelected = selectedSong.manual_labels.themes?.includes(theme);
                  return (
                    <div key={theme} className="flex items-center space-x-2 text-sm hover:bg-white rounded p-1 group">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleCheckboxChange('themes', theme, e.target.checked)}
                        className="rounded"
                      />
                      <span className={`truncate flex-1 ${isCustom ? 'text-blue-600 font-medium' : ''}`}>
                        {theme}
                      </span>
                      {isCustom && (
                        <button
                          onClick={() => removeCustomItem('custom_themes', theme)}
                          className="text-red-500 hover:text-red-700 text-xs opacity-0 group-hover:opacity-100"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Additional Fields */}
            <div className="mb-6">
              <h4 className="font-semibold mb-3 text-gray-800">Additional Properties</h4>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedSong.manual_labels.explicit}
                    onChange={(e) => handleBooleanChange('explicit', e.target.checked)}
                    className="rounded"
                  />
                  <span>Explicit Content</span>
                </label>
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={selectedSong.manual_labels.instrumental}
                    onChange={(e) => handleBooleanChange('instrumental', e.target.checked)}
                    className="rounded"
                  />
                  <span>Instrumental</span>
                </label>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={isUploading ? undefined : closeUploadModal}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-md w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xl font-bold mb-4">Upload New Song</h3>

            {uploadError && (
              <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                {uploadError}
              </div>
            )}

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select MP3 File (Max 100MB)
              </label>
              <input
                type="file"
                accept=".mp3,audio/mpeg"
                onChange={handleFileSelect}
                className="w-full p-2 border border-gray-300 rounded-lg"
                disabled={isUploading}
              />
            </div>

            {isUploading && (
              <div className="mb-4">
                <div className="text-sm text-gray-600 mb-2">Uploading...</div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            <div className="flex space-x-3">
              <Button
                onClick={closeUploadModal}
                className={`flex-1 px-4 py-2 text-white ${
                  isUploading
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-gray-500 hover:bg-gray-600'
                }`}
              >
                {isUploading ? 'Uploading...' : 'Cancel'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
