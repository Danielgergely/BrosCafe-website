import { useEffect, useRef, useState } from "react";
import { Coffee } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { useCustomer } from "@/state/CustomerAuth";

/** Lands the magic-link click, exchanges the token, then goes to the card. */
export default function VerifyMagicPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { verify } = useCustomer();
  const [params] = useSearchParams();
  const [error, setError] = useState("");
  const attempted = useRef(false);

  useEffect(() => {
    // Tokens are single-use, so never exchange the same one twice.
    if (attempted.current) return;
    attempted.current = true;

    const token = params.get("token");
    if (!token) {
      setError(t("auth.verifyFailed"));
      return;
    }
    verify(token)
      .then(() => navigate(`${ROUTES.loyalty}?welcome=1`, { replace: true }))
      .catch(() => setError(t("auth.verifyFailed")));
  }, [params, verify, navigate, t]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cream px-8 text-center">
      {error ? (
        <>
          <p className="font-display text-2xl text-ink">{error}</p>
          <button
            onClick={() => navigate(ROUTES.loyalty)}
            className="mt-6 h-12 rounded-card border border-olive bg-white px-6 font-semibold text-olive"
          >
            {t("loyalty.backToForm")}
          </button>
        </>
      ) : (
        <>
          <Coffee size={40} className="animate-pulse text-olive" />
          <p className="mt-4 font-display text-2xl text-ink">{t("auth.verifying")}</p>
        </>
      )}
    </div>
  );
}
