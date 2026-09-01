import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

/**
 * Per-visitor UI state: favourites, the "my day" list, and which overlay is open.
 * Language lives in src/i18n; products live in src/lib/catalog. Nothing here
 * touches the network.
 */
const UiContext = createContext(null);

const FAVOURITES_KEY = "bros-favs";
const DAY_KEY = "bros-day";

function readList(key) {
  try {
    const parsed = JSON.parse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function useStoredList(key) {
  const [items, setItems] = useState(() => readList(key));
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      /* private browsing */
    }
  }, [key, items]);
  return [items, setItems];
}

export function UiProvider({ children }) {
  const [favourites, setFavourites] = useStoredList(FAVOURITES_KEY);
  const [day, setDay] = useStoredList(DAY_KEY);
  const [activeProductId, setActiveProductId] = useState(null);
  const [closingProductId, setClosingProductId] = useState(null);
  const [lightbox, setLightbox] = useState(null); // { images, index }
  const [dayOpen, setDayOpen] = useState(false);

  const overlayOpen = Boolean(activeProductId) || Boolean(lightbox) || dayOpen;
  useEffect(() => {
    document.body.style.overflow = overlayOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [overlayOpen]);

  const toggleFavourite = useCallback(
    (id) => setFavourites((f) => (f.includes(id) ? f.filter((x) => x !== id) : [...f, id])),
    [setFavourites],
  );

  const addToDay = useCallback(
    (id) => setDay((d) => (d.includes(id) ? d : [...d, id])),
    [setDay],
  );
  const removeFromDay = useCallback((id) => setDay((d) => d.filter((x) => x !== id)), [setDay]);
  const clearDay = useCallback(() => setDay([]), [setDay]);

  const openProduct = useCallback((id) => {
    setClosingProductId(null);
    setActiveProductId(id);
  }, []);

  /**
   * Keep the id around briefly while the shared-layout animation flies back to
   * the card, so the card stays hidden until the modal has finished closing.
   */
  const closeProduct = useCallback(() => {
    setActiveProductId((id) => {
      if (id) {
        setClosingProductId(id);
        setTimeout(() => setClosingProductId(null), 500);
      }
      return null;
    });
  }, []);

  const openLightbox = useCallback((images, index = 0) => setLightbox({ images, index }), []);
  const closeLightbox = useCallback(() => setLightbox(null), []);
  const moveLightbox = useCallback(
    (step) =>
      setLightbox((current) =>
        current
          ? { ...current, index: (current.index + step + current.images.length) % current.images.length }
          : current,
      ),
    [],
  );

  const value = useMemo(
    () => ({
      favourites, toggleFavourite,
      day, addToDay, removeFromDay, clearDay, dayOpen, setDayOpen,
      activeProductId, closingProductId, openProduct, closeProduct,
      lightbox, openLightbox, closeLightbox, moveLightbox,
    }),
    [favourites, toggleFavourite, day, addToDay, removeFromDay, clearDay, dayOpen,
     activeProductId, closingProductId, openProduct, closeProduct,
     lightbox, openLightbox, closeLightbox, moveLightbox],
  );

  return <UiContext.Provider value={value}>{children}</UiContext.Provider>;
}

export function useUi() {
  const context = useContext(UiContext);
  if (!context) throw new Error("useUi must be used inside <UiProvider>");
  return context;
}
