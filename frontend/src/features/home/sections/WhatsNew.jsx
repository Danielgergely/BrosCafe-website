import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { Link } from "react-router-dom";

import Reveal from "@/components/ui/Reveal";
import SectionLabel from "@/components/ui/SectionLabel";
import { MOTION, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { postTags, useJournal } from "@/lib/journal";
import { useUi } from "@/state/UiStore";

/** The homepage teases the newest few; the journal page holds everything. */
const ON_HOMEPAGE = 3;

/** The first post gets the wide tile. */
const isWide = (index) => index === 0;

function PostCard({ post, index, readLabel, onOpen }) {
  return (
    <Reveal delay={index * 0.07} className={isWide(index) ? "md:col-span-2" : ""}>
      <motion.article
        data-testid={`news-card-${post.id}`}
        onClick={onOpen}
        whileHover={{ y: -8 }}
        transition={{ duration: 0.4, ease: MOTION.ease }}
        className="group cursor-pointer overflow-hidden rounded-card bg-white shadow-card"
      >
        <div className={`overflow-hidden ${isWide(index) ? "h-64 md:h-80" : "h-56"}`}>
          <img
            src={post.image}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition-transform duration-700 ease-editorial group-hover:scale-[1.05]"
          />
        </div>
        <div className="p-7">
          <p className="text-[10px] font-semibold tracking-eyebrow text-olive/55">{post.tag}</p>
          <h3 className="mt-3 font-display text-2xl font-medium leading-snug text-olive md:text-[1.7rem]">
            {post.title}
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-olive/70">{post.blurb}</p>
          <span className="mt-5 inline-flex items-center gap-2 text-[11px] font-semibold tracking-label text-olive">
            {readLabel}
            <ArrowUpRight
              size={13}
              className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </span>
        </div>
      </motion.article>
    </Reveal>
  );
}

/**
 * Editorial news row. Posts come from the API (seeded from
 * backend/data/whats_new.json) so the homepage and /whats-new never disagree.
 */
export default function WhatsNew() {
  const { t, lang } = useI18n();
  const { posts } = useJournal();
  const { openPost } = useUi();

  if (posts.length === 0) return null;
  const latest = posts.slice(0, ON_HOMEPAGE);

  return (
    <section
      id="news"
      data-testid="news-section"
      className="mx-auto max-w-[1440px] px-6 py-28 md:px-12 md:py-40"
    >
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <SectionLabel section="news" title={t("home.news.label")} />
          <Reveal>
            <h2 className="font-display text-5xl font-medium leading-[1.02] tracking-tight text-olive md:text-7xl">
              {t("home.news.title")}
              <span className="italic">{t("home.news.punct")}</span>
            </h2>
          </Reveal>
        </div>
        <Reveal delay={0.1}>
          <p className="max-w-xs text-sm leading-relaxed text-olive/70">{t("home.news.body")}</p>
        </Reveal>
      </div>

      <div className="mt-16 grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-3">
        {latest.map((post, i) => (
          <PostCard
            key={post.id}
            index={i}
            readLabel={t("home.news.read")}
            onOpen={() => openPost(post.id)}
            post={{
              id: post.id,
              image: post.image,
              tag: postTags(post).map((key) => t(`news.tags.${key}`)).join(" · "),
              title: post.title?.[lang] ?? post.title?.en,
              blurb: post.blurb?.[lang] ?? post.blurb?.en,
            }}
          />
        ))}
      </div>

      <Reveal delay={0.2}>
        <Link
          data-testid="news-read-more"
          to={ROUTES.news}
          className="group mt-12 inline-flex items-center gap-2 rounded-full border border-olive px-6 py-3 text-[11px] font-semibold tracking-wide text-olive transition-all duration-300 hover:-translate-y-0.5 hover:bg-olive hover:text-cream"
        >
          {t("news.readMore")}
          <ArrowUpRight
            size={14}
            className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
          />
        </Link>
      </Reveal>
    </section>
  );
}
