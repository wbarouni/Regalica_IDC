import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0A0A0A',
        paper: '#FAFAFA',
        marigold: { DEFAULT: '#D97757', 400: '#D97757', 600: '#A34A30' },
        stone: {
          100: '#F2F2F2',
          200: '#E5E5EA',
          300: '#D1D1D6',
          500: '#AEAEB2',
          700: '#6C6C70',
          900: '#3A3A3C',
        },
        evergreen: { DEFAULT: '#2D7A4F', 50: '#F4FBF6' },
        vermilion: { DEFAULT: '#C0392B', 50: '#FEF2F1' },
      },
      fontFamily: {
        sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config;
