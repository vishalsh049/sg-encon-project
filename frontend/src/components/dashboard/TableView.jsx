import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";

function SortIcon({ active, dir }) {
  if (!active) return <ArrowUpDown className="h-3 w-3 text-text-muted opacity-50" />;
  return dir === "asc" ? <ArrowUp className="h-3 w-3 text-text-secondary" /> : <ArrowDown className="h-3 w-3 text-text-secondary" />;
}

export default function TableView({ chartData, entities, variant = "compact" }) {
  const [sortKey, setSortKey] = useState("date");
  const [sortDir, setSortDir] = useState("asc");
  const [search, setSearch] = useState("");
  const isCompact = variant === "compact";

  const rows = useMemo(() => {
    let data = chartData || [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      data = data.filter(row =>
        row.date.toLowerCase().includes(q) ||
        entities.some(e => String(row[e] ?? "").toLowerCase().includes(q))
      );
    }
    return [...data].sort((a, b) => {
      const va = sortKey === "date" ? a.date : Number(a[sortKey] ?? -Infinity);
      const vb = sortKey === "date" ? b.date : Number(b[sortKey] ?? -Infinity);
      if (va < vb) return sortDir === "asc" ? -1 : 1;
      if (va > vb) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [chartData, entities, search, sortKey, sortDir]);

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir(d => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  if (!chartData?.length) {
    return (
      <div className="flex h-32 items-center justify-center rounded-2xl bg-surface-muted">
        <p className="text-xs text-text-muted">No data for selected range</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border-color bg-surface overflow-hidden">
      {!isCompact && (
        <div className="flex items-center gap-2 border-b border-border-color px-3 py-2">
          <Search className="h-3.5 w-3.5 text-text-muted" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search date or value..."
            className="w-full bg-transparent text-xs text-text-secondary outline-none placeholder:text-text-muted"
          />
        </div>
      )}
      <div className={`overflow-auto ${isCompact ? "max-h-40" : "max-h-96"}`}>
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-surface-muted">
            <tr>
              <th
                onClick={() => toggleSort("date")}
                className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-left font-semibold text-text-secondary"
              >
                <span className="flex items-center gap-1">Date <SortIcon active={sortKey === "date"} dir={sortDir} /></span>
              </th>
              {entities.map(e => (
                <th
                  key={e}
                  onClick={() => toggleSort(e)}
                  className="cursor-pointer select-none whitespace-nowrap px-3 py-2 text-right font-semibold text-text-secondary"
                >
                  <span className="flex items-center justify-end gap-1">{e} <SortIcon active={sortKey === e} dir={sortDir} /></span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={`${row.date}-${i}`} className="border-t border-border-color hover:bg-surface-muted/60">
                <td className="whitespace-nowrap px-3 py-1.5 text-text-secondary">{row.date}</td>
                {entities.map(e => (
                  <td key={e} className="px-3 py-1.5 text-right text-text-primary">
                    {row[e] != null ? `${Number(row[e]).toFixed(2)}%` : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
