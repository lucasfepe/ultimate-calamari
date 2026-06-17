/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        goc: {
          navy: '#26374A',
          blue: '#1C578A',
          'blue-hover': '#16446E',
          grey: '#F5F5F5',
          text: '#333333',
          'blue-light': '#EBF2F8',
          'blue-muted': '#D6E6F2',
          'blue-border': '#B3CFE6',
          'blue-accent': '#5B9BD5',
          'blue-on-navy': '#8CB8DB',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
