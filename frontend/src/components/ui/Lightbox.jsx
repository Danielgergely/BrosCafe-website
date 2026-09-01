import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

import { MOTION } from "@/config/site";
import { useI18n } from "@/i18n";
import { useUi } from "@/state/UiStore";

const SWIPE_THRESHOLD = 60;

/** Fullscreen image viewer. Index lives in the store, so no local mutation. */
export default function Lightbox() {
  const { t } = useI18n();
  const { lightbox, closeLightbox, moveLightbox } = useUi();

  useEffect(() => {
    if (!lightbox) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") closeLightbox();
      if (event.key === "ArrowLeft") moveLightbox(-1);
      if (event.key === "ArrowRight") moveLightbox(1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightbox, closeLightbox, moveLightbox]);

  return (
    <AnimatePresence>
      {lightbox && (
        <motion.div
          data-testid="lightbox"
          role="dialog"
          aria-modal="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-olive/80 backdrop-blur-xl"
          onClick={closeLightbox}
        >
          <button
            data-testid="lightbox-close"
            aria-label={t("lightbox.close")}
            onClick={closeLightbox}
            className="absolute right-5 top-5 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-cream/15 text-cream transition-colors duration-300 hover:bg-cream/30"
          >
            <X size={20} />
          </button>

          {lightbox.images.length > 1 && (
            <>
              <button
                data-testid="lightbox-prev"
                aria-label={t("lightbox.prev")}
                onClick={(event) => {
                  event.stopPropagation();
                  moveLightbox(-1);
                }}
                className="absolute left-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-cream/15 text-cream transition-colors duration-300 hover:bg-cream/30"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                data-testid="lightbox-next"
                aria-label={t("lightbox.next")}
                onClick={(event) => {
                  event.stopPropagation();
                  moveLightbox(1);
                }}
                className="absolute right-4 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-cream/15 text-cream transition-colors duration-300 hover:bg-cream/30"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          <motion.img
            key={lightbox.index}
            src={lightbox.images[lightbox.index]}
            alt={t("lightbox.alt")}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: MOTION.ease }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragEnd={(_event, info) => {
              if (info.offset.x < -SWIPE_THRESHOLD) moveLightbox(1);
              else if (info.offset.x > SWIPE_THRESHOLD) moveLightbox(-1);
            }}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[85vh] max-w-[92vw] cursor-grab rounded-card object-contain shadow-2xl active:cursor-grabbing"
          />

          <p className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] tracking-label text-cream/70">
            {lightbox.index + 1} / {lightbox.images.length}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
