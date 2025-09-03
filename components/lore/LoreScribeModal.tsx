"use client";

import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { useAgentStream } from '@/app/visual-search/hooks/useAgentStream';
import { useConversationalStream } from '@/app/workshop/hooks/useConversationalStream';

type Msg = { role: 'user' | 'assistant' | 'tool'; content: string };

interface TextAssetData {
  slug: string;
  title: string;
  mdx: string;
  scribe_enabled?: boolean;
  conversation_id?: string;
}

interface LoreScribeModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentSlug?: string;
  initialTab?: 'lore' | 'scribe';
  documentContext?: string;
  conversationId?: string;
  greetingContext?: string;
}

// Scribe Editor Component
function ScribeEditor({
  documentData,
  scribeEnabled,
  onScribeToggle,
  onSave
}: {
  documentData: TextAssetData | null;
  scribeEnabled: boolean;
  onScribeToggle: (enabled: boolean) => void;
  onSave: (content: string) => void;
}) {
  const [content, setContent] = useState(documentData?.mdx || '');
  const [isToggling, setIsToggling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Update content when documentData changes
  useEffect(() => {
    if (documentData?.mdx) {
      setContent(documentData.mdx);
    }
  }, [documentData?.mdx]);

  const handleToggle = async () => {
    if (!documentData?.slug) return;

    setIsToggling(true);
    try {
      const response = await fetch('/api/chat/background-doc/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: documentData.slug,
          scribe_enabled: !scribeEnabled
        })
      });

      if (response.ok) {
        onScribeToggle(!scribeEnabled);
      }
    } catch (error) {
      console.error('Failed to toggle scribe:', error);
    } finally {
      setIsToggling(false);
    }
  };

  const handleSave = async () => {
    if (!documentData?.slug) return;

    setIsSaving(true);
    try {
      const response = await fetch('/api/text-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: documentData.slug,
          title: documentData.title,
          mdx: content,
          source: 'conversation',
          status: 'draft',
          scribe_enabled: scribeEnabled,
          conversation_id: documentData.conversation_id,
          commitOnSave: false
        })
      });

      if (response.ok) {
        onSave(content);
        console.log('[scribe] Document saved successfully');
      }
    } catch (error) {
      console.error('Failed to save document:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const openInLayoutEditor = () => {
    if (documentData?.slug) {
      // Close modal and navigate to layout editor
      window.location.href = `/layout-editor/visual-search?highlight=${documentData.slug}`;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header with controls */}
      <div className="flex justify-between items-center p-4 border-b border-neutral-800">
        <div>
          <h3 className="text-lg font-semibold text-white">
            {documentData?.title || 'Untitled Document'}
          </h3>
          <p className="text-sm text-neutral-400">
            {scribeEnabled ? 'AI updating document' : 'Manual editing mode'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={handleToggle}
            disabled={isToggling}
            variant={scribeEnabled ? "destructive" : "default"}
            size="sm"
          >
            {scribeEnabled ? "Stop Scribe" : "Start Scribe"}
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving}
            variant="outline"
            size="sm"
          >
            {isSaving ? "Saving..." : "Save"}
          </Button>
          <Button
            onClick={openInLayoutEditor}
            variant="outline"
            size="sm"
          >
            Go to Layout
          </Button>
        </div>
      </div>

      {/* Document Editor */}
      <div className="flex-1 p-4">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-full bg-neutral-900 border border-neutral-700 rounded-md p-4 text-white font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="The scribe will populate this document as your conversation continues..."
          spellCheck={false}
        />
      </div>
    </div>
  );
}

