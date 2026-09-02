import { useRef, useState } from "react";
import { Copy, Trash, UploadSimple } from "@phosphor-icons/react";
import { toast } from "sonner";

import { Loading, SectionCard } from "@/features/staff/components/AdminPrimitives";
import { useMediaLibrary } from "@/features/staff/panels/useMediaLibrary";
import { useI18n } from "@/i18n";

function readableSize(bytes) {
  if (!bytes) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  // Round up, so a small file reads as "1 KB" rather than "0 KB".
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function MediaPanel() {
  const { t } = useI18n();
  const { items, uploading, upload, remove } = useMediaLibrary();
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  const copy = async (url) => {
    try {
      // Absolute, because this gets pasted into catalog.json or a browser bar.
      await navigator.clipboard.writeText(`${window.location.origin}${url}`);
      toast.success(t("content.linkCopied"));
    } catch {
      toast.error(t("content.copyFailed"));
    }
  };

  const drop = (event) => {
    event.preventDefault();
    setDragging(false);
    upload(event.dataTransfer.files);
  };

  if (items === null) return <Loading />;

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">{t("content.photosHint")}</p>

      <button
        type="button"
        data-testid="media-dropzone"
        onClick={() => fileInput.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={drop}
        className={`flex w-full flex-col items-center gap-2 rounded-panel border-2 border-dashed p-10 transition-colors ${
          dragging ? "border-olive bg-cream" : "border-line bg-white hover:border-olive"
        }`}
      >
        <UploadSimple size={26} className="text-olive" />
        <span className="font-medium text-ink">
          {uploading ? t("content.uploading") : t("content.dropHere")}
        </span>
        <span className="text-xs text-muted">{t("content.dropHint")}</span>
      </button>

      <input
        ref={fileInput}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif,video/mp4"
        onChange={(event) => {
          upload(event.target.files);
          event.target.value = "";
        }}
        className="hidden"
      />

      {items.length === 0 ? (
        <SectionCard>
          <p className="py-6 text-center text-sm text-muted">{t("content.libraryEmpty")}</p>
        </SectionCard>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((item) => (
            <div
              key={item.id}
              data-testid={`media-${item.id}`}
              className="overflow-hidden rounded-card border border-line bg-white shadow-card"
            >
              <div className="aspect-square bg-cream">
                {item.content_type === "video/mp4" ? (
                  <video src={item.url} muted className="h-full w-full object-cover" />
                ) : (
                  <img src={item.url} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="p-3">
                <p className="truncate text-xs font-medium text-ink" title={item.original_name}>
                  {item.original_name}
                </p>
                <p className="mt-0.5 text-[11px] tabular-nums text-muted">
                  {readableSize(item.bytes)}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <button
                    onClick={() => copy(item.url)}
                    aria-label={t("content.copyLink")}
                    title={t("content.copyLink")}
                    className="rounded p-1.5 text-muted transition-colors hover:bg-cream hover:text-olive"
                  >
                    <Copy size={15} />
                  </button>
                  <button
                    onClick={() => remove(item.filename)}
                    aria-label={t("content.delete")}
                    title={t("content.delete")}
                    className="rounded p-1.5 text-muted transition-colors hover:bg-cream hover:text-alert"
                  >
                    <Trash size={15} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
