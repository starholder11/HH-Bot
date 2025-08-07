// Exact copy of ai-labeling.ts OpenAI handling for embeddings
import OpenAI from 'openai';

export function getOpenAIClient() {
  const apiKey = (process.env.OPENAI_API_KEY || '').replace(/\s+/g, '');
  if (!apiKey || apiKey.includes('your_ope')) {
    throw new Error('OPENAI_API_KEY environment variable is not set correctly at runtime');
  }
  return new OpenAI({ apiKey });
}

export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  // Create client fresh every time, same as ai-labeling
  const openai = getOpenAIClient();

  const result: number[][] = [];

  // Process one at a time to match exactly what works
  for (const text of texts) {
    try {
      console.log('[OpenAIEmbedder] Generating embedding for text chunk...');

      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: [text],
        encoding_format: 'float',
      });

      console.log('[OpenAIEmbedder] SUCCESS! Received embedding');
      result.push(response.data[0].embedding);

    } catch (error: any) {
      console.error('[OpenAIEmbedder] ERROR:', {
        message: error.message,
        status: error.status,
        code: error.code,
        type: error.type
      });
      throw error;
    }
  }

  return result;
}
