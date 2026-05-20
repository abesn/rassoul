import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./content/**/*.mdx"],
  darkMode: "media",
  theme: {
    extend: {
      colors: {
        // Derived from the brand color #019000
        brand: {
          50: "#e6f7e6",
          100: "#c6ecc6",
          200: "#8fd98f",
          300: "#52c352",
          400: "#1faa1f",
          500: "#019000",
          600: "#017a00",
          700: "#016400",
          800: "#014e00",
          900: "#013800",
          950: "#002600",
        },
      },
      fontFamily: {
        sans: ["'Inter'", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["'Inter'", "ui-sans-serif", "system-ui", "sans-serif"],
        arabic: ["'Amiri'", "'Scheherazade New'", "'Noto Naskh Arabic'", "serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "68ch",
            "--tw-prose-links": "#019000",
            "--tw-prose-headings": "rgb(15 23 42)",
            "h1, h2, h3, h4": {
              fontWeight: "600",
              letterSpacing: "-0.02em",
            },
            blockquote: {
              fontStyle: "normal",
              borderLeftColor: "#019000",
              borderLeftWidth: "3px",
            },
            ".arabic": {
              fontFamily: "var(--font-arabic, serif)",
              fontSize: "1.4em",
              lineHeight: "2",
            },
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
