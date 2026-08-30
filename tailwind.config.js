/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Orijinal duguntakip.com paleti
        brand: {
          DEFAULT: '#37517e',
          dark: '#2f4770',
          light: '#4668a2',
          muted: '#6182ba',
        },
        accent: {
          DEFAULT: '#47b2e4',
          dark: '#209dd8',
          light: '#73c5eb',
        },
        surface: '#f3f5fa',
        ink: '#444444',
        line: '#e8edf5',
      },
      fontFamily: {
        sans: ['"Open Sans"', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        heading: ['Jost', '"Open Sans"', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Jost', 'system-ui', 'sans-serif'],
      },
      keyframes: {
        'fade-up': { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        'fade-in': { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        'grow-bar': { '0%': { width: '0%' } },
      },
      animation: {
        'fade-up': 'fade-up .6s ease-out both',
        'fade-in': 'fade-in .5s ease-out both',
      },
    },
  },
  plugins: [],
};
