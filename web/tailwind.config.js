/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#eef4ff", 100: "#dae6ff", 200: "#bcd2ff", 300: "#8eb2ff",
          400: "#5987ff", 500: "#325dff", 600: "#1a3ef5", 700: "#152ed8",
          800: "#1829af", 900: "#1a288a", 950: "#141a50",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
      },
    },
  },
  plugins: [],
};
