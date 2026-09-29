/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,mdx}', './lib/**/*.{js,mjs}'],
  theme: {
    extend: {
      colors: {
        bg: '#0B0B0C',
        surface: '#141416',
        line: 'rgba(255,255,255,0.09)',
        ink: '#F4F4F5',
        'ink-inverse': '#0B0B0C',
        muted: '#A1A1AA',
        faint: '#71717A',
        accent: '#FF4D1A',
      },
      fontFamily: {
        sans: ['"Instrument Sans"', '-apple-system', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'SF Mono', 'ui-monospace', 'Menlo', 'monospace'],
      },
    },
  },
  plugins: [],
};
