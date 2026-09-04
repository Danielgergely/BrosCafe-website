import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Check, ChevronDown, Heart, Plus, X } from "lucide-react";

import { FLAVOUR_KEYS, MOTION } from "@/config/site";
import { useI18n } from "@/i18n";
import { localize, useCatalog } from "@/lib/catalog";
import { useJournal } from "@/lib/journal";
import { formatPrice } from "@/lib/format";
import { useUi } from "@/state/UiStore";

const SWIPE_THRESHOLD = 60;

const fadeUp = { hidden: { opacity: 0, y: 18 }, show: { opacity: 1, y: 0 } };
const stagger = { duration: 0.55, ease: MOTION.ease };

function FlavourBar({ left, right, value, testId }) {
  return (
    <div data-testid={testId}>
      <div className="flex justify-between text-[9px] font-semibold tracking-label text-olive/55">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="relative mt-2 h-[3px] rounded-full bg-olive/15">
        <motion.span
          initial={{ left: "50%", opacity: 0 }}
          animate={{ left: `${value}%`, opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.5, ease: MOTION.ease }}
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cream bg-olive shadow"
        />
      </div>
    </div>
  );
}

function BehindTheCup({ steps, label }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-t border-olive/10 pt-5">
      <button
        data-testid="behind-cup-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-[11px] font-semibold tracking-label text-olive"
      >
        {label}
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.3 }}>
          <ChevronDown size={14} />
        </motion.span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.5, ease: MOTION.ease }}
            className="overflow-hidden"
          >
            <ol className="mt-5 border-l border-olive/25 pl-5">
              {steps.map((step, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 + i * 0.12, duration: 0.45, ease: MOTION.ease }}
                  className="relative pb-4 text-sm text-olive/80 last:pb-1"
                >
                  <span className="absolute -left-[26px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-cream bg-olive" />
                  {step}
                </motion.li>
              ))}
            </ol>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MiniCard({ id, testId }) {
  const { lang } = useI18n();
  const { get } = useCatalog();
  const { openProduct } = useUi();
  const product = localize(get(id), lang);
  if (!product) return null;

  return (
    <button
      data-testid={testId}
      onClick={() => openProduct(id)}
      className="group flex items-center gap-3 rounded-card bg-white p-2.5 text-left shadow-card transition-all duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
    >
      <img src={product.images?.[0]} alt="" className="h-12 w-12 rounded-xl object-cover" />
      <div className="min-w-0">
        <p className="truncate font-display text-sm font-medium text-olive">{product.name}</p>
        <p className="text-[11px] text-olive/55">{formatPrice(product.price_huf)}</p>
      </div>
    </button>
  );
}

function Gallery({ product }) {
  const { t } = useI18n();
  const [slide, setSlide] = useState(0);

  const media = [
    ...(product.video ? [{ type: "video", src: product.video }] : []),
    ...(product.images ?? []).map((src) => ({ type: "image", src })),
  ];
  const current = media[Math.min(slide, media.length - 1)];
  if (!current) return <div className="bg-white md:h-full" />;

  const onDragEnd = (_event, info) => {
    if (info.offset.x < -SWIPE_THRESHOLD && slide < media.length - 1) setSlide(slide + 1);
    else if (info.offset.x > SWIPE_THRESHOLD && slide > 0) setSlide(slide - 1);
  };

  return (
    <div className="relative overflow-hidden bg-white md:h-full">
      <AnimatePresence mode="wait">
        <motion.div
          key={`${product.id}-${slide}`}
          initial={{ opacity: 0, scale: 1.03 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.45, ease: MOTION.ease }}
          className="group/gallery h-full w-full"
          data-cursor={current.type === "video" ? "play" : undefined}
        >
          {current.type === "video" ? (
            <video
              src={current.src}
              autoPlay
              muted
              loop
              playsInline
              className="h-full w-full object-cover"
            />
          ) : (
            <motion.img
              layoutId={slide === 0 && !product.video ? `product-image-${product.id}` : undefined}
              src={current.src}
              alt={product.name}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.15}
              onDragEnd={onDragEnd}
              className="h-full w-full cursor-grab object-cover transition-transform duration-500 group-hover/gallery:scale-[1.03] active:cursor-grabbing"
            />
          )}
        </motion.div>
      </AnimatePresence>

      {media.length > 1 && (
        <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 gap-2 rounded-full bg-cream/85 p-2 backdrop-blur">
          {media.map((item, i) => (
            <button
              key={`${item.type}-${i}`}
              onClick={() => setSlide(i)}
              aria-label={`${i + 1} / ${media.length}`}
              className={`h-8 w-8 overflow-hidden rounded-full transition-all duration-300 ${
                i === slide ? "ring-2 ring-olive" : "opacity-60 hover:opacity-100"
              }`}
            >
              {item.type === "video" ? (
                <span className="flex h-full w-full items-center justify-center bg-olive text-[8px] font-bold text-cream">
                  ▶
                </span>
              ) : (
                <img src={item.src} alt="" className="h-full w-full object-cover" />
              )}
            </button>
          ))}
        </div>
      )}

      {product.cat === "merch" && media.length > 2 && (
        <p className="absolute left-4 top-4 rounded-full bg-olive/85 px-4 py-1.5 text-[9px] font-semibold tracking-label text-cream">
          {t("product.drag")}
        </p>
      )}
    </div>
  );
}

