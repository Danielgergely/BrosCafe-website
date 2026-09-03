import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";

import AppRoutes from "@/app/AppRoutes";
import ConsentBanner from "@/components/layout/ConsentBanner";
import Lightbox from "@/components/ui/Lightbox";
import ProductModal from "@/components/product/ProductModal";
import { I18nProvider } from "@/i18n";
import { CatalogProvider } from "@/lib/catalog";
import { CustomerAuthProvider } from "@/state/CustomerAuth";
import { StaffAuthProvider } from "@/state/StaffAuth";
import { UiProvider } from "@/state/UiStore";
import "@/styles/index.css";

/**
 * Provider order matters: i18n and the catalog are read by almost everything,
 * the auth sessions are independent of each other, and UI state sits innermost
 * because it is what the overlays below consume.
 *
 * ProductModal and Lightbox are mounted once here rather than per page, so a
 * product can open from any route without unmounting the page behind it.
 */
export default function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <CatalogProvider>
          <CustomerAuthProvider>
            <StaffAuthProvider>
              <UiProvider>
                <AppRoutes />
                <ProductModal />
                <Lightbox />
                <ConsentBanner />
                <Toaster position="top-center" richColors />
              </UiProvider>
            </StaffAuthProvider>
          </CustomerAuthProvider>
        </CatalogProvider>
      </I18nProvider>
    </BrowserRouter>
  );
}
