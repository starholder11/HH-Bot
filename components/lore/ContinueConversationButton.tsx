"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { LoreScribeModal } from './LoreScribeModal';

interface ContinueConversationButtonProps {
  slug: string;
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
  const [conversationData, setConversationData] = useState<{
    conversationId: string;
    documentContext: string;
    scribeEnabled: boolean;
  } | null>(null);

  // Only show for text assets
  if (contentType !== 'text') {
    return null;
  }

  const handleContinueConversation = async () => {
    try {
      const response = await fetch('/api/text-assets/continue-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, userId: 'current-user' })
      });
      
      if (response.ok) {
        const data = await response.json();
        setConversationData({
          conversationId: data.conversationId,
          documentContext: data.documentContext,
          scribeEnabled: data.scribeEnabled
        });
        setIsModalOpen(true);
      } else {
        console.error('Failed to start conversation:', response.status);
      }
    } catch (error) {
      console.error('Error starting conversation:', error);
    }
  };

  return (
    <>
      <Button 
        onClick={handleContinueConversation}
        variant={variant}
        size={size}
        className={className}
      >
        💬 Continue Conversation
      </Button>
      
      {isModalOpen && conversationData && (
        <LoreScribeModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          documentSlug={slug}
          initialTab="lore"
          documentContext={conversationData.documentContext}
          conversationId={conversationData.conversationId}
          greetingContext={`I see you want to keep talking about "${title}". Should I continue adding to the document as we chat?`}
        />
      )}
    </>
  );
}