function ModalBody({ product }) {
  const { t } = useI18n();
  const { related } = useCatalog();
  const { postsFor } = useJournal();
  const { favourites, toggleFavourite, day, addToDay, closeProduct, openPost } = useUi();
  const [justAdded, setJustAdded] = useState(false);

  useEffect(() => setJustAdded(false), [product.id]);

  const isFavourite = favourites.includes(product.id);
  const inDay = day.includes(product.id) || justAdded;
  const scales = t("product.scales");
  const milkMap = t("product.milkMap");
  const linkedPost = postsFor(product?.id ?? "")[0] ?? null;
  const allergenMap = t("product.allergenMap");

  return (
    <div className="grid h-full grid-rows-[45svh_1fr] md:grid-cols-2 md:grid-rows-1">
      <Gallery product={product} />

      <div className="no-scrollbar overflow-y-auto bg-cream px-6 pb-24 pt-6 md:h-full md:px-9 md:pb-10 md:pt-9">
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.08, delayChildren: 0.15 } } }}
        >
          <motion.div variants={fadeUp} transition={stagger}>
            <p className="text-[10px] font-semibold tracking-eyebrow text-olive/50">
              {t(`product.cats.${product.cat}`)}
            </p>
            <div className="mt-1 flex items-start justify-between gap-4">
              <h2
                data-testid="modal-product-name"
                className="font-display text-4xl font-medium tracking-tight text-olive md:text-5xl"
              >
                {product.name}
              </h2>
              <div className="flex shrink-0 flex-col items-end gap-2">
                <span
                  data-testid="modal-product-price"
                  className="mt-2 whitespace-nowrap font-display text-2xl italic text-olive/80"
                >
                  {formatPrice(product.price_huf)}
                </span>
                {product.cat === "merch" && (
                  <span className="rounded-full border border-olive/40 px-3 py-1 text-[9px] font-semibold tracking-label text-olive">
                    {t("common.comingSoon")}
                  </span>
                )}
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-olive/75">{product.desc}</p>

            {/* The entry written about this coffee. Derived from the journal
                side, so there is nothing to keep in step here. */}
            {linkedPost && (
              <button
                data-testid="product-journal-link"
                onClick={() => {
                  closeProduct();
                  openPost(linkedPost.id);
                }}
                className="group mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-olive underline underline-offset-4 transition-colors hover:text-olive-dark"
              >
                {t("news.aboutThis")}
                <ArrowRight
                  size={15}
                  className="transition-transform duration-300 group-hover:translate-x-0.5"
                />
              </button>
            )}
          </motion.div>

          {product.flavor && (
            <motion.div
              variants={fadeUp}
              transition={stagger}
              className="mt-7 space-y-4 rounded-card bg-white p-5 shadow-card"
            >
              <p className="text-[10px] font-semibold tracking-label text-olive/50">
                {t("product.flavor")}
              </p>
              {FLAVOUR_KEYS.map((key, i) => (
                <FlavourBar
                  key={key}
                  testId={`flavor-${key}`}
                  left={scales[i][0]}
                  right={scales[i][1]}
                  value={product.flavor[key] ?? 50}
                />
              ))}
            </motion.div>
          )}

          <motion.div variants={fadeUp} transition={stagger} className="mt-7 space-y-4">
            {product.sizes?.length > 1 && (
              <div>
                <p className="text-[10px] font-semibold tracking-label text-olive/50">
                  {t("product.size")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.sizes.map((size) => (
                    <span
                      key={size}
                      className="rounded-full border border-olive/25 px-4 py-1.5 text-xs text-olive"
                    >
                      {size}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {product.milks?.length > 0 && (
              <div data-testid="product-milks">
                <p className="text-[10px] font-semibold tracking-label text-olive/50">
                  {t("product.milk")}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.milks.map((milk) => (
                    <span
                      key={milk}
                      className="rounded-full border border-olive/25 px-4 py-1.5 text-xs text-olive"
                    >
                      {milkMap[milk] ?? milk}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {product.temp && product.temp !== "hot" && (
              <div className="flex gap-2">
                {(product.temp === "both" ? ["hot", "iced"] : [product.temp]).map((temp) => (
                  <span
                    key={temp}
                    className="rounded-full bg-olive/10 px-4 py-1.5 text-[10px] font-semibold tracking-label text-olive"
                  >
                    {t(`product.${temp}`)}
                  </span>
                ))}
              </div>
            )}

            {product.material && <p className="text-xs text-olive/65">{product.material}</p>}

            {product.ingredients?.length > 0 && (
              <div>
                <p className="text-[10px] font-semibold tracking-label text-olive/50">
                  {t("product.inside")}
                </p>
                <p className="mt-1.5 text-sm text-olive/75">{product.ingredients.join(" · ")}</p>
              </div>
            )}

            {product.allergens?.length > 0 && (
              <p className="text-[11px] text-olive/55">
                {t("product.allergens")}{" "}
                {product.allergens.map((a) => allergenMap[a] ?? a).join(", ")}
              </p>
            )}
          </motion.div>

          {product.tip && (
            <motion.div
              variants={fadeUp}
              transition={stagger}
              className="mt-7 rounded-card border border-dashed border-olive/30 p-5"
            >
              <p className="text-[10px] font-semibold tracking-label text-olive/50">
                {t("product.tip")}
              </p>
              <p className="mt-2 font-display text-xl italic text-olive">„{product.tip}”</p>
            </motion.div>
          )}

          {product.behind?.length > 0 && (
            <motion.div variants={fadeUp} transition={stagger} className="mt-7">
              <BehindTheCup steps={product.behind} label={t("product.behind")} />
            </motion.div>
          )}

          <motion.div variants={fadeUp} transition={stagger} className="mt-7 flex gap-3">
            <button
              data-testid="modal-fav"
              onClick={() => toggleFavourite(product.id)}
              aria-label={t(isFavourite ? "product.favRemove" : "product.favAdd")}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all duration-300 ${
                isFavourite
                  ? "border-olive bg-olive text-cream"
                  : "border-olive/30 text-olive hover:border-olive"
              }`}
            >
              <motion.span
                key={isFavourite ? "on" : "off"}
                initial={{ scale: 0.5 }}
                animate={{ scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 14 }}
                className="flex"
              >
                <Heart size={18} strokeWidth={1.7} fill={isFavourite ? "currentColor" : "none"} />
              </motion.span>
            </button>
            <button
              data-testid="modal-add-day"
              onClick={() => {
                addToDay(product.id);
                setJustAdded(true);
              }}
              className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[11px] font-semibold tracking-label transition-all duration-300 ${
                inDay
                  ? "bg-olive/15 text-olive"
                  : "bg-olive text-cream hover:-translate-y-0.5 hover:shadow-card-hover"
              }`}
            >
              {inDay ? (
                <>
                  <Check size={14} /> {t("product.inDay")}
                </>
              ) : (
                <>
                  <Plus size={14} /> {t("product.addDay")}
                </>
              )}
            </button>
          </motion.div>

          {product.pairings?.length > 0 && (
            <motion.div variants={fadeUp} transition={stagger} className="mt-8">
              <p className="text-[10px] font-semibold tracking-label text-olive/50">
                {t("product.pairs")}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2.5">
                {product.pairings.slice(0, 2).map((id) => (
                  <MiniCard key={id} id={id} testId={`pairing-${id}`} />
                ))}
              </div>
            </motion.div>
          )}

          <motion.div
            variants={fadeUp}
            transition={stagger}
            className="mt-8 border-t border-olive/10 pt-6"
          >
            <p className="text-[10px] font-semibold tracking-label text-olive/50">
              {t("product.more")}
            </p>
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
              {related(product).map((item) => (
                <MiniCard key={item.id} id={item.id} testId={`related-${item.id}`} />
              ))}
            </div>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}

/** Mounted once at the app root; opens whenever a product id is set. */
export default function ProductModal() {
  const { t, lang } = useI18n();
  const { get } = useCatalog();
  const { activeProductId, closeProduct } = useUi();
  const product = localize(get(activeProductId), lang);

  useEffect(() => {
    const onKeyDown = (event) => event.key === "Escape" && closeProduct();
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [closeProduct]);

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          data-testid="product-modal"
          role="dialog"
          aria-modal="true"
          aria-label={product.name}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35 }}
          className="fixed inset-0 z-[70] flex items-center justify-center bg-olive/45 backdrop-blur-md md:p-6"
          onClick={closeProduct}
        >
          <motion.div
            initial={{ scale: 0.94, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 12 }}
            transition={{ duration: 0.5, ease: MOTION.ease }}
            onClick={(event) => event.stopPropagation()}
            className="relative h-[100svh] w-full overflow-hidden bg-cream md:h-[min(780px,92vh)] md:max-w-6xl md:rounded-panel md:shadow-[0_40px_100px_rgba(45,52,32,0.45)]"
          >
            <button
              data-testid="modal-close"
              aria-label={t("product.closeProduct")}
              onClick={closeProduct}
              className="absolute right-4 top-4 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-cream/90 text-olive shadow-md transition-transform duration-300 hover:scale-110"
            >
              <X size={18} />
            </button>
            <ModalBody key={product.id} product={product} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
