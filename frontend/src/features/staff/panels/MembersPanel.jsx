import { useCallback, useEffect, useState } from "react";
import { Trash } from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  Loading, Modal, SectionCard, adminInputClass,
} from "@/features/staff/components/AdminPrimitives";
import { TIERS, TIER_STYLE } from "@/config/site";
import { useI18n } from "@/i18n";
import { api, errorMessage } from "@/lib/api";

export default function MembersPanel() {
  const { t } = useI18n();
  const [members, setMembers] = useState(null);
  const [erasing, setErasing] = useState(null);
  // The member awaiting confirmation, and what has been typed to confirm it.
  const [pending, setPending] = useState(null);
  const [typed, setTyped] = useState("");

  /**
   * Grant a tier by hand, or hand the member back to the automatic ladder.
   * A grant only ever promotes, so choosing a lower tier than someone has
   * earned leaves them where they are — the backend decides, not this select.
   */
  const setTier = async (member, value) => {
    try {
      await api.put(`/admin/members/${member.code}/tier`, { tier: value || null });
      toast.success(t("admin.tierSaved", { name: member.name }));
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  };

  /** Bank or remove a free drink — the weekly game winner comes through here. */
  const setFreeCoffees = async (member, delta) => {
    try {
      await api.put(`/admin/members/${member.code}/free-coffees`, { delta });
      toast.success(t("admin.freeSaved", { name: member.name }));
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  };

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/members");
      setMembers(data);
    } catch (error) {
      setMembers([]);
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Erasing is permanent and takes the visit history with it, so the name has
   * to be typed rather than merely confirmed — a misclick on the wrong row
   * cannot be undone.
   *
   * An in-page dialog rather than window.prompt: browsers let a visitor
   * suppress further prompts for a page, after which prompt() silently returns
   * null and the button appears to do nothing at all.
   */
  const matches = pending && typed.trim().toLowerCase()
    === (pending.name || "").trim().toLowerCase();

  const erase = async (member) => {
    setErasing(member.code);
    try {
      const { data } = await api.delete(`/admin/members/${member.code}`);
      const gone = Object.values(data.removed || {}).reduce((a, b) => a + b, 0);
      toast.success(t("admin.erased", { name: member.name, n: gone }));
      setPending(null);
      setTyped("");
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    } finally {
      setErasing(null);
    }
  };

  if (!members) return <Loading />;

  const headers = ["name", "email", "progress", "coffees", "rewards", "free", "tier"];
  const headerLabel = {
    name: t("admin.name"),
    email: t("admin.email"),
    progress: t("admin.table.progress"),
    coffees: t("admin.stats.coffees"),
    rewards: t("admin.table.rewards"),
    free: t("admin.freeCoffees"),
    tier: t("admin.tier"),
  };

  return (
    <SectionCard title={`${t("admin.membersTitle")} (${members.length})`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-testid="members-table">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted">
              {headers.map((key) => (
                <th key={key} className="py-2 pr-4 font-semibold">
                  {headerLabel[key]}
                </th>
              ))}
              <th className="py-2" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr
                key={member.code}
                data-testid={`member-row-${member.code}`}
                className="border-t border-line"
              >
                <td className="py-3 pr-4 font-medium text-ink">{member.name}</td>
                <td className="py-3 pr-4 text-muted">{member.email}</td>
                <td className="py-3 pr-4">
                  {member.reward_ready ? (
                    <span className="rounded-full bg-olive/10 px-3 py-1 text-xs font-semibold text-olive">
                      {t("admin.rewardReady")}
                    </span>
                  ) : (
                    <span className="text-ink">
                      {member.stamps} / {member.stamps_required}
                    </span>
                  )}
                </td>
                <td className="py-3 pr-4 text-ink">{member.total_coffees}</td>
                <td className="py-3 pr-4 text-ink">{member.rewards_redeemed}</td>
                <td className="py-3 pr-4">
                  <div className="flex items-center gap-1">
                    <button
                      data-testid={`free-minus-${member.code}`}
                      onClick={() => setFreeCoffees(member, -1)}
                      disabled={!member.free_coffees}
                      aria-label={t("admin.freeRemove")}
                      className="rounded px-1.5 text-muted transition-colors hover:bg-cream hover:text-olive disabled:opacity-30"
                    >
                      −
                    </button>
                    <span
                      data-testid={`free-${member.code}`}
                      className={`w-4 text-center tabular-nums ${
                        member.free_coffees ? "font-semibold text-olive" : "text-muted"
                      }`}
                    >
                      {member.free_coffees ?? 0}
                    </span>
                    <button
                      data-testid={`free-plus-${member.code}`}
                      onClick={() => setFreeCoffees(member, 1)}
                      aria-label={t("admin.freeGrant")}
                      className="rounded px-1.5 text-muted transition-colors hover:bg-cream hover:text-olive"
                    >
                      +
                    </button>
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <select
                    data-testid={`tier-${member.code}`}
                    value={member.tier_granted ? member.tier : ""}
                    onChange={(event) => setTier(member, event.target.value)}
                    aria-label={t("admin.tier")}
                    className="rounded-card border border-line bg-white px-2 py-1 text-xs font-medium"
                    style={{ color: (TIER_STYLE[member.tier] || TIER_STYLE.base).ink }}
                  >
                    <option value="">
                      {t("admin.tierAuto", { tier: t(`loyalty.tiers.${member.tier}`) })}
                    </option>
                    {TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {t(`loyalty.tiers.${tier}`)}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-3 text-right">
                  <button
                    data-testid={`erase-${member.code}`}
                    onClick={() => {
                      setTyped("");
                      setPending(member);
                    }}
                    disabled={erasing === member.code}
                    aria-label={t("admin.erase")}
                    title={t("admin.eraseHint")}
                    className="rounded p-1.5 text-muted transition-colors hover:bg-cream hover:text-alert disabled:opacity-40"
                  >
                    <Trash size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-muted">{t("admin.eraseNote")}</p>

      {pending && (
        <Modal title={t("admin.erase")} onClose={() => setPending(null)}>
          <form
            data-testid="erase-dialog"
            onSubmit={(event) => {
              event.preventDefault();
              if (matches) erase(pending);
            }}
            className="space-y-4"
          >
            <p className="text-sm leading-relaxed text-ink">
              {t("admin.eraseWarning", { name: pending.name })}
            </p>
            <label className="block">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t("admin.eraseTypeName")}
              </span>
              <input
                data-testid="erase-confirm-input"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                placeholder={pending.name}
                autoFocus
                className={`mt-1 ${adminInputClass}`}
              />
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPending(null)}
                className="h-12 flex-1 rounded-card border border-line font-semibold text-ink hover:border-olive"
              >
                {t("admin.eraseCancel")}
              </button>
              <button
                type="submit"
                data-testid="erase-confirm-btn"
                disabled={!matches || erasing === pending.code}
                className="h-12 flex-1 rounded-card bg-alert font-semibold text-white disabled:opacity-40"
              >
                {erasing === pending.code ? t("content.saving") : t("admin.erase")}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </SectionCard>
  );
}
