const express = require("express");
const router = express.Router();
const db = require("../config/db");

// Dashboard Stats API
router.get("/stats", (req, res) => {

  // 🔥 MAIN STATS
  const mainQuery = `
    SELECT
      (SELECT COUNT(*) FROM sites WHERE status='active') AS totalSites,
      (SELECT COUNT(*) FROM manpower WHERE status='active') AS totalManpower,
      (SELECT COUNT(*) FROM manpower) AS totalScrum
  `;

  // 🔥 SITE TYPES
  const siteQuery = `
    SELECT type, COUNT(*) AS count
    FROM sites
    WHERE status='active'
    GROUP BY type
  `;

  // 🔥 MANPOWER ROLES
  const manpowerQuery = `
    SELECT role, COUNT(*) AS count
    FROM manpower
    WHERE status='active'
    GROUP BY role
  `;

  // 🔥 UPTIME (WEEKLY)
  const uptimeQuery = `
    SELECT 
      DAYNAME(date) AS day,
      ROUND(AVG(uptime), 2) AS uptime
    FROM site_uptime
    WHERE date >= CURDATE() - INTERVAL 7 DAY
    GROUP BY DAYNAME(date)
  `;

  // 🔥 UPTIME (MONTHLY)
  const monthlyQuery = `
    SELECT 
      WEEK(date) AS week,
      ROUND(AVG(uptime), 2) AS uptime
    FROM site_uptime
    WHERE date >= CURDATE() - INTERVAL 1 MONTH
    GROUP BY WEEK(date)
  `;

  // 🔥 EXECUTE QUERIES
  db.query(mainQuery, (err, mainResult) => {
    if (err) return res.status(500).json(err);

    db.query(siteQuery, (err, siteResult) => {
      if (err) return res.status(500).json(err);

      db.query(manpowerQuery, (err, manpowerResult) => {
        if (err) return res.status(500).json(err);

        db.query(uptimeQuery, (err, uptimeResult) => {
          if (err) return res.status(500).json(err);

          db.query(monthlyQuery, (err, monthlyResult) => {
            if (err) return res.status(500).json(err);

            // 🔥 FORMAT DATA
            const uptimeData = uptimeResult.map(item => ({
              day: item.day,
              uptime: Number(item.uptime)
            }));

            const monthlyData = monthlyResult.map(item => ({
              day: "Week " + item.week,
              uptime: Number(item.uptime)
            }));

            // 🔥 FINAL RESPONSE
            res.json({
              totalSites: mainResult[0].totalSites,
              totalManpower: mainResult[0].totalManpower,
              totalScrum: mainResult[0].totalScrum,
              siteBreakdown: siteResult,
              manpowerBreakdown: manpowerResult,
              uptimeData,
              monthlyData
            });

          });
        });

      }); 
    });
  });

});

module.exports = router;  