import { useCallback, useEffect, useState } from "react";
import { ArrowCounterClockwise, Plus } from "@phosphor-icons/react";
import { toast } from "sonner";

import { CATEGORIES } from "@/config/site";
import {
  Loading, Modal, SectionCard, adminInputClass,
} from "@/features/staff/components/AdminPrimitives";
import {
  FlavorSliders, GalleryPicker, LocalizedField, labelClass,
} from "@/features/staff/components/ContentFields";
import { EditedBadge, RowActions } from "@/features/staff/components/ContentRow";
import { useI18n } from "@/i18n";
import { api, errorMessage } from "@/lib/api";
import { formatPrice } from "@/lib/format";

const CATS = CATEGORIES.filter((cat) => cat !== "all");

const BLANK = {
  id: "", cat: "coffee", order: 99, price_huf: 0,
  name: { en: "", hu: "" }, desc: { en: "", hu: "" },
  images: [], allergens: [], active: true,
};

export default function ProductsPanel() {
  const { t, lang } = useI18n();
  const [products, setProducts] = useState(null);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/products");
      setProducts(data);
    } catch (error) {
      setProducts([]);
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Save the whole record, not just the visible fields.
   *
   * The editor exposes the fields that change day to day; ingredients, pairings
   * and the "behind the cup" copy are still edited in catalog.json. Spreading
   * the original document underneath means saving a price here doesn't blank
   * them.
   */
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      await api.post("/admin/products", {
        ...form,
        order: Number(form.order) || 99,
        price_huf: Number(form.price_huf) || 0,
        // Explicit null, not omitted: the API reads it as "remove this field".
        flavor: form.flavor ?? null,
      });
      toast.success(t("content.saved"));
      setForm(null);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (product, active) => {
    try {
      if (active) await api.post("/admin/products", { ...product, active: true });
      else await api.delete(`/admin/products/${product.id}`);
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  };

  const revert = async (product) => {
    if (!window.confirm(t("content.revertConfirm"))) return;
    try {
      await api.post(`/admin/products/${product.id}/reset`);
      toast.success(t("content.reverted"));
      await load();
    } catch (error) {
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  };

  if (products === null) return <Loading />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">{t("content.productsHint")}</p>
        <button
          data-testid="add-product-btn"
          onClick={() => setForm({ ...BLANK })}
          className="flex shrink-0 items-center gap-2 rounded-card bg-olive px-4 py-2 text-sm font-semibold text-cream hover:bg-olive-dark"
        >
          <Plus size={16} weight="bold" /> {t("content.addProduct")}
        </button>
      </div>

      <SectionCard>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
                <th className="pb-2 pr-3">{t("content.photo")}</th>
                <th className="pb-2 pr-3">{t("content.name")}</th>
                <th className="pb-2 pr-3">{t("content.category")}</th>
                <th className="pb-2 pr-3 text-right">{t("content.price")}</th>
                <th className="pb-2 pr-3 text-right">{t("content.order")}</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  data-testid={`product-row-${product.id}`}
                  className={`border-b border-line/60 ${
                    product.active === false ? "opacity-50" : ""
                  }`}
                >
                  <td className="py-2 pr-3">
                    <div className="h-10 w-10 overflow-hidden rounded border border-line bg-cream">
                      {product.images?.[0] && (
                        <img src={product.images[0]} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-3">
                    <span className="font-medium text-ink">{product.name?.[lang]}</span>
                    <EditedBadge item={product} />
                  </td>
                  <td className="py-2 pr-3 text-muted">{t(`product.cats.${product.cat}`)}</td>
                  <td className="py-2 pr-3 text-right tabular-nums text-ink">
                    {formatPrice(product.price_huf)}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums text-muted">{product.order}</td>
                  <td className="py-2">
                    <RowActions
                      item={product}
                      onEdit={() => setForm({ ...product })}
                      onToggle={() => setActive(product, product.active === false)}
                      onRevert={() => revert(product)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>

      {form && (
        <Modal
          title={form.id ? t("content.editProduct") : t("content.addProduct")}
          onClose={() => setForm(null)}
          width="max-w-2xl"
        >
          <form onSubmit={save} className="space-y-4" data-testid="product-form">
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block">
                <span className={labelClass}>{t("content.id")}</span>
                <input
                  data-testid="product-id-input"
                  value={form.id}
                  onChange={(event) =>
                    setForm({ ...form, id: event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })
                  }
                  // The id is in customer-facing URLs and in pairing lists on
                  // other products; changing it would orphan both.
                  disabled={Boolean(products.some((p) => p.id === form.id))}
                  required
                  className={`mt-1 ${adminInputClass} disabled:bg-cream disabled:text-muted`}
                />
              </label>
              <label className="block">
                <span className={labelClass}>{t("content.category")}</span>
                <select
                  data-testid="product-cat-select"
                  value={form.cat}
                  onChange={(event) => setForm({ ...form, cat: event.target.value })}
                  className={`mt-1 ${adminInputClass}`}
                >
                  {CATS.map((cat) => (
                    <option key={cat} value={cat}>{t(`product.cats.${cat}`)}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={labelClass}>{t("content.priceHuf")}</span>
                <input
                  data-testid="product-price-input"
                  type="number"
                  min="0"
                  step="10"
                  value={form.price_huf}
                  onChange={(event) => setForm({ ...form, price_huf: event.target.value })}
                  className={`mt-1 ${adminInputClass} tabular-nums`}
                />
              </label>
            </div>

            <LocalizedField
              label={t("content.name")}
              testId="product-name"
              value={form.name}
              onChange={(name) => setForm({ ...form, name })}
            />
            <LocalizedField
              label={t("content.desc")}
              testId="product-desc"
              rows={3}
              value={form.desc}
              onChange={(desc) => setForm({ ...form, desc })}
            />
            <LocalizedField
              label={t("content.tip")}
              testId="product-tip"
              rows={2}
              value={form.tip || { en: "", hu: "" }}
              onChange={(tip) => setForm({ ...form, tip })}
            />

            <GalleryPicker
              label={t("content.gallery")}
              testId="product-gallery"
              value={form.images}
              onChange={(images) => setForm({ ...form, images })}
            />

            <FlavorSliders
              testId="product-flavor"
              value={form.flavor}
              onChange={(flavor) => setForm({ ...form, flavor })}
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={labelClass}>{t("content.order")}</span>
                <input
                  data-testid="product-order-input"
                  type="number"
                  min="1"
                  value={form.order}
                  onChange={(event) => setForm({ ...form, order: event.target.value })}
                  className={`mt-1 ${adminInputClass} tabular-nums`}
                />
              </label>
              <label className="mt-6 flex items-center gap-2 text-sm text-ink">
                <input
                  data-testid="product-active-checkbox"
                  type="checkbox"
                  checked={form.active !== false}
                  onChange={(event) => setForm({ ...form, active: event.target.checked })}
                  className="h-4 w-4 accent-olive"
                />
                {t("content.showOnMenu")}
              </label>
            </div>

            <button
              data-testid="product-save-btn"
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
