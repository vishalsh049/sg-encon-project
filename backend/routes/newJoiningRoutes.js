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
      l2_status,
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
        l2_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        employee_code || "",
        employee_name || "",
        circle || "",
        cmp || "",
        designation || "",
        aadhaar_no || "",
         nth_salary || 0,
        l2_status || "",
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

    const { status, employee_status } = req.body;

   const filters = ["id = ?"];
   const params = [status, employee_status, req.params.id];
   addCircleFilter(filters, params, req.authUser);
   const result = await query(
  `
  UPDATE new_joining
  SET l2_status = ?,
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

      assertRowsAllowedCircle(
        req.authUser,
        rows,
        (row) => row.circle || row["Circle"] || ""
      );

const values = [];

for (const row of rows) {

  const employee_code =
    row.employee_code ||
    row["Employee code"] ||
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

  const l2_status =
    row.l2_status ||
    row["L2 status"] ||
    "Pending";

  values.push([
    employee_code,
    employee_name,
    circle,
    cmp,
    designation,
    aadhaar_no,
    nth_salary,
    l2_status,
    "Active",
  ]);
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
    l2_status,
    employee_status
  )
  VALUES ?
  `,
  [values]
);

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
