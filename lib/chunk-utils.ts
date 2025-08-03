// Utility functions to chunk long texts for embedding
// Using simple word-based windowing to avoid heavy tokenizer deps.
// If you later switch to a tokeniser (e.g. @dqbd/tiktoken) you can
// replace `splitToWords` with a token-based splitter but keep the same API.

const CHUNK_WORDS = 50; // Ultra-small chunks for OpenAI safety (~150 chars = ~50 tokens)
const STRIDE_WORDS = 25; // 50% overlap

function splitToWords(text: string): string[] {
  // Collapse whitespace and split. Keeps punctuation inside words.
  return text.replace(/\s+/g, ' ').trim().split(' ');
}

export interface TextChunk {
  ix: number;
  startWord: number;
  words: string[];
  text: string;
}

export function chunkText(text: string): TextChunk[] {
  const words = splitToWords(text);
  const chunks: TextChunk[] = [];
  for (let start = 0, ix = 0; start < words.length; start += STRIDE_WORDS, ix++) {
    const slice = words.slice(start, start + CHUNK_WORDS);
    if (slice.length === 0) break;
    chunks.push({
      ix,
      startWord: start,
      words: slice,
      text: slice.join(' '),
    });
  }
  return chunks;
}
