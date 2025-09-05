"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LoreScribeModal } from './LoreScribeModal';

interface ContinueConversationButtonProps {
  slug: string; // Can be UUID (S3) or slug (Git)
  title: string;
  contentType?: string;
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}

export default function ContinueConversationButton({ 
  slug, 
  title, 
  contentType = 'text',
  variant = 'outline',
  size = 'sm',
  className = ''
}: ContinueConversationButtonProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [documentData, setDocumentData] = useState<{
    id?: string;
    slug: string;
    title: string;
    content: string;
    conversationId: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Only show for text assets
  if (contentType !== 'text') {
    return null;
  }

  const handleContinueConversation = async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    try {
      // Check if this is a UUID (S3 text asset) or slug (Git text asset)
      const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
      
      let content = '';
      let actualSlug = slug;
      let textAssetId = slug;
      
      if (isUUID) {
        // S3 text asset - load by UUID
        const response = await fetch(`/api/media-assets/${slug}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success && data.asset?.media_type === 'text') {
            content = data.asset.content || '';
            actualSlug = data.asset.metadata?.slug || slug;
            textAssetId = data.asset.id;
          }
        }
      } else {
        // Git-based text asset - load by slug
        const response = await fetch(`/api/internal/get-content/${encodeURIComponent(slug)}`);
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            content = data.content || '';
            actualSlug = slug;
          }
        }
      }
      
      if (content) {
        const conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        setDocumentData({
          id: isUUID ? textAssetId : undefined,
          slug: actualSlug,
          title,
          content,
          conversationId
        });
        setIsModalOpen(true);
      } else {
        console.error('Failed to load text content for:', slug);
      }
    } catch (error) {
      console.error('Error loading text content:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <Button 
        onClick={handleContinueConversation}
        variant={variant}
        size={size}
        className={className}
        disabled={isLoading}
      >
        {isLoading ? '⏳' : '💬'} Continue Conversation
      </Button>
      
      {isModalOpen && documentData && (
        <LoreScribeModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          documentSlug={documentData.slug}
          initialTab="scribe"
          documentContext={documentData.content}
          conversationId={documentData.conversationId}
          greetingContext={`I see you want to continue exploring "${title}". I've loaded the document into the Scribe tab. What would you like to discuss about this content?`}
        />
      )}
    </>
  );
}
