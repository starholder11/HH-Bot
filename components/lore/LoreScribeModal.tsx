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
  // AgentChat state integration
  messages?: Msg[];
  input?: string;
  setInput?: (input: string) => void;
  busy?: boolean;
  setBusy?: (busy: boolean) => void;
  onSend?: () => void;
  lastResponseId?: string | null;
  setLastResponseId?: (id: string | null) => void;
  conversationalContext?: string;
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
      // Use exact same model as layout editor save
      const commitPref = (() => {
        try {
          return localStorage.getItem('text-assets-commit-on-save') === 'true';
        } catch {
          return false;
        }
      })();

      const payload = {
        slug: documentData.slug,
        title: documentData.title,
        categories: ['lore', 'conversation'],
        source: 'conversation',
        status: 'draft',
        mdx: content,
        commitOnSave: commitPref,
        scribe_enabled: scribeEnabled,
        conversation_id: documentData.conversation_id
      };

      console.log('[scribe] Saving text asset payload:', payload);
      const response = await fetch('/api/text-assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error(`Save failed (${response.status})`);
      }

      let json: any = null;
      try {
        json = await response.json();
      } catch {}

      console.log('[scribe] Save response:', { ok: response.ok, status: response.status, json });
      console.log('[scribe] Save response json details:', JSON.stringify(json, null, 2));

      if (response.ok && json?.success) {
        onSave(content);
        console.log('[scribe] Document saved successfully');
      } else {
        const errMsg = (json && (json.error || json.message)) || response.statusText || 'Unknown error';
        console.error('[scribe] Save failed:', { status: response.status, json });
        throw new Error(`Save failed: ${errMsg}`);
      }
    } catch (error) {
      console.error('Failed to save document:', error);
      alert(`Failed to save: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const openInLayoutEditor = () => {
    if (documentData?.slug) {
      console.log('🔍 [LAYOUT DEBUG] Current documentData:', JSON.stringify(documentData, null, 2));
      console.log('🔍 [LAYOUT DEBUG] layoutId:', (documentData as any).layoutId);
      console.log('🔍 [LAYOUT DEBUG] layoutUrl:', (documentData as any).layoutUrl);

      // Close modal and navigate to layout editor
      // Try layout-specific URL first, fallback to highlight
      const layoutUrl = (documentData as any).layoutUrl || `/visual-search?highlight=${documentData.slug}`;
      console.log('🔍 [LAYOUT DEBUG] Final layoutUrl to navigate to:', layoutUrl);

      // Check if the layout actually exists before navigating
      if ((documentData as any).layoutId) {
        console.log('🔍 [LAYOUT DEBUG] Layout ID exists, checking layout...');
        fetch(`/api/media-assets/${(documentData as any).layoutId}`)
          .then(resp => {
            console.log('🔍 [LAYOUT DEBUG] Layout check response status:', resp.status);
            return resp.json();
          })
          .then(data => {
            console.log('🔍 [LAYOUT DEBUG] Layout check data:', JSON.stringify(data, null, 2));
            window.location.href = layoutUrl;
          })
          .catch(err => {
            console.error('🔍 [LAYOUT DEBUG] Layout check failed:', err);
            window.location.href = layoutUrl;
          });
      } else {
        console.log('🔍 [LAYOUT DEBUG] No layout ID, using fallback URL');
        window.location.href = layoutUrl;
      }
    } else {
      console.error('🔍 [LAYOUT DEBUG] No documentData or slug available');
    }
  };

    return (
    <div className="h-full flex flex-col max-h-[75vh]">
      {/* Header with controls - fixed at top */}
      <div className="flex-shrink-0 flex justify-between items-center p-4 border-b border-neutral-800 bg-neutral-950">
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

      {/* Document Editor with proper scrolling */}
      <div className="flex-1 p-4 min-h-0">
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full h-full bg-neutral-900 border border-neutral-700 rounded-md p-4 text-white font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 [scrollbar-width:thin] [scrollbar-color:#3f3f46_transparent]"
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
  greetingContext,
  // AgentChat state (when integrated)
  messages: externalMessages,
  input: externalInput,
  setInput: externalSetInput,
  busy: externalBusy,
  setBusy: externalSetBusy,
  onSend: externalOnSend,
  lastResponseId: externalLastResponseId,
  setLastResponseId: externalSetLastResponseId,
  conversationalContext
}: LoreScribeModalProps) {
  const [activeTab, setActiveTab] = useState<'lore' | 'scribe'>(initialTab);
  const [documentData, setDocumentData] = useState<TextAssetData | null>(null);

  // Use external state if provided (integrated mode), otherwise internal state (standalone mode)
  const [internalMessages, setInternalMessages] = useState<Msg[]>([]);
  const [internalInput, setInternalInput] = useState('');
  const [internalBusy, setInternalBusy] = useState(false);
  const [internalRunId, setInternalRunId] = useState(0);
  const [internalLastResponseId, setInternalLastResponseId] = useState<string | null>(null);

  const messages = externalMessages || internalMessages;
  const setMessages = externalMessages ? undefined : setInternalMessages;
  const input = externalInput !== undefined ? externalInput : internalInput;
  const setInput = externalSetInput || setInternalInput;
  const busy = externalBusy !== undefined ? externalBusy : internalBusy;
  const setBusy = externalSetBusy || setInternalBusy;
  const lastResponseId = externalLastResponseId !== undefined ? externalLastResponseId : internalLastResponseId;
  const setLastResponseId = externalSetLastResponseId || setInternalLastResponseId;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Load document data when modal opens
  useEffect(() => {
    if (documentSlug && isOpen) {
      loadDocumentData();
    }
  }, [documentSlug, isOpen]);

  // Add greeting message when opening with context
  useEffect(() => {
    if (greetingContext && isOpen && messages.length === 0 && setMessages) {
      setMessages([{ role: 'assistant', content: greetingContext }]);
    }
  }, [greetingContext, isOpen, setMessages]);

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
            conversation_id: result.conversationId,
            layoutId: result.layoutId,
            layoutUrl: result.layoutUrl
          } as any);
          setActiveTab('scribe');

          // Add confirmation message with layout link
          const layoutLink = result.layoutUrl ? ` You can also view it in the [layout editor](${result.layoutUrl}).` : '';
          if (setMessages) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: `Started scribe for "${result.title}". I'll document our conversation as we chat. You can switch to the Scribe tab to see the document.${layoutLink}`
            }]);
          }
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
          if (setMessages) {
            setMessages(prev => [...prev, {
              role: 'assistant',
              content: 'Scribe stopped. You now have full editorial control of the document.'
            }]);
          }
        }
      } catch (error) {
        console.error('Failed to stop scribe:', error);
      }
    }
  };

  const send = async () => {
    if (!input.trim() || busy) return;

    console.log('🔍 [MODAL SEND] Modal send function called with:', input.trim());
    console.log('🔍 [MODAL SEND] Using /api/agent-lore route');

    // Always use modal-specific agent route that stays in modal context
    const next = [...messages, { role: 'user', content: input.trim() } as Msg];
    if (setMessages) {
      setMessages(next);
    }
    setInput('');
    setBusy(true);

    try {
      const response = await fetch('/api/agent-lore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next,
          documentContext: documentData?.mdx,
          conversationId: documentData?.conversation_id || conversationId,
          scribeEnabled: documentData?.scribe_enabled || false
        })
      });

      if (!response.ok) {
        throw new Error('Agent response failed');
      }

      // Check if it's a special scribe response
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const result = await response.json();

        if (result.type === 'scribe_started') {
          console.log('🔍 [SCRIBE DEBUG] Full scribe_started result:', JSON.stringify(result, null, 2));
          console.log('🔍 [SCRIBE DEBUG] layoutId:', result.layoutId);
          console.log('🔍 [SCRIBE DEBUG] layoutUrl:', result.layoutUrl);

          // Update document data and switch to scribe tab
          const newDocData = {
            slug: result.slug,
            title: result.title,
            mdx: `# ${result.title}\n\n*The scribe will populate this document as your conversation continues...*`,
            scribe_enabled: true,
            conversation_id: result.conversationId,
            layoutId: result.layoutId,
            layoutUrl: result.layoutUrl
          };

          console.log('🔍 [SCRIBE DEBUG] Setting documentData to:', JSON.stringify(newDocData, null, 2));
          setDocumentData(newDocData);
          setActiveTab('scribe');

          // Fallback: if backend did not return a layoutId, create one now via frontend API
          if (!result.layoutId && result.slug) {
            try {
              console.log('🔍 [SCRIBE DEBUG] Creating layout fallback via /api/layouts');
              const resp = await fetch('/api/layouts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  title: `${result.title} - Layout`,
                  description: `Layout for ${result.title}`,
                  layout_data: {
                    cellSize: 20,
                    designSize: { width: 1200, height: 800 },
                    items: [
                      {
                        id: `text_${Date.now()}`,
                        type: 'content_ref',
                        contentType: 'text',
                        refId: `text_timeline/${result.slug}`,
                        snippet: result.title,
                        title: result.title,
                        x: 0, y: 0, w: 640, h: 480,
                        nx: 0, ny: 0, nw: 640/1200, nh: 480/800,
                        transform: {}
                      }
                    ]
                  }
                })
              });
              if (resp.ok) {
                const json = await resp.json();
                const layoutId = json.id;
                const layoutUrl = `/layout-editor/${layoutId}`;
                console.log('🔍 [SCRIBE DEBUG] Fallback layout created:', { layoutId, layoutUrl });
                setDocumentData(prev => prev ? { ...prev, layoutId, layoutUrl } as any : prev);
              } else {
                console.warn('🔍 [SCRIBE DEBUG] Fallback layout create failed with status', resp.status);
              }
            } catch (e) {
              console.warn('🔍 [SCRIBE DEBUG] Fallback layout create error:', e);
            }
          }

          // Add confirmation message
          if (setMessages) {
            setMessages(prev => [...prev, { role: 'assistant', content: result.message }]);
          }
        } else if (result.type === 'scribe_stopped') {
          setDocumentData(prev => prev ? { ...prev, scribe_enabled: false } : null);
          if (setMessages) {
            setMessages(prev => [...prev, { role: 'assistant', content: result.message }]);
          }
        } else if (result.type === 'error') {
          if (setMessages) {
            setMessages(prev => [...prev, { role: 'assistant', content: result.message }]);
          }
        }

        setBusy(false);
        return;
      }

      // Handle streaming response for regular lore chat
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let assistantMessage = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'content') {
                assistantMessage += data.delta;
                // Update last assistant message
                if (setMessages) {
                  setMessages(prev => {
                    const updated = [...prev];
                    const lastMsg = updated[updated.length - 1];
                    if (lastMsg?.role === 'assistant') {
                      updated[updated.length - 1] = { ...lastMsg, content: assistantMessage };
                    } else {
                      updated.push({ role: 'assistant', content: assistantMessage });
                    }
                    return updated;
                  });
                }
              }
            } catch (e) {
              // Ignore JSON parse errors
            }
          }
        }
      }

    } catch (error) {
      console.error('Agent-lore request failed:', error);
      if (setMessages) {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, I had trouble responding. Please try again.'
        }]);
      }
    } finally {
      setBusy(false);
    }
  };

  const onDelta = (delta: string) => {
    // In integrated mode, AgentChat handles delta updates
    // In standalone mode, we handle them here
    if (setMessages) {
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') {
          return [...prev.slice(0, -1), { ...last, content: last.content + delta }];
        } else {
          return [...prev, { role: 'assistant', content: delta }];
        }
      });
    }
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
    <div className="h-full flex flex-col max-h-[75vh]">
      {/* Chat messages with proper scrolling */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0 [scrollbar-width:thin] [scrollbar-color:#3f3f46_transparent]"
        style={{ WebkitOverflowScrolling: 'touch' }}
      >
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white'
                : 'bg-neutral-800 text-neutral-100'
            }`}>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Input area - fixed at bottom */}
      <div className="flex-shrink-0 p-4 border-t border-neutral-800 bg-neutral-950">
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
      <DialogContent onOpenAutoFocus={(e) => e.preventDefault()} className="max-w-5xl w-[92vw] h-[85vh] p-0 bg-neutral-950 border-neutral-800 flex flex-col">
        <DialogTitle className="sr-only">Lore Chat & Scribe</DialogTitle>
        <DialogDescription className="sr-only">Conversational agent and document editor</DialogDescription>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'lore' | 'scribe')} className="h-full flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-2 bg-neutral-900 border-b border-neutral-800 rounded-none flex-shrink-0">
            <TabsTrigger value="lore" className="data-[state=active]:bg-neutral-800">
              Lore
            </TabsTrigger>
            <TabsTrigger value="scribe" className="data-[state=active]:bg-neutral-800">
              Scribe
            </TabsTrigger>
          </TabsList>

          <TabsContent value="lore" className="flex-1 m-0 min-h-0">
            {renderLoreTab()}
          </TabsContent>

          <TabsContent value="scribe" className="flex-1 m-0 min-h-0">
            {renderScribeTab()}
          </TabsContent>
        </Tabs>

        {/* Stream processing - only in standalone mode */}
        {busy && !externalMessages && internalRunId > 0 && (
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
