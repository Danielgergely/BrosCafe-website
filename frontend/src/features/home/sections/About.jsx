import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import MaskedImage from "@/components/ui/MaskedImage";
import Reveal from "@/components/ui/Reveal";
import SectionLabel from "@/components/ui/SectionLabel";
import { MEDIA, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { useUi } from "@/state/UiStore";

function StoryImage({ src, alt, caption, onOpen, className = "" }) {
  return (
    <figure className={className}>
      <MaskedImage
        src={src}
        alt={alt}
        variant="up"
        cursor="explore"
        onClick={onOpen}
        className="aspect-[4/5] w-full cursor-pointer rounded-card"
        imgClassName="h-full w-full object-cover transition-transform duration-700 ease-editorial hover:scale-[1.04]"
      />
      <figcaption className="mt-4 text-right text-[10px] tracking-label text-olive/50">
        {caption}
      </figcaption>
    </figure>
  );
}

export default function About() {
  const { t } = useI18n();
  const { openLightbox } = useUi();
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const imageY = useTransform(scrollYProgress, [0, 1], reduce ? [0, 0] : [50, -50]);

  const intro = t("home.about.intro");
  const chapters = t("home.about.chapters");
  const photos = [MEDIA.image.about, MEDIA.image.aboutWork];

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

          <div className="mt-8 max-w-md space-y-4">
            {intro.map((paragraph, i) => (
              <Reveal key={i} delay={0.1 + i * 0.06}>
                <p className="text-base leading-relaxed text-olive/80">{paragraph}</p>
              </Reveal>
            ))}
          </div>

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
          <motion.div style={{ y: imageY }} className="relative w-full max-w-md space-y-16 md:mt-20">
            <StoryImage
              src={photos[0]}
              alt={t("home.about.photoAlt")}
              caption={t("home.about.caption")}
              onOpen={() => openLightbox(photos, 0)}
            />
            {/* Inset so the pair reads as a spread rather than a stack. */}
            <StoryImage
              src={photos[1]}
              alt={t("home.about.photoAlt2")}
              caption={t("home.about.caption2")}
              onOpen={() => openLightbox(photos, 1)}
              className="md:ml-12 md:w-[85%]"
            />
          </motion.div>
        </div>
      </div>

      <div className="mx-auto max-w-[1440px] px-6 pb-28 md:px-12 md:pb-40">
        <div className="grid gap-12 border-t border-olive/15 pt-16 md:grid-cols-2 lg:gap-24">
          <Reveal>
            <div data-testid="about-feedback">
              <h3 className="font-display text-3xl font-medium tracking-tight text-olive md:text-4xl">
                {t("home.about.feedbackTitle")}
              </h3>
              <p className="mt-4 max-w-md text-base leading-relaxed text-olive/80">
                {t("home.about.feedbackBody")}
              </p>
              <Link
                data-testid="about-feedback-cta"
                to={ROUTES.help}
                className="group mt-6 inline-flex items-center gap-2 rounded-full border border-olive px-6 py-3 text-[11px] font-semibold tracking-wide text-olive transition-all duration-300 hover:-translate-y-0.5 hover:bg-olive hover:text-cream"
              >
                {t("home.about.feedbackCta")}
                <ArrowUpRight
                  size={14}
                  className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </Reveal>

          <Reveal delay={0.1}>
            <div data-testid="about-closing" className="md:text-right">
              <h3 className="font-display text-4xl font-medium leading-[1.05] tracking-tight text-olive md:text-5xl">
                {t("home.about.closing1")}
                <br />
                <span className="italic text-olive/70">{t("home.about.closing2")}</span>
              </h3>
              <p className="mt-4 text-base leading-relaxed text-olive/80 md:ml-auto md:max-w-md">
                {t("home.about.closingBody")}
              </p>
              <Link
                data-testid="about-visit-cta"
                to={ROUTES.contact}
                className="group mt-6 inline-flex items-center gap-2 rounded-full bg-olive px-6 py-3 text-[11px] font-semibold tracking-wide text-cream transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(102,115,74,0.25)]"
              >
                {t("home.about.visitCta")}
                <ArrowUpRight
                  size={14}
                  className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                />
              </Link>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
