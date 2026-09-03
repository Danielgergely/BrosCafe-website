import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useI18n } from "@/i18n";
import { CUSTOMER_TOKEN_KEY, api, customerAuth, safeGet, safeRemove, safeSet } from "@/lib/api";

/**
 * Passwordless customer session, shared by the marketing site and the loyalty
 * pages so signing in once is enough everywhere.
 *
 * `member` is `null` while the stored token is being checked, `false` for a
 * guest, and the member object once signed in.
 */
const CustomerContext = createContext(null);

export function CustomerAuthProvider({ children }) {
  const { lang } = useI18n();
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  // True when a stored session was rejected rather than absent. Without this
  // an expired token drops the customer on the sign-in form with no
  // explanation, which reads as the site having forgotten them for no reason.
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!safeGet(CUSTOMER_TOKEN_KEY)) {
      setMember(false);
      setLoading(false);
      return;
    }
    api
      .get("/customer/me", customerAuth())
      .then(({ data }) => setMember(data))
      .catch((error) => {
        safeRemove(CUSTOMER_TOKEN_KEY);
        setMember(false);
        // A rejected token means the session ran out. A network failure does
        // not, and telling someone their session expired when the café wifi
        // dropped would just be wrong.
        if (error?.response?.status) setExpired(true);
      })
      .finally(() => setLoading(false));
  }, []);

  const requestLink = useCallback(
    (email, firstName) =>
      // Send the current language so the sign-in email — and every later one —
      // arrives in the language they are actually reading the site in.
      api.post("/auth/request-link", { email, first_name: firstName, lang }),
    [lang],
  );

  const verify = useCallback(async (token) => {
    const { data } = await api.post("/auth/verify", { token });
    safeSet(CUSTOMER_TOKEN_KEY, data.token);
    setMember(data.member);
    return data.member;
  }, []);

  const refresh = useCallback(async () => {
    if (!safeGet(CUSTOMER_TOKEN_KEY)) return null;
    const { data } = await api.get("/customer/me", customerAuth());
    setMember(data);
    return data;
  }, []);

  const changeEmail = useCallback(async (email) => {
    const { data } = await api.post("/customer/change-email", { email }, customerAuth());
    setMember(data);
    return data;
  }, []);

  const signOut = useCallback(() => {
    safeRemove(CUSTOMER_TOKEN_KEY);
    setMember(false);
    // Leaving on purpose is not the same as being timed out.
    setExpired(false);
  }, []);

  /** Called once the notice has been shown, so it does not follow them about. */
  const clearExpired = useCallback(() => setExpired(false), []);

  const value = useMemo(
    () => ({ member, loading, expired, clearExpired, requestLink, verify,
             refresh, changeEmail, signOut }),
    [member, loading, expired, clearExpired, requestLink, verify, refresh,
     changeEmail, signOut],
  );
  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomer() {
  const context = useContext(CustomerContext);
  if (!context) throw new Error("useCustomer must be used inside <CustomerAuthProvider>");
  return context;
}
