import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

import Reveal from "@/components/ui/Reveal";
import SectionLabel from "@/components/ui/SectionLabel";
import { MOTION, ROUTES } from "@/config/site";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";

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
          <h3 className="font-display text-2xl font-medium leading-snug text-olive md:text-[1.7rem]">
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
  const navigate = useNavigate();
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

  if (posts.length === 0) return null;

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
        {posts.map((post, i) => (
          <PostCard
            key={post.id}
            index={i}
            readLabel={t("home.news.read")}
            onOpen={() => navigate(ROUTES.news)}
            post={{
              id: post.id,
              image: post.image,
              title: post.title?.[lang] ?? post.title?.en,
              blurb: post.blurb?.[lang] ?? post.blurb?.en,
            }}
          />
        ))}
      </div>
    </section>
  );
}
