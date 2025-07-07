import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'cardo': ['Cardo', 'serif'],
        'inter': ['Inter', 'sans-serif'],
        'instrument': ['Instrument Sans', 'sans-serif'],
        'jost': ['Jost', 'sans-serif'],
        'system-serif': ['ui-serif', 'Georgia', 'serif'],
        'system-sans': ['ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      colors: {
        'wp-base': '#f9f9f9',
        'wp-base-2': '#ffffff',
        'wp-contrast': '#111111',
        'wp-contrast-2': '#636363',
        'wp-contrast-3': '#A4A4A4',
        'wp-accent': '#cfcabe',
        'wp-accent-2': '#c2a990',
        'wp-accent-3': '#d8613c',
        'wp-accent-4': '#b1c5a4',
        'wp-accent-5': '#b5bdbc',
      },
      spacing: {
        '50': '1.25rem',
        '60': '1.5rem',
        '70': '1.75rem',
        '80': '2rem',
      },
      maxWidth: {
        'content': '620px',
        'wide': '1280px',
      },
      fontSize: {
        'wp-small': ['0.875rem', { lineHeight: '1.5' }],
        'wp-medium': ['1rem', { lineHeight: '1.55' }],
        'wp-large': ['1.25rem', { lineHeight: '1.3' }],
        'wp-xl': ['1.5rem', { lineHeight: '1.2' }],
        'wp-2xl': ['2rem', { lineHeight: '1.15' }],
      },
      borderRadius: {
        'wp': '0.375rem',
      },
      boxShadow: {
        'wp-subtle': '0 1px 3px 0 rgb(0 0 0 / 0.1)',
        'wp-medium': '0 4px 6px -1px rgb(0 0 0 / 0.1)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
}

export default config 