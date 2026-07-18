const express = require("express");
const dbModule = require("../config/db");
const db = dbModule.db;
const { canAccessCircle, isAllCircle } = require("../middleware/circleAccess");
const { requirePagePermission } = require("../middleware/pagePermission");

const router = express.Router();

router.get("/billing/status", (req, res) => {
 const params = [];
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
${isAllCircle(req.authUser) ? "" : "WHERE LOWER(TRIM(circle)) = LOWER(TRIM(?))"}
ORDER BY id DESC
`;

  if (!isAllCircle(req.authUser)) {
    params.push(req.authUser.circle);
  }

  db.query(query, params, (err, result) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ error: "DB Error" });
    }
    res.json(result);
  });
});

router.post("/billing/status", requirePagePermission("billing-status", "edit"), (req, res) => {
  const data = req.body;

  console.log("BODY:", data);

  if (!canAccessCircle(req.authUser, data.circle)) {
    return res.status(403).json({ error: "You cannot access another circle's data." });
  }

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
