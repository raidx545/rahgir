/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // BharatVenture / Rahgir palette (from Figma)
        paper: "#f9f7f2", // page background
        sand: "#f2efe9", // sidebar / inset cards
        ink: "#061b0e", // primary near-black green (text, buttons)
        forest: "#1b3022", // chip / secondary green
        rust: "#a04100", // accent (kickers, CTAs, active state)
        muted: "#434843", // secondary text
        line: "#e9e8e5", // card borders
        field: "#c3c8c1", // input borders
        track: "#b4cdb8", // slider track
        blob: "#ffdbcc", // decorative glow
        avatar: "#e3e2e0",
      },
      fontFamily: {
        serif: ['"EB Garamond"', "Georgia", "serif"],
        sans: ['"Plus Jakarta Sans"', "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "0px 4px 20px 0px rgba(27,48,34,0.08)",
        subtle: "0px 1px 1px rgba(0,0,0,0.05)",
        btn: "0px 4px 6px -1px rgba(0,0,0,0.1), 0px 2px 4px -2px rgba(0,0,0,0.1)",
        glass: "0px 8px 32px rgba(0,0,0,0.12)",
      },
    },
  },
  plugins: [],
};
