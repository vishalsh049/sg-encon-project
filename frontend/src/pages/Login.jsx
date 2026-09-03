import { useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { buildApiUrl } from "../lib/api";
import { setStoredSession } from "../lib/session";
import { getFirstAllowedPath } from "../lib/pageRoutes";
import { useUser } from "../context/UserContext";
import logo from "../assets/logo.png";
import { Eye, EyeOff } from "lucide-react";

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
     // Land on the first page this user may View. If they can view nothing,
     // go to /dashboard, where ProtectedRoute shows the "No access assigned"
     // message (never the old 403 screen).
     navigate(getFirstAllowedPath(session) || "/dashboard", { replace: true });
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-surface-muted via-blue-50 to-indigo-100 px-6 dark:from-slate-950 dark:via-slate-900 dark:to-indigo-950">
      <div className="
w-full
max-w-md
rounded-3xl
bg-surface/90
backdrop-blur-xl
border
border-border-color
shadow-[0_25px_60px_rgba(15,23,42,.15)]
dark:shadow-[0_25px_60px_rgba(0,0,0,.5)]
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

    <p className="mt-2 text-sm text-text-muted">
        Enterprise Management Portal
    </p>

<p className="mt-1 text-center text-sm text-text-muted">
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
  <label className="mb-2 block text-sm font-semibold text-text-secondary">
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
border-border-color
bg-surface-muted
px-5
py-4
text-text-secondary
placeholder:text-text-muted
outline-none
transition-all
duration-200
focus:border-indigo-600
focus:bg-surface
focus:ring-4
focus:ring-indigo-100
"
  />
</div>

    <div>
  <label className="mb-2 block text-sm font-semibold text-text-secondary">
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
        border-border-color
        bg-surface-muted
        py-4
        pl-5
        pr-14
        text-text-secondary
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
        text-text-muted
        hover:text-indigo-600 hover:dark:text-indigo-400
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
<div className="mt-10 border-t border-border-color pt-4">
  <div className="flex items-center justify-between text-xs text-text-muted">
    <span>© 2026 SG Encon Ltd.</span>
    <span>Version 2.0 Enterprise</span>
  </div>
</div>
      </div>
    </div>
  );
}

export default Login;
