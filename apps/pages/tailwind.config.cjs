/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        surface: {
          light: "#f7f5f2",
          dark: "#1f1f24"
        }
      }
    }
  },
  plugins: []
};
