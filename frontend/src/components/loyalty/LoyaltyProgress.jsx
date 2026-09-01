import { Coffee } from "lucide-react";

import { BRAND } from "@/config/site";

/** The stamp row: filled cups for collected coffees, outlines for the rest. */
export default function LoyaltyProgress({
  stamps, required = BRAND.stampsRequired, animateLast = false, size = 28,
}) {
  return (
    <div className="flex items-center justify-center gap-3" data-testid="loyalty-progress">
      {Array.from({ length: required }).map((_, i) => {
        const filled = i < stamps;
        const isNewest = animateLast && i === stamps - 1;
        return (
          <div
            key={i}
            data-testid={`stamp-${i}-${filled ? "filled" : "empty"}`}
            style={{ width: size + 12, height: size + 12 }}
            className={`flex items-center justify-center rounded-full transition-colors ${
              filled ? "bg-olive text-cream" : "border-[1.5px] border-olive/35 text-olive/45"
            } ${isNewest ? "animate-stamp-pop" : ""}`}
          >
            <Coffee size={size} strokeWidth={filled ? 2 : 1.4} />
          </div>
        );
      })}
    </div>
  );
}
