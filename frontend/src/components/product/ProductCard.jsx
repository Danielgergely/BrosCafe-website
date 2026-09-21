import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Heart } from "lucide-react";

import StockPhotoNote from "@/components/product/StockPhotoNote";
import { MOTION } from "@/config/site";
import { useI18n } from "@/i18n";
import { formatPrice } from "@/lib/format";
import { useUi } from "@/state/UiStore";

/** Grid card for one product. `product` must already be localized. */
export default function ProductCard({ product, index = 0 }) {
  const { t } = useI18n();
  const { openProduct, favourites, toggleFavourite, activeProductId, closingProductId } = useUi();
  const [hovered, setHovered] = useState(false);
  const videoRef = useRef(null);

  const isFavourite = favourites.includes(product.id);
  // Hidden while the shared-layout animation owns the image.
  const concealed = activeProductId === product.id || closingProductId === product.id;

  const onEnter = () => {
    setHovered(true);
    videoRef.current?.play().catch(() => {});
  };
  const onLeave = () => {
    setHovered(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  };

  return (
    <motion.article
      layout
      data-testid={`product-card-${product.id}`}
      data-cursor="view"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.5, delay: Math.min(index * 0.04, 0.3), ease: MOTION.ease }}
      className="group cursor-pointer"
      onClick={() => openProduct(product.id)}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      <div className="relative h-[300px] overflow-hidden rounded-card bg-white md:h-[340px]">
        <motion.img
          layoutId={`product-image-${product.id}`}
          src={product.images?.[0]}
          alt={product.name}
          loading="lazy"
          style={{ opacity: concealed ? 0 : 1 }}
          className={`h-full w-full object-cover transition-[transform,opacity] duration-700 ease-editorial group-hover:scale-[1.05] ${
            product.video && hovered ? "opacity-0" : ""
          }`}
        />
        <StockPhotoNote product={product} className="absolute bottom-3 left-3 z-10" />
        {product.video && (
          <video
            ref={videoRef}
            src={product.video}
            muted
            loop
            playsInline
            preload="none"
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
          />
        )}

        <button
          data-testid={`fav-${product.id}`}
          aria-label={t(isFavourite ? "product.favRemove" : "product.favAdd")}
          onClick={(event) => {
            event.stopPropagation();
            toggleFavourite(product.id);
          }}
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-cream/90 text-olive shadow-sm transition-transform duration-300 hover:scale-110"
        >
          <motion.span
            key={isFavourite ? "on" : "off"}
            initial={{ scale: 0.4 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 15 }}
            className="flex"
          >
            <Heart size={16} strokeWidth={1.8} fill={isFavourite ? "currentColor" : "none"} />
          </motion.span>
        </button>

        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-4 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
          <span className="rounded-full bg-cream/95 px-5 py-2 text-[10px] font-semibold tracking-label text-olive shadow-lg">
            {t("product.quick")}
          </span>
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-3 px-1">
        <h3 className="font-display text-xl font-medium text-olive">{product.name}</h3>
        <span className="whitespace-nowrap text-sm font-medium text-olive/70">
          {formatPrice(product.price_huf)}
        </span>
      </div>
    </motion.article>
  );
}
