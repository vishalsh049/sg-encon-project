import React from "react";
import { Lock, Home } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AccessDenied({ pageName = "this page" }) {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <div className="w-full max-w-md">
        <div className="app-surface rounded-3xl border border-white/40 bg-white/70 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.08)] backdrop-blur-md">
          {/* Icon */}
          <div className="mb-6 flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-red-100 to-red-50">
              <Lock className="h-8 w-8 text-red-600" strokeWidth={1.5} />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-center text-2xl font-bold tracking-tight text-text-primary">
            Access Denied
          </h2>

          {/* Message */}
          <p className="mt-3 text-center text-sm text-text-secondary">
            You do not have permission to view <span className="font-semibold text-text-primary">{pageName}</span>.
          </p>

          {/* Additional Info */}
          <div className="mt-6 rounded-xl bg-gradient-to-r from-amber-50 to-orange-50 p-4">
            <p className="text-xs leading-relaxed text-text-secondary">
              If you believe you should have access to this page, please contact your administrator to request the necessary permissions.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 flex flex-col gap-3">
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 font-medium text-white shadow-lg transition-all duration-200 hover:shadow-xl hover:from-blue-700 hover:to-blue-800 active:scale-95"
            >
              <Home size={18} />
              Go to Dashboard
            </button>

            <button
              onClick={() => window.history.back()}
              className="rounded-xl border border-text-secondary/20 px-4 py-3 font-medium text-text-primary transition-all duration-200 hover:bg-slate-50 active:scale-95"
            >
              Go Back
            </button>
          </div>
        </div>

        {/* Footer Text */}
        <p className="mt-6 text-center text-xs text-text-secondary/70">
          Error Code: <span className="font-mono font-semibold">403</span>
        </p>
      </div>
    </div>
  );
}
