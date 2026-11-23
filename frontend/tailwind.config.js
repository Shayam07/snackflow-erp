/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: {
          DEFAULT: "#142B3B",
          dark: "#0E1E2A",
          light: "#1C3B52",
          subtle: "#F0F4F8",
        },
        teal: {
          DEFAULT: "#087F8C",
          dark: "#06626C",
          light: "#0A9AA9",
          subtle: "#E6F4F5",
        },
        amber: {
          DEFAULT: "#F2A541",
          dark: "#D99426",
          subtle: "#FEF6EB",
        },
        canvas: "#F5F6F2",
        surface: "#FFFFFF",
        charcoal: "#202B33",
        slate: {
          DEFAULT: "#657580",
          light: "#8F9DA6",
          subtle: "#ECEFF1",
        },
        emerald: {
          DEFAULT: "#21865B",
          dark: "#1A6B48",
          subtle: "#E8F5EE",
        },
        crimson: {
          DEFAULT: "#D64B4B",
          dark: "#B83A3A",
          subtle: "#FCEBEB",
        },
        border: "#DFE3E6",
      },
      boxShadow: {
        card: "0 1px 3px rgba(20, 43, 59, 0.05), 0 1px 2px rgba(20, 43, 59, 0.03)",
        panel: "0 4px 6px -1px rgba(20, 43, 59, 0.05), 0 2px 4px -2px rgba(20, 43, 59, 0.03)",
        elevated: "0 10px 15px -3px rgba(20, 43, 59, 0.08), 0 4px 6px -4px rgba(20, 43, 59, 0.04)",
      },
    },
  },
  plugins: [],
};
