"use client";

import { useState, useMemo } from 'react';
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

  // Only show for S3 text assets (UUID format)
  const isUUID = useMemo(() => 
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug), 
    [slug]
  );

  if (contentType !== 'text' || !isUUID) {
    return null; // Only show for S3 text assets
  }

  const handleContinueConversation = async () => {
    if (isLoading) return;

    // Only work with UUID-based S3 text assets
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(slug);
    if (!isUUID) {
      console.warn('Continue Conversation only works with S3 text assets (UUID), got:', slug);
      return;
    }

    setIsLoading(true);
    try {
      // Load S3 text asset by UUID
      const response = await fetch(`/api/media-assets/${slug}`);
      if (!response.ok) {
        throw new Error(`Failed to load S3 text asset: ${response.status}`);
      }

      const data = await response.json();
      if (!data.success || !data.asset?.media_type === 'text') {
        throw new Error('Invalid S3 text asset response');
      }

      const textAsset = data.asset;
      const content = textAsset.content || '';
      const actualSlug = textAsset.metadata?.slug || slug;

      if (!content) {
        throw new Error('S3 text asset has no content');
      }

      const conversationId = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      setDocumentData({
        id: textAsset.id,
        slug: actualSlug,
        title: textAsset.title || title,
        content,
        conversationId,
        uuid: textAsset.id // Store UUID for modal
      });
      setIsModalOpen(true);

    } catch (error) {
      console.error('Error loading S3 text content:', error);
      alert(`Failed to load document: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
          documentSlug={(documentData as any).uuid || documentData.id} // Pass UUID as documentSlug for S3 assets
          initialTab="lore"
          documentContext={documentData.content}
          conversationId={documentData.conversationId}
          greetingContext={`I see you want to continue exploring "${documentData.title}". I've loaded the document into the Scribe tab. What would you like to discuss about this content?`}
          // Pass the REAL title and slug from S3 data
          documentTitle={documentData.title}
          documentActualSlug={documentData.slug}
        />
      )}
    </>
  );
}
