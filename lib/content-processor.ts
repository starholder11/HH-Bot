import crypto from 'crypto';

/**
 * Generate a unique filename for OpenAI based on entry slug
 */
export function generateOpenAIFileName(slug: string): string {
  // Sanitize slug for filename use
  const sanitizedSlug = slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  
  return `${sanitizedSlug}-body.md`;
}

/**
 * Generate content hash for change detection
 */
export function generateContentHash(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/**
 * Extract text content from Keystatic document field
 */
export function extractTextContent(documentContent: any): string {
  if (!documentContent) return '';
  
  // Handle different Keystatic document formats
  if (typeof documentContent === 'string') {
    return documentContent;
  }
  
  // Handle Keystatic document object structure
  if (documentContent && typeof documentContent === 'object') {
    // This is simplified - you may need to adjust based on your actual document structure
    return JSON.stringify(documentContent);
  }
  
  return '';
}

/**
 * Prepare content for OpenAI upload
 */
export function prepareContentForOpenAI(entry: any): string {
  const textContent = extractTextContent(entry.body);
  
  // Create structured content with metadata
  const structuredContent = `# ${entry.title}

**Date:** ${entry.date}
**Slug:** ${entry.slug}

## Content

${textContent}
`;
  
  return structuredContent;
} 