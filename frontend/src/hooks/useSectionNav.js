import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ROUTES } from "@/config/site";
import { scrollToSection } from "@/hooks/useLenis";

/** How long to wait for the homepage to mount before scrolling to an anchor. */
const NAVIGATE_THEN_SCROLL_MS = 650;

/**
 * Resolves a nav entry — either `{ to }` (a route) or `{ anchor }` (a homepage
 * section) — into a single click handler. Shared by the header and the footer so
 * the "go home first, then scroll" behaviour lives in one place.
 */
export function useSectionNav() {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return useCallback(
    (link) => {
      if (link.to) {
        navigate(link.to);
        return;
      }
      if (pathname !== ROUTES.home) {
        navigate(ROUTES.home);
        setTimeout(() => scrollToSection(link.anchor), NAVIGATE_THEN_SCROLL_MS);
        return;
      }
      scrollToSection(link.anchor);
    },
    [navigate, pathname],
  );
}
