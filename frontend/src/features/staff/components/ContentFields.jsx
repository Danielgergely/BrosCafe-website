import { useRef, useState } from "react";
import {
  ArrowDown, ArrowUp, Image as ImageIcon, Plus, Trash2, Upload,
} from "lucide-react";

import { FLAVOUR_KEYS, MILK_TYPES } from "@/config/site";
import { adminInputClass } from "@/features/staff/components/AdminPrimitives";
import { useMediaLibrary } from "@/features/staff/panels/useMediaLibrary";
import { useI18n } from "@/i18n";

export const labelClass = "text-xs font-semibold uppercase tracking-wide text-muted";

/**
 * One field, both languages.
 *
 * Editing Hungarian and English side by side rather than behind a language
 * switch is deliberate: it is how you notice that only one of them got updated.
 */
export function LocalizedField({ label, value, onChange, rows = 0, testId }) {
  const { t } = useI18n();
  const pair = value || { en: "", hu: "" };
  const Field = rows ? "textarea" : "input";

  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {["hu", "en"].map((code) => (
          <label key={code} className="block">
            <span className="sr-only">{t(`content.lang.${code}`)}</span>
            <Field
              data-testid={testId ? `${testId}-${code}` : undefined}
              value={pair[code] || ""}
              rows={rows || undefined}
              onChange={(event) => onChange({ ...pair, [code]: event.target.value })}
              placeholder={t(`content.lang.${code}`)}
              className={
                rows
                  ? `${adminInputClass} h-auto py-3 leading-relaxed`
                  : adminInputClass
              }
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * A list of short lines, both languages — the "behind the cup" steps and
 * anything else stored as one string per bullet.
 *
 * One line per item, and empty lines are kept while typing: filtering them on
 * every keystroke would swallow the Enter that starts a new step. The caller
 * strips them on save.
 */
export function LocalizedListField({ label, value, onChange, rows = 5, hint, testId }) {
  const { t } = useI18n();
  const pair = value || { en: [], hu: [] };

  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="mt-1 grid gap-2 sm:grid-cols-2">
        {["hu", "en"].map((code) => (
          <label key={code} className="block">
            <span className="sr-only">{t(`content.lang.${code}`)}</span>
            <textarea
              data-testid={testId ? `${testId}-${code}` : undefined}
              rows={rows}
              value={(pair[code] || []).join("\n")}
              onChange={(event) =>
                onChange({ ...pair, [code]: event.target.value.split("\n") })
              }
              placeholder={t(`content.lang.${code}`)}
              className={`${adminInputClass} h-auto py-3 leading-relaxed`}
            />
          </label>
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Pick an image: upload a new one, or reuse something already in the library.
 *
 * External URLs stay editable by hand — most of the site's current photography
 * is hotlinked stock, and this shouldn't force a re-upload to change a caption.
 */
export function ImagePicker({ label, value, onChange, testId }) {
  const { t } = useI18n();
  const { items, uploading, upload } = useMediaLibrary();
  const [browsing, setBrowsing] = useState(false);
  const fileInput = useRef(null);

  const choose = async (event) => {
    const [saved] = await upload(event.target.files);
    if (saved) onChange(saved.url);
    event.target.value = "";
  };

  return (
    <div>
      <span className={labelClass}>{label}</span>

      <div className="mt-1 flex items-start gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-cream">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon size={20} className="text-muted" />
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <input
            data-testid={testId}
            value={value || ""}
            onChange={(event) => onChange(event.target.value)}
            placeholder={t("content.imageUrl")}
            className={adminInputClass}
          />
          <div className="flex flex-wrap gap-2 text-sm">
            <button
              type="button"
              data-testid={testId ? `${testId}-upload` : undefined}
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 rounded-card border border-olive px-3 py-1.5 font-medium text-olive hover:bg-cream disabled:opacity-60"
            >
              <Upload size={14} /> {uploading ? t("content.uploading") : t("content.upload")}
            </button>
            <button
              type="button"
              onClick={() => setBrowsing((open) => !open)}
              className="rounded-card border border-line px-3 py-1.5 font-medium text-ink hover:border-olive"
            >
              {t("content.browse")}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange("")}
                className="flex items-center gap-1.5 rounded-card border border-line px-3 py-1.5 font-medium text-muted hover:border-alert hover:text-alert"
              >
                <Trash2 size={14} /> {t("content.clear")}
              </button>
            )}
          </div>
        </div>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif,video/mp4"
        onChange={choose}
        className="hidden"
      />

      {browsing && (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-card border border-line bg-cream p-2">
          {items?.length ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  title={item.original_name}
                  onClick={() => {
                    onChange(item.url);
                    setBrowsing(false);
                  }}
                  className={`aspect-square overflow-hidden rounded border-2 ${
                    value === item.url ? "border-olive" : "border-transparent hover:border-olive/50"
                  }`}
                >
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <p className="p-3 text-center text-sm text-muted">{t("content.libraryEmpty")}</p>
          )}
        </div>
      )}
    </div>
  );
}


/**
 * The four flavour axes shown on the product page.
 *
 * Optional by design: sandwiches, hoodies and mugs have no flavour profile, and
 * the product page hides the block entirely when it is absent. Clearing the
 * profile sends `null`, which the API turns into a $unset — setting it to an
 * empty object instead would leave the page rendering four blank bars.
 */
export function FlavorSliders({ value, onChange, testId }) {
  const { t } = useI18n();
  const scales = t("product.scales");
  const profile = value || null;

  if (!profile) {
    return (
      <div>
        <span className={labelClass}>{t("content.flavour")}</span>
        <button
          type="button"
          data-testid={testId ? `${testId}-add` : undefined}
          onClick={() => onChange(Object.fromEntries(FLAVOUR_KEYS.map((key) => [key, 50])))}
          className="mt-1 flex items-center gap-1.5 rounded-card border border-olive px-3 py-2 text-sm font-medium text-olive hover:bg-cream"
        >
          <Plus size={14} /> {t("content.addFlavour")}
        </button>
        <p className="mt-1 text-xs text-muted">{t("content.flavourHint")}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <span className={labelClass}>{t("content.flavour")}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs font-medium text-muted hover:text-alert"
        >
          {t("content.removeFlavour")}
        </button>
      </div>

      <div className="mt-2 space-y-3 rounded-card border border-line bg-cream/50 p-4">
        {FLAVOUR_KEYS.map((key, index) => (
          <label key={key} className="block">
            <span className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-muted">
              <span>{scales[index]?.[0]}</span>
              <span className="tabular-nums text-olive">{profile[key] ?? 50}</span>
              <span>{scales[index]?.[1]}</span>
            </span>
            <input
              data-testid={testId ? `${testId}-${key}` : undefined}
              type="range"
              min="0"
              max="100"
              step="1"
              value={profile[key] ?? 50}
              onChange={(event) =>
                onChange({ ...profile, [key]: Number(event.target.value) })
              }
              className="mt-1 h-2 w-full cursor-pointer accent-olive"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * The product's photo gallery.
 *
 * The first image is the one the menu and cards show, so order matters and is
 * editable — hence the arrows rather than a plain list.
 */
export function GalleryPicker({ label, value, onChange, testId }) {
  const { t } = useI18n();
  const { items, uploading, upload } = useMediaLibrary();
  const [browsing, setBrowsing] = useState(false);
  const [pasted, setPasted] = useState("");
  const fileInput = useRef(null);
  const images = value || [];

  const add = (url) => {
    if (!url || images.includes(url)) return;
    onChange([...images, url]);
  };

  const move = (index, delta) => {
    const next = [...images];
    const target = index + delta;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const choose = async (event) => {
    const saved = await upload(event.target.files);
    if (saved.length) onChange([...images, ...saved.map((item) => item.url)]);
    event.target.value = "";
  };

  return (
    <div>
      <span className={labelClass}>{label}</span>

      <div className="mt-1 space-y-2" data-testid={testId}>
        {images.map((url, index) => (
          <div
            key={url}
            data-testid={testId ? `${testId}-row-${index}` : undefined}
            className="flex items-center gap-3 rounded-card border border-line bg-white p-2"
          >
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded bg-cream">
              <img src={url} alt="" className="h-full w-full object-cover" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-olive">
                {index === 0 ? t("content.mainPhoto") : `${index + 1}.`}
              </p>
              <p className="truncate text-xs text-muted" title={url}>{url}</p>
            </div>
            <div className="flex shrink-0 items-center gap-0.5">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                aria-label={t("content.moveUp")}
                title={t("content.moveUp")}
                className="rounded p-1.5 text-muted hover:bg-cream hover:text-olive disabled:opacity-30"
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === images.length - 1}
                aria-label={t("content.moveDown")}
                title={t("content.moveDown")}
                className="rounded p-1.5 text-muted hover:bg-cream hover:text-olive disabled:opacity-30"
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                data-testid={testId ? `${testId}-remove-${index}` : undefined}
                onClick={() => onChange(images.filter((_, i) => i !== index))}
                aria-label={t("content.clear")}
                title={t("content.clear")}
                className="rounded p-1.5 text-muted hover:bg-cream hover:text-alert"
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {images.length === 0 && (
          <p className="rounded-card border border-dashed border-line px-3 py-4 text-center text-sm text-muted">
            {t("content.noPhotos")}
          </p>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        <button
          type="button"
          data-testid={testId ? `${testId}-upload` : undefined}
          onClick={() => fileInput.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 rounded-card border border-olive px-3 py-1.5 font-medium text-olive hover:bg-cream disabled:opacity-60"
        >
          <Upload size={14} /> {uploading ? t("content.uploading") : t("content.upload")}
        </button>
        <button
          type="button"
          onClick={() => setBrowsing((open) => !open)}
          className="rounded-card border border-line px-3 py-1.5 font-medium text-ink hover:border-olive"
        >
          {t("content.browse")}
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        onChange={choose}
        className="hidden"
      />

      <div className="mt-2 flex gap-2">
        <input
          data-testid={testId ? `${testId}-url` : undefined}
          value={pasted}
          onChange={(event) => setPasted(event.target.value)}
          placeholder={t("content.imageUrl")}
          className={adminInputClass}
        />
        <button
          type="button"
          onClick={() => {
            add(pasted.trim());
            setPasted("");
          }}
          disabled={!pasted.trim()}
          className="shrink-0 rounded-card border border-line px-4 font-medium text-ink hover:border-olive disabled:opacity-40"
        >
          {t("content.addUrl")}
        </button>
      </div>

      {browsing && (
        <div className="mt-3 max-h-56 overflow-y-auto rounded-card border border-line bg-cream p-2">
          {items?.length ? (
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
              {items
                .filter((item) => item.content_type !== "video/mp4")
                .map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    title={item.original_name}
                    onClick={() => add(item.url)}
                    className={`aspect-square overflow-hidden rounded border-2 ${
                      images.includes(item.url)
                        ? "border-olive"
                        : "border-transparent hover:border-olive/50"
                    }`}
                  >
                    <img src={item.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
            </div>
          ) : (
            <p className="p-3 text-center text-sm text-muted">{t("content.libraryEmpty")}</p>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Tick any number of options from a fixed list.
 *
 * Used for the milks a drink can be made with, the tags on a journal entry and
 * the coffees an entry is about — all the same shape: canonical ids stored,
 * translated labels shown.
 */
export function CheckboxGroup({ label, options, value, onChange, hint, testId }) {
  const chosen = value || [];
  const toggle = (id) =>
    onChange(chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id]);

  return (
    <div>
      <span className={labelClass}>{label}</span>
      <div className="mt-2 flex flex-wrap gap-2" data-testid={testId}>
        {options.map((option) => (
          <label
            key={option.id}
            data-testid={testId ? `${testId}-${option.id}` : undefined}
            className={`flex cursor-pointer items-center gap-2 rounded-card border px-3 py-2 text-sm transition-colors ${
              chosen.includes(option.id)
                ? "border-olive bg-olive/10 text-olive"
                : "border-line bg-white text-muted hover:border-olive/50"
            }`}
          >
            <input
              type="checkbox"
              checked={chosen.includes(option.id)}
              onChange={() => toggle(option.id)}
              className="h-4 w-4 accent-olive"
            />
            {option.label}
          </label>
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/**
 * Which alternative milks a drink can be made with.
 *
 * Per product rather than global: an espresso takes none, a latte takes all of
 * them, and a guest filter usually sits somewhere in between.
 */
export function MilkPicker({ value, onChange, testId }) {
  const { t } = useI18n();
  const map = t("product.milkMap");

  return (
    <CheckboxGroup
      label={t("content.milks")}
      hint={t("content.milksHint")}
      testId={testId}
      options={MILK_TYPES.map((milk) => ({ id: milk, label: map[milk] ?? milk }))}
      value={value}
      onChange={onChange}
    />
  );
}
