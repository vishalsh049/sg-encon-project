import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { buildApiUrl } from "../lib/api";
import { setStoredSession } from "../lib/session";
import { getPageDisplayName } from "../lib/pageMap";
import { useUser } from "../context/UserContext";
import logo from "../assets/logo.png";
import { Eye, EyeOff } from "lucide-react";

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
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { setUser } = useUser();

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
     const session = {
       ...(res.data.user || {}),
       token: res.data.token,
       roleName: res.data.user?.roleName || "Unassigned",
       permissions: res.data.user?.permissions || [],
     };
     localStorage.setItem("token", res.data.token);
     setStoredSession(session);
     setUser(session);
     navigate(getLoginRedirectPath(res.data.user), { replace: true });
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100 px-6">
      <div className="
w-full
max-w-md
rounded-3xl
bg-white/90
backdrop-blur-xl
border
border-white/60
shadow-[0_25px_60px_rgba(15,23,42,.15)]
px-10
py-12
">

<div className="mb-10 flex flex-col items-center">

    <div className="">
        <img
            src={logo}
            alt="logo"
            className="h-8 w-auto"
        />
    </div>

    <p className="mt-2 text-sm text-slate-500">
        Enterprise Management Portal
    </p>

<p className="mt-1 text-center text-sm text-slate-500">
  Sign in to continue to your dashboard
</p>

</div>

        <form onSubmit={handleLogin} className="space-y-6">
          {errorMessage ? (
            <div className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
              {errorMessage}
            </div>
          ) : null}

         <div>
  <label className="mb-2 block text-sm font-semibold text-slate-700">
    Username or Email
  </label>

  <input
    type="text"
    placeholder="Enter your username or email"
    value={loginId}
    onChange={(e) => setLoginId(e.target.value)}
    required
    className="
w-full
rounded-xl
border
border-slate-200
bg-slate-50
px-5
py-4
text-slate-700
placeholder:text-slate-400
outline-none
transition-all
duration-200
focus:border-indigo-600
focus:bg-white
focus:ring-4
focus:ring-indigo-100
"
  />
</div>

    <div>
  <label className="mb-2 block text-sm font-semibold text-slate-700">
    Password
  </label>

  <div className="relative">
    <input
      type={showPassword ? "text" : "password"}
      placeholder="Enter your password"
      value={password}
      onChange={(e) => setPassword(e.target.value)}
      className="
        w-full
        rounded-xl
        border
        border-slate-200
        bg-slate-50
        py-4
        pl-5
        pr-14
        text-slate-700
        outline-none
        transition
        focus:border-indigo-500
        focus:ring-4
        focus:ring-indigo-100
      "
    />

    <button
      type="button"
      onClick={() => setShowPassword(!showPassword)}
      className="
        absolute
        inset-y-0
        right-4
        flex
        items-center
        justify-center
        text-slate-500
        hover:text-indigo-600
      "
    >
      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
    </button>
  </div>
</div>

          <button type="submit" disabled={loading} className="
w-full
rounded-xl
bg-gradient-to-r
from-indigo-600
to-blue-600
py-4
font-semibold
text-white
shadow-lg
transition-all
duration-300
hover:scale-[1.02]
hover:shadow-2xl
active:scale-95
disabled:opacity-50
">
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>
<div className="mt-10 border-t border-slate-200 pt-4">
  <div className="flex items-center justify-between text-xs text-slate-500">
    <span>© 2026 SG Encon Ltd.</span>
    <span>Version 2.0 Enterprise</span>
  </div>
</div>
      </div>
    </div>
  );
}

export default Login;
