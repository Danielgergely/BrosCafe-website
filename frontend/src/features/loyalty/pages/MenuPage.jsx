import { useEffect } from "react";
import { ChevronRight, Hand } from "lucide-react";

import PageShell from "@/components/layout/PageShell";
import { FEATURED } from "@/config/site";
import { useI18n } from "@/i18n";
import { track } from "@/lib/api";
import { localize, useCatalog } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { useUi } from "@/state/UiStore";

/** The full menu. Same catalog and same product modal as the homepage. */
export default function MenuPage() {
  const { t, lang } = useI18n();
  const { inCategory } = useCatalog();
  const { openProduct } = useUi();

  useEffect(() => {
    track("page_view", { src: "menu" });
  }, []);

  return (
    <PageShell>
      <h1 className="font-display text-4xl text-ink">{t("menuPage.title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("menuPage.sub")}</p>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-olive/10 px-3 py-1.5 text-xs font-medium text-olive">
        <Hand size={13} /> {t("menuPage.tapHint")}
      </p>

      <div className="mt-8 space-y-8" data-testid="menu-list">
        {FEATURED.menuGroups.map((group) => {
          const items = inCategory(group);
          if (items.length === 0) return null;
          return (
            <section key={group} className="animate-fade-up">
              <h2 className="text-[11px] font-semibold uppercase tracking-label text-olive">
                {t(`product.cats.${group}`)}
              </h2>
              <div className="mt-3 rounded-panel border border-line bg-white p-5 shadow-card">
                {items.map((item, index) => {
                  const product = localize(item, lang);
                  return (
                    <button
                      key={product.id}
                      data-testid={`menu-item-${product.id}`}
                      onClick={() => openProduct(product.id)}
                      className={`group flex w-full items-center justify-between gap-4 py-3 text-left transition-all duration-300 hover:pl-2 ${
                        index > 0 ? "border-t border-line/60" : ""
                      }`}
                    >
                      {/* Hover styling alone told a phone nothing, so the name
                          carries a permanent underline and every row ends in a
                          chevron: both readable without a pointer. */}
                      <span className="font-display text-xl text-ink underline decoration-olive/30 decoration-dotted underline-offset-[6px] transition-colors group-hover:decoration-olive">
                        {product.name}
                      </span>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="whitespace-nowrap text-sm font-medium text-olive">
                          {formatPrice(product.price_huf, { secondary: true })}
                        </span>
                        <ChevronRight
                          size={16}
                          className="text-olive/40 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:text-olive"
                        />
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
