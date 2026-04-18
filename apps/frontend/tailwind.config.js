/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{html,ts,scss}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'SF Pro Text', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      colors: {
        regalica: {
          ink: '#0b1220',
          surface: 'rgba(15, 23, 42, 0.55)',
          accent: '#6366f1',
          pass: '#10b981',
          fail: '#f43f5e',
          warn: '#f59e0b',
        },
      },
      backdropBlur: {
        glass: '24px',
      },
      animation: {
        'pulse-soft': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
};
