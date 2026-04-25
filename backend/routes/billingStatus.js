const express = require("express");
const dbModule = require("../config/db");
const db = dbModule.db;

const router = express.Router();

router.get("/billing/status", (req, res) => {
 const query = `
  SELECT 
  id,
  circle,
  billing_type,
  month,
  sixty,
  sixty_note,
  forty,
  forty_note,
  kpi,
  kpi_note
FROM billing_status
ORDER BY id DESC
`;

  db.query(query, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "DB Error" });
    }
    res.json(result);
  });
});

router.post("/billing/status", (req, res) => {
  const data = req.body;

  console.log("BODY:", data);

 const query = `
  INSERT INTO billing_status 
(circle, billing_type, month, sixty, sixty_note, forty, forty_note, kpi, kpi_note)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
ON DUPLICATE KEY UPDATE
  sixty = ?,
  sixty_note = ?,
  forty = ?,
  forty_note = ?,
  kpi = ?,
  kpi_note = ?
`;

db.query(
  query,
  [
    // INSERT VALUES
    data.circle,
    data.billingType,
    data.month,

    data.sixty,
    data.sixty === "Pending" ? data.sixty_note : null,

    data.forty,
    data.forty === "Pending" ? data.forty_note : null,

    data.kpi,
    data.kpi === "Pending" ? data.kpi_note : null,

    // UPDATE VALUES (same again)
    data.sixty,
    data.sixty === "Pending" ? data.sixty_note : null,

    data.forty,
    data.forty === "Pending" ? data.forty_note : null,

    data.kpi,
    data.kpi === "Pending" ? data.kpi_note : null
  ],

    (err, result) => {
      if (err) {
        console.error("DB ERROR:", err);
        return res.status(500).json({ error: err.message });
      }

      res.json({ message: "Saved in DB ✅" });
    }
  );
});

module.exports = router;