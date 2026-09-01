import { AnimatePresence, motion } from "framer-motion";
import { Coffee, Trash2, X } from "lucide-react";

import { MOTION } from "@/config/site";
import { useI18n } from "@/i18n";
import { localize, useCatalog } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { useUi } from "@/state/UiStore";

/** Floating cup button plus the slide-in drawer listing the visitor's picks. */
export default function DayList() {
  const { t, lang } = useI18n();
  const { get } = useCatalog();
  const { day, dayOpen, setDayOpen, removeFromDay, clearDay } = useUi();

  const items = day.map((id) => localize(get(id), lang)).filter(Boolean);

  return (
    <>
      <AnimatePresence>
        {day.length > 0 && !dayOpen && (
          <motion.button
            data-testid="day-fab"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 22 }}
            onClick={() => setDayOpen(true)}
            aria-label={t("day.open")}
            className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-olive text-cream shadow-[0_14px_36px_rgba(102,115,74,0.45)] transition-transform duration-300 hover:-translate-y-1"
          >
            <Coffee size={20} strokeWidth={1.6} />
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-cream text-[10px] font-bold text-olive">
              {day.length}
            </span>
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {dayOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[75] bg-olive/40 backdrop-blur-sm"
              onClick={() => setDayOpen(false)}
            />
            <motion.aside
              data-testid="day-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.5, ease: MOTION.ease }}
              className="fixed right-0 top-0 z-[76] flex h-full w-full max-w-sm flex-col bg-cream shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-olive/10 px-7 py-6">
                <div>
                  <p className="text-[10px] font-semibold tracking-eyebrow text-olive/55">
                    {t("day.title")}
                  </p>
                  <p className="mt-1 font-display text-2xl font-medium text-olive">{t("day.sub")}</p>
                </div>
                <button
                  data-testid="day-close"
                  aria-label={t("day.close")}
                  onClick={() => setDayOpen(false)}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-olive/25 text-olive transition-colors duration-300 hover:bg-olive hover:text-cream"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-7 py-6">
                {items.length === 0 ? (
                  <p className="text-sm text-olive/60">{t("day.empty")}</p>
                ) : (
                  <ul className="space-y-4">
                    <AnimatePresence>
                      {items.map((product) => (
                        <motion.li
                          key={product.id}
                          layout
                          initial={{ opacity: 0, y: 12 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, x: 40 }}
                          className="flex items-center gap-4 rounded-card bg-white p-3 shadow-card"
                        >
                          <img
                            src={product.images?.[0]}
                            alt=""
                            className="h-14 w-14 rounded-xl object-cover"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-display text-lg font-medium text-olive">
                              {product.name}
                            </p>
                            <p className="text-xs text-olive/60">{formatPrice(product.price_huf)}</p>
                          </div>
                          <button
                            data-testid={`day-remove-${product.id}`}
                            aria-label={t("day.remove")}
                            onClick={() => removeFromDay(product.id)}
                            className="text-olive/40 transition-colors duration-300 hover:text-olive"
                          >
                            <Trash2 size={15} />
                          </button>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                )}
              </div>

              {items.length > 0 && (
                <div className="border-t border-olive/10 px-7 py-5">
                  <button
                    data-testid="day-clear"
                    onClick={clearDay}
                    className="text-[11px] font-semibold tracking-label text-olive/60 transition-colors duration-300 hover:text-olive"
                  >
                    {t("day.clear")}
                  </button>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
