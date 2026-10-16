import { useEffect, useMemo, useRef, useState } from "react";
import { Hand, Search, X } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";

import PageShell from "@/components/layout/PageShell";
import ProductCard from "@/components/product/ProductCard";
import { MENU_SECTIONS, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { track } from "@/lib/api";
import { localize, useCatalog } from "@/lib/catalog";
import { matchesQuery } from "@/lib/search";

/** Consecutive runs of one category, so a section reads "Cakes · Made here · Bakery". */
function groupByCategory(products) {
  const groups = [];
  for (const product of products) {
    const last = groups[groups.length - 1];
    if (last && last.cat === product.cat) last.items.push(product);
    else groups.push({ cat: product.cat, items: [product] });
  }
  return groups;
}

function ProductGrid({ products }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 lg:grid-cols-4">
      {products.map((product, i) => (
        <ProductCard key={product.id} product={product} index={i} />
      ))}
    </div>
  );
}

/**
 * The full menu, one tab per section (/menu/coffee, /menu/cold, …). Typing in
 * the search box searches every section at once. Products open the shared
 * product modal, same as on the homepage.
 *
 * @param {string} [section] forces a tab — the /product/:id deep link passes the
 *   product's own section, since that URL carries none.
 */
export default function MenuPage({ section: forcedSection }) {
  const { t, lang } = useI18n();
  const { section: routeSection } = useParams();
  const { products, inSection } = useCatalog();
  const [query, setQuery] = useState("");
  const tabs = useRef(null);

  const section = forcedSection ?? routeSection ?? MENU_SECTIONS[0];
  const searching = query.trim() !== "";

  useEffect(() => {
    track("page_view", { src: "menu" });
  }, []);

  // On a phone the tab row scrolls sideways; bring the open tab into view, or
  // a deep link to the last section opens with no visible active tab.
  useEffect(() => {
    const active = tabs.current?.querySelector('[aria-current="page"]');
    active?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [section]);

  const groups = useMemo(
    () => groupByCategory(inSection(section).map((p) => localize(p, lang))),
    [inSection, section, lang],
  );
  const results = useMemo(
    () =>
      searching
        ? products
            .filter((p) => p.cat !== "merch")
            .map((p) => localize(p, lang))
            .filter((p) => matchesQuery(p, query))
        : [],
    [products, searching, query, lang],
  );

  if (!MENU_SECTIONS.includes(section)) return <Navigate to={ROUTES.menu} replace />;

  return (
    <PageShell width="wide">
      <h1 className="font-display text-4xl text-ink md:text-5xl">{t("menuPage.title")}</h1>
      <p className="mt-2 max-w-xl text-sm text-muted">{t("menuPage.sub")}</p>

      {/* Sticks under the fixed header so the tabs stay in reach on a long section. */}
      <div className="sticky top-[68px] z-30 -mx-6 mt-6 border-b border-line bg-cream/95 px-6 pb-3 pt-3 backdrop-blur md:top-[76px]">
        <nav
          ref={tabs}
          aria-label={t("menuPage.sections")}
          className="no-scrollbar flex gap-2 overflow-x-auto"
          data-testid="menu-tabs"
        >
          {MENU_SECTIONS.map((key) => {
            const active = !searching && key === section;
            return (
              <Link
                key={key}
                to={ROUTES.menuSection(key)}
                onClick={() => setQuery("")}
                aria-current={active ? "page" : undefined}
                data-testid={`menu-tab-${key}`}
                className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[11px] font-semibold tracking-label transition-colors duration-300 ${
                  active
                    ? "border-olive bg-olive text-cream"
                    : "border-olive/25 text-olive hover:border-olive"
                }`}
              >
                {t(`product.sections.${key}`)}
              </Link>
            );
          })}
        </nav>

        <div className="mt-3 flex items-center gap-2 rounded-full border border-olive/20 bg-white px-4 py-2 focus-within:border-olive">
          <Search size={16} className="shrink-0 text-olive/50" />
          <input
            data-testid="menu-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("menuPage.searchPlaceholder")}
            aria-label={t("menuPage.searchLabel")}
            className="w-full bg-transparent text-sm text-ink placeholder:text-olive/40 focus:outline-none"
          />
          {searching && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label={t("menuPage.clearSearch")}
              className="text-olive/60 hover:text-olive"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>

      <p className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-olive/10 px-3 py-1.5 text-xs font-medium text-olive">
        <Hand size={13} /> {t("menuPage.tapHint")}
      </p>

      <div className="mt-8" data-testid="menu-list">
        {searching ? (
          results.length > 0 ? (
            <ProductGrid products={results} />
          ) : (
            <p data-testid="menu-empty" className="py-16 text-center font-display text-2xl italic text-olive/60">
              {t("menuPage.empty")}
            </p>
          )
        ) : (
          <div className="space-y-12">
            {groups.map((group) => (
              <section key={`${group.cat}-${group.items[0].id}`}>
                {groups.length > 1 && (
                  <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-label text-olive">
                    {t(`product.cats.${group.cat}`)}
                  </h2>
                )}
                <ProductGrid products={group.items} />
              </section>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}
