// Approved attendance status codes. Deliberately small for v1 (per the
// Attendance Management spec) but structured the same way as
// ./circles.js / ./designations.js so WO/H/HD can be added later without
// touching any validation logic that imports this module.
const ATTENDANCE_CODES = [
  { code: "P", label: "Present" },
  { code: "A", label: "Absent" },
  { code: "L", label: "Leave" },
];

const ATTENDANCE_CODE_VALUES = ATTENDANCE_CODES.map((item) => item.code);

const ATTENDANCE_CODE_LOOKUP = new Map(
  ATTENDANCE_CODES.map((item) => [item.code.toLowerCase(), item.code])
);

// Resolves free-form uploaded attendance text to its canonical code, or null
// if it doesn't match any approved code. Only exact code matches (case/space
// insensitive) resolve — full words like "Present"/"Absent" are intentionally
// rejected so uploads stay unambiguous, per spec.
function resolveAttendanceCode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return ATTENDANCE_CODE_LOOKUP.get(normalized) || null;
}

module.exports = {
  ATTENDANCE_CODES,
  ATTENDANCE_CODE_VALUES,
  resolveAttendanceCode,
};
