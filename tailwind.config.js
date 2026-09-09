/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Orijinal marka paleti
        // Kontrast oranları WCAG 2.1 AA (1.4.3) ölçütüne göre seçildi;
        // yorumdaki değerler beyaz zemine karşı ölçülen orandır.
        brand: {
          DEFAULT: '#37517e',   // 7,95, başlıklar
          dark: '#2f4770',
          light: '#4668a2',
          muted: '#4b6fab',     // beyazla 5,05, açık zeminle (surface) 4,63
        },
        accent: {
          DEFAULT: '#47b2e4',   // 2,40, YALNIZCA dekoratif: çubuk, ayraç, koyu zemin dolgusu
          ink: '#1876a1',       // beyazla 5,07, açık zeminle 4,64, metin ve buton zemini
          dark: '#146485',      // 6,58, ink'in üzerine gelme hâli
          light: '#87cded',     // koyu marka zemininde 4,54, koyu zeminde metin
        },
        // Anlamsal durum renkleri. Eski #e74c3c (beyazla 3,82) ve
        // #18d26e (2,00) AA eşiğinin altındaydı.
        danger: '#d42c1a',    // beyazla 5,03
        success: '#0f7f43',   // beyazla 5,08
        warning: '#9b6208',   // beyazla 5,07
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
