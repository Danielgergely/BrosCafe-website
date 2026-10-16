import { Suspense, lazy, useEffect } from "react";
import { motion } from "framer-motion";
import { Coffee } from "lucide-react";
import { Route, Routes, useLocation, useParams } from "react-router-dom";

import { MOTION, ROUTES, sectionOf } from "@/config/site";
import { CustomerOnly, StaffOnly } from "@/app/RouteGuards";
import HomePage from "@/features/home/HomePage";
import GamePage from "@/features/game/GamePage";
import HelpPage from "@/features/legal/pages/HelpPage";
import PrivacyPage from "@/features/legal/pages/PrivacyPage";
import AccountPage from "@/features/loyalty/pages/AccountPage";
import ContactPage from "@/features/loyalty/pages/ContactPage";
import LoyaltyCardPage from "@/features/loyalty/pages/LoyaltyCardPage";
import LoyaltyPage from "@/features/loyalty/pages/LoyaltyPage";
import MenuPage from "@/features/loyalty/pages/MenuPage";
import ShopPage from "@/features/loyalty/pages/ShopPage";
import VerifyMagicPage from "@/features/loyalty/pages/VerifyMagicPage";
import WhatsNewPage from "@/features/loyalty/pages/WhatsNewPage";
import StaffLoginPage from "@/features/staff/pages/StaffLoginPage";
import { useCatalog } from "@/lib/catalog";
import { useUi } from "@/state/UiStore";

/**
 * The staff screens pull in the two heaviest dependencies — recharts for the
 * dashboard and html5-qrcode for the scanner. Customers never open them, so
 * they are split out of the main bundle.
 */
const DashboardPage = lazy(() => import("@/features/staff/pages/DashboardPage"));
const ScannerPage = lazy(() => import("@/features/staff/pages/ScannerPage"));

function ChunkLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <Coffee size={40} className="animate-pulse text-olive" />
    </div>
  );
}

/**
 * /product/:id opens the shared modal over the page the product lives on: its
 * menu tab, or the shop for merch. Until the catalog arrives the section is
 * unknown, and the menu's first tab stands in.
 */
function ProductDeepLink() {
  const { id } = useParams();
  const { openProduct } = useUi();
  const { get } = useCatalog();
  const product = get(id);

  useEffect(() => {
    openProduct(id);
  }, [id, openProduct]);

  if (product?.cat === "merch") return <ShopPage />;
  return <MenuPage section={product ? sectionOf(product) : undefined} />;
}

/**
 * What counts as "a different page" for the enter animation and the scroll
 * reset. The menu's tabs are one page: switching from /menu/cold to
 * /menu/sweet should swap the grid, not fade the whole screen and jump to top.
 */
function pageKey(pathname) {
  return pathname.startsWith(`${ROUTES.menu}/`) ? ROUTES.menu : pathname;
}

/** /journal/:id opens the entry over the journal page, so posts stay shareable. */
function JournalDeepLink() {
  const { id } = useParams();
  const { openPost } = useUi();

  useEffect(() => {
    openPost(id);
  }, [id, openPost]);

  return <WhatsNewPage />;
}

export default function AppRoutes() {
  const location = useLocation();
  const page = pageKey(location.pathname);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [page]);

  return (
    // Enter-only transition. An exit animation here used to trap redirects
    // (magic-link sign-in) on the outgoing screen.
    <motion.div
      key={page}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION.page, ease: MOTION.ease }}
    >
      <Routes location={location}>
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.loyalty} element={<LoyaltyPage />} />
        <Route path={ROUTES.menu} element={<MenuPage />} />
        <Route path={ROUTES.menuSection(":section")} element={<MenuPage />} />
        <Route path={ROUTES.news} element={<WhatsNewPage />} />
        <Route path={ROUTES.shop} element={<ShopPage />} />
        <Route path="/product/:id" element={<ProductDeepLink />} />
        <Route path="/journal/:id" element={<JournalDeepLink />} />
        <Route path={ROUTES.contact} element={<ContactPage />} />
        <Route path={ROUTES.privacy} element={<PrivacyPage />} />
        <Route path={ROUTES.help} element={<HelpPage />} />
        <Route path={ROUTES.game} element={<GamePage />} />
        <Route path="/auth/verify" element={<VerifyMagicPage />} />
        <Route path="/card/:code" element={<LoyaltyCardPage />} />
        <Route
          path={ROUTES.account}
          element={
            <CustomerOnly>
              <AccountPage />
            </CustomerOnly>
          }
        />
        <Route path={ROUTES.login} element={<StaffLoginPage />} />
        <Route
          path={ROUTES.staff}
          element={
            <StaffOnly>
              <Suspense fallback={<ChunkLoading />}>
                <ScannerPage />
              </Suspense>
            </StaffOnly>
          }
        />
        <Route
          path={ROUTES.admin}
          element={
            <StaffOnly adminOnly>
              <Suspense fallback={<ChunkLoading />}>
                <DashboardPage />
              </Suspense>
            </StaffOnly>
          }
        />
        {/* Anything unknown lands on the homepage. */}
        <Route path="*" element={<HomePage />} />
      </Routes>
    </motion.div>
  );
}
