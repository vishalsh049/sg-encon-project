const XLSX = require("xlsx");
const { createError } = require("../utils/apiErrors");
const { isAllCircle, canAccessCircle } = require("../middleware/circleAccess");
const { resolveAttendanceCode } = require("../constants/attendanceCodes");

// ---------------------------------------------------------------------------
// Schema (idempotent, same "CREATE TABLE IF NOT EXISTS" + ensureColumn/
// ensureIndex idiom as physicalDomainService.js). Attendance never touches
// the `physical` table itself — it only reads it.
// ---------------------------------------------------------------------------

async function ensureIndex(query, table, indexName, ddl) {
  const rows = await query(
    `
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1
    `,
    [table, indexName]
  );

  if (!rows.length) {
    await query(ddl);
  }
}

async function ensureAttendanceSchema(query) {
  async function ensureColumn(table, column, definition) {
    try {
      await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    } catch (error) {
      if (error?.code !== "ER_DUP_FIELDNAME") {
        throw error;
      }
    }
  }

  await query(`
    CREATE TABLE IF NOT EXISTS attendance (
      id INT AUTO_INCREMENT PRIMARY KEY,
      employee_code VARCHAR(100) NOT NULL,
      physical_id INT DEFAULT NULL,
      attendance_date DATE NOT NULL,
      status VARCHAR(10) NOT NULL,
      upload_batch_id INT DEFAULT NULL,
      created_by INT DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by INT DEFAULT NULL,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_attendance_emp_date (employee_code, attendance_date)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS attendance_uploads (
      id INT AUTO_INCREMENT PRIMARY KEY,
      attendance_date DATE NOT NULL,
      file_name VARCHAR(255) DEFAULT NULL,
      original_name VARCHAR(255) DEFAULT NULL,
      uploaded_by_id INT DEFAULT NULL,
      uploaded_by_name VARCHAR(255) DEFAULT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending_preview',
      duplicate_action VARCHAR(10) DEFAULT NULL,
      total_rows INT NOT NULL DEFAULT 0,
      valid_rows INT NOT NULL DEFAULT 0,
      error_rows INT NOT NULL DEFAULT 0,
      conflict_rows INT NOT NULL DEFAULT 0,
      inserted_rows INT NOT NULL DEFAULT 0,
      updated_rows INT NOT NULL DEFAULT 0,
      skipped_rows INT NOT NULL DEFAULT 0,
      preview_payload_json LONGTEXT DEFAULT NULL,
      summary_json TEXT DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME DEFAULT NULL
    )
  `);

  await ensureIndex(
    query,
    "attendance",
    "idx_attendance_date",
    "CREATE INDEX idx_attendance_date ON attendance (attendance_date)"
  );
  await ensureIndex(
    query,
    "attendance",
    "idx_attendance_employee_code",
    "CREATE INDEX idx_attendance_employee_code ON attendance (employee_code)"
  );
  await ensureIndex(
    query,
    "attendance_uploads",
    "idx_attendance_uploads_status",
    "CREATE INDEX idx_attendance_uploads_status ON attendance_uploads (status)"
  );
  // Speeds up the dashboard-summary and calendar queries, which both filter
  // attendance_date BETWEEN ? AND ? and then GROUP BY status — a composite
  // index lets that run as a single index range scan instead of a full scan
  // of every row in the date range. idx_attendance_date (above) alone can't
  // cover the GROUP BY.
  await ensureIndex(
    query,
    "attendance",
    "idx_attendance_date_status",
    "CREATE INDEX idx_attendance_date_status ON attendance (attendance_date, status)"
  );

  // ensureColumn calls kept even though the CREATE TABLE above already has
  // every column, so future additions follow the same additive pattern used
  // by every other module in this codebase.
  await ensureColumn("attendance", "physical_id", "INT DEFAULT NULL");
  await ensureColumn("attendance", "upload_batch_id", "INT DEFAULT NULL");
  // Permanent record of a batch's row-level errors, kept even after confirm
  // (unlike preview_payload_json, which is cleared) so "View Errors" works
  // from Upload History without requiring the file to be re-uploaded.
  await ensureColumn("attendance_uploads", "errors_json", "LONGTEXT DEFAULT NULL");
}

