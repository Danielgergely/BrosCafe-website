import { useState } from "react";
import { Link } from "react-router-dom";
import { Mail, Send } from "lucide-react";
import { toast } from "sonner";

import { CONTACT, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { api, errorMessage } from "@/lib/api";

const EMPTY = { name: "", email: "", message: "", website: "" };

/**
 * Where customers write to us. This is the support URL given to Google for the
 * Wallet review, so it has to answer for itself without a customer having to
 * hunt for an address.
 */
export default function HelpPage() {
  const { t, lang } = useI18n();
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      await api.post("/contact", form, { headers: { "X-Lang": lang } });
      setSent(true);
      setForm(EMPTY);
      window.scrollTo({ top: 0 });
    } catch (error) {
      // The API's own detail strings are English; a Hungarian visitor should
      // not be told off in another language, so the cases we expect are
      // translated here and the raw detail is only a last resort.
      const status = error?.response?.status;
      if (status === 429) toast.error(t("help.tooMany"));
      else if (status === 502) toast.error(t("help.notSent"));
      else toast.error(errorMessage(error, t("common.somethingWrong")));
    } finally {
      setBusy(false);
    }
  };

  const field =
    "mt-1 w-full rounded-card border border-line bg-white px-4 py-3 text-ink outline-none focus:border-olive focus:ring-2 focus:ring-olive/30";
  const label = "text-xs font-semibold uppercase tracking-wide text-muted";

  if (sent) {
    return (
      <div className="mx-auto max-w-xl px-5 pb-24 pt-16 text-center sm:px-8">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-olive/10 text-olive">
          <Mail size={30} />
        </span>
        <h1 className="mt-6 font-display text-3xl text-ink">{t("help.sentTitle")}</h1>
        <p data-testid="help-sent" className="mt-3 text-sm leading-relaxed text-muted">
          {t("help.sentBody")}
        </p>
        <Link
          to={ROUTES.home}
          className="mt-8 inline-block text-sm font-medium text-olive hover:underline"
        >
          ← {t("staff.backToSite")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-5 pb-24 pt-10 sm:px-8">
      <Link to={ROUTES.home} className="text-sm font-medium text-olive hover:underline">
        ← {t("staff.backToSite")}
      </Link>

      <h1 className="mt-6 font-display text-4xl leading-tight text-ink">{t("help.title")}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">{t("help.intro")}</p>

      <form onSubmit={submit} className="mt-8 space-y-4" data-testid="help-form">
        <label className="block">
          <span className={label}>{t("auth.firstNameLabel")}</span>
          <input
            data-testid="help-name"
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
            maxLength={80}
            autoComplete="name"
            required
            className={field}
          />
        </label>

        <label className="block">
          <span className={label}>{t("auth.emailLabel")}</span>
          <input
            data-testid="help-email"
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            autoComplete="email"
            required
            className={field}
          />
        </label>

        <label className="block">
          <span className={label}>{t("help.messageLabel")}</span>
          <textarea
            data-testid="help-message"
            value={form.message}
            onChange={(event) => setForm({ ...form, message: event.target.value })}
            rows={7}
            minLength={5}
            maxLength={4000}
            required
            className={`${field} leading-relaxed`}
          />
        </label>

        {/* Hidden from people, irresistible to bots. Not display:none — some
            bots skip that — but off-screen and out of the tab order. */}
        <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
          <label>
            Website
            <input
              tabIndex={-1}
              autoComplete="off"
              value={form.website}
              onChange={(event) => setForm({ ...form, website: event.target.value })}
            />
          </label>
        </div>

        <button
          type="submit"
          data-testid="help-submit"
          disabled={busy}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-card bg-olive text-base font-semibold text-cream transition-colors hover:bg-olive-dark disabled:opacity-60"
        >
          <Send size={18} /> {busy ? t("help.sending") : t("help.send")}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        {t("help.orEmail")}{" "}
        <a href={`mailto:${CONTACT.email}`} className="font-medium text-olive underline">
          {CONTACT.email}
        </a>
      </p>
    </div>
  );
}
