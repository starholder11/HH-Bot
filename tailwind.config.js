/** @type {import('tailwindcss').Config} */
const config = {
    darkMode: ['class'],
    content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			cardo: [
  				'Cardo',
  				'serif'
  			],
  			inter: [
  				'Inter',
  				'sans-serif'
  			],
  			instrument: [
  				'Instrument Sans',
  				'sans-serif'
  			],
  			jost: [
  				'Jost',
  				'sans-serif'
  			],
  			'system-serif': [
  				'ui-serif',
  				'Georgia',
  				'serif'
  			],
  			'system-sans': [
  				'ui-sans-serif',
  				'system-ui',
  				'sans-serif'
  			]
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
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		},
  		spacing: {
  			'50': '1.25rem',
  			'60': '1.5rem',
  			'70': '1.75rem',
  			'80': '2rem'
  		},
  		maxWidth: {
  			content: '620px',
  			wide: '1280px'
  		},
  		fontSize: {
  			'wp-small': [
  				'0.875rem',
  				{
  					lineHeight: '1.5'
  				}
  			],
  			'wp-medium': [
  				'1rem',
  				{
  					lineHeight: '1.55'
  				}
  			],
  			'wp-large': [
  				'1.25rem',
  				{
  					lineHeight: '1.3'
  				}
  			],
  			'wp-xl': [
  				'1.5rem',
  				{
  					lineHeight: '1.2'
  				}
  			],
  			'wp-2xl': [
  				'2rem',
  				{
  					lineHeight: '1.15'
  				}
  			]
  		},
  		borderRadius: {
  			wp: '0.375rem',
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		boxShadow: {
  			'wp-subtle': '0 1px 3px 0 rgb(0 0 0 / 0.1)',
  			'wp-medium': '0 4px 6px -1px rgb(0 0 0 / 0.1)'
  		}
  	}
  },
  plugins: [
    require('@tailwindcss/typography'),
      require("tailwindcss-animate")
],
}

module.exports = config 