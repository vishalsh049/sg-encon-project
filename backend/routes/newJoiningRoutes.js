const express = require("express");

const router = express.Router();

const { query } = require("../services/accessControl");

const multer = require("multer");
const XLSX = require("xlsx");

const storage = multer.memoryStorage();

const upload = multer({
  storage,
});

router.get("/", async (_req, res) => {

  try {

    const rows = await query(
      `SELECT * FROM new_joining ORDER BY id DESC`
    );

    res.json({
      success: true,
      data: rows,
    });

  } catch (error) {

    res.status(500).json({
      success: false,
      message: "Failed",
    });

  }

});

router.post("/add-employee", async (req, res) => {

  try {

    console.log(req.body);

    const {
      employee_code,
      employee_name,
      circle,
      cmp,
      designation,
      aadhaar_no,
      l2_status,
    } = req.body || {};

    await query(
      `
      INSERT INTO new_joining (
        employee_code,
        employee_name,
        circle,
        cmp,
        designation,
        aadhaar_no,
        l2_status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      [
        employee_code || "",
        employee_name || "",
        circle || "",
        cmp || "",
        designation || "",
        aadhaar_no || "",
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

    await query(
      `DELETE FROM new_joining WHERE id = ?`,
      [req.params.id]
    );

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

   await query(
  `
  UPDATE new_joining
  SET l2_status = ?,
      employee_status = ?
  WHERE id = ?
  `,
  [
    status,
    employee_status,
    req.params.id,
  ]
);

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

  const l2_status =
    row.l2_status ||
    row["L2 status"] ||
    "Pending";

  await query(
    `
    INSERT INTO new_joining (

      employee_code,
      employee_name,
      circle,
      cmp,
      designation,
      aadhaar_no,
      l2_status,
      employee_status

    )

    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      employee_code,
      employee_name,
      circle,
      cmp,
      designation,
      aadhaar_no,
      l2_status,
      "Active",
    ]
  );

}

      res.json({
        success: true,
        message: "Excel Uploaded Successfully",
      });

    } catch (error) {

      console.log(error);

      res.status(500).json({
        success: false,
        message: "Upload Failed",
      });

    }

  }
);   

module.exports = router;