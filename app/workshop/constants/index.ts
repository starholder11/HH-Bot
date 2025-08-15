// Canvas constants
export const CANVAS_DEFAULTS = {
  PIN_WIDTH: 560,  // Doubled from 280
  PIN_HEIGHT: 440, // Doubled from 220
  Z_COUNTER_START: 10,
} as const;

// Grid constants
export const GRID_CONSTANTS = {
  GUTTER: 12,
  ROW_HEIGHT: 360,
  MAX_WIDTH: 800,  // Reduced from 1200 to prevent overflow
  MAX_HEIGHT: 1000, // Reduced from 1200
  MAX_VISIBLE_ROWS: 8, // Reduced from 10
  BREAKPOINTS: [
    { min: 1200, cols: 3 }, // Reduced from 4 cols at 1280
    { min: 768, cols: 2 },
    { min: 480, cols: 1 }, // Added smaller breakpoint
    { min: 0, cols: 1 },
  ],
} as const;

// Search constants
export const SEARCH_CONSTANTS = {
  DEFAULT_LIMIT: 1000,
  DEFAULT_PAGE: 1,
} as const;

// Cache constants
export const CACHE_CONSTANTS = {
  DEFAULT_TTL_MS: 5 * 60 * 1000, // 5 minutes
} as const;

// Label constants
export const LABEL_CONSTANTS = {
  MAX_AI_LABELS_PER_CATEGORY: 3,
  MAX_TAG_LABELS: 6,
  MAX_FALLBACK_LABELS: 6,
  MAX_TOTAL_LABELS: 6,
  MIN_WORD_LENGTH: 3,
  MAX_FALLBACK_WORDS: 20,
} as const;
