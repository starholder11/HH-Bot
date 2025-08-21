'use client';

import { useState, useEffect, useMemo, useCallback, useRef, memo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/Card';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Image, Video, Music, FileText } from 'lucide-react';
import { Project as ProjectType } from '@/lib/project-storage';
import MediaThumbnail from '@/components/MediaThumbnail';

interface MediaAsset {
  id: string;
  filename: string;
  s3_url: string;
  cloudflare_url: string;
  title: string;
  media_type: 'image' | 'video' | 'audio' | 'keyframe_still' | 'layout' | 'object' | 'object_collection' | 'space';
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

const MEDIA_TYPES = ['image', 'video', 'audio', 'layout', 'object', 'object_collection', 'space'] as const;

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
  getAssetIcon: (asset: MediaAsset) => React.ReactElement;
  getAssetDisplayInfo: (asset: MediaAsset) => { primaryLabel: string; secondaryInfo: string };
}) {
  const displayInfo = getAssetDisplayInfo(asset);

  return (
    <div
      onClick={() => onSelect(asset)}
      className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 ${
        isSelected
          ? 'bg-blue-100 border-blue-400 shadow-md'
          : 'bg-neutral-50 border-neutral-200 hover:bg-neutral-100 hover:border-neutral-300'
      }`}
    >
      <div className="flex justify-between items-start">
        <div className="flex-1 min-w-0">
          <div className="flex items-center space-x-2">
            <span className="text-sm">{getAssetIcon(asset)}</span>
            <div className="text-sm font-medium truncate text-black">{asset.title}</div>
          </div>
          <div className="text-xs text-neutral-600 truncate">{asset.filename}</div>
          <div className="text-xs text-blue-600 mt-1">
            {displayInfo.primaryLabel}
          </div>
          <div className="text-xs text-neutral-700 mt-1">
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
            <span className="text-xs text-neutral-600">🖼️</span>
          )}
        </div>
      </div>
    </div>
  );
});

// Helper function to get asset type icon
const getAssetIcon = (asset: MediaAsset) => {
  switch (asset.media_type) {
    case 'image':
      return <Image className="w-5 h-5 text-neutral-600" />;
    case 'keyframe_still':
      return (
        <span className="flex items-center space-x-0.5">
          <Video className="w-4 h-4 text-neutral-600" />
          <Image className="w-4 h-4 text-neutral-600" />
        </span>
      );
    case 'video':
      return <Video className="w-5 h-5 text-neutral-600" />;
    case 'audio':
      return <Music className="w-5 h-5 text-neutral-600" />;
    case 'layout':
      return <span className="text-neutral-600">🎨</span>;
    case 'object':
      return <span className="text-neutral-600">🧱</span>;
    case 'object_collection':
      return <span className="text-neutral-600">🧩</span>;
    case 'space':
      return <span className="text-neutral-600">🌌</span>;
    default:
      return <FileText className="w-5 h-5 text-neutral-600" />;
  }
};

export default function FileManagerPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<MediaAsset | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [mediaTypeFilter, setMediaTypeFilter] = useState<string>('');
  const [projectFilter, setProjectFilter] = useState<string>('');
  const [excludeKeyframes, setExcludeKeyframes] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isAILabeling, setIsAILabeling] = useState(false);
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');

  // Pagination + progressive fetching
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(100); // UI page size
  const FETCH_CHUNK_SIZE = 2000; // server fetch chunk size
  const PREFETCH_THRESHOLD = 200; // when within 200 items of end, prefetch next chunk
  const [totalAssetCount, setTotalAssetCount] = useState(0); // Track total loaded into cache

  // Filename editing state
  const [isEditingFilename, setIsEditingFilename] = useState(false);
  const [newFilename, setNewFilename] = useState('');
  const [isRenamingFile, setIsRenamingFile] = useState(false);

  // Polling state
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  // Asset cache for stable references
  const assetCacheRef = useRef<Map<string, MediaAsset>>(new Map());
  const [filteredAssetIds, setFilteredAssetIds] = useState<string[]>([]); // NEW: separate filtered IDs
  const fetchedChunkPagesRef = useRef<Set<number>>(new Set());
  const nextChunkPageRef = useRef<number>(1);
  const isFetchingChunkRef = useRef<boolean>(false);
  const serverHasMoreRef = useRef<boolean>(true);

  // Mounted state to prevent state updates on unmounted component
  const isMounted = useRef(true);

  const [assetListFocused, setAssetListFocused] = useState(false);

  // handleAssetListKeyDown will be defined after filteredAssets is declared

  // Load assets and projects
  useEffect(() => {
    loadAssetsIncremental(1, FETCH_CHUNK_SIZE, true);
    loadProjects();
  }, []);

  // Define loadAssets with useCallback to prevent infinite re-renders
  const loadAssetsIncremental = useCallback(async (chunkPage?: number, chunkLimit?: number, force?: boolean) => {
    try {
      const pageToFetch = chunkPage ?? nextChunkPageRef.current;
      const limitToFetch = chunkLimit ?? FETCH_CHUNK_SIZE;

      if (!force && fetchedChunkPagesRef.current.has(pageToFetch)) {
        return; // this chunk already fetched
      }
      if (isFetchingChunkRef.current) {
        return; // avoid concurrent fetches
      }
      isFetchingChunkRef.current = true;

      let newData: MediaAsset[] = [];
      let hasMoreFromServer = false;

      if (mediaTypeFilter === 'audio') {
        // For audio filter, fetch from audio-labeling API (which uses S3 JSON files)
        const response = await fetch('/api/audio-labeling/songs');
        const audioData = await response.json();

        // Transform audio data to match MediaAsset interface
        newData = audioData.map((song: any) => ({
          id: song.id,
          filename: song.filename || song.s3_key?.split('/').pop() || 'Unknown Filename',
          s3_url: song.s3_url || song.s3_key || '',
          cloudflare_url: song.cloudflare_url || song.url || '',
          title: song.title || song.filename || 'Untitled',
          media_type: 'audio' as const,
          metadata: {
            duration: song.metadata?.duration,
            file_size: song.metadata?.file_size,
            format: song.metadata?.format,
            artist: song.metadata?.artist,
            album: song.metadata?.album,
            ...song.metadata
          },
          ai_labels: song.ai_labels || { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
          manual_labels: song.manual_labels || { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
          processing_status: song.processing_status || { upload: 'completed', metadata_extraction: 'completed', ai_labeling: 'completed', manual_review: 'completed' },
          timestamps: song.timestamps || { uploaded: song.created_at || new Date().toISOString(), metadata_extracted: null, labeled_ai: null, labeled_reviewed: null },
          labeling_complete: song.labeling_complete === true,
          project_id: song.project_id || projectFilter || null,
          created_at: song.created_at || new Date().toISOString(),
          updated_at: song.updated_at || new Date().toISOString(),
          lyrics: song.lyrics || '',
          prompt: song.prompt || '',
        }));
        hasMoreFromServer = false;
      } else if (mediaTypeFilter === 'object') {
        // Fetch objects from Phase 3 API
        const response = await fetch('/api/objects');
        const result = await response.json();
        newData = (result.assets || []).map((obj: any) => ({
          ...obj,
          media_type: 'object' as const,
          ai_labels: obj.ai_labels || { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
          manual_labels: obj.manual_labels || { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
          processing_status: obj.processing_status || { upload: 'completed', metadata_extraction: 'completed', ai_labeling: 'not_started', manual_review: 'pending' },
          timestamps: obj.timestamps || { uploaded: obj.created_at, metadata_extracted: null, labeled_ai: null, labeled_reviewed: null },
          labeling_complete: false,
          project_id: projectFilter || null,
        }));
        hasMoreFromServer = false;
      } else if (mediaTypeFilter === 'object_collection') {
        // Fetch object collections from Phase 3 API
        const response = await fetch('/api/object-collections');
        const result = await response.json();
        newData = (result.assets || []).map((col: any) => ({
          ...col,
          media_type: 'object_collection' as const,
          ai_labels: col.ai_labels || { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
          manual_labels: col.manual_labels || { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
          processing_status: col.processing_status || { upload: 'completed', metadata_extraction: 'completed', ai_labeling: 'not_started', manual_review: 'pending' },
          timestamps: col.timestamps || { uploaded: col.created_at, metadata_extracted: null, labeled_ai: null, labeled_reviewed: null },
          labeling_complete: false,
          project_id: projectFilter || null,
        }));
        hasMoreFromServer = false;
      } else if (mediaTypeFilter === 'space') {
        // Fetch spaces from Phase 3 API
        const response = await fetch('/api/spaces');
        const result = await response.json();
        newData = (result.assets || []).map((space: any) => ({
          ...space,
          media_type: 'space' as const,
          ai_labels: space.ai_labels || { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
          manual_labels: space.manual_labels || { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
          processing_status: space.processing_status || { upload: 'completed', metadata_extraction: 'completed', ai_labeling: 'not_started', manual_review: 'pending' },
          timestamps: space.timestamps || { uploaded: space.created_at, metadata_extracted: null, labeled_ai: null, labeled_reviewed: null },
          labeling_complete: false,
          project_id: projectFilter || null,
        }));
        hasMoreFromServer = false;
      } else if (mediaTypeFilter === 'layout') {
        // Fetch layouts from existing media-assets API with layout filter
        const params = new URLSearchParams();
        params.append('type', 'layout');
        if (projectFilter) params.append('project', projectFilter);
        params.append('page', pageToFetch.toString());
        params.append('limit', limitToFetch.toString());

        const response = await fetch(`/api/media-labeling/assets?${params.toString()}`);
        const result = await response.json();
        newData = result.assets || [];
        hasMoreFromServer = Boolean(result.hasMore);
      } else {
        // For images, videos, and "all media", use existing media-labeling API with pagination
        const params = new URLSearchParams();
        if (mediaTypeFilter && mediaTypeFilter !== 'audio') params.append('type', mediaTypeFilter);
        if (projectFilter) params.append('project', projectFilter);
        params.append('page', pageToFetch.toString());
        params.append('limit', limitToFetch.toString());
        if (excludeKeyframes) params.append('exclude_keyframes','true');

        const queryString = params.toString();
        console.log(`[file-manager] 🔍 API Request (chunk): /api/media-labeling/assets?${queryString} | excludeKeyframes=${excludeKeyframes}`);
        const response = await fetch(`/api/media-labeling/assets${queryString ? `?${queryString}` : ''}`);
        const result = await response.json();

        newData = result.assets || [];
        hasMoreFromServer = Boolean(result.hasMore);
      }

      if (!isMounted.current) return; // Prevent state update on unmounted component

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

      // 2. Append new IDs (dedup, preserve order)
      if (newData.length > 0) {
        setFilteredAssetIds(prevIds => {
          const existingSet = new Set(prevIds);
          const appended: string[] = [];
          for (const a of newData) {
            if (!existingSet.has(a.id)) appended.push(a.id);
          }
          return prevIds.concat(appended);
        });
      }


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


      // Track pagination state
      fetchedChunkPagesRef.current.add(pageToFetch);
      nextChunkPageRef.current = Math.max(nextChunkPageRef.current, pageToFetch + 1);
      serverHasMoreRef.current = hasMoreFromServer && newData.length > 0;

    } catch (error) {
      console.error('Error loading assets:', error);
    } finally {
      isFetchingChunkRef.current = false;
    }
  }, [mediaTypeFilter, projectFilter, excludeKeyframes]); // Dependencies simplified

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

  // Load assets when filters change (NOT when page changes)
  useEffect(() => {
    // Clear cache when filters change to start fresh
    assetCacheRef.current.clear();
    setCurrentPage(1); // Reset to page 1 when filters change
    setFilteredAssetIds([]);
    fetchedChunkPagesRef.current.clear();
    nextChunkPageRef.current = 1;
    serverHasMoreRef.current = true;
    loadAssetsIncremental(1, FETCH_CHUNK_SIZE, true);
  }, [mediaTypeFilter, projectFilter, excludeKeyframes]);

  // Prefetch next chunk as pagination approaches end of loaded list
  useEffect(() => {
    const endIndex = currentPage * itemsPerPage;
    const remaining = filteredAssetIds.length - endIndex;
    if (remaining <= PREFETCH_THRESHOLD) {
      loadAssetsIncremental(nextChunkPageRef.current, FETCH_CHUNK_SIZE);
    }
  }, [currentPage, itemsPerPage, filteredAssetIds.length, loadAssetsIncremental]);

  // Keep total count synced with loaded IDs
  useEffect(() => {
    setTotalAssetCount(filteredAssetIds.length);
  }, [filteredAssetIds]);

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
    const cache = assetCacheRef.current;
    const isSearch = searchTerm.trim().length > 0;

    if (isSearch) {
      const searchLower = searchTerm.toLowerCase();
      const result: MediaAsset[] = [];
      for (const id of filteredAssetIds) {
        const asset = cache.get(id);
        if (!asset) continue;
        const matchesSearch =
          (asset.title && asset.title.toLowerCase().includes(searchLower)) ||
          (asset.filename && asset.filename.toLowerCase().includes(searchLower)) ||
          (asset.manual_labels?.custom_tags || []).some(tag => tag && tag.toLowerCase().includes(searchLower)) ||
          (asset.manual_labels?.style || []).some(style => style && style.toLowerCase().includes(searchLower)) ||
          (asset.manual_labels?.mood || []).some(mood => mood && mood.toLowerCase().includes(searchLower)) ||
          (asset.manual_labels?.themes || []).some(theme => theme && theme.toLowerCase().includes(searchLower)) ||
          (asset.manual_labels?.scenes || []).some(scene => scene && scene.toLowerCase().includes(searchLower)) ||
          (asset.manual_labels?.objects || []).some(object => object && object.toLowerCase().includes(searchLower)) ||
          (asset.ai_labels && (
            (asset.ai_labels.scenes || []).some(scene => scene && scene.toLowerCase().includes(searchLower)) ||
            (asset.ai_labels.objects || []).some(object => object && object.toLowerCase().includes(searchLower)) ||
            (asset.ai_labels.style || []).some(style => style && style.toLowerCase().includes(searchLower)) ||
            (asset.ai_labels.mood || []).some(mood => mood && mood.toLowerCase().includes(searchLower)) ||
            (asset.ai_labels.themes || []).some(theme => theme && theme.toLowerCase().includes(searchLower))
          )) ||
          (asset.media_type === 'audio' && asset.lyrics && asset.lyrics.toLowerCase().includes(searchLower)) ||
          (asset.media_type === 'audio' && asset.prompt && asset.prompt.toLowerCase().includes(searchLower)) ||
          (asset.media_type === 'audio' && asset.manual_labels?.custom_styles?.some((style: string) => style && style.toLowerCase().includes(searchLower))) ||
          (asset.media_type === 'audio' && asset.manual_labels?.custom_moods?.some((mood: string) => mood && mood.toLowerCase().includes(searchLower))) ||
          (asset.media_type === 'audio' && asset.manual_labels?.custom_themes?.some((theme: string) => theme && theme.toLowerCase().includes(searchLower))) ||
          (asset.media_type === 'audio' && asset.manual_labels?.primary_genre && asset.manual_labels.primary_genre.toLowerCase().includes(searchLower)) ||
          (asset.metadata && asset.metadata.artist && asset.metadata.artist.toLowerCase().includes(searchLower)) ||
          (asset.metadata && asset.metadata.format && asset.metadata.format.toLowerCase().includes(searchLower));
        if (matchesSearch) result.push(asset);
      }
      return result;
    }

    // Non-search: return only the current page slice from the loaded IDs
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    const pageIds = filteredAssetIds.slice(start, end);
    const result: MediaAsset[] = [];
    for (const id of pageIds) {
      const asset = cache.get(id);
      if (asset) result.push(asset);
    }
    return result;
  }, [filteredAssetIds, searchTerm, currentPage, itemsPerPage]);

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

  // Reset page when search term changes (filters are handled above)
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

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

  // Get asset icon based on type (use top-level helper to avoid duplicate definitions)
  // NOTE: duplicate local definition removed; using the top-level `getAssetIcon` declared above

  // Get a user-friendly display name for thumbnails
  const getDisplayName = (asset: MediaAsset) => {
    // Use title if it's meaningful (not just the filename)
    if (asset.title && asset.title !== asset.filename && !asset.title.includes('_keyframe_')) {
      return asset.title;
    }

    // For keyframes, show a cleaner name
    if (asset.media_type === 'keyframe_still' && asset._keyframe_metadata) {
      return `Frame ${asset._keyframe_metadata.frame_number}`;
    }

    // For regular files, clean up the filename
    return asset.filename
      .replace(/^[a-f0-9-]+_/, '') // Remove UUID prefix
      .replace(/_keyframe_\d+/, '') // Remove keyframe suffix
      .replace(/\.[^.]+$/, ''); // Remove extension
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
      case 'layout':
        return {
          primaryLabel: (asset as any).layout_type || 'Layout',
          secondaryInfo: `${(asset.metadata?.item_count || 0)} items | ${asset.metadata?.width || 0}×${asset.metadata?.height || 0}`
        };
      case 'object':
        return {
          primaryLabel: (asset as any).object?.category || 'Object',
          secondaryInfo: (asset as any).object?.subcategory || asset.filename
        };
      case 'object_collection':
        return {
          primaryLabel: (asset as any).collection?.name || 'Collection',
          secondaryInfo: `${((asset as any).collection?.objects || []).length} objects | ${(asset as any).collection?.category || 'Mixed'}`
        };
      case 'space':
        return {
          primaryLabel: (asset as any).space_type || 'Space',
          secondaryInfo: `${((asset as any).space?.items || []).length} items`
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
      <div className="min-h-screen bg-slate-300 text-slate-800">
        <div className="container mx-auto p-6">
          <h1 className="text-3xl font-light tracking-tight mb-6 text-slate-800">Media Library</h1>
          <div className="text-center py-8">
            <p className="text-slate-600 mb-4">No media assets found. Upload some files to get started.</p>
            <Button
              onClick={() => setIsUploading(true)}
              className="bg-slate-700 border border-slate-600 text-white hover:bg-slate-600"
            >
              Upload Media
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-300 text-slate-800">
      <div className="container mx-auto p-6">
        {/* Header with Search and Filters */}
        <div className="mb-6">
          <div className="mb-4">
            <h1 className="text-3xl font-light tracking-tight text-slate-800">Media Library</h1>
          </div>
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          {/* Search */}
          <div className="md:col-span-2">
            <input
              type="text"
              placeholder="Search titles, tags, AI labels, scenes, objects, moods, themes, lyrics..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 bg-white border border-neutral-300 rounded-lg text-black placeholder-neutral-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
              <SelectTrigger className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-lg text-black focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                <SelectValue placeholder="All Media" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Media</SelectItem>
                <SelectItem value="audio">Audio</SelectItem>
                <SelectItem value="image">Images</SelectItem>
                <SelectItem value="video">Videos</SelectItem>
                <SelectItem value="layout">Layouts</SelectItem>
                <SelectItem value="object">Objects</SelectItem>
                <SelectItem value="object_collection">Collections</SelectItem>
                <SelectItem value="space">Spaces</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Exclude Keyframes Toggle */}
          <div className="flex items-center space-x-2">
            <label className="flex items-center space-x-2 text-sm text-white">
              <input
                type="checkbox"
                checked={excludeKeyframes}
                onChange={(e) => {
                  console.log(`[file-manager] 🔧 Exclude Keyframes changed: ${e.target.checked}`);
                  setExcludeKeyframes(e.target.checked);
                }}
                className="rounded border-neutral-700 bg-neutral-800 text-blue-600 focus:ring-blue-500"
              />
              <span>Exclude Keyframes</span>
            </label>
          </div>

          {/* Project Filter */}
          <div className="flex items-center space-x-2">
            <Select
              value={projectFilter || 'none'}
              onValueChange={(val) => {
                setProjectFilter(val === 'none' ? '' : val);
              }}
            >
              <SelectTrigger className="flex-1 px-3 py-2 bg-white border border-neutral-300 rounded-lg text-black focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
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
              className="px-2 py-0.5 text-xs bg-slate-700 border border-slate-600 hover:bg-slate-600 rounded text-white transition-colors whitespace-nowrap"
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
          <div className="bg-neutral-100 border border-neutral-300 rounded-lg p-4">
            <div className="mb-4 flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-black">Assets</h2>
            <Button
              onClick={() => setIsUploading(true)}
              className={`px-3 py-2 text-sm rounded-md font-medium transition-colors ${
                isUploading ? 'bg-neutral-400 text-white' : 'bg-slate-700 border border-slate-600 text-white hover:bg-slate-600'
              }`}
            >
              {isUploading ? 'Uploading...' : 'Upload'}
            </Button>
          </div>

          <div
            className="space-y-2 max-h-[453px] overflow-y-auto outline-none px-2"
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

          {/* Pagination Controls over cached list with progressive prefetch */}
          {totalAssetCount > itemsPerPage && (
            <div className="mt-4 flex items-center justify-between border-t border-neutral-300 pt-4">
              <div className="text-sm text-neutral-600">
                Page {currentPage} of {Math.max(1, Math.ceil(totalAssetCount / itemsPerPage))} ({totalAssetCount} loaded)
              </div>
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="px-3 py-1 text-xs border border-slate-600 bg-slate-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-800"
                >
                  Previous
                </button>

                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, Math.ceil(totalAssetCount / itemsPerPage)) }, (_, i) => {
                    const totalPages = Math.max(1, Math.ceil(totalAssetCount / itemsPerPage));
                    const pageNumber = Math.max(1, Math.min(totalPages - 4, currentPage - 2)) + i;
                    if (pageNumber > totalPages) return null;

                    return (
                      <button
                        key={pageNumber}
                        onClick={() => setCurrentPage(pageNumber)}
                        className={`px-2 py-1 text-xs border rounded ${
                          currentPage === pageNumber
                            ? 'bg-blue-100 text-blue-800 border-blue-400'
                            : 'bg-slate-700 border-slate-600 text-white hover:bg-slate-600'
                        }`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  disabled={currentPage === Math.max(1, Math.ceil(totalAssetCount / itemsPerPage)) && !isFetchingChunkRef.current && !serverHasMoreRef.current}
                  className="px-3 py-1 text-xs border border-slate-600 bg-slate-700 text-white rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-neutral-800"
                >
                  Next
                </button>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Main Content */}
        <div className="lg:col-span-2">

          {/* Search Results Thumbnail Grid */}
          {isSearchActive && (
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-white">Search Results ({filteredAssets?.length || 0})</h2>
              {!filteredAssets || filteredAssets.length === 0 ? (
                <div className="text-gray-500">No assets match your search.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-h-[70vh] overflow-y-auto px-1">
                  {filteredAssets.map((asset) => (
                    <div
                      key={asset.id}
                      className={`border rounded-lg p-2 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-shadow ${selectedAsset?.id === asset.id ? 'ring-2 ring-blue-600' : ''}`}
                      onClick={() => {
                        setSelectedAsset(asset);
                        // Use timeout to prevent race condition with search results rendering
                        setTimeout(() => setSearchTerm(''), 0);
                      }}
                    >
                      <MediaThumbnail
                        asset={asset}
                        className="w-full h-40 mb-2"
                        onDoubleClick={() => {
                          if (asset.media_type === 'video') {
                            window.open(`/video-editor?asset=${asset.id}`, '_blank');
                          } else if (asset.media_type === 'audio') {
                            window.open(`/audio-editor?asset=${asset.id}`, '_blank');
                          }
                        }}
                      />
                      <div className="mt-2 text-sm flex items-center justify-center whitespace-nowrap">
                        <span className="mr-1">{getAssetIcon(asset)}</span>
                        <span className="truncate max-w-full">{getDisplayName(asset)}</span>
                      </div>
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
                <Card className="p-6 bg-neutral-200 border border-neutral-300 text-black">
                  {/* Header */}
                  <div className="flex justify-between items-start mb-6">
                    <div className="flex-1">
                      {/* Title/Filename Section */}
                      <div className="flex items-center space-x-2 mb-3">
                        <Image className="w-6 h-6 text-black" />
                        {isEditingFilename ? (
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1">
                              <input
                                type="text"
                                value={newFilename}
                                onChange={(e) => setNewFilename(e.target.value)}
                                className="text-lg font-bold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 w-full"
                                autoFocus
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveFilename();
                                  if (e.key === 'Escape') cancelFilenameEdit();
                                }}
                              />
                              <div className="text-xs text-neutral-600 mt-1">ID: {selectedAsset.id}</div>
                            </div>
                            <Button
                              onClick={() => {
                                if (!isRenamingFile && newFilename.trim()) {
                                  saveFilename();
                                }
                              }}
                              className={`px-3 py-2 text-sm rounded ${
                                isRenamingFile || !newFilename.trim()
                                  ? 'bg-neutral-400 cursor-not-allowed text-white'
                                  : 'bg-slate-700 hover:bg-slate-600 text-white'
                              }`}
                            >
                              {isRenamingFile ? '...' : 'Save'}
                            </Button>
                            <Button
                              onClick={cancelFilenameEdit}
                              className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 rounded text-white transition-colors"
                            >
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-3 flex-1">
                            <div className="flex-1">
                              <h1 className="text-xl font-bold text-black">{selectedAsset.title}</h1>
                              <div className="text-xs text-neutral-600">ID: {selectedAsset.id}</div>
                            </div>
                            {selectedAsset._keyframe_metadata && (
                              <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-800 font-medium">
                                Keyframe
                              </span>
                            )}
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
                          <span className="text-xs text-neutral-600 font-medium">Project:</span>
                          <select
                            value={selectedAsset.project_id || ''}
                            onChange={(e) => updateProjectAssignment(e.target.value || null)}
                            className="text-xs border border-neutral-300 rounded px-2 py-1 bg-white text-black"
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

                      <div className="text-xs text-neutral-600">
                        Created: {new Date(selectedAsset.created_at).toLocaleDateString()}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={startFilenameEdit}
                        className="px-3 py-2 text-sm bg-slate-700 hover:bg-slate-600 text-white rounded transition-colors"
                      >
                        Edit
                      </Button>
                      <Button
                        onClick={() => isAILabeling ? null : runAILabeling(selectedAsset.id)}
                        className={`px-3 py-2 text-sm rounded text-white transition-colors ${
                          isAILabeling
                            ? 'bg-neutral-400 cursor-not-allowed'
                            : 'bg-slate-700 hover:bg-slate-600'
                        }`}
                      >
                        {isAILabeling ? 'Analyzing...' : 'AI Labels'}
                      </Button>
                    </div>
                  </div>

                  {/* Image Section */}
                  <div className="flex justify-center mb-6">
                    {(selectedAsset.cloudflare_url || selectedAsset.s3_url) ? (
                      <img
                        src={encodePath(selectedAsset.cloudflare_url || selectedAsset.s3_url)}
                        alt={selectedAsset.title}
                        className="w-96 h-96 object-cover rounded-lg shadow-md border border-neutral-300"
                      />
                    ) : (
                      <div className="w-96 h-96 bg-neutral-200 rounded-lg flex items-center justify-center border border-neutral-300">
                        <span className="text-neutral-600">No preview available</span>
                      </div>
                    )}
                  </div>



                  {/* AI Labels */}
                  {selectedAsset.ai_labels && (
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-black">AI Analysis</h3>

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
                          <h4 className="text-sm font-semibold text-black mb-2">Scene Description</h4>
                          <div className="bg-purple-50 border-l-4 border-purple-400 p-4 rounded-r-lg">
                            <p className="text-black leading-relaxed text-sm">
                              {selectedAsset.ai_labels.scenes[0]}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Label Categories */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedAsset.ai_labels.objects.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-black mb-2">Objects</h4>
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
                            <h4 className="text-sm font-semibold text-black mb-2">Style</h4>
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
                            <h4 className="text-sm font-semibold text-black mb-2">Mood</h4>
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
                            <h4 className="text-sm font-semibold text-black mb-2">Themes</h4>
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
                        <h3 className="text-lg font-semibold text-black mb-3">
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-slate-700 border border-slate-600 text-white rounded-lg p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold">Upload Media</h2>
              <Button
                onClick={() => setIsUploading(false)}
                className="bg-neutral-800 hover:bg-neutral-700 text-white"
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
        <label className="block text-sm font-medium mb-2 text-white">Assign to Project (optional)</label>
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="w-full px-3 py-2 border border-neutral-700 bg-neutral-900 text-white rounded-lg focus:ring-2 focus:ring-blue-500"
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
            ? 'border-blue-500 bg-blue-900/20'
            : 'border-neutral-600 hover:border-neutral-500'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => document.getElementById('file-upload')?.click()}
        style={{ cursor: 'pointer' }}
      >
        <div className="space-y-2">
          <div className="text-4xl">📁</div>
          <div className="text-lg font-medium text-white">Drop media files here or click to browse</div>
          <div className="text-sm text-neutral-400">
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
            <h3 className="text-lg font-medium text-white">
              Upload Queue ({uploadFiles.length} files)
            </h3>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {uploadFiles.map((uploadFile) => (
              <div
                key={uploadFile.id}
                className="flex items-center space-x-3 p-3 border border-neutral-700 bg-neutral-900 rounded-lg"
              >
                {/* Preview - show appropriate preview for each file type */}
                <div className="w-12 h-12 flex items-center justify-center bg-neutral-800 rounded border border-neutral-700">
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
                  <div className="text-sm font-medium truncate text-white">{uploadFile.file.name}</div>
                  <div className="text-xs text-neutral-400 flex items-center space-x-2">
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
                      <div className="flex justify-between text-xs text-neutral-400 mb-1">
                        <span>Uploading...</span>
                        <span>{uploadFile.progress}%</span>
                      </div>
                      <div className="w-full bg-neutral-700 rounded-full h-1">
                        <div
                          className="bg-blue-600 h-1 rounded-full transition-all duration-300"
                          style={{ width: `${uploadFile.progress}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Error Message */}
                  {uploadFile.status === 'error' && uploadFile.error && (
                    <div className="mt-1 text-xs text-red-400">{uploadFile.error}</div>
                  )}
                </div>

                {/* Status & Actions */}
                <div className="flex items-center space-x-2">
                  {uploadFile.status === 'completed' && (
                    <span className="text-green-400 text-sm">✓</span>
                  )}
                  {uploadFile.status === 'error' && (
                    <span className="text-red-400 text-sm">✗</span>
                  )}
                  {uploadFile.status === 'pending' && (
                    <Button
                      onClick={() => removeFile(uploadFile.id)}
                      className="text-neutral-400 hover:text-red-400 text-sm"
                    >
                      ✕
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Upload Actions */}
          <div className="flex justify-between items-center pt-4 border-t border-neutral-700">
            <Button
              onClick={isUploading ? undefined : () => setUploadFiles([])}
              className={`px-4 py-2 text-white ${
                isUploading
                  ? 'bg-neutral-600 cursor-not-allowed'
                  : 'bg-neutral-700 hover:bg-neutral-600'
              }`}
            >
              Clear All
            </Button>
            <div className="flex space-x-3">
              <Button
                onClick={isUploading ? undefined : onClose}
                className={`px-4 py-2 text-white ${
                  isUploading
                    ? 'bg-neutral-600 cursor-not-allowed'
                    : 'bg-neutral-700 hover:bg-neutral-600'
                }`}
              >
                Cancel
              </Button>
              <Button
                onClick={pendingCount > 0 && !isUploading ? uploadAllFiles : undefined}
                className={`px-4 py-2 text-white ${
                  pendingCount > 0 && !isUploading
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-neutral-600 cursor-not-allowed'
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
