/**
 * Bros Cafe design tokens.
 * The palette is deliberately tiny: olive, cream, white and two greys derived
 * from them. Use these token classes (bg-olive, text-cream/70, …) rather than
 * hex literals so a rebrand is a one-file change.
 */
const palette = require("./src/config/palette");

module.exports = {
  darkMode: ["class"],
  content: ["./src/**/*.{js,jsx}", "./public/index.html"],
  theme: {
    extend: {
      colors: {
        olive: {
          DEFAULT: palette.olive,
          dark: palette.oliveDark,
          soft: palette.oliveSoft,
        },
        cream: {
          DEFAULT: palette.cream,
          dark: palette.creamDark,
        },
        ink: palette.ink,
        muted: palette.muted,
        line: palette.creamDark,
        // Used for destructive actions and warnings in the admin UI as well as
        // in charts — without these, `bg-alert` silently produces no CSS and
        // a red button renders as invisible text.
        alert: palette.alert,
        warn: palette.warn,
      },
      fontFamily: {
        // `display` is the editorial serif, `sans` the body face.
        display: ['"Cormorant Garamond"', "Georgia", "serif"],
        sans: ['"DM Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        // The editorial look leans on wide tracking; name the steps we use.
        label: "0.22em",
        eyebrow: "0.4em",
        wide: "0.18em",
      },
      borderRadius: {
        card: "1.5rem",
        panel: "2rem",
      },
      boxShadow: {
        card: "0 12px 28px rgba(102, 115, 74, 0.08)",
        "card-hover": "0 18px 44px rgba(102, 115, 74, 0.16)",
        panel: "0 10px 40px rgba(102, 115, 74, 0.10)",
        lifted: "0 30px 70px rgba(0, 0, 0, 0.28)",
      },
      transitionTimingFunction: {
        editorial: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(14px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "stamp-pop": {
          "0%": { transform: "scale(0.4)", opacity: "0" },
          "60%": { transform: "scale(1.12)" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "reward-glow": {
          "0%, 100%": { boxShadow: "0 10px 40px rgba(102, 115, 74, 0.18)" },
          "50%": { boxShadow: "0 14px 55px rgba(102, 115, 74, 0.35)" },
        },
        marquee: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
        "steam-rise": {
          "0%": { transform: "translateY(5px) scaleY(0.6)", opacity: "0" },
          "35%": { opacity: "0.6" },
          "100%": { transform: "translateY(-9px) scaleY(1.1)", opacity: "0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s cubic-bezier(0.22,1,0.36,1) both",
        "stamp-pop": "stamp-pop 0.35s ease-out both",
        "reward-glow": "reward-glow 2.4s ease-in-out infinite",
        marquee: "marquee 46s linear infinite",
        "steam-rise": "steam-rise 1.5s ease-out infinite",
      },
    },
  },
  plugins: [],
};
