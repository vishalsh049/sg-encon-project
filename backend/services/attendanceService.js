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

  // ensureColumn calls kept even though the CREATE TABLE above already has
  // every column, so future additions follow the same additive pattern used
  // by every other module in this codebase.
  await ensureColumn("attendance", "physical_id", "INT DEFAULT NULL");
  await ensureColumn("attendance", "upload_batch_id", "INT DEFAULT NULL");
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
// Monthly export (spec §24/§25): vertical `attendance` data pivoted into
// dynamic per-day columns at export time only — the table itself never has
// per-day columns.
// ---------------------------------------------------------------------------

function daysInMonth(year, month1to12) {
  return new Date(year, month1to12, 0).getDate();
}

function formatDdMmYyyy(dateStr) {
  const [y, m, d] = dateStr.split("-");
  return `${d}-${m}-${y}`;
}

async function buildMonthlyExportBuffer({ query, month, filters, authUser }) {
  const [yearStr, monthStr] = String(month || "").split("-");
  const year = Number(yearStr);
  const monthNum = Number(monthStr);
  if (!year || !monthNum || monthNum < 1 || monthNum > 12) {
    throw createError("A valid month (YYYY-MM) is required.", 400, "INVALID_MONTH");
  }

  const totalDays = daysInMonth(year, monthNum);
  const monthStart = `${yearStr}-${monthStr}-01`;
  const monthEnd = `${yearStr}-${monthStr}-${String(totalDays).padStart(2, "0")}`;

  const conditions = ["COALESCE(is_deleted, 0) = 0"];
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
  if (filters.status) {
    conditions.push("LOWER(TRIM(employment_status)) = LOWER(TRIM(?))");
    params.push(filters.status);
  }

  const employees = await query(
    `
      SELECT id, employee_code, employee_name, job_role, cmp, circle,
             date_of_joining, employment_status, last_working_date, aadhaar_no
      FROM physical
      WHERE ${conditions.join(" AND ")}
      ORDER BY employee_name ASC
    `,
    params
  );

  const attendanceRows = await query(
    `
      SELECT employee_code, attendance_date, status
      FROM attendance
      WHERE attendance_date BETWEEN ? AND ?
    `,
    [monthStart, monthEnd]
  );

  const attendanceByEmployee = new Map();
  attendanceRows.forEach((record) => {
    const key = String(record.employee_code || "").trim().toLowerCase();
    if (!attendanceByEmployee.has(key)) attendanceByEmployee.set(key, new Map());
    attendanceByEmployee.get(key).set(String(record.attendance_date).slice(0, 10), record.status);
  });

  const dateColumns = Array.from({ length: totalDays }, (_, i) => {
    const day = String(i + 1).padStart(2, "0");
    return `${yearStr}-${monthStr}-${day}`;
  });

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

module.exports = {
  ensureAttendanceSchema,
  todayIstDateString,
  validateAttendanceUpload,
  insertAttendanceRows,
  updateAttendanceRowsBulk,
  buildMonthlyExportBuffer,
};
