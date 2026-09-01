import { useEffect, useState } from "react";

import PageShell from "@/components/layout/PageShell";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";

export default function WhatsNewPage() {
  const { t, lang } = useI18n();
  const [posts, setPosts] = useState([]);

  useEffect(() => {
    let active = true;
    api
      .get("/whats-new")
      .then(({ data }) => active && setPosts(Array.isArray(data) ? data : []))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  return (
    <PageShell>
      <h1 className="font-display text-4xl text-ink">{t("news.title")}</h1>
      <div className="mt-6 space-y-8" data-testid="whats-new-list">
        {posts.map((post) => (
          <article
            key={post.id}
            className="animate-fade-up overflow-hidden rounded-panel border border-line bg-white shadow-card"
          >
            <img src={post.image} alt="" className="h-52 w-full object-cover" />
            <div className="p-6">
              <p className="text-[11px] font-semibold uppercase tracking-label text-olive">
                {t(`news.tags.${post.kind}`)}
              </p>
              <h2 className="mt-1 font-display text-2xl text-ink">
                {post.title?.[lang] ?? post.title?.en}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {post.body?.[lang] ?? post.body?.en}
              </p>
            </div>
          </article>
        ))}
      </div>
    </PageShell>
  );
}
