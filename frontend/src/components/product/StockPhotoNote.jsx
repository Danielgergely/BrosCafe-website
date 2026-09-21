import { useI18n } from "@/i18n";

/**
 * Says on the photograph that the photograph is a placeholder.
 *
 * Every product currently ships with stock imagery, and a menu that looks
 * photographed but isn't is a small lie to tell a customer. The note is set per
 * product (`stock_photos`), not site-wide, so it disappears from each item as
 * its real shot is uploaded in /admin rather than all at once at the end.
 *
 * Positioning is the caller's business — the corner that is free differs
 * between a grid card and the modal gallery — so this renders the pill alone.
 */
export default function StockPhotoNote({ product, className = "" }) {
  const { t } = useI18n();
  if (!product?.stock_photos) return null;

  return (
    <p
      data-testid={`stock-photo-note-${product.id}`}
      className={`pointer-events-none select-none rounded-full bg-ink/50 px-3 py-1 text-[9px] font-medium tracking-label text-cream/95 backdrop-blur-[2px] ${className}`}
    >
      {t("product.stockPhoto")}
    </p>
  );
}
