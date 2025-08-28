import { useEffect, useRef } from 'react';

type Msg = { role: 'user' | 'assistant' | 'tool'; content: string };

export function useConversationalStream(
  messages: Msg[],
  onTextDelta: (delta: string) => void,
  onDone: () => void,
  lastResponseId: string | null,
  setLastResponseId: (id: string | null) => void
) {
  const runningRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<any>(null);

  // Use refs to avoid stale closures while keeping stable references
  const onTextDeltaRef = useRef(onTextDelta);
  const onDoneRef = useRef(onDone);

  onTextDeltaRef.current = onTextDelta;
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
        // Helper: reset a failsafe timeout that will end the run if streaming stalls
        const resetTimeout = () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            try {
              onDoneRef.current();
              controller.abort();
            } catch {}
          }, 30000); // 30s stall guard
        };

        // Get the latest user message
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();
        if (!lastUserMessage) {
          onDoneRef.current();
          return;
        }

        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: lastUserMessage.content,
            previousResponseId: lastResponseId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error('Failed to send message');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();
        resetTimeout();

        while (true) {
          const { done, value } = await reader.read();
          if (done || controller.signal.aborted) {
            // Stream completed normally, call onDone
            if (!controller.signal.aborted) {
              onDoneRef.current();
            }
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            break;
          }

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'content') {
                  onTextDeltaRef.current(data.delta);
                  resetTimeout();
                } else if (data.type === 'response_id') {
                  setLastResponseId(data.response_id);
                  resetTimeout();
                } else if (data.type === 'done') {
                  // Stream complete signal received, call onDone and exit
                  onDoneRef.current();
                  if (timeoutRef.current) clearTimeout(timeoutRef.current);
                  return;
                }
              } catch (e) {
                // Ignore JSON parse errors
              }
            }
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Conversational stream error:', error);
          onTextDeltaRef.current('Sorry, I encountered an error. Please try again.');
          onDoneRef.current(); // Make sure to call onDone on error
        }
      } finally {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        runningRef.current = false;
      }
    };

    void run();

    return () => {
      controller.abort();
    };
  }, [messages, lastResponseId, setLastResponseId]);
}
