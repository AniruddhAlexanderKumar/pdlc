/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      colors: {
        surface: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e5e5',
          300: '#d4d4d4',
          400: '#a3a3a3',
          500: '#737373',
          600: '#525252',
          700: '#404040',
          800: '#262626',
          900: '#0a0a0a',
          950: '#000000',
        },
        brand: {
          DEFAULT: '#00e5ff',
          hover: '#00b3cc',
          subtle: '#004d56',
        },
        sys: {
          req: '#a855f7',
          arch: '#3b82f6',
          verify: '#10b981',
          risk: '#ef4444',
          change: '#f59e0b',
          release: '#ec4899',
        }
      }
    },
  },
  plugins: [],
}