// ---------------------------------------------------------------------------
// Excel helpers
// ---------------------------------------------------------------------------

function toText(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

// Builds a lowercase/trimmed-key lookup for one Excel row so header spelling
// variants ("Aadhar No" vs "Aadhaar No") all resolve the same way.
function normalizeRowKeys(row) {
  const normalized = {};
  Object.keys(row || {}).forEach((key) => {
    normalized[String(key).trim().toLowerCase()] = row[key];
  });
  return normalized;
}

function pickField(normalizedRow, aliases) {
  for (const alias of aliases) {
    const value = normalizedRow[alias];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return value;
    }
  }
  return null;
}

const HEADER_ALIASES = {
  hrmsId: ["hrms id", "hrmsid", "hrms_id", "hrms  id"],
  aadhar: ["aadhar no", "aadhaar no", "aadhar", "aadhaar", "aadharno", "aadhaarno"],
  attendance: ["attendance", "attendance code", "status"],
};

function detectMissingHeaders(firstRow) {
  const normalizedKeys = new Set(Object.keys(normalizeRowKeys(firstRow || {})));
  const missing = [];
  if (!HEADER_ALIASES.hrmsId.some((alias) => normalizedKeys.has(alias))) missing.push("HRMS ID");
  if (!HEADER_ALIASES.aadhar.some((alias) => normalizedKeys.has(alias))) missing.push("Aadhar No");
  if (!HEADER_ALIASES.attendance.some((alias) => normalizedKeys.has(alias))) missing.push("Attendance");
  return missing;
}

