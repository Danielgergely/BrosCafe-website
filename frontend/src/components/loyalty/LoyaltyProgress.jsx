import { Coffee } from "lucide-react";

import { BRAND } from "@/config/site";

/** Longer cards wrap instead of shrinking; ten cups in one line is unreadable
 *  on a phone, and squeezing them edge to edge looks like a bug. */
const MAX_PER_ROW = 5;

/** The stamp row: filled cups for collected coffees, outlines for the rest. */
export default function LoyaltyProgress({
  stamps, required = BRAND.stampsRequired, animateLast = false, size = 28,
}) {
  // Balance the rows rather than leaving a stray cup on its own: ten becomes
  // 5 + 5, and eight becomes 4 + 4 rather than 5 + 3.
  const rows = Math.ceil(required / MAX_PER_ROW);
  const perRow = Math.ceil(required / rows);
  const cell = size + 12;

  return (
    <div
      data-testid="loyalty-progress"
      className="mx-auto grid w-fit gap-2 sm:gap-3"
      style={{ gridTemplateColumns: `repeat(${perRow}, ${cell}px)` }}
    >
      {Array.from({ length: required }).map((_, i) => {
        const filled = i < stamps;
        const isNewest = animateLast && i === stamps - 1;
        return (
          <div
            key={i}
            data-testid={`stamp-${i}-${filled ? "filled" : "empty"}`}
            style={{ width: cell, height: cell }}
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
