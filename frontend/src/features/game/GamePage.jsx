import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Coffee, Trophy, X } from "lucide-react";
import { toast } from "sonner";

import RunnerGame from "@/features/game/RunnerGame";
import { ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { api, customerAuth, errorMessage } from "@/lib/api";
import { useCustomer } from "@/state/CustomerAuth";

const PERIODS = ["week", "month", "year", "all"];

export default function GamePage() {
  const { t } = useI18n();
  const { member, loading } = useCustomer();
  const [run, setRun] = useState(null);
  const [period, setPeriod] = useState("week");
  const [board, setBoard] = useState(null);
  const [best, setBest] = useState(null);
  const [busy, setBusy] = useState(false);

  const loadBoard = useCallback(async (which) => {
    try {
      const { data } = await api.get(`/game/leaderboard?period=${which}`);
      setBoard(data);
    } catch {
      setBoard([]);
    }
  }, []);

  useEffect(() => {
    loadBoard(period);
  }, [period, loadBoard]);

  useEffect(() => {
    if (!member) return;
    api.get("/game/me", customerAuth()).then(({ data }) => setBest(data)).catch(() => {});
  }, [member]);

  const start = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/game/start", {}, customerAuth());
      setRun(data);
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    } finally {
      setBusy(false);
    }
  };

  /**
   * The run is over. We send the ticks the player jumped on and nothing else —
   * the server replays them and tells us what it was worth. The number shown
   * during play is only ever a preview.
   */
  const finish = useCallback(async (jumps) => {
    if (!run) return;
    try {
      const { data } = await api.post("/game/finish",
        { run_id: run.run_id, jumps }, customerAuth());
      toast.success(t("game.scored", { n: data.score }));
      await loadBoard(period);
      const me = await api.get("/game/me", customerAuth());
      setBest(me.data);
    } catch (error) {
      toast.error(errorMessage(error, t("game.notCounted")));
    } finally {
      setRun(null);
    }
  }, [run, period, loadBoard, t]);

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 pt-10 sm:px-8">
      <Link to={ROUTES.home} className="text-sm font-medium text-olive hover:underline">
        ← {t("staff.backToSite")}
      </Link>
      <h1 className="mt-6 font-display text-4xl leading-tight text-ink">{t("game.title")}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted">{t("game.intro")}</p>

      <section className="mt-8 rounded-panel border border-line bg-white p-5 shadow-card">
        {loading ? null : !member ? (
          <div className="py-8 text-center">
            <Coffee size={30} className="mx-auto text-olive" />
            <p className="mt-3 text-sm text-muted">{t("game.needAccount")}</p>
            <Link
              to={ROUTES.loyalty}
              className="mt-4 inline-block rounded-card bg-olive px-6 py-3 text-sm font-semibold text-cream hover:bg-olive-dark"
            >
              {t("game.getCard")}
            </Link>
          </div>
        ) : run ? (
          /*
           * Played full-screen. On a phone the canvas otherwise sits high up
           * the page under the header and the intro text, which is both small
           * and awkward to reach with a thumb — the two things a tap game can
           * least afford.
           */
          <div
            data-testid="game-overlay"
            className="fixed inset-0 z-[70] flex flex-col justify-end bg-cream px-3 pb-6 pt-3 sm:justify-center sm:px-8"
          >
            <div className="mx-auto flex w-full max-w-4xl items-center justify-between pb-2">
              <span className="text-[11px] font-semibold uppercase tracking-label text-olive">
                {t("game.title")}
              </span>
              <button
                data-testid="game-quit"
                onClick={() => setRun(null)}
                aria-label={t("game.quit")}
                className="rounded-full border border-line p-2 text-muted transition-colors hover:border-olive hover:text-olive"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mx-auto w-full max-w-4xl">
              <RunnerGame seed={run.seed} onFinish={finish} />
            </div>
          </div>
        ) : (
          <div className="py-10 text-center">
            <button
              data-testid="game-start"
              onClick={start}
              disabled={busy}
              className="rounded-card bg-olive px-8 py-4 text-base font-semibold text-cream hover:bg-olive-dark disabled:opacity-60"
            >
              {busy ? t("game.starting") : t("game.play")}
            </button>
            <p className="mt-3 text-xs text-muted">{t("game.howTo")}</p>
          </div>
        )}
      </section>

      {best && (
        <div className="mt-4 grid grid-cols-4 gap-2 text-center">
          {PERIODS.map((p) => (
            <div key={p} className="rounded-card border border-line bg-white p-3">
              <p className="font-display text-2xl leading-none text-ink">{best[p] ?? 0}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">
                {t(`game.periods.${p}`)}
              </p>
            </div>
          ))}
        </div>
      )}

      <section className="mt-8">
        <div className="flex items-center gap-2">
          <Trophy size={18} className="text-olive" />
          <h2 className="font-display text-2xl text-ink">{t("game.leaderboard")}</h2>
        </div>

        <div className="mt-4 flex gap-2">
          {PERIODS.map((p) => (
            <button
              key={p}
              data-testid={`period-${p}`}
              onClick={() => setPeriod(p)}
              aria-pressed={period === p}
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors ${
                period === p ? "bg-olive text-cream" : "border border-line bg-white text-ink hover:border-olive"
              }`}
            >
              {t(`game.periods.${p}`)}
            </button>
          ))}
        </div>

        <ol className="mt-4 overflow-hidden rounded-panel border border-line bg-white" data-testid="leaderboard">
          {board === null ? (
            <li className="p-6 text-center text-sm text-muted">…</li>
          ) : board.length === 0 ? (
            <li className="p-6 text-center text-sm text-muted">{t("game.empty")}</li>
          ) : (
            board.map((row, i) => (
              <li
                key={`${row.name}-${row.at}`}
                className="flex items-center justify-between border-b border-line/60 px-5 py-3 last:border-0"
              >
                <span className="flex items-center gap-3">
                  <span className={`w-6 font-display text-lg ${i === 0 ? "text-olive" : "text-muted"}`}>
                    {i + 1}
                  </span>
                  <span className="font-medium text-ink">{row.name}</span>
                </span>
                <span className="font-display text-xl tabular-nums text-ink">{row.score}</span>
              </li>
            ))
          )}
        </ol>
        <p className="mt-3 text-xs text-muted">{t("game.prize")}</p>
      </section>
    </div>
  );
}
