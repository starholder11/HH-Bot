"use client";

import { useState } from 'react';

type Msg = { role: 'user' | 'assistant' | 'tool'; content: string };

export default function AgentChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

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
      // naive parse of lines like data:{"type":"text-delta","delta":"..."}
      for (const line of chunk.split('\n')) {
        if (!line.startsWith('data:')) continue;
        const payload = JSON.parse(line.slice(5));
        if (payload.type === 'text-delta' || payload.type === 'content' || payload.delta) {
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
          // Display tool results as a separate message
          setMessages((prev) => [...prev, { role: 'tool', content: JSON.stringify(payload.result) }]);
        }
      }
    }
    setBusy(false);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-3 p-3 border rounded-md">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
            <div className="inline-block max-w-[80%] px-3 py-2 rounded bg-slate-100">
              <pre className="whitespace-pre-wrap text-sm">{m.content}</pre>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          className="flex-1 border rounded px-3 py-2"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') send();
          }}
          placeholder="Ask the agent to search, pin, or generate..."
        />
        <button className="px-4 py-2 rounded bg-blue-600 text-white disabled:opacity-50" onClick={send} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}


