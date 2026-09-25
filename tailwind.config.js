/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#eef4ff',
          100: '#d9e6ff',
          200: '#bcd3ff',
          300: '#8db6ff',
          400: '#578dff',
          500: '#2f66f5',
          600: '#1a49e0',
          700: '#1638b8',
          800: '#183193',
          900: '#1a2f74',
        },
        // Violet accent — the primary interactive color in dark mode
        // (matches the supplied purple reference). Light mode keeps `brand`.
        accent: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
        // Violet-tinted dark surfaces for the dark theme. Use these instead of
        // slate-800/900 in `dark:` variants so the whole app reads as purple.
        night: {
          950: '#0e0a20',
          900: '#140f2b',
          850: '#17132b',
          800: '#1b1640',
          700: '#241d43',
          600: '#2e2652',
          500: '#3a3168',
          400: '#4a4080',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'Avenir', 'Helvetica', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
