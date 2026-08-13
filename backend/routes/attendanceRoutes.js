const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");

const { db } = require("../config/db");
const { createError, sendError } = require("../utils/apiErrors");
const { authMiddleware, isAllCircle } = require("../middleware/circleAccess");
const { requirePagePermission } = require("../middleware/pagePermission");
const {
  createConnectionExecutor,
  getActorContext,
  insertNotification,
} = require("../services/physicalDomainService");
const {
  ensureAttendanceSchema,
  todayIstDateString,
  resolveAttendanceDateRange,
  validateAttendanceUpload,
  insertAttendanceRows,
  updateAttendanceRowsBulk,
  buildAttendanceExportBuffer,
  buildFlatRecordsExportBuffer,
  buildEmployeesExportBuffer,
  buildMissingAttendanceExportBuffer,
  buildUploadErrorsExportBuffer,
  computeCalendarDays,
  toIsoDate,
  istNow,
} = require("../services/attendanceService");
const { ATTENDANCE_CODES } = require("../constants/attendanceCodes");

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

router.use(authMiddleware);

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });

const getConnection = () =>
  new Promise((resolve, reject) => {
    db.getConnection((err, conn) => (err ? reject(err) : resolve(conn)));
  });

// Runs once per process, same lazy-cached-promise idiom as physicalRoutes.js.
let attendanceSchemaPromise = null;
function ensureAttendanceTables() {
  if (!attendanceSchemaPromise) {
    attendanceSchemaPromise = ensureAttendanceSchema(query).catch((error) => {
      attendanceSchemaPromise = null;
      throw error;
    });
  }
  return attendanceSchemaPromise;
}
ensureAttendanceTables().catch((error) =>
  console.error("Attendance schema migration failed:", error)
);

function buildEmployeeScopeConditions(req, alias) {
  const conditions = [`COALESCE(${alias}.is_deleted, 0) = 0`];
  const params = [];

  if (!isAllCircle(req.authUser)) {
    conditions.push(`LOWER(TRIM(${alias}.circle)) = LOWER(TRIM(?))`);
    params.push(req.authUser.circle);
  }

  const circle = String(req.query.circle || "").trim();
  if (circle) {
    conditions.push(`LOWER(TRIM(${alias}.circle)) = LOWER(TRIM(?))`);
    params.push(circle);
  }

  const cmp = String(req.query.cmp || "").trim();
  if (cmp) {
    conditions.push(`LOWER(TRIM(${alias}.cmp)) = LOWER(TRIM(?))`);
    params.push(cmp);
  }

  const jobRole = String(req.query.jobRole || "").trim();
  if (jobRole) {
    conditions.push(`LOWER(TRIM(${alias}.job_role)) = LOWER(TRIM(?))`);
    params.push(jobRole);
  }

  return { conditions, params };
}

router.get("/codes", (_req, res) => {
  res.json({ success: true, codes: ATTENDANCE_CODES });
});

