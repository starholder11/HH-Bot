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
      console.log('🟡 ConversationalStream: Starting run, runningRef.current:', runningRef.current);
      if (runningRef.current) {
        console.log('🔴 ConversationalStream: Already running, skipping');
        return;
      }
      runningRef.current = true;
      console.log('🟢 ConversationalStream: Set runningRef to true');

      try {
        // Helper: reset a failsafe timeout that will end the run if streaming stalls
        const resetTimeout = () => {
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            console.log('🔴 ConversationalStream: TIMEOUT TRIGGERED - calling onDone and aborting');
            try {
              onDoneRef.current();
              controller.abort();
            } catch {}
          }, 30000); // 30s stall guard
        };

        // Get the latest user message
        const lastUserMessage = messages.filter(m => m.role === 'user').pop();
        if (!lastUserMessage) {
          console.log('🔴 ConversationalStream: No user message found, calling onDone');
          onDoneRef.current();
          return;
        }

        console.log('🟡 ConversationalStream: Processing message:', lastUserMessage.content);

        console.log('🟡 ConversationalStream: Making fetch request to /api/chat');
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

        console.log('🟡 ConversationalStream: Fetch response status:', response.status, response.ok);
        if (!response.ok) {
          throw new Error('Failed to send message');
        }

        const reader = response.body?.getReader();
        if (!reader) throw new Error('No response body');

        console.log('🟢 ConversationalStream: Got reader, starting stream processing');
        const decoder = new TextDecoder();
        resetTimeout();

        while (true) {
          const { done, value } = await reader.read();
          console.log('🟡 ConversationalStream: Reader.read() result - done:', done, 'value length:', value?.length || 0);
          
          if (done || controller.signal.aborted) {
            // Stream completed normally, call onDone
            console.log('🟢 ConversationalStream: Stream done or aborted, calling onDone. Aborted:', controller.signal.aborted);
            if (!controller.signal.aborted) {
              console.log('🟢 ConversationalStream: Calling onDone (normal completion)');
              onDoneRef.current();
            }
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            break;
          }

          const chunk = decoder.decode(value);
          console.log('🟡 ConversationalStream: Decoded chunk:', chunk);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                console.log('🟡 ConversationalStream: Parsed data:', data);

                if (data.type === 'content') {
                  console.log('🟢 ConversationalStream: Content delta:', data.delta);
                  onTextDeltaRef.current(data.delta);
                  resetTimeout();
                } else if (data.type === 'response_id') {
                  console.log('🟢 ConversationalStream: Response ID:', data.response_id);
                  setLastResponseId(data.response_id);
                  resetTimeout();
                } else if (data.type === 'done') {
                  // Stream complete signal received, call onDone and exit
                  console.log('🟢 ConversationalStream: Done signal received, calling onDone and returning');
                  onDoneRef.current();
                  if (timeoutRef.current) clearTimeout(timeoutRef.current);
                  return;
                }
              } catch (e) {
                console.log('🔴 ConversationalStream: JSON parse error:', e, 'for line:', line.slice(6));
              }
            }
          }
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('🔴 ConversationalStream: Error occurred:', error);
          onTextDeltaRef.current('Sorry, I encountered an error. Please try again.');
          console.log('🟢 ConversationalStream: Calling onDone (error case)');
          onDoneRef.current(); // Make sure to call onDone on error
        } else {
          console.log('🟡 ConversationalStream: AbortError (expected)');
        }
      } finally {
        console.log('🟡 ConversationalStream: Finally block - clearing timeout and setting runningRef to false');
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        runningRef.current = false;
        console.log('🟢 ConversationalStream: Set runningRef to false');
      }
    };

    void run();

    return () => {
      controller.abort();
    };
  }, [messages, lastResponseId, setLastResponseId]);
}
