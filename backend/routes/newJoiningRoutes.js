const express = require("express");

const router = express.Router();

const { query } = require("../services/accessControl");
const { db } = require("../config/db");

const multer = require("multer");
const XLSX = require("xlsx");
const { sanitizeText } = require("../utils/sanitizeText");
const { readUploadedWorkbook } = require("../utils/readUploadedWorkbook");
const {
  addCircleFilter,
  assertRowsAllowedCircle,
  authMiddleware,
  canAccessCircle,
  forbid,
  isAllCircle,
} = require("../middleware/circleAccess");
const { requirePagePermission } = require("../middleware/pagePermission");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
});

router.use(authMiddleware);

const EMPLOYEE_CODE_PREFIX = "SG";
const EMPLOYEE_CODE_DIGITS = 6;

const { resolveDesignation } = require("../constants/designations");
const { resolveCircle, resolveCmp, CIRCLES, CIRCLE_CMP_MAP } = require("../constants/circles");
const {
  createConnectionExecutor,
  findDuplicateEmployees,
  getActorContext,
  insertAuditLog,
  insertTimelineEvent,
  insertNotification,
  clearPhysicalCache,
} = require("../services/physicalDomainService");

async function findNextEmployeeCode() {
  const rows = await query(
    `SELECT employee_code FROM new_joining WHERE employee_code REGEXP '^SG[0-9]+$'`
  );

  let maxNumber = 0;

  for (const row of rows) {
    const numericPart = parseInt(row.employee_code.slice(EMPLOYEE_CODE_PREFIX.length), 10);
    if (!Number.isNaN(numericPart) && numericPart > maxNumber) {
      maxNumber = numericPart;
    }
  }

  let candidateNumber = maxNumber + 1;
  let candidateCode = `${EMPLOYEE_CODE_PREFIX}${String(candidateNumber).padStart(EMPLOYEE_CODE_DIGITS, "0")}`;

  while (true) {
    const existing = await query(
      `SELECT id FROM new_joining WHERE employee_code = ? LIMIT 1`,
      [candidateCode]
    );

    if (!existing.length) break;

    candidateNumber += 1;
    candidateCode = `${EMPLOYEE_CODE_PREFIX}${String(candidateNumber).padStart(EMPLOYEE_CODE_DIGITS, "0")}`;
  }

  return candidateCode;
}

router.get("/next-employee-code", async (req, res) => {

  try {

    const employeeCode = await findNextEmployeeCode();

    res.json({
      success: true,
      employeeCode,
    });

  } catch (error) {

    console.log("NEXT EMPLOYEE CODE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to generate employee code",
    });

  }

});

router.get("/", async (req, res) => {

  console.time("TOTAL_API");

  try {

    const filters = [];
    const params = [];

    console.time("ADD_CIRCLE_FILTER");

    addCircleFilter(filters, params, req.authUser);

    console.timeEnd("ADD_CIRCLE_FILTER");

    console.time("DB_QUERY");

    const rows = await query(
      `SELECT * FROM new_joining
       ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
       ORDER BY id DESC`,
      params
    );

    console.timeEnd("DB_QUERY");

    console.timeEnd("TOTAL_API");

    res.json({
      success: true,
      data: rows,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed",
    });

  }

});

router.post("/add-employee", requirePagePermission("New Joining", "edit"), async (req, res) => {

  try {

    console.log("FULL BODY =", req.body);
    console.log("NTH SALARY =", req.body.nth_salary);
 const {
  employee_code,
  employee_name,
  circle,
  cmp,
  designation,
  aadhaar_no,
  nth_salary,
  joining_status,
  l2_status,
  employee_status,
  employee_code_auto,
} = req.body || {};

    const employeeCodeValue = sanitizeText(employee_code);
    const employeeNameValue = sanitizeText(employee_name);
    const circleValue = sanitizeText(circle);
    const cmpValue = sanitizeText(cmp);
    const designationValue = sanitizeText(designation);
    const aadhaarValue = sanitizeText(aadhaar_no);

    if (!employeeCodeValue) {
      return res.status(400).json({
        success: false,
        message: "Employee Code is required.",
      });
    }

    if (!employeeNameValue) {
      return res.status(400).json({
        success: false,
        message: "Employee Name is required.",
      });
    }

    if (!circleValue) {
      return res.status(400).json({
        success: false,
        message: "Please select Circle.",
      });
    }

    if (!cmpValue) {
      return res.status(400).json({
        success: false,
        message: "Please select CMP.",
      });
    }

    const resolvedCircle = resolveCircle(circleValue);
    if (!resolvedCircle) {
      return res.status(400).json({
        success: false,
        message: `Invalid Circle: "${circleValue}". Please select a valid circle.`,
      });
    }

    if (!canAccessCircle(req.authUser, resolvedCircle)) {
      return forbid(res);
    }

    const resolvedCmp = resolveCmp(resolvedCircle, cmpValue);
    if (!resolvedCmp) {
      return res.status(400).json({
        success: false,
        message: `Invalid CMP "${cmpValue}" for Circle "${resolvedCircle}". Valid CMPs: ${CIRCLE_CMP_MAP[resolvedCircle].join(", ")}.`,
      });
    }

    if (!designationValue) {
      return res.status(400).json({
        success: false,
        message: "Designation is required.",
      });
    }

    const canonicalDesignation = resolveDesignation(designationValue);

    if (!canonicalDesignation) {
      return res.status(400).json({
        success: false,
        message: `Invalid Designation: "${designationValue}". Please use a valid designation from the approved list.`,
      });
    }

    if (!aadhaarValue) {
      return res.status(400).json({
        success: false,
        message: "Aadhaar Number is required.",
      });
    }

    if (!/^\d{12}$/.test(aadhaarValue)) {
      return res.status(400).json({
        success: false,
        message: "Aadhaar Number must contain exactly 12 digits.",
      });
    }

    const existing = await query(
      `SELECT id FROM new_joining WHERE aadhaar_no = ? LIMIT 1`,
      [aadhaarValue]
    );

    if (existing.length) {
      return res.status(409).json({
        success: false,
        message: "Employee with this Aadhaar Number already exists.",
      });
    }

    let finalEmployeeCode = employeeCodeValue;

    const existingCode = await query(
      `SELECT id FROM new_joining WHERE employee_code = ? LIMIT 1`,
      [employeeCodeValue]
    );

    if (existingCode.length) {
      if (employee_code_auto) {
        finalEmployeeCode = await findNextEmployeeCode();
      } else {
        return res.status(409).json({
          success: false,
          message: "Employee Code already exists. Please generate a new code.",
        });
      }
    }

    await query(
      `
      INSERT INTO new_joining (
        employee_code,
        employee_name,
        circle,
        cmp,
        designation,
        aadhaar_no,
         nth_salary,
         joining_status,
        l2_status,
        employee_status,
        uploaded_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
      `,
      [
        finalEmployeeCode,
        employeeNameValue,
        resolvedCircle,
        resolvedCmp,
        canonicalDesignation,
        aadhaarValue,
         nth_salary || 0,
        joining_status || "Pending",
        l2_status || "Pending",
        employee_status || "Inactive",
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Employee Added Successfully",
      employeeCode: finalEmployeeCode,
    });

  } catch (error) {

    console.log("ADD EMPLOYEE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });

  }

});

// Per-page delete permission: empty/missing page_permissions means an
// unrestricted (admin) user, matching the frontend convention in utils/access.js.
async function canDeleteNewJoining(authUser) {
  const rows = await query(
    `SELECT page_permissions FROM users WHERE id = ? LIMIT 1`,
    [authUser?.id]
  );

  const raw = rows[0]?.page_permissions;
  if (!raw) return true;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (_error) {
    return true;
  }

  if (!Array.isArray(parsed) || parsed.length === 0) return true;

  // Permissions may store the page as the slug ("new-joining") or the display
  // name ("New Joining"); normalize whitespace to hyphens before comparing.
  const entry = parsed.find(
    (p) =>
      String(p?.page || "").trim().toLowerCase().replace(/\s+/g, "-") ===
      "new-joining"
  );

  return Boolean(entry?.delete);
}

const getConnection = () =>
  new Promise((resolve, reject) => {
    db.getConnection((err, connection) =>
      err ? reject(err) : resolve(connection)
    );
  });

const connectionQuery = (connection, sql, params = []) =>
  new Promise((resolve, reject) => {
    connection.query(sql, params, (err, rows) =>
      err ? reject(err) : resolve(rows)
    );
  });

const beginTransaction = (connection) =>
  new Promise((resolve, reject) => {
    connection.beginTransaction((err) => (err ? reject(err) : resolve()));
  });

const commitTransaction = (connection) =>
  new Promise((resolve, reject) => {
    connection.commit((err) => (err ? reject(err) : resolve()));
  });

const rollbackTransaction = (connection) =>
  new Promise((resolve) => {
    connection.rollback(() => resolve());
  });

router.delete("/delete/:id", requirePagePermission("New Joining", "delete"), async (req, res) => {

  try {

    if (!(await canDeleteNewJoining(req.authUser))) {
      return forbid(res, "You do not have permission to delete records.");
    }

    const filters = ["id = ?"];
    const params = [req.params.id];
    addCircleFilter(filters, params, req.authUser);
    const result = await query(`DELETE FROM new_joining WHERE ${filters.join(" AND ")}`, params);
    if (!result.affectedRows) return forbid(res);

    res.json({
      success: true,
      message: "Employee deleted successfully",
    });

  } catch (error) {

    console.log("DELETE EMPLOYEE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete record",
    });

  }

});

router.post("/bulk-delete", requirePagePermission("New Joining", "delete"), async (req, res) => {

  try {

    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];

    const numericIds = [...new Set(ids.map((id) => Number(id)))].filter(
      (id) => Number.isInteger(id) && id > 0
    );

    if (!numericIds.length) {
      return res.status(400).json({
        success: false,
        message: "Please select at least one record to delete.",
      });
    }

    if (!(await canDeleteNewJoining(req.authUser))) {
      return forbid(res, "You do not have permission to delete records.");
    }

    const filters = [
      `id IN (${numericIds.map(() => "?").join(",")})`,
    ];
    const params = [...numericIds];
    addCircleFilter(filters, params, req.authUser);

    const connection = await getConnection();

    let deletedCount = 0;

    try {
      await beginTransaction(connection);

      const result = await connectionQuery(
        connection,
        `DELETE FROM new_joining WHERE ${filters.join(" AND ")}`,
        params
      );

      deletedCount = result.affectedRows || 0;

      await commitTransaction(connection);
    } catch (error) {
      await rollbackTransaction(connection);
      throw error;
    } finally {
      connection.release();
    }

    if (!deletedCount) {
      return forbid(res);
    }

    res.json({
      success: true,
      deletedCount,
      message: `${deletedCount} record(s) deleted successfully`,
    });

  } catch (error) {

    console.log("BULK DELETE ERROR:", error);

    res.status(500).json({
      success: false,
      message: "Failed to delete records",
    });

  }

});

router.put("/update-status/:id", requirePagePermission("New Joining", "edit"), async (req, res) => {

  try {

  const { joining_status, employee_status } = req.body;

   const filters = ["id = ?"];
   const params = [
  joining_status,
  employee_status,
  req.params.id,
];
   addCircleFilter(filters, params, req.authUser);
   const result = await query(
  `
 UPDATE new_joining
SET joining_status = ?,
    employee_status = ?
WHERE ${filters.join(" AND ")}
  `,
  params
);
    if (!result.affectedRows) return forbid(res);

    res.json({
      success: true,
      message: "Status Updated",
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed",
    });

  }

});

router.put("/l2-status/:id", requirePagePermission("New Joining", "edit"), async (req, res) => {

  try {

    if (!isAllCircle(req.authUser)) {
      return res.status(403).json({
        success: false,
        message: "Only ALL Circle users can update L2 Status.",
      });
    }

    const { l2_status } = req.body;

    const filters = ["id = ?"];
    const params = [l2_status, req.params.id];

    addCircleFilter(filters, params, req.authUser);

    const result = await query(
      `
      UPDATE new_joining
      SET l2_status = ?
      WHERE ${filters.join(" AND ")}
      `,
      params
    );

    if (!result.affectedRows) {
      return forbid(res);
    }

    res.json({
      success: true,
      message: "L2 Status Updated",
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Failed",
    });

  }

});

