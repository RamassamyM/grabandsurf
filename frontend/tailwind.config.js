/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sand: { 50: '#FBF7EF', 100: '#F5EDDD', 200: '#EDE3CE', 300: '#DCCBA6' },
        cork: { 300: '#D2A86E', 400: '#C08F4F', 500: '#A8763A', 600: '#8A5E2B', 700: '#6B4820' },
        ocean: { 50: '#E8F3F2', 100: '#CDE6E4', 300: '#6FB3AE', 500: '#1F6B6B', 600: '#185858', 700: '#124545', 900: '#0B2B2E' },
        coral: { 400: '#F08A6C', 500: '#E0643F', 600: '#C04E2C' },
        // Brand palette of the pitch deck (landing page)
        night: { 700: '#133A4C', 800: '#0F2F3F', 900: '#0B2533' },
        lagoon: { 300: '#5FD3E8', 500: '#1BA8C8', 600: '#1690AC' },
        foam: { 50: '#F3FBFD', 100: '#E6F7FB', 200: '#D6EFF6', 300: '#A7C8D3' },
        sun: { 400: '#F9C255', 500: '#F7B32B' },
        slate: { 600: '#4B6672' },
        corkwood: '#D39A55',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Fraunces"', 'Georgia', 'serif'],
        outfit: ['Outfit', 'system-ui', 'sans-serif'],
        brush: ['"Kaushan Script"', 'cursive'],
      },
      boxShadow: { card: '0 1px 2px rgba(11,43,46,.06), 0 4px 16px rgba(11,43,46,.06)' },
    },
  },
  plugins: [],
}
