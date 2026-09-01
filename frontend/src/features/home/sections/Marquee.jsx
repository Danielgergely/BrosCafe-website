import { useI18n } from "@/i18n";

/** Slow editorial ticker. Two copies of the phrase list make the loop seamless. */
export default function Marquee() {
  const { t } = useI18n();
  const phrases = t("marquee");

  return (
    <div
      data-testid="marquee"
      className="overflow-hidden border-y border-olive/15 bg-cream py-6"
      aria-hidden="true"
    >
      <div className="flex w-max items-center gap-10 whitespace-nowrap animate-marquee">
        {[0, 1].map((copy) => (
          <div key={copy} className="flex items-center gap-10">
            {phrases.map((phrase, i) => (
              <span key={`${copy}-${i}`} className="flex items-center gap-10">
                <span className="font-display text-2xl italic text-olive md:text-3xl">{phrase}</span>
                <span className="h-1.5 w-1.5 rounded-full bg-olive/40" />
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
