import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        orbitron: ['var(--font-orbitron)', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  'rgb(var(--brand-50)  / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
          950: 'rgb(var(--brand-950) / <alpha-value>)',
        },
        accent2: {
          50:  '#f3eeff',
          100: '#e4d9ff',
          200: '#c9b4ff',
          300: '#a882ff',
          400: '#8a57f0',
          500: '#7040cc',
          600: '#673ab7',
          700: '#5630a0',
          800: '#45267d',
          900: '#35195e',
          950: '#1e0d38',
        },

        // ── Semantic color tokens — values defined in app/globals.css ──────────
        // To change the neutral color scheme, only edit the CSS variables there.
        'surface-page':     'var(--color-surface-page)',     // App shell / outermost page background
        'surface-elevated': 'var(--color-surface-elevated)', // Navbar and header bar
        'surface-base':     'var(--color-surface-base)',     // Cards, panels, modals
        'surface-sunken':   'var(--color-surface-sunken)',   // Table headers, inset backgrounds
        'surface-input':    'var(--color-surface-input)',    // Text inputs, textareas, selects
        'surface-hover':    'var(--color-surface-hover)',    // Row and item hover highlight
        'surface-active':   'var(--color-surface-active)',   // Active tab, selected badge background
        'fg-base':          'var(--color-fg-base)',          // Primary headings and body text
        'fg-secondary':     'var(--color-fg-secondary)',     // Button labels, table cell data
        'fg-muted':         'var(--color-fg-muted)',         // Labels, captions, sub-info text
        'fg-subtle':        'var(--color-fg-subtle)',        // Hints, timestamps, input placeholders
        'edge-base':        'var(--color-edge-base)',        // Standard card and panel borders
        'edge-input':       'var(--color-edge-input)',       // Form input borders
        'edge-subtle':      'var(--color-edge-subtle)',      // Inner dividers and table row separators
      },
    },
  },
  plugins: [],
}

export default config
