import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
})

// Your specific prompt ID and vector store ID from the provided code
const PROMPT_ID = "pmpt_6860145bd5908196b230e507ed5d77a604ffb6d8d850b993"
const PROMPT_VERSION = "7"
const VECTOR_STORE_ID = "vs_6860128217f08191bacd30e1475d8566"

export async function POST(req: NextRequest) {
  try {
    const { message, previousResponseId } = await req.json()

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const response = await openai.responses.create({
            prompt: {
              id: PROMPT_ID,
              version: PROMPT_VERSION
            },
            input: [
              {
                role: "user",
                content: message
              }
            ],
            previous_response_id: previousResponseId || undefined,
            reasoning: {},
            tools: [
              {
                type: "file_search",
                vector_store_ids: [VECTOR_STORE_ID]
              }
            ],
            max_output_tokens: 2048,
            store: true,
            stream: true
          } as any)

          // Handle streaming response
          try {
            for await (const event of response as any) {
              if (event.output && event.output[0] && event.output[0].content) {
                const contentArray = event.output[0].content
                
                for (const contentItem of contentArray) {
                  if (contentItem.type === 'text' && contentItem.text_delta) {
                    // Send content delta
                    const data = {
                      type: 'content',
                      delta: contentItem.text_delta
                    }
                    controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
                  }
                }
              }

              // Send response ID when available
              if (event.id) {
                const data = {
                  type: 'response_id',
                  response_id: event.id
                }
                controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
              }
            }
          } catch (error) {
            // If streaming fails, try non-streaming
            const event = response as any
            if (event.output && event.output[0] && event.output[0].content) {
              const contentArray = event.output[0].content
              
              for (const contentItem of contentArray) {
                if (contentItem.type === 'text' && contentItem.text) {
                  // Send content
                  const data = {
                    type: 'content',
                    delta: contentItem.text
                  }
                  controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
                }
              }
            }

            // Send response ID when available
            if (event.id) {
              const data = {
                type: 'response_id',
                response_id: event.id
              }
              controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
            }
          }

          // Send completion signal
          controller.enqueue('data: {"type": "done"}\n\n')
          controller.close()

        } catch (error) {
          console.error('OpenAI API error:', error)
          
          // Send error message to client
          const errorData = {
            type: 'content',
            delta: 'Sorry, I encountered an error processing your request. Please try again.'
          }
          controller.enqueue(`data: ${JSON.stringify(errorData)}\n\n`)
          controller.enqueue('data: {"type": "done"}\n\n')
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    })

  } catch (error) {
    console.error('Request processing error:', error)
    return NextResponse.json(
      { error: 'Internal server error' }, 
      { status: 500 }
    )
  }
} 