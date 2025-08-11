"use client";

import { useEffect, useRef, useState } from 'react';
import { useAgentStream } from '@/app/visual-search/hooks/useAgentStream';

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
    let assistant = '';
    useAgentStream(
      next,
      (delta) => {
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
      },
      (possibleResult) => {
        // Route tool actions to the window bridge
        try {
          const payload = possibleResult?.payload ?? possibleResult;
          const action = possibleResult?.action;
          if (action === 'showResults') (window as any).__agentApi?.showResults?.(payload);
          else if (possibleResult?.results) (window as any).__agentApi?.showResults?.(possibleResult);
          else if (action === 'pinToCanvas') (window as any).__agentApi?.pin?.(payload || possibleResult);
          else if (action === 'prepareGenerate') (window as any).__agentApi?.prepareGenerate?.(payload);
          else if (action === 'showOutput') (window as any).__agentApi?.showOutput?.(payload);
          else if (action === 'openCanvas') (window as any).__agentApi?.openCanvas?.(payload);
          else if (action === 'nameImage') (window as any).__agentApi?.nameImage?.(payload);
          else if (action === 'saveImage') (window as any).__agentApi?.saveImage?.(payload);
          else if (action === 'useCanvasLora') (window as any).__agentApi?.useCanvasLora?.(payload);
          else setMessages((prev) => [...prev, { role: 'tool', content: JSON.stringify(possibleResult, null, 2) }]);
        } catch {}
      },
      () => setBusy(false)
    );
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


