"use client";

import { useEffect, useRef, useState } from 'react';
import { useAgentStream } from '@/app/visual-search/hooks/useAgentStream';

type Msg = { role: 'user' | 'assistant' | 'tool'; content: string };

function AgentStreamRunner({
  messages,
  onDelta,
  onTool,
  onDone,
}: {
  messages: Msg[];
  onDelta: (d: string) => void;
  onTool: (obj: any) => void;
  onDone: () => void;
}) {
  useAgentStream(messages, onDelta, onTool, onDone);
  return null;
}

export default function AgentChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState(0);
  const [pendingMessages, setPendingMessages] = useState<Msg[] | null>(null);
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
    setPendingMessages(next);
    setRunId((id) => id + 1);
  }

  return (
    <div className="flex flex-col h-[576px]">
      {busy && pendingMessages && (
        <AgentStreamRunner
          key={runId}
          messages={pendingMessages}
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


