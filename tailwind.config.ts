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
          DEFAULT: "#BA7517",
          dark: "#854F0B",
          light: "#FAEEDA",
          mid: "#EF9F27",
        },
        ink: {
          DEFAULT: "#1A1917",
          mid: "#4A4845",
          light: "#8A8784",
        },
        border: "rgba(26,25,23,0.1)",
        bg: "#FBF8F3",
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
