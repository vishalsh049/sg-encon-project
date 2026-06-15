const express = require("express");
const util = require("util");
const { db } = require("../config/db");
const { addCircleFilter, isAllCircle } = require("../middleware/circleAccess");

const router = express.Router();
const query = util.promisify(db.query).bind(db);

// ✅ GET UPTIME DATA WITH CIRCLE FILTER
router.get("/", async (req, res) => {
  try {
    // Ensure uptime table exists
    await query(`
      CREATE TABLE IF NOT EXISTS uptime (
        id INT AUTO_INCREMENT PRIMARY KEY,
        circle VARCHAR(100),
        cmp VARCHAR(200),
        site_id VARCHAR(100),
        date DATE,
        uptime_percentage DECIMAL(5,2),
        availability_status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const filters = [];
    const params = [];
    
    // ✅ ADD CIRCLE FILTER
    addCircleFilter(filters, params, req.authUser, "circle");

    // Optional filters from query
    const cmp = req.query.cmp ? String(req.query.cmp) : "";
    const siteId = req.query.site_id ? String(req.query.site_id) : "";
    const fromDate = req.query.from_date ? String(req.query.from_date) : "";
    const toDate = req.query.to_date ? String(req.query.to_date) : "";

    if (cmp) {
      filters.push("cmp = ?");
      params.push(cmp);
    }

    if (siteId) {
      filters.push("site_id = ?");
      params.push(siteId);
    }

    if (fromDate && toDate) {
      filters.push("date BETWEEN ? AND ?");
      params.push(fromDate, toDate);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const rows = await query(
      `SELECT * FROM uptime ${whereClause} ORDER BY date DESC, created_at DESC LIMIT 1000`,
      params
    );

    res.json({
      success: true,
      data: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error("Uptime data error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch uptime data",
    });
  }
});

// ✅ GET UPTIME SUMMARY WITH CIRCLE FILTER
router.get("/summary", async (req, res) => {
  try {
    const filters = [];
    const params = [];
    
    // ✅ ADD CIRCLE FILTER
    addCircleFilter(filters, params, req.authUser, "circle");

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const rows = await query(
      `SELECT
        circle,
        COUNT(*) as total_records,
        AVG(uptime_percentage) as average_uptime,
        MIN(uptime_percentage) as min_uptime,
        MAX(uptime_percentage) as max_uptime
       FROM uptime
       ${whereClause}
       GROUP BY circle
       ORDER BY average_uptime DESC`,
      params
    );

    res.json({
      success: true,
      summary: rows,
    });
  } catch (error) {
    console.error("Uptime summary error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch uptime summary",
    });
  }
});

module.exports = router;

