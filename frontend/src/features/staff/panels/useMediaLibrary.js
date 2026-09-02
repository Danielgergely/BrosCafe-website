import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { useI18n } from "@/i18n";
import { api, errorMessage } from "@/lib/api";

/**
 * The uploaded-photo library, shared by the Photos panel and the image picker
 * inside the product and journal editors — so a photo uploaded while editing a
 * product appears in the library without a reload.
 */
export function useMediaLibrary() {
  const { t } = useI18n();
  const [items, setItems] = useState(null);
  const [uploading, setUploading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/media");
      setItems(data);
    } catch (error) {
      setItems([]);
      toast.error(errorMessage(error, t("common.somethingWrong")));
    }
  }, [t]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upload = useCallback(
    async (files) => {
      const chosen = Array.from(files || []);
      if (!chosen.length) return [];

      setUploading(true);
      const saved = [];
      try {
        // One at a time: the useful failure message is "which file", and the
        // server rejects by size and type per file anyway.
        for (const file of chosen) {
          const body = new FormData();
          body.append("file", file);
          const { data } = await api.post("/admin/media", body);
          saved.push(data);
        }
        toast.success(t("content.uploaded", { n: saved.length }));
      } catch (error) {
        toast.error(errorMessage(error, t("common.somethingWrong")));
      } finally {
        setUploading(false);
        await refresh();
      }
      return saved;
    },
    [refresh, t],
  );

  const remove = useCallback(
    async (filename) => {
      try {
        await api.delete(`/admin/media/${filename}`);
        toast.success(t("content.photoDeleted"));
        await refresh();
        return true;
      } catch (error) {
        // A 409 lists the products and posts still pointing at the file.
        toast.error(errorMessage(error, t("common.somethingWrong")));
        return false;
      }
    },
    [refresh, t],
  );

  return { items, uploading, upload, remove, refresh };
}
