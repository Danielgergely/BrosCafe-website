import markCream from "@/assets/mark-cream.png";
import markOlive from "@/assets/mark-olive.png";

/** Wordmark plus roundel, for the staff and admin headers. */
export default function BrosLogo({ light = false, className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`} data-testid="bros-logo">
      <img src={light ? markCream : markOlive} alt="" className="h-9 w-auto" />
      <span className={`font-display text-xl leading-none tracking-tight ${light ? "text-cream" : "text-ink"}`}>
        Bros Cafe
      </span>
    </div>
  );
}
