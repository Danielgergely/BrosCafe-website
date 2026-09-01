import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import { MEDIA, MOTION, ROUTES } from "@/config/site";
import { scrollToSection } from "@/hooks/useLenis";
import { useI18n } from "@/i18n";

/** Mouse parallax range, in pixels. */
const DRIFT = { x: 18, y: 12 };

function MaskedLine({ children, delay, className }) {
  return (
    <span className="block overflow-hidden pb-[0.08em]">
      <motion.span
        className={`block ${className}`}
        initial={{ y: "112%" }}
        animate={{ y: 0 }}
        transition={{ duration: 1.1, delay, ease: MOTION.ease }}
      >
        {children}
      </motion.span>
    </span>
  );
}

export default function Hero() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const driftX = useSpring(mouseX, { stiffness: 40, damping: 20 });
  const driftY = useSpring(mouseY, { stiffness: 40, damping: 20 });

  const onMouseMove = (event) => {
    if (reduce) return;
    mouseX.set((event.clientX / window.innerWidth - 0.5) * DRIFT.x);
    mouseY.set((event.clientY / window.innerHeight - 0.5) * DRIFT.y);
  };

  return (
    <section
      id="home"
      data-testid="hero-section"
      onMouseMove={onMouseMove}
      className="grain relative flex h-[100svh] min-h-[620px] items-end overflow-hidden bg-olive"
    >
      <motion.div className="absolute inset-[-3%]" style={reduce ? {} : { x: driftX, y: driftY }}>
        <motion.video
          data-testid="hero-video"
          className="h-full w-full object-cover"
          src={MEDIA.video.hero.src}
          poster={MEDIA.video.hero.poster}
          autoPlay
          muted
          loop
          playsInline
          initial={{ scale: 1.15 }}
          animate={{ scale: 1.04 }}
          transition={{ duration: 2.4, ease: "easeOut" }}
        />
      </motion.div>
      <div className="absolute inset-0 bg-olive/45" />
      <div className="absolute inset-0 bg-cream/10 mix-blend-overlay" />

      <div className="relative z-10 mx-auto w-full max-w-[1440px] px-6 pb-24 md:px-12 md:pb-28">
        <motion.p
          data-testid="hero-eyebrow"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 1.7, ease: MOTION.ease }}
          className="mb-6 text-[11px] font-medium tracking-eyebrow text-cream/80"
        >
          {t("hero.eyebrow")}
        </motion.p>

        <h1
          data-testid="hero-title"
          className="font-display text-[16vw] leading-[0.92] tracking-tight text-cream sm:text-[13vw] lg:text-[9.5rem]"
        >
          <MaskedLine delay={1.9} className="font-medium">
            {t("hero.line1")}
          </MaskedLine>
          <MaskedLine delay={2.08} className="font-medium italic">
            {t("hero.line2")}
          </MaskedLine>
        </h1>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 2.45, ease: MOTION.ease }}
          className="mt-10 flex flex-wrap items-center gap-4"
        >
          <button
            data-testid="hero-explore-button"
            onClick={() => scrollToSection("coffee")}
            className="group inline-flex items-center gap-3 rounded-full bg-cream px-8 py-4 text-[11px] font-semibold tracking-label text-olive transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_40px_rgba(0,0,0,0.18)]"
          >
            {t("hero.explore")}
            <ArrowDown size={14} className="transition-transform duration-300 group-hover:translate-y-0.5" />
          </button>
          <Link
            data-testid="hero-loyalty-button"
            to={ROUTES.loyalty}
            className="group inline-flex items-center gap-3 rounded-full border border-cream/70 px-8 py-4 text-[11px] font-semibold tracking-label text-cream transition-all duration-300 hover:-translate-y-1 hover:bg-cream/10"
          >
            {t("hero.loyalty")}
            <ArrowUpRight
              size={14}
              className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </Link>
        </motion.div>
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 3.1, duration: 1 }}
        className="absolute bottom-8 right-6 z-10 hidden items-center gap-3 text-[10px] tracking-eyebrow text-cream/70 md:right-12 md:flex"
        aria-hidden="true"
      >
        {t("hero.scroll")}
        <motion.span
          animate={reduce ? {} : { y: [0, 6, 0] }}
          transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
        >
          <ArrowDown size={12} />
        </motion.span>
      </motion.div>
    </section>
  );
}
