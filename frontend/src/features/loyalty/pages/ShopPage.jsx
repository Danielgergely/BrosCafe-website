import { Coffee } from "lucide-react";

import PageShell from "@/components/layout/PageShell";
import StockPhotoNote from "@/components/product/StockPhotoNote";
import Steam from "@/components/ui/Steam";
import { useI18n } from "@/i18n";
import { localize, useCatalog } from "@/lib/catalog";
import { useUi } from "@/state/UiStore";

/**
 * The Bros Collection: an editorial "coming soon" page. Merch opens the shared
 * product modal — deliberately no checkout, since nothing is on sale yet.
 */
export default function ShopPage() {
  const { t, lang } = useI18n();
  const { inCategory } = useCatalog();
  const { openProduct } = useUi();

  const merch = inCategory("merch").map((p) => localize(p, lang));

  return (
    <PageShell>
      <div className="pt-2 text-olive/60">
        <Steam className="mb-1 gap-1.5" />
        <Coffee size={32} strokeWidth={1.2} className="text-olive" />
        <h1 className="mt-4 font-display text-4xl text-ink">{t("shop.title")}</h1>
        <p className="mt-5 font-display text-6xl italic leading-none text-olive">
          {t("shop.comingSoon")}
        </p>
        <p className="mt-4 text-sm text-muted">
          {t("shop.notReady")} {t("shop.brewing")}
        </p>
      </div>

      <div className="mt-10 space-y-5" data-testid="product-grid">
        {merch.map((product, i) => (
          <button
            key={product.id}
            data-testid={`product-${product.id}`}
            onClick={() => openProduct(product.id)}
            className={`group block w-full overflow-hidden rounded-card border border-line bg-white text-left shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover ${
              i % 2 === 1 ? "md:ml-14" : ""
            }`}
          >
            <div className="relative overflow-hidden">
              <img
                src={product.images?.[0]}
                alt={product.name}
                loading="lazy"
                className="h-52 w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-105 md:h-64"
              />
              <StockPhotoNote product={product} className="absolute bottom-3 left-3 z-10" />
            </div>
            <div className="flex items-center justify-between gap-4 p-5">
              <div className="min-w-0">
                <p className="font-display text-xl text-ink">{product.name}</p>
                <p className="mt-0.5 truncate text-xs text-muted">{product.desc}</p>
              </div>
              <span className="shrink-0 rounded-full border border-olive/40 px-3 py-1 text-[9px] font-semibold tracking-label text-olive">
                {t("common.comingSoon")}
              </span>
            </div>
          </button>
        ))}
      </div>

      <p className="mt-8 text-center text-xs text-muted">{t("shop.sub")}</p>
    </PageShell>
  );
}
