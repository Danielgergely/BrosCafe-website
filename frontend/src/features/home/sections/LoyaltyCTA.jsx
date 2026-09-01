import { motion, useMotionValue, useReducedMotion, useSpring } from "framer-motion";
import { ArrowUpRight, Coffee, Gift, QrCode } from "lucide-react";
import { Link } from "react-router-dom";

import Reveal from "@/components/ui/Reveal";
import SectionLabel from "@/components/ui/SectionLabel";
import Steam from "@/components/ui/Steam";
import { BRAND, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { useCustomer } from "@/state/CustomerAuth";

/** Maximum 3D tilt, in degrees. */
const TILT = 14;

function CardMockup() {
  const { t } = useI18n();
  const reduce = useReducedMotion();
  const rotateX = useMotionValue(0);
  const rotateY = useMotionValue(0);
  const springX = useSpring(rotateX, { stiffness: 120, damping: 16 });
  const springY = useSpring(rotateY, { stiffness: 120, damping: 16 });

  const onMouseMove = (event) => {
    if (reduce) return;
    const rect = event.currentTarget.getBoundingClientRect();
    rotateY.set(((event.clientX - rect.left) / rect.width - 0.5) * TILT);
    rotateX.set(-((event.clientY - rect.top) / rect.height - 0.5) * TILT);
  };

  const reset = () => {
    rotateX.set(0);
    rotateY.set(0);
  };

  return (
    <div style={{ perspective: 900 }} className="flex justify-center lg:justify-end">
      <motion.div
        data-testid="loyalty-card-visual"
        onMouseMove={onMouseMove}
        onMouseLeave={reset}
        style={reduce ? {} : { rotateX: springX, rotateY: springY, transformStyle: "preserve-3d" }}
        whileHover={reduce ? {} : { y: -6 }}
        className="relative w-full max-w-sm rounded-card bg-cream p-8 shadow-lifted transition-shadow duration-500 hover:shadow-[0_44px_90px_rgba(0,0,0,0.34)]"
      >
        <div className="pointer-events-none absolute inset-0 rounded-card bg-white/25 [mask-image:linear-gradient(135deg,white,transparent_55%)]" />

        <div className="flex items-start justify-between">
          <div>
            <p className="font-display text-lg font-semibold tracking-wide text-olive">
              {BRAND.name}
            </p>
            <p className="mt-1 text-[10px] tracking-eyebrow text-olive/60">
              {t("home.loyalty.cardClub")}
            </p>
          </div>
          {/* Easter egg: hovering the cup raises steam. */}
          <div className="group/cup relative flex h-8 w-8 items-end justify-center text-olive/70">
            <Steam className="absolute -top-2 left-1/2 -translate-x-1/2 opacity-0 transition-opacity duration-300 group-hover/cup:opacity-100" />
            <Coffee size={20} strokeWidth={1.5} />
          </div>
        </div>

        <div className="mt-10 flex items-end justify-between">
          <div>
            <p className="text-[10px] tracking-eyebrow text-olive/50">
              {t("home.loyalty.cardMember")}
            </p>
            <p className="mt-1 font-display text-2xl italic text-olive">
              {t("home.loyalty.cardName")}
            </p>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-card bg-olive">
            <QrCode size={30} className="text-cream" strokeWidth={1.5} />
          </div>
        </div>

        <div className="mt-8 flex items-center gap-2 border-t border-olive/15 pt-5 text-olive">
          {Array.from({ length: BRAND.stampsRequired }).map((_, i) => (
            <Coffee key={i} size={16} strokeWidth={1.5} />
          ))}
          <span className="mx-1 text-olive/40">→</span>
          <Gift size={16} strokeWidth={1.5} />
        </div>
      </motion.div>
    </div>
  );
}

export default function LoyaltyCTA() {
  const { t } = useI18n();
  const { member } = useCustomer();
  const required = member?.stamps_required ?? BRAND.stampsRequired;

  return (
    <section
      id="loyalty"
      data-testid="loyalty-section"
      className="grain relative overflow-hidden bg-olive"
    >
      <div className="mx-auto grid max-w-[1440px] items-center gap-16 px-6 py-28 md:px-12 md:py-40 lg:grid-cols-2 lg:gap-24">
        <div>
          <SectionLabel section="loyalty" title={t("home.loyalty.label")} light />
          <Reveal>
            <h2 className="font-display text-5xl font-medium leading-[1.02] tracking-tight text-cream md:text-7xl">
              {t(member ? "home.loyalty.memberTitle1" : "home.loyalty.title1")}
              <br />
              {t(member ? "home.loyalty.memberTitle2" : "home.loyalty.title2")}
              <span className="italic">{t("home.loyalty.punct")}</span>
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="mt-8 font-display text-3xl font-medium italic leading-snug text-cream/90 md:text-4xl">
              {member ? (
                <>
                  {member.stamps} / {required} — {t("home.loyalty.memberSub")}
                </>
              ) : (
                <>
                  {t("home.loyalty.sub1")}
                  <br />
                  {t("home.loyalty.sub2")}
                </>
              )}
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <p className="mt-6 max-w-sm text-sm leading-relaxed text-cream/70">
              {t("home.loyalty.body")}
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <Link
              data-testid="loyalty-cta-button"
              to={member ? ROUTES.loyalty : ROUTES.loyalty}
              className="group mt-10 inline-flex items-center gap-3 rounded-full bg-cream px-9 py-4 text-[11px] font-semibold tracking-label text-olive transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_18px_44px_rgba(0,0,0,0.3)]"
            >
              {t(member ? "home.loyalty.memberCta" : "home.loyalty.cta")}
              <ArrowUpRight
                size={14}
                className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <CardMockup />
        </Reveal>
      </div>
    </section>
  );
}
