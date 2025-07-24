'use client';

import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Project as ProjectType } from '@/lib/project-storage';

interface MediaAsset {
  id: string;
  filename: string;
  s3_url: string;
  cloudflare_url: string;
  title: string;
  media_type: 'image' | 'video' | 'audio' | 'keyframe_still';
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
    // Audio-specific fields
    custom_styles?: string[];
    custom_moods?: string[];
    custom_themes?: string[];
    primary_genre?: string;
    energy_level?: number;
    emotional_intensity?: number;
    tempo?: number;
    vocals?: string;
    language?: string;
    explicit?: boolean;
    instrumental?: boolean;
  };
  processing_status: {
    upload: 'pending' | 'completed' | 'error';
    metadata_extraction: 'pending' | 'completed' | 'error';
    ai_labeling: 'not_started' | 'triggering' | 'processing' | 'pending' | 'completed' | 'failed' | 'error';
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
  // Keyframe-specific metadata (when image is from video keyframe)
  _keyframe_metadata?: {
    parent_video_id: string;
    timestamp: string;
    frame_number: number;
    source_video: string;
  };
}

interface Project {
  project_id: string;  // Changed from id to project_id to match API
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

const AssetListItem = memo(function AssetListItem({
  asset,
  isSelected,
  onSelect,
  getAssetIcon,
  getAssetDisplayInfo
}: {
  asset: MediaAsset;
  isSelected: boolean;
  onSelect: (asset: MediaAsset) => void;
  getAssetIcon: (asset: MediaAsset) => string;
  getAssetDisplayInfo: (asset: MediaAsset) => { primaryLabel: string; secondaryInfo: string };
}) {
  const displayInfo = getAssetDisplayInfo(asset);

  return (
    <div
      onClick={() => onSelect(asset)}
      className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 ${
        isSelected
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
          {asset.manual_labels?.mood?.length > 0 && (
            <div className="text-xs text-purple-600 mt-1">
              {(asset.manual_labels?.mood || []).slice(0, 2).join(', ')}
              {(asset.manual_labels?.mood || []).length > 2 && '...'}
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
});

export default function FileManagerPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>('');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isAILabeling, setIsAILabeling] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(100); // Show 100 assets per page
  const [totalAssetCount, setTotalAssetCount] = useState(0); // Track total from server

  // Filename editing state
  const [isEditingFilename, setIsEditingFilename] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const [isRenamingFile, setIsRenamingFile] = useState(false);

  // Polling state
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Asset cache for stable references
  const assetCacheRef = useRef<Map<string, MediaAsset>>(new Map());
  const [filteredAssetIds, setFilteredAssetIds] = useState<string[]>([]); // NEW: separate filtered IDs

  // Mounted state to prevent state updates on unmounted component
  const isMounted = useRef(true);

  const [assetListFocused, setAssetListFocused] = useState(false);

  // handleAssetListKeyDown will be defined after filteredAssets is declared


  // Load assets and projects
  useEffect(() => {
    loadAssetsIncremental();
    loadProjects();
  }, []);

  // Define loadAssets with useCallback to prevent infinite re-renders
  const loadAssetsIncremental = useCallback(async () => {
    try {
      let newData: MediaAsset[] = [];
      let totalCount = 0;

      if (mediaTypeFilter === 'audio') {
        // For audio filter, fetch from audio-labeling API (which uses S3 JSON files)
        const response = await fetch('/api/audio-labeling/songs');
        const audioData = await response.json();

        // Transform audio data to match MediaAsset interface
        newData = audioData.map((song: any) => ({
          id: song.id,
          title: song.title || song.filename || 'Untitled',
          media_type: 'audio' as const,
          file_path: song.file_path || song.s3_key,
          url: song.url || song.file_path,
          status: song.status || 'completed',
          created_at: song.created_at || new Date().toISOString(),
          updated_at: song.updated_at || new Date().toISOString(),
          project: song.project || projectFilter || null,
          metadata: {
            duration: song.metadata?.duration,
            file_size: song.metadata?.file_size,
            format: song.metadata?.format,
            artist: song.metadata?.artist,
            album: song.metadata?.album,
            ...song.metadata
          }
        }));
        totalCount = newData.length;
      } else {
        // For images, videos, and "all media", use existing media-labeling API with pagination
        const params = new URLSearchParams();
        if (mediaTypeFilter && mediaTypeFilter !== 'audio') params.append('type', mediaTypeFilter);
        if (projectFilter) params.append('project', projectFilter);
        params.append('page', currentPage.toString());
        params.append('limit', itemsPerPage.toString());

        const queryString = params.toString();
        const response = await fetch(`/api/media-labeling/assets${queryString ? `?${queryString}` : ''}`);
        const result = await response.json();

        newData = result.assets || [];
        totalCount = result.totalCount || 0;
      }

      if (!isMounted.current) return; // Prevent state update on unmounted component

      // Update total asset count for pagination
      setTotalAssetCount(totalCount);

      // --- REFACTORED MERGE LOGIC ---
      // 1. Merge new data into the master cache
      const cache = assetCacheRef.current;
      let hasCacheChanged = false;
      for (const asset of newData) {
        const existing = cache.get(asset.id);
        if (!existing || hasAssetChanged(existing, asset)) {
          cache.set(asset.id, asset);
          hasCacheChanged = true;
        }
      }

      // 2. Determine the new set of filtered IDs from the API response
      const newFilteredIds = new Set(newData.map(a => a.id));

      // 3. Update the filtered IDs state if it has changed
      setFilteredAssetIds(prevIds => {
        const currentFilteredIds = new Set(prevIds);
        const isEqual = newFilteredIds.size === currentFilteredIds.size && Array.from(newFilteredIds).every(id => currentFilteredIds.has(id));
        if (!isEqual) {
          return Array.from(newFilteredIds);
        }
        return prevIds; // Return previous state to avoid re-render
      });


      // 4. If the master cache was updated, trigger a re-render of the assets list
      if (hasCacheChanged) {
        setAssets(Array.from(cache.values()) as MediaAsset[]);
      }


      // --- STABLE SELECTION LOGIC ---
      if (selectedAsset) {
        const updatedSelectedAsset = cache.get(selectedAsset.id);
        if (updatedSelectedAsset && hasAssetChanged(selectedAsset, updatedSelectedAsset)) {
          setSelectedAsset(updatedSelectedAsset);
        }
      }


    } catch (error) {
      console.error('Error loading assets:', error);
    }
  }, [mediaTypeFilter, projectFilter, currentPage, itemsPerPage]); // Dependencies simplified

  // Smart merge function that maintains stable object references
  const mergeAssetsWithCache = (newData: MediaAsset[], cache: Map<string, MediaAsset>, result: MediaAsset[]): boolean => {
    // --- NEW: guard against duplicate IDs returned from API ---
    const processedIds = new Set<string>(); // track IDs we have already handled
    let hasChanges = false;

    // Create a set of new IDs for quick lookup
    const newIds = new Set(newData.map(asset => asset.id));

    // Update/add new and changed assets
    for (const newAsset of newData) {
      if (processedIds.has(newAsset.id)) {
        // Skip duplicates silently – they will cause React key warnings & jumping
        continue;
      }
      processedIds.add(newAsset.id);

      const existing = cache.get(newAsset.id);

      if (!existing || hasAssetChanged(existing, newAsset)) {
        // Asset is new or changed - update cache and mark as changed
        cache.set(newAsset.id, newAsset);
        hasChanges = true;
      }

      // Always add the cached version (which is now up to date) to result
      result.push(cache.get(newAsset.id)!);
    }

    // Remove assets that are no longer present
    const removedIds: string[] = [];
    for (const id of Array.from(cache.keys())) {
      if (!newIds.has(id)) {
        removedIds.push(id);
        hasChanges = true;
      }
    }

    removedIds.forEach(id => cache.delete(id));

    return hasChanges;
  };

  // Check if asset has meaningful changes
  const hasAssetChanged = (existing: MediaAsset, updated: MediaAsset): boolean => {
    // Check key fields that would affect UI
    const keyFields: (keyof MediaAsset)[] = [
      'title', 'filename', 'processing_status', 'ai_labels', 'manual_labels',
      'labeling_complete', 'project_id', 'updated_at'
    ];

    for (const field of keyFields) {
      if (JSON.stringify(existing[field]) !== JSON.stringify(updated[field])) {
        return true;
      }
    }

    return false;
  };

  // Load assets when filters change - prevent race conditions
  useEffect(() => {
    // Clear cache when filters change to start fresh
    // assetCacheRef.current.clear();

    loadAssetsIncremental();
  }, [mediaTypeFilter, projectFilter, currentPage, itemsPerPage]);

  // NEW: Add a dedicated effect to synchronize selection with filters and assets
  useEffect(() => {
    if (selectedAsset) {
      console.log(`[file-manager] 🔍 SELECTION CHECK: Asset ${selectedAsset.id} (${selectedAsset.media_type}) | Media Filter: ${mediaTypeFilter} | Project Filter: ${projectFilter}`);

      // Check 1: Does the selected asset match the media type filter?
      if (mediaTypeFilter && selectedAsset.media_type !== mediaTypeFilter) {
        // Special case: keyframes should be selectable regardless of media type filter
        // since they're special assets representing video frames but viewable as images
        const isKeyframeAsset = selectedAsset.media_type === 'keyframe_still';

        if (!isKeyframeAsset) {
          console.log(`[file-manager] ❌ CLEARING: Media type filter mismatch. Filter: ${mediaTypeFilter}, Asset type: ${selectedAsset.media_type}`);
          setSelectedAsset(null);
          return; // Exit early
        } else {
          console.log(`[file-manager] ✅ KEEPING: Keyframe bypasses media type filter`);
        }
      } else if (!mediaTypeFilter) {
        console.log(`[file-manager] ℹ️  NO FILTER: Media filter is empty, all asset types should be allowed`);
      } else {
        console.log(`[file-manager] ✅ KEEPING: Asset matches filter ${mediaTypeFilter}`);
      }

      // Check 2: Does the selected asset match the project filter?
      if (projectFilter && selectedAsset.project_id !== projectFilter) {
        // Special case: keyframes should be selectable regardless of project filter
        // since they're special assets representing video frames but viewable as images
        const isKeyframeAsset = selectedAsset.media_type === 'keyframe_still';

        if (!isKeyframeAsset) {
          console.log(`[file-manager] ❌ CLEARING: Project filter mismatch. Filter: ${projectFilter}, Asset project: ${selectedAsset.project_id}`);
          setSelectedAsset(null);
          return; // Exit early
        } else {
          console.log(`[file-manager] ✅ KEEPING: Keyframe bypasses project filter`);
        }
      }

      // Check 3: Does the selected asset still exist in the main list?
      // Use the asset cache as the single source of truth for all known assets
      const assetStillExists = assetCacheRef.current.has(selectedAsset.id);
      if (!assetStillExists) {
        console.log('[file-manager] Clearing selected asset - it no longer exists in the cache.');
        setSelectedAsset(null);
        return; // Exit early
      }
    }
  }, [mediaTypeFilter, projectFilter, selectedAsset]);

  // Debug effect to track media filter changes
  useEffect(() => {
    console.log(`[file-manager] 📊 MEDIA FILTER CHANGED: "${mediaTypeFilter}" (${typeof mediaTypeFilter})`);
  }, [mediaTypeFilter]);

  // Debug effect to track project filter changes
  useEffect(() => {
    console.log(`[file-manager] 📊 PROJECT FILTER CHANGED: "${projectFilter}" (${typeof projectFilter})`);
  }, [projectFilter]);

  // Reset AI labeling state when switching between assets
  useEffect(() => {
    setIsAILabeling(false);
  }, [selectedAsset]);

  // Cleanup polling on unmount
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  // Check for pending assets without causing re-renders
  const hasPendingAssetsRef = useRef(false);

  // Update pending status when assets change, but don't trigger polling restart
  useEffect(() => {
    const hasPending = assets.some(asset =>
      asset.processing_status?.ai_labeling === 'triggering' ||
      asset.processing_status?.ai_labeling === 'processing' ||
      asset.processing_status?.ai_labeling === 'pending' ||
      asset.processing_status?.metadata_extraction === 'pending' ||
      asset.processing_status?.upload === 'pending'
    );
    hasPendingAssetsRef.current = hasPending;
  }, [assets]);

  // COMPLETELY DISABLE POLLING - this is the root cause of jumping
  // Polling is causing constant asset list re-renders and jumping behavior
  // Instead, we'll rely on user-initiated refreshes and upload completion callbacks
  useEffect(() => {
    console.log('[file-manager] Polling system DISABLED to prevent UI jumping');

    // Clear any existing polling interval
    if (pollingInterval) {
      console.log('[file-manager] Clearing existing polling interval');
      clearInterval(pollingInterval);
      setPollingInterval(null);
    }

    // Don't start any new polling
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);



  const loadProjects = async () => {
    try {
      const response = await fetch('/api/media-labeling/projects');
      const projectData = (await response.json()) as Project[];

      // --- NEW: remove duplicate project ids to prevent React key warnings ---
      const uniqueProjects: Project[] = Array.from(new Map(projectData.map((p: Project) => [p.project_id, p])).values());
      setProjects(uniqueProjects);
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  // Optimized filtered assets with stable references
  const filteredAssets = useMemo(() => {
    const masterAssetList = Array.from(assetCacheRef.current.values());
    const result = masterAssetList.filter(asset => {
      // Filter 1: The asset must be in the list of currently filtered IDs
      if (!filteredAssetIds.includes(asset.id)) {
        return false;
      }

      // Search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch =
          // Basic asset info
          asset.title.toLowerCase().includes(searchLower) ||
          asset.filename.toLowerCase().includes(searchLower) ||

          // Manual labels
          (asset.manual_labels?.custom_tags || []).some(tag => tag.toLowerCase().includes(searchLower)) ||
          (asset.manual_labels?.style || []).some(style => style.toLowerCase().includes(searchLower)) ||
          (asset.manual_labels?.mood || []).some(mood => mood.toLowerCase().includes(searchLower)) ||
          (asset.manual_labels?.themes || []).some(theme => theme.toLowerCase().includes(searchLower)) ||
          (asset.manual_labels?.scenes || []).some(scene => scene.toLowerCase().includes(searchLower)) ||
          (asset.manual_labels?.objects || []).some(object => object.toLowerCase().includes(searchLower)) ||

          // AI-generated labels
          (asset.ai_labels && (
            asset.ai_labels.scenes.some(scene => scene.toLowerCase().includes(searchLower)) ||
            asset.ai_labels.objects.some(object => object.toLowerCase().includes(searchLower)) ||
            asset.ai_labels.style.some(style => style.toLowerCase().includes(searchLower)) ||
            asset.ai_labels.mood.some(mood => mood.toLowerCase().includes(searchLower)) ||
            asset.ai_labels.themes.some(theme => theme.toLowerCase().includes(searchLower))
          )) ||

          // Audio-specific fields
          (asset.media_type === 'audio' && asset.lyrics && asset.lyrics.toLowerCase().includes(searchLower)) ||
          (asset.media_type === 'audio' && asset.prompt && asset.prompt.toLowerCase().includes(searchLower)) ||

          // Audio manual labels (for custom styles like "Madchester")
          (asset.media_type === 'audio' && asset.manual_labels?.custom_styles?.some((style: string) => style.toLowerCase().includes(searchLower))) ||
          (asset.media_type === 'audio' && asset.manual_labels?.custom_moods?.some((mood: string) => mood.toLowerCase().includes(searchLower))) ||
          (asset.media_type === 'audio' && asset.manual_labels?.custom_themes?.some((theme: string) => theme.toLowerCase().includes(searchLower))) ||
          (asset.media_type === 'audio' && asset.manual_labels?.primary_genre?.toLowerCase().includes(searchLower)) ||

          // Metadata search
          (asset.metadata && asset.metadata.artist && asset.metadata.artist.toLowerCase().includes(searchLower)) ||
          (asset.metadata && asset.metadata.format && asset.metadata.format.toLowerCase().includes(searchLower));

        if (!matchesSearch) return false;
      }

      // Note: Media type and project filters are already applied server-side in loadAssetsIncremental()
      // So we don't need to re-filter them here to avoid race conditions

      return true;
    });

    return result;
  }, [filteredAssetIds, searchTerm]);

  // Determine if the search bar is active (non-empty)
  const isSearchActive = searchTerm.trim().length > 0;

  // Keep a ref to filteredAssets so the keydown handler always sees the latest list
  const filteredAssetsRef = useRef<MediaAsset[]>(filteredAssets);
  useEffect(() => {
    filteredAssetsRef.current = filteredAssets;
  }, [filteredAssets]);

  const handleAssetListKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!assetListFocused) return;
    const list = filteredAssetsRef.current;
    if (list.length === 0) return;

    const currentIndex = selectedAsset ? list.findIndex(a => a.id === selectedAsset.id) : -1;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const nextIndex = currentIndex < list.length - 1 ? currentIndex + 1 : 0;
      setSelectedAsset(list[nextIndex]);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prevIndex = currentIndex > 0 ? currentIndex - 1 : list.length - 1;
      setSelectedAsset(list[prevIndex]);
    }
  }, [assetListFocused, selectedAsset]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, mediaTypeFilter, projectFilter]);

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
        await loadAssetsIncremental();
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