function todayIstDateString() {
  // Same +05:30 convention the DB connection pool uses (see config/db.js).
  const now = new Date(Date.now() + 5.5 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

function istNow() {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000);
}

function toIsoDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(isoDateStr, days) {
  const date = new Date(`${isoDateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

// ---------------------------------------------------------------------------
// Date-range resolution shared by /records, /dashboard/summary and
// /report/export, so the three endpoints can never disagree about what
// "Today" / "This Week" / "This Month" / a custom range actually spans.
// Computed in IST (Node), same convention as todayIstDateString(), rather
// than depending on the DB server's session timezone.
// ---------------------------------------------------------------------------

function resolveAttendanceDateRange({ range, from, to }) {
  const today = istNow();
  const todayStr = toIsoDate(today);
  const normalizedRange = String(range || "").trim().toLowerCase() || "this_month";

  if (normalizedRange === "today") {
    return { dateFrom: todayStr, dateTo: todayStr, range: "today" };
  }

  if (normalizedRange === "yesterday") {
    const yesterday = addDays(todayStr, -1);
    return { dateFrom: yesterday, dateTo: yesterday, range: "yesterday" };
  }

  if (normalizedRange === "this_week") {
    // ISO week, Monday start. getUTCDay(): 0=Sun..6=Sat.
    const jsDay = today.getUTCDay();
    const isoDayOffset = jsDay === 0 ? 6 : jsDay - 1;
    const monday = addDays(todayStr, -isoDayOffset);
    const sunday = addDays(monday, 6);
    return { dateFrom: monday, dateTo: sunday, range: "this_week" };
  }

  if (normalizedRange === "custom") {
    const fromStr = String(from || "").trim();
    const toStr = String(to || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fromStr) || !/^\d{4}-\d{2}-\d{2}$/.test(toStr)) {
      throw createError("A valid custom date range (from/to) is required.", 400, "INVALID_DATE_RANGE");
    }
    if (fromStr > toStr) {
      throw createError("The custom range's start date must be on or before its end date.", 400, "INVALID_DATE_RANGE");
    }
    return { dateFrom: fromStr, dateTo: toStr, range: "custom" };
  }

  if (normalizedRange === "previous_month") {
    // Roll back to month 0 (Date.UTC underflows the year correctly), same
    // last-day-of-month math as the this_month branch below.
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;
    const prevMonthDate = new Date(Date.UTC(year, month - 2, 1));
    const prevYear = prevMonthDate.getUTCFullYear();
    const prevMonth = prevMonthDate.getUTCMonth() + 1;
    const lastDay = new Date(Date.UTC(prevYear, prevMonth, 0)).getUTCDate();
    const mm = String(prevMonth).padStart(2, "0");
    return {
      dateFrom: `${prevYear}-${mm}-01`,
      dateTo: `${prevYear}-${mm}-${String(lastDay).padStart(2, "0")}`,
      range: "previous_month",
    };
  }

  // this_month / fallback — preserves the page's original default behavior.
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return {
    dateFrom: `${year}-${mm}-01`,
    dateTo: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
    range: "this_month",
  };
}

function makeValidationError({ row, employee, employeeCode, column, currentValue, error, expected, howToFix }) {
  return {
    row,
    employee: employee || "-",
    employeeCode: employeeCode || "-",
    column,
    currentValue: currentValue === null || currentValue === undefined || currentValue === "" ? "(Blank)" : String(currentValue),
    error,
    expected: expected || null,
    howToFix: howToFix || `Correct the "${column}" value and upload again.`,
  };
}

// ---------------------------------------------------------------------------
// Employee master / existing attendance lookups
// ---------------------------------------------------------------------------

async function fetchEmployeesByCodes(query, codes) {
  const map = new Map();
  if (!codes.length) return map;

  const rows = await query(
    `
      SELECT id, employee_code, employee_name, job_role, cmp, circle,
             date_of_joining, employment_status, last_working_date, aadhaar_no
      FROM physical
      WHERE COALESCE(is_deleted, 0) = 0
        AND LOWER(TRIM(employee_code)) IN (?)
    `,
    [codes]
  );

  rows.forEach((employee) => {
    const key = String(employee.employee_code || "").trim().toLowerCase();
    if (key) map.set(key, employee);
  });

  return map;
}

async function fetchExistingAttendance(query, attendanceDateStr, codes) {
  const map = new Map();
  if (!codes.length) return map;

  const rows = await query(
    `
      SELECT id, employee_code, status
      FROM attendance
      WHERE attendance_date = ?
        AND LOWER(TRIM(employee_code)) IN (?)
    `,
    [attendanceDateStr, codes]
  );

  rows.forEach((record) => {
    const key = String(record.employee_code || "").trim().toLowerCase();
    if (key) map.set(key, record);
  });

  return map;
}

// ---------------------------------------------------------------------------
// Validation pipeline (spec: HRMS-ID match -> Aadhar cross-check -> code
// whitelist -> in-file duplicate -> DOJ/LWD window -> existing-record
// conflict). Returns previewRows (valid/conflict/error) and a flat errors
// list already shaped for ValidationErrorModal.jsx.
// ---------------------------------------------------------------------------

async function validateAttendanceUpload({ rows, attendanceDateStr, authUser, query }) {
  if (!rows.length) {
    throw createError("The uploaded file has no data rows.", 400, "EMPTY_FILE");
  }

  const missingHeaders = detectMissingHeaders(rows[0]);
  if (missingHeaders.length) {
    throw createError(
      `Invalid Excel format. Required columns: Aadhar No, HRMS ID, Attendance. Missing: ${missingHeaders.join(", ")}.`,
      400,
      "INVALID_EXCEL_FORMAT"
    );
  }

  const parsedRows = rows.map((row, index) => {
    const normalized = normalizeRowKeys(row);
    return {
      excelRow: index + 2,
      hrmsIdRaw: toText(pickField(normalized, HEADER_ALIASES.hrmsId)),
      aadharRaw: toText(pickField(normalized, HEADER_ALIASES.aadhar)),
      attendanceRaw: toText(pickField(normalized, HEADER_ALIASES.attendance)),
    };
  });

  const uniqueCodes = [
    ...new Set(
      parsedRows
        .map((row) => row.hrmsIdRaw && row.hrmsIdRaw.toLowerCase())
        .filter(Boolean)
    ),
  ];

  const employeeMap = await fetchEmployeesByCodes(query, uniqueCodes);
  const existingAttendanceMap = await fetchExistingAttendance(query, attendanceDateStr, uniqueCodes);

  const seenHrmsIds = new Map(); // lowercased hrmsId -> first excelRow
  const errors = [];
  const previewRows = [];

  for (const parsed of parsedRows) {
    const { excelRow, hrmsIdRaw, aadharRaw, attendanceRaw } = parsed;
    const rowErrors = [];
    const employee = hrmsIdRaw ? employeeMap.get(hrmsIdRaw.toLowerCase()) : null;
    const employeeName = employee?.employee_name || null;

    if (!hrmsIdRaw) {
      rowErrors.push(makeValidationError({
        row: excelRow,
        column: "HRMS ID",
        currentValue: hrmsIdRaw,
        error: "HRMS ID is required.",
        howToFix: "Enter the employee's HRMS ID in this row.",
      }));
    } else {
      const key = hrmsIdRaw.toLowerCase();
      if (seenHrmsIds.has(key)) {
        rowErrors.push(makeValidationError({
          row: excelRow,
          employee: employeeName,
          employeeCode: hrmsIdRaw,
          column: "HRMS ID",
          currentValue: hrmsIdRaw,
          error: `Duplicate HRMS ID ${hrmsIdRaw} found in the uploaded file.`,
          howToFix: "Keep only one row per HRMS ID per upload.",
        }));
      } else {
        seenHrmsIds.set(key, excelRow);
      }

      if (!employee) {
        rowErrors.push(makeValidationError({
          row: excelRow,
          employeeCode: hrmsIdRaw,
          column: "HRMS ID",
          currentValue: hrmsIdRaw,
          error: `Employee ${hrmsIdRaw} is not added in the Physical page.`,
          howToFix: "Add the employee in Physical first, then upload attendance.",
        }));
      } else {
        if (!isAllCircle(authUser) && !canAccessCircle(authUser, employee.circle)) {
          rowErrors.push(makeValidationError({
            row: excelRow,
            employee: employeeName,
            employeeCode: hrmsIdRaw,
            column: "Circle",
            currentValue: employee.circle,
            error: `Employee ${hrmsIdRaw} belongs to a circle you cannot access.`,
            howToFix: "Attendance for this employee must be uploaded by a user with access to their circle.",
          }));
        }

        if (aadharRaw && employee.aadhaar_no && aadharRaw !== String(employee.aadhaar_no).trim()) {
          rowErrors.push(makeValidationError({
            row: excelRow,
            employee: employeeName,
            employeeCode: hrmsIdRaw,
            column: "Aadhar No",
            currentValue: aadharRaw,
            error: "Aadhar number does not match the employee master record.",
            expected: employee.aadhaar_no,
            howToFix: "Verify the HRMS ID and Aadhar No against the Physical page.",
          }));
        }

        if (employee.date_of_joining && attendanceDateStr < String(employee.date_of_joining).slice(0, 10)) {
          rowErrors.push(makeValidationError({
            row: excelRow,
            employee: employeeName,
            employeeCode: hrmsIdRaw,
            column: "Attendance Date",
            currentValue: attendanceDateStr,
            error: "Attendance date is before employee DOJ.",
            expected: `On or after ${String(employee.date_of_joining).slice(0, 10)}`,
            howToFix: "Attendance cannot be recorded before the employee's date of joining.",
          }));
        }

        if (employee.last_working_date && attendanceDateStr > String(employee.last_working_date).slice(0, 10)) {
          rowErrors.push(makeValidationError({
            row: excelRow,
            employee: employeeName,
            employeeCode: hrmsIdRaw,
            column: "Attendance Date",
            currentValue: attendanceDateStr,
            error: "Attendance date is after employee LWD.",
            expected: `On or before ${String(employee.last_working_date).slice(0, 10)}`,
            howToFix: "Attendance cannot be recorded after the employee's last working date.",
          }));
        }
      }
    }

    if (!attendanceRaw) {
      rowErrors.push(makeValidationError({
        row: excelRow,
        employee: employeeName,
        employeeCode: hrmsIdRaw,
        column: "Attendance",
        currentValue: attendanceRaw,
        error: "Attendance is required.",
        howToFix: "Enter P, A or L for this row.",
      }));
    } else {
      const resolvedCode = resolveAttendanceCode(attendanceRaw);
      if (!resolvedCode) {
        rowErrors.push(makeValidationError({
          row: excelRow,
          employee: employeeName,
          employeeCode: hrmsIdRaw,
          column: "Attendance",
          currentValue: attendanceRaw,
          error: `Invalid attendance code "${attendanceRaw}" in row ${excelRow}.`,
          expected: "P, A, L",
          howToFix: 'Allowed values: P (Present), A (Absent), L (Leave).',
        }));
      }
    }

    errors.push(...rowErrors);

    const resolvedCode = attendanceRaw ? resolveAttendanceCode(attendanceRaw) : null;
    const existing = hrmsIdRaw ? existingAttendanceMap.get(hrmsIdRaw.toLowerCase()) : null;
    const isConflict = rowErrors.length === 0 && !!existing;

    previewRows.push({
      row: excelRow,
      hrmsId: hrmsIdRaw,
      aadhar: aadharRaw,
      employeeName,
      jobRole: employee?.job_role || null,
      cmp: employee?.cmp || null,
      circle: employee?.circle || null,
      attendanceCode: resolvedCode,
      status: rowErrors.length ? "error" : isConflict ? "conflict" : "valid",
      existingStatus: existing?.status || null,
      existingId: existing?.id || null,
      physicalId: employee?.id || null,
      errorMessages: rowErrors.map((e) => e.error),
    });
  }

  const validCount = previewRows.filter((r) => r.status === "valid").length;
  const conflictCount = previewRows.filter((r) => r.status === "conflict").length;
  const errorCount = previewRows.filter((r) => r.status === "error").length;

  return {
    previewRows,
    errors,
    summary: {
      totalRows: previewRows.length,
      validRows: validCount,
      conflictRows: conflictCount,
      errorRows: errorCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Save (confirm step)
// ---------------------------------------------------------------------------

async function insertAttendanceRows(conn, rows, batchId, actorUserId) {
  if (!rows.length) return;

  const insertSql = `
    INSERT INTO attendance (employee_code, physical_id, attendance_date, status, upload_batch_id, created_by, updated_by)
    VALUES ?
  `;

  const chunkSize = 1000;
  for (let index = 0; index < rows.length; index += chunkSize) {
    const chunk = rows.slice(index, index + chunkSize).map((row) => [
      row.hrmsId,
      row.physicalId,
      row.attendanceDate,
      row.attendanceCode,
      batchId,
      actorUserId,
      actorUserId,
    ]);
    await conn.promise().query(insertSql, [chunk]);
  }
}

async function updateAttendanceRowsBulk(conn, rows, batchId, actorUserId) {
  if (!rows.length) return;

  const chunkSize = 200;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const chunk = rows.slice(start, start + chunkSize);
    const ids = chunk.map((row) => row.existingId);

    const statusCases = chunk.map(() => "WHEN ? THEN ?").join(" ");
    const batchCases = chunk.map(() => "WHEN ? THEN ?").join(" ");

    const statusParams = [];
    const batchParams = [];
    chunk.forEach((row) => {
      statusParams.push(row.existingId, row.attendanceCode);
      batchParams.push(row.existingId, batchId);
    });

    await conn.promise().query(
      `
        UPDATE attendance
        SET status = CASE id ${statusCases} ELSE status END,
            upload_batch_id = CASE id ${batchCases} ELSE upload_batch_id END,
            updated_by = ?
        WHERE id IN (${ids.map(() => "?").join(",")})
      `,
      [...statusParams, ...batchParams, actorUserId, ...ids]
    );
  }
}

// ---------------------------------------------------------------------------
// Attendance export (spec §24/§25): vertical `attendance` data pivoted into
// dynamic per-day columns at export time only — the table itself never has
// per-day columns. Day columns span the resolved date range (a single day
// for "Today", a full month for "This Month", etc.) rather than always a
// calendar month.
// ---------------------------------------------------------------------------

function formatDdMmYyyy(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
}

async function buildAttendanceExportBuffer({ query, dateFrom, dateTo, filters, authUser }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom || "") || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo || "") || dateFrom > dateTo) {
    throw createError("A valid date range is required.", 400, "INVALID_DATE_RANGE");
  }

  const conditions = ["is_deleted = 0"];
  const params = [];

  if (!isAllCircle(authUser)) {
    conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
    params.push(authUser.circle);
  }

  if (filters.circle) {
    conditions.push("LOWER(TRIM(circle)) = LOWER(TRIM(?))");
    params.push(filters.circle);
  }
  if (filters.cmp) {
    conditions.push("LOWER(TRIM(cmp)) = LOWER(TRIM(?))");
    params.push(filters.cmp);
  }
  if (filters.jobRole) {
    conditions.push("LOWER(TRIM(job_role)) = LOWER(TRIM(?))");
    params.push(filters.jobRole);
  }
  // Note: attendance status (P/A/L) is intentionally not a filter here — it
  // doesn't gate which employee rows appear in a day-grid muster roll, only
  // which value shows up inside a given day's cell.

  // The employee list and the date range's attendance rows don't depend on
  // each other — fetch both at once instead of one after the other.
  const [employees, attendanceRows] = await Promise.all([
    query(
      `
        SELECT id, employee_code, employee_name, job_role, cmp, circle,
               date_of_joining, employment_status, last_working_date, aadhaar_no
        FROM physical
        WHERE ${conditions.join(" AND ")}
        ORDER BY employee_name ASC
      `,
      params
    ),
    query(
      `
        SELECT a.employee_code, a.attendance_date, a.status
        FROM attendance a
        JOIN physical ON physical.employee_code = a.employee_code
        WHERE a.attendance_date BETWEEN ? AND ? AND (${conditions.join(" AND ")})
      `,
      [dateFrom, dateTo, ...params]
    ),
  ]);

  const attendanceByEmployee = new Map();
  attendanceRows.forEach((record) => {
    const key = String(record.employee_code || "").trim().toLowerCase();
    if (!attendanceByEmployee.has(key)) attendanceByEmployee.set(key, new Map());
    attendanceByEmployee.get(key).set(String(record.attendance_date).slice(0, 10), record.status);
  });

  const dateColumns = [];
  for (let cursor = dateFrom; cursor <= dateTo; cursor = addDays(cursor, 1)) {
    dateColumns.push(cursor);
  }

  const header = [
    "S.N.", "Aadhar No", "HRMS ID", "Employee Name", "Job Role", "CMP", "Circle",
    "DOJ", "Active/Inactive", "LWD",
    ...dateColumns.map(formatDdMmYyyy),
  ];

  const sheetRows = [header];

  employees.forEach((employee, index) => {
    const key = String(employee.employee_code || "").trim().toLowerCase();
    const employeeAttendance = attendanceByEmployee.get(key) || new Map();
    const doj = employee.date_of_joining ? String(employee.date_of_joining).slice(0, 10) : null;
    const lwd = employee.last_working_date ? String(employee.last_working_date).slice(0, 10) : null;

    const dayValues = dateColumns.map((dateStr) => {
      if ((doj && dateStr < doj) || (lwd && dateStr > lwd)) return "-";
      return employeeAttendance.get(dateStr) || "";
    });

    sheetRows.push([
      index + 1,
      employee.aadhaar_no || "",
      employee.employee_code || "",
      employee.employee_name || "",
      employee.job_role || "",
      employee.cmp || "",
      employee.circle || "",
      doj ? formatDdMmYyyy(doj) : "",
      employee.employment_status || "",
      lwd ? formatDdMmYyyy(lwd) : "",
      ...dayValues,
    ]);
  });

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance");

  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

// Flat row-per-record export used by every card popup (Present/Absent/Leave/
// Total Records) and by the toolbar "Export Excel" whenever a Status filter
// is active — unlike buildAttendanceExportBuffer's day-grid, this always
// matches the Records table 1:1, including the Status filter.
function buildFlatRecordsExportBuffer(rows) {
  const header = ["Date", "HRMS ID", "Employee Name", "Job Role", "CMP", "Circle", "Attendance Status"];
  const sheetRows = [
    header,
    ...rows.map((row) => [
      formatDdMmYyyy(String(row.attendance_date).slice(0, 10)),
      row.employee_code || "",
      row.employee_name || "",
      row.job_role || "",
      row.cmp || "",
      row.circle || "",
      row.status || "",
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance Records");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

// Flat employee-roster export for the Total Employees popup.
function buildEmployeesExportBuffer(rows) {
  const header = ["HRMS ID", "Employee Name", "Job Role", "CMP", "Circle", "Employment Status"];
  const sheetRows = [
    header,
    ...rows.map((row) => [
      row.employee_code || "",
      row.employee_name || "",
      row.job_role || "",
      row.cmp || "",
      row.circle || "",
      row.employment_status || "",
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Employees");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

// Kept in sync with the frontend's STATUS_LABELS map in
// UploadHistoryTable.jsx — exports should read the same humanized status
// the table shows, not the raw DB value.
const UPLOAD_STATUS_LABELS = {
  pending_preview: "Pending Preview",
  cancelled: "Cancelled",
  completed: "Completed",
  completed_with_errors: "Completed with Errors",
  confirmed: "Completed",
};

// Flat upload-history export — mirrors the Upload History tab's table
// exactly (same columns, same row set), with no LIMIT so it's a genuine
// full-history export rather than just "what's currently on screen".
function buildUploadHistoryExportBuffer(rows) {
  const header = [
    "Uploaded At", "Attendance Date", "File", "Uploaded By", "Status",
    "Total", "Inserted", "Updated", "Skipped", "Errors",
  ];
  const sheetRows = [
    header,
    ...rows.map((row) => {
      const uploadedAt = row.created_at ? new Date(row.created_at) : null;
      const uploadedAtStr = uploadedAt
        ? `${formatDdMmYyyy(toIsoDate(uploadedAt))} ${uploadedAt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`
        : "";
      return [
        uploadedAtStr,
        row.attendance_date ? formatDdMmYyyy(String(row.attendance_date).slice(0, 10)) : "",
        row.original_name || "",
        row.uploaded_by_name || "",
        UPLOAD_STATUS_LABELS[row.status] || row.status || "",
        row.total_rows ?? 0,
        row.inserted_rows ?? 0,
        row.updated_rows ?? 0,
        row.skipped_rows ?? 0,
        row.error_rows ?? 0,
      ];
    }),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Upload History");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

// Missing-attendance roster export for the Missing Attendance panel — one
// row per employee who has no attendance record for the checked date.
function buildMissingAttendanceExportBuffer(rows, dateStr) {
  const header = ["HRMS ID", "Employee Name", "Job Role", "CMP", "Circle"];
  const sheetRows = [
    header,
    ...rows.map((row) => [
      row.employee_code || "",
      row.employee_name || "",
      row.job_role || "",
      row.cmp || "",
      row.circle || "",
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    dateStr ? `Missing ${dateStr}`.slice(0, 31) : "Missing Attendance"
  );
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

// Failed-rows-only export for a single upload batch (spec: "Export Errors
// Excel" from the Upload Errors popup). `batch` supplies the upload-level
// date/time columns shared by every error row in the sheet.
function buildUploadErrorsExportBuffer(errors, batch) {
  const uploadDate = batch?.created_at ? new Date(batch.created_at) : null;
  const uploadDateStr = uploadDate ? toIsoDate(uploadDate) : "";
  const uploadTimeStr = uploadDate
    ? uploadDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
    : "";

  const header = [
    "Row Number", "HRMS ID", "Employee Name", "Circle", "CMP",
    "Attendance Date", "Attendance Value", "Error Type", "Error Reason",
    "Upload Date", "Upload Time",
  ];
  const sheetRows = [
    header,
    ...errors.map((err) => [
      err.row ?? "",
      err.hrmsId || err.employeeCode || "",
      err.employeeName || err.employee || "",
      err.circle || "",
      err.cmp || "",
      err.attendanceDate ? formatDdMmYyyy(err.attendanceDate) : "",
      err.attendanceValue || err.attendanceCode || "",
      err.column || "",
      err.error || err.errorType || "",
      uploadDateStr ? formatDdMmYyyy(uploadDateStr) : "",
      uploadTimeStr,
    ]),
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet(sheetRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Upload Errors");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

// ---------------------------------------------------------------------------
// Days-Uploaded calendar (spec §16-20). `employees` only needs
// date_of_joining/last_working_date; `attendanceByDate` maps
// "YYYY-MM-DD" -> { P, A, L } under the same scope. Computed entirely in
// Node (not per-day SQL) — see project note on MariaDB rejecting LIMIT
// inside IN(...) subqueries; this sidesteps that class of query entirely.
// ---------------------------------------------------------------------------

function computeCalendarDays({ dateFrom, dateTo, employees, attendanceByDate, todayStr }) {
  const days = [];
  for (let cursor = dateFrom; cursor <= dateTo; cursor = addDays(cursor, 1)) {
    const counts = attendanceByDate.get(cursor) || { P: 0, A: 0, L: 0 };
    const total = counts.P + counts.A + counts.L;

    let expected = 0;
    for (const employee of employees) {
      const doj = employee.date_of_joining ? String(employee.date_of_joining).slice(0, 10) : null;
      const lwd = employee.last_working_date ? String(employee.last_working_date).slice(0, 10) : null;
      if ((!doj || doj <= cursor) && (!lwd || lwd >= cursor)) expected += 1;
    }

    let status;
    if (cursor > todayStr) status = "future";
    else if (total > 0) status = "uploaded";
    else if (expected > 0) status = "missing";
    else status = "no_data";

    days.push({ date: cursor, status, total, present: counts.P, absent: counts.A, leave: counts.L, expected });
  }
  return days;
}

module.exports = {
  ensureAttendanceSchema,
  todayIstDateString,
  resolveAttendanceDateRange,
  validateAttendanceUpload,
  insertAttendanceRows,
  updateAttendanceRowsBulk,
  buildAttendanceExportBuffer,
  buildFlatRecordsExportBuffer,
  buildEmployeesExportBuffer,
  buildUploadHistoryExportBuffer,
  buildMissingAttendanceExportBuffer,
  buildUploadErrorsExportBuffer,
  computeCalendarDays,
  addDays,
  toIsoDate,
  istNow,
};
