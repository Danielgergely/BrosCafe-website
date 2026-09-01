import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import Reveal from "@/components/ui/Reveal";
import SectionLabel from "@/components/ui/SectionLabel";
import { FEATURED, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { localize, useCatalog } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { useUi } from "@/state/UiStore";

/** Dotted-leader menu list, grouped by category, sharing the product modal. */
export default function MenuPreview() {
  const { t, lang } = useI18n();
  const { inCategory } = useCatalog();
  const { openProduct } = useUi();

  return (
    <section
      id="menu"
      data-testid="menu-section"
      className="mx-auto max-w-[1440px] px-6 py-28 md:px-12 md:py-40"
    >
      <div className="grid gap-16 lg:grid-cols-[1fr_1.3fr] lg:gap-24">
        <div className="lg:sticky lg:top-32 lg:self-start">
          <SectionLabel section="menu" title={t("home.menu.label")} />
          <Reveal>
            <h2 className="font-display text-5xl font-medium leading-[1.02] tracking-tight text-olive md:text-7xl">
              {t("home.menu.title1")}
              <br />
              {t("home.menu.title2")}
              <span className="italic">{t("home.menu.punct")}</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-sm text-base leading-relaxed text-olive/75">
              {t("home.menu.body")}
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <Link
              data-testid="view-menu-button"
              to={ROUTES.menu}
              className="group mt-10 inline-flex items-center gap-3 rounded-full bg-olive px-8 py-4 text-[11px] font-semibold tracking-label text-cream transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(102,115,74,0.3)]"
            >
              {t("home.menu.cta")}
              <ArrowUpRight
                size={14}
                className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>
          </Reveal>
        </div>

        <div className="space-y-12">
          {FEATURED.menuGroups.map((group, groupIndex) => {
            const items = inCategory(group);
            if (items.length === 0) return null;
            return (
              <Reveal key={group} delay={groupIndex * 0.05}>
                <div data-testid={`menu-group-${group}`}>
                  <h3 className="mb-4 text-[11px] font-semibold tracking-eyebrow text-olive/60">
                    {t(`product.cats.${group}`)}
                  </h3>
                  <ul className="divide-y divide-olive/10 border-y border-olive/10">
                    {items.map((item) => {
                      const product = localize(item, lang);
                      return (
                        <li key={product.id}>
                          <button
                            data-testid={`menu-preview-${product.id}`}
                            data-cursor="view"
                            onClick={() => openProduct(product.id)}
                            className="group flex w-full items-baseline justify-between gap-4 py-4 text-left transition-all duration-300 hover:pl-3"
                          >
                            <span className="font-display text-2xl font-medium text-olive">
                              {product.name}
                            </span>
                            <span className="mx-2 flex-1 border-b border-dotted border-olive/25" />
                            <span className="whitespace-nowrap text-sm font-medium text-olive/70">
                              {formatPrice(product.price_huf)}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
