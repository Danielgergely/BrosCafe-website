import { useRef } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";

import ProductTile from "@/components/product/ProductTile";
import Reveal from "@/components/ui/Reveal";
import SectionLabel from "@/components/ui/SectionLabel";
import { MENU_SECTIONS, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { localize, useCatalog } from "@/lib/catalog";

/**
 * One menu section as a sideways strip. The heading links to that section's
 * tab on /menu; each tile opens the product.
 *
 * `data-lenis-prevent-horizontal` hands sideways trackpad gestures to the
 * browser — without it the page's smooth scroll swallows them. Vertical
 * scrolling over the strip still moves the page.
 */
function SectionRow({ section, index }) {
  const { t, lang } = useI18n();
  const { inSection } = useCatalog();
  const strip = useRef(null);
  const products = inSection(section).map((p) => localize(p, lang));
  if (products.length === 0) return null;

  const page = (direction) => {
    const element = strip.current;
    if (element) element.scrollBy({ left: direction * element.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <Reveal delay={index * 0.05}>
      <div data-testid={`menu-row-${section}`} className="border-t border-olive/15 pt-6">
        <div className="flex items-center justify-between gap-4 px-6 md:px-12">
          {/* Wraps rather than truncates: the Hungarian names run long, and
              "KÁVÉ & KÜL…" next to the button told a phone nothing. */}
          <Link
            to={ROUTES.menuSection(section)}
            data-testid={`menu-row-link-${section}`}
            className="group min-w-0"
          >
            <h3 className="font-display text-2xl font-medium leading-tight text-olive md:text-4xl">
              {t(`product.sections.${section}`)}
              <span className="ml-2 align-middle font-sans text-xs font-medium text-olive/50">
                {products.length}
              </span>
            </h3>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            {/* Touch screens swipe; the arrows are for a mouse, which can't. */}
            <button
              type="button"
              onClick={() => page(-1)}
              aria-label={t("home.menu.prev")}
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-olive/25 text-olive transition-colors hover:bg-olive hover:text-cream md:flex"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              type="button"
              onClick={() => page(1)}
              aria-label={t("home.menu.next")}
              className="hidden h-9 w-9 items-center justify-center rounded-full border border-olive/25 text-olive transition-colors hover:bg-olive hover:text-cream md:flex"
            >
              <ChevronRight size={16} />
            </button>
            <Link
              to={ROUTES.menuSection(section)}
              className="group inline-flex items-center gap-1.5 rounded-full border border-olive/25 px-4 py-2 text-[11px] font-semibold tracking-label text-olive transition-colors hover:bg-olive hover:text-cream"
            >
              {t("home.menu.seeAll")}
              <ArrowRight size={13} className="transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>

        <div
          ref={strip}
          data-lenis-prevent-horizontal
          className="no-scrollbar mt-5 flex snap-x snap-mandatory scroll-px-6 gap-4 overflow-x-auto px-6 pb-2 md:scroll-px-12 md:gap-6 md:px-12"
        >
          {products.map((product) => (
            <ProductTile key={product.id} product={product} testId={`menu-row-${section}`} />
          ))}
          {/* The end of the strip says where the rest is, instead of just stopping. */}
          <Link
            to={ROUTES.menuSection(section)}
            className="flex aspect-[4/5] w-[38vw] max-w-[220px] shrink-0 snap-start flex-col items-center justify-center gap-3 rounded-card border border-dashed border-olive/30 text-center text-olive transition-colors hover:bg-olive/5 sm:w-[220px]"
          >
            <ArrowRight size={22} />
            <span className="px-4 text-[11px] font-semibold tracking-label">
              {t("home.menu.allIn", { section: t(`product.sections.${section}`) })}
            </span>
          </Link>
        </div>
      </div>
    </Reveal>
  );
}

/** The homepage menu: one sideways row per section, each linking to its tab. */
export default function MenuRows() {
  const { t } = useI18n();

  return (
    <section id="menu" data-testid="menu-section" className="mx-auto max-w-[1440px] py-28 md:py-40">
      <div className="px-6 md:px-12">
        <SectionLabel section="menu" title={t("home.menu.label")} />
        <div className="flex flex-wrap items-end justify-between gap-8">
          <Reveal>
            <h2 className="max-w-xl font-display text-5xl font-medium leading-[1.02] tracking-tight text-olive md:text-7xl">
              {t("home.menu.title1")}
              <br />
              {t("home.menu.title2")}
              <span className="italic">{t("home.menu.punct")}</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="max-w-sm text-base leading-relaxed text-olive/75">{t("home.menu.body")}</p>
          </Reveal>
        </div>
      </div>

      <div className="mt-14 space-y-12 md:space-y-16">
        {MENU_SECTIONS.map((section, index) => (
          <SectionRow key={section} section={section} index={index} />
        ))}
      </div>
    </section>
  );
}
