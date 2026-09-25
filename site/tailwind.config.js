/** @type {import('tailwindcss').Config} */
// Brand palette and fonts of the pitch deck.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        night: { 700: '#133A4C', 800: '#0F2F3F', 900: '#0B2533' },
        lagoon: { 300: '#5FD3E8', 500: '#1BA8C8', 600: '#1690AC' },
        foam: { 50: '#F3FBFD', 100: '#E6F7FB', 200: '#D6EFF6', 300: '#A7C8D3' },
        sun: { 400: '#F9C255', 500: '#F7B32B' },
        slate: { 600: '#4B6672' },
        corkwood: '#D39A55',
      },
      fontFamily: {
        outfit: ['Outfit', 'system-ui', 'sans-serif'],
        brush: ['"Kaushan Script"', 'cursive'],
      },
    },
  },
  plugins: [],
}
