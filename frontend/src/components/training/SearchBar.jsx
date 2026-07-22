import { useEffect, useState } from "react";
import { Search, X } from "lucide-react";

/**
 * Debounced search input. Searches name / Aadhaar / mobile / employee code.
 */
export default function SearchBar({ value, onChange, placeholder, delay = 350 }) {
  const [draft, setDraft] = useState(value || "");

  useEffect(() => {
    setDraft(value || "");
  }, [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft !== value) onChange(draft);
    }, delay);
    return () => clearTimeout(timer);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
      <input
        type="text"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={placeholder || "Search name, Aadhaar, mobile, employee code…"}
        className="h-10 w-full rounded-2xl border border-border-color bg-surface pl-9 pr-9 text-sm text-text-secondary shadow-sm outline-none transition focus:border-blue-300 focus:dark:border-blue-500/30 focus:ring-4 focus:ring-blue-100"
      />
      {draft ? (
        <button
          type="button"
          onClick={() => {
            setDraft("");
            onChange("");
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-full p-1 text-text-muted transition hover:bg-surface-muted hover:text-text-secondary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
