// Shared date formatting for the Attendance page's tables/panels so
// "12 Aug 2026"-style formatting stays identical everywhere it's shown.
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

export function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

export function formatDisplayDate(value) {
  if (!value) return "-";
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.valueOf())) return "-";
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return "-";
  return parsed.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
