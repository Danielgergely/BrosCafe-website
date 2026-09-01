import { CURRENCY } from "@/config/site";

const HUF = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 });

/** "1 800 Ft" — the primary, stored price. */
export function formatHuf(amount) {
  if (amount == null || Number.isNaN(Number(amount))) return "";
  return `${HUF.format(Math.round(Number(amount)))} Ft`;
}

/** "€4.50" — a courtesy conversion for visitors, never the stored value. */
export function formatEur(huf) {
  if (huf == null || Number.isNaN(Number(huf))) return "";
  return `€${(Number(huf) * CURRENCY.eurPerHuf).toFixed(2)}`;
}

/**
 * The one price formatter for the whole site.
 * @param {number} huf   price in forint
 * @param {object} [options]
 * @param {boolean} [options.secondary] append the EUR equivalent
 */
export function formatPrice(huf, { secondary = false } = {}) {
  const primary = formatHuf(huf);
  if (!primary || !secondary || !CURRENCY.showSecondary) return primary;
  return `${primary} · ${formatEur(huf)}`;
}

/** "2026. szeptember" / "September 2026" */
export function formatMonthYear(isoDate, lang) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(lang === "hu" ? "hu-HU" : "en-GB",
                                 { month: "long", year: "numeric" });
}

export function formatDateTime(isoDate, lang) {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(lang === "hu" ? "hu-HU" : "en-GB");
}
