import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

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
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!safeGet(CUSTOMER_TOKEN_KEY)) {
      setMember(false);
      setLoading(false);
      return;
    }
    api
      .get("/customer/me", customerAuth())
      .then(({ data }) => setMember(data))
      .catch(() => {
        safeRemove(CUSTOMER_TOKEN_KEY);
        setMember(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const requestLink = useCallback(
    (email, firstName) => api.post("/auth/request-link", { email, first_name: firstName }),
    [],
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
  }, []);

  const value = useMemo(
    () => ({ member, loading, requestLink, verify, refresh, changeEmail, signOut }),
    [member, loading, requestLink, verify, refresh, changeEmail, signOut],
  );
  return <CustomerContext.Provider value={value}>{children}</CustomerContext.Provider>;
}

export function useCustomer() {
  const context = useContext(CustomerContext);
  if (!context) throw new Error("useCustomer must be used inside <CustomerAuthProvider>");
  return context;
}
