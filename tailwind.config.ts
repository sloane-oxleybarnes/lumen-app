import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#4F46E5",
          dark: "#3730A3",
          light: "#EEF2FF",
          mid: "#818CF8",
        },
        ink: {
          DEFAULT: "#1A1917",
          mid: "#4A4845",
          light: "#8A8784",
        },
        border: "rgba(26,25,23,0.1)",
        bg: "#FAFAF8",
      },
      fontFamily: {
        serif: ["DM Serif Display", "Georgia", "serif"],
        sans: ["DM Sans", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        pill: "100px",
        sm: "8px",
      },
    },
  },
  plugins: [],
};
export default config;