// Main Lore-Scribe Modal Component
export default function LoreScribeModal({
  isOpen,
  onClose,
  documentSlug,
  initialTab = 'lore',
  documentContext,
  conversationId,
  greetingContext
}: LoreScribeModalProps) {
  const [activeTab, setActiveTab] = useState<'lore' | 'scribe'>(initialTab);
  const [documentData, setDocumentData] = useState<TextAssetData | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState(0);
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load document data when modal opens
  useEffect(() => {
    if (documentSlug && isOpen) {
      loadDocumentData();
    }
  }, [documentSlug, isOpen]);

  // Add greeting message when opening with context
  useEffect(() => {
    if (greetingContext && isOpen && messages.length === 0) {
      setMessages([{ role: 'assistant', content: greetingContext }]);
    }
  }, [greetingContext, isOpen]);

    const loadDocumentData = async () => {
    if (!documentSlug) return;
    
    try {
      const response = await fetch(`/api/text-assets/${documentSlug}`);
      if (response.ok) {
        const data = await response.json();
        setDocumentData({
          slug: data.slug,
          title: data.title,
          mdx: data.mdx,
          scribe_enabled: data.scribe_enabled || false,
          conversation_id: data.conversation_id || conversationId
        });
      } else {
        // Fallback for missing documents
        setDocumentData({
          slug: documentSlug,
          title: documentSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          mdx: documentContext || '',
          scribe_enabled: false,
          conversation_id: conversationId
        });
      }
    } catch (error) {
      console.error('Failed to load document data:', error);
      // Use fallback data
      setDocumentData({
        slug: documentSlug,
        title: documentSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        mdx: documentContext || '',
        scribe_enabled: false,
        conversation_id: conversationId
      });
    }
  };

  // Detect scribe intents in messages
  const detectScribeIntent = (message: string) => {
    const startWords = /(start|begin|create|activate|enable|turn\s+on)/i;
    const stopWords = /(stop|end|pause|disable|turn\s+off|deactivate)/i;
    const scribeWords = /(scribe|background\s+doc|document|documentation)/i;

    const isStart = startWords.test(message) && scribeWords.test(message);
    const isStop = stopWords.test(message) && scribeWords.test(message);

    // Extract topic/title from message
    const topicMatch = message.match(/(?:scribe|doc|document)\s+(?:about\s+)?([^.!?]+)/i);
    const extractedTitle = topicMatch ? topicMatch[1].trim() : null;

    return { isStart, isStop, extractedTitle };
  };

  const handleScribeCommand = async (intent: ReturnType<typeof detectScribeIntent>) => {
    if (intent.isStart) {
      // Create new background document
      try {
        const response = await fetch('/api/chat/background-doc/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId: conversationId || `conv_${Date.now()}`,
            title: intent.extractedTitle || 'Conversation Summary',
            slug: intent.extractedTitle ? intent.extractedTitle.toLowerCase().replace(/\s+/g, '-') : undefined
          })
        });

        if (response.ok) {
          const result = await response.json();
          setDocumentData({
            slug: result.slug,
            title: result.title,
            mdx: `# ${result.title}\n\n*The scribe will populate this document as your conversation continues...*`,
            scribe_enabled: true,
            conversation_id: result.conversationId
          });
          setActiveTab('scribe');

          // Add confirmation message
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: `Started scribe for "${result.title}". I'll document our conversation as we chat. You can switch to the Scribe tab to see the document.`
          }]);
        }
      } catch (error) {
        console.error('Failed to start scribe:', error);
      }
    } else if (intent.isStop && documentData) {
      // Stop scribe for current document
      try {
        const response = await fetch('/api/chat/background-doc/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slug: documentData.slug,
            scribe_enabled: false
          })
        });

        if (response.ok) {
          setDocumentData(prev => prev ? { ...prev, scribe_enabled: false } : null);
          setMessages(prev => [...prev, {
            role: 'assistant',
            content: 'Scribe stopped. You now have full editorial control of the document.'
          }]);
        }
      } catch (error) {
        console.error('Failed to stop scribe:', error);
      }
    }
  };

  const send = async () => {
    if (!input.trim() || busy) return;

    // Check for scribe commands
    const scribeIntent = detectScribeIntent(input.trim());
    if (scribeIntent.isStart || scribeIntent.isStop) {
      await handleScribeCommand(scribeIntent);
      setInput('');
      return;
    }

    const next = [...messages, { role: 'user', content: input.trim() } as Msg];
    setMessages(next);
    setInput('');
    setBusy(true);
    setRunId(id => id + 1);
  };

  const onDelta = (delta: string) => {
    setMessages(prev => {
      const last = prev[prev.length - 1];
      if (last?.role === 'assistant') {
        return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
      } else {
        return [...prev, { role: 'assistant', content: delta }];
      }
    });
  };

  const onDone = () => {
    console.log('🟢 LoreScribeModal: Setting busy to false');
    setBusy(false);
  };

  const onTool = (toolData: any) => {
    console.log('[lore-modal] Tool executed:', toolData);
  };

  // Auto-scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Render chat interface for Lore tab
  const renderLoreTab = () => (
    <div className="h-full flex flex-col">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-neutral-100'
            }`}>
              <div className="whitespace-pre-wrap">{msg.content}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-neutral-800">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
            placeholder="Ask about Starholder lore, or use 'start scribe' to begin documentation..."
            className="flex-1 bg-neutral-900 border border-neutral-700 rounded-md px-3 py-2 text-white placeholder-neutral-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={busy}
          />
          <Button onClick={send} disabled={busy || !input.trim()}>
            Send
          </Button>
        </div>
        <div className="mt-2 text-xs text-neutral-400">
          {busy ? 'Processing...' : 'Starholder Lore Agent'}
        </div>
      </div>
    </div>
  );

  // Render document editor for Scribe tab
  const renderScribeTab = () => (
    <ScribeEditor
      documentData={documentData}
      scribeEnabled={documentData?.scribe_enabled || false}
      onScribeToggle={(enabled) => {
        setDocumentData(prev => prev ? { ...prev, scribe_enabled: enabled } : null);
      }}
      onSave={(content) => {
        setDocumentData(prev => prev ? { ...prev, mdx: content } : null);
      }}
    />
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="max-w-5xl w-[92vw] h-[85vh] p-0 bg-neutral-950 border-neutral-800">
        <DialogTitle className="sr-only">Lore Chat & Scribe</DialogTitle>
        <DialogDescription className="sr-only">Conversational agent and document editor</DialogDescription>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'lore' | 'scribe')} className="h-full flex flex-col">
          <TabsList className="grid w-full grid-cols-2 bg-neutral-900 border-b border-neutral-800 rounded-none">
            <TabsTrigger value="lore" className="data-[state=active]:bg-neutral-800">
              Lore
            </TabsTrigger>
            <TabsTrigger value="scribe" className="data-[state=active]:bg-neutral-800">
              Scribe
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lore" className="flex-1 m-0">
            {renderLoreTab()}
          </TabsContent>

          <TabsContent value="scribe" className="flex-1 m-0">
            {renderScribeTab()}
          </TabsContent>
        </Tabs>

        {/* Stream processing */}
        {busy && runId > 0 && (
          <ConversationalStreamRunner
            messages={messages}
            onDelta={onDelta}
            onDone={onDone}
            lastResponseId={lastResponseId}
            setLastResponseId={setLastResponseId}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Stream runner for conversational mode (reuse from existing AgentChat)
function ConversationalStreamRunner({
  messages,
  onDelta,
  onDone,
  lastResponseId,
  setLastResponseId,
}: {
  messages: Msg[];
  onDelta: (d: string) => void;
  onDone: () => void;
  lastResponseId: string | null;
  setLastResponseId: (id: string | null) => void;
}) {
  useConversationalStream(messages, onDelta, onDone, lastResponseId, setLastResponseId);
  return null;
}

export { LoreScribeModal };
