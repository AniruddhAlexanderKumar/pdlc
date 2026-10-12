import animate from 'tailwindcss-animate';
import containerQueries from '@tailwindcss/container-queries';

/**
 * Theme token helper.
 *
 * Tokens are plain CSS variables in `src/index.css` (`--color-card`, …), which
 * is what `shadcn/ui`-style components and inline palettes expect. Tailwind 3
 * cannot apply an `/opacity` modifier to a bare `var(…)` colour, so every token
 * is wrapped in `color-mix()` — that keeps `bg-foreground/15` and
 * `ring-foreground/40` working while the variable stays a normal colour value.
 */
const token = (name, fallback) =>
  `color-mix(in srgb, var(--color-${name}, ${fallback}) calc(<alpha-value> * 100%), transparent)`;

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
        /* shadcn/ui design tokens (see src/index.css) */
        background: token('background', '#ffffff'),
        foreground: token('foreground', '#09090b'),
        card: {
          DEFAULT: token('card', '#ffffff'),
          foreground: token('card-foreground', '#09090b'),
        },
        popover: {
          DEFAULT: token('popover', '#ffffff'),
          foreground: token('popover-foreground', '#09090b'),
        },
        primary: {
          DEFAULT: token('primary', '#00b3cc'),
          foreground: token('primary-foreground', '#ffffff'),
        },
        secondary: {
          DEFAULT: token('secondary', '#f4f4f5'),
          foreground: token('secondary-foreground', '#18181b'),
        },
        muted: {
          DEFAULT: token('muted', '#f4f4f5'),
          foreground: token('muted-foreground', '#71717a'),
        },
        accent: {
          DEFAULT: token('accent', '#f4f4f5'),
          foreground: token('accent-foreground', '#18181b'),
        },
        destructive: {
          DEFAULT: token('destructive', '#ef4444'),
          foreground: token('destructive-foreground', '#fafafa'),
        },
        border: token('border', '#e4e4e7'),
        input: token('input', '#e4e4e7'),
        ring: token('ring', '#18181b'),
        /* NexGen PLM system palette */
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
  plugins: [animate, containerQueries],
}
