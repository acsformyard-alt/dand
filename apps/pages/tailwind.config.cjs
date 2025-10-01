module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#f59e0b',
          light: '#fbbf24',
          dark: '#d97706',
        },
        accent: {
          DEFAULT: '#f97316',
          soft: '#fed7aa',
          deep: '#ea580c',
        },
      },
    },
  },
  plugins: [],
};
