import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eff8ff', 100: '#dbeefe', 200: '#bfe3fe', 300: '#93d2fd', 400: '#5fb8fa',
          500: '#3a9af5', 600: '#1f7be8', 700: '#1a64d0', 800: '#1b52a8', 900: '#1b4885',
        },
      },
    },
  },
  plugins: [],
};
export default config;
