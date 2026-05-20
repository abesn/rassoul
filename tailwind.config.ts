import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./content/**/*.mdx"],
  darkMode: "media",
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "Inter", "sans-serif"],
        arabic: ["'Amiri'", "'Scheherazade New'", "'Noto Naskh Arabic'", "serif"],
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: "68ch",
            "h1, h2, h3, h4": { fontWeight: "600", letterSpacing: "-0.01em" },
            blockquote: { fontStyle: "normal", borderLeftColor: "rgb(16 185 129 / 0.4)" },
            ".arabic": { fontFamily: "var(--font-arabic, serif)", fontSize: "1.4em", lineHeight: "2" },
          },
        },
      },
    },
  },
  plugins: [typography],
};

export default config;
