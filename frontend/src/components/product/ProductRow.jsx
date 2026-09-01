import { useI18n } from "@/i18n";
import { localize, useCatalog } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { useUi } from "@/state/UiStore";

/**
 * A small horizontal strip of product thumbnails. Used for "Discover something
 * new" on the loyalty page and for pairings inside the product modal.
 */
export default function ProductRow({ ids, title, subtitle, testId = "product-row" }) {
  const { lang } = useI18n();
  const { get } = useCatalog();
  const { openProduct } = useUi();

  const products = ids.map((id) => localize(get(id), lang)).filter(Boolean);
  if (products.length === 0) return null;

  return (
    <div className="mt-10" data-testid={testId}>
      {title && (
        <p className="text-[11px] font-semibold uppercase tracking-label text-olive">{title}</p>
      )}
      {subtitle && <p className="mt-1 font-display text-lg italic text-muted">{subtitle}</p>}
      <div className="mt-4 grid grid-cols-3 gap-3">
        {products.map((product) => (
          <button
            key={product.id}
            data-testid={`${testId}-${product.id}`}
            onClick={() => openProduct(product.id)}
            className="group text-left"
          >
            <div className="overflow-hidden rounded-card">
              <img
                src={product.images?.[0]}
                alt={product.name}
                loading="lazy"
                className="aspect-square w-full object-cover transition-transform duration-500 ease-editorial group-hover:scale-105"
              />
            </div>
            <p className="mt-2 font-display text-sm font-medium leading-tight text-ink">
              {product.name}
            </p>
            <p className="text-xs text-muted">{formatPrice(product.price_huf)}</p>
          </button>
        ))}
      </div>
    </div>
  );
}
