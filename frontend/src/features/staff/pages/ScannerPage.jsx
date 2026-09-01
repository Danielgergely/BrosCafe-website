import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { ArrowLeft, Camera, Gift, Keyboard, LogOut, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

import BrosLogo from "@/components/layout/BrosLogo";
import LanguageToggle from "@/components/layout/LanguageToggle";
import LoyaltyProgress from "@/components/loyalty/LoyaltyProgress";
import { ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { api, errorMessage } from "@/lib/api";
import { useStaff } from "@/state/StaffAuth";

const READER_ID = "bros-qr-reader";
/** The reader div must be in the DOM before Html5Qrcode can attach to it. */
const MOUNT_DELAY_MS = 150;

export default function ScannerPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user, signOut } = useStaff();
  const scannerRef = useRef(null);

  const [scanning, setScanning] = useState(false);
  const [member, setMember] = useState(null);
  const [busy, setBusy] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [revealedOffer, setRevealedOffer] = useState(null);

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.stop();
        await scannerRef.current.clear();
      } catch {
        /* already stopped */
      }
      scannerRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => () => void stopScanner(), [stopScanner]);

  const lookUp = useCallback(
    async (code) => {
      try {
        const { data } = await api.get(`/scan/${code.trim()}`);
        setMember(data);
        setRevealedOffer(null);
      } catch (error) {
        toast.error(errorMessage(error, t("common.somethingWrong")));
      }
    },
    [t],
  );

  const startScanner = async () => {
    setMember(null);
    setScanning(true);
    setTimeout(async () => {
      try {
        const reader = new Html5Qrcode(READER_ID);
        scannerRef.current = reader;
        await reader.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: { width: 230, height: 230 } },
          async (decoded) => {
            await stopScanner();
            lookUp(decoded);
          },
          () => {},
        );
      } catch {
        toast.error(t("staff.cameraFailed"));
        setScanning(false);
      }
    }, MOUNT_DELAY_MS);
  };

  /** Every counter action is the same shape: POST, replace the member, toast. */
  const action = (path, successKey, transform) => async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/scan/${member.code}/${path}`);
      setMember((current) => (transform ? transform(current, data) : data));
      toast.success(t(typeof successKey === "function" ? successKey(data) : successKey));
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    } finally {
      setBusy(false);
    }
  };

  const addCoffee = action("add-coffee", (data) =>
    data.reward_ready ? "staff.rewardUnlocked" : "staff.coffeeAdded",
  );
  const redeemReward = action("redeem", "staff.freeRedeemed");
  const correctMistake = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/scan/${member.code}/adjust`, { delta: -1 });
      setMember(data);
      toast.success(t("staff.corrected"));
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    } finally {
      setBusy(false);
    }
  };

  const revealOpening = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/scan/${member.code}/opening/reveal`);
      setRevealedOffer(data.offer);
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    } finally {
      setBusy(false);
    }
  };

  const redeemOpening = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/scan/${member.code}/opening/redeem`);
      setMember((current) => ({ ...current, opening_status: "redeemed" }));
      setRevealedOffer(data.offer);
      toast.success(t("staff.openingRedeemedToast"));
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    } finally {
      setBusy(false);
    }
  };

  const primaryButton =
    "flex h-14 w-full items-center justify-center gap-2 rounded-card bg-olive font-semibold text-cream transition-colors hover:bg-olive-dark disabled:opacity-60";

  return (
    <div className="min-h-screen bg-ink">
      <div className="mx-auto max-w-md px-6 pb-16">
        <header className="flex items-center justify-between py-6">
          <BrosLogo light />
          <div className="flex items-center gap-4">
            <LanguageToggle light />
            {user?.role === "admin" && (
              <button
                onClick={() => navigate(ROUTES.admin)}
                className="text-xs text-cream/70 transition-colors hover:text-cream"
              >
                {t("staff.admin")}
              </button>
            )}
            <button
              data-testid="staff-logout-btn"
              onClick={signOut}
              aria-label={t("staff.logout")}
              className="text-cream/70 transition-colors hover:text-cream"
            >
              <LogOut size={20} strokeWidth={1.5} />
            </button>
          </div>
        </header>

        <h1 className="font-display text-3xl text-cream">{t("staff.scanTitle")}</h1>
        <p className="mt-1 text-sm text-cream/60">{t("staff.scanSub")}</p>

        {!member && (
          <div className="mt-6">
            <div className="relative aspect-square overflow-hidden rounded-panel border border-white/10 bg-black">
              {scanning ? (
                <div
                  id={READER_ID}
                  className="h-full w-full [&_video]:h-full [&_video]:w-full [&_video]:object-cover"
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center text-cream/50">
                  <Camera size={54} strokeWidth={1.2} />
                  <p className="mt-3 text-sm">{t("staff.cameraOff")}</p>
                </div>
              )}
              {scanning && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                  <div className="h-56 w-56 rounded-card border-2 border-olive/80" />
                </div>
              )}
            </div>

            {scanning ? (
              <button data-testid="stop-scan-btn" onClick={stopScanner}
                className="mt-6 h-14 w-full rounded-card border border-white/20 font-semibold text-cream">
                {t("staff.stop")}
              </button>
            ) : (
              <button data-testid="start-scan-btn" onClick={startScanner} className={`mt-6 ${primaryButton}`}>
                <Camera size={20} /> {t("staff.startScanning")}
              </button>
            )}

            <div className="mt-5 flex items-center gap-2 rounded-card bg-white/5 p-2">
              <Keyboard size={20} className="ml-2 text-cream/50" />
              <input
                data-testid="manual-code-input"
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder={t("staff.manualPlaceholder")}
                className="h-11 flex-1 bg-transparent px-2 text-cream outline-none placeholder:text-cream/40"
              />
              <button
                data-testid="manual-lookup-btn"
                onClick={() => manualCode.trim() && lookUp(manualCode)}
                className="h-11 rounded-card bg-olive px-4 text-sm font-semibold text-cream"
              >
                {t("staff.find")}
              </button>
            </div>
          </div>
        )}

        {member && (
          <div className="mt-6 animate-fade-up">
            <div className="rounded-panel bg-white p-7 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-label text-muted">
                {t("staff.customer")}
              </p>
              <h2 data-testid="scanned-member-name" className="mt-1 font-display text-3xl text-ink">
                {member.name}
              </h2>
              <p data-testid="scanned-member-progress" className="mt-1 text-sm text-muted">
                {member.stamps} / {member.stamps_required} {t("staff.coffees")}
              </p>
              <div className="mt-6">
                <LoyaltyProgress stamps={member.stamps} required={member.stamps_required} />
              </div>

              {member.reward_ready ? (
                <>
                  <div className="mt-6 rounded-card bg-olive/10 px-4 py-3">
                    <p className="flex items-center justify-center gap-2 font-semibold text-olive">
                      <Gift size={18} /> {t("staff.freeCoffeeReady")}
                    </p>
                  </div>
                  <button data-testid="redeem-btn" onClick={redeemReward} disabled={busy}
                    className={`mt-4 ${primaryButton}`}>
                    <Gift size={20} /> {t("staff.redeemFree")}
                  </button>
                </>
              ) : (
                <button data-testid="add-coffee-btn" onClick={addCoffee} disabled={busy}
                  className={`mt-6 h-16 text-lg ${primaryButton} active:scale-[0.99]`}>
                  <Plus size={24} strokeWidth={2.5} /> {t("staff.addCoffee")}
                </button>
              )}

              {member.stamps > 0 && !member.reward_ready && (
                <button data-testid="adjust-btn" onClick={correctMistake} disabled={busy}
                  className="mt-3 text-xs font-medium text-muted underline-offset-2 hover:text-olive hover:underline disabled:opacity-60">
                  {t("staff.correctMistake")}
                </button>
              )}
            </div>

            <div data-testid="opening-panel" className="mt-4 rounded-panel bg-white p-6 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-label text-olive">
                {t("staff.openingPanel")}
              </p>
              {member.opening_status === "redeemed" && !revealedOffer ? (
                <p className="mt-3 font-semibold text-olive">✓ {t("staff.alreadyRedeemed")}</p>
              ) : !revealedOffer ? (
                <button data-testid="reveal-opening-btn" onClick={revealOpening} disabled={busy}
                  className={`mt-4 ${primaryButton}`}>
                  {t("staff.revealOpening")}
                </button>
              ) : (
                <>
                  <p className="mt-2 font-display text-2xl text-ink">{t("staff.unlocked")}</p>
                  <ul className="mt-3 space-y-1 text-ink">
                    {revealedOffer.map((item) => (
                      <li key={item} className="text-lg">{item}</li>
                    ))}
                  </ul>
                  {member.opening_status === "redeemed" ? (
                    <p className="mt-4 font-semibold text-olive">✓ {t("staff.openingRedeemed")}</p>
                  ) : (
                    <button data-testid="redeem-opening-btn" onClick={redeemOpening} disabled={busy}
                      className={`mt-4 ${primaryButton}`}>
                      {t("staff.redeemOffer")}
                    </button>
                  )}
                </>
              )}
            </div>

            <button
              data-testid="scan-next-btn"
              onClick={() => {
                setMember(null);
                setRevealedOffer(null);
              }}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-card border border-white/20 font-semibold text-cream"
            >
              <ArrowLeft size={18} /> {t("staff.scanNext")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
