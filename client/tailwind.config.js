/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          900: '#0c4a6e',
        },
        surface: {
          base: '#080c14',
          1: '#0e1422',
          2: '#141d30',
          3: '#1b263e',
        },
        border: {
          subtle: 'rgba(255, 255, 255, 0.07)',
          muted: '#1e293b',
          active: '#334155',
        },
        up: '#10b981',
        down: '#f43f5e',
        gain: {
          DEFAULT: '#10b981',
          light: '#34d399',
          dark: '#059669',
          muted: 'rgba(16, 185, 129, 0.12)',
        },
        loss: {
          DEFAULT: '#f43f5e',
          light: '#fb7185',
          dark: '#e11d48',
          muted: 'rgba(244, 63, 94, 0.12)',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'glow-brand': '0 0 20px -3px rgba(14, 165, 233, 0.25)',
        'glow-gain': '0 0 20px -3px rgba(16, 185, 129, 0.25)',
        'glow-loss': '0 0 20px -3px rgba(244, 63, 94, 0.25)',
        'panel': '0 8px 30px rgba(0, 0, 0, 0.45)',
      },
    },
  },
  plugins: [],
};
