import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paper / ink palette
        paper: "#f4f1ea",
        "paper-dark": "#ebe6d9",
        ink: "#1a1a1a",
        "ink-soft": "#3a3a3a",
        "ink-muted": "#888178",
        line: "#d8d2c2",
        // Brand accent
        accent: "#d4502a",
        "accent-soft": "#e8704d",
        // Confidence semantics
        flag: "#c08a1f",       // warm amber for "needs review"
        "flag-soft": "#f5e9c8",
        ok: "#5a8158",         // muted green for confirmed
        "ok-soft": "#d9e6d4",
      },
      fontFamily: {
        serif: ["var(--font-instrument)", "Georgia", "serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
      animation: {
        "fade-in": "fadeIn 0.5s ease-out forwards",
        "slide-up": "slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        "scan-line": "scanLine 1.8s ease-in-out infinite",
        "field-confirm": "fieldConfirm 0.6s ease-out forwards",
        "pulse-soft": "pulseSoft 1.5s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scanLine: {
          "0%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(calc(100% - 2px))" },
          "100%": { transform: "translateY(0)" },
        },
        fieldConfirm: {
          "0%": { backgroundColor: "rgba(90, 129, 88, 0.18)" },
          "100%": { backgroundColor: "transparent" },
        },
        pulseSoft: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.35" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
