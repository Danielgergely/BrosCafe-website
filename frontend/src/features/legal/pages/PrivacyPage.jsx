import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { CONTACT, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { DENIED, GRANTED, readConsent, setConsent } from "@/lib/consent";

/**
 * The privacy statement, plus the one control that has to live somewhere
 * permanent: withdrawing analytics consent. A banner the customer can only
 * answer once is not a way to change your mind, and under GDPR consent has to
 * be as easy to withdraw as it was to give.
 */
export default function PrivacyPage() {
  const { t } = useI18n();
  const sections = t("privacy.sections");

  // Held in state so choosing here updates the buttons and the status line
  // immediately — a control that appears to do nothing reads as broken.
  const [consent, setConsentState] = useState(readConsent);

  useEffect(() => {
    const sync = () => setConsentState(readConsent());
    window.addEventListener("bros-consent-change", sync);
    return () => window.removeEventListener("bros-consent-change", sync);
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-5 pb-24 pt-10 sm:px-8">
      <Link to={ROUTES.home} className="text-sm font-medium text-olive hover:underline">
        ← {t("staff.backToSite")}
      </Link>

      <h1 className="mt-6 font-display text-4xl leading-tight text-ink">{t("privacy.title")}</h1>
      <p className="mt-2 text-sm text-muted">{t("privacy.updated")}</p>
      <p className="mt-6 text-[15px] leading-relaxed text-ink">{t("privacy.intro")}</p>

      {Array.isArray(sections) &&
        sections.map((section) => (
          <section key={section.h} className="mt-9">
            <h2 className="font-display text-2xl text-ink">{section.h}</h2>
            {section.p.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-[15px] leading-relaxed text-muted">
                {paragraph}
              </p>
            ))}
          </section>
        ))}

      <section className="mt-10 rounded-panel border border-line bg-white p-6 shadow-card">
        <h2 className="font-display text-2xl text-ink">{t("privacy.choiceTitle")}</h2>
        <p className="mt-2 text-sm text-muted">
          {t(
            consent === GRANTED
              ? "privacy.choiceGranted"
              : consent === DENIED
                ? "privacy.choiceDenied"
                : "privacy.choiceUnset",
          )}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            data-testid="privacy-allow"
            onClick={() => setConsent(GRANTED)}
            disabled={consent === GRANTED}
            className="h-11 rounded-card bg-olive px-5 text-sm font-semibold text-cream hover:bg-olive-dark disabled:opacity-40"
          >
            {t("privacy.allow")}
          </button>
          <button
            data-testid="privacy-withdraw"
            onClick={() => setConsent(DENIED)}
            disabled={consent === DENIED}
            className="h-11 rounded-card border border-line px-5 text-sm font-semibold text-ink hover:border-olive disabled:opacity-40"
          >
            {t("privacy.withdraw")}
          </button>
        </div>
      </section>

      <p className="mt-8 text-sm text-muted">
        {t("privacy.contactLine")}{" "}
        <a href={`mailto:${CONTACT.email}`} className="font-medium text-olive underline">
          {CONTACT.email}
        </a>
      </p>
    </div>
  );
}
