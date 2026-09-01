import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search } from "lucide-react";

import ProductCard from "@/components/product/ProductCard";
import Reveal from "@/components/ui/Reveal";
import SectionLabel from "@/components/ui/SectionLabel";
import { MOTION } from "@/config/site";
import { useI18n } from "@/i18n";
import { localize, useCatalog } from "@/lib/catalog";
import { matchesQuery } from "@/lib/search";
import { useUi } from "@/state/UiStore";

export default function Collection() {
  const { t, lang } = useI18n();
  const { products, categories } = useCatalog();
  const { activeProductId } = useUi();
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");

  const visible = useMemo(() => {
    const inCategory = category === "all" ? products : products.filter((p) => p.cat === category);
    return inCategory.map((p) => localize(p, lang)).filter((p) => matchesQuery(p, query));
  }, [products, category, query, lang]);

  return (
    <section
      id="collection"
      data-testid="collection-section"
      className="mx-auto max-w-[1440px] px-6 pb-28 md:px-12 md:pb-40"
    >
      <SectionLabel section="collection" title={t("home.collection.label")} />

      <div className="flex flex-wrap items-end justify-between gap-10">
        <Reveal>
          <h2 className="max-w-xl font-display text-5xl font-medium leading-[1.02] tracking-tight text-olive md:text-6xl">
            {t("home.collection.title1")}
            <br />
            {t("home.collection.title2")}
            <span className="italic">{t("home.collection.punct")}</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1} className="w-full max-w-sm">
          <div className="flex items-center gap-3 border-b border-olive/30 pb-3 transition-colors duration-300 focus-within:border-olive">
            <Search size={18} className="shrink-0 text-olive/50" />
            <input
              data-testid="collection-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("home.collection.placeholder")}
              aria-label={t("home.collection.searchLabel")}
              className="w-full bg-transparent font-display text-2xl italic text-olive placeholder:text-olive/35 focus:outline-none"
            />
          </div>
        </Reveal>
      </div>

      <Reveal delay={0.12}>
        <div
          data-testid="category-filters"
          className="no-scrollbar mt-10 flex gap-2 overflow-x-auto pb-1"
        >
          {categories.map((cat) => (
            <button
              key={cat}
              data-testid={`filter-${cat}`}
              onClick={() => setCategory(cat)}
              aria-pressed={category === cat}
              className={`relative shrink-0 rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-label transition-colors duration-300 ${
                category === cat ? "text-cream" : "text-olive/70 hover:text-olive"
              }`}
            >
              {category === cat && (
                <motion.span
                  layoutId="category-pill"
                  transition={{ duration: 0.45, ease: MOTION.ease }}
                  className="absolute inset-0 rounded-full bg-olive"
                />
              )}
              <span className="relative z-10">{t(`product.cats.${cat}`)}</span>
            </button>
          ))}
        </div>
      </Reveal>

      <motion.div layout className="mt-12 grid grid-cols-2 gap-6 md:gap-8 lg:grid-cols-4">
        {/* popLayout keeps the grid from jumping as cards filter out. It must not
            run while the modal owns a card's image, or the shared layout breaks. */}
        <AnimatePresence mode={activeProductId ? "sync" : "popLayout"}>
          {visible.map((product, i) => (
            <ProductCard key={product.id} product={product} index={i} />
          ))}
        </AnimatePresence>
      </motion.div>

      {visible.length === 0 && (
        <p
          data-testid="collection-empty"
          className="mt-16 text-center font-display text-2xl italic text-olive/60"
        >
          {t("home.collection.empty")}
        </p>
      )}
    </section>
  );
}
