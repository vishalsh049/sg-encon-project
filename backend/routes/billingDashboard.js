const express = require("express");
const router = express.Router();

const { db } = require("../config/db");

// ✅ GET Billing Summary
router.get("/summary", async (req, res) => {
  try {

    const { circle, billing_type, months } = req.query;

    let query = `
    SELECT

  SUM(r.cm_amount + r.pm_amount) AS revenue,

  SUM(r.pm_loss) AS pm_loss,

  0 AS penalties,

  /* DOMAIN CM */
  SUM(CASE WHEN LOWER(r.domain) = 'fttx' THEN r.cm_amount ELSE 0 END) AS fttx_cm,

SUM(CASE WHEN LOWER(r.domain) = 'fiber' THEN r.cm_amount ELSE 0 END) AS fiber_cm,

SUM(CASE WHEN LOWER(r.domain) = 'tower' THEN r.cm_amount ELSE 0 END) AS tower_cm,

  /* DOMAIN PM */
  SUM(CASE WHEN LOWER(r.domain) = 'fttx' THEN r.pm_amount ELSE 0 END) AS fttx_pm,

SUM(CASE WHEN LOWER(r.domain) = 'fiber' THEN r.pm_amount ELSE 0 END) AS fiber_pm,

SUM(CASE WHEN LOWER(r.domain) = 'tower' THEN r.pm_amount ELSE 0 END) AS tower_pm
,

SUM(CASE WHEN LOWER(r.domain) = 'fttx' THEN r.pm_loss ELSE 0 END) AS fttx_loss,

SUM(CASE WHEN LOWER(r.domain) = 'fiber' THEN r.pm_loss ELSE 0 END) AS fiber_loss,

SUM(CASE WHEN LOWER(r.domain) = 'tower' THEN r.pm_loss ELSE 0 END) AS tower_loss

      FROM revenue r

      INNER JOIN revenue_upload ru
        ON r.file_id = ru.file_id

      WHERE ru.billing_month = (
        SELECT MAX(billing_month)
        FROM revenue_upload
      )
    `;

    const params = [];

    // ✅ Circle Filter
    if (circle) {
      query += " AND r.circle = ?";
      params.push(circle);
    }

    // ✅ Billing Type Filter
    if (billing_type) {
      query += " AND r.co_type = ?";
      params.push(billing_type);
    }

    console.log("SUMMARY QUERY:", query);
    console.log("PARAMS:", params);

    const [rows] = await db.promise().query(query, params);

   res.status(200).json({
  revenue: Number(rows[0]?.revenue || 0),
  pm_loss: Number(rows[0]?.pm_loss || 0),
  penalties: Number(rows[0]?.penalties || 0),

  fttx_cm: Number(rows[0]?.fttx_cm || 0),
  fiber_cm: Number(rows[0]?.fiber_cm || 0),
  tower_cm: Number(rows[0]?.tower_cm || 0),

  fttx_pm: Number(rows[0]?.fttx_pm || 0),
  fiber_pm: Number(rows[0]?.fiber_pm || 0),
  tower_pm: Number(rows[0]?.tower_pm || 0),

  fttx_loss: Number(rows[0]?.fttx_loss || 0),
  fiber_loss: Number(rows[0]?.fiber_loss || 0),
  tower_loss: Number(rows[0]?.tower_loss || 0),
});

  } catch (error) {
    console.error("Billing Dashboard Error:", error);

    res.status(500).json({
      message: "Server Error",
      error: error.message,
    });
  }
});

module.exports = router;