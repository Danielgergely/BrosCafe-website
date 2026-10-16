import { Coffee } from "lucide-react";
import { Navigate, useLocation } from "react-router-dom";

import { ROUTES } from "@/config/site";
import { useCustomer } from "@/state/CustomerAuth";
import { useStaff } from "@/state/StaffAuth";

function Checking() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream">
      <Coffee size={40} className="animate-pulse text-olive" />
    </div>
  );
}

/** Requires a signed-in loyalty member. */
export function CustomerOnly({ children }) {
  const { member, loading } = useCustomer();
  if (loading || member === null) return <Checking />;
  if (!member) return <Navigate to={ROUTES.loyalty} replace />;
  return children;
}

/** Requires a staff (or admin) password session. */
export function StaffOnly({ children, adminOnly = false }) {
  const { user, loading } = useStaff();
  const location = useLocation();
  if (loading || user === null) return <Checking />;
  // Remember where they were going (the sales widget opens /admin?tab=live),
  // so signing in lands there rather than on the default page.
  if (!user) return <Navigate to={ROUTES.login} replace state={{ from: location.pathname + location.search }} />;
  if (adminOnly && user.role !== "admin") return <Navigate to={ROUTES.staff} replace />;
  return children;
}
