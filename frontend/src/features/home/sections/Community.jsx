import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";

import MaskedImage from "@/components/ui/MaskedImage";
import Reveal from "@/components/ui/Reveal";
import SectionLabel from "@/components/ui/SectionLabel";
import { MEDIA } from "@/config/site";
import { useI18n } from "@/i18n";
import { useUi } from "@/state/UiStore";

/** Asymmetric collage: image, grid span and reveal direction per tile. */
const SHOTS = [
  { image: MEDIA.image.interior, span: "col-span-2 row-span-2", variant: "left" },
  { image: MEDIA.video.hero.poster, span: "col-span-1 row-span-1", variant: "up" },
  { image: MEDIA.image.flatlay, span: "col-span-1 row-span-2", variant: "right" },
  { image: MEDIA.image.magazine, span: "col-span-1 row-span-1", variant: "up" },
  { image: MEDIA.video.moment.poster, span: "col-span-2 row-span-1", variant: "left" },
];

/** Alternating tiles drift in opposite directions as the section scrolls past. */
const DRIFT = 24;

function Shot({ shot, index, progress, reduce, alt, onOpen }) {
  const direction = index % 2 === 0 ? DRIFT : -DRIFT;
  const y = useTransform(progress, [0, 1], reduce ? [0, 0] : [direction, -direction]);

  return (
    <motion.div
      data-testid={`community-shot-${index}`}
      data-cursor="explore"
      style={{ y }}
      className={`group cursor-pointer ${shot.span} h-full`}
      onClick={onOpen}
    >
      <MaskedImage
        src={shot.image}
        alt={alt}
        variant={shot.variant}
        delay={index * 0.08}
        className="h-full w-full rounded-card"
        imgClassName="h-full min-h-[180px] w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.05]"
      />
    </motion.div>
  );
}

export default function Community() {
  const { t } = useI18n();
  const { openLightbox } = useUi();
  const reduce = useReducedMotion();
  const ref = useRef(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });

  const images = SHOTS.map((shot) => shot.image);
  const alts = t("home.community.alts");

  return (
    <section id="community" ref={ref} data-testid="community-section" className="relative bg-white">
      <div className="mx-auto max-w-[1440px] px-6 py-28 md:px-12 md:py-40">
        <SectionLabel section="community" title={t("home.community.label")} />
        <Reveal>
          <h2 className="font-display text-5xl font-medium leading-[1.02] tracking-tight text-olive md:text-7xl">
            {t("home.community.title1")}
            <br />
            {t("home.community.title2")}
            <span className="italic">{t("home.community.punct")}</span>
          </h2>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-6 max-w-md text-base leading-relaxed text-olive/75">
            {t("home.community.body")}
          </p>
        </Reveal>

        <div className="mt-16 grid auto-rows-[170px] grid-cols-2 gap-4 md:auto-rows-[210px] md:grid-cols-4 md:gap-6">
          {SHOTS.map((shot, i) => (
            <Shot
              key={shot.image}
              shot={shot}
              index={i}
              progress={scrollYProgress}
              reduce={reduce}
              alt={alts[i] ?? ""}
              onOpen={() => openLightbox(images, i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
