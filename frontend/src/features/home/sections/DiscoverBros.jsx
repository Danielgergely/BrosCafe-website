import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import SectionLabel from "@/components/ui/SectionLabel";
import { MEDIA, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { useUi } from "@/state/UiStore";

/** Panel imagery and the product each one opens, in display order. */
const PANELS = [
  { image: MEDIA.image.coffeePoster, productId: "espresso" },
  { image: MEDIA.image.sweetsPoster, productId: "croissant" },
  { image: MEDIA.image.about, productId: null },
  { image: MEDIA.image.merchPoster, productId: "bros-hoodie" },
];

export default function DiscoverBros() {
  const { t } = useI18n();
  const { openProduct } = useUi();
  const reduce = useReducedMotion();
  const sectionRef = useRef(null);
  const rowRef = useRef(null);
  const [shift, setShift] = useState(0);

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });
  const x = useTransform(scrollYProgress, [0, 1], [0, -shift]);

  // How far the row must travel to bring its last panel into view.
  useEffect(() => {
    const measure = () => {
      if (rowRef.current) {
        setShift(Math.max(0, rowRef.current.scrollWidth - window.innerWidth));
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const copy = t("home.discover.panels");

  const panels = (
    <>
      {PANELS.map((panel, i) => (
        <button
          key={copy[i].label}
          data-testid={`discover-panel-${i}`}
          onClick={() => panel.productId && openProduct(panel.productId)}
          data-cursor={panel.productId ? "view" : undefined}
          className={`group relative h-[62vh] w-[80vw] shrink-0 overflow-hidden rounded-card text-left md:h-[70vh] md:w-[52vw] ${
            panel.productId ? "" : "cursor-default"
          }`}
        >
          <img
            src={panel.image}
            alt={copy[i].label}
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.04]"
          />
          <div className="absolute inset-0 bg-olive/25 transition-colors duration-500 group-hover:bg-olive/15" />
          <div className="absolute bottom-0 left-0 p-7 md:p-9">
            <p className="text-[10px] font-semibold tracking-eyebrow text-cream/80">
              {String(i + 1).padStart(2, "0")}
            </p>
            <p className="mt-1 font-display text-4xl font-medium text-cream md:text-6xl">
              {copy[i].label}
            </p>
            <p className="mt-2 text-sm italic text-cream/85">{copy[i].caption}</p>
          </div>
        </button>
      ))}

      <div className="flex h-[62vh] w-[80vw] shrink-0 flex-col items-start justify-center rounded-card bg-olive p-8 md:h-[70vh] md:w-[52vw] md:p-14">
        <p className="font-display text-4xl font-medium leading-tight text-cream md:text-6xl">
          {t("home.discover.end1")}
          <br />
          {t("home.discover.end2")}
          <span className="italic">.</span>
        </p>
        <Link
          data-testid="discover-loyalty-cta"
          to={ROUTES.loyalty}
          className="group mt-8 inline-flex items-center gap-3 rounded-full bg-cream px-8 py-4 text-[11px] font-semibold tracking-label text-olive transition-all duration-300 hover:-translate-y-1"
        >
          {t("home.discover.cta")}
          <ArrowUpRight
            size={14}
            className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </>
  );

  // Reduced motion: a plain horizontal scroller instead of scroll-driven motion.
  if (reduce) {
    return (
      <section id="discover" data-testid="discover-section" className="bg-white py-24">
        <div className="mx-auto max-w-[1440px] px-6 md:px-12">
          <SectionLabel section="discover" title={t("home.discover.label")} />
        </div>
        <div className="no-scrollbar flex gap-6 overflow-x-auto px-6 md:px-12">{panels}</div>
      </section>
    );
  }

  return (
    <section
      id="discover"
      ref={sectionRef}
      data-testid="discover-section"
      className="relative h-[340vh] bg-white"
    >
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden">
        <div className="mx-auto w-full max-w-[1440px] px-6 pb-8 md:px-12">
          <SectionLabel section="discover" title={t("home.discover.label")} />
          <h2 className="font-display text-4xl font-medium tracking-tight text-olive md:text-6xl">
            {t("home.discover.title")}
            <span className="italic">{t("home.discover.punct")}</span>
          </h2>
        </div>
        <motion.div ref={rowRef} style={{ x }} className="flex w-max gap-6 px-6 md:px-12">
          {panels}
        </motion.div>
        <div className="mx-auto mt-10 w-full max-w-[1440px] px-6 md:px-12">
          <div className="h-[3px] w-full max-w-xs rounded-full bg-olive/10">
            <motion.div
              style={{ scaleX: scrollYProgress }}
              className="h-full origin-left rounded-full bg-olive"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
