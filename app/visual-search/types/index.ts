export type ContentType = 'video' | 'image' | 'audio' | 'text';

export type UnifiedSearchResult = {
  id: string;
  content_type: ContentType;
  title: string;
  description?: string;
  score: number;
  metadata: any;
  url?: string;
  s3_url?: string;
  cloudflare_url?: string;
  preview?: string;
};

export type UnifiedSearchResponse = {
  success: boolean;
  query: string;
  total_results: number;
  page?: number;
  page_size?: number;
  results: {
    media: UnifiedSearchResult[];
    text: UnifiedSearchResult[];
    all: UnifiedSearchResult[];
  };
};

export type PinnedItem = {
  id: string; // local pin id
  result: UnifiedSearchResult;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
};

export type CanvasData = {
  id?: string;
  name: string;
  note?: string;
  projectId?: string;
  pinned: PinnedItem[];
  updatedAt?: string;
  key?: string;
};

export type LoraModel = {
  id: string;
  name: string;
  triggerWord?: string;
  url?: string;
  scale?: number;
  status?: 'training' | 'completed' | 'failed';
  createdAt?: string;
};

export type Project = {
  id: string;
  name: string;
  description?: string;
};

export type GenerateRequest = {
  mode: 'image' | 'audio' | 'video' | 'text';
  model?: string;
  prompt: string;
  refs?: string[];
  options?: Record<string, any>;
};

export type GenerateResponse = {
  success?: boolean;
  url?: string;
  result?: any;
  note?: string;
  error?: string;
};


