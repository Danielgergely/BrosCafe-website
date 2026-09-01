import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import { MEDIA } from "@/config/site";
import { useI18n } from "@/i18n";

/** Scroll distance the sticky expansion plays over. */
const SCROLL_HEIGHT = "240vh";
/** Fraction of scroll after which the video fills the viewport. */
const EXPANDED_AT = 0.55;

export default function BrosMoment() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });

  const width = useTransform(scrollYProgress, [0, EXPANDED_AT], ["52vw", "100vw"]);
  const height = useTransform(scrollYProgress, [0, EXPANDED_AT], ["46vh", "100vh"]);
  const radius = useTransform(scrollYProgress, [0, EXPANDED_AT], [28, 0]);
  const introOpacity = useTransform(scrollYProgress, [0.05, 0.35], [1, 0]);
  const introY = useTransform(scrollYProgress, [0.05, 0.35], [0, -40]);
  const captionOpacity = useTransform(scrollYProgress, [0.6, 0.8], [0, 1]);
  const captionY = useTransform(scrollYProgress, [0.6, 0.8], [30, 0]);

  const video = (
    <video
      className="h-full w-full object-cover"
      src={MEDIA.video.moment.src}
      poster={MEDIA.video.moment.poster}
      autoPlay
      muted
      loop
      playsInline
    />
  );

  const caption = (
    <>
      <p className="max-w-4xl font-display text-4xl font-medium italic leading-tight text-cream md:text-6xl">
        {t("home.moment.caption")}
      </p>
      <p className="mt-6 text-[11px] font-medium tracking-eyebrow text-cream/85">
        {t("home.moment.sub")}
      </p>
    </>
  );

  // Reduced motion: a plain hero-style band, no sticky scroll choreography.
  if (reduce) {
    return (
      <section id="moment" data-testid="bros-moment-section" className="relative">
        <div className="mx-auto max-w-[1440px] px-6 py-24 text-center md:px-12">
          <h2 className="font-display text-5xl font-medium text-olive md:text-7xl">
            {t("home.moment.intro")}
          </h2>
        </div>
        <div className="relative h-[70vh]">
          {video}
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-olive/40 px-6 text-center">
            {caption}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="moment"
      ref={ref}
      data-testid="bros-moment-section"
      className="relative"
      style={{ height: SCROLL_HEIGHT }}
    >
      <div className="sticky top-0 flex h-screen flex-col items-center justify-center overflow-hidden">
        <motion.h2
          style={{ opacity: introOpacity, y: introY }}
          className="pointer-events-none absolute top-[16vh] z-10 px-6 text-center font-display text-[13vw] font-medium leading-none text-olive md:text-8xl"
        >
          {t("home.moment.intro")}
        </motion.h2>

        <motion.div
          data-testid="bros-moment-video"
          style={{ width, height, borderRadius: radius }}
          className="relative overflow-hidden"
        >
          {video}
          <div className="absolute inset-0 bg-olive/35" />
          <motion.div
            style={{ opacity: captionOpacity, y: captionY }}
            className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center"
          >
            {caption}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
