import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { API_BASE } from "@/config/site";
import { useI18n } from "@/i18n";
import { api, track } from "@/lib/api";

/**
 * Adding a loyalty pass to Apple or Google Wallet.
 *
 * The two platforms work in opposite directions, which is why this is a hook
 * rather than two links:
 *
 *   Apple  — the endpoint returns a signed .pkpass file, so navigating to it
 *            is the whole interaction.
 *   Google — the pass lives on Google's servers. We ask our API for a signed
 *            "save" link first, then send the customer to Google.
 *
 * Whether each is available comes from GET /api/cafe, so a wallet that isn't
 * configured shows an honest message instead of a broken button.
 */
export function useWallet(memberCode) {
  const { t, lang } = useI18n();
  const [available, setAvailable] = useState({ apple: false, google: false });
  const [busy, setBusy] = useState(null); // "apple" | "google" | null

  useEffect(() => {
    let active = true;
    api
      .get("/cafe")
      .then(({ data }) => {
        if (!active) return;
        setAvailable({
          apple: Boolean(data.apple_wallet_configured),
          google: Boolean(data.google_wallet_configured),
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const addToApple = useCallback(() => {
    if (!available.apple) {
      toast(t("card.walletUnavailable"));
      return;
    }
    // Feeds the "Wallet Card Added" stage of the admin funnel.
    track("wallet_added", { code: memberCode, src: "apple" });
    window.location.href = `${API_BASE}/members/${memberCode}/wallet/apple?lang=${lang}`;
  }, [available.apple, memberCode, lang, t]);

  const addToGoogle = useCallback(async () => {
    if (!available.google) {
      toast(t("card.googleSoon"));
      return;
    }
    setBusy("google");
    try {
      const { data } = await api.get(`/members/${memberCode}/wallet/google`, {
        params: { lang },
      });
      if (data?.save_url) {
        track("wallet_added", { code: memberCode, src: "google" });
        window.location.href = data.save_url;
      } else {
        toast(t("card.googleSoon"));
      }
    } catch {
      toast.error(t("card.walletUnavailable"));
    } finally {
      setBusy(null);
    }
  }, [available.google, memberCode, lang, t]);

  return { available, busy, addToApple, addToGoogle };
}
