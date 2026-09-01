import { useEffect, useState } from "react";
import { Coffee } from "lucide-react";
import { useNavigate } from "react-router-dom";

import LanguageToggle from "@/components/layout/LanguageToggle";
import { ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { errorMessage } from "@/lib/api";
import { useStaff } from "@/state/StaffAuth";
import logo from "@/assets/logo-full-olive.png";

export default function StaffLoginPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { signIn, user } = useStaff();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const landingFor = (role) => (role === "admin" ? ROUTES.admin : ROUTES.staff);

  useEffect(() => {
    if (user) navigate(landingFor(user.role), { replace: true });
  }, [user, navigate]);

  const submit = async (event) => {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      const signedIn = await signIn(email, password);
      navigate(landingFor(signedIn.role), { replace: true });
    } catch (err) {
      setError(errorMessage(err, t("staff.loginFailed")));
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    "h-12 w-full rounded-card border border-line bg-white px-4 text-ink outline-none focus:border-olive focus:ring-2 focus:ring-olive/30";

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-4">
          <img src={logo} alt="Bros Cafe" className="h-32 w-auto" />
          <LanguageToggle />
        </div>

        <div className="rounded-panel border border-line bg-white p-8 shadow-panel">
          <h1 className="font-display text-2xl text-ink">{t("staff.loginTitle")}</h1>
          <p className="mt-1 text-sm text-muted">{t("staff.loginSub")}</p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <input
              data-testid="login-email-input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder={t("staff.email")}
              autoComplete="username"
              required
              className={inputClass}
            />
            <input
              data-testid="login-password-input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("staff.password")}
              autoComplete="current-password"
              required
              className={inputClass}
            />
            {error && (
              <p data-testid="login-error" className="text-sm text-red-600">
                {error}
              </p>
            )}
            <button
              data-testid="login-submit-btn"
              type="submit"
              disabled={busy}
              className="flex h-14 w-full items-center justify-center gap-2 rounded-card bg-olive font-semibold text-cream transition-colors hover:bg-olive-dark disabled:opacity-60"
            >
              <Coffee size={18} /> {busy ? t("staff.signingIn") : t("staff.signIn")}
            </button>
          </form>
        </div>

        <button
          onClick={() => navigate(ROUTES.home)}
          className="mt-6 w-full text-center text-xs text-muted transition-colors hover:text-olive"
        >
          ← {t("staff.backToSite")}
        </button>
        <p className="mt-4 rounded-card border border-line bg-white px-4 py-3 text-center text-xs leading-relaxed text-muted">
          {t("staff.customerHint")}
        </p>
      </div>
    </div>
  );
}
