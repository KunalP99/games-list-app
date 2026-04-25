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
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          50:  '#e6f5fa',
          100: '#cceaf5',
          200: '#99d5eb',
          300: '#55b9de',
          400: '#1aa5d0',
          500: '#1596c1',
          600: '#118ab2',
          700: '#0d6e8d',
          800: '#0a5168',
          900: '#07384a',
          950: '#04252f',
        },
      },
    },
  },
  plugins: [],
}

export default config
