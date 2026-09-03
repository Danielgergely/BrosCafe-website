/**
 * Analytics consent.
 *
 * Only the funnel analytics need asking about. The loyalty session tokens are
 * strictly necessary — a customer cannot stay signed in without them — and the
 * language, favourites and day-planner keys hold choices the customer made
 * themselves. What needs consent is the pseudonymous `bros_session` id and the
 * device/browser data sent with each tracked event, because those exist to
 * measure people rather than to serve them.
 *
 * Declining is honoured, not merely recorded: track() becomes a no-op and the
 * session id is never created.
 */
import { safeGet, safeRemove, safeSet } from "@/lib/storage";

export const CONSENT_KEY = "bros-consent";
export const GRANTED = "granted";
export const DENIED = "denied";

/** "granted" | "denied" | null when they have not been asked yet. */
export function readConsent() {
  const value = safeGet(CONSENT_KEY);
  return value === GRANTED || value === DENIED ? value : null;
}

export function setConsent(value) {
  safeSet(CONSENT_KEY, value);
  if (value === DENIED) {
    // Drop the identifier we already created, so declining actually clears it.
    safeRemove("bros_session");
  }
  window.dispatchEvent(new Event("bros-consent-change"));
}

export function hasAnalyticsConsent() {
  return readConsent() === GRANTED;
}