  // Filename editing functions
  const startFilenameEdit = () => {
    if (!selectedAsset) return;
    setNewFilename(selectedAsset.filename);
    setIsEditingFilename(true);
  };

  const cancelFilenameEdit = () => {
    setIsEditingFilename(false);
    setNewFilename('');
  };

  const saveFilename = async () => {
    if (!selectedAsset || !newFilename.trim()) return;

    setIsRenamingFile(true);
    try {
      const response = await fetch(`/api/media-labeling/assets/${selectedAsset.id}/rename`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newFilename: newFilename.trim() })
      });

      const result = await response.json();

      if (response.ok) {
        // Update the selected asset with the new data
        setSelectedAsset(result.asset);
        // Refresh the assets list to show the updated filename
        await loadAssetsIncremental();
        setIsEditingFilename(false);
        setNewFilename('');
        // Success - no popup needed
      } else {
        throw new Error(result.error || 'Failed to rename file');
      }
    } catch (error) {
      console.error('Rename error:', error);
      // Error logged to console, no popup
    } finally {
      setIsRenamingFile(false);
    }
  };

  // Project assignment functions
  const updateProjectAssignment = async (projectId: string | null) => {
    if (!selectedAsset) return;

    try {
      const response = await fetch(`/api/media-labeling/assets/${selectedAsset.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId })
      });

      const result = await response.json();

      if (response.ok) {
        // Update the selected asset with the new data
        setSelectedAsset(result);
        // Refresh the assets list to show updated project assignment
        await loadAssetsIncremental();

        // Success - no popup needed
      } else {
        throw new Error(result.error || 'Failed to update project assignment');
      }
    } catch (error) {
      console.error('Project assignment error:', error);
      // Error logged to console, no popup
    }
  };

  // Get asset icon based on type
  const getAssetIcon = (asset: MediaAsset) => {
    // Special handling for keyframes
    if (asset._keyframe_metadata) {
      return 'KEY'; // Video-to-image indicator for keyframes
    }

    switch (asset.media_type) {
      case 'image': return 'IMG';
      case 'video': return 'VID';
      case 'audio': return 'AUD';
      default: return 'FILE';
    }
  };

  // Get asset display info
  const getAssetDisplayInfo = (asset: MediaAsset) => {
    // Special handling for keyframes
    if (asset._keyframe_metadata) {
      return {
        primaryLabel: `Keyframe from ${asset._keyframe_metadata.source_video}`,
        secondaryInfo: `Frame ${asset._keyframe_metadata.frame_number} at ${asset._keyframe_metadata.timestamp} | ${asset.metadata.width}×${asset.metadata.height}`
      };
    }

    switch (asset.media_type) {
      case 'audio':
        const primaryGenre = (asset.manual_labels?.style || []).find(s => s) ||
                            (asset.ai_labels?.style || []).find(s => s) || 'Unknown Genre';
        return {
          primaryLabel: primaryGenre,
          secondaryInfo: `${Math.round((asset.metadata.duration || 0) / 60)}:${String(Math.round((asset.metadata.duration || 0) % 60)).padStart(2, '0')} | ${asset.metadata.artist || 'Unknown Artist'}`
        };
      case 'image':
        return {
          primaryLabel: (asset.manual_labels?.style || []).find(s => s) || 'Image',
          secondaryInfo: `${asset.metadata.width}×${asset.metadata.height} | ${asset.metadata.format || 'Unknown'}`
        };
      case 'video':
        return {
          primaryLabel: (asset.manual_labels?.style || []).find(s => s) || 'Video',
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
        <h1 className="text-3xl font-light tracking-tight mb-6">Media Library</h1>
        <div className="text-center py-8">
          <p className="text-gray-600 mb-4">No media assets found. Upload some files to get started.</p>
          <Button
            onClick={() => setIsUploading(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Upload Media
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6">
      {/* Header with Search and Filters */}
      <div className="mb-6">
                  <div className="flex items-center justify-between mb-4">
            <h1 className="text-3xl font-light tracking-tight">Media Library</h1>
            <div className="flex gap-3">
              <Button
                onClick={() => setIsUploading(true)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  isUploading ? 'bg-gray-400 text-white' : 'bg-slate-600 text-white hover:bg-slate-700'
                }`}
              >
                {isUploading ? 'Uploading...' : 'Upload'}
              </Button>
              <a
                href="/keyframe-browser"
                                  className="bg-slate-600 text-white px-3 py-1.5 text-sm rounded-md hover:bg-slate-700 transition-colors font-medium inline-flex items-center gap-2"
              >
                Keyframe Browser
              </a>
              <a
                href="/video-analysis"
                                  className="bg-slate-600 text-white px-3 py-1.5 text-sm rounded-md hover:bg-slate-700 transition-colors font-medium inline-flex items-center gap-2"
              >
                Analysis Dashboard
              </a>
            </div>
          </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="Search titles, tags, AI labels, scenes, objects, moods, themes, lyrics..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Media Type Filter */}
          <div>
            <Select
              value={mediaTypeFilter || 'all'}
              onValueChange={(val) => {
                setMediaTypeFilter(val === 'all' ? '' : val);
              }}
            >
              <SelectTrigger className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <SelectValue placeholder="All Media" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Media</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="image">Images</SelectItem>
                <SelectItem value="video">Videos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Project Filter */}
          <div className="flex items-center space-x-2">
            <Select
              value={projectFilter || 'none'}
              onValueChange={(val) => {
                setProjectFilter(val === 'none' ? '' : val);
              }}
            >
              <SelectTrigger className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <SelectValue placeholder="All Projects" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">All Projects</SelectItem>
                {projects.map(project => (
                  <SelectItem key={project.project_id} value={project.project_id}>{project.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              onClick={() => setShowCreateProject(true)}
              className="px-2 py-0.5 text-xs bg-slate-500 hover:bg-slate-600 rounded text-white transition-colors whitespace-nowrap"
            >
              New Project
            </Button>
          </div>

          {/* Spacer to maintain grid layout */}
          <div></div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 min-h-0">
        {/* Asset List */}
        <div className="lg:col-span-1">
          <div className="mb-4">
            <h2 className="text-xl font-semibold">Assets</h2>
          </div>

          <div
            className="space-y-2 max-h-96 overflow-y-auto outline-none"
            tabIndex={0}
            onKeyDown={handleAssetListKeyDown}
            onMouseEnter={() => setAssetListFocused(true)}
            onMouseLeave={() => setAssetListFocused(false)}
          >
            {filteredAssets.map((asset: MediaAsset) => (
              <AssetListItem
                key={asset.id}
                asset={asset}
                isSelected={selectedAsset?.id === asset.id}
                onSelect={(selectedAsset) => {
                  console.log(`[file-manager] 🖱️  CLICK ATTEMPT: Asset ${selectedAsset.id} (${selectedAsset.media_type}) | Current Filter: ${mediaTypeFilter}`);

                  // Additional validation before setting selected asset
                  if (selectedAsset && selectedAsset.media_type && ['image', 'video', 'audio', 'keyframe_still'].includes(selectedAsset.media_type)) {
                    console.log(`[file-manager] ✅ CLICK SUCCESS: Setting selectedAsset to ${selectedAsset.id}`);
                    setSelectedAsset(selectedAsset);
                  } else {
                    console.warn('[file-manager] ❌ CLICK REJECTED: Invalid asset selected:', selectedAsset);
                  }
                }}
                getAssetIcon={getAssetIcon}
                getAssetDisplayInfo={getAssetDisplayInfo}
              />
            ))}
          </div>

          {/* Server-side Pagination Controls */}
          {totalAssetCount > itemsPerPage && (
            <div className="mt-4 flex items-center justify-between border-t pt-4">
              <div className="text-sm text-gray-500">
                Page {currentPage} of {Math.ceil(totalAssetCount / itemsPerPage)}
                ({totalAssetCount} total assets)
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-xs border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Previous
                </button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, Math.ceil(totalAssetCount / itemsPerPage)) }, (_, i) => {
                    const totalPages = Math.ceil(totalAssetCount / itemsPerPage);
                    const pageNumber = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                    if (pageNumber > totalPages) return null;

                    return (
                      <button
                        key={pageNumber}
                        onClick={() => setCurrentPage(pageNumber)}
                        className={`px-2 py-1 text-xs border rounded ${
                          currentPage === pageNumber
                            ? 'bg-blue-500 text-white border-blue-500'
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(Math.ceil(totalAssetCount / itemsPerPage), prev + 1))}
                  disabled={currentPage === Math.ceil(totalAssetCount / itemsPerPage)}
                  className="px-3 py-1 text-xs border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2">

          {/* Search Results Thumbnail Grid */}
          {isSearchActive && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold">Search Results ({filteredAssets.length})</h2>
              {filteredAssets.length === 0 ? (
                <div className="text-gray-500">No assets match your search.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4 max-h-[70vh] overflow-y-auto">
                  {filteredAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className={`border rounded-lg p-1 cursor-pointer hover:ring-2 hover:ring-blue-500 ${selectedAsset?.id === asset.id ? 'ring-2 ring-blue-600' : ''}`}
                      onClick={() => {
                        setSelectedAsset(asset);
                        setSearchTerm(''); // Clear search to open editor
                      }}
                    >
                      {asset.media_type === 'image' || asset.media_type === 'keyframe_still' ? (
                        <img
                          src={encodePath(asset.cloudflare_url || asset.s3_url)}
                          alt={asset.title}
                          className="w-full h-24 object-cover rounded"
                        />
                      ) : asset.media_type === 'video' ? (
                        <div className="w-full h-24 bg-black flex items-center justify-center text-white text-2xl">🎬</div>
                      ) : (
                        <div className="w-full h-24 bg-gray-200 flex items-center justify-center text-gray-700 text-2xl">🎵</div>
                      )}
                      <div className="mt-1 text-xs truncate">{asset.title || asset.filename}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Asset Editor */}
          {!isSearchActive && selectedAsset ? (
            <div className="space-y-6">
                            {/* Image Gallery Card */}
              {selectedAsset.media_type === 'image' || selectedAsset.media_type === 'keyframe_still' ? (
                <Card className="p-6">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex-1">
                      {/* Title/Filename Section */}
                      <div className="flex items-center space-x-2 mb-3">
                        <span className="text-xl">IMG</span>
                        {isEditingFilename ? (
                          <div className="flex items-center space-x-2 flex-1">
                            <input
                              type="text"
                              value={newFilename}
                              onChange={(e) => setNewFilename(e.target.value)}
                              className="text-lg font-bold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 flex-1"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveFilename();
                                if (e.key === 'Escape') cancelFilenameEdit();
                              }}
                            />
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
                              {isRenamingFile ? '...' : 'Save'}
                            </Button>
                                                          <Button
                                onClick={cancelFilenameEdit}
                                className="px-1.5 py-0.5 text-xs bg-gray-300 hover:bg-gray-400 rounded text-gray-700 transition-colors"
                              >
                                Cancel
                              </Button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2 flex-1">
                            <h1 className="text-xl font-bold text-gray-900">{selectedAsset.title}</h1>
                            {selectedAsset._keyframe_metadata && (
                              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-medium">
                                Keyframe
                              </span>
                            )}
                            <Button
                              onClick={startFilenameEdit}
                              className="px-1.5 py-0.5 text-xs bg-gray-100 hover:bg-gray-200 text-gray-600 rounded transition-colors"
                            >
                              ✏️
                            </Button>
                          </div>
                        )}
                                                  {selectedAsset.labeling_complete && (
                            <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-800 font-medium">
                              Complete
                            </span>
                          )}
                      </div>

                      {/* Project Assignment Section */}
                      <div className="mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500 font-medium">Project:</span>
                          <select
                            value={selectedAsset.project_id || ''}
                            onChange={(e) => updateProjectAssignment(e.target.value || null)}
                            className="text-xs border border-gray-300 rounded px-2 py-1 bg-white text-gray-700"
                          >
                            <option key="no-project" value="">No Project</option>
                            {projects.map(project => (
                              <option key={project.project_id} value={project.project_id}>
                                {project.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="text-xs text-gray-500">
                        Created: {new Date(selectedAsset.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Action Button */}
                    <Button
                      onClick={() => isAILabeling ? null : runAILabeling(selectedAsset.id)}
                      className={`px-2 py-0.5 text-xs rounded text-white transition-colors ${
                        isAILabeling
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-purple-500 hover:bg-purple-600'
                      }`}
                    >
                                              {isAILabeling ? 'Analyzing...' : 'AI Labels'}
                    </Button>
                  </div>

                  {/* Image Section */}
                  <div className="flex justify-center mb-6">
                    {(selectedAsset.cloudflare_url || selectedAsset.s3_url) ? (
                      <img
                        src={encodePath(selectedAsset.cloudflare_url || selectedAsset.s3_url)}
                        alt={selectedAsset.title}
                        className="w-96 h-96 object-cover rounded-lg shadow-md"
                      />
                    ) : (
                      <div className="w-96 h-96 bg-gray-200 rounded-lg flex items-center justify-center">
                        <span className="text-gray-400">No preview available</span>
                      </div>
                    )}
                  </div>



                  {/* AI Labels */}
                  {selectedAsset.ai_labels && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-700">AI Analysis</h3>

                      {/* Show processing state for keyframes with empty AI labels */}
                      {selectedAsset._keyframe_metadata &&
                       (!selectedAsset.ai_labels.scenes || selectedAsset.ai_labels.scenes.length === 0) && (
                        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-r-lg">
                          <div className="flex items-center">
                            <div className="text-yellow-600 mr-3">
                              🧠
                            </div>
                            <div>
                              <h4 className="text-sm font-semibold text-yellow-800 mb-1">AI Analysis Processing</h4>
                              <p className="text-sm text-yellow-700">
                                This keyframe is being analyzed by our AI vision system. Analysis results will appear here once processing is complete.
                              </p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Scene Description */}
                      {selectedAsset.ai_labels.scenes.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Scene Description</h4>
                          <div className="bg-purple-50 border-l-4 border-purple-400 p-4 rounded-r-lg">
                            <p className="text-gray-700 leading-relaxed text-sm">
                              {selectedAsset.ai_labels.scenes[0]}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Label Categories */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedAsset.ai_labels.objects.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Objects</h4>
                            <div className="flex flex-wrap gap-1">
                              {selectedAsset.ai_labels.objects.slice(0, 8).map((object, index) => (
                                <span key={index} className="px-3 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                                  {object}
                                </span>
                              ))}
                              {selectedAsset.ai_labels.objects.length > 8 && (
                                <span className="px-3 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
                                  +{selectedAsset.ai_labels.objects.length - 8} more
                                </span>
                              )}
                            </div>
                          </div>
                        )}

                        {selectedAsset.ai_labels.style.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Style</h4>
                            <div className="flex flex-wrap gap-1">
                              {selectedAsset.ai_labels.style.map((style, index) => (
                                <span key={index} className="px-3 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                                  {style}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedAsset.ai_labels.mood.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Mood</h4>
                            <div className="flex flex-wrap gap-1">
                              {selectedAsset.ai_labels.mood.map((mood, index) => (
                                <span key={index} className="px-3 py-1 text-xs bg-yellow-100 text-yellow-800 rounded-full">
                                  {mood}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {selectedAsset.ai_labels.themes.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">Themes</h4>
                            <div className="flex flex-wrap gap-1">
                              {selectedAsset.ai_labels.themes.map((theme, index) => (
                                <span key={index} className="px-3 py-1 text-xs bg-orange-100 text-orange-800 rounded-full">
                                  {theme}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        </div>
                      </div>
                    )}

                    {/* Image Details - moved after AI Analysis */}
                    {selectedAsset.metadata && (
                      <div className="mt-6">
                        <h3 className="text-lg font-semibold text-gray-700 mb-3">
                          {selectedAsset._keyframe_metadata ? 'Keyframe Details' : 'Image Details'}
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <div className="text-xs text-gray-500 font-medium">Dimensions</div>
                            <div className="text-sm font-bold text-gray-900 mt-1">
                              {selectedAsset.metadata.width}×{selectedAsset.metadata.height}
                            </div>
                          </div>
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <div className="text-xs text-gray-500 font-medium">Format</div>
                            <div className="text-sm font-bold text-gray-900 mt-1">
                              {selectedAsset.metadata.format?.toUpperCase() || 'Unknown'}
                            </div>
                          </div>
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <div className="text-xs text-gray-500 font-medium">File Size</div>
                            <div className="text-sm font-bold text-gray-900 mt-1">
                              {Math.round((selectedAsset.metadata.file_size || 0) / 1024)} KB
                            </div>
                          </div>
                          <div className="text-center p-3 bg-gray-50 rounded-lg">
                            <div className="text-xs text-gray-500 font-medium">Ratio</div>
                            <div className="text-sm font-bold text-gray-900 mt-1">
                              {selectedAsset.metadata.aspect_ratio || '1:1'}
                            </div>
                          </div>
                        </div>

                        {/* Keyframe-specific details */}
                        {selectedAsset._keyframe_metadata && (
                          <div className="mt-4">
                            <h4 className="text-md font-semibold text-gray-700 mb-3">Video Source Information</h4>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                              <div className="text-center p-3 bg-blue-50 rounded-lg">
                                <div className="text-xs text-blue-600 font-medium">Source Video</div>
                                <div className="text-sm font-bold text-gray-900 mt-1">
                                  {selectedAsset._keyframe_metadata.source_video}
                                </div>
                              </div>
                              <div className="text-center p-3 bg-blue-50 rounded-lg">
                                <div className="text-xs text-blue-600 font-medium">Timestamp</div>
                                <div className="text-sm font-bold text-gray-900 mt-1">
                                  {selectedAsset._keyframe_metadata.timestamp}
                                </div>
                              </div>
                              <div className="text-center p-3 bg-blue-50 rounded-lg">
                                <div className="text-xs text-blue-600 font-medium">Frame Number</div>
                                <div className="text-sm font-bold text-gray-900 mt-1">
                                  #{selectedAsset._keyframe_metadata.frame_number}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                </Card>
              ) : selectedAsset.media_type === 'video' ? (
                /* Video iframe */
                <div className="w-full">
                  <iframe
                    src={`/video-editor?asset=${selectedAsset.id}`}
                    className="w-full border-0 rounded-lg"
                    title="Video Editor"
                    style={{ height: '350vh', minHeight: '2800px' }}
                    frameBorder="0"
                    scrolling="no"
                  />
                </div>
              ) : selectedAsset.media_type === 'audio' ? (
                /* Audio iframe */
                <div className="w-full">
                  <iframe
                    src={`/audio-editor?asset=${selectedAsset.id}`}
                    className="w-full border-0 rounded-lg"
                    title="Audio Editor"
                    style={{ height: '250vh', minHeight: '2000px' }}
                    frameBorder="0"
                    scrolling="no"
                  />
                </div>
              ) : (
                /* Unknown media type fallback */
                <div className="text-center py-8">
                  <div className="text-6xl mb-4">❓</div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">Unsupported Media Type</h3>
                  <p className="text-gray-500">Media type &quot;{selectedAsset.media_type}&quot; is not supported for viewing.</p>
                  <p className="text-sm text-gray-400 mt-2">Asset ID: {selectedAsset.id}</p>
                </div>
              )}
            </div>
          ) : !isSearchActive ? (
            <div className="text-gray-500 flex items-center justify-center h-full">Select an asset to view or edit.</div>
          ) : null}
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
                loadAssetsIncremental();
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
                  className="flex-1 px-3 py-1.5 bg-gray-400 hover:bg-gray-500 text-white text-sm rounded transition-colors"
                >
                  Cancel
                </Button>
                <Button
                  onClick={newProjectName.trim() ? createProject : undefined}
                  className={`flex-1 px-3 py-1.5 text-white text-sm rounded transition-colors ${
                    newProjectName.trim()
                      ? 'bg-blue-500 hover:bg-blue-600'
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
  // Remove mediaType state - now accepting all media types

  // Handle file selection - now supports all media types
  const handleFileSelect = (files: FileList | null) => {
    if (!files) return;

    const newFiles: UploadFile[] = Array.from(files)
      .filter(file => {
        const audioTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/aac'];
        const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const videoTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/webm', 'video/ogg', 'video/3gpp', 'video/x-ms-wmv'];

        const allValidTypes = [...audioTypes, ...imageTypes, ...videoTypes];

        if (!allValidTypes.includes(file.type)) {
          console.warn(`${file.name} is not a supported format. Please upload audio (MP3, WAV, M4A), image (JPEG, PNG, GIF, WebP), or video (MP4, MOV, AVI, WebM, etc.) files.`);
          return false;
        }

        // Set size limits based on file type
        const maxSize = file.type.startsWith('audio/') ? 100 * 1024 * 1024 : // 100MB for audio
                     file.type.startsWith('image/') ? 50 * 1024 * 1024 :   // 50MB for images
                     500 * 1024 * 1024; // 500MB for videos

        if (file.size > maxSize) {
          const maxSizeMB = maxSize / (1024 * 1024);
          const typeLabel = file.type.startsWith('audio/') ? 'audio' :
                           file.type.startsWith('image/') ? 'image' : 'video';
          console.warn(`${file.name} is too large. Maximum file size for ${typeLabel} is ${maxSizeMB}MB.`);
          return false;
        }
        return true;
      })
      .map(file => ({
        file,
        id: Math.random().toString(36).substr(2, 9),
        progress: 0,
        status: 'pending' as const,
        previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined
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

  // Upload single file - now handles audio, image, and video
  const uploadFile = async (uploadFile: UploadFile): Promise<void> => {
    const { file, id } = uploadFile;

    try {
      // Update status to uploading
      setUploadFiles(prev => prev.map(f =>
        f.id === id ? { ...f, status: 'uploading' as const } : f
      ));

      // Determine API path based on file type
      const getApiPath = (fileType: string) => {
        if (fileType.startsWith('audio/')) return 'audio-labeling';
        if (fileType.startsWith('image/')) return 'media-labeling/images';
        if (fileType.startsWith('video/')) return 'media-labeling/videos';
        throw new Error(`Unsupported file type: ${fileType}`);
      };

      const apiPath = getApiPath(file.type);

      // Step 1: Get presigned URL
      const presignedResponse = await fetch(`/api/${apiPath}/get-upload-url`, {
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
              const completeResponse = await fetch(`/api/${apiPath}/finish-upload`, {
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
        console.log(`${completedCount} file(s) uploaded successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}`);
      }

      if (errorCount === 0) {
        onClose();
      }

    } catch (error) {
      console.error('Batch upload error:', error);
      console.error('Upload failed. Please try again.');
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
            <option key={project.project_id} value={project.project_id}>{project.name}</option>
          ))}
        </select>
      </div>

      {/* File Drop Zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
          isDragOver
            ? 'border-blue-500 bg-blue-50'
            : 'border-gray-300 hover:border-gray-400'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => document.getElementById('file-upload')?.click()}
        style={{ cursor: 'pointer' }}
      >
        <div className="space-y-2">
          <div className="text-4xl">📁</div>
          <div className="text-lg font-medium">Drop media files here or click to browse</div>
          <div className="text-sm text-gray-500">
            Supports audio (MP3, WAV, M4A up to 100MB), images (JPEG, PNG, GIF, WebP up to 50MB), and videos (MP4, MOV, AVI, WebM up to 500MB)
          </div>
          <input
            type="file"
            multiple
            accept="audio/*,image/*,video/*"
            onChange={(e) => handleFileSelect(e.target.files)}
            className="hidden"
            id="file-upload"
          />
        </div>
      </div>

      {/* Upload Queue */}
      {uploadFiles.length > 0 && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-medium">
              Upload Queue ({uploadFiles.length} files)
            </h3>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {uploadFiles.map((uploadFile) => (
              <div
                key={uploadFile.id}
                className="flex items-center space-x-3 p-3 border rounded-lg"
              >
                {/* Preview - show appropriate preview for each file type */}
                <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded border">
                  {uploadFile.previewUrl ? (
                    <img
                      src={uploadFile.previewUrl}
                      alt="Preview"
                      className="w-full h-full object-cover rounded"
                    />
                  ) : uploadFile.file.type.startsWith('audio/') ? (
                    <span className="text-2xl">🎵</span>
                  ) : uploadFile.file.type.startsWith('video/') ? (
                    <span className="text-2xl">🎬</span>
                  ) : (
                    <span className="text-2xl">📄</span>
                  )}
                </div>

                {/* File Info */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{uploadFile.file.name}</div>
                  <div className="text-xs text-gray-500 flex items-center space-x-2">
                    <span>{(uploadFile.file.size / (1024 * 1024)).toFixed(1)} MB</span>
                    <span>•</span>
                    <span className="uppercase">
                      {uploadFile.file.type.startsWith('audio/') ? 'Audio' :
                       uploadFile.file.type.startsWith('image/') ? 'Image' :
                       uploadFile.file.type.startsWith('video/') ? 'Video' : 'Unknown'}
                    </span>
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
