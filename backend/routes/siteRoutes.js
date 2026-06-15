const express = require("express");
const util = require("util");
const { db } = require("../config/db");
const { addCircleFilter, isAllCircle } = require("../middleware/circleAccess");

const router = express.Router();
const query = util.promisify(db.query).bind(db);

// ✅ GET ALL SITES WITH CIRCLE FILTER
router.get("/", async (req, res) => {
  try {
    // Ensure sites table exists
    await query(`
      CREATE TABLE IF NOT EXISTS sites (
        id INT AUTO_INCREMENT PRIMARY KEY,
        circle VARCHAR(100),
        cmp VARCHAR(200),
        site_id VARCHAR(100) UNIQUE,
        site_name VARCHAR(255),
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        site_type VARCHAR(50),
        status VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    const filters = [];
    const params = [];
    
    // ✅ ADD CIRCLE FILTER
    addCircleFilter(filters, params, req.authUser, "circle");

    // Optional filters from query
    const cmp = req.query.cmp ? String(req.query.cmp) : "";
    const siteType = req.query.site_type ? String(req.query.site_type) : "";
    const status = req.query.status ? String(req.query.status) : "";

    if (cmp) {
      filters.push("cmp = ?");
      params.push(cmp);
    }

    if (siteType) {
      filters.push("site_type = ?");
      params.push(siteType);
    }

    if (status) {
      filters.push("status = ?");
      params.push(status);
    }

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const rows = await query(
      `SELECT * FROM sites ${whereClause} ORDER BY circle, cmp, site_name ASC LIMIT 1000`,
      params
    );

    res.json({
      success: true,
      data: rows,
      count: rows.length,
    });
  } catch (error) {
    console.error("Sites data error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch sites data",
    });
  }
});

// ✅ GET SITE BY ID WITH CIRCLE FILTER
router.get("/:id", async (req, res) => {
  try {
    const filters = ["id = ?"];
    const params = [req.params.id];
    
    // ✅ ADD CIRCLE FILTER
    addCircleFilter(filters, params, req.authUser, "circle");

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const rows = await query(`SELECT * FROM sites ${whereClause} LIMIT 1`, params);

    if (!rows.length) {
      return res.status(404).json({
        success: false,
        message: "Site not found or you don't have access",
      });
    }

    res.json({
      success: true,
      data: rows[0],
    });
  } catch (error) {
    console.error("Site detail error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch site details",
    });
  }
});

// ✅ GET SITES SUMMARY WITH CIRCLE FILTER
router.get("/summary/counts", async (req, res) => {
  try {
    const filters = [];
    const params = [];
    
    // ✅ ADD CIRCLE FILTER
    addCircleFilter(filters, params, req.authUser, "circle");

    const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

    const rows = await query(
      `SELECT
        COUNT(*) as total_sites,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) as active_sites,
        SUM(CASE WHEN status = 'Inactive' THEN 1 ELSE 0 END) as inactive_sites,
        COUNT(DISTINCT cmp) as total_cmps,
        COUNT(DISTINCT site_type) as total_site_types
       FROM sites
       ${whereClause}`,
      params
    );

    res.json({
      success: true,
      summary: {
        total_sites: rows[0]?.total_sites || 0,
        active_sites: rows[0]?.active_sites || 0,
        inactive_sites: rows[0]?.inactive_sites || 0,
        total_cmps: rows[0]?.total_cmps || 0,
        total_site_types: rows[0]?.total_site_types || 0,
      },
    });
  } catch (error) {
    console.error("Sites summary error:", error);
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch sites summary",
    });
  }
});

module.exports = router;

