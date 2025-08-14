'use client';

import React, { useEffect, useState } from 'react';
import { LayoutAsset } from '@/app/visual-search/types';
import { TransformComponents } from '@/app/visual-search/components/Layout/transforms';
import { LAYOUT_THEMES } from '@/app/visual-search/components/Layout/themes';

interface LiveLayoutPageProps {
  params: { layoutId: string };
}

export default function LiveLayoutPage({ params }: LiveLayoutPageProps) {
  const [layout, setLayout] = useState<LayoutAsset | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    async function loadLayout() {
      try {
        const response = await fetch(`/api/media-assets/${params.layoutId}`);
        if (!response.ok) {
          throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const responseData = await response.json();
        console.log('[L7] Full API response:', responseData);
        
        // Handle both direct asset return and wrapped response
        const data = responseData.asset || responseData;
        console.log('[L7] Asset data:', data);
        console.log('[L7] Asset media_type:', data?.media_type);
        
        if (!data || data.media_type !== 'layout') {
          throw new Error(`Not a layout asset. Got media_type: ${data?.media_type}, asset exists: ${!!data}`);
        }
        
        setLayout(data);
        
        // Load preview URLs for content_ref items
        await loadPreviews(data);
        
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load layout');
      } finally {
        setLoading(false);
      }
    }

    loadLayout();
  }, [params.layoutId]);

  async function loadPreviews(layoutData: LayoutAsset) {
    for (const item of layoutData.layout_data.items) {
      if (item.type === 'content_ref') {
        const assetId = (item as any).contentId || (item as any).refId || '';
        const contentType = (item as any).contentType;
        
        if (assetId) {
          setLoadingMap(prev => ({ ...prev, [item.id]: true }));
          
          try {
            if (contentType === 'text') {
              // Extract slug from asset ID and fetch full text content
              const slugMatch = assetId.match(/content_ref_(.+)/);
              const slug = slugMatch ? slugMatch[1] : assetId;
              
              const response = await fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`);
              if (response.ok) {
                const data = await response.json();
                setLayout(prev => prev ? {
                  ...prev,
                  layout_data: {
                    ...prev.layout_data,
                    items: prev.layout_data.items.map(i => 
                      i.id === item.id 
                        ? { ...i, fullTextContent: data.content, textMetadata: data.metadata }
                        : i
                    )
                  }
                } : null);
              }
            } else {
              // Load media asset preview
              const response = await fetch(`/api/media-assets/${assetId}`);
              if (response.ok) {
                const assetData = await response.json();
                const mediaUrl = assetData.cloudflare_url || assetData.s3_url || assetData.url;
                if (mediaUrl) {
                  setPreviewUrls(prev => ({ ...prev, [item.id]: mediaUrl }));
                }
              }
            }
          } catch (error) {
            console.error(`Failed to load preview for ${assetId}:`, error);
          } finally {
            setLoadingMap(prev => ({ ...prev, [item.id]: false }));
          }
        }
      }
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-white text-xl">Loading layout...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-red-400 text-xl">Error: {error}</div>
      </div>
    );
  }

  if (!layout) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center">
        <div className="text-neutral-400 text-xl">Layout not found</div>
      </div>
    );
  }

  const { layout_data } = layout;
  const { designSize, styling, items } = layout_data;
  const theme = styling?.theme || 'mono-noir';
  const themeConfig = LAYOUT_THEMES.find(t => t.id === theme) || LAYOUT_THEMES[0];

  // Apply theme to document
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = layout.title;
      document.body.style.background = styling?.colors?.background || themeConfig.colors.background;
    }
  }, [layout.title, styling?.colors?.background, themeConfig.colors.background]);

  return (
    <div 
      className="min-h-screen"
      style={{ 
        background: styling?.colors?.background || themeConfig.colors.background,
        fontFamily: styling?.typography?.fontFamily || themeConfig.typography.fontFamily
      }}
    >
      {/* Layout Container */}
      <div 
        className="mx-auto relative"
        style={{ 
          width: `${designSize.width}px`, 
          height: `${designSize.height}px`,
          background: styling?.colors?.background || themeConfig.colors.background
        }}
      >
        {items.map((item) => {
          const cellSize = layout_data.cellSize || 20;
          const pixelX = item.x * cellSize;
          const pixelY = item.y * cellSize;
          const pixelW = item.w * cellSize;
          const pixelH = item.h * cellSize;

          const content = renderLiveItem(
            item, 
            previewUrls[item.id], 
            loadingMap[item.id],
            themeConfig
          );

          const wrappedContent = item.transform 
            ? renderWithTransform(content, item.transform)
            : content;

          return (
            <div
              key={item.id}
              className="absolute"
              style={{
                left: `${pixelX}px`,
                top: `${pixelY}px`,
                width: `${pixelW}px`,
                height: `${pixelH}px`,
                zIndex: item.z || 1,
              }}
            >
              {wrappedContent}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function renderWithTransform(content: React.ReactNode, transform: any) {
  if (!transform?.component || typeof window === 'undefined') {
    return content;
  }

  const TransformComponent = TransformComponents[transform.component];
  if (!TransformComponent) {
    console.warn(`Transform component "${transform.component}" not found`);
    return content;
  }

  const transformProps = { ...transform.props };
  
  // Apply container styles if specified
  const containerStyle: React.CSSProperties = {};
  if (transform.container) {
    if (transform.container.overflow) containerStyle.overflow = transform.container.overflow;
    if (transform.container.background) containerStyle.background = transform.container.background;
    if (transform.container.border) containerStyle.border = transform.container.border;
    if (transform.container.borderRadius) containerStyle.borderRadius = transform.container.borderRadius;
  }

  return (
    <TransformComponent {...transformProps} style={containerStyle}>
      {content}
    </TransformComponent>
  );
}

function renderLiveItem(
  item: any, 
  url?: string, 
  loading?: boolean,
  themeConfig?: any
) {
  // Handle block types
  if (item.type === 'block' && item.blockType) {
    return renderLiveBlockItem(item, themeConfig);
  }

  // Handle inline text
  if (item.type === 'inline_text' && item.inlineContent?.text) {
    return (
      <div className="h-full w-full p-4 overflow-auto" style={{ 
        color: themeConfig?.colors?.text || '#ffffff',
        background: 'transparent'
      }}>
        <div className="whitespace-pre-wrap leading-relaxed text-base">
          {item.inlineContent.text}
        </div>
      </div>
    );
  }

  // Handle inline image
  if (item.type === 'inline_image' && (item.inlineContent?.imageUrl || item.inlineContent?.imageData || url)) {
    const src = item.inlineContent?.imageUrl || item.inlineContent?.imageData || url || '';
    return (
      <div className="h-full w-full flex items-center justify-center">
        <img src={src} alt="Image" className="max-w-full max-h-full object-contain" draggable={false} />
      </div>
    );
  }

  // Handle content_ref items
  if (item.type === 'content_ref') {
    const src = url || item.mediaUrl || '';
    const contentType = item.contentType || 'unknown';

    // Render text content with full body text
    if (contentType === 'text') {
      const fullTextContent = item.fullTextContent || '';
      const title = item.snippet || item.title || '';

      if (fullTextContent) {
        return (
          <div className="h-full w-full p-6 bg-white text-black overflow-auto">
            <div className="prose prose-lg max-w-none">
              <h1 className="text-2xl font-bold mb-6 text-black">{title}</h1>
              <div className="text-base leading-relaxed whitespace-pre-wrap text-gray-800">
                {fullTextContent}
              </div>
            </div>
          </div>
        );
      }

      if (loading) {
        return (
          <div className="h-full w-full flex items-center justify-center bg-neutral-800/20">
            <div className="text-neutral-400">Loading text content...</div>
          </div>
        );
      }

      return (
        <div className="h-full w-full p-6 bg-white text-black overflow-auto">
          <div className="prose prose-lg max-w-none">
            <div className="text-base leading-relaxed text-gray-800">{title || 'Loading text content...'}</div>
          </div>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-neutral-800/20">
          <div className="text-neutral-400">Loading {contentType}...</div>
        </div>
      );
    }

    if (!src) {
      return (
        <div className="h-full w-full flex items-center justify-center bg-red-900/20">
          <div className="text-red-400">No source for {contentType}</div>
        </div>
      );
    }

    if (contentType === 'image' || src.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
      return (
        <div className="h-full w-full flex items-center justify-center">
          <img src={src} alt={item.snippet || 'Content'} className="max-w-full max-h-full object-contain" draggable={false} />
        </div>
      );
    }

    if (contentType === 'video' || src.match(/\.(mp4|webm|mov|avi)$/i)) {
      return (
        <div className="h-full w-full flex items-center justify-center">
          <video src={src} className="max-w-full max-h-full object-contain" controls autoPlay muted loop />
        </div>
      );
    }

    return (
      <div className="h-full w-full flex items-center justify-center bg-green-900/20">
        <div className="text-center text-green-300">
          <div className="font-medium text-lg">{item.snippet || 'Asset'}</div>
          <div className="text-sm opacity-70">{contentType}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex items-center justify-center bg-blue-500/10">
      <div className="text-blue-300 text-sm">Unknown content type</div>
    </div>
  );
}

function renderLiveBlockItem(item: any, themeConfig?: any) {
  const config = item.config || {};
  const colors = themeConfig?.colors || {};

  switch (item.blockType) {
    case 'hero':
      return (
        <div className="h-full w-full p-8 text-white bg-gradient-to-r from-blue-600 to-purple-600 overflow-hidden">
          <div className="h-full flex flex-col justify-center">
            {config.content ? (
              <div 
                className="ql-editor prose prose-lg max-w-none text-white" 
                dangerouslySetInnerHTML={{ __html: config.content }} 
              />
            ) : (
              <div className="text-center">
                <h1 className="text-4xl font-bold mb-4">{config.title || 'Hero Title'}</h1>
                <p className="text-xl opacity-90 mb-8">{config.subtitle || 'Hero subtitle goes here'}</p>
                <button className="bg-white text-blue-600 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors">
                  {config.ctaText || 'Get Started'}
                </button>
              </div>
            )}
          </div>
        </div>
      );

    case 'text_section':
      return (
        <div className="h-full w-full p-6 overflow-auto" style={{
          background: colors.surface || 'transparent',
          color: colors.text || '#ffffff'
        }}>
          {config.content ? (
            <div 
              className="ql-editor prose prose-lg max-w-none" 
              style={{ color: colors.text || '#ffffff' }}
              dangerouslySetInnerHTML={{ __html: config.content }} 
            />
          ) : (
            <div className="text-lg leading-relaxed">
              {config.content || 'Text section content goes here. This can be formatted with rich text.'}
            </div>
          )}
        </div>
      );

    case 'cta':
      return (
        <div className="h-full w-full p-8 bg-gradient-to-r from-green-600 to-blue-600 text-white flex flex-col justify-center text-center">
          {config.content ? (
            <div 
              className="ql-editor prose prose-lg max-w-none text-white text-center" 
              dangerouslySetInnerHTML={{ __html: config.content }} 
            />
          ) : (
            <>
              <h2 className="text-3xl font-bold mb-4">{config.title || 'Call to Action'}</h2>
              <p className="text-xl mb-8 opacity-90">{config.subtitle || 'Take action now and transform your experience'}</p>
              <button className="bg-white text-green-600 px-8 py-3 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-colors mx-auto">
                {config.buttonText || 'Get Started'}
              </button>
            </>
          )}
        </div>
      );

    case 'footer':
      return (
        <div className="h-full w-full p-6 bg-gray-900 text-gray-300 text-sm">
          {config.content ? (
            <div 
              className="ql-editor prose prose-sm max-w-none text-gray-300" 
              dangerouslySetInnerHTML={{ __html: config.content }} 
            />
          ) : (
            <div className="flex justify-between items-center h-full">
              <div>&copy; 2024 {config.companyName || 'Your Company'}. All rights reserved.</div>
              <div className="space-x-6">
                <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
                <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
                <a href="#" className="hover:text-white transition-colors">Contact</a>
              </div>
            </div>
          )}
        </div>
      );

    default:
      return (
        <div className="h-full w-full flex items-center justify-center bg-gray-700 text-white rounded-lg">
          <div className="text-center">
            <div className="text-lg font-medium">{item.blockType}</div>
            <div className="text-sm opacity-70">Block Type</div>
          </div>
        </div>
      );
  }
}
