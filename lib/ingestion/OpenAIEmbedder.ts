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
  const openai = getOpenAIClient();
  const result: number[][] = [];

  // Send in small batches for throughput
  const BATCH = 8;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
        encoding_format: 'float',
      });
      for (const d of response.data) result.push(d.embedding as unknown as number[]);
    } catch (error: any) {
      console.error('[OpenAIEmbedder] Batch ERROR:', error?.message || error);
      // Fallback to single requests in case of batch failure
      for (const text of batch) {
        const resp = await openai.embeddings.create({ model: 'text-embedding-3-small', input: [text], encoding_format: 'float' });
        result.push(resp.data[0].embedding as unknown as number[]);
      }
    }
  }

  return result;
}
