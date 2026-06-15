import { useState } from "react";
import axios from "axios";
import { buildApiUrl } from "../lib/api";
import { setStoredSession } from "../lib/session";
import { getPageDisplayName } from "../lib/pageMap";

const pageRouteMap = {
  Dashboard: "/dashboard",
  "Billing Dashboard": "/dashboard/billing",
  "Billing Status": "/dashboard/billing/status",
  Revenue: "/dashboard/billing/revenue",
  "KPIs Penalty": "/dashboard/billing/penalties/kpis",
  "General Penalties": "/dashboard/billing/penalties/general",
  Physical: "/dashboard/manpower/physical",
  Scrum: "/dashboard/manpower/scrum",
  "Tower Reports": "/dashboard/reports/tower",
  "Reports Dashboard": "/dashboard/reports",
  "KPI Dashboard": "/dashboard/reports",
  "NSO Fiber Performance": "/dashboard/reports/fiber/nso-dashboard",
  "NSO Reports": "/dashboard/reports/fiber/nso",
  "Fiber Reports": "/dashboard/reports/fiber/inventory",
  Users: "/dashboard/users-access",
  "Roles & Permissions": "/dashboard/users-access",
  "HR Dashboard": "/dashboard/hr-dashboard",
  Signoff: "/dashboard/manpower/signoff",
};

function getLoginRedirectPath(user) {
  const rawPageAccess = Array.isArray(user?.pageAccess) ? user.pageAccess : [];
  const viewablePagePermissions = Array.isArray(user?.pagePermissions)
    ? user.pagePermissions
        .filter((permission) => permission?.view)
        .map((permission) => permission.page)
    : [];

  const allowedPages = rawPageAccess.length > 0 ? rawPageAccess : viewablePagePermissions;

  if (allowedPages.length === 0) {
    return "/dashboard";
  }

  const normalizedAllowedPages = allowedPages.map((page) =>
    String(getPageDisplayName(page) || page || "").trim().toLowerCase()
  );

  if (normalizedAllowedPages.includes("dashboard")) {
    return "/dashboard";
  }

  const firstAllowedRoute = allowedPages.find((page) => {
    const displayName = getPageDisplayName(page);
    return pageRouteMap[displayName] || pageRouteMap[page];
  });

  if (!firstAllowedRoute) {
    return "/dashboard";
  }

  const displayName = getPageDisplayName(firstAllowedRoute);
  return pageRouteMap[displayName] || pageRouteMap[firstAllowedRoute] || "/dashboard";
}

function Login() {
  const [loginId, setLoginId] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

const handleLogin = async (e) => {
  e.preventDefault();
  console.log("LOGIN ATTEMPT:", { loginId });
  setErrorMessage("");
  setLoading(true);

  try {
    const res = await axios.post(
 buildApiUrl("/api/auth/login"),
 { loginId: loginId.trim(), password },
 { withCredentials: false }
);

    console.log("LOGIN RESPONSE:", res.data);

   if (res.data?.token) {
     localStorage.setItem("token", res.data.token);
     setStoredSession({
       ...(res.data.user || {}),
       token: res.data.token,
       roleName: res.data.user?.roleName || "Admin",
       permissions: res.data.user?.permissions || ["dashboard.view"],
     });
     window.location.href = getLoginRedirectPath(res.data.user);
     return;
   } 

    // No token but success
    setErrorMessage(res.data?.message || "Login failed - no token received");
    
  } catch (err) {
    console.error("LOGIN ERROR:", err.response?.data || err.message);
    
    const errorMsg = err.response?.data?.message || 
                    err.response?.data?.error || 
                    err.message || 
                    "Login failed";
    setErrorMessage(errorMsg);
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="app-surface w-full max-w-md p-8">
        <h2 className="mb-8 text-center text-2xl font-semibold text-primary">
          S G Encon Pvt. Ltd.
        </h2>

        <form onSubmit={handleLogin} className="space-y-6">
          {errorMessage ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {errorMessage}
            </div>
          ) : null}

          <div>
     <input
  type="text"
  placeholder="Username or Email"
  value={loginId}
  onChange={(e) => setLoginId(e.target.value)}
  required
  className="app-input-lg w-full"
/>
          </div>

          <div>
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="app-input-lg w-full"
            />
          </div>

          <button type="submit" disabled={loading} className="app-button-primary w-full">
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-primary">Forgot Your Password?</p>
      </div>
    </div>
  );
}

export default Login;
