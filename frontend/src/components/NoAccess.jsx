import React from "react";
import { useNavigate } from "react-router-dom";
import { clearStoredSession } from "../lib/session";

/**
 * Shown only when a signed-in user has View permission for no page at all.
 * This is NOT the old 403 "Access Denied" screen — it's a plain, calm message
 * for an account that simply has no modules assigned yet.
 */
export default function NoAccess() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    clearStoredSession();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <div className="app-surface w-full max-w-sm rounded-2xl p-8 text-center">
        <h1 className="text-lg font-semibold text-text-primary">No access assigned</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Your account doesn&apos;t have access to any pages yet. Please contact your
          administrator to get the required permissions.
        </p>
        <button
          type="button"
          onClick={handleLogout}
          className="mt-6 rounded-xl border border-border-color px-4 py-2 text-sm font-medium text-text-primary transition hover:bg-surface-muted"
        >
          Log out
        </button>
      </div>
    </div>
  );
}
