import { useState } from "react";
import axios from "axios";
import { buildApiUrl } from "../lib/api";
import { setStoredSession } from "../lib/session";

function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [loading, setLoading] = useState(false);

const handleLogin = async (e) => {
  e.preventDefault();
  console.log("LOGIN ATTEMPT:", { email });

  setErrorMessage("");
  setLoading(true);

  try {
    const res = await axios.post(
 buildApiUrl("/api/auth/login"),
 { email: email.trim().toLowerCase(), password },
 { withCredentials: false }
);

    console.log("LOGIN RESPONSE:", res.data);

   if (res.data?.token) {
     localStorage.setItem("token", res.data.token);
 setStoredSession({
  token: res.data.token,
  roleName: res.data.roleName || "admin",
  permissions: res.data.permissions || ["view_dashboard"]
});
 window.location.href = "/dashboard";
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
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
