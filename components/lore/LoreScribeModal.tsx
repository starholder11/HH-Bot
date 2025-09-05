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
  setMessages?: (messages: Msg[]) => void;
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
  onSave: (data: { content: string; slug: string; title: string }) => void;
}) {
  const [content, setContent] = useState(documentData?.mdx || '');
  const [title, setTitle] = useState(documentData?.title || '');
  const [slug, setSlug] = useState(documentData?.slug || '');
  const [isToggling, setIsToggling] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [commitOnSave, setCommitOnSave] = useState(false);
  const [lastScribeUpdate, setLastScribeUpdate] = useState<string | null>(null);
  const [isScribeUpdating, setIsScribeUpdating] = useState(false);

  // Update content when documentData changes
  useEffect(() => {
    if (documentData?.mdx) {
      setContent(documentData.mdx);
    }
    if (documentData?.title) {
      setTitle(documentData.title);
    }
    if (documentData?.slug) {
      setSlug(documentData.slug);
    }
  }, [documentData?.mdx, documentData?.title, documentData?.slug]);

  // Real-time scribe update polling
  useEffect(() => {
    if (!scribeEnabled || !(documentData as any)?.id) return;
    
    const interval = setInterval(async () => {
      try {
        setIsScribeUpdating(true);
        
        // Check for scribe updates from Lambda
        const response = await fetch(`/api/media-assets/${(documentData as any).id}`, {
          cache: 'no-store'
        });
        
        if (response.ok) {
          const data = await response.json();
          const asset = data.asset;
          const lastUpdate = asset?.metadata?.last_scribe_update;
          
          if (lastUpdate && lastUpdate !== lastScribeUpdate) {
            console.log('📝 Scribe update detected, refreshing content');
            setLastScribeUpdate(lastUpdate);
            
            // Update content with new scribe content
            setContent(asset.content || '');
            
            // Brief visual feedback
            const event = new CustomEvent('scribe-updated', { 
              detail: { timestamp: lastUpdate, slug: asset.metadata?.slug }
            });
            window.dispatchEvent(event);
          }
        }
      } catch (error) {
        console.error('Failed to check for scribe updates:', error);
      } finally {
        setIsScribeUpdating(false);
      }
    }, 5000); // Poll every 5 seconds for updates
    
    return () => clearInterval(interval);
  }, [scribeEnabled, (documentData as any)?.id, lastScribeUpdate]);

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
      const payload = {
        slug: slug || documentData.slug,
        title: title || documentData.title,
        categories: ['lore', 'conversation'],
        source: 'conversation',
        status: commitOnSave ? 'committed' : 'draft',
        mdx: content,
        commitOnSave: commitOnSave,
        scribe_enabled: scribeEnabled,
        conversation_id: documentData.conversation_id
      };

      // For scribe, we should update the existing text asset that's referenced in the documentData
      // The documentData should contain the ID of the text asset created by scribe start
      let existingAssetId = null;

      // Check if documentData has an ID (new S3-based scribe)
      if ((documentData as any)?.id) {
        existingAssetId = (documentData as any).id;
        console.log('[scribe] Using existing S3 text asset ID from documentData:', existingAssetId);
      } else if (documentData?.slug) {
        // Fallback: try to find by slug for backward compatibility
        try {
          const assetsResponse = await fetch('/api/media-assets?type=text');
          if (assetsResponse.ok) {
            const assetsData = await assetsResponse.json();
            const existingAsset = assetsData.assets?.find((asset: any) =>
              asset.metadata?.slug === documentData.slug
            );
            if (existingAsset) {
              existingAssetId = existingAsset.id;
              console.log('[scribe] Found existing S3 text asset by slug:', existingAssetId);
            }
          }
        } catch (e) {
          console.warn('[scribe] Failed to check for existing asset:', e);
        }
      }

      const s3TextAsset = {
        id: existingAssetId || crypto.randomUUID(),
        media_type: 'text',
        title: title || documentData.title,
        content: content,
        date: new Date().toISOString(),
        filename: `${slug || documentData.slug}.md`,
        s3_url: `media-labeling/assets/${crypto.randomUUID()}.json`,
        cloudflare_url: '',
        description: `Text asset: ${title || documentData.title}`,
        metadata: {
          slug: slug || documentData.slug,
          source: 'conversation',
          status: commitOnSave ? 'published' : 'draft',
          categories: ['lore', 'conversation'],
          scribe_enabled: scribeEnabled,
          conversation_id: documentData.conversation_id,
          word_count: content.split(/\s+/).filter(word => word.length > 0).length,
          character_count: content.length,
          reading_time_minutes: Math.ceil(content.split(/\s+/).filter(word => word.length > 0).length / 200),
          language: 'en',
          migrated_from_git: false,
        },
        ai_labels: {
          scenes: [],
          objects: [],
          style: [],
          mood: [],
          themes: [],
          confidence_scores: {},
        },
        manual_labels: {
          scenes: [],
          objects: [],
          style: [],
          mood: [],
          themes: [],
          custom_tags: [],
          topics: [],
          genres: [],
          content_type: [],
        },
        processing_status: {
          upload: 'completed',
          metadata_extraction: 'completed',
          ai_labeling: 'not_started',
          manual_review: 'pending',
          content_analysis: 'pending',
          search_indexing: 'pending',
        },
        timestamps: {
          uploaded: new Date().toISOString(),
          metadata_extracted: new Date().toISOString(),
          labeled_ai: null,
          labeled_reviewed: null,
        },
        labeling_complete: false,
        project_id: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      console.log('[scribe] Saving S3 text asset:', {
        id: s3TextAsset.id,
        slug: s3TextAsset.metadata.slug,
        isUpdate: !!existingAssetId
      });

      const response = await fetch(existingAssetId ? `/api/media-assets/${existingAssetId}` : '/api/media-assets', {
        method: existingAssetId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(s3TextAsset)
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
        // Persist edited title/slug back into parent state so UI doesn't revert
        try {
          const savedSlug = json?.slug || slug || documentData.slug;
          const savedTitle = title || documentData.title;
          // Update local fields too to reflect any slug normalization on backend
          setSlug(savedSlug);
          setTitle(savedTitle);
          onSave({ content, slug: savedSlug, title: savedTitle });
          console.log('[scribe] Document saved successfully');

          // If a layout was created for this doc, update any content_ref items referencing the old slug
          const layoutId = (documentData as any)?.layoutId;
          const oldSlug = documentData.slug;
          if (layoutId && oldSlug && savedSlug && savedSlug !== oldSlug) {
            try {
              const getRes = await fetch(`/api/media-assets/${encodeURIComponent(layoutId)}`);
              if (getRes.ok) {
                const assetJson = await getRes.json();
                const layoutAsset = assetJson?.asset || assetJson;
                const items = (layoutAsset?.layout_data?.items || []) as any[];
                const updatedItems = items.map((it: any) => {
                  if (it?.type === 'content_ref' && ((it.refId || '').includes(oldSlug) || (it.contentId || '').includes(oldSlug))) {
                    const newRef = `text_timeline/${savedSlug}`;
                    return { ...it, refId: newRef, contentId: newRef, snippet: savedTitle || it.snippet };
                  }
                  return it;
                });
                const updatedLayoutData = { ...(layoutAsset?.layout_data || {}), items: updatedItems };
                await fetch(`/api/media-assets/${encodeURIComponent(layoutId)}`, {
                  method: 'PUT',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ layout_data: updatedLayoutData })
                });
                console.log('[scribe] Updated layout item refs from', oldSlug, 'to', savedSlug);
              }
            } catch (e) {
              console.warn('[scribe] Failed to update layout item refs after slug change:', (e as Error)?.message || e);
            }
          }
        } catch {}
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
      <div className="flex-shrink-0 p-4 border-b border-neutral-800 bg-neutral-950">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h3 className="text-lg font-semibold text-white">
              {title || 'Untitled Document'}
            </h3>
            <div className="flex items-center gap-2 text-sm text-neutral-400">
              <div className={`w-2 h-2 rounded-full ${
                scribeEnabled 
                  ? isScribeUpdating 
                    ? 'bg-yellow-500 animate-pulse' 
                    : 'bg-green-500'
                  : 'bg-neutral-600'
              }`} />
              <span>
                {scribeEnabled 
                  ? isScribeUpdating 
                    ? 'AI updating document...' 
                    : 'AI monitoring conversation'
                  : 'Manual editing mode'
                }
              </span>
              {lastScribeUpdate && (
                <span className="text-xs text-neutral-500">
                  Last AI update: {new Date(lastScribeUpdate).toLocaleTimeString()}
                </span>
              )}
            </div>
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

        {/* Title and Slug input fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Document title"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-300 mb-1">
              Slug
            </label>
            <input
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full px-3 py-2 bg-neutral-800 border border-neutral-600 rounded-md text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="document-slug"
            />
          </div>
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
  setMessages: externalSetMessages,
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
  const setMessages = externalSetMessages || setInternalMessages;
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
      // If documentContext is provided, use it directly (from Continue Conversation)
      if (documentContext && documentContext.length > 0) {
        setDocumentData({
          slug: documentSlug,
          title: documentSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          mdx: documentContext,
          scribe_enabled: true, // Enable scribe for continue conversation
          conversation_id: conversationId || `conv_${Date.now()}`
        });
      } else {
        // Otherwise load from API
        loadDocumentData();
      }
    }
  }, [documentSlug, isOpen, documentContext, conversationId]);

  // Add greeting message when opening with context
  useEffect(() => {
    if (greetingContext && isOpen && messages.length === 0 && setMessages) {
      // Generate a contextual greeting based on the document content
      const generateContextualGreeting = async () => {
        if (documentContext && documentContext.length > 200) {
          try {
            // Send the content to the lore agent to generate a contextual greeting
            const response = await fetch('/api/agent-lore', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                messages: [{
                  role: 'user',
                  content: `Based on this document content, give me a brief greeting and tell me something interesting about what's in this text. Keep it conversational and engaging. Here's the content: ${documentContext.substring(0, 1000)}...`
                }],
                documentContext: documentContext,
                conversationId: conversationId,
                scribeEnabled: true
              })
            });

            if (response.ok && response.headers.get('content-type')?.includes('text/plain')) {
              // Handle streaming response
              const reader = response.body?.getReader();
              if (reader) {
                const decoder = new TextDecoder();
                let greetingText = '';
                let buffer = '';

                while (true) {
                  const { done, value } = await reader.read();
                  if (done) break;

                  const chunk = decoder.decode(value, { stream: true });
                  buffer += chunk;
                  const lines = buffer.split('\n');
                  buffer = lines.pop() || '';

                  for (const line of lines) {
                    if (line.startsWith('data: ')) {
                      try {
                        const data = JSON.parse(line.slice(6));
                        if (data.type === 'content') {
                          greetingText += data.delta;
                        }
                      } catch {}
                    }
                  }
                }

                if (greetingText.trim()) {
                  setMessages([{ role: 'assistant', content: greetingText.trim() }]);
                  return;
                }
              }
            }
          } catch (error) {
            console.error('Failed to generate contextual greeting:', error);
          }
        }

        // Fallback to simple greeting
        setMessages([{ role: 'assistant', content: greetingContext }]);
      };

      generateContextualGreeting();
    }
  }, [greetingContext, isOpen, setMessages, documentContext, conversationId]);

  const loadDocumentData = async () => {
    if (!documentSlug) return;

    try {
      // Try primary text-asset endpoint first
      let response = await fetch(`/api/text-assets/${encodeURIComponent(documentSlug)}`);
      if (response.ok) {
        const data = await response.json();
        setDocumentData({
          slug: data.slug,
          title: data.title,
          mdx: data.mdx,
          scribe_enabled: data.scribe_enabled || false,
          conversation_id: data.conversation_id || conversationId
        });
        return;
      }

      // Fallback to GitHub-backed content fetch (mirrors layout editor behavior)
      response = await fetch(`/api/internal/get-content/${encodeURIComponent(documentSlug)}`);
      if (response.ok) {
        const data = await response.json();
        setDocumentData({
          slug: documentSlug,
          title: (data && data.folderName) ? data.folderName.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase()) : (documentSlug.replace(/-/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())),
          mdx: data?.content || '',
          scribe_enabled: false,
          conversation_id: conversationId
        });
        return;
      }

      // Final fallback for missing documents
      setDocumentData({
        slug: documentSlug,
        title: documentSlug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        mdx: documentContext || '',
        scribe_enabled: false,
        conversation_id: conversationId
      });
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

          // Immediately create initial Git-backed doc so layouts won't 404
          try {
            const commitPref = (() => { try { return localStorage.getItem('text-assets-commit-on-save') === 'true'; } catch { return false; } })();
            await fetch('/api/text-assets', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                slug: result.slug,
                title: result.title,
                categories: ['lore', 'conversation'],
                source: 'conversation',
                status: 'draft',
                mdx: `# ${result.title}\n\n*The scribe will populate this document as your conversation continues...*`,
                commitOnSave: commitPref,
                scribe_enabled: true,
                conversation_id: result.conversationId
              })
            });
          } catch (e) {
            console.warn('[SCRIBE DEBUG] Initial doc save failed (non-blocking):', e);
          }

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
        const errorText = await response.text();
        throw new Error(`Agent response failed: ${response.status} - ${errorText}`);
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
            id: result.id, // CRITICAL: Store the UUID for S3 text asset updates
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

          // Note: S3 text asset is already created by the backend /api/chat/background-doc/start
          // No need for additional git-based file creation
          console.log('[SCRIBE DEBUG] S3 text asset created by backend, skipping git creation');

          // Fallback: if backend did not return a layoutId, create one now via frontend API
          if (!result.layoutId && result.slug) {
            try {
              console.log('🔍 [SCRIBE DEBUG] Creating layout fallback via /api/media-assets (same as Workshop)');
              const layoutId = `layout_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
              const now = new Date().toISOString();

              const resp = await fetch('/api/media-assets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: layoutId,
                  filename: `scribe_layout_${Date.now()}.json`,
                  title: `${result.title} - Layout`,
                  description: `Layout for ${result.title}`,
                  media_type: 'layout',
                  layout_type: 'blueprint_composer',
                  s3_url: `layouts/${layoutId}.json`,
                  cloudflare_url: '',
                  layout_data: {
                    designSize: { width: 1200, height: 800 },
                    cellSize: 20,
                    styling: {
                      theme: 'dark',
                      colors: {
                        background: '#0b0b0b',
                        text: '#ffffff',
                        primary: '#3b82f6',
                        secondary: '#6b7280',
                        accent: '#8b5cf6'
                      },
                      typography: {
                        fontFamily: 'system-ui, -apple-system, sans-serif',
                        headingFont: 'system-ui, -apple-system, sans-serif',
                        bodyFont: 'system-ui, -apple-system, sans-serif'
                      }
                    },
                    items: [
                      {
                        id: `text_${Date.now()}`,
                        type: 'content_ref',
                        contentType: 'text',
                        refId: result.id || `text_timeline/${result.slug}`, // Use UUID if available (S3), fallback to slug (git)
                        snippet: result.title,
                        title: result.title,
                        x: 0, y: 0, w: 640, h: 480,
                        nx: 0, ny: 0, nw: 640/1200, nh: 480/800,
                        transform: {}
                      }
                    ]
                  },
                  html: '',
                  css: '',
                  created_at: now,
                  updated_at: now,
                  timestamps: {
                    created: now,
                    updated: now
                  },
                  processing_status: {
                    created: 'completed',
                    html_generated: 'pending'
                  },
                  ai_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], confidence_scores: {} },
                  manual_labels: { scenes: [], objects: [], style: [], mood: [], themes: [], custom_tags: [] },
                  labeling_complete: false
                })
              });
              if (resp.ok) {
                const json = await resp.json();
                const createdLayoutId = json.asset?.id || json.id || layoutId;
                const layoutUrl = `/layout-editor/${createdLayoutId}`;
                console.log('🔍 [SCRIBE DEBUG] Fallback layout created:', { layoutId: createdLayoutId, layoutUrl });
                setDocumentData(prev => prev ? { ...prev, layoutId: createdLayoutId, layoutUrl } as any : prev);
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
      let buffer = ''; // Buffer for incomplete lines

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Add chunk to buffer and process complete lines
        buffer += chunk;
        const lines = buffer.split('\n');

        // Keep the last line in buffer (might be incomplete)
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const dataStr = line.slice(6);
              const data = JSON.parse(dataStr);

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
              } else if (data.type === 'done') {
                break;
              }
            } catch (e) {
              // Ignore JSON parse errors for incomplete chunks
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
            onChange={(e) => { e.stopPropagation(); setInput(e.target.value); }}
            onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); } }}
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
      onSave={({ content, slug, title }) => {
        setDocumentData(prev => prev ? { ...prev, mdx: content, slug, title } : null);
      }}
    />
  );

  return (
        <Dialog open={isOpen} onOpenChange={() => {
          // Ignore automatic close attempts; explicit close button controls closing
        }}>
      <DialogContent 
        onOpenAutoFocus={(e) => e.preventDefault()} 
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        onKeyDownCapture={(e) => { e.stopPropagation(); }}
        className="max-w-5xl w-[92vw] h-[85vh] p-0 bg-neutral-950 border-neutral-800 flex flex-col"
      >
        <DialogTitle className="sr-only">Lore Chat & Scribe</DialogTitle>
        <DialogDescription className="sr-only">Conversational agent and document editor</DialogDescription>

        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'lore' | 'scribe')} className="h-full flex flex-col min-h-0">
          <div className="flex items-center border-b border-neutral-800 bg-neutral-900 flex-shrink-0">
            <TabsList className="grid grid-cols-2 bg-transparent border-0 rounded-none flex-1">
              <TabsTrigger value="lore" className="data-[state=active]:bg-neutral-800">
                Lore
              </TabsTrigger>
              <TabsTrigger value="scribe" className="data-[state=active]:bg-neutral-800">
                Scribe
              </TabsTrigger>
            </TabsList>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={onClose}
              className="mr-2 text-neutral-400 hover:text-white"
            >
              ✕
            </Button>
          </div>

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

