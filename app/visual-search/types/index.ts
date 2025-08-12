export type ContentType = 'video' | 'image' | 'audio' | 'text' | 'layout';

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

// Layout Asset Types for Phase 2
export type LayoutAsset = {
  id: string;
  filename: string;
  title: string;
  description?: string;
  projectId?: string;
  media_type: 'layout';
  layout_type: 'canvas_export' | 'blueprint_composer' | 'imported';
  layout_data: {
    designSize: { width: number; height: number };
    cellSize: number;
    styling: {
      theme?: 'light' | 'dark' | 'custom';
      colors?: {
        primary?: string;
        secondary?: string;
        background?: string;
        text?: string;
        accent?: string;
      };
      typography?: {
        fontFamily?: string;
        headingFont?: string;
        bodyFont?: string;
      };
      customCSS?: string;
      cssFileUrl?: string;
    };
    items: Array<{
      id: string;
      type: 'content_ref' | 'inline_text' | 'inline_image' | 'block';
      x: number; y: number; w: number; h: number;
      nx: number; ny: number; nw: number; nh: number; // Normalized 0-1 coordinates
      z?: number;
      // Content reference
      refId?: string;
      contentType?: 'video' | 'image' | 'audio' | 'text' | 'layout' | '3d_object' | 'shader' | 'playlist';
      mediaUrl?: string;
      snippet?: string;
      // Inline content
      inlineContent?: {
        text?: string;
        html?: string;
        imageData?: string;
        imageUrl?: string;
      };
      // Display transforms
      transform?: {
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
      // Block types
      blockType?: 'hero' | 'media_grid' | 'text_section' | 'cta' | 'footer' | 'spacer';
      config?: Record<string, any>;
    }>;
  };
  html?: string;
  css?: string;
  s3_url: string;
  cloudflare_url?: string;
  processing_status: {
    created: 'completed';
    html_generated: 'pending' | 'completed' | 'error';
  };
  timestamps: {
    created: string;
    updated: string;
    html_generated?: string;
  };
  created_at: string;
  updated_at: string;
};


