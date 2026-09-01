import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import MaskedImage from "@/components/ui/MaskedImage";
import Reveal from "@/components/ui/Reveal";
import SectionLabel from "@/components/ui/SectionLabel";
import { MEDIA } from "@/config/site";
import { useI18n } from "@/i18n";
import { useUi } from "@/state/UiStore";

export default function About() {
  const { t } = useI18n();
  const { openLightbox } = useUi();
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const imageY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [50, -50]);

  const chapters = t("home.about.chapters");

  return (
    <section id="about" ref={ref} data-testid="about-section" className="relative bg-white">
      <div className="mx-auto grid max-w-[1440px] gap-16 px-6 py-28 md:grid-cols-2 md:px-12 md:py-40 lg:gap-24">
        <div>
          <SectionLabel section="about" title={t("home.about.label")} />
          <Reveal>
            <h2 className="font-display text-5xl font-medium leading-[1.02] tracking-tight text-olive md:text-7xl">
              {t("home.about.title1")}
              <br />
              {t("home.about.title2")}
              <span className="italic">{t("home.about.punct")}</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-8 max-w-md text-base leading-relaxed text-olive/80">
              {t("home.about.body")}
            </p>
          </Reveal>

          <div className="mt-14 space-y-10">
            {chapters.map((chapter, i) => (
              <Reveal key={chapter.n} delay={i * 0.08}>
                <div
                  data-testid={`about-chapter-${i + 1}`}
                  className="flex gap-6 border-t border-olive/15 pt-6"
                >
                  <span className="w-10 shrink-0 font-display text-2xl italic text-olive/50">
                    {chapter.n}
                  </span>
                  <div>
                    <h3 className="font-display text-2xl font-medium text-olive">{chapter.title}</h3>
                    <p className="mt-2 max-w-sm text-sm leading-relaxed text-olive/70">
                      {chapter.text}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <div className="relative flex items-start justify-center md:justify-end">
          <motion.div style={{ y: imageY }} className="relative w-full max-w-md md:mt-20">
            <MaskedImage
              src={MEDIA.image.about}
              alt={t("home.about.photoAlt")}
              variant="up"
              cursor="explore"
              onClick={() => openLightbox([MEDIA.image.about], 0)}
              className="aspect-[4/5] w-full cursor-pointer rounded-card"
              imgClassName="h-full w-full object-cover transition-transform duration-700 ease-editorial hover:scale-[1.04]"
            />
            <p className="mt-4 text-right text-[10px] tracking-label text-olive/50">
              {t("home.about.caption")}
            </p>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
