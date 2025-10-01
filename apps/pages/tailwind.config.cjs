module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#f97316',
          light: '#fb923c',
          dark: '#ea580c',
        },
        accent: {
          DEFAULT: '#facc15',
          soft: '#fde68a',
          deep: '#f59e0b',
        },
        danger: {
          DEFAULT: '#f97373',
          dark: '#f43f5e',
        },
      },
    },
  },
  plugins: [],
};
