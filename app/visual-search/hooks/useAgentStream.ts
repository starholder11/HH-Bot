import { useEffect, useRef } from 'react';
import { debug } from '../utils/log';

type Msg = { role: 'user' | 'assistant' | 'tool'; content: string };

export function useAgentStream(messages: Msg[], onTextDelta: (delta: string) => void, onToolAction: (obj: any) => void, onDone: () => void) {
  const runningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use refs to avoid stale closures while keeping stable references
  const onTextDeltaRef = useRef(onTextDelta);
  const onToolActionRef = useRef(onToolAction);
  const onDoneRef = useRef(onDone);

  onTextDeltaRef.current = onTextDelta;
  onToolActionRef.current = onToolAction;
  onDoneRef.current = onDone;

  useEffect(() => {
    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const run = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages }),
          signal: controller.signal,
        });
        if (!res.body) {
          onDoneRef.current();
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          const { value, done } = await reader.read();
          if (done || controller.signal.aborted) break;
          const chunk = decoder.decode(value);
          debug('agent:raw', chunk);
          console.log('🔧 Agent stream chunk:', chunk);
          buffer += chunk;
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            console.log('🔧 Processing line:', trimmed);
            if (trimmed.startsWith('0:')) {
              let delta: any = trimmed.slice(2);
              try { delta = JSON.parse(delta); } catch {}
              if (typeof delta !== 'string') delta = String(delta ?? '');
              onTextDeltaRef.current(delta);
              continue;
            }
            if (trimmed.startsWith('data: ')) {
              try {
                const payload = JSON.parse(trimmed.slice(6));
                console.log('🔧 Parsed SSE data:', payload);
                const possibleResult = payload?.result ?? payload;
                if (possibleResult && typeof possibleResult === 'object') {
                  console.log('🔧 Calling onToolAction with:', possibleResult);
                  onToolActionRef.current(possibleResult);
                  continue;
                }
              } catch (e) {
                console.log('🔧 Failed to parse SSE data:', e);
              }
              continue;
            }
            const idx = trimmed.indexOf(':');
            if (idx > 0) {
              try {
                const obj = JSON.parse(trimmed.slice(idx + 1));
                onToolActionRef.current(obj?.result ?? obj);
              } catch {}
            }
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          debug('agent:error', error);
        }
      } finally {
        if (!controller.signal.aborted) {
          onDoneRef.current();
        }
        runningRef.current = false;
      }
    };
    void run();

    return () => {
      controller.abort();
    };
  }, [messages]); // Include messages as dependency
}



