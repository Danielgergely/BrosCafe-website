import Footer from "@/components/layout/Footer";
import Nav from "@/components/layout/Nav";

/**
 * Standard chrome for every page that is not the cinematic homepage:
 * solid header, centred reading column, shared footer.
 *
 * @param {"narrow"|"wide"} width  narrow for card/loyalty flows, wide for tables
 */
export default function PageShell({ children, width = "narrow" }) {
  const column = width === "wide" ? "max-w-6xl" : "max-w-md md:max-w-2xl";
  return (
    <div className="flex min-h-screen flex-col bg-cream">
      <Nav solid />
      <main className={`mx-auto w-full flex-1 px-6 pb-20 pt-24 ${column}`}>{children}</main>
      <Footer />
    </div>
  );
}
