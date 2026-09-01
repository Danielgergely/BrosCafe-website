import { useEffect, useState } from "react";
import { AnimatePresence, motion, useMotionValue, useSpring } from "framer-motion";

import { MOTION } from "@/config/site";
import { useI18n } from "@/i18n";

/**
 * Desktop-only floating cursor label. Any element with `data-cursor="view"`
 * (or explore/play) shows the matching word while hovered.
 */
export default function CustomCursor() {
  const { t } = useI18n();
  const [label, setLabel] = useState(null);
  const [enabled, setEnabled] = useState(false);
  const x = useMotionValue(-100);
  const y = useMotionValue(-100);
  const springX = useSpring(x, { stiffness: 400, damping: 35 });
  const springY = useSpring(y, { stiffness: 400, damping: 35 });

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return undefined;
    setEnabled(true);

    const move = (event) => {
      x.set(event.clientX);
      y.set(event.clientY);
    };
    const hover = (event) => {
      const target = event.target.closest?.("[data-cursor]");
      setLabel(target ? target.dataset.cursor : null);
    };

    window.addEventListener("mousemove", move);
    window.addEventListener("mouseover", hover);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseover", hover);
    };
  }, [x, y]);

  if (!enabled) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 top-0 z-[100]"
      style={{ x: springX, y: springY }}
    >
      <AnimatePresence>
        {label && (
          <motion.span
            key={label}
            data-testid="custom-cursor-label"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 0.25, ease: MOTION.ease }}
            className="flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-olive text-[9px] font-semibold tracking-label text-cream shadow-[0_10px_30px_rgba(102,115,74,0.4)]"
          >
            {t(`cursor.${label}`)}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
