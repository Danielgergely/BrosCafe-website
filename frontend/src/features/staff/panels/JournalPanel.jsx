import { useCallback, useEffect, useState } from "react";
import { ArrowCounterClockwise, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";

import {
  Loading, Modal, SectionCard, adminInputClass,
} from "@/features/staff/components/AdminPrimitives";
import { ImagePicker, LocalizedField, labelClass } from "@/features/staff/components/ContentFields";
import { EditedBadge, RowActions } from "@/features/staff/components/ContentRow";
import { useI18n } from "@/i18n";
import { api, errorMessage } from "@/lib/api";

// Each kind renders its own eyebrow on the site ("CURRENT GUEST ORIGIN"), so
// the choice is a label, not decoration.
const KINDS = ["guest", "house", "pastry"];

const BLANK = {
  id: "", order: 99, kind: "guest", image: "",
  title: { en: "", hu: "" }, blurb: { en: "", hu: "" }, body: { en: "", hu: "" },
  active: true,
};

export default function JournalPanel() {
  const { t, lang } = useI18n();
  const [posts, setPosts] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/whats-new");
      setPosts(data);
    } catch (error) {
      setPosts([]);
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/admin/whats-new", { ...form, order: Number(form.order) || 99 });
      toast.success(t("content.saved"));
      setForm(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (post, active) => {
    try {
      if (active) await api.post("/admin/whats-new", { ...post, active: true });
      else await api.delete(`/admin/whats-new/${post.id}`);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  };

  const revert = async (post) => {
    if (!window.confirm(t("content.revertConfirm"))) return;
    try {
      await api.post(`/admin/whats-new/${post.id}/reset`);
      toast.success(t("content.reverted"));
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  };

  if (posts === null) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-muted">{t("content.journalHint")}</p>
        <button
          data-testid="add-post-btn"
          onClick={() => setForm({ ...BLANK })}
          className="flex shrink-0 items-center gap-2 rounded-card bg-olive px-4 py-2 text-sm font-semibold text-cream hover:bg-olive-dark"
        >
          <Plus size={16} weight="bold" /> {t("content.addPost")}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {posts.map((post) => (
          <SectionCard
            key={post.id}
            className={post.active === false ? "opacity-50" : ""}
          >
            <div data-testid={`post-card-${post.id}`}>
              <div className="mb-3 h-32 overflow-hidden rounded-card bg-cream">
                {post.image && (
                  <img src={post.image} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-olive">
                {t(`news.tags.${post.kind}`)}
              </p>
              <h4 className="mt-1 font-display text-lg leading-tight text-ink">
                {post.title?.[lang]}
                <EditedBadge item={post} />
              </h4>
              <p className="mt-2 line-clamp-3 text-sm text-muted">{post.blurb?.[lang]}</p>
              <div className="mt-3 border-t border-line pt-2">
                <RowActions
                  item={post}
                  onEdit={() => setForm({ ...post })}
                  onToggle={() => setActive(post, post.active === false)}
                  onRevert={() => revert(post)}
                />
              </div>
            </div>
          </SectionCard>
        ))}
      </div>

      {form && (
        <Modal
          title={form.id ? t("content.editPost") : t("content.addPost")}
          onClose={() => setForm(null)}
          width="max-w-2xl"
        >
          <form onSubmit={save} className="space-y-4" data-testid="post-form">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className={labelClass}>{t("content.id")}</span>
                <input
                  data-testid="post-id-input"
                  value={form.id}
                  onChange={(event) =>
                    setForm({ ...form, id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })
                  }
                  disabled={Boolean(posts.some((p) => p.id === form.id))}
                  required
                  className={`mt-1 ${adminInputClass} disabled:bg-cream disabled:text-muted`}
                />
              </label>
              <label className="block">
                <span className={labelClass}>{t("content.kind")}</span>
                <select
                  data-testid="post-kind-select"
                  value={form.kind}
                  onChange={(event) => setForm({ ...form, kind: event.target.value })}
                  className={`mt-1 ${adminInputClass}`}
                >
                  {KINDS.map((kind) => (
                    <option key={kind} value={kind}>{t(`news.tags.${kind}`)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>{t("content.order")}</span>
                <input
                  data-testid="post-order-input"
                  type="number"
                  min="1"
                  value={form.order}
                  onChange={(event) => setForm({ ...form, order: event.target.value })}
                  className={`mt-1 ${adminInputClass} tabular-nums`}
                />
              </label>
            </div>

            <LocalizedField
              label={t("content.title")}
              testId="post-title"
              value={form.title}
              onChange={(title) => setForm({ ...form, title })}
            />
            <LocalizedField
              label={t("content.blurb")}
              testId="post-blurb"
              rows={3}
              value={form.blurb}
              onChange={(blurb) => setForm({ ...form, blurb })}
            />
            <LocalizedField
              label={t("content.body")}
              testId="post-body"
              rows={8}
              value={form.body}
              onChange={(body) => setForm({ ...form, body })}
            />
            <p className="text-xs text-muted">{t("content.bodyHint")}</p>

            <ImagePicker
              label={t("content.photo")}
              testId="post-image"
              value={form.image}
              onChange={(image) => setForm({ ...form, image })}
            />

            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                data-testid="post-active-checkbox"
                type="checkbox"
                checked={form.active !== false}
                onChange={(event) => setForm({ ...form, active: event.target.checked })}
                className="h-4 w-4 accent-olive"
              />
              {t("content.showOnSite")}
            </label>

            <button
              data-testid="post-save-btn"
              type="submit"
              disabled={saving}
              className="h-14 w-full rounded-card bg-olive font-semibold text-cream hover:bg-olive-dark disabled:opacity-60"
            >
              {saving ? t("content.saving") : t("content.save")}
            </button>
            {form.edited_at && (
              <p className="flex items-start gap-2 text-xs text-muted">
                <ArrowCounterClockwise size={14} className="mt-0.5 shrink-0" />
                {t("content.editedNote")}
              </p>
            )}
          </form>
        </Modal>
      )}
    </div>
  );
}
