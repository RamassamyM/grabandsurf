import animate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
// Palette taken from the Grab&Surf deck: navy night, ocean blue, foam, sun and cork.
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: { DEFAULT: 'hsl(var(--primary))', foreground: 'hsl(var(--primary-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        navy: { DEFAULT: '#0B2533', 800: '#133A4C', 700: '#1C4D5F' },
        ocean: { DEFAULT: '#1BA8C8', 600: '#1690AC', 700: '#11748B' },
        lagoon: '#3FBED9',
        foam: { DEFAULT: '#E6F7FB', 200: '#D6EFF6' },
        sun: { DEFAULT: '#F7B32B', 600: '#E09A12' },
        sand: '#FADB9E',
        cork: { DEFAULT: '#D39A55', 700: '#8A5E2B' },
        coral: { DEFAULT: '#E5484D', 50: '#FDECEC' },
      },
      borderRadius: {
        xl: 'calc(var(--radius) + 4px)',
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 4px)',
        sm: 'calc(var(--radius) - 8px)',
      },
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        script: ['"Kaushan Script"', 'cursive'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(11,37,51,.04), 0 8px 24px -12px rgba(11,37,51,.12)',
      },
    },
  },
  plugins: [animate],
}
