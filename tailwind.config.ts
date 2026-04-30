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
          50:  '#fff3ef',
          100: '#ffe4d9',
          200: '#ffc4ac',
          300: '#ff9d7a',
          400: '#ff7347',
          500: '#ff5722',
          600: '#e84410',
          700: '#c2320b',
          800: '#9a2709',
          900: '#7c1f07',
          950: '#430f03',
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
