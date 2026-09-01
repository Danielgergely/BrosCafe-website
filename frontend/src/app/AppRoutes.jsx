import { Suspense, lazy, useEffect } from "react";
import { motion } from "framer-motion";
import { Coffee } from "lucide-react";
import { Route, Routes, useLocation, useParams } from "react-router-dom";

import { MOTION, ROUTES } from "@/config/site";
import { CustomerOnly, StaffOnly } from "@/app/RouteGuards";
import HomePage from "@/features/home/HomePage";
import AccountPage from "@/features/loyalty/pages/AccountPage";
import ContactPage from "@/features/loyalty/pages/ContactPage";
import LoyaltyCardPage from "@/features/loyalty/pages/LoyaltyCardPage";
import LoyaltyPage from "@/features/loyalty/pages/LoyaltyPage";
import MenuPage from "@/features/loyalty/pages/MenuPage";
import OpeningPage from "@/features/loyalty/pages/OpeningPage";
import ShopPage from "@/features/loyalty/pages/ShopPage";
import VerifyMagicPage from "@/features/loyalty/pages/VerifyMagicPage";
import WhatsNewPage from "@/features/loyalty/pages/WhatsNewPage";
import StaffLoginPage from "@/features/staff/pages/StaffLoginPage";
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

/** /product/:id opens the shared modal over the collection page. */
function ProductDeepLink() {
  const { id } = useParams();
  const { openProduct } = useUi();

  useEffect(() => {
    openProduct(id);
  }, [id, openProduct]);

  return <ShopPage />;
}

export default function AppRoutes() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    // Enter-only transition. An exit animation here used to trap redirects
    // (magic-link sign-in) on the outgoing screen.
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: MOTION.page, ease: MOTION.ease }}
    >
      <Routes location={location}>
        <Route path={ROUTES.home} element={<HomePage />} />
        <Route path={ROUTES.loyalty} element={<LoyaltyPage />} />
        <Route path={ROUTES.menu} element={<MenuPage />} />
        <Route path={ROUTES.news} element={<WhatsNewPage />} />
        <Route path={ROUTES.shop} element={<ShopPage />} />
        <Route path="/product/:id" element={<ProductDeepLink />} />
        <Route path={ROUTES.contact} element={<ContactPage />} />
        <Route path={ROUTES.opening} element={<OpeningPage />} />
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
