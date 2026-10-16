import { useRef, useState } from "react";
import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "framer-motion";
import { ArrowUpRight, ChevronRight, Coffee, Gamepad2, LogOut, Menu, User, X } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import LanguageToggle from "@/components/layout/LanguageToggle";
import { BRAND, MOTION, NAV_LINKS, ROUTES } from "@/config/site";
import { useSectionNav } from "@/hooks/useSectionNav";
import { useI18n } from "@/i18n";
import { useCustomer } from "@/state/CustomerAuth";

/** Clicks on the logo needed to fire the easter egg. */
const EASTER_EGG_CLICKS = 5;

function CoffeeBurst() {
  return (
    <span className="pointer-events-none absolute -top-3 left-1/2 -translate-x-1/2" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 1, y: 0, x: 0, scale: 0.5 }}
          animate={{ opacity: 0, y: -34 - i * 6, x: (i - 2) * 12, scale: 1 }}
          transition={{ duration: 0.9, delay: i * 0.05, ease: "easeOut" }}
          className="absolute text-olive"
        >
          <Coffee size={13} strokeWidth={1.6} />
        </motion.span>
      ))}
    </span>
  );
}

/**
 * The single site header, used by the homepage and every loyalty page.
 * @param {boolean} solid force the opaque treatment (pages without a hero image)
 */
export default function Nav({ solid = false }) {
  const { t } = useI18n();
  const { member, signOut } = useCustomer();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const go = useSectionNav();
  const { scrollY } = useScroll();

  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [burst, setBurst] = useState(0);
  const logoClicks = useRef(0);

  useMotionValueEvent(scrollY, "change", (value) => setScrolled(value > 60));
  const opaque = solid || scrolled;

  const onNavigate = (link) => {
    setMenuOpen(false);
    go(link);
  };

  const onLogoClick = () => {
    logoClicks.current += 1;
    if (logoClicks.current % EASTER_EGG_CLICKS === 0) setBurst((n) => n + 1);
    setMenuOpen(false);
    if (pathname !== ROUTES.home) navigate(ROUTES.home);
    else go({ anchor: "home" });
  };

  // A diamond member has no card to fill, so a fraction would read "0/0".
  const stampLabel = member
    ? (member.always_free ? "\u221E" : `${member.stamps}/${member.stamps_required ?? BRAND.stampsRequired}`)
    : null;
  const textColour = opaque ? "text-olive" : "text-cream";

  return (
    <>
      <motion.header
        data-testid="main-nav"
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.9, delay: pathname === ROUTES.home ? 1.5 : 0.1, ease: MOTION.ease }}
        className={`fixed inset-x-0 top-0 z-50 transition-[background-color,box-shadow] duration-500 ${
          opaque
            ? "bg-cream/75 shadow-[0_1px_0_rgba(102,115,74,0.12)] backdrop-blur-xl"
            : "bg-transparent"
        }`}
      >
        <nav className="mx-auto flex max-w-[1440px] items-center justify-between px-6 py-5 md:px-12">
          <button
            data-testid="nav-logo"
            onClick={onLogoClick}
            aria-label={t("nav.backToTop")}
            className={`relative whitespace-nowrap font-display text-xl font-semibold tracking-wide transition-colors duration-500 ${textColour}`}
          >
            {BRAND.name}
            {burst > 0 && <CoffeeBurst key={burst} />}
          </button>

          {/* Hungarian labels run long, so the full row only appears at xl;
              below that the full-screen menu takes over. */}
          <ul className="hidden items-center gap-5 xl:flex">
            {NAV_LINKS.map((link) => (
              <li key={link.key}>
                <button
                  data-testid={`nav-link-${link.key}`}
                  onClick={() => onNavigate(link)}
                  className={`link-underline whitespace-nowrap text-[11px] font-medium tracking-wide transition-colors duration-500 ${textColour}`}
                >
                  {t(`nav.${link.key}`)}
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Sits beside the card because it belongs to the same errand:
                something to do while the coffee is being made. Hidden from
                signed-out visitors, who have no leaderboard to appear on and
                already have plenty competing for their attention up here.
                On a narrow phone it would crowd out the menu button, so below
                sm it moves into the menu instead. */}
            {member && (
              <Link
                data-testid="nav-game"
                to={ROUTES.game}
                aria-label={t("game.title")}
                title={t("game.title")}
                className={`hidden items-center rounded-full border p-2 transition-all duration-300 hover:-translate-y-0.5 sm:flex ${
                  opaque ? "border-olive/30 text-olive" : "border-cream/40 text-cream"
                }`}
              >
                <Gamepad2 size={15} strokeWidth={1.8} />
              </Link>
            )}

            <button
              data-testid="nav-account"
              onClick={() => navigate(member ? ROUTES.account : ROUTES.loyalty)}
              aria-label={t(member ? "nav.accountSignedIn" : "nav.accountGuest")}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-[11px] font-semibold tracking-wide transition-all duration-300 hover:-translate-y-0.5 sm:px-3.5 ${
                opaque ? "border-olive/30 text-olive" : "border-cream/40 text-cream"
              }`}
            >
              {member ? (
                <>
                  <Coffee size={13} strokeWidth={1.8} />
                  {stampLabel}
                </>
              ) : (
                <User size={15} strokeWidth={1.8} />
              )}
            </button>

            <LanguageToggle light={!opaque} />

            <Link
              data-testid="nav-loyalty-cta"
              to={ROUTES.loyalty}
              className={`group hidden items-center gap-2 whitespace-nowrap rounded-full px-5 py-2.5 text-[11px] font-semibold tracking-wide transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgba(102,115,74,0.25)] sm:inline-flex ${
                opaque ? "bg-olive text-cream" : "bg-cream text-olive"
              }`}
            >
              {t("nav.cta")}
              <ArrowUpRight
                size={14}
                className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
              />
            </Link>

            <button
              data-testid="mobile-menu-button"
              onClick={() => setMenuOpen(true)}
              aria-label={t("nav.openMenu")}
              className={`transition-colors duration-500 xl:hidden ${textColour}`}
            >
              <Menu size={26} strokeWidth={1.5} />
            </button>
          </div>
        </nav>
      </motion.header>

      <AnimatePresence>
        {menuOpen && (
          <motion.div
            data-testid="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="fixed inset-0 z-[60] flex flex-col bg-cream"
          >
            <div className="flex items-center justify-between px-6 py-5">
              <span className="font-display text-xl font-semibold tracking-wide text-olive">
                {BRAND.name}
              </span>
              <button
                data-testid="mobile-menu-close"
                onClick={() => setMenuOpen(false)}
                aria-label={t("nav.closeMenu")}
                className="text-olive"
              >
                <X size={28} strokeWidth={1.5} />
              </button>
            </div>

            {/* Each entry is a full-width row with a chevron, so it reads as
                something to tap rather than a column of large words. */}
            <div className="flex-1 overflow-y-auto px-6 pb-6">
              <ul className="border-t border-olive/15" data-testid="mobile-nav-list">
                {NAV_LINKS.map((link, i) => {
                  const current = link.to ? pathname.startsWith(link.to) : pathname === ROUTES.home && link.anchor === "home";
                  return (
                    <motion.li
                      key={link.key}
                      initial={{ opacity: 0, y: 16 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ delay: 0.05 + i * 0.05, duration: 0.45, ease: MOTION.ease }}
                      className="border-b border-olive/15"
                    >
                      <button
                        data-testid={`mobile-nav-link-${link.key}`}
                        onClick={() => onNavigate(link)}
                        aria-current={current ? "page" : undefined}
                        className="group flex w-full items-center gap-4 py-4 text-left active:bg-olive/5"
                      >
                        <span className="w-6 text-[11px] font-semibold tabular-nums text-olive/40">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span className="flex-1 font-display text-3xl font-medium text-olive">
                          {t(`nav.${link.key}`)}
                        </span>
                        <span
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors ${
                            current
                              ? "border-olive bg-olive text-cream"
                              : "border-olive/25 text-olive group-active:bg-olive group-active:text-cream"
                          }`}
                        >
                          <ChevronRight size={18} strokeWidth={1.8} />
                        </span>
                      </button>
                    </motion.li>
                  );
                })}
              </ul>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.45 }}
                className="mt-6 divide-y divide-olive/10 rounded-card border border-olive/15 bg-white/60"
              >
                <button
                  data-testid="mobile-nav-link-account"
                  onClick={() => {
                    setMenuOpen(false);
                    navigate(member ? ROUTES.account : ROUTES.loyalty);
                  }}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-olive active:bg-olive/5"
                >
                  <User size={18} strokeWidth={1.8} />
                  <span className="flex-1">{t(member ? "nav.account" : "nav.signIn")}</span>
                  {stampLabel && <span className="text-xs text-olive/60">{stampLabel}</span>}
                  <ChevronRight size={16} className="text-olive/40" />
                </button>
                {member && (
                  <Link
                    data-testid="mobile-nav-game"
                    to={ROUTES.game}
                    onClick={() => setMenuOpen(false)}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-sm font-medium text-olive active:bg-olive/5"
                  >
                    <Gamepad2 size={18} strokeWidth={1.8} />
                    <span className="flex-1">{t("game.title")}</span>
                    <ChevronRight size={16} className="text-olive/40" />
                  </Link>
                )}
                {member && (
                  <button
                    data-testid="mobile-nav-sign-out"
                    onClick={() => {
                      signOut();
                      setMenuOpen(false);
                      navigate(ROUTES.home);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left text-sm font-medium text-olive/60 active:bg-olive/5"
                  >
                    <LogOut size={18} strokeWidth={1.8} />
                    <span className="flex-1">{t("account.logOut")}</span>
                  </button>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45, duration: 0.45 }}
                className="mt-6 flex items-center gap-4"
              >
                <Link
                  data-testid="mobile-nav-loyalty-cta"
                  to={ROUTES.loyalty}
                  onClick={() => setMenuOpen(false)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-full bg-olive px-6 py-4 text-xs font-semibold tracking-wide text-cream"
                >
                  {t("nav.cta")}
                  <ArrowUpRight size={14} />
                </Link>
                <LanguageToggle />
              </motion.div>
            </div>

            <p className="px-6 pb-6 text-[11px] tracking-label text-olive/60">{t("nav.tagline")}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
