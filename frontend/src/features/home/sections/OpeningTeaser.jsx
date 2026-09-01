import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import Reveal from "@/components/ui/Reveal";
import { ROUTES } from "@/config/site";
import { useCountdown } from "@/hooks/useCountdown";
import { useI18n } from "@/i18n";
import { useCustomer } from "@/state/CustomerAuth";

/** Homepage band: how long until opening, plus the visitor's pass status. */
export default function OpeningTeaser() {
  const { t } = useI18n();
  const { member } = useCustomer();
  // Minute resolution is enough for a homepage band; the /opening page ticks seconds.
  const { days, hours, minutes } = useCountdown(30000);

  const onTheList = Boolean(member) && member.opening_status && member.opening_status !== "none";
  const units = [
    { value: days, label: t("opening.days") },
    { value: String(hours).padStart(2, "0"), label: t("opening.hours") },
    { value: String(minutes).padStart(2, "0"), label: t("opening.minutes") },
  ];

  return (
    <section data-testid="opening-teaser" className="border-b border-olive/15 bg-cream">
      <Reveal>
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-6 px-6 py-10 md:px-12">
          <div>
            <p className="text-[11px] font-semibold tracking-eyebrow text-olive/60">
              {t("opening.teaserLabel")}
            </p>
            <p className="mt-2 font-display text-4xl font-medium tracking-tight text-olive md:text-5xl">
              {units.map((unit, i) => (
                <span key={unit.label}>
                  {i > 0 && " · "}
                  {unit.value} <span className="text-xl italic text-olive/60">{unit.label}</span>
                </span>
              ))}
            </p>
            <p className="mt-2 text-sm text-olive/70">
              {t("opening.dateLine")}
              {onTheList && (
                <span className="font-semibold text-olive"> — {t("opening.onTheList")}</span>
              )}
            </p>
          </div>
          <Link
            data-testid="opening-teaser-cta"
            to={ROUTES.opening}
            className="group inline-flex items-center gap-3 rounded-full border border-olive/40 px-7 py-3.5 text-[11px] font-semibold tracking-label text-olive transition-all duration-300 hover:-translate-y-0.5 hover:bg-olive hover:text-cream"
          >
            {t("opening.cta")}
            <ArrowUpRight
              size={14}
              className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}
