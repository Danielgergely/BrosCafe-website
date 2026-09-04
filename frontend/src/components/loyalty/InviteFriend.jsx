import { Gift, Share2 } from "lucide-react";
import { toast } from "sonner";

import { BRAND, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";

/**
 * "Bring a friend" — the member's own signup link.
 *
 * A printed card cannot carry a per-member code, so this is the whole
 * mechanism, which means it has to be somewhere people actually look. It sits
 * on the loyalty page under the card as well as on the account page.
 *
 * @param {object} member  the signed-in member
 * @param {boolean} compact  drop the heading where the surrounding panel has one
 */
export default function InviteFriend({ member, compact = false }) {
  const { t } = useI18n();
  const url = `${window.location.origin}${ROUTES.loyalty}?ref=${member?.code ?? ""}`;

  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: BRAND.name, text: t("account.inviteMessage"), url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success(t("account.inviteCopied"));
    } catch {
      // A cancelled share sheet is not an error worth showing.
    }
  };

  return (
    <div data-testid="invite-friend">
      {member?.free_coffees > 0 && (
        <p className="mb-3 flex items-center justify-center gap-2 rounded-card bg-olive/10 px-3 py-2 text-sm font-semibold text-olive">
          <Gift size={16} /> {t("account.bankedFree", { n: member.free_coffees })}
        </p>
      )}
      {!compact && (
        <p className="text-[11px] font-semibold uppercase tracking-label text-olive">
          {t("account.inviteTitle")}
        </p>
      )}
      <p className={`text-sm leading-relaxed text-muted ${compact ? "" : "mt-1"}`}>
        {t("account.inviteBody")}
      </p>
      <button
        data-testid="invite-share-btn"
        onClick={share}
        className="mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-card border border-olive bg-white font-semibold text-olive transition-colors hover:bg-olive hover:text-cream"
      >
        <Share2 size={17} /> {t("account.inviteShare")}
      </button>
    </div>
  );
}
