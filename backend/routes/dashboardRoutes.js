  let cacheData = null;
  let lastFetchTime = 0;

  const express = require("express");
  const router = express.Router();
  const { db, isConnected } = require("../config/db");
  const util = require("util");
  const { getLatestFiberSummary } = require("../services/fiberInventoryService");

  const query = util.promisify(db.query).bind(db);

  const mockStats = {
    totalSites: 0,
    totalFiber: 0,
    totalManpower: 0,
    totalScrum: 0,
    fiberBreakdown: [],
    siteBreakdown: [],
    manpowerBreakdown: [],
    domainBreakdown: [],
    latestUploadDate: null,
    uptimeData: [],
    monthlyData: [],
    mock: true,
  };

  // Latest enb count by MAX(date), optional circle/cmp filters
  router.get("/enb", async (req, res) => {
    
    if (!isConnected()) {
      return res.status(503).json({
        message:
          "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
      });
    }

    const circle = req.query.circle ? String(req.query.circle) : "";
    const cmp = req.query.cmp ? String(req.query.cmp) : "";
    const selectedDate = req.query.date;

    const filters = [];
    const params = [];

    function addFilter(column, value) {
      if (!value) return;
      const arr = String(value)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (!arr.length) return;
      if (arr.length === 1) {
        filters.push(`${column} = ?`);
        params.push(arr[0]);
      } else {
        filters.push(`${column} IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr);
      }
    }

    addFilter("circle", circle);
    addFilter("cmp", cmp);
    const whereClause = filters.length ? `AND ${filters.join(" AND ")}` : "";

 const sql = `
  SELECT COUNT(*) AS enbCount
  FROM enb
  WHERE file_id = (
    SELECT file_id
    FROM enb
    WHERE 1=1
    ${whereClause}
    ORDER BY date DESC, created_at DESC, file_id DESC
    LIMIT 1
  )
  ${whereClause}
`;

    try {
      const rows = await query(sql, params);
      const row = rows && rows[0] ? rows[0] : null;

      res.json({ enbCount: Number(row?.enbCount || 0) });
    } catch (err) {
      console.error("Latest enb count error:", err);
      res.status(500).json({
        message:
          err?.code === "ER_NO_SUCH_TABLE"
            ? `Missing table: ${err.sqlMessage}`
            : err?.message || "Latest enb count query failed",
      });
    }
  });

  // Latest eNB summary (by MAX(date), optional circle/cmp filters)
  router.get("/enb-latest", async (req, res) => {
  
    if (!isConnected()) {
      return res.status(503).json({
        message:
          "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
      });
    }

    const circle = req.query.circle ? String(req.query.circle) : "";
    const cmp = req.query.cmp ? String(req.query.cmp) : "";

    const filters = [];
    const params = [];

    function addFilter(column, value) {
      if (!value) return;
      const arr = String(value)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      if (!arr.length) return;
      if (arr.length === 1) {
        filters.push(`${column} = ?`);
        params.push(arr[0]);
      } else {
        filters.push(`${column} IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr);
      }
    }

    addFilter("e.circle", circle);
    addFilter("e.cmp", cmp);

    const whereClause = filters.length ? `AND ${filters.join(" AND ")}` : "";

  const sql = `
    SELECT
      latest.latestDate AS latestDate,
      COUNT(*) AS totalRecords,
      AVG(e.kpi_value) AS averageValue,

      -- 🔥 previous day count
      (
        SELECT COUNT(*) 
        FROM enb 
        WHERE date = (
          SELECT MAX(date) FROM enb 
          WHERE date < (SELECT MAX(date) FROM enb)
        )
      ) AS previousCount

    FROM enb e
    CROSS JOIN (SELECT MAX(date) AS latestDate FROM enb) latest
    WHERE e.file_id = (
      SELECT file_id
      FROM enb
      WHERE date = latest.latestDate
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
    ${whereClause}
  `;

    try {
      const rows = await query(sql, params);
      const row = rows && rows[0] ? rows[0] : null;

      if (!row || !row.latestDate) {
        return res.json({
          latestDate: null,
          totalRecords: 0,
          averageValue: null,
        });
      }

      res.json({
        latestDate: row.latestDate, 
        totalRecords: Number(row.totalRecords || 0),
        previousCount: Number(row.previousCount || 0),
        averageValue:
          row.averageValue === null ? null : Number(row.averageValue),
      });
    } catch (err) {
      console.error("Latest enb error:", err);
      res.status(500).json({
        message:
          err?.code === "ER_NO_SUCH_TABLE"
            ? `Missing table: ${err.sqlMessage}`
            : err?.message || "Latest enb query failed",
      });
    }
  });

  // 🔥 ESC Latest Summary
  router.get("/esc-latest", async (req, res) => {

    if (!isConnected()) {
      return res.status(503).json({
        message: "Database not connected",
      });
    }

    const circle = req.query.circle ? String(req.query.circle) : "";
    const cmp = req.query.cmp ? String(req.query.cmp) : "";

    const filters = [];
    const params = [];

    function addFilter(column, value) {
      if (!value) return;
      const arr = String(value)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      if (!arr.length) return;

      if (arr.length === 1) {
        filters.push(`${column} = ?`);
        params.push(arr[0]);
      } else {
        filters.push(`${column} IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr);
      }
    }

    addFilter("circle", circle);
    addFilter("cmp", cmp);

    const whereClause = filters.length ? `AND ${filters.join(" AND ")}` : "";

    const sql = `
      SELECT 
        MAX(date) AS latestDate,
        COUNT(*) AS totalRecords                              
      FROM esc
      WHERE file_id = (
        SELECT file_id
        FROM esc
        WHERE date = (SELECT MAX(date) FROM esc)
        ORDER BY created_at DESC, file_id DESC
        LIMIT 1
      )
      ${whereClause}
    `;

    try {
      const rows = await query(sql, params);
      const row = rows[0];

      res.json({
        latestDate: row?.latestDate || null,
        totalRecords: Number(row?.totalRecords || 0),
      });
    } catch (err) {
      console.error("ESC latest error:", err);
      res.status(500).json({ message: "ESC latest failed" });
    }

  }); //

  router.post("/upload-isc", async (req, res) => {
    try {
      const data = req.body;

      if (!data || !data.length) {
        return res.status(400).json({ message: "No data received" });
      }

      const fileId = Date.now();

      const values = data.map((row) => [
        fileId,
        row.circle,
        row.cmp,
        row.date,
        row.kpi_value || 0,
      ]);

      const sql = `
        INSERT INTO isc (file_id, circle, cmp, date, kpi_value)
        VALUES ?
      `;

      await query(sql, [values]);

      res.json({ message: "ISC uploaded successfully" });

    } catch (err) {
      console.error("ISC upload error:", err);
      res.status(500).json({ message: "ISC upload failed" });
    }
  });

  router.get("/isc", async (req, res) => {
    if (!isConnected()) {
      return res.status(503).json({ message: "Database not connected" });
    }

    const circle = req.query.circle ? String(req.query.circle) : "";
    const cmp = req.query.cmp ? String(req.query.cmp) : "";

    const filters = [];
    const params = [];

    function addFilter(column, value) {
      if (!value) return;

      const arr = String(value)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      if (!arr.length) return;

      if (arr.length === 1) {
        filters.push(`${column} = ?`);
        params.push(arr[0]);
      } else {
        filters.push(`${column} IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr);
      }
    }

    addFilter("circle", circle);
    addFilter("cmp", cmp);

    const whereClause = filters.length ? `AND ${filters.join(" AND ")}` : "";

    const sql = `
    SELECT
      latest.latestDate AS latestDate,
      COUNT(*) AS totalRecords,
      AVG(e.kpi_value) AS averageValue,

      -- 🔥 previous day count
      (
        SELECT COUNT(*) 
        FROM isc
        WHERE date = (
          SELECT MAX(date) FROM isc
          WHERE date < (SELECT MAX(date) FROM isc)
        )
      ) AS previousCount

    FROM isc e
    CROSS JOIN (SELECT MAX(date) AS latestDate FROM isc) latest
    WHERE e.file_id = (
      SELECT file_id
      FROM isc
      WHERE date = latest.latestDate
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
    ${whereClause}
  `;

    try {
      const rows = await query(sql, params);
      res.json({
        iscCount: Number(rows[0]?.iscCount || 0),
      });
    } catch (err) {
      console.error("ISC count error:", err);
      res.status(500).json({ message: "ISC count failed" });
    }
  });

  router.get("/osc", async (req, res) => {
    if (!isConnected()) {
      return res.status(503).json({ message: "Database not connected" });
    }

    const circle = req.query.circle ? String(req.query.circle) : "";
    const cmp = req.query.cmp ? String(req.query.cmp) : "";

    const filters = [];
    const params = [];

    function addFilter(column, value) {
      if (!value) return;

      const arr = String(value)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      if (!arr.length) return;

      if (arr.length === 1) {
        filters.push(`${column} = ?`);
        params.push(arr[0]);
      } else {
        filters.push(`${column} IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr);
      }
    }

    addFilter("circle", circle);
    addFilter("cmp", cmp);

    const whereClause = filters.length ? `AND ${filters.join(" AND ")}` : "";

  const sql = `
    SELECT
      latest.latestDate AS latestDate,
      COUNT(*) AS totalRecords,
      AVG(e.kpi_value) AS averageValue,

      -- 🔥 previous day count
      (
        SELECT COUNT(*) 
        FROM osc
        WHERE date = (
          SELECT MAX(date) FROM osc
          WHERE date < (SELECT MAX(date) FROM osc)
        )
      ) AS previousCount

    FROM osc e
    CROSS JOIN (SELECT MAX(date) AS latestDate FROM osc) latest
    WHERE e.file_id = (
      SELECT file_id
      FROM osc
      WHERE date = latest.latestDate
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
    ${whereClause}
  `;

    try {
      const rows = await query(sql, params);
      res.json({
        oscCount: Number(rows[0]?.oscCount || 0),
      });
    } catch (err) {
      console.error("OSC count error:", err);
      res.status(500).json({ message: "OSC count failed" });
    }
  });

  router.get("/isc-latest", async (req, res) => {
    if (!isConnected()) {
      return res.status(503).json({ message: "Database not connected" });
    }

    const circle = req.query.circle ? String(req.query.circle) : "";
    const cmp = req.query.cmp ? String(req.query.cmp) : "";

    const filters = [];
    const params = [];

    function addFilter(column, value) {
      if (!value) return;

      const arr = String(value)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      if (!arr.length) return;

      if (arr.length === 1) {
        filters.push(`${column} = ?`);
        params.push(arr[0]);
      } else {
        filters.push(`${column} IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr);
      }
    }

    addFilter("circle", circle);
    addFilter("cmp", cmp);

    const whereClause = filters.length ? `AND ${filters.join(" AND ")}` : "";

    const sql = `
      SELECT 
        MAX(date) AS latestDate,
        COUNT(*) AS totalRecords
      FROM isc
    WHERE file_id = (
      SELECT file_id
      FROM isc
      WHERE date = (SELECT MAX(date) FROM isc)
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
      ${whereClause}
    `;

    try {
      const rows = await query(sql, params);
      const row = rows[0];

      res.json({
        latestDate: row?.latestDate || null,
        totalRecords: Number(row?.totalRecords || 0),
      });
    } catch (err) {
      console.error("ISC latest error:", err);
      res.status(500).json({ message: "ISC latest failed" });
    }
  }); //

  router.get("/osc-latest", async (req, res) => {
    if (!isConnected()) {
      return res.status(503).json({ message: "Database not connected" });
    }

    const circle = req.query.circle ? String(req.query.circle) : "";
    const cmp = req.query.cmp ? String(req.query.cmp) : "";

    const filters = [];
    const params = [];

    function addFilter(column, value) {
      if (!value) return;

      const arr = String(value)
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      if (!arr.length) return;

      if (arr.length === 1) {
        filters.push(`${column} = ?`);
        params.push(arr[0]);
      } else {
        filters.push(`${column} IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr);
      }
    }

    addFilter("circle", circle);
    addFilter("cmp", cmp);

    const whereClause = filters.length ? `AND ${filters.join(" AND ")}` : "";

    const sql = `
      SELECT 
        MAX(date) AS latestDate,
        COUNT(*) AS totalRecords
      FROM osc
    WHERE file_id = (
      SELECT file_id
      FROM osc
      WHERE date = (SELECT MAX(date) FROM osc)
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
      ${whereClause}
    `;

    try {
      const rows = await query(sql, params);
      const row = rows[0];

      res.json({
        latestDate: row?.latestDate || null,
        totalRecords: Number(row?.totalRecords || 0),
      });
    } catch (err) {
      console.error("OSC latest error:", err);
      res.status(500).json({ message: "OSC latest failed" });
    }
  }); //

  router.get("/hpodsc-latest", async (req, res) => {
    if (!isConnected()) {
      return res.status(503).json({ message: "Database not connected" });
    }

    const circle = req.query.circle ? String(req.query.circle) : "";
    const cmp = req.query.cmp ? String(req.query.cmp) : "";

    const filters = [];
    const params = [];

    function addFilter(column, value) {
      if (!value) return;
      const arr = String(value).split(",").map(v => v.trim()).filter(Boolean);

      if (!arr.length) return;

      if (arr.length === 1) {
        filters.push(`${column} = ?`);
        params.push(arr[0]);
      } else {
        filters.push(`${column} IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr);
      }
    }

    addFilter("circle", circle);
    addFilter("cmp", cmp);

    const whereClause = filters.length ? `AND ${filters.join(" AND ")}` : "";

    const sql = `
      SELECT 
        MAX(date) AS latestDate,
        COUNT(*) AS totalRecords
      FROM hpodsc
    WHERE file_id = (
      SELECT file_id
      FROM hpodsc
      WHERE date = (SELECT MAX(date) FROM hpodsc)
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
      ${whereClause}
    `;

    try {
      const rows = await query(sql, params);
      const row = rows[0];

      res.json({
        latestDate: row?.latestDate || null,
        totalRecords: Number(row?.totalRecords || 0),
      });
    } catch (err) {
      console.error("HPODSC latest error:", err);
      res.status(500).json({ message: "HPODSC latest failed" });
    }
  });

  // Dashboard Stats API with optional filters: circle, cmp, domain
  router.get("/stats", async (req, res) => {


    if (!isConnected()) {
      // Return safe fallback so UI can render while DB issue is fixed
      return res.status(503).json({
        message:
          "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
        ...mockStats,
      });
    }

    // Build WHERE clause based on optional filters (supports comma lists)
    const { circle, cmp, domain } = req.query;
    const filters = [];
    const params = [];

    const parseList = (value) => {
      if (!value) return [];
      return Array.isArray(value)
        ? value
        : String(value)
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
    };

    function addFilter(column, value) {
      const arr = parseList(value);
      if (!arr.length) return;
      if (arr.length === 1) {
        filters.push(`${column} = ?`);
        params.push(arr[0]);
      } else {
        filters.push(`${column} IN (${arr.map(() => "?").join(",")})`);
        params.push(...arr);
      }
    }

    addFilter("circle", circle);
    addFilter("cmp", cmp);


    const buildWhere = (extra) => {
      const clauses = [];
      if (filters.length) clauses.push(filters.join(" AND "));
      if (extra) clauses.push(extra);
      return clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    };

    const buildAnd = () =>
    filters.length ? ` AND (${filters.join(" AND ")})` : "";

const escCountSql = `
  SELECT COUNT(*) AS count
  FROM esc
  WHERE file_id = (
    SELECT file_id
    FROM esc
    ORDER BY date DESC, created_at DESC, file_id DESC
    LIMIT 1
  )
  ${filters.length ? buildAnd() : ""}
`;

 `SELECT COALESCE(MAX(latest.total_records), 0) AS count
    FROM (
      SELECT total_records
      FROM report_uploads
      WHERE UPPER(TRIM(site_type)) = 'ESC'
      ORDER BY report_date DESC, uploaded_at DESC, id DESC
      LIMIT 1
    ) latest`;

   const iscCountSql = `
  SELECT COUNT(*) AS count
  FROM isc
  WHERE file_id = (
    SELECT file_id
    FROM isc
    ORDER BY date DESC, created_at DESC, file_id DESC
    LIMIT 1
  )
  ${filters.length ? buildAnd() : ""}
`;


      `SELECT COALESCE(MAX(latest.total_records), 0) AS count
    FROM (
      SELECT total_records
      FROM report_uploads
      WHERE UPPER(TRIM(site_type)) = 'ISC'
      ORDER BY report_date DESC, uploaded_at DESC, id DESC
      LIMIT 1
    ) latest`;

    const oscCountSql = `
  SELECT COUNT(*) AS count
  FROM osc
  WHERE file_id = (
    SELECT file_id
    FROM osc
    ORDER BY date DESC, created_at DESC, file_id DESC
    LIMIT 1
  )
  ${filters.length ? buildAnd() : ""}
`;

       `SELECT COALESCE(MAX(latest.total_records), 0) AS count
    FROM (
      SELECT total_records
      FROM report_uploads
      WHERE UPPER(TRIM(site_type)) = 'OSC'
      ORDER BY report_date DESC, uploaded_at DESC, id DESC
      LIMIT 1
    ) latest`;

   const hpodscCountSql = `
  SELECT COUNT(*) AS count
  FROM hpodsc
  WHERE file_id = (
    SELECT file_id
    FROM hpodsc
    ORDER BY date DESC, created_at DESC, file_id DESC
    LIMIT 1
  )
  ${filters.length ? buildAnd() : ""}
`;
     `SELECT COALESCE(MAX(latest.total_records), 0) AS count
    FROM (
      SELECT total_records
      FROM report_uploads
      WHERE UPPER(TRIM(site_type)) = 'HPODSC'
      ORDER BY report_date DESC, uploaded_at DESC, id DESC
      LIMIT 1
    ) latest`;

    const escSiteSql = filters.length
      ? `SELECT 'ESC' AS type, COUNT(*) AS count, MAX(date) AS latestDate
  FROM esc
  WHERE file_id = (
    SELECT file_id FROM esc
    WHERE date = (SELECT MAX(date) FROM esc)
    ORDER BY created_at DESC, file_id DESC
    LIMIT 1
  )
  ${buildAnd()}`
      : `SELECT 'ESC' AS type, COALESCE(latest.total_records, 0) AS count, latest.report_date AS latestDate
  FROM (
    SELECT total_records, report_date
    FROM report_uploads
    WHERE UPPER(TRIM(site_type)) = 'ESC'
    ORDER BY report_date DESC, uploaded_at DESC, id DESC
    LIMIT 1
  ) latest`;

    const iscSiteSql = filters.length
      ? `SELECT 'ISC' AS type, COUNT(*) AS count, MAX(date) AS latestDate
  FROM isc
  WHERE file_id = (
    SELECT file_id FROM isc
    WHERE date = (SELECT MAX(date) FROM isc)
    ORDER BY created_at DESC, file_id DESC
    LIMIT 1
  )
  ${buildAnd()}`
      : `SELECT 'ISC' AS type, COALESCE(latest.total_records, 0) AS count, latest.report_date AS latestDate
  FROM (
    SELECT total_records, report_date
    FROM report_uploads
    WHERE UPPER(TRIM(site_type)) = 'ISC'
    ORDER BY report_date DESC, uploaded_at DESC, id DESC
    LIMIT 1
  ) latest`;

    const oscSiteSql = filters.length
      ? `SELECT 'OSC' AS type, COUNT(*) AS count, MAX(date) AS latestDate
  FROM osc
  WHERE file_id = (
    SELECT file_id FROM osc
    WHERE date = (SELECT MAX(date) FROM osc)
    ORDER BY created_at DESC, file_id DESC
    LIMIT 1
  )
  ${buildAnd()}`
      : `SELECT 'OSC' AS type, COALESCE(latest.total_records, 0) AS count, latest.report_date AS latestDate
  FROM (
    SELECT total_records, report_date
    FROM report_uploads
    WHERE UPPER(TRIM(site_type)) = 'OSC'
    ORDER BY report_date DESC, uploaded_at DESC, id DESC
    LIMIT 1
  ) latest`;

    const hpodscSiteSql = filters.length
      ? `SELECT 'HPODSC' AS type, COUNT(*) AS count, MAX(date) AS latestDate
  FROM hpodsc
  WHERE file_id = (
    SELECT file_id FROM hpodsc
    WHERE date = (SELECT MAX(date) FROM hpodsc)
    ORDER BY created_at DESC, file_id DESC
    LIMIT 1
  )
  ${buildAnd()}`
      : `SELECT 'HPODSC' AS type, COALESCE(latest.total_records, 0) AS count, latest.report_date AS latestDate
  FROM (
    SELECT total_records, report_date
    FROM report_uploads
    WHERE UPPER(TRIM(site_type)) = 'HPODSC'
    ORDER BY report_date DESC, uploaded_at DESC, id DESC
    LIMIT 1
  ) latest`;

    // 🔥 MAIN STATS (Total Active Sites = ENB + ESC + ISC + OSC + HPODSC latest)
  const siteCountQuery = `
  SELECT SUM(count) AS totalSites
  FROM (

SELECT COUNT(*) AS count
FROM enb
WHERE file_id = (
  SELECT file_id
  FROM enb
  ORDER BY date DESC, created_at DESC, file_id DESC
  LIMIT 1
)

    ${filters.length ? buildAnd() : ""}

    UNION ALL
    ${escCountSql}

    UNION ALL
    ${iscCountSql}

    UNION ALL
    ${oscCountSql}

    UNION ALL
    ${hpodscCountSql}

    -- 🔥 NEW TYPES
    UNION ALL
    SELECT COALESCE(SUM(kpi_value), 0) FROM ag1
    WHERE file_id = (
      SELECT file_id FROM ag1
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
    ${filters.length ? buildAnd() : ""}

    UNION ALL
    SELECT COALESCE(SUM(kpi_value), 0) FROM ag2
    WHERE file_id = (
      SELECT file_id FROM ag2
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
   ${filters.length ? buildAnd() : ""}

    UNION ALL
    SELECT COALESCE(SUM(kpi_value), 0) FROM ila
    WHERE file_id = (
      SELECT file_id FROM ila
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
    ${filters.length ? buildAnd() : ""}

    UNION ALL
    SELECT COALESCE(SUM(kpi_value), 0) FROM gnb
    WHERE file_id = (
      SELECT file_id FROM gnb
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
   ${filters.length ? buildAnd() : ""}

    UNION ALL
    SELECT COALESCE(SUM(kpi_value), 0) FROM gsc
    WHERE file_id = (
      SELECT file_id FROM gsc
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
    ${filters.length ? buildAnd() : ""}

    UNION ALL
    SELECT COALESCE(SUM(kpi_value), 0) FROM wifi
    WHERE file_id = (
      SELECT file_id FROM wifi
      ORDER BY created_at DESC, file_id DESC
      LIMIT 1
    )
    ${filters.length ? buildAnd() : ""}

  ) AS total
  `;

  const manpowerActiveQuery = `
    SELECT COUNT(*) AS totalManpower
    FROM scrum_manpower
  `;

    const manpowerTotalQuery = `
    SELECT COUNT(*) AS totalScrum
    FROM scrum_manpower
  `;

    // 🔥 SITE TYPES (Only ENB, ESC, ISC, OSC, HPODSC)
  const siteQuery = `

SELECT 
  'ENB' AS type,
  COUNT(*) AS count,
  MAX(date) AS latestDate
FROM enb
WHERE file_id = (
  SELECT file_id
  FROM enb
  ORDER BY date DESC, created_at DESC, file_id DESC
  LIMIT 1
)

${buildAnd()}

  UNION ALL
  ${escSiteSql}

  UNION ALL
  ${iscSiteSql}

  UNION ALL
  ${oscSiteSql}

  UNION ALL
  ${hpodscSiteSql}

  -- 🔥 NEW TYPES

  UNION ALL
  SELECT 
  'AG1' AS type,
  COALESCE(latest.total_records, 0) AS count,
  latest.report_date AS latestDate
FROM (
  SELECT total_records, report_date
  FROM report_uploads
  WHERE UPPER(TRIM(site_type)) = 'AG1'
  ORDER BY report_date DESC, uploaded_at DESC, id DESC
  LIMIT 1
) latest
  ${buildAnd()}

  UNION ALL
  SELECT 
  'AG2' AS type,
  COALESCE(latest.total_records, 0) AS count,
  latest.report_date AS latestDate
FROM (
  SELECT total_records, report_date
  FROM report_uploads
  WHERE UPPER(TRIM(site_type)) = 'AG2'
  ORDER BY report_date DESC, uploaded_at DESC, id DESC
  LIMIT 1
) latest
  ${buildAnd()}

  UNION ALL
 SELECT 
  'ILA' AS type,
  COALESCE(latest.total_records, 0) AS count,
  latest.report_date AS latestDate
FROM (
  SELECT total_records, report_date
  FROM report_uploads
  WHERE UPPER(TRIM(site_type)) = 'ILA'
  ORDER BY report_date DESC, uploaded_at DESC, id DESC
  LIMIT 1
) latest
  ${buildAnd()}

  UNION ALL
  SELECT 
  'GNB' AS type,
  COALESCE(latest.total_records, 0) AS count,
  latest.report_date AS latestDate
FROM (
  SELECT total_records, report_date
  FROM report_uploads
  WHERE UPPER(TRIM(site_type)) = 'GNB'
  ORDER BY report_date DESC, uploaded_at DESC, id DESC
  LIMIT 1
) latest
  ${buildAnd()}

  UNION ALL
  SELECT 
  'GSC' AS type,
  COALESCE(latest.total_records, 0) AS count,
  latest.report_date AS latestDate
FROM (
  SELECT total_records, report_date
  FROM report_uploads
  WHERE UPPER(TRIM(site_type)) = 'GSC'
  ORDER BY report_date DESC, uploaded_at DESC, id DESC
  LIMIT 1
) latest
  ${buildAnd()}

  UNION ALL
  SELECT 
  'WIFI' AS type,
  COALESCE(latest.total_records, 0) AS count,
  latest.report_date AS latestDate
FROM (
  SELECT total_records, report_date
  FROM report_uploads
  WHERE UPPER(TRIM(site_type)) = 'WIFI'
  ORDER BY report_date DESC, uploaded_at DESC, id DESC
  LIMIT 1
) latest
  ${buildAnd()}

  `;

    // 🔥 MANPOWER ROLES
  const latestUploadDateQueryV2 = `
    SELECT DATE(MAX(uploaded_at)) AS latestDate
    FROM report_uploads
  `;

  const siteCountQueryV2 = `
    SELECT COALESCE(SUM(total_records), 0) AS totalSites
    FROM report_uploads
    WHERE DATE(uploaded_at) = (
      SELECT DATE(MAX(uploaded_at)) FROM report_uploads
    )
  `;

  const siteQueryV2 = `
    SELECT
      UPPER(TRIM(site_type)) AS type,
      SUM(COALESCE(total_records, 0)) AS count,
      MAX(report_date) AS latestDate
    FROM report_uploads
    WHERE DATE(uploaded_at) = (
      SELECT DATE(MAX(uploaded_at)) FROM report_uploads
    )
      AND site_type IS NOT NULL
      AND TRIM(site_type) <> ''
    GROUP BY UPPER(TRIM(site_type))
    ORDER BY type
  `;

  const distinctSiteTypesQueryV2 = `
    SELECT DISTINCT UPPER(TRIM(site_type)) AS site_type
    FROM report_uploads
    WHERE site_type IS NOT NULL AND TRIM(site_type) <> ''
    ORDER BY site_type
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

  // ✅ DOMAIN BREAKDOWN (FOR PIE CHART)
  const domainQuery = `
  SELECT 
    CASE 
      WHEN LOWER(function_name) LIKE '%fiber%' THEN 'Fiber'
      WHEN LOWER(function_name) LIKE '%fttx%' THEN 'FTTx'
      WHEN LOWER(function_name) LIKE '%utility%' THEN 'Utility'
      ELSE 'Others'
    END AS name,
    COUNT(*) AS value
  FROM scrum_manpower
  GROUP BY name
`;

  const manpowerBreakdownQuery = `
    SELECT
      CASE
        WHEN TRIM(COALESCE(function_name, '')) = '' THEN 'Others'
        ELSE TRIM(function_name)
      END AS function,
      COUNT(*) AS count
    FROM scrum_manpower
    GROUP BY function
    ORDER BY count DESC, function ASC
  `;

  // ✅ FIBER INVENTORY QUERY
    try {
      const siteUnionCount = 11;
      const repeatedFilterParams = filters.length
        ? Array.from({ length: siteUnionCount }, () => params).flat()
        : [];

      const [
        latestUploadDateResult,
        siteCountResult,
        manpowerActiveResult,
        manpowerTotalResult,
        siteResult,
        distinctSiteTypesResult,
        uptimeResult,
        monthlyResult,
        fiberSummary,
        domainResult,
        manpowerBreakdownResult
      ] =
      
      await Promise.all([
        query(latestUploadDateQueryV2),
        query(siteCountQuery, repeatedFilterParams),
        query(manpowerActiveQuery),     // remove params
        query(manpowerTotalQuery),
        query(siteQuery),
        query(distinctSiteTypesQueryV2),
        query(uptimeQuery),
        query(monthlyQuery),
        getLatestFiberSummary(),
        query(domainQuery),
        query(manpowerBreakdownQuery)
  ]);

      const latestDate = latestUploadDateResult[0]?.latestDate || null;
      console.log("Latest Date:", latestDate);
      console.log("Query Result:", siteResult);
      console.log(
        "Distinct Site Types:",
        distinctSiteTypesResult.map((row) => row.site_type)
      );

      const uptimeData = uptimeResult.map((item) => ({
        day: item.day,
        uptime: Number(item.uptime),
      }));

      const monthlyData = monthlyResult.map((item) => ({
        day: "Week " + item.week,
        uptime: Number(item.uptime),
      }));

      const siteBreakdown = (siteResult || []).map((item) => ({
        type: item?.type ? String(item.type).trim() : "",
        count: Number(item?.count || 0),
        latestDate: item?.latestDate || null,
      }));

      const domainBreakdown = (domainResult || []).map((item) => ({
        name: item?.name ? String(item.name).trim() : "Others",
        value: Number(item?.value || 0),
      }));

      const manpowerBreakdown = (manpowerBreakdownResult || []).map((item) => ({
        function: item?.function ? String(item.function).trim() : "Others",
        count: Number(item?.count || 0),
      }));

      const fiberBreakdown = Array.isArray(fiberSummary?.cards)
        ? fiberSummary.cards.map((item) => ({
            ...item,
            aerial: Number(item?.aerial || 0),
            ug: Number(item?.ug || 0),
          }))
        : [];

      const totalFiber = fiberBreakdown.reduce(
        (sum, item) => sum + Number(item.aerial || 0) + Number(item.ug || 0),
        0
      );

      const responseData = {
        totalSites: Number(siteCountResult[0]?.totalSites || 0),
        totalFiber: Number(totalFiber || 0),
        totalManpower: Number(manpowerActiveResult[0]?.totalManpower || 0),
        totalScrum: Number(manpowerTotalResult[0]?.totalScrum || 0),
        fiberBreakdown,
        siteBreakdown,
        manpowerBreakdown,
        latestUploadDate: fiberSummary?.latestUpload?.date || latestDate,
        uptimeData,
        monthlyData,
        domainBreakdown,
      };

  cacheData = responseData;
  lastFetchTime = Date.now();

  res.json(responseData);
    } catch (err) {
      console.error("Dashboard stats error:", err);
      res.status(500).json({
        message:
          err?.code === "ER_NO_SUCH_TABLE"
            ? `Missing table: ${err.sqlMessage}`
            : err?.message || "Dashboard query failed",
        ...mockStats,
      });
    }

  });

  // UPTIME TREND API

router.get("/uptime-trend", async (req, res) => {
  try {

   const sql = `
  SELECT 
    date,
    AVG(availability) AS uptime
  FROM enb
  WHERE availability IS NOT NULL
  GROUP BY date
  ORDER BY date ASC
`;

    const rows = await query(sql);

    res.json(rows);

  } catch (err) {
    console.error("Uptime trend error:", err);
    res.status(500).json({ error: "Server error" });
  }
});
 
  module.exports = router;  
