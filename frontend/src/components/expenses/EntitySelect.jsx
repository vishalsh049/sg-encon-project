import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Loader2, Search, X } from "lucide-react";

const INPUT =
  "h-10 w-full rounded-xl border border-border-color bg-surface px-3 text-sm text-text-primary outline-none transition focus:border-indigo-400 disabled:bg-surface-muted disabled:text-text-muted";

/**
 * Lightweight searchable select — no external dependency, matches the app's
 * design tokens. Used for Employee / Vendor / PO pickers.
 *
 * props:
 *  - value:        currently selected option object (or null)
 *  - onChange(opt): called with the chosen option (or null on clear)
 *  - fetcher(q):    async () => option[]  (debounced)
 *  - getLabel(opt), getSub(opt): display accessors
 *  - placeholder, disabled, invalid
 *  - trailing:     optional node rendered next to the field (e.g. "+ Add")
 *  - autoLoad:     fetch once on open even with empty query (default true)
 */
export default function EntitySelect({
  value,
  onChange,
  fetcher,
  getLabel = (o) => o?.label ?? "",
  getSub = () => "",
  placeholder = "Search…",
  disabled = false,
  invalid = false,
  trailing = null,
  autoLoad = true,
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef(null);

  const load = useCallback(
    async (q) => {
      setLoading(true);
      try {
        const rows = await fetcher(q);
        setItems(Array.isArray(rows) ? rows : []);
      } catch {
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [fetcher]
  );

  useEffect(() => {
    if (!open) return undefined;
    const t = setTimeout(() => {
      if (query.trim() || autoLoad) load(query.trim());
    }, 250);
    return () => clearTimeout(t);
  }, [open, query, load, autoLoad]);

  useEffect(() => {
    const onDoc = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (opt) => {
    onChange(opt);
    setOpen(false);
    setQuery("");
  };

  return (
    <div className="flex items-start gap-2">
      <div ref={boxRef} className="relative min-w-0 flex-1">
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen((v) => !v)}
          className={`${INPUT} flex items-center justify-between gap-2 text-left ${
            invalid ? "border-rose-400 bg-rose-50 dark:bg-rose-500/10" : ""
          }`}
        >
          <span className={`truncate ${value ? "text-text-primary" : "text-text-muted"}`}>
            {value ? getLabel(value) : placeholder}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {value ? (
              <X
                size={14}
                className="text-text-muted hover:text-rose-500"
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
              />
            ) : null}
            <ChevronDown size={15} className="text-text-muted" />
          </span>
        </button>

        {open ? (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border-color bg-surface shadow-[0_20px_50px_rgba(15,23,42,0.16)]">
            <div className="flex items-center gap-2 border-b border-border-color px-2.5 py-2">
              <Search size={14} className="text-text-muted" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Type to search…"
                className="w-full border-0 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
              />
              {loading ? <Loader2 size={13} className="animate-spin text-text-muted" /> : null}
            </div>
            <ul className="max-h-56 overflow-y-auto py-1">
              {items.length === 0 && !loading ? (
                <li className="px-3 py-2 text-xs text-text-muted">
                  {query.trim() ? "No matches." : "Start typing to search."}
                </li>
              ) : (
                items.map((opt, i) => {
                  const selected = value && (value.id ?? value) === (opt.id ?? opt);
                  return (
                    <li key={opt.id ?? opt.employeeCode ?? opt.poNumber ?? i}>
                      <button
                        type="button"
                        onClick={() => pick(opt)}
                        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition hover:bg-surface-muted"
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-text-primary">{getLabel(opt)}</span>
                          {getSub(opt) ? (
                            <span className="block truncate text-xs text-text-muted">{getSub(opt)}</span>
                          ) : null}
                        </span>
                        {selected ? <Check size={14} className="shrink-0 text-indigo-500" /> : null}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}
