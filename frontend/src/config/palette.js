/**
 * The Bros Cafe palette — the single definition of every brand colour.
 *
 * tailwind.config.js reads this file, so `bg-olive` / `text-cream` and the
 * hex values handed to JS APIs (recharts, the QR code renderer) can never
 * drift apart. Prefer the Tailwind token classes in markup; import from here
 * only when a library demands a literal colour.
 */
const palette = {
  olive: "#66734A",
  oliveDark: "#5A6641",
  oliveSoft: "#A8B187",
  cream: "#F5F0E6",
  creamDark: "#E8E2D2",
  ink: "#2C3322",
  muted: "#7A826E",
  white: "#FFFFFF",
  /** Chart-only accents, used where a series needs to read as "not brand". */
  warn: "#B8860B",
  alert: "#8B5E3C",
};

module.exports = palette;
