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
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value);
      for (const raw of chunk.split('\n')) {
        const line = raw.trim();
        if (!line) continue;
        if (line.startsWith('0:')) {
          // Vercel AI SDK text delta channel
          let delta: any = line.slice(2);
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
        if (line.startsWith('data:')) {
          // legacy/data event fallback
          try {
            const payload = JSON.parse(line.slice(5));
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
            } else if (payload.type === 'tool-call' && payload.result) {
              // If the tool returned a directive, call client bridge instead of dumping JSON
              try {
                const result = payload.result;
                if (result?.action === 'showResults' && typeof window !== 'undefined') {
                  (window as any).__agentApi?.showResults?.(result.payload);
                } else if (result?.action === 'pinToCanvas' && typeof window !== 'undefined') {
                  (window as any).__agentApi?.pin?.(result);
                } else {
                  setMessages((prev) => [...prev, { role: 'tool', content: JSON.stringify(result, null, 2) }]);
                }
              } catch {
                setMessages((prev) => [...prev, { role: 'tool', content: JSON.stringify(payload.result, null, 2) }]);
              }
            }
          } catch {}
          continue;
        }
      }
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col h-[720px]">
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
          placeholder="Ask the agent to search, pin, or gen…"
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


