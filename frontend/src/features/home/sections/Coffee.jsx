import { motion } from "framer-motion";
import { ArrowUpRight, Heart } from "lucide-react";

import Reveal from "@/components/ui/Reveal";
import SectionLabel from "@/components/ui/SectionLabel";
import { MOTION } from "@/config/site";
import { useI18n } from "@/i18n";
import { localize, useCatalog } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { useUi } from "@/state/UiStore";

/** Every other card drops down, giving the row its editorial rhythm. */
const isTall = (index) => index % 3 === 0;

function DrinkCard({ product, index }) {
  const { t } = useI18n();
  const { openProduct, favourites, toggleFavourite } = useUi();
  const isFavourite = favourites.includes(product.id);

  return (
    <Reveal delay={index * 0.08} className={isTall(index) ? "md:mt-16" : ""}>
      <motion.article
        data-testid={`drink-card-${product.id}`}
        data-cursor="view"
        whileHover={{ y: -8 }}
        transition={{ duration: 0.4, ease: MOTION.ease }}
        className="group cursor-pointer"
        onClick={() => openProduct(product.id)}
      >
        <div className="relative h-[380px] overflow-hidden rounded-card md:h-[440px]">
          <img
            src={product.images?.[0]}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.06]"
          />
          <div className="absolute inset-0 transition-colors duration-500 group-hover:bg-olive/15" />
          <button
            data-testid={`coffee-fav-${product.id}`}
            aria-label={t(isFavourite ? "product.favRemove" : "product.favAdd")}
            onClick={(event) => {
              event.stopPropagation();
              toggleFavourite(product.id);
            }}
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-cream/90 text-olive shadow-sm transition-transform duration-300 hover:scale-110"
          >
            <Heart size={16} strokeWidth={1.8} fill={isFavourite ? "currentColor" : "none"} />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="rounded-full bg-cream/95 px-5 py-2 text-[10px] font-semibold tracking-label text-olive shadow-lg">
              {t("product.quick")}
            </span>
          </div>
        </div>

        <div className="mt-5 flex items-baseline justify-between gap-3">
          <h3 className="font-display text-2xl font-medium text-olive">{product.name}</h3>
          <span className="whitespace-nowrap text-sm font-medium text-olive/70">
            {formatPrice(product.price_huf)}
          </span>
        </div>
        <p className="mt-2 max-w-xs text-sm leading-relaxed text-olive/70">{product.desc}</p>
        <span className="mt-3 inline-flex items-center gap-2 text-[11px] font-semibold tracking-label text-olive">
          {t("home.news.read")}
          <ArrowUpRight
            size={13}
            className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </span>
      </motion.article>
    </Reveal>
  );
}

export default function Coffee() {
  const { t, lang } = useI18n();
  const { featured } = useCatalog();
  const drinks = featured("coffeeRow").map((p) => localize(p, lang));

  return (
    <section
      id="coffee"
      data-testid="coffee-section"
      className="mx-auto max-w-[1440px] px-6 py-28 md:px-12 md:py-40"
    >
      <SectionLabel section="coffee" title={t("home.coffee.label")} />
      <div className="flex flex-wrap items-end justify-between gap-10">
        <Reveal>
          <h2 className="max-w-xl font-display text-5xl font-medium leading-[1.02] tracking-tight text-olive md:text-7xl">
            {t("home.coffee.title1")}
            <br />
            {t("home.coffee.title2")}
            <span className="italic">{t("home.coffee.punct")}</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="max-w-sm text-base leading-relaxed text-olive/75">{t("home.coffee.body")}</p>
        </Reveal>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
        {drinks.map((product, i) => (
          <DrinkCard key={product.id} product={product} index={i} />
        ))}
      </div>
    </section>
  );
}
