// Buckets the daily {date, circle, cmp, roleKey, roleLabel, total} rows
// returned by GET /api/hr-analytics-v2/joining-trend and /resignation-trend
// into Today/Weekly/Monthly/Quarterly/Yearly series entirely client-side, so
// switching granularity on the New Joining / Resignation Analytics panels
// never needs another API call.

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export function periodKey(dateStr, granularity) {
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "unknown";
  const year = date.getFullYear();
  const month = date.getMonth();
  switch (granularity) {
    case "day":
      return String(dateStr).slice(0, 10);
    case "week":
      return isoWeekKey(date);
    case "quarter":
      return `${year}-Q${Math.floor(month / 3) + 1}`;
    case "year":
      return String(year);
    case "month":
    default:
      return `${year}-${String(month + 1).padStart(2, "0")}`;
  }
}

export function periodLabel(key, granularity) {
  if (granularity === "month") {
    const [y, m] = key.split("-");
    return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-GB", {
      month: "short",
      year: "2-digit",
    });
  }
  if (granularity === "day") {
    const d = new Date(key);
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  }
  return key;
}

// Trailing-N-days/weeks/etc series ending today, so the chart always shows a
// consistent recent window instead of drifting with whatever data exists.
export function bucketSeries(rows, granularity, windowSize = 12) {
  const map = new Map();
  rows.forEach((row) => {
    const key = periodKey(row.date, granularity);
    map.set(key, (map.get(key) || 0) + Number(row.total || 0));
  });

  const sortedKeys = Array.from(map.keys()).sort();
  const windowed = windowSize ? sortedKeys.slice(-windowSize) : sortedKeys;

  return windowed.map((key) => ({
    period: key,
    label: periodLabel(key, granularity),
    value: map.get(key) || 0,
  }));
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function sumSince(rows, days) {
  const cutoff = Date.now() - days * DAY_MS;
  return rows.reduce((sum, row) => {
    const t = new Date(row.date).getTime();
    return Number.isFinite(t) && t >= cutoff ? sum + Number(row.total || 0) : sum;
  }, 0);
}

export function sumToday(rows) {
  const today = new Date().toISOString().slice(0, 10);
  return rows.reduce((sum, row) => (String(row.date).slice(0, 10) === today ? sum + Number(row.total || 0) : sum), 0);
}

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay() || 7; // Monday-start week
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - day + 1);
  return d;
}

export function sumThisWeek(rows) {
  const start = startOfWeek(new Date()).getTime();
  return rows.reduce((sum, row) => {
    const t = new Date(row.date).getTime();
    return Number.isFinite(t) && t >= start ? sum + Number(row.total || 0) : sum;
  }, 0);
}

export function sumThisMonth(rows) {
  const now = new Date();
  return rows.reduce((sum, row) => {
    const d = new Date(row.date);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      ? sum + Number(row.total || 0)
      : sum;
  }, 0);
}

export function sumThisQuarter(rows) {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  return rows.reduce((sum, row) => {
    const d = new Date(row.date);
    return d.getFullYear() === now.getFullYear() && Math.floor(d.getMonth() / 3) === currentQuarter
      ? sum + Number(row.total || 0)
      : sum;
  }, 0);
}

export function sumThisYear(rows) {
  const now = new Date();
  return rows.reduce((sum, row) => {
    const d = new Date(row.date);
    return d.getFullYear() === now.getFullYear() ? sum + Number(row.total || 0) : sum;
  }, 0);
}

// Trailing N month options for the global Month filter, newest first, e.g.
// [{ value: "2026-07", label: "Jul 2026" }, ...]. Generated client-side so
// the filter is available immediately without waiting on any fetch.
export function monthOptions(count = 24) {
  const now = new Date();
  const options = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    options.push({ value, label: d.toLocaleDateString("en-GB", { month: "short", year: "numeric" }) });
  }
  return options;
}

// Trailing N quarter options, newest first, e.g. [{ value: "2026-Q3", label: "Q3 2026" }, ...].
export function quarterOptions(count = 8) {
  const now = new Date();
  const currentQuarterIndex = now.getFullYear() * 4 + Math.floor(now.getMonth() / 3);
  const options = [];
  for (let i = 0; i < count; i += 1) {
    const qIndex = currentQuarterIndex - i;
    const year = Math.floor(qIndex / 4);
    const quarter = (qIndex % 4) + 1;
    options.push({ value: `${year}-Q${quarter}`, label: `Q${quarter} ${year}` });
  }
  return options;
}

// Filters daily rows down to a specific "YYYY-MM" month or "YYYY-QN" quarter.
// Returns the input unchanged when neither filter is set.
export function filterRowsByPeriod(rows, { month, quarter } = {}) {
  if (month) {
    return rows.filter((row) => periodKey(row.date, "month") === month);
  }
  if (quarter) {
    return rows.filter((row) => periodKey(row.date, "quarter") === quarter);
  }
  return rows;
}

export function groupByField(rows, field, labelField) {
  const map = new Map();
  rows.forEach((row) => {
    const key = row[field] || "Unassigned";
    const existing = map.get(key) || { key, label: labelField ? row[labelField] : key, total: 0 };
    existing.total += Number(row.total || 0);
    map.set(key, existing);
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
