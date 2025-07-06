/**
 * Process markdown content for search indexing
 * Removes markdown syntax, HTML tags, and normalizes whitespace
 */
export function processContent(markdownContent: any): string {
  if (!markdownContent || typeof markdownContent !== 'string') {
    return '';
  }
  
  return markdownContent
    .replace(/[#*`_\[\]()]/g, '')      // Remove markdown syntax
    .replace(/<[^>]*>/g, '')           // Remove HTML tags
    .replace(/!\[.*?\]\(.*?\)/g, '')   // Remove image syntax
    .replace(/\[.*?\]\(.*?\)/g, '')    // Remove link syntax
    .replace(/\n+/g, ' ')              // Normalize whitespace
    .replace(/\s+/g, ' ')              // Collapse multiple spaces
    .trim();
}

/**
 * Generate a preview snippet from content
 * Returns first N characters with ellipsis if truncated
 */
export function generatePreview(content: any, maxLength: number = 150): string {
  const processed = processContent(content);
  return processed.length > maxLength 
    ? processed.substring(0, maxLength) + '...'
    : processed;
} 