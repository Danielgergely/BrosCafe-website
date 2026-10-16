import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { FEATURED, sectionOf } from "@/config/site";
import { api } from "@/lib/api";

/**
 * The product catalog. MongoDB is the single source of truth (seeded from
 * backend/data/catalog.json); this module fetches it once and exposes it as
 * ordinary React state.
 *
 * Products arrive with bilingual fields shaped `{ en, hu }`. `localize()`
 * flattens one product for a language so components never branch on `lang`.
 */
const CatalogContext = createContext(null);

const LOCALIZED_FIELDS = ["name", "desc", "tip", "ingredients", "behind", "sizes", "material"];

export function localize(product, lang) {
  if (!product) return null;
  const flat = { ...product };
  for (const field of LOCALIZED_FIELDS) {
    const value = product[field];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flat[field] = value[lang] ?? value.en;
    }
  }
  return flat;
}

export function CatalogProvider({ children }) {
  const [products, setProducts] = useState([]);
  const [status, setStatus] = useState("loading"); // loading | ready | error

  useEffect(() => {
    let active = true;
    api
      .get("/products")
      .then(({ data }) => {
        if (!active) return;
        setProducts(Array.isArray(data) ? data : []);
        setStatus("ready");
      })
      .catch(() => active && setStatus("error"));
    return () => {
      active = false;
    };
  }, []);

  const value = useMemo(() => {
    const byId = new Map(products.map((p) => [p.id, p]));
    return {
      products,
      status,
      byId,
      get: (id) => byId.get(id) ?? null,
      inCategory: (cat) => products.filter((p) => p.cat === cat),
      /** One menu section's products, in menu order. Merch never has a section. */
      inSection: (section) =>
        products.filter((p) => p.cat !== "merch" && sectionOf(p) === section),
      /** Same category first, then everything else — never the product itself. */
      related: (product, count = 3) => {
        if (!product) return [];
        const others = products.filter((p) => p.id !== product.id);
        const same = others.filter((p) => p.cat === product.cat);
        const rest = others.filter((p) => p.cat !== product.cat);
        return [...same, ...rest].slice(0, count);
      },
      /** Config-driven feature rows, filtered to what the catalog actually has. */
      featured: (key) => (FEATURED[key] ?? []).map((id) => byId.get(id)).filter(Boolean),
    };
  }, [products, status]);

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const context = useContext(CatalogContext);
  if (!context) throw new Error("useCatalog must be used inside <CatalogProvider>");
  return context;
}

/** One product, already flattened for the active language. */
export function useProduct(id, lang) {
  const { get } = useCatalog();
  return useMemo(() => localize(get(id), lang), [get, id, lang]);
}
