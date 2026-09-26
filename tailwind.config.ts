import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        /** Text + dark surfaces (sidebar, report cover) — a cool navy-charcoal. */
        ink: {
          DEFAULT: "#0b1324",
          950: "#070c18",
          900: "#0b1324",
          800: "#141d31",
          700: "#233049",
          600: "#3a4660",
          500: "#5a6479",
          400: "#8a93a5",
          300: "#c2c8d3",
          200: "#e0e4eb",
          100: "#edf0f4",
        },
        /** App surfaces — page plane, subtle panels, hover tints. */
        bone: {
          DEFAULT: "#f3f5f8",
          50: "#f8f9fb",
          100: "#f3f5f8",
          200: "#e8ecf1",
        },
        /** Accent. White-label: swap these ten values to restyle every accent. */
        brand: {
          50: "#eaf6f2",
          100: "#cdebe2",
          200: "#9dd7c7",
          300: "#5fbaa4",
          400: "#2a9d84",
          500: "#0d7f69",
          600: "#0b6c5a",
          700: "#0a584a",
          800: "#0a473d",
          900: "#083a32",
        },
        /** Secondary warm accent — used sparingly (sun study, premium badges). */
        sand: {
          50: "#fbf7ef",
          100: "#f5ecda",
          200: "#ead7b0",
          300: "#dcbd83",
          400: "#cba35d",
          500: "#b88a42",
          600: "#9a7033",
          700: "#7a572a",
          800: "#5c4122",
          900: "#3f2d18",
        },
      },
      boxShadow: {
        card: "0 1px 2px rgba(11,19,36,0.04), 0 1px 3px rgba(11,19,36,0.05)",
        lift: "0 12px 32px -12px rgba(11,19,36,0.28), 0 2px 6px rgba(11,19,36,0.06)",
        glow: "0 0 0 4px rgba(13,127,105,0.14)",
      },
      letterSpacing: {
        wordmark: "0.22em",
      },
    },
  },
  plugins: [],
};

export default config;
