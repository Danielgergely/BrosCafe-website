import { toast } from "sonner";

/**
 * Tell someone their tab is running code the server no longer has.
 *
 * Deploys are push-to-deploy and the built filenames carry a content hash, so
 * the moment a new container starts, the chunks an open tab still expects are
 * gone. The tab keeps working until it needs one — then a lazy route or an
 * image fails with an error that looks like a broken app.
 *
 * This bit us for real: an editor saved a product three minutes after a deploy,
 * the write succeeded, and the stale bundle threw on its way back — so the
 * dashboard claimed the save had failed when the record was already stored.
 */
const CHUNK_ERROR = /loading chunk|loading css chunk|chunkloaderror|dynamically imported module|error loading/i;

let warned = false;

function warn(t) {
  if (warned) return;
  warned = true;
  toast.error(t("common.staleBuild"), {
    duration: Infinity,
    action: { label: t("common.reload"), onClick: () => window.location.reload() },
  });
}

export function watchForStaleBuild(t) {
  const fromRejection = (event) => {
    const reason = event?.reason;
    const text = `${reason?.name ?? ""} ${reason?.message ?? reason ?? ""}`;
    if (CHUNK_ERROR.test(text)) warn(t);
  };
  const fromError = (event) => {
    if (CHUNK_ERROR.test(`${event?.error?.name ?? ""} ${event?.message ?? ""}`)) warn(t);
  };

  window.addEventListener("unhandledrejection", fromRejection);
  window.addEventListener("error", fromError);
  return () => {
    window.removeEventListener("unhandledrejection", fromRejection);
    window.removeEventListener("error", fromError);
  };
}
