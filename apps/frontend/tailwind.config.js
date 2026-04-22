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
        rg: {
          /* §14.2 backgrounds */
          bg:       '#FAFAFA',
          'bg-2':   '#F5F5F7',
          'bg-3':   '#EBEBED',
          /* glass */
          glass:    'rgba(255,255,255,0.72)',
          'glass-h':'rgba(255,255,255,0.90)',
          /* text §14.2 */
          text:     '#1D1D1F',
          muted:    '#86868B',
          subtle:   '#AEAEB2',
          /* borders */
          border:   'rgba(0,0,0,0.08)',
          'border-strong': 'rgba(0,0,0,0.14)',
          /* status §14.2 */
          pass:     '#34C759',
          'pass-dim':'rgba(52,199,89,0.10)',
          fail:     '#FF3B30',
          'fail-dim':'rgba(255,59,48,0.10)',
          warn:     '#FF9500',
          'warn-dim':'rgba(255,149,0,0.10)',
          info:     '#007AFF',
          'info-dim':'rgba(0,122,255,0.10)',
          /* Regalica AI accent — black/white edition */
          ai:       '#1D1D1F',
          'ai-lt':  '#48484A',
          'ai-dim': 'rgba(0,0,0,0.07)',
          /* Gold / premium */
          gold:     '#C9A84C',
          'gold-dim':'rgba(201,168,76,0.10)',
          canvas:      '#FFFFFF',
          'blue-dark': '#000000',
          'blue-dim':  'rgba(0,0,0,0.07)',
          'blue-glow': 'rgba(0,0,0,0.15)',
        },
      },
      boxShadow: {
        'glass-sm': '0 2px 8px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.05)',
        'glass-md': '0 8px 24px rgba(0,0,0,0.08), 0 0 0 1px rgba(0,0,0,0.06)',
        'glass-lg': '0 20px 48px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.07)',
        'ai':       '0 0 0 3px rgba(0,0,0,0.12)',
        'blue':     '0 2px 8px rgba(0,0,0,0.18)',
      },
      animation: {
        'fade-up':   'fadeUp 0.25s ease-out',
        'fade-in':   'fadeIn 0.2s ease-out',
        'pulse-dot': 'pulseDot 2s ease-in-out infinite',
        'typing':    'typing 1.4s ease-in-out infinite',
        'slide-in':  'slideIn 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      },
      keyframes: {
        fadeUp:   { from: { opacity:'0', transform:'translateY(12px)' }, to: { opacity:'1', transform:'translateY(0)' } },
        fadeIn:   { from: { opacity:'0' }, to: { opacity:'1' } },
        pulseDot: { '0%,100%': { opacity:'1', transform:'scale(1)' }, '50%': { opacity:'0.4', transform:'scale(0.75)' } },
        typing:   { '0%,80%,100%': { transform:'scale(0.6)', opacity:'0.4' }, '40%': { transform:'scale(1)', opacity:'1' } },
        slideIn:  { from: { opacity:'0', transform:'scale(0.9) translateY(8px)' }, to: { opacity:'1', transform:'scale(1) translateY(0)' } },
      },
    },
  },
  plugins: [],
};
