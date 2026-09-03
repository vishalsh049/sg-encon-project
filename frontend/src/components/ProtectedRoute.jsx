import React from "react";
import { Navigate } from "react-router-dom";
import { useUser } from "../context/UserContext";
import { hasAccess } from "../utils/access";
import { getFirstAllowedPath } from "../lib/pageRoutes";
import NoAccess from "./NoAccess";

export default function ProtectedRoute({ page, pages, children }) {
  const { user } = useUser();

  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;

  // If we have a token but user state hasn't loaded yet, show a loading placeholder
  if (!user && token) {
    return (
      <div className="mx-auto max-w-4xl p-8">
        <div className="app-surface p-6 text-center">Loading...</div>
      </div>
    );
  }

  // Not authenticated — send them to the login screen (no "Access Denied" page)
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Accept a single `page` or any-of `pages`. No restriction at all (e.g. a
  // user's own Profile) — just require login.
  const required = pages && pages.length ? pages : page ? [page] : [];
  if (required.length === 0) {
    return <>{children}</>;
  }

  // Has View permission for at least one of the required pages — render it
  if (required.some((p) => hasAccess(p, user))) {
    return <>{children}</>;
  }

  // Authenticated but not allowed to view this page. Instead of a 403 screen,
  // silently redirect to the first page the user CAN view. If they can view
  // nothing at all, show the plain "No access assigned" message.
  const firstAllowedPath = getFirstAllowedPath(user);
  if (firstAllowedPath) {
    return <Navigate to={firstAllowedPath} replace />;
  }
  return <NoAccess />;
}
