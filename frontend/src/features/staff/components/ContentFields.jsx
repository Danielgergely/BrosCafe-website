import { useRef, useState } from "react";
import { Image as ImageIcon, Trash2, Upload } from "lucide-react";

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
