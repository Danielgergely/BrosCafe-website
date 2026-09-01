import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { STAFF_TOKEN_KEY, api, safeGet, safeRemove, safeSet } from "@/lib/api";

/**
 * Password session for staff and admins. Separate from the customer session on
 * purpose: a barista signing in on the shop tablet must not touch a customer's
 * loyalty session, and vice versa.
 *
 * `user` is `null` while checking, `false` when signed out, else the user.
 */
const StaffContext = createContext(null);

export function StaffAuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!safeGet(STAFF_TOKEN_KEY)) {
      setUser(false);
      setLoading(false);
      return;
    }
    api
      .get("/auth/me")
      .then(({ data }) => setUser(data))
      .catch(() => {
        safeRemove(STAFF_TOKEN_KEY);
        setUser(false);
      })
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    safeSet(STAFF_TOKEN_KEY, data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const signOut = useCallback(() => {
    safeRemove(STAFF_TOKEN_KEY);
    setUser(false);
  }, []);

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);
  return <StaffContext.Provider value={value}>{children}</StaffContext.Provider>;
}

export function useStaff() {
  const context = useContext(StaffContext);
  if (!context) throw new Error("useStaff must be used inside <StaffAuthProvider>");
  return context;
}
