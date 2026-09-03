import axios from "axios";

import { API_BASE } from "@/config/site";
import { hasAnalyticsConsent } from "@/lib/consent";
import { safeGet, safeRemove, safeSet } from "@/lib/storage";

// Re-exported: plenty of modules already import these from here.
export { safeGet, safeSet, safeRemove };

export const api = axios.create({ baseURL: API_BASE });

export const STAFF_TOKEN_KEY = "bros_staff_token";
export const CUSTOMER_TOKEN_KEY = "bros_customer_token";
const SESSION_KEY = "bros_session";

/** Staff/admin calls carry the staff token; customer calls pass their own header. */
api.interceptors.request.use((config) => {
  const token = safeGet(STAFF_TOKEN_KEY);
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const customerAuth = () => {
  const token = safeGet(CUSTOMER_TOKEN_KEY);
  return token ? { headers: { Authorization: `Bearer ${token}` } } : {};
};

/** Turn any FastAPI error shape into one displayable sentence. */
export function formatError(detail, fallback = "Something went wrong. Please try again.") {
  if (detail == null) return fallback;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e))).join(" ");
  }
  if (typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export const errorMessage = (error, fallback) =>
  formatError(error?.response?.data?.detail, fallback);

function sessionId() {
  let id = safeGet(SESSION_KEY);
  if (!id) {
    id = window.crypto?.randomUUID
      ? window.crypto.randomUUID()
      : Math.random().toString(36).slice(2) + Date.now().toString(36);
    safeSet(SESSION_KEY, id);
  }
  return id;
}

/**
 * Fire-and-forget funnel tracking. Must never surface as an unhandled
 * rejection — and never runs at all without analytics consent, which is why
 * the session id is created inside rather than at module load.
 */
export function track(type, extra = {}) {
  try {
    if (!hasAnalyticsConsent()) return;
    api.post("/track", { type, session_id: sessionId(), ...extra }).catch(() => {});
  } catch {
    /* ignore */
  }
}
