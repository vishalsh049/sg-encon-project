const express = require("express");

const router = express.Router();

const { query } = require("../services/accessControl");

const multer = require("multer");
const XLSX = require("xlsx");
const {
  addCircleFilter,
  assertRowsAllowedCircle,
  authMiddleware,
  canAccessCircle,
  forbid,
  isAllCircle,
} = require("../middleware/circleAccess");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
});

router.use(authMiddleware);

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

router.post("/add-employee", async (req, res) => {

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
} = req.body || {};

    if (!canAccessCircle(req.authUser, circle)) {
      return forbid(res);
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
        employee_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        employee_code || "",
        employee_name || "",
        circle || "",
        cmp || "",
        designation || "",
        aadhaar_no || "",
         nth_salary || 0,
        joining_status || "Pending",
        l2_status || "Pending",
        employee_status || "Active",
      ]
    );

    return res.status(200).json({
      success: true,
      message: "Employee Added Successfully",
    });

  } catch (error) {

    console.log("ADD EMPLOYEE ERROR:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });

  }

});

router.delete("/delete/:id", async (req, res) => {

  try {

    const filters = ["id = ?"];
    const params = [req.params.id];
    addCircleFilter(filters, params, req.authUser);
    const result = await query(`DELETE FROM new_joining WHERE ${filters.join(" AND ")}`, params);
    if (!result.affectedRows) return forbid(res);

    res.json({
      success: true,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
    });

  }

});

router.put("/update-status/:id", async (req, res) => {

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

router.put("/l2-status/:id", async (req, res) => {

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
      if (val !== undefined && val !== null && String(val).trim() !== "") {
        return String(val).trim();
      }
    }
  }
  return undefined;
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

      const workbook = XLSX.read(
        req.file.buffer,
        {
          type: "buffer",
        }
      );

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
      console.log("[UPLOAD-EXCEL] Headers:", Object.keys(rows[0]));

      assertRowsAllowedCircle(
        req.authUser,
        rows,
        (row) => row.circle || row["Circle"] || ""
      );

const values = [];

for (const row of rows) {

  const employee_code =
    row.employee_code ||
    row["Employee Code"] ||
    "";

  const employee_name =
    row.employee_name ||
    row["Employee Name"] ||
    "";

  const circle =
    row.circle ||
    row["Circle"] ||
    "";

  const cmp =
    row.cmp ||
    row.cluster ||
    row["Cluster"] ||
    "";

  const designation =
    row.designation ||
    row["Designation"] ||
    "";

  const aadhaar_no =
    row.aadhaar_no ||
    row["Aadhar Number"] ||
    "";

  const nth_salary =
    row.nth_salary ||
    row["NTH Salary"] ||
    row["Nth Salary"] ||
    0;

  const joining_status =
  row.joining_status ||
  row["Joining Status"] ||
  "Pending";

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

values.push([
  employee_code,
  employee_name,
  circle,
  cmp,
  designation,
  aadhaar_no,
  nth_salary,
  joining_status,
  l2_status,
  "Active",
]);
}

// TEMP DEBUG: exact rows about to be inserted (index 8 in each array is l2_status)
console.log("[UPLOAD-EXCEL] Values about to be inserted:", values);

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
employee_status

)
  VALUES ?
  `,
  [values]
);

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
        message: "Excel Uploaded Successfully",
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
