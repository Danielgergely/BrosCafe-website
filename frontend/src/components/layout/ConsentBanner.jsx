import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { DENIED, GRANTED, readConsent, setConsent } from "@/lib/consent";

/**
 * Asks once, on first visit, about the funnel analytics.
 *
 * Both buttons carry the same weight — no pre-ticked boxes, no styling that
 * nudges towards "accept". Declining is a real choice here: it stops the
 * tracking calls and clears the session identifier, rather than only recording
 * a preference.
 */
export default function ConsentBanner() {
  const { t } = useI18n();
  const [asked, setAsked] = useState(() => readConsent() !== null);

  useEffect(() => {
    const sync = () => setAsked(readConsent() !== null);
    window.addEventListener("bros-consent-change", sync);
    return () => window.removeEventListener("bros-consent-change", sync);
  }, []);

  if (asked) return null;

  const choose = (value) => {
    setConsent(value);
    setAsked(true);
  };

  return (
    <div
      data-testid="consent-banner"
      role="dialog"
      aria-live="polite"
      aria-label={t("consent.title")}
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-line bg-white/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="text-sm text-ink">
          <p className="font-semibold">{t("consent.title")}</p>
          <p className="mt-1 text-muted">
            {t("consent.body")}{" "}
            <Link to={ROUTES.privacy} className="font-medium text-olive underline">
              {t("consent.readMore")}
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-3">
          <button
            data-testid="consent-decline"
            onClick={() => choose(DENIED)}
            className="h-11 flex-1 rounded-card border border-line px-5 text-sm font-semibold text-ink transition-colors hover:border-olive sm:flex-none"
          >
            {t("consent.decline")}
          </button>
          <button
            data-testid="consent-accept"
            onClick={() => choose(GRANTED)}
            className="h-11 flex-1 rounded-card bg-olive px-5 text-sm font-semibold text-cream transition-colors hover:bg-olive-dark sm:flex-none"
          >
            {t("consent.accept")}
          </button>
        </div>
      </div>
    </div>
  );
}
