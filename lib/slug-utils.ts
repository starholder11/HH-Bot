/**
 * Convert a string to a URL-safe slug
 * Format: All lowercase with hyphens for spaces
 * Examples:
 * - "Milady of the Elephant Stone" → "milady-of-the-elephant-stone"
 * - "MuffinMan" → "muffinman"
 * - "First Milestone" → "first-milestone"
 */
export function toSlug(str: string): string {
  return str
    .toLowerCase()
    .trim()
    // Replace spaces and special characters with hyphens
    .replace(/[^a-z0-9]+/g, '-')
    // Remove leading and trailing hyphens
    .replace(/^-+|-+$/g, '');
}

/**
 * Convert a slug back to a readable title
 * Examples:
 * - "milady-of-the-elephant-stone" → "Milady of the Elephant Stone"
 * - "muffinman" → "Muffinman"
 */
export function slugToTitle(slug: string): string {
  return slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Check if a string is a valid slug
 */
export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9-]+$/.test(slug);
}

/**
 * Generate a slug from a title, ensuring uniqueness
 */
export function generateUniqueSlug(title: string, existingSlugs: string[]): string {
  let baseSlug = toSlug(title);
  let slug = baseSlug;
  let counter = 1;
  
  while (existingSlugs.includes(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
  
  return slug;
} 