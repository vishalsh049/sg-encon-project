const express = require("express");
const multer = require("multer");
const XLSX = require("xlsx");

const { db } = require("../config/db");
const { createError, sendError } = require("../utils/apiErrors");
const { authMiddleware, isAllCircle } = require("../middleware/circleAccess");
const {
  createConnectionExecutor,
  getActorContext,
  insertNotification,
} = require("../services/physicalDomainService");
const {
  ensureAttendanceSchema,
  todayIstDateString,
  validateAttendanceUpload,
  insertAttendanceRows,
  updateAttendanceRowsBulk,
  buildMonthlyExportBuffer,
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
          preview_payload_json, summary_json
        ) VALUES (?, ?, ?, ?, 'pending_preview', ?, ?, ?, ?, ?, ?)
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
    if (previewRows.some((row) => row.status === "error")) {
      throw createError("This upload still has validation errors and cannot be saved.", 400, "HAS_ERRORS");
    }

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

    const executor = createConnectionExecutor(conn);
    await insertNotification(executor, {
      moduleName: "attendance",
      eventType: "ATTENDANCE_UPLOAD_CONFIRMED",
      title: "Attendance uploaded",
      message: `${rowsToInsert.length + rowsToUpdate.length} attendance record(s) saved for ${attendanceDateStr}.`,
      circle: isAllCircle(req.authUser) ? null : req.authUser.circle,
      actorUserId: actor.actorUserId,
      referenceId: batchId,
      referenceType: "attendance_upload",
    });

    await conn.promise().query(
      `
        UPDATE attendance_uploads
        SET status = 'confirmed',
            duplicate_action = ?,
            inserted_rows = ?,
            updated_rows = ?,
            skipped_rows = ?,
            preview_payload_json = NULL,
            confirmed_at = NOW()
        WHERE id = ?
      `,
      [duplicateAction, rowsToInsert.length, rowsToUpdate.length, skippedCount, batchId]
    );

    await conn.promise().commit();

    return res.json({
      success: true,
      message: "Attendance saved successfully.",
      summary: {
        inserted: rowsToInsert.length,
        updated: rowsToUpdate.length,
        skipped: skippedCount,
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

// -- Records ------------------------------------------------------------------
router.get("/records", async (req, res) => {
  try {
    await ensureAttendanceTables();

    const page = Math.max(1, Number(req.query.page) || 1);
    const pageSize = Math.min(200, Math.max(1, Number(req.query.pageSize) || 50));
    const offset = (page - 1) * pageSize;

    const { conditions, params } = buildEmployeeScopeConditions(req, "p");

    const dateFrom = String(req.query.dateFrom || "").trim();
    if (dateFrom) {
      conditions.push("a.attendance_date >= ?");
      params.push(dateFrom);
    }
    const dateTo = String(req.query.dateTo || "").trim();
    if (dateTo) {
      conditions.push("a.attendance_date <= ?");
      params.push(dateTo);
    }

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

    const whereSql = `WHERE ${conditions.join(" AND ")}`;
    const joinSql = `
      FROM attendance a
      JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
      ${whereSql}
    `;

    const countRows = await query(`SELECT COUNT(*) AS total ${joinSql}`, params);

    const rows = await query(
      `
        SELECT a.id, a.employee_code, a.attendance_date, a.status,
               p.employee_name, p.job_role, p.cmp, p.circle
        ${joinSql}
        ORDER BY a.attendance_date DESC, p.employee_name ASC
        LIMIT ? OFFSET ?
      `,
      [...params, pageSize, offset]
    );

    return res.json({
      success: true,
      records: rows,
      pagination: { page, pageSize, total: Number(countRows[0]?.total || 0) },
    });
  } catch (error) {
    return sendError(res, error, "Failed to load attendance records.");
  }
});

// -- Dashboard summary ---------------------------------------------------------
router.get("/dashboard/summary", async (req, res) => {
  try {
    await ensureAttendanceTables();

    const month = String(req.query.month || "").trim();
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw createError("A valid month (YYYY-MM) is required.", 400, "INVALID_MONTH");
    }

    const [yearStr, monthStr] = month.split("-");
    const totalDaysInMonth = new Date(Number(yearStr), Number(monthStr), 0).getDate();
    const monthStart = `${month}-01`;
    const monthEnd = `${month}-${String(totalDaysInMonth).padStart(2, "0")}`;

    const { conditions, params } = buildEmployeeScopeConditions(req, "p");
    const whereSql = conditions.join(" AND ");

    const totalEmployeesRows = await query(
      `SELECT COUNT(*) AS total FROM physical p WHERE ${whereSql}`,
      params
    );

    const statusRows = await query(
      `
        SELECT a.status, COUNT(*) AS total
        FROM attendance a
        JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
        WHERE a.attendance_date BETWEEN ? AND ? AND ${whereSql}
        GROUP BY a.status
      `,
      [monthStart, monthEnd, ...params]
    );

    const uploadedDaysRows = await query(
      `
        SELECT COUNT(DISTINCT a.attendance_date) AS days
        FROM attendance a
        JOIN physical p ON LOWER(TRIM(p.employee_code)) = LOWER(TRIM(a.employee_code))
        WHERE a.attendance_date BETWEEN ? AND ? AND ${whereSql}
      `,
      [monthStart, monthEnd, ...params]
    );

    const counts = { P: 0, A: 0, L: 0 };
    statusRows.forEach((row) => {
      counts[row.status] = Number(row.total);
    });

    return res.json({
      success: true,
      totalEmployees: Number(totalEmployeesRows[0]?.total || 0),
      present: counts.P,
      absent: counts.A,
      leave: counts.L,
      daysUploaded: Number(uploadedDaysRows[0]?.days || 0),
      totalDaysInMonth,
    });
  } catch (error) {
    return sendError(res, error, "Failed to load the attendance dashboard summary.");
  }
});

// -- Missing attendance ---------------------------------------------------------
router.get("/dashboard/missing", async (req, res) => {
  try {
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

    return res.json({ success: true, missing: rows, count: rows.length });
  } catch (error) {
    return sendError(res, error, "Failed to load missing attendance.");
  }
});

// -- Monthly report export ---------------------------------------------------------
router.get("/report/export", async (req, res) => {
  try {
    await ensureAttendanceTables();

    const buffer = await buildMonthlyExportBuffer({
      query,
      month: req.query.month,
      filters: {
        circle: String(req.query.circle || "").trim() || null,
        cmp: String(req.query.cmp || "").trim() || null,
        jobRole: String(req.query.jobRole || "").trim() || null,
        status: String(req.query.status || "").trim() || null,
      },
      authUser: req.authUser,
    });

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="attendance_${req.query.month || "report"}.xlsx"`
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

module.exports = router;
