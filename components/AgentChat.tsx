"use client";

import { useEffect, useRef, useState } from 'react';
import { useAgentStream } from '@/app/visual-search/hooks/useAgentStream';

type Msg = { role: 'user' | 'assistant' | 'tool'; content: string };

// Intent classification for routing between agents
function classifyIntent(message: string): 'task' | 'conversational' {
  const msg = message.toLowerCase().trim();

  // Task-oriented patterns (workshop agent)
  const taskPatterns = [
    // Search and discovery
    /\b(search|find|show|pull\s*up|dig\s*up|look.*up|gimme|give me|show me|bring up|display)\b.*\b(videos?|images?|pictures?|photos?|pics?|audio|songs?|music|tracks?|media|content|files?|assets?)\b/i,
    /\b(videos?|images?|pictures?|photos?|pics?|audio|songs?|music|tracks?|media|content|files?|assets?)\b.*\b(of|about|with|for|from|like|that|related|containing)\b/i,
    /\b(pics?|images?|photos?)\b/i,

    // Generation and creation
    /\b(make|create|generate|produce|build|design|craft|draw|paint|render|synthesize)\b/i,

    // Canvas and workspace operations
    /\b(pin|canvas|workspace|board|layout|arrange|organize)\b/i,

    // File operations
    /\b(save|name|rename|upload|download|export|import)\b/i,

    // Technical operations
    /\b(lora|model|generate|workflow|process|analyze)\b/i
  ];

  // Conversational patterns (chat agent)
  const conversationalPatterns = [
    // Greetings and social
    /\b(hi|hello|hey|yo|sup|what's up|wassup|good morning|good afternoon|good evening)\b/i,

    // Questions about lore, story, characters
    /\b(who is|what is|tell me about|explain|story|lore|character|starholder|background|history)\b/i,

    // General conversation
    /\b(how are you|what do you think|opinion|feel|believe|like|dislike)\b/i,

    // Help and guidance (non-technical)
    /\b(help|advice|suggest|recommend|guidance)\b(?!.*\b(search|find|generate|create|make)\b)/i,

    // Questions about the world/universe
    /\b(universe|world|setting|place|location|time|era|period)\b/i
  ];

  // Check task patterns first (more specific)
  for (const pattern of taskPatterns) {
    if (pattern.test(msg)) {
      return 'task';
    }
  }

  // Check conversational patterns
  for (const pattern of conversationalPatterns) {
    if (pattern.test(msg)) {
      return 'conversational';
    }
  }

  // Default to conversational for ambiguous cases
  // This encourages more natural conversation flow
  // But if media nouns appear without clear conversational cues, treat as task
  if (/\b(pics?|images?|photos?|videos?|audio|tracks?|media)\b/i.test(msg)) return 'task';
  return 'conversational';
}

// Import the conversational stream hook
import { useConversationalStream } from '@/app/workshop/hooks/useConversationalStream';

function AgentStreamRunner({
  messages,
  onDelta,
  onTool,
  onDone,
  conversationalContext,
}: {
  messages: Msg[];
  onDelta: (d: string) => void;
  onTool: (obj: any) => void;
  onDone: () => void;
  conversationalContext?: string;
}) {
  // Enhance messages with conversational context if available
  const enhancedMessages = conversationalContext ? [
    ...messages.slice(0, -1), // All messages except the last user message
    {
      role: 'user' as const,
      content: `CONTEXT FROM PREVIOUS CONVERSATION: 
"${conversationalContext.slice(-800)}"

USER REQUEST: ${messages[messages.length - 1]?.content || ''}

Please use the context above to understand references like "him", "her", "it", "that character", etc. in the user request. Generate content based on the rich descriptions provided in the context.`
    }
  ] : messages;

  useAgentStream(enhancedMessages, onDelta, onTool, onDone);
  return null;
}

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

export default function AgentChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState(0);
  const [pendingMessages, setPendingMessages] = useState<Msg[] | null>(null);
  const [currentAgent, setCurrentAgent] = useState<'task' | 'conversational'>('conversational');
  const [lastResponseId, setLastResponseId] = useState<string | null>(null);
  const [conversationalContext, setConversationalContext] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

    async function send() {
    if (!input.trim() || busy) return;
    
    // Classify the intent to determine which agent to use
    const intent = classifyIntent(input.trim());
    console.log('🟡 AgentChat: Classified intent for "' + input.trim() + '" as:', intent);
    
    // If switching from task to conversational, reset context for fresh conversation
    // If switching from conversational to task, keep the context
    if (currentAgent === 'task' && intent === 'conversational') {
      setConversationalContext('');
    } else if (currentAgent === 'conversational' && intent === 'conversational') {
      // Starting a new conversational session, reset context
      setConversationalContext('');
    }
    
    setCurrentAgent(intent);
    
    const next = [...messages, { role: 'user', content: input.trim() } as Msg];
    setMessages(next);
    setInput('');
    console.log('🟡 AgentChat: Setting busy to true');
    setBusy(true);
    setPendingMessages(next);
    setRunId((id) => id + 1);
  }

  return (
    <div className="flex flex-col h-[576px]">
      {busy && pendingMessages && currentAgent === 'task' && (
        <AgentStreamRunner
          key={runId}
          messages={pendingMessages}
          conversationalContext={conversationalContext}
          onDelta={(delta) => {
            // Accumulate assistant text in last assistant message
            setMessages((prev) => {
              const out = prev.slice();
              const last = out[out.length - 1];
              if (last?.role === 'assistant') {
                out[out.length - 1] = { role: 'assistant', content: String((last as any).content || '') + delta } as Msg;
              } else {
                out.push({ role: 'assistant', content: delta } as Msg);
              }
              return out;
            });
          }}
          onTool={(possibleResult) => {
            try {
              const payload = possibleResult?.payload ?? possibleResult;
              const action = possibleResult?.action;

              // Handle chat action - this should be clean assistant text
              if (action === 'chat' && payload?.text) {
                setMessages((prev) => [...prev, { role: 'assistant', content: String(payload.text) } as Msg]);
                return;
              }

              // Handle search action
              if (action === 'searchUnified') {
                (window as any).__agentApi?.searchUnified?.(payload);
                return;
              }

              // Handle showResults action
              if (action === 'showResults') {
                (window as any).__agentApi?.showResults?.(payload);
                return;
              }

              // Legacy fallback for results without action
              if (possibleResult?.results) {
                (window as any).__agentApi?.showResults?.(possibleResult);
                return;
              }

              // Handle other UI actions
              if (action === 'pinToCanvas') {
                (window as any).__agentApi?.pin?.(payload || possibleResult);
                return;
              }
              if (action === 'prepareGenerate') {
                (window as any).__agentApi?.prepareGenerate?.(payload);
                return;
              }
              if (action === 'requestPinnedThenGenerate') {
                (window as any).__agentApi?.requestPinnedThenGenerate?.(payload);
                return;
              }
              if (action === 'showOutput') {
                (window as any).__agentApi?.showOutput?.(payload);
                return;
              }
              if (action === 'openCanvas') {
                (window as any).__agentApi?.openCanvas?.(payload);
                return;
              }
              if (action === 'nameImage') {
                (window as any).__agentApi?.nameImage?.(payload);
                return;
              }
              if (action === 'saveImage') {
                (window as any).__agentApi?.saveImage?.(payload);
                return;
              }
              if (action === 'useCanvasLora') {
                (window as any).__agentApi?.useCanvasLora?.(payload);
                return;
              }

              // If we get here, it's unhandled - don't show raw JSON
              console.log('Unhandled agent tool result:', possibleResult);
            } catch (e) {
              console.error('Error handling agent tool result:', e);
            }
          }}
          onDone={() => {
            setBusy(false);
            setPendingMessages(null);
          }}
        />
      )}
      {busy && pendingMessages && currentAgent === 'conversational' && (
        <ConversationalStreamRunner
          key={runId}
          messages={pendingMessages}
          onDelta={(delta) => {
            console.log('🟢 AgentChat: ConversationalStreamRunner onDelta called with:', delta);
            // Accumulate assistant text in last assistant message
            setMessages((prev) => {
              const out = prev.slice();
              const last = out[out.length - 1];
              if (last?.role === 'assistant') {
                out[out.length - 1] = { role: 'assistant', content: String((last as any).content || '') + delta } as Msg;
              } else {
                out.push({ role: 'assistant', content: delta } as Msg);
              }
              return out;
            });
            
            // Capture conversational context for potential task agent use
            // Only capture if this is a fresh conversational response (not continuing previous context)
            if (currentAgent === 'conversational') {
              setConversationalContext(prev => prev + delta);
            }
          }}
          onDone={() => {
            console.log('🟢 AgentChat: ConversationalStreamRunner onDone called - setting busy to false');
            console.log('🟡 AgentChat: Captured conversational context:', conversationalContext.slice(-200));
            setBusy(false);
            setPendingMessages(null);
          }}
          lastResponseId={lastResponseId}
          setLastResponseId={setLastResponseId}
        />
      )}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto space-y-3 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60"
      >
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div
              className={
                'inline-block max-w-[85%] px-4 py-3 rounded-2xl text-base leading-6 ' +
                (m.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : m.role === 'assistant'
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'bg-neutral-950 text-neutral-200 border border-neutral-800')
              }
            >
              <pre className="whitespace-pre-wrap break-words">{m.content}</pre>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 space-y-2">
        {/* Agent indicator */}
        <div className="flex items-center justify-between text-xs text-neutral-400">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${currentAgent === 'task' ? 'bg-blue-500' : 'bg-purple-500'}`}></div>
            <span>
              {currentAgent === 'task' ? 'Workshop Agent' : 'Starholder Lore Agent'}
            </span>
          </div>
          <div className="text-neutral-500">
            {busy ? 'Processing...' : 'Ready'}
          </div>
        </div>

        <div className="flex gap-2">
          <input
            className="flex-1 px-4 py-3 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 ring-neutral-700"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') send();
            }}
            placeholder="Ask about Starholder lore, or request to search, pin, or generate…"
          />
          <button
            className="px-5 py-3 rounded-xl bg-blue-600 text-white font-medium disabled:opacity-50"
            onClick={send}
            disabled={busy || !input.trim()}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}


