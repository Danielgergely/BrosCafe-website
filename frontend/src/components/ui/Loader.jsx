import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Coffee } from "lucide-react";

import Steam from "@/components/ui/Steam";
import { BRAND, MOTION } from "@/config/site";

/** Brief coffee-steam intro over the homepage. */
export default function Loader() {
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDone(true), MOTION.loaderMs);
    return () => clearTimeout(timer);
  }, []);

  return (
    <AnimatePresence>
      {!done && (
        <motion.div
          data-testid="loader"
          exit={{ y: "-100%" }}
          transition={{ duration: 0.7, ease: MOTION.ease }}
          className="fixed inset-0 z-[95] flex flex-col items-center justify-center bg-cream"
        >
          <div className="relative text-olive">
            <Steam className="mb-1 justify-center gap-1.5" />
            <Coffee size={34} strokeWidth={1.4} />
          </div>
          <motion.p
            initial={{ opacity: 0, letterSpacing: "0.2em" }}
            animate={{ opacity: 1, letterSpacing: "0.45em" }}
            transition={{ duration: 0.9, ease: "easeOut" }}
            className="mt-5 font-display text-sm font-semibold text-olive"
          >
            {BRAND.name}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
