export type LayoutTheme = {
  id: string;
  name: string;
  description?: string;
  colors: {
    background: string;
    text: string;
    primary: string;
    secondary: string;
  };
  typography: {
    fontFamily: string;
  };
};

export const LAYOUT_THEMES: LayoutTheme[] = [
  {
    id: 'mono-noir',
    name: 'Mono Noir',
    description: 'High-contrast black/white, mono type-forward',
    colors: { background: '#0a0a0a', text: '#f5f5f5', primary: '#ffffff', secondary: '#a3a3a3' },
    typography: { fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" },
  },
  {
    id: 'midnight-mono',
    name: 'Midnight Mono',
    description: 'Deep charcoal with cool grays, mono',
    colors: { background: '#0b0f12', text: '#e7ecef', primary: '#60a5fa', secondary: '#94a3b8' },
    typography: { fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
  },
  {
    id: 'slate-blueprint',
    name: 'Slate Blueprint',
    description: 'Architectural slate with blueprint accents',
    colors: { background: '#0f172a', text: '#e2e8f0', primary: '#38bdf8', secondary: '#64748b' },
    typography: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol'" },
  },
  {
    id: 'cream-editorial',
    name: 'Cream Editorial',
    description: 'Elegant serif on warm cream',
    colors: { background: '#f8f5ef', text: '#1f2937', primary: '#111827', secondary: '#6b7280' },
    typography: { fontFamily: "Cardo, Georgia, Cambria, 'Times New Roman', Times, serif" },
  },
  {
    id: 'paper-press',
    name: 'Paper Press',
    description: 'Ink-black text on off-white paper',
    colors: { background: '#faf7f0', text: '#0f172a', primary: '#111827', secondary: '#475569' },
    typography: { fontFamily: "Spectral, Georgia, Cambria, 'Times New Roman', Times, serif" },
  },
  {
    id: 'charcoal-creme',
    name: 'Charcoal Crème',
    description: 'Soft dark with cream text',
    colors: { background: '#111315', text: '#f7f3ea', primary: '#eab308', secondary: '#a1a1aa' },
    typography: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" },
  },
  {
    id: 'sandstone',
    name: 'Sandstone',
    description: 'Warm sandstone with muted ink',
    colors: { background: '#efe7dc', text: '#2b2b2b', primary: '#8b5cf6', secondary: '#6b7280' },
    typography: { fontFamily: "Jost, Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" },
  },
  {
    id: 'sepia-press',
    name: 'Sepia Press',
    description: 'Muted sepia with editorial contrast',
    colors: { background: '#f6efe5', text: '#222222', primary: '#0f766e', secondary: '#7c7c7c' },
    typography: { fontFamily: "Cardo, Georgia, Cambria, 'Times New Roman', Times, serif" },
  },
  {
    id: 'electric-mono',
    name: 'Electric Mono',
    description: 'Mono with crisp electric accents',
    colors: { background: '#0b0b0c', text: '#f1f5f9', primary: '#22d3ee', secondary: '#64748b' },
    typography: { fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
  },
  {
    id: 'studio-slate',
    name: 'Studio Slate',
    description: 'Design studio slate with soft contrast',
    colors: { background: '#14161a', text: '#e5e7eb', primary: '#a78bfa', secondary: '#94a3b8' },
    typography: { fontFamily: "Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial" },
  },
  {
    id: 'mono-journal',
    name: 'Mono Journal',
    description: 'Notebook aesthetic, mono type',
    colors: { background: '#ffffff', text: '#1f2937', primary: '#111827', secondary: '#6b7280' },
    typography: { fontFamily: "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace" },
  },
  {
    id: 'night-ink',
    name: 'Night Ink',
    description: 'Ink on night background',
    colors: { background: '#0a0f14', text: '#e2e8f0', primary: '#14b8a6', secondary: '#94a3b8' },
    typography: { fontFamily: "Spectral, Georgia, Cambria, 'Times New Roman', Times, serif" },
  },
];


