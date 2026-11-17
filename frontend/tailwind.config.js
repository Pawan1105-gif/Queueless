/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#17243a",
        brand: "#2457d6",
        mint: "#12a88a",
      },
    },
  },
  plugins: [],
};
