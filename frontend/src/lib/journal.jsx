import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";

/**
 * The journal. Fetched once and shared, the same way the catalog is, because
 * three places need it at the same time: the homepage row, the journal page,
 * and the link a product shows to the entry written about it.
 *
 * The coffee↔entry link is stored only on the entry (`product_ids`). The
 * reverse lookup is derived here, so the two directions cannot drift apart.
 */
const JournalContext = createContext(null);

/** Entries written before tags existed still have the old single `kind`. */
export const postTags = (post) =>
  post?.tags?.length ? post.tags : post?.kind ? [post.kind] : [];

export function JournalProvider({ children }) {
  const [posts, setPosts] = useState([]);
  const [status, setStatus] = useState("loading");

  useEffect(() => {
    let active = true;
    api
      .get("/whats-new")
      .then(({ data }) => {
        if (!active) return;
        setPosts(Array.isArray(data) ? data : []);
        setStatus("ready");
      })
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => {
    const byId = new Map(posts.map((post) => [post.id, post]));
    const byProduct = new Map();
    for (const post of posts) {
      for (const productId of post.product_ids ?? []) {
        byProduct.set(productId, [...(byProduct.get(productId) ?? []), post]);
      }
    }
    return {
      posts,
      status,
      getPost: (id) => byId.get(id) ?? null,
      // Newest first, because the API already sorts that way.
      postsFor: (productId) => byProduct.get(productId) ?? [],
      tagsInUse: [...new Set(posts.flatMap(postTags))],
    };
  }, [posts, status]);

  return <JournalContext.Provider value={value}>{children}</JournalContext.Provider>;
}

export function useJournal() {
  const context = useContext(JournalContext);
  if (!context) throw new Error("useJournal must be used inside <JournalProvider>");
  return context;
}
