import { ArrowCounterClockwise, Eye, EyeSlash, PencilSimple } from "@phosphor-icons/react";

import { useI18n } from "@/i18n";

/**
 * Flags an item the dashboard now owns.
 *
 * Once something is saved here it stops being re-seeded from
 * backend/data/*.json, so a later git change to that item has no effect. That
 * is easy to trip over, hence the badge and the revert action beside it.
 */
export function EditedBadge({ item }) {
  const { t } = useI18n();
  if (!item.edited_at) return null;
  return (
    <span
      title={t("content.editedNote")}
      className="ml-2 rounded-full bg-cream px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-olive"
    >
      {t("content.edited")}
    </span>
  );
}

export function RowActions({ item, onEdit, onToggle, onRevert }) {
  const { t } = useI18n();
  const hidden = item.active === false;

  return (
    <div className="flex items-center justify-end gap-1">
      <button
        onClick={onEdit}
        aria-label={t("content.edit")}
        title={t("content.edit")}
        className="rounded p-1.5 text-muted transition-colors hover:bg-cream hover:text-olive"
      >
        <PencilSimple size={16} />
      </button>
      <button
        onClick={onToggle}
        aria-label={hidden ? t("content.show") : t("content.hide")}
        title={hidden ? t("content.show") : t("content.hide")}
        className="rounded p-1.5 text-muted transition-colors hover:bg-cream hover:text-olive"
      >
        {hidden ? <EyeSlash size={16} /> : <Eye size={16} />}
      </button>
      {item.edited_at && (
        <button
          onClick={onRevert}
          aria-label={t("content.revert")}
          title={t("content.revert")}
          className="rounded p-1.5 text-muted transition-colors hover:bg-cream hover:text-olive"
        >
          <ArrowCounterClockwise size={16} />
        </button>
      )}
    </div>
  );
}
