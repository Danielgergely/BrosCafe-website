import { AnimatePresence, motion } from "framer-motion";
import { Heart } from "lucide-react";

import Reveal from "@/components/ui/Reveal";
import { MOTION } from "@/config/site";
import { useI18n } from "@/i18n";
import { localize, useCatalog } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { useUi } from "@/state/UiStore";

/** Only rendered once the visitor has favourited something. */
export default function YourPicks() {
  const { t, lang } = useI18n();
  const { get } = useCatalog();
  const { favourites, openProduct } = useUi();

  const picks = favourites.map((id) => localize(get(id), lang)).filter(Boolean);
  if (picks.length === 0) return null;

  return (
    <section
      id="picks"
      data-testid="picks-section"
      className="mx-auto max-w-[1440px] px-6 pb-28 md:px-12 md:pb-40"
    >
      <p className="mb-6 text-[11px] font-medium tracking-eyebrow text-olive/60">
        {t("home.picks.label")}
      </p>
      <Reveal>
        <h2 className="font-display text-4xl font-medium tracking-tight text-olive md:text-6xl">
          {t("home.picks.title")}
          <span className="italic">{t("home.picks.punct")}</span>
        </h2>
      </Reveal>
      <div className="mt-10 flex flex-wrap gap-4">
        <AnimatePresence>
          {picks.map((product, i) => (
            <motion.button
              key={product.id}
              data-testid={`pick-${product.id}`}
              data-cursor="view"
              layout
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.4, delay: i * 0.05, ease: MOTION.ease }}
              onClick={() => openProduct(product.id)}
              className="group flex items-center gap-4 rounded-card bg-white p-3 pr-6 text-left shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-card-hover"
            >
              <img
                src={product.images?.[0]}
                alt=""
                className="h-16 w-16 rounded-xl object-cover"
              />
              <div>
                <p className="font-display text-lg font-medium text-olive">{product.name}</p>
                <p className="text-xs text-olive/60">{formatPrice(product.price_huf)}</p>
              </div>
              <Heart size={14} className="ml-2 text-olive" fill="currentColor" />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </section>
  );
}
