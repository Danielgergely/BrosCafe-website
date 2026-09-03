import { Coffee, X } from "lucide-react";

import palette from "@/config/palette";

/**
 * recharts needs literal colours, so it reads the shared palette rather than
 * the Tailwind classes the rest of the app uses.
 */
export const CHART = {
  olive: palette.olive,
  oliveSoft: palette.oliveSoft,
  line: palette.creamDark,
  muted: palette.muted,
  ink: palette.ink,
  warn: palette.warn,
  alert: palette.alert,
};

export const chartTooltipProps = {
  contentStyle: {
    background: "#fff",
    border: `1px solid ${CHART.line}`,
    borderRadius: 12,
    fontSize: 12,
  },
  cursor: { fill: "rgba(102,115,74,0.06)" },
};

export const axisProps = { tick: { fontSize: 11, fill: CHART.muted } };

export function StatTile({ value, label, testId, onClick, hint }) {
  const body = (
    <>
      <p className="font-display text-4xl leading-none text-ink">{value}</p>
      <p className="mt-2 text-sm text-muted">{label}</p>
      {hint && <p className="mt-1 text-xs font-medium text-olive">{hint}</p>}
    </>
  );
  const shell = "rounded-card border border-line bg-white p-5 shadow-card";

  // A tile that leads somewhere is a button, so it is reachable by keyboard
  // and announces itself as interactive rather than looking like plain text.
  if (!onClick) {
    return <div data-testid={testId} className={shell}>{body}</div>;
  }
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      className={`${shell} w-full text-left transition-colors hover:border-olive`}
    >
      {body}
    </button>
  );
}

export function SectionCard({ title, children, className = "" }) {
  return (
    <div className={`rounded-card border border-line bg-white p-6 shadow-card ${className}`}>
      {title && <h3 className="mb-4 font-display text-xl text-ink">{title}</h3>}
      {children}
    </div>
  );
}

export function Loading() {
  return (
    <div className="flex items-center justify-center py-20">
      <Coffee size={34} className="animate-pulse text-olive" />
    </div>
  );
}

export function Modal({ title, children, onClose, width = "max-w-md" }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6"
      onClick={onClose}
    >
      <div
        className={`max-h-[90vh] w-full ${width} overflow-y-auto rounded-panel bg-white p-8`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h2 className="font-display text-2xl text-ink">{title}</h2>
          <button onClick={onClose} className="text-muted">
            <X size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export const adminInputClass =
  "h-12 w-full rounded-card border border-line bg-white px-4 text-ink outline-none focus:border-olive focus:ring-2 focus:ring-olive/30";
