const express = require("express");
const router = express.Router();

const { db } = require("../config/db");

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

router.get("/tower-uptime", async (req, res) => {
  try {

    const siteTables = [
      {
        name: "AG1",
        table: "ag1",
        color: "blue",
        column: "kpi_value",
      },
      {
        name: "ENB",
        table: "enb",
        color: "emerald",
        column: "availability",
      },
      {
        name: "ESC",
        table: "esc",
        color: "violet",
        column: "kpi_value",
      },
      {
        name: "GNB",
        table: "gnb",
        color: "orange",
        column: "kpi_value",
      },
      {
        name: "OSC",
        table: "osc",
        color: "cyan",
        column: "kpi_value",
      },
      {
        name: "HPODSC",
        table: "hpodsc",
        color: "rose",
        column: "kpi_value",
      },
    ];

    const finalData = [];

    for (const site of siteTables) {

      const rows = await query(`
        SELECT 
          DATE(date) as report_date,
          ROUND(AVG(${site.column}), 2) as uptime
        FROM ${site.table}
        WHERE DATE(date) >= (
          SELECT DATE(MAX(date)) - INTERVAL 6 DAY
          FROM ${site.table}
        )
        GROUP BY DATE(date)
        ORDER BY DATE(date)
      `);

      const last7Days = [];

      for (let i = 6; i >= 0; i--) {

        const latestDate =
          rows.length > 0
            ? new Date(rows[rows.length - 1].report_date)
            : new Date();

        const d = new Date(latestDate);

        d.setDate(latestDate.getDate() - i);

        const formatted = d.toISOString().split("T")[0];

        const existing = rows.find(
          (r) =>
            new Date(r.report_date)
              .toISOString()
              .split("T")[0] === formatted
        );

        last7Days.push({
          date: d.toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
          }),
          uptime: existing ? Number(existing.uptime || 0) : 0,
        });
      }

      /* Bars for UI */
      const bars = last7Days.map((d) => d.uptime);

      /* Average ONLY real DB rows */
      const validBars = rows.map((r) => Number(r.uptime || 0));

      const avg =
        validBars.length > 0
          ? (
              validBars.reduce((a, b) => a + b, 0) /
              validBars.length
            ).toFixed(2)
          : "0.00";

      /* Dates */
      const dates = last7Days.map((d) => d.date);

      finalData.push({
        name: site.name,
        uptime: `${avg}%`,
        increase: "+0.00%",
        color: site.color,
        bars,
        dates,
      });
    }

    res.json(finalData);

  } catch (error) {

    console.log("Tower uptime error:", error);

    res.status(500).json({
      success: false,
      message: "Failed to fetch tower uptime data",
    });

  }
});

module.exports = router;