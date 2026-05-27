const express = require("express");
const router = express.Router();
const db = require("../config/db");

// TECHNICIAN COUNT CMP WISE
router.get("/active-job-role-cmp-count", async (req, res) => {

  try {

    const [rows] = await db.query(`
      SELECT
        cmp,
        technician AS total
      FROM signoff
    `);

    const formatted = rows.map((item) => ({
      cmp: item.cmp,
      role_key: "technician",
      total: Number(item.total || 0),
    }));

    res.json({
      success: true,
      data: formatted,
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error",
    });

  }

});

module.exports = router;