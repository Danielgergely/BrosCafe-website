import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, X } from "lucide-react";

import { MOTION } from "@/config/site";
import { useI18n } from "@/i18n";
import { useCatalog } from "@/lib/catalog";
import { postTags, useJournal } from "@/lib/journal";
import { useUi } from "@/state/UiStore";

/** "2026. szeptember 10." / "10 September 2026", in the reader's language. */
export function formatDate(value, lang) {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(lang === "hu" ? "hu-HU" : "en-GB", {
    year: "numeric", month: "long", day: "numeric",
  });
}

/**
 * One journal entry, over whatever is behind it.
 *
 * Entries are short, so a modal beats a page of its own — but /journal/<id>
 * still resolves here, which keeps every entry shareable.
 */
export default function JournalModal() {
  const { t, lang } = useI18n();
  const { activePostId, closePost, openProduct } = useUi();
  const { getPost } = useJournal();
  const { byId } = useCatalog();

  const post = activePostId ? getPost(activePostId) : null;
  const coffees = (post?.product_ids ?? []).map((id) => byId?.get(id)).filter(Boolean);

  return (
    <AnimatePresence>
      {post && (
        <motion.div
          data-testid="journal-modal"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={closePost}
          className="fixed inset-0 z-[70] overflow-y-auto bg-ink/60 backdrop-blur-sm"
        >
          <motion.article
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.4, ease: MOTION.ease }}
            onClick={(event) => event.stopPropagation()}
            className="mx-auto my-8 w-[min(46rem,92vw)] overflow-hidden rounded-panel bg-cream shadow-2xl"
          >
            <div className="relative">
              {post.image && (
                <img src={post.image} alt="" className="h-56 w-full object-cover sm:h-72" />
              )}
              <button
                data-testid="journal-modal-close"
                onClick={closePost}
                aria-label={t("product.closeProduct")}
                className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-cream/90 text-olive shadow"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-7 sm:p-10">
              <div className="flex flex-wrap items-center gap-2">
                {postTags(post).map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-olive/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-label text-olive"
                  >
                    {t(`news.tags.${tag}`)}
                  </span>
                ))}
                {post.date && (
                  <span className="text-[11px] tracking-label text-olive/50">
                    {formatDate(post.date, lang)}
                  </span>
                )}
              </div>

              <h2 className="mt-4 font-display text-3xl font-medium leading-tight text-olive sm:text-4xl">
                {post.title?.[lang] ?? post.title?.en}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-olive/80">
                {post.blurb?.[lang] ?? post.blurb?.en}
              </p>
              <p className="mt-5 whitespace-pre-line text-[15px] leading-relaxed text-olive/75">
                {post.body?.[lang] ?? post.body?.en}
              </p>

              {coffees.length > 0 && (
                <div className="mt-8 border-t border-olive/15 pt-5" data-testid="journal-coffees">
                  <p className="text-[10px] font-semibold uppercase tracking-label text-olive/50">
                    {t("news.inThisEntry")}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {coffees.map((coffee) => (
                      <button
                        key={coffee.id}
                        data-testid={`journal-coffee-${coffee.id}`}
                        onClick={() => {
                          closePost();
                          openProduct(coffee.id);
                        }}
                        className="group inline-flex items-center gap-2 rounded-full border border-olive px-4 py-2 text-xs font-semibold text-olive transition-colors hover:bg-olive hover:text-cream"
                      >
                        {coffee.name?.[lang] ?? coffee.name?.en}
                        <ArrowRight
                          size={13}
                          className="transition-transform duration-300 group-hover:translate-x-0.5"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.article>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
