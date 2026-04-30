// Edition One palette + typography sourced from src/tokens/tokens.json.
// Single source of truth: never type a hex value here.
import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';

import tokens from './src/tokens/tokens.json';

const c = tokens.color;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: {
      sm: '390px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
      '2xl': '1440px',
    },
    extend: {
      colors: {
        ink: c.ink,
        paper: c.paper,
        paperPure: c.paperPure,
        marigold: c.marigold,
        stone: c.stone,
        evergreen: c.evergreen,
        vermilion: c.vermilion,
        amber: c.amber,
        azure: c.azure,
      },
      fontFamily: {
        sans: [tokens.font.sans],
        mono: [tokens.font.mono],
      },
    },
  },
  plugins: [typography],
} satisfies Config;