// -- Upload: validate (no save) -------------------------------------------
router.post("/upload/validate", upload.single("file"), async (req, res) => {
  try {
    await ensureAttendanceTables();

    if (!req.file) {
      throw createError("No file uploaded.", 400, "NO_FILE");
    }

    const allowedExtensions = [".xlsx", ".xls", ".csv"];
    const fileExtension = "." + (req.file.originalname.split(".").pop() || "").toLowerCase();
    if (!allowedExtensions.includes(fileExtension)) {
      throw createError("Only XLSX, XLS and CSV files are allowed.", 400, "INVALID_FILE_TYPE");
    }

    const attendanceDateStr = String(req.body.attendanceDate || req.body.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(attendanceDateStr)) {
      throw createError("A valid Attendance Date is required.", 400, "INVALID_DATE");
    }
    if (attendanceDateStr > todayIstDateString()) {
      throw createError("Future attendance cannot be uploaded.", 400, "FUTURE_DATE");
    }

    const workbook = XLSX.read(req.file.buffer, { type: "buffer", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(worksheet, { defval: null });

    const { previewRows, errors, summary } = await validateAttendanceUpload({
      rows,
      attendanceDateStr,
      authUser: req.authUser,
      query,
    });

    const actor = getActorContext(req);

    const insertResult = await query(
      `
        INSERT INTO attendance_uploads (
          attendance_date, original_name, uploaded_by_id, uploaded_by_name,
          status, total_rows, valid_rows, error_rows, conflict_rows,
          preview_payload_json, summary_json, errors_json
        ) VALUES (?, ?, ?, ?, 'pending_preview', ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        attendanceDateStr,
        req.file.originalname,
        actor.actorUserId,
        actor.actorName,
        summary.totalRows,
        summary.validRows,
        summary.errorRows,
        summary.conflictRows,
        JSON.stringify(previewRows),
        JSON.stringify(summary),
        // Stored now (not recomputed at confirm) so it survives even if this
        // batch is never confirmed, and "View Errors" always reflects exactly
        // what validation found for this specific upload attempt.
        errors.length ? JSON.stringify(errors) : null,
      ]
    );

    return res.json({
      success: true,
      batchId: insertResult.insertId,
      attendanceDate: attendanceDateStr,
      summary,
      previewRows,
      errors,
    });
  } catch (error) {
    console.error("Attendance upload validate error:", error);
    return sendError(res, error, "Failed to validate the attendance file.");
  }
});

// -- Upload: confirm (writes to DB) ---------------------------------------
router.post("/upload/confirm", async (req, res) => {
  let conn;

  try {
    await ensureAttendanceTables();

    const batchId = Number(req.body.batchId);
    const duplicateAction = req.body.duplicateAction || null;
    if (!batchId) {
      throw createError("batchId is required.", 400, "MISSING_BATCH_ID");
    }
    if (duplicateAction && !["skip", "update"].includes(duplicateAction)) {
      throw createError("duplicateAction must be 'skip' or 'update'.", 400, "INVALID_DUPLICATE_ACTION");
    }

    const batchRows = await query(`SELECT * FROM attendance_uploads WHERE id = ? LIMIT 1`, [batchId]);
    const batch = batchRows[0];
    if (!batch) {
      throw createError("Upload batch not found.", 404, "BATCH_NOT_FOUND");
    }
    if (batch.status !== "pending_preview") {
      throw createError("This upload has already been confirmed or cancelled.", 400, "BATCH_NOT_PENDING");
    }

    const previewRows = JSON.parse(batch.preview_payload_json || "[]");
    // Partial-success by design: rows that failed validation are simply
    // never inserted (see rowsToInsert below, filtered to status==='valid')
    // — they don't block the rest of the batch from saving. Their details
    // were already persisted to errors_json at /upload/validate time, so
    // they stay reviewable/exportable from Upload History afterward.
    const errorRowCount = previewRows.filter((row) => row.status === "error").length;

    const conflictRows = previewRows.filter((row) => row.status === "conflict");
    if (conflictRows.length && !duplicateAction) {
      throw createError(
        "This upload has attendance already recorded for some employees. Choose Skip or Update to continue.",
        400,
        "DUPLICATE_ACTION_REQUIRED"
      );
    }

    const attendanceDateStr = String(batch.attendance_date).slice(0, 10);

    const rowsToInsert = previewRows
      .filter((row) => row.status === "valid")
      .map((row) => ({
        hrmsId: row.hrmsId,
        physicalId: row.physicalId,
        attendanceCode: row.attendanceCode,
        attendanceDate: attendanceDateStr,
      }));

    const rowsToUpdate = duplicateAction === "update"
      ? conflictRows.map((row) => ({ existingId: row.existingId, attendanceCode: row.attendanceCode }))
      : [];
    const skippedCount = duplicateAction === "skip" ? conflictRows.length : 0;

    const actor = getActorContext(req);

    conn = await getConnection();
    await conn.promise().beginTransaction();

    await insertAttendanceRows(conn, rowsToInsert, batchId, actor.actorUserId);
    await updateAttendanceRowsBulk(conn, rowsToUpdate, batchId, actor.actorUserId);

    const finalStatus = errorRowCount > 0 ? "completed_with_errors" : "completed";

    const executor = createConnectionExecutor(conn);
    await insertNotification(executor, {
      moduleName: "attendance",
      eventType: "ATTENDANCE_UPLOAD_CONFIRMED",
      title: errorRowCount > 0 ? "Attendance uploaded with errors" : "Attendance uploaded",
      message: `${rowsToInsert.length + rowsToUpdate.length} attendance record(s) saved for ${attendanceDateStr}` +
        (errorRowCount > 0 ? `, ${errorRowCount} row(s) skipped due to errors.` : "."),
      circle: isAllCircle(req.authUser) ? null : req.authUser.circle,
      actorUserId: actor.actorUserId,
      referenceId: batchId,
      referenceType: "attendance_upload",
    });

    await conn.promise().query(
      `
        UPDATE attendance_uploads
        SET status = ?,
            duplicate_action = ?,
            inserted_rows = ?,
            updated_rows = ?,
            skipped_rows = ?,
            preview_payload_json = NULL,
            confirmed_at = NOW()
        WHERE id = ?
      `,
      [finalStatus, duplicateAction, rowsToInsert.length, rowsToUpdate.length, skippedCount, batchId]
    );

    await conn.promise().commit();

    return res.json({
      success: true,
      message: errorRowCount > 0
        ? `Attendance saved with ${errorRowCount} error row(s) skipped.`
        : "Attendance saved successfully.",
      summary: {
        inserted: rowsToInsert.length,
        updated: rowsToUpdate.length,
        skipped: skippedCount,
        errorRows: errorRowCount,
      },
    });
  } catch (error) {
    if (conn) {
      try {
        await conn.promise().rollback();
      } catch (_rollbackError) {
        // ignore — connection will be released below regardless
      }
    }
    console.error("Attendance upload confirm error:", error);
    return sendError(res, error, "Failed to save attendance.");
  } finally {
    if (conn) conn.release();
  }
});

// -- Upload: cancel ---------------------------------------------------------
router.post("/upload/cancel", async (req, res) => {
  try {
    await ensureAttendanceTables();
    const batchId = Number(req.body.batchId);
    if (!batchId) {
      throw createError("batchId is required.", 400, "MISSING_BATCH_ID");
    }

    await query(
      `
        UPDATE attendance_uploads
        SET status = 'cancelled', preview_payload_json = NULL
        WHERE id = ? AND status = 'pending_preview'
      `,
      [batchId]
    );

    return res.json({ success: true });
  } catch (error) {
    return sendError(res, error, "Failed to cancel the upload.");
  }
});

// -- Upload / audit history --------------------------------------------------
router.get("/uploads", async (req, res) => {
  try {
    await ensureAttendanceTables();
    const rows = await query(`
      SELECT id, attendance_date, original_name, uploaded_by_name, status, duplicate_action,
             total_rows, valid_rows, error_rows, conflict_rows, inserted_rows, updated_rows, skipped_rows,
             created_at, confirmed_at
      FROM attendance_uploads
      ORDER BY id DESC
      LIMIT 200
    `);
    return res.json({ success: true, uploads: rows });
  } catch (error) {
    return sendError(res, error, "Failed to load upload history.");
  }
});

// -- Upload errors: view / export (spec §24-26) -----------------------------
router.get("/uploads/:id/errors", async (req, res) => {
  try {
    await ensureAttendanceTables();
    const batchId = Number(req.params.id);
    if (!batchId) {
      throw createError("A valid upload id is required.", 400, "INVALID_BATCH_ID");
    }

    const rows = await query(
      `SELECT id, attendance_date, original_name, uploaded_by_name, total_rows, errors_json
       FROM attendance_uploads WHERE id = ? LIMIT 1`,
      [batchId]
    );
    const batch = rows[0];
    if (!batch) {
      throw createError("Upload batch not found.", 404, "BATCH_NOT_FOUND");
    }

    const errors = batch.errors_json ? JSON.parse(batch.errors_json) : [];
    return res.json({
      success: true,
      errors,
      totalRecords: batch.total_rows,
      attendanceDate: String(batch.attendance_date).slice(0, 10),
      originalName: batch.original_name,
      uploadedByName: batch.uploaded_by_name,
    });
  } catch (error) {
    return sendError(res, error, "Failed to load upload errors.");
  }
});

router.get("/uploads/:id/errors/export", async (req, res) => {
  try {
    await ensureAttendanceTables();
    const batchId = Number(req.params.id);
    if (!batchId) {
      throw createError("A valid upload id is required.", 400, "INVALID_BATCH_ID");
    }

    const rows = await query(
      `SELECT id, attendance_date, original_name, created_at, errors_json
       FROM attendance_uploads WHERE id = ? LIMIT 1`,
      [batchId]
    );
    const batch = rows[0];
    if (!batch) {
      throw createError("Upload batch not found.", 404, "BATCH_NOT_FOUND");
    }

    const errors = batch.errors_json ? JSON.parse(batch.errors_json) : [];
    const buffer = buildUploadErrorsExportBuffer(
      errors.map((e) => ({ ...e, attendanceDate: String(batch.attendance_date).slice(0, 10) })),
      batch
    );

    const dateLabel = String(batch.attendance_date).slice(0, 10);
    res.setHeader("Content-Disposition", `attachment; filename="Attendance_Upload_Errors_${dateLabel}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    return sendError(res, error, "Failed to export upload errors.");
  }
});

// Allowlist so `sortBy` can only ever resolve to one of these known columns
// (never interpolate user input straight into ORDER BY).
const RECORD_SORT_COLUMNS = {
  date: "a.attendance_date",
  name: "p.employee_name",
  status: "a.status",
  circle: "p.circle",
  cmp: "p.cmp",
};

// Shared by /records, /records/export and the delete endpoints so they can
// never disagree about which rows a given circle/CMP/job-role/status/search/
// date-range combination resolves to.
function buildRecordsScopeConditions(req) {
  const { dateFrom, dateTo } = resolveAttendanceDateRange({
    range: req.query.range,
    from: req.query.from,
    to: req.query.to,
  });

  const { conditions, params } = buildEmployeeScopeConditions(req, "p");
  conditions.push("a.attendance_date BETWEEN ? AND ?");
  params.push(dateFrom, dateTo);

  const status = String(req.query.status || "").trim();
  if (status) {
    conditions.push("a.status = ?");
    params.push(status);
  }

  const search = String(req.query.search || "").trim();
  if (search) {
    conditions.push("(p.employee_name LIKE ? OR p.employee_code LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }

  return { conditions, params, dateFrom, dateTo };
}

// -- Records ------------------------------------------------------------------
router.get("/records", async (req, res) => {
  try {
    await ensureAttendanceTables();

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const { conditions, params } = buildRecordsScopeConditions(req);

    const whereSql = `WHERE ${conditions.join(" AND ")}`;
    const joinSql = `
      FROM attendance a
      JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
      ${whereSql}
    `;

    const sortColumn = RECORD_SORT_COLUMNS[String(req.query.sortBy || "").trim()] || RECORD_SORT_COLUMNS.date;
    const sortDir = String(req.query.sortDir || "").trim().toLowerCase() === "asc" ? "ASC" : "DESC";
    // Secondary sort keeps ordering stable/predictable regardless of the primary column.
    const orderSql = sortColumn === RECORD_SORT_COLUMNS.date
      ? `a.attendance_date ${sortDir}, p.employee_name ASC`
      : `${sortColumn} ${sortDir}, a.attendance_date DESC`;

    // Count and page both hit the pool independently — run them concurrently
    // instead of back-to-back so the page only pays for one round trip, not two.
    const [countRows, rows] = await Promise.all([
      query(`SELECT COUNT(*) AS total ${joinSql}`, params),
      query(
        `
          SELECT a.id, a.employee_code, a.attendance_date, a.status,
                 p.employee_name, p.job_role, p.cmp, p.circle
          ${joinSql}
          ORDER BY ${orderSql}
          LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      ),
    ]);

    return res.json({
      success: true,
      records: rows,
      pagination: { page, pageSize, total: Number(countRows[0]?.total || 0) },
    });
  } catch (error) {
    return sendError(res, error, "Failed to load attendance records.");
  }
});

// -- Records: flat filtered export (spec §27-29) -----------------------------
// Used by every card popup's Export Excel, and by the toolbar Export Excel
// whenever a Status filter is active — always matches /records exactly
// (same buildRecordsScopeConditions), unlike the day-grid /report/export.
router.get("/records/export", async (req, res) => {
  try {
    await ensureAttendanceTables();

    const { conditions, params } = buildRecordsScopeConditions(req);
    const rows = await query(
      `
        SELECT a.id, a.employee_code, a.attendance_date, a.status,
               p.employee_name, p.job_role, p.cmp, p.circle
        FROM attendance a
        JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
        WHERE ${conditions.join(" AND ")}
        ORDER BY a.attendance_date DESC, p.employee_name ASC
      `,
      params
    );

    const buffer = buildFlatRecordsExportBuffer(rows);
    res.setHeader("Content-Disposition", `attachment; filename="attendance_records_${Date.now()}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    return sendError(res, error, "Failed to export attendance records.");
  }
});

// -- Records: delete (spec §30-31) --------------------------------------------
router.delete("/records/:id", requirePagePermission("attendance", "delete"), async (req, res) => {
  try {
    await ensureAttendanceTables();
    const id = Number(req.params.id);
    if (!id) {
      throw createError("A valid record id is required.", 400, "INVALID_ID");
    }

    const conditions = ["a.id = ?"];
    const params = [id];
    if (!isAllCircle(req.authUser)) {
      conditions.push("LOWER(TRIM(p.circle)) = LOWER(TRIM(?))");
      params.push(req.authUser.circle);
    }

    const result = await query(
      `
        DELETE a FROM attendance a
        JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
        WHERE ${conditions.join(" AND ")}
      `,
      params
    );

    if (!result.affectedRows) {
      throw createError("Record not found or you cannot access it.", 404, "RECORD_NOT_FOUND");
    }

    return res.json({ success: true, message: "Attendance record deleted." });
  } catch (error) {
    return sendError(res, error, "Failed to delete the attendance record.");
  }
});

router.post("/records/bulk-delete", requirePagePermission("attendance", "delete"), async (req, res) => {
  try {
    await ensureAttendanceTables();

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const numericIds = [...new Set(ids.map((id) => Number(id)))].filter(
      (id) => Number.isInteger(id) && id > 0
    );
    if (!numericIds.length) {
      throw createError("Please select at least one record to delete.", 400, "NO_IDS");
    }

    const conditions = [`a.id IN (${numericIds.map(() => "?").join(",")})`];
    const params = [...numericIds];
    if (!isAllCircle(req.authUser)) {
      conditions.push("LOWER(TRIM(p.circle)) = LOWER(TRIM(?))");
      params.push(req.authUser.circle);
    }

    const result = await query(
      `
        DELETE a FROM attendance a
        JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
        WHERE ${conditions.join(" AND ")}
      `,
      params
    );

    if (!result.affectedRows) {
      throw createError("None of the selected records could be deleted.", 404, "NO_RECORDS_DELETED");
    }

    return res.json({
      success: true,
      message: `${result.affectedRows} attendance record(s) deleted.`,
      deleted: result.affectedRows,
    });
  } catch (error) {
    return sendError(res, error, "Failed to delete the selected attendance records.");
  }
});

// -- Dashboard summary ---------------------------------------------------------
router.get("/dashboard/summary", async (req, res) => {
  try {
    await ensureAttendanceTables();

    const { dateFrom, dateTo } = resolveAttendanceDateRange({
      range: req.query.range,
      from: req.query.from,
      to: req.query.to,
    });
    const totalDaysInRange = Math.round(
      (new Date(`${dateTo}T00:00:00Z`) - new Date(`${dateFrom}T00:00:00Z`)) / 86400000
    ) + 1;

    const { conditions, params } = buildEmployeeScopeConditions(req, "p");
    const whereSql = conditions.join(" AND ");

    // None of these three depend on each other's result — run them
    // concurrently against the pool instead of one round trip at a time.
    const [totalEmployeesRows, statusRows, uploadedDaysRows] = await Promise.all([
      query(
        `SELECT COUNT(*) AS total FROM physical p WHERE ${whereSql}`,
        params
      ),
      query(
        `
          SELECT a.status, COUNT(*) AS total
          FROM attendance a
          JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
          WHERE a.attendance_date BETWEEN ? AND ? AND ${whereSql}
          GROUP BY a.status
        `,
        [dateFrom, dateTo, ...params]
      ),
      query(
        `
          SELECT COUNT(DISTINCT a.attendance_date) AS days
          FROM attendance a
          JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
          WHERE a.attendance_date BETWEEN ? AND ? AND ${whereSql}
        `,
        [dateFrom, dateTo, ...params]
      ),
    ]);

    const counts = { P: 0, A: 0, L: 0 };
    let totalRecords = 0;
    statusRows.forEach((row) => {
      counts[row.status] = Number(row.total);
      totalRecords += Number(row.total);
    });

    return res.json({
      success: true,
      totalEmployees: Number(totalEmployeesRows[0]?.total || 0),
      present: counts.P,
      absent: counts.A,
      leave: counts.L,
      totalRecords,
      daysUploaded: Number(uploadedDaysRows[0]?.days || 0),
      totalDaysInRange,
      dateFrom,
      dateTo,
    });
  } catch (error) {
    return sendError(res, error, "Failed to load the attendance dashboard summary.");
  }
});

// -- Missing attendance ---------------------------------------------------------
// Shared by the dashboard panel and its export — throws on a missing/invalid
// `date` query param so both routes get the same 400 behaviour for free.
async function fetchMissingAttendanceRows(req) {
  await ensureAttendanceTables();

  const dateStr = String(req.query.date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw createError("A valid date (YYYY-MM-DD) is required.", 400, "INVALID_DATE");
  }

  const { conditions, params } = buildEmployeeScopeConditions(req, "p");
  conditions.push("(p.date_of_joining IS NULL OR p.date_of_joining <= ?)");
  params.push(dateStr);
  conditions.push("(p.last_working_date IS NULL OR p.last_working_date >= ?)");
  params.push(dateStr);

  const rows = await query(
    `
      SELECT p.employee_code, p.employee_name, p.job_role, p.cmp, p.circle
      FROM physical p
      WHERE ${conditions.join(" AND ")}
        AND NOT EXISTS (
          SELECT 1 FROM attendance a
          WHERE a.attendance_date = ?
            AND LOWER(TRIM(a.employee_code)) = LOWER(TRIM(p.employee_code))
        )
      ORDER BY p.employee_name ASC
    `,
    [...params, dateStr]
  );

  return { rows, dateStr };
}

router.get("/dashboard/missing", async (req, res) => {
  try {
    const { rows } = await fetchMissingAttendanceRows(req);
    return res.json({ success: true, missing: rows, count: rows.length });
  } catch (error) {
    return sendError(res, error, "Failed to load missing attendance.");
  }
});

router.get("/dashboard/missing/export", async (req, res) => {
  try {
    const { rows, dateStr } = await fetchMissingAttendanceRows(req);
    const buffer = buildMissingAttendanceExportBuffer(rows, dateStr);

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="missing_attendance_${dateStr}.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.send(buffer);
  } catch (error) {
    return sendError(res, error, "Failed to export missing attendance.");
  }
});

// -- Attendance report export ---------------------------------------------------------
router.get("/report/export", async (req, res) => {
  try {
    await ensureAttendanceTables();

    const { dateFrom, dateTo } = resolveAttendanceDateRange({
      range: req.query.range,
      from: req.query.from,
      to: req.query.to,
    });

    const buffer = await buildAttendanceExportBuffer({
      query,
      dateFrom,
      dateTo,
      filters: {
        circle: String(req.query.circle || "").trim() || null,
        cmp: String(req.query.cmp || "").trim() || null,
        jobRole: String(req.query.jobRole || "").trim() || null,
      },
      authUser: req.authUser,
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="attendance_${dateFrom}_to_${dateTo}.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    return res.send(buffer);
  } catch (error) {
    return sendError(res, error, "Failed to export the attendance report.");
  }
});

// Allowlist mirroring RECORD_SORT_COLUMNS, for the Total Employees popup.
const EMPLOYEE_SORT_COLUMNS = {
  name: "p.employee_name",
  hrmsId: "p.employee_code",
  jobRole: "p.job_role",
  cmp: "p.cmp",
  circle: "p.circle",
};

function buildEmployeesQueryParts(req) {
  const { conditions, params } = buildEmployeeScopeConditions(req, "p");
  const search = String(req.query.search || "").trim();
  if (search) {
    conditions.push("(p.employee_name LIKE ? OR p.employee_code LIKE ?)");
    params.push(`%${search}%`, `%${search}%`);
  }
  return { conditions, params };
}

// -- Total Employees popup (spec §10) -----------------------------------------
router.get("/employees", async (req, res) => {
  try {
    await ensureAttendanceTables();

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const { conditions, params } = buildEmployeesQueryParts(req);
    const whereSql = conditions.join(" AND ");

    const sortColumn = EMPLOYEE_SORT_COLUMNS[String(req.query.sortBy || "").trim()] || EMPLOYEE_SORT_COLUMNS.name;
    const sortDir = String(req.query.sortDir || "").trim().toLowerCase() === "desc" ? "DESC" : "ASC";

    const [countRows, rows] = await Promise.all([
      query(`SELECT COUNT(*) AS total FROM physical p WHERE ${whereSql}`, params),
      query(
        `
          SELECT p.id, p.employee_code, p.employee_name, p.job_role, p.cmp, p.circle, p.employment_status
          FROM physical p
          WHERE ${whereSql}
          ORDER BY ${sortColumn} ${sortDir}, p.employee_name ASC
          LIMIT ? OFFSET ?
        `,
        [...params, pageSize, offset]
      ),
    ]);

    return res.json({
      success: true,
      employees: rows,
      pagination: { page, pageSize, total: Number(countRows[0]?.total || 0) },
    });
  } catch (error) {
    return sendError(res, error, "Failed to load employees.");
  }
});

router.get("/employees/export", async (req, res) => {
  try {
    await ensureAttendanceTables();
    const { conditions, params } = buildEmployeesQueryParts(req);

    const rows = await query(
      `
        SELECT p.employee_code, p.employee_name, p.job_role, p.cmp, p.circle, p.employment_status
        FROM physical p
        WHERE ${conditions.join(" AND ")}
        ORDER BY p.employee_name ASC
      `,
      params
    );

    const buffer = buildEmployeesExportBuffer(rows);
    res.setHeader("Content-Disposition", `attachment; filename="attendance_employees_${Date.now()}.xlsx"`);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    return res.send(buffer);
  } catch (error) {
    return sendError(res, error, "Failed to export employees.");
  }
});

// -- Days-Uploaded calendar (spec §16-20) -------------------------------------
router.get("/calendar", async (req, res) => {
  try {
    await ensureAttendanceTables();

    const monthStr = String(req.query.month || "").trim();
    if (!/^\d{4}-\d{2}$/.test(monthStr)) {
      throw createError("A valid month (YYYY-MM) is required.", 400, "INVALID_MONTH");
    }
    const [year, month] = monthStr.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const dateFrom = `${monthStr}-01`;
    const dateTo = `${monthStr}-${String(lastDay).padStart(2, "0")}`;

    const { conditions, params } = buildEmployeeScopeConditions(req, "p");
    const whereSql = conditions.join(" AND ");

    const [employees, attendanceRows] = await Promise.all([
      query(
        `SELECT date_of_joining, last_working_date FROM physical p WHERE ${whereSql}`,
        params
      ),
      query(
        `
          SELECT a.attendance_date, a.status, COUNT(*) AS total
          FROM attendance a
          JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
          WHERE a.attendance_date BETWEEN ? AND ? AND ${whereSql}
          GROUP BY a.attendance_date, a.status
        `,
        [dateFrom, dateTo, ...params]
      ),
    ]);

    const attendanceByDate = new Map();
    attendanceRows.forEach((row) => {
      const dateKey = String(row.attendance_date).slice(0, 10);
      if (!attendanceByDate.has(dateKey)) attendanceByDate.set(dateKey, { P: 0, A: 0, L: 0 });
      attendanceByDate.get(dateKey)[row.status] = Number(row.total);
    });

    const days = computeCalendarDays({
      dateFrom,
      dateTo,
      employees,
      attendanceByDate,
      todayStr: toIsoDate(istNow()),
    });

    return res.json({ success: true, month: monthStr, days });
  } catch (error) {
    return sendError(res, error, "Failed to load the attendance calendar.");
  }
});

router.get("/calendar/day", async (req, res) => {
  try {
    await ensureAttendanceTables();

    const dateStr = String(req.query.date || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      throw createError("A valid date (YYYY-MM-DD) is required.", 400, "INVALID_DATE");
    }

    const { conditions, params } = buildEmployeeScopeConditions(req, "p");
    const whereSql = conditions.join(" AND ");

    const [statusRows, uploadRows] = await Promise.all([
      query(
        `
          SELECT a.status, COUNT(*) AS total
          FROM attendance a
          JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
          WHERE a.attendance_date = ? AND ${whereSql}
          GROUP BY a.status
        `,
        [dateStr, ...params]
      ),
      query(
        `
          SELECT au.id, au.original_name, au.uploaded_by_name, au.status,
                 au.total_rows, au.valid_rows, au.error_rows, au.inserted_rows,
                 au.updated_rows, au.skipped_rows, au.created_at, au.confirmed_at
          FROM attendance_uploads au
          WHERE au.attendance_date = ?
            AND EXISTS (
              SELECT 1 FROM attendance a
              JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
              WHERE a.upload_batch_id = au.id AND ${whereSql}
            )
          ORDER BY au.id DESC
        `,
        [dateStr, ...params]
      ),
    ]);

    const counts = { P: 0, A: 0, L: 0 };
    let total = 0;
    statusRows.forEach((row) => {
      counts[row.status] = Number(row.total);
      total += Number(row.total);
    });

    return res.json({
      success: true,
      date: dateStr,
      total,
      present: counts.P,
      absent: counts.A,
      leave: counts.L,
      uploads: uploadRows,
    });
  } catch (error) {
    return sendError(res, error, "Failed to load the attendance for this date.");
  }
});

module.exports = router;
