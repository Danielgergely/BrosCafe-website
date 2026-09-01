import { useEffect, useState } from "react";
import { ArrowUpRight, Clock, Instagram, MapPin } from "lucide-react";

import PageShell from "@/components/layout/PageShell";
import { CONTACT } from "@/config/site";
import { useI18n } from "@/i18n";
import { api, track } from "@/lib/api";

function InfoCard({ icon: Icon, title, children }) {
  return (
    <div className="rounded-panel border border-line bg-white p-6 shadow-card">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-full bg-olive/10 text-olive">
          <Icon size={20} />
        </span>
        <div className="flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-olive">{title}</p>
          <div className="mt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function ContactPage() {
  const { t } = useI18n();
  const [cafe, setCafe] = useState(null);

  useEffect(() => {
    track("page_view", { src: "contact" });
    let active = true;
    api
      .get("/cafe")
      .then(({ data }) => active && setCafe(data))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Live café details win; config values are the fallback.
  const address = cafe?.address || CONTACT.address;
  const instagram = cafe?.instagram || `@${CONTACT.instagram}`;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const instagramUrl = `https://instagram.com/${instagram.replace(/^@/, "")}`;

  return (
    <PageShell>
      <h1 className="font-display text-4xl text-ink">{t("contact.title")}</h1>

      <div className="mt-8 space-y-4" data-testid="contact-info">
        <InfoCard icon={MapPin} title={t("contact.addressTitle")}>
          <p className="text-ink">{address}</p>
          <a
            data-testid="contact-directions"
            href={mapsUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-olive hover:underline"
          >
            {t("contact.findUs")} <ArrowUpRight size={14} />
          </a>
        </InfoCard>

        <InfoCard icon={Clock} title={t("contact.hoursTitle")}>
          <p className="text-ink">{cafe?.hours_weekdays}</p>
          <p className="text-ink">{cafe?.hours_weekend}</p>
        </InfoCard>

        <a
          data-testid="contact-instagram"
          href={instagramUrl}
          target="_blank"
          rel="noreferrer"
          className="block transition-transform duration-300 hover:-translate-y-0.5"
        >
          <InfoCard icon={Instagram} title={t("contact.follow")}>
            <p className="text-ink">{instagram}</p>
          </InfoCard>
        </a>
      </div>
    </PageShell>
  );
}
