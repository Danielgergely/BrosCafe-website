import Reveal from "@/components/ui/Reveal";
import { HOME_SECTIONS } from "@/config/site";

/**
 * The numbered editorial label above each homepage section. The number is
 * derived from HOME_SECTIONS, so reordering sections renumbers them instead of
 * leaving hardcoded values wrong.
 */
export default function SectionLabel({ section, title, light = false }) {
  const index = HOME_SECTIONS.indexOf(section);
  const number = String(index >= 0 ? index + 1 : 0).padStart(2, "0");

  return (
    <Reveal>
      <p
        data-testid={`section-label-${section}`}
        className={`mb-6 flex items-center gap-4 text-[11px] font-medium tracking-eyebrow ${
          light ? "text-cream/70" : "text-olive/60"
        }`}
      >
        <span className="font-display text-base italic tracking-normal">{number}</span>
        <span className={`h-px w-10 ${light ? "bg-cream/40" : "bg-olive/30"}`} />
        {title}
      </p>
    </Reveal>
  );
}
