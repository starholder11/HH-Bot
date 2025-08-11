"use client";

import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'assistant' | 'tool'; content: string };

export default function AgentChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    if (!input.trim() || busy) return;
    const next = [...messages, { role: 'user', content: input.trim() } as Msg];
    setMessages(next);
    setInput('');
    setBusy(true);
    
    console.log('🟨 AGENT FIXED v3: PIN & GENERATE ROUTING FIXED: Sending request:', input.trim());
    
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: next }),
    });
    if (!res.body) {
      setBusy(false);
      return;
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let assistant = '';
    let buffer = ''; // Buffer for incomplete chunks
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
                  console.log('🟨 AGENT FIXED v3: Raw chunk:', chunk);
      
      // Add to buffer and process complete lines
      buffer += chunk;
      const lines = buffer.split('\n');
      // Keep the last line in buffer (might be incomplete)
      buffer = lines.pop() || '';
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        console.log('🔵 AgentChat: Processing line:', trimmed);
        if (trimmed.startsWith('0:')) {
          // Vercel AI SDK text delta channel
          let delta: any = trimmed.slice(2);
          try { delta = JSON.parse(delta); } catch {}
          if (typeof delta !== 'string') delta = String(delta ?? '');
          assistant += delta;
          setMessages((prev) => {
            const hasAssistant = prev[prev.length - 1]?.role === 'assistant';
            if (hasAssistant) {
              const copy = prev.slice();
              copy[copy.length - 1] = { role: 'assistant', content: assistant } as Msg;
              return copy;
            }
            return [...prev, { role: 'assistant', content: assistant } as Msg];
          });
          continue;
        }
        if (trimmed.startsWith('data:')) {
          // legacy/data event fallback
          try {
            const payload = JSON.parse(trimmed.slice(5));
            if (payload.delta || payload.text) {
              assistant += payload.delta || payload.text || '';
              setMessages((prev) => {
                const hasAssistant = prev[prev.length - 1]?.role === 'assistant';
                if (hasAssistant) {
                  const copy = prev.slice();
                  copy[copy.length - 1] = { role: 'assistant', content: assistant } as Msg;
                  return copy;
                }
                return [...prev, { role: 'assistant', content: assistant } as Msg];
              });
            } else {
              // Tool results in SSE: some providers send { type: 'tool-result', result: {...} }
              // Others may send the result object directly
              const possibleResult = payload?.result ?? payload;
              if (possibleResult) {
                try {
                  if (possibleResult?.action === 'showResults' && typeof window !== 'undefined') {
                    (window as any).__agentApi?.showResults?.(possibleResult.payload);
                    return;
                  }
                  if (possibleResult?.results && typeof window !== 'undefined') {
                    // Direct search payload without action wrapper
                    (window as any).__agentApi?.showResults?.(possibleResult);
                    return;
                  }
                  if (possibleResult?.action === 'pinToCanvas' && typeof window !== 'undefined') {
                    (window as any).__agentApi?.pin?.(possibleResult);
                    return;
                  }
                } catch {}
                // Fallback: show raw tool JSON
                setMessages((prev) => [...prev, { role: 'tool', content: JSON.stringify(possibleResult, null, 2) }]);
              }
            }
          } catch {}
          continue;
        }
        // Generic channel: e.g., "1:{...}", "2:{...}" etc. Try to parse JSON after first colon
        const idx = trimmed.indexOf(':');
        if (idx > 0) {
          try {
            const obj = JSON.parse(trimmed.slice(idx + 1));
            console.log('🔵 AgentChat: Parsed tool object:', obj);
            
            const result = obj?.result ?? obj;
            // Some providers send arrays of results; normalize to first
            const normalized = Array.isArray(result) ? result[0] : result;
            
            console.log('🔵 AgentChat: Normalized result:', normalized);
            console.log('🔵 AgentChat: Checking for showResults action:', normalized?.action);
            
            // Handle action-based tool results (showResults, pinToCanvas, etc.)
            if (normalized?.action === 'showResults' && typeof window !== 'undefined') {
              console.log('🟢 AgentChat: Calling showResults with payload:', normalized.payload);
              (window as any).__agentApi?.showResults?.(normalized.payload);
              continue;
            }
            if (normalized?.action === 'pinToCanvas' && typeof window !== 'undefined') {
              console.log('🟢 AgentChat: Calling pinToCanvas with payload:', normalized.payload);
              (window as any).__agentApi?.pin?.(normalized.payload);
              continue;
            }
            if (normalized?.action === 'prepareGenerate' && typeof window !== 'undefined') {
              console.log('🟢 AgentChat: Calling prepareGenerate with payload:', normalized.payload);
              (window as any).__agentApi?.prepareGenerate?.(normalized.payload);
              continue;
            }
            if (normalized?.action === 'showOutput' && typeof window !== 'undefined') {
              console.log('🟢 AgentChat: Calling showOutput with payload:', normalized.payload);
              (window as any).__agentApi?.showOutput?.(normalized.payload);
              continue;
            }
            if (normalized?.action === 'agentStatus' && typeof window !== 'undefined') {
              console.log('🟢 AgentChat: Calling agentStatus with payload:', normalized.payload);
              // Show readable status in chat
              setMessages((prev) => [...prev, { role: 'tool', content: JSON.stringify(normalized.payload, null, 2) }]);
              continue;
            }
            if (normalized?.action) {
              console.log('🔴 AgentChat: Unknown action found:', normalized.action);
            } else {
              console.log('🔴 AgentChat: No action property found');
            }

            
            // Handle plain string tool results (chat tool responses)
            console.log('🔵 AgentChat: Checking if normalized is string:', typeof normalized, normalized);
            if (typeof normalized === 'string' && normalized.trim()) {
              console.log('🟢 AgentChat: YES - Displaying string result as assistant message:', normalized);
              setMessages((prev) => {
                console.log('🟢 AgentChat: Adding to messages:', [...prev, { role: 'assistant', content: normalized }]);
                return [...prev, { role: 'assistant', content: normalized }];
              });
              continue;
            } else {
              console.log('🔴 AgentChat: NOT a string, skipping:', normalized);
            }
          } catch {}
        }
      }
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col h-[576px]">
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
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 px-4 py-3 rounded-xl border border-neutral-800 bg-neutral-900 text-neutral-100 placeholder-neutral-500 focus:outline-none focus:ring-2 ring-neutral-700"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Ask the agent to search, pin, or generate…"
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
  );
}


