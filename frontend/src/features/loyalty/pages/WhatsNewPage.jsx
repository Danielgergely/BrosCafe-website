import { useMemo, useState } from "react";
import { Search } from "lucide-react";

import PageShell from "@/components/layout/PageShell";
import { formatDate } from "@/components/journal/JournalModal";
import { JOURNAL_TAGS } from "@/config/site";
import { useI18n } from "@/i18n";
import { postTags, useJournal } from "@/lib/journal";
import { useUi } from "@/state/UiStore";

const ALL = "all";

export default function WhatsNewPage() {
  const { t, lang } = useI18n();
  const { posts } = useJournal();
  const { openPost } = useUi();
  const [query, setQuery] = useState("");
  const [tag, setTag] = useState(ALL);

  // Only offer chips for tags that actually appear, so the filter never leads
  // somewhere empty.
  const tagsInUse = useMemo(() => {
    const used = new Set(posts.flatMap(postTags));
    return JOURNAL_TAGS.filter((key) => used.has(key));
  }, [posts]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return posts.filter((post) => {
      if (tag !== ALL && !postTags(post).includes(tag)) return false;
      if (!needle) return true;
      const haystack = [post.title, post.blurb, post.body]
        .map((field) => `${field?.[lang] ?? ""} ${field?.en ?? ""}`)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [posts, query, tag, lang]);

  const chip = (active) =>
    `rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
      active ? "bg-olive text-cream" : "border border-line bg-white text-muted hover:text-olive"
    }`;

  return (
    <PageShell>
      <h1 className="font-display text-4xl text-ink">{t("news.title")}</h1>

      <div className="mt-6 flex items-center gap-2 rounded-card border border-line bg-white px-4">
        <Search size={18} className="text-muted" />
        <input
          data-testid="journal-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("news.searchPlaceholder")}
          className="h-12 flex-1 bg-transparent text-ink outline-none placeholder:text-muted"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2" data-testid="journal-tags">
        <button onClick={() => setTag(ALL)} className={chip(tag === ALL)}>
          {t("news.all")}
        </button>
        {tagsInUse.map((key) => (
          <button
            key={key}
            data-testid={`journal-tag-${key}`}
            onClick={() => setTag(key === tag ? ALL : key)}
            className={chip(tag === key)}
          >
            {t(`news.tags.${key}`)}
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <p className="mt-10 text-sm text-muted" data-testid="journal-empty">
          {t("news.noResults")}
        </p>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2" data-testid="whats-new-list">
        {visible.map((post) => (
          <article
            key={post.id}
            data-testid={`journal-card-${post.id}`}
            onClick={() => openPost(post.id)}
            className="group flex cursor-pointer flex-col overflow-hidden rounded-panel border border-line bg-white shadow-card transition-transform duration-300 hover:-translate-y-1"
          >
            {post.image && (
              <div className="h-44 overflow-hidden">
                <img
                  src={post.image}
                  alt=""
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
            )}
            <div className="flex flex-1 flex-col p-6">
              <div className="flex flex-wrap items-center gap-2">
                {postTags(post).map((key) => (
                  <span
                    key={key}
                    className="text-[10px] font-semibold uppercase tracking-label text-olive"
                  >
                    {t(`news.tags.${key}`)}
                  </span>
                ))}
                {post.date && (
                  <span className="text-[10px] tracking-label text-muted">
                    {formatDate(post.date, lang)}
                  </span>
                )}
              </div>
              <h2 className="mt-2 font-display text-2xl text-ink">
                {post.title?.[lang] ?? post.title?.en}
              </h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-muted">
                {post.blurb?.[lang] ?? post.blurb?.en}
              </p>
              <span className="mt-4 text-[11px] font-semibold tracking-label text-olive">
                {t("news.readEntry")} →
              </span>
            </div>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
