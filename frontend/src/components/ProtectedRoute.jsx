import React from "react";
import { useUser } from "../context/UserContext";
import { hasAccess } from "../utils/access";
import AccessDenied from "./AccessDenied";

export default function ProtectedRoute({ page, children }) {
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

  // If there's no user (not authenticated), show access denied
  if (!user) {
    return <AccessDenied pageName={page} />;
  }

  // Check if user has access to this specific page
  const allowed = hasAccess(page, user);

  if (allowed) return <>{children}</>;

  // User is authenticated but doesn't have access to this page
  return <AccessDenied pageName={page} />;
}