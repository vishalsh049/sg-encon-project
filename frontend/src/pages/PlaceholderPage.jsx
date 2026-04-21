import { useMemo } from "react";
import { useLocation } from "react-router-dom";

function toTitle(segment = "") {
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function PlaceholderPage() {
  const location = useLocation();

  const title = useMemo(() => {
    const parts = location.pathname.split("/").filter(Boolean).slice(1);
    return parts.map(toTitle).join(" / ") || "Dashboard";
  }, [location.pathname]);

  return (
    <div className="app-surface mx-auto max-w-6xl p-8">
      <div className="mb-3 inline-flex rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-primary">
        Dashboard Section
      </div>
      <h1 className="text-3xl font-semibold tracking-tight text-text-primary">{title}</h1>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
        This route is ready for your page content. The new sidebar navigation and
        layout are fully wired, so you can drop your screen components here
        whenever you are ready.
      </p>
    </div>
  );
}

export default PlaceholderPage;