// Atomically transfers a New Joining record into Physical Manpower: inserts
// a new Physical employee if none exists yet, blocks (no writes) if a match
// already exists and is Active, or reactivates+updates an existing Inactive
// match. Replaces the old client-side localStorage handoff between the New
// Joining and Physical pages, which was neither atomic nor duplicate-safe.
router.post(
  "/:id/transfer-to-physical",
  requirePagePermission("New Joining", "edit"),
  async (req, res) => {

    let conn;

    try {

      conn = await getConnection();
      await beginTransaction(conn);
      const executor = createConnectionExecutor(conn);
      const actor = getActorContext(req);

      const rows = await executor.query(
        `SELECT * FROM new_joining WHERE id = ? LIMIT 1`,
        [req.params.id]
      );
      const nj = rows[0];

      if (!nj) {
        await rollbackTransaction(conn);
        return res.status(404).json({
          success: false,
          message: "New Joining record not found.",
        });
      }

      if (!canAccessCircle(req.authUser, nj.circle)) {
        await rollbackTransaction(conn);
        return forbid(res);
      }

      const resolvedCircle = resolveCircle(nj.circle);
      const resolvedCmp = resolvedCircle ? resolveCmp(resolvedCircle, nj.cmp) : null;
      const canonicalDesignation = resolveDesignation(nj.designation);

      if (!resolvedCircle || !resolvedCmp || !canonicalDesignation) {
        await rollbackTransaction(conn);
        return res.status(400).json({
          success: false,
          message: `Cannot transfer: Circle "${nj.circle}" / CMP "${nj.cmp}" could not be matched to an approved value. Please correct this employee's Circle/CMP before transferring.`,
        });
      }

      const duplicateRows = await findDuplicateEmployees(
        (sql, params) => executor.query(sql, params),
        { employee_code: nj.employee_code, aadhaar_no: nj.aadhaar_no }
      );

      const trimmedEmployeeCode = String(nj.employee_code || "").trim();
      const trimmedAadhaar = String(nj.aadhaar_no || "").trim();

      const matchedDuplicate =
        (trimmedEmployeeCode &&
          duplicateRows.find(
            (r) => String(r.employee_code || "").trim() === trimmedEmployeeCode
          )) ||
        (trimmedAadhaar &&
          duplicateRows.find(
            (r) => String(r.aadhaar_no || "").trim() === trimmedAadhaar
          )) ||
        null;

      // findDuplicateEmployees() only selects a handful of unique-identifier
      // columns (not employment_status), so re-fetch the full row here before
      // branching on its status.
      let existingPhysical = null;
      if (matchedDuplicate) {
        const fullRows = await executor.query(
          `SELECT * FROM physical WHERE id = ? LIMIT 1`,
          [matchedDuplicate.id]
        );
        existingPhysical = fullRows[0] || null;
      }

      let physicalEmployeeId;
      let outcome;

      if (!existingPhysical) {

        // CASE 1: no existing Physical record — create one.
        const result = await executor.query(
          `
          INSERT INTO physical (
            circle, cmp, employee_code, employee_name, job_role,
            aadhaar_no, nth_salary, employment_status, uploaded_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
          `,
          [
            resolvedCircle,
            resolvedCmp,
            nj.employee_code,
            nj.employee_name,
            canonicalDesignation,
            nj.aadhaar_no,
            nj.nth_salary || 0,
            "Active",
          ]
        );

        physicalEmployeeId = result.insertId;

        const insertedRows = await executor.query(
          `SELECT * FROM physical WHERE id = ? LIMIT 1`,
          [physicalEmployeeId]
        );
        const inserted = insertedRows[0];

        await insertAuditLog(executor, {
          ...actor,
          entityType: "employee",
          entityId: physicalEmployeeId,
          action: "EMPLOYEE_TRANSFER_FROM_NEW_JOINING",
          circle: inserted.circle,
          cmp: inserted.cmp,
          newData: inserted,
        });

        await insertTimelineEvent(executor, {
          employeeId: physicalEmployeeId,
          action: "CREATED",
          actorUserId: actor.actorUserId,
          actorName: actor.actorName,
          circle: inserted.circle,
          cmp: inserted.cmp,
          newData: inserted,
        });

        await insertNotification(executor, {
          moduleName: "physical",
          eventType: "employee_created",
          title: "Physical employee created",
          message: `${inserted.employee_name || "Employee"} was transferred from New Joining.`,
          circle: inserted.circle,
          cmp: inserted.cmp,
          actorUserId: req.authUser.id || null,
          referenceId: physicalEmployeeId,
          referenceType: "physical_employee",
        });

        await executor.query(`DELETE FROM new_joining WHERE id = ?`, [req.params.id]);
        outcome = "inserted";

      } else if (String(existingPhysical.employment_status || "").trim().toLowerCase() === "active") {

        // CASE 2: already exists and Active — block, no writes at all.
        physicalEmployeeId = existingPhysical.id;
        outcome = "already_active";

      } else {

        // CASE 3: exists but not Active — reactivate and update.
        physicalEmployeeId = existingPhysical.id;
        const previous = existingPhysical;

        await executor.query(
          `
          UPDATE physical
          SET circle = ?,
              cmp = ?,
              employee_name = ?,
              job_role = ?,
              employment_status = 'Active',
              resigned_date = NULL,
              last_working_date = NULL,
              nth_salary = COALESCE(NULLIF(?, 0), nth_salary),
              updated_at = NOW()
          WHERE id = ?
          `,
          [
            resolvedCircle,
            resolvedCmp,
            nj.employee_name,
            canonicalDesignation,
            nj.nth_salary || 0,
            physicalEmployeeId,
          ]
        );

        const updatedRows = await executor.query(
          `SELECT * FROM physical WHERE id = ? LIMIT 1`,
          [physicalEmployeeId]
        );
        const updated = updatedRows[0];

        await insertAuditLog(executor, {
          ...actor,
          entityType: "employee",
          entityId: physicalEmployeeId,
          action: "EMPLOYEE_REACTIVATE",
          circle: updated.circle,
          cmp: updated.cmp,
          previousData: previous,
          newData: updated,
        });

        await insertTimelineEvent(executor, {
          employeeId: physicalEmployeeId,
          action: "REACTIVATED",
          actorUserId: actor.actorUserId,
          actorName: actor.actorName,
          circle: updated.circle,
          cmp: updated.cmp,
          previousData: previous,
          newData: updated,
        });

        await insertNotification(executor, {
          moduleName: "physical",
          eventType: "employee_reactivated",
          title: "Physical employee reactivated",
          message: `${updated.employee_name || "Employee"} was reactivated and transferred from New Joining.`,
          circle: updated.circle,
          cmp: updated.cmp,
          actorUserId: req.authUser.id || null,
          referenceId: physicalEmployeeId,
          referenceType: "physical_employee",
        });

        await executor.query(`DELETE FROM new_joining WHERE id = ?`, [req.params.id]);
        outcome = "reactivated";
      }

      await commitTransaction(conn);
      clearPhysicalCache();

      const MESSAGES = {
        inserted: "Employee successfully moved to Physical Manpower.",
        already_active: "Employee already exists in Physical Manpower and is currently Active.",
        reactivated: "Existing inactive employee has been reactivated and moved successfully.",
      };

      res.json({
        success: true,
        outcome,
        message: MESSAGES[outcome],
        physicalEmployeeId,
      });

    } catch (error) {

      if (conn) {
        await rollbackTransaction(conn);
      }

      console.log("TRANSFER TO PHYSICAL ERROR:", error);

      res.status(500).json({
        success: false,
        message: "Failed to transfer employee to Physical Manpower.",
      });

    } finally {

      if (conn) {
        conn.release();
      }

    }

  }
);

function normalizeHeaderKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getColumnValue(row, aliases) {
  const normalizedAliases = aliases.map(normalizeHeaderKey);
  for (const key of Object.keys(row)) {
    if (normalizedAliases.includes(normalizeHeaderKey(key))) {
      const val = row[key];
      if (val !== undefined && val !== null && sanitizeText(val) !== "") {
        return sanitizeText(val);
      }
    }
  }
  return undefined;
}

const REQUIRED_EXCEL_HEADERS = [
  "Employee Name",
  "Designation",
  "Circle",
  "Cluster",
  "Aadhar Number",
  "L2 Status",
];

// Matching is case-insensitive and ignores extra spaces (normalizeHeaderKey
// strips everything but letters/digits), but the header names themselves
// must be present — no fuzzy/alias matching here, unlike getColumnValue.
function findMissingExcelHeaders(actualHeaders) {
  const normalizedActual = new Set(
    (actualHeaders || []).map(normalizeHeaderKey)
  );
  return REQUIRED_EXCEL_HEADERS.filter(
    (header) => !normalizedActual.has(normalizeHeaderKey(header))
  );
}

router.post(
  "/upload-excel",
  upload.single("file"),
  async (req, res) => {

    try {

      if (!req.file) {

        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });

      }

      const workbook = readUploadedWorkbook(req.file);

      const sheetName =
        workbook.SheetNames[0];

      const worksheet =
        workbook.Sheets[sheetName];

      const rows =
        XLSX.utils.sheet_to_json(
          worksheet,
          { defval: "" }
        );

      if (!rows.length) {

        return res.status(400).json({
          success: false,
          message: "Excel is empty",
        });

      }

      // TEMP DEBUG: verify the exact headers XLSX parsed from the sheet
      const actualHeaders = Object.keys(rows[0]);
      console.log("[UPLOAD-EXCEL] Headers:", actualHeaders);

      const missingHeaders = findMissingExcelHeaders(actualHeaders);
      if (missingHeaders.length) {
        return res.status(400).json({
          success: false,
          message: `Header not matching. Please correct the Excel headers. Missing/Invalid: ${missingHeaders.join(", ")}`,
        });
      }

      assertRowsAllowedCircle(
        req.authUser,
        rows,
        (row) => {
          const raw = sanitizeText(row.circle || row["Circle"] || "");
          return resolveCircle(raw) || raw;
        }
      );

const excelAadhaarNumbers = rows
  .map((row) => {
    const raw = row.aadhaar_no || row["Aadhar Number"] || "";
    return raw ? sanitizeText(raw) : "";
  })
  .filter(Boolean);

const existingAadhaarSet = new Set();

if (excelAadhaarNumbers.length) {

  const uniqueAadhaarNumbers = [...new Set(excelAadhaarNumbers)];

  const existingAadhaarRows = await query(
    `SELECT aadhaar_no FROM new_joining WHERE aadhaar_no IN (${uniqueAadhaarNumbers
      .map(() => "?")
      .join(",")})`,
    uniqueAadhaarNumbers
  );

  existingAadhaarRows.forEach((r) => {
    existingAadhaarSet.add(String(r.aadhaar_no).trim());
  });

}

const seenAadhaarInFile = new Set();
let skippedDuplicates = 0;
const circleCmpWarnings = [];
let skippedCircleCmp = 0;

// One upload timestamp for the whole batch; mysql2 converts the Date using
// the pool's +05:30 timezone so it lands as IST, same as NOW() elsewhere.
const uploadedAt = new Date();

const values = [];

for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {

  const row = rows[rowIndex];
  // +1 for the header row, +1 to convert the 0-based index to a 1-based
  // Excel row number, so this matches the row a user sees in the sheet.
  const excelRowNumber = rowIndex + 2;

  const employee_code = sanitizeText(
    row.employee_code ||
    row["Employee Code"] ||
    ""
  );

  const employee_name = sanitizeText(
    row.employee_name ||
    row["Employee Name"] ||
    ""
  );

  const circle = sanitizeText(
    row.circle ||
    row["Circle"] ||
    ""
  );

  const cmp = sanitizeText(
    row.cmp ||
    row.cluster ||
    row["Cluster"] ||
    ""
  );

  // Circle/CMP resolution: unlike Designation and L2 Status below (which
  // still hard-reject the whole upload on the first bad value), a bad
  // Circle/CMP only skips this one row — recorded in circleCmpWarnings and
  // applied at the very end of the loop body, after every other per-row
  // check has had a chance to hard-reject the whole file as before.
  const resolvedRowCircle = resolveCircle(circle);
  const resolvedRowCmp = resolvedRowCircle ? resolveCmp(resolvedRowCircle, cmp) : null;
  let circleCmpWarning = null;
  if (!resolvedRowCircle) {
    circleCmpWarning = {
      row: excelRowNumber,
      employee: employee_name,
      employeeCode: employee_code,
      column: "Circle",
      currentValue: circle,
      error: `Invalid Circle: "${circle}"`,
      expected: CIRCLES,
    };
  } else if (!resolvedRowCmp) {
    circleCmpWarning = {
      row: excelRowNumber,
      employee: employee_name,
      employeeCode: employee_code,
      column: "CMP",
      currentValue: cmp,
      error: `Invalid CMP "${cmp}" for Circle "${resolvedRowCircle}"`,
      expected: CIRCLE_CMP_MAP[resolvedRowCircle],
    };
  }

  const designationRaw = sanitizeText(
    row.designation ||
    row["Designation"] ||
    ""
  );

  const designation = resolveDesignation(designationRaw);

  if (!designation) {
    return res.status(400).json({
      success: false,
      message: `Invalid Designation: "${designationRaw}" at Row ${excelRowNumber}. Please use a valid designation from the approved list.`,
    });
  }

  const aadhaar_no_raw =
    row.aadhaar_no ||
    row["Aadhar Number"] ||
    "";

  const aadhaar_no = aadhaar_no_raw ? sanitizeText(aadhaar_no_raw) : "";

  if (
    aadhaar_no &&
    (existingAadhaarSet.has(aadhaar_no) || seenAadhaarInFile.has(aadhaar_no))
  ) {
    skippedDuplicates++;
    continue;
  }

  if (aadhaar_no) {
    seenAadhaarInFile.add(aadhaar_no);
  }

  const nth_salary =
    row.nth_salary ||
    row["NTH Salary"] ||
    row["Nth Salary"] ||
    0;

  const joining_status = sanitizeText(
    row.joining_status ||
    row["Joining Status"] ||
    "Pending"
  );

 let l2_status = getColumnValue(row, [
  "l2_status",
  "L2 Status",
  "L2Status",
]);

// TEMP DEBUG: raw value read from the Excel row before validation/default
console.log(
  `[UPLOAD-EXCEL] Row for '${employee_name || employee_code}' -> raw L2 Status =`,
  JSON.stringify(l2_status)
);

if (l2_status === undefined) {
  l2_status = "Pending";
}

const allowed = ["Approved", "Rejected", "Pending"];

const matched = allowed.find(
  status => status.toLowerCase() === l2_status.toLowerCase()
);

if (!matched) {
  return res.status(400).json({
    success: false,
message: `Invalid L2 Status '${l2_status}' for employee '${employee_name}'. Only Approved, Rejected or Pending are allowed.`  });
}

l2_status = matched;

// TEMP DEBUG: final validated value that will be inserted
console.log(
  `[UPLOAD-EXCEL] Row for '${employee_name || employee_code}' -> resolved L2 Status =`,
  l2_status
);

if (circleCmpWarning) {
  circleCmpWarnings.push(circleCmpWarning);
  skippedCircleCmp++;
  continue;
}

values.push([
  employee_code,
  employee_name,
  resolvedRowCircle,
  resolvedRowCmp,
  designation,
  aadhaar_no,
  nth_salary,
  joining_status,
  l2_status,
  "Inactive",
  uploadedAt,
]);
}

// TEMP DEBUG: exact rows about to be inserted (index 8 in each array is l2_status)
console.log("[UPLOAD-EXCEL] Values about to be inserted:", values);

if (values.length) {

  await query(
    `
   INSERT INTO new_joining (

  employee_code,
  employee_name,
  circle,
  cmp,
  designation,
  aadhaar_no,
  nth_salary,
  joining_status,
  l2_status,
  employee_status,
  uploaded_at

  )
    VALUES ?
    `,
    [values]
  );

}

// TEMP DEBUG: re-query the just-inserted employee codes to confirm what actually landed in the DB
const insertedCodes = values.map((row) => row[0]).filter(Boolean);
if (insertedCodes.length) {
  const verifyRows = await query(
    `SELECT employee_code, l2_status FROM new_joining WHERE employee_code IN (${insertedCodes.map(() => "?").join(",")}) ORDER BY id DESC LIMIT ?`,
    [...insertedCodes, insertedCodes.length]
  );
  console.log("[UPLOAD-EXCEL] Post-insert DB verification:", verifyRows);
}

      res.json({
        success: true,
        message: "Upload Completed Successfully",
        totalRecords: rows.length,
        insertedRecords: values.length,
        skippedDuplicates,
        skippedCircleCmp,
        circleCmpWarnings,
      });

    } catch (error) {

      console.log(error);

      res.status(error.statusCode || 500).json({
        success: false,
        message: error.message || "Upload Failed",
      });

    }

  }
);   

module.exports = router;
