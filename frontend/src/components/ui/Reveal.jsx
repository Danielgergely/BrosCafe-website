import { motion, useReducedMotion } from "framer-motion";

import { MOTION } from "@/config/site";

/** Fade-and-rise a block into view once. No-op under reduced motion. */
export default function Reveal({ children, delay = 0, y = 32, className = "" }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduce ? false : { opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-12% 0px" }}
      transition={{ duration: MOTION.reveal, delay, ease: MOTION.ease }}
    >
      {children}
    </motion.div>
  );
}
