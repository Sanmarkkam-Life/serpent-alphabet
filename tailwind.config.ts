import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sage: {
          50: "#F3F7F1",
          100: "#E4EDDF",
          200: "#CBDCC3",
          300: "#A8C5A0",
          400: "#8BB080",
          500: "#6E9663",
          600: "#557A4C",
          700: "#43613C",
          800: "#365030",
          900: "#2E5B3E",
        },
        cream: {
          DEFAULT: "#F5EFDF",
          soft: "#FAF6EC",
          deep: "#EDE4CC",
        },
        serpent: {
          DEFAULT: "#F5A94B",
          deep: "#E08E2B",
          soft: "#FBD9A8",
        },
        forest: {
          DEFAULT: "#2E5B3E",
          deep: "#1F4029",
          soft: "#4A7A5A",
        },
        wisdom: {
          DEFAULT: "#C9962E",
          soft: "#F7ECD2",
          deep: "#8A6A1F",
        },
      },
      fontFamily: {
        ui: ["var(--font-nunito)", "system-ui", "sans-serif"],
        tamil: [
          "var(--font-tamil)",
          "Noto Sans Tamil",
          "Latha",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        blob: "2rem",
      },
      boxShadow: {
        leaf: "0 4px 14px rgba(46, 91, 62, 0.14)",
        node: "0 6px 0 rgba(46, 91, 62, 0.25)",
      },
      keyframes: {
        "pop-in": {
          "0%": { transform: "scale(0.6)", opacity: "0" },
          "70%": { transform: "scale(1.06)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        wiggle: {
          "0%, 100%": { transform: "rotate(-2deg)" },
          "50%": { transform: "rotate(2deg)" },
        },
        "confetti-fall": {
          "0%": { transform: "translateY(-10vh) rotate(0deg)", opacity: "1" },
          "75%": { opacity: "1" },
          "100%": {
            transform: "translateY(88vh) rotate(720deg)",
            opacity: "0",
          },
        },
        shimmer: {
          "0%, 100%": { opacity: "0.9" },
          "50%": { opacity: "0.5" },
        },
      },
      animation: {
        "pop-in": "pop-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both",
        wiggle: "wiggle 0.9s ease-in-out infinite",
        "confetti-fall": "confetti-fall 3.2s linear both",
        shimmer: "shimmer 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
