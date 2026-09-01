import { motion, useReducedMotion } from "framer-motion";

import { MOTION } from "@/config/site";

const PANELS = {
  up: { hidden: { y: 0 }, show: { y: "-101%" } },
  right: { hidden: { x: 0 }, show: { x: "101%" } },
  left: { hidden: { x: 0 }, show: { x: "-101%" } },
};

/**
 * Cinematic reveal: a cream panel slides away while the image settles out of a
 * slow scale. Under reduced motion it is a plain image.
 */
export default function MaskedImage({
  src, alt, className = "", imgClassName = "",
  variant = "left", onClick, cursor, delay = 0,
}) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className={`relative overflow-hidden ${className}`} onClick={onClick} data-cursor={cursor}>
        <img src={src} alt={alt} loading="lazy" className={imgClassName} />
      </div>
    );
  }

  const panel = PANELS[variant] ?? PANELS.left;
  return (
    <motion.div
      className={`relative overflow-hidden ${className}`}
      onClick={onClick}
      data-cursor={cursor}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-15% 0px" }}
    >
      <motion.img
        src={src}
        alt={alt}
        loading="lazy"
        className={imgClassName}
        variants={{ hidden: { scale: 1.18 }, show: { scale: 1 } }}
        transition={{ duration: 1.2, delay: delay + 0.25, ease: MOTION.ease }}
      />
      <motion.div
        aria-hidden="true"
        className="absolute inset-0 bg-cream"
        variants={panel}
        transition={{ duration: 0.9, delay, ease: MOTION.ease }}
      />
    </motion.div>
  );
}
