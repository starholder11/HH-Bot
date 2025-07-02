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
    console.log('🔵 API: Chat endpoint called')
    const { message, previousResponseId } = await req.json()
    console.log('🔵 API: Received message:', message)
    console.log('🔵 API: Previous response ID:', previousResponseId)

    if (!message || typeof message !== 'string') {
      console.log('🔴 API: Invalid message format')
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    // Create a streaming response
    const stream = new ReadableStream({
      async start(controller) {
        try {
          console.log('🔵 API: Making OpenAI request with prompt ID:', PROMPT_ID)
          console.log('🔵 API: Making OpenAI request with vector store ID:', VECTOR_STORE_ID)
          
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
          
          console.log('🔵 API: OpenAI response received:', typeof response)

          // Handle streaming response
          try {
            console.log('🔵 API: Attempting to stream response')
            let eventCount = 0
            
            for await (const event of response as any) {
              eventCount++
              console.log('🔵 API: Event', eventCount, 'received:', JSON.stringify(event, null, 2))
              
              if (event.output && event.output[0] && event.output[0].content) {
                const contentArray = event.output[0].content
                console.log('🔵 API: Content array:', JSON.stringify(contentArray, null, 2))
                
                for (const contentItem of contentArray) {
                  if (contentItem.type === 'text' && contentItem.text_delta) {
                    console.log('🔵 API: Sending text delta:', contentItem.text_delta)
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
                console.log('🔵 API: Sending response ID:', event.id)
                const data = {
                  type: 'response_id',
                  response_id: event.id
                }
                controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
              }
            }
            
            console.log('🔵 API: Streaming completed, total events:', eventCount)
          } catch (error) {
            console.log('🔴 API: Streaming failed, trying non-streaming:', error)
            // If streaming fails, try non-streaming
            const event = response as any
            console.log('🔵 API: Non-streaming event:', JSON.stringify(event, null, 2))
            
            if (event.output && event.output[0] && event.output[0].content) {
              const contentArray = event.output[0].content
              console.log('🔵 API: Non-streaming content array:', JSON.stringify(contentArray, null, 2))
              
              for (const contentItem of contentArray) {
                if (contentItem.type === 'text' && contentItem.text) {
                  console.log('🔵 API: Sending non-streaming text:', contentItem.text)
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
              console.log('🔵 API: Sending non-streaming response ID:', event.id)
              const data = {
                type: 'response_id',
                response_id: event.id
              }
              controller.enqueue(`data: ${JSON.stringify(data)}\n\n`)
            }
          }

          // Send completion signal
          console.log('🔵 API: Sending completion signal')
          controller.enqueue('data: {"type": "done"}\n\n')
          controller.close()

        } catch (error) {
          console.error('🔴 API: OpenAI API error:', error)
          
          // Send error message to client
          const errorData = {
            type: 'content',
            delta: 'Sorry, I encountered an error processing your request. Please try again.'
          }
          console.log('🔵 API: Sending error message to client')
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