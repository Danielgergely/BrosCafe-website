import { ArrowUpRight, Instagram } from "lucide-react";
import { Link } from "react-router-dom";

import { BRAND, CONTACT, FOOTER_LINKS, ROUTES } from "@/config/site";
import { useSectionNav } from "@/hooks/useSectionNav";
import { useI18n } from "@/i18n";

export default function Footer() {
  const { t } = useI18n();
  const go = useSectionNav();

  return (
    <footer data-testid="footer" className="bg-olive text-cream">
      <div className="mx-auto max-w-[1440px] px-6 pb-10 pt-20 md:px-12 md:pt-28">
        <div className="flex flex-col justify-between gap-12 border-b border-cream/15 pb-16 md:flex-row md:items-end">
          <div>
            <p className="font-display text-4xl font-semibold tracking-[0.1em] md:text-6xl">
              {BRAND.name}
            </p>
            <p className="mt-3 font-display text-xl italic text-cream/75">{t("footer.tagline")}</p>
          </div>
          <Link
            data-testid="footer-loyalty-cta"
            to={ROUTES.loyalty}
            className="group inline-flex w-fit items-center gap-3 rounded-full border border-cream/50 px-8 py-4 text-[11px] font-semibold tracking-label transition-all duration-300 hover:-translate-y-1 hover:bg-cream hover:text-olive"
          >
            {t("footer.cta")}
            <ArrowUpRight
              size={14}
              className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </Link>
        </div>

        <div className="flex flex-col justify-between gap-10 py-12 md:flex-row">
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-8 gap-y-3">
              {FOOTER_LINKS.map((link) => (
                <li key={link.key}>
                  <button
                    data-testid={`footer-link-${link.key}`}
                    onClick={() => go(link)}
                    className="link-underline text-xs font-medium tracking-wide text-cream/85"
                  >
                    {t(`nav.${link.key}`)}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex items-center gap-6">
            {/* Points at the contact form rather than opening a mail client:
                a mailto assumes the visitor has one configured, and on a phone
                it often opens nothing at all. */}
            <Link
              data-testid="footer-contact-link"
              to={ROUTES.help}
              className="link-underline text-xs font-medium tracking-wide text-cream/85"
            >
              {t("footer.contact")}
            </Link>
            <a
              data-testid="footer-instagram-link"
              href={CONTACT.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("footer.instagramLabel")}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-cream/40 transition-all duration-300 hover:-translate-y-1 hover:bg-cream hover:text-olive"
            >
              <Instagram size={16} strokeWidth={1.5} />
            </a>
          </div>
        </div>

        <div className="flex flex-col justify-between gap-3 border-t border-cream/15 pt-8 text-[10px] tracking-label text-cream/50 md:flex-row">
          <p>{t("footer.copy")}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {/* Quiet by design: it is for the three of us, not for guests. */}
            <Link
              data-testid="footer-staff-link"
              to={ROUTES.login}
              className="link-underline transition-colors hover:text-cream"
            >
              {t("footer.staff")}
            </Link>
            <p>{t("footer.made")}</p>
          </div>
        </div>
      </div>
    </footer>
  );
}
