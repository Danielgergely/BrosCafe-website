import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";

import MaskedImage from "@/components/ui/MaskedImage";
import Reveal from "@/components/ui/Reveal";
import SectionLabel from "@/components/ui/SectionLabel";
import { MOTION } from "@/config/site";
import { useI18n } from "@/i18n";
import { localize, useCatalog } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { useUi } from "@/state/UiStore";

/** Asymmetric grid: the first item is the hero tile, then two squares and a wide one. */
const TILES = [
  { span: "col-span-2 row-span-2", variant: "left" },
  { span: "col-span-1 row-span-1", variant: "up" },
  { span: "col-span-1 row-span-1", variant: "right" },
  { span: "col-span-2 row-span-1", variant: "up" },
];

export default function MerchLookbook() {
  const { t, lang } = useI18n();
  const { featured } = useCatalog();
  const { openProduct } = useUi();

  const looks = featured("merchLookbook").map((p) => localize(p, lang));

  return (
    <section
      id="merch"
      data-testid="merch-section"
      className="mx-auto max-w-[1440px] px-6 py-28 md:px-12 md:py-40"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel section="merch" title={t("home.merch.label")} />
          <Reveal>
            <h2 className="font-display text-5xl font-medium leading-[1.02] tracking-tight text-olive md:text-7xl">
              {t("home.merch.title1")}
              <br />
              {t("home.merch.title2")}
              <span className="italic">{t("home.merch.punct")}</span>
            </h2>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <p className="max-w-xs text-sm leading-relaxed text-olive/70">{t("home.merch.body")}</p>
        </Reveal>
      </div>

      <div className="mt-16 grid auto-rows-[200px] grid-cols-2 gap-4 md:auto-rows-[240px] md:grid-cols-4 md:gap-6">
        {looks.map((product, i) => {
          const tile = TILES[i % TILES.length];
          return (
            <motion.div
              key={product.id}
              data-testid={`lookbook-${product.id}`}
              data-cursor="view"
              whileHover={{ y: -6 }}
              transition={{ duration: 0.4, ease: MOTION.ease }}
              className={`group relative cursor-pointer ${tile.span}`}
              onClick={() => openProduct(product.id)}
            >
              <MaskedImage
                src={product.images?.[0]}
                alt={product.name}
                variant={tile.variant}
                delay={i * 0.1}
                className="h-full w-full rounded-card"
                imgClassName="h-full w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.05]"
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between rounded-b-card bg-gradient-to-t from-olive/70 to-transparent p-5 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                <div>
                  <p className="font-display text-lg font-medium text-cream">{product.name}</p>
                  <p className="text-xs text-cream/80">{formatPrice(product.price_huf)}</p>
                </div>
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cream text-olive">
                  <ArrowUpRight size={13} />
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
