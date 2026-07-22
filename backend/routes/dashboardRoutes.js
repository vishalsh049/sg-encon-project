    const express = require("express");
    const router = express.Router();
    const { db, isConnected } = require("../config/db");
    const util = require("util");
    const { getLatestFiberSummary } = require("../services/fiberInventoryService");
    const dashboardController = require("../controllers/dashboardController");
    const { isAllCircle } = require("../middleware/circleAccess");
    // Reused so the Dashboard's scrum numbers are produced by the exact same
    // scoping rules (own-vendor rows, requester's circle, latest upload batch)
    // as the Scrum / HR pages, instead of a second divergent definition.
    const {
      buildScrumFilterClause,
      buildLatestScrumBatchSubquery,
      addLatestBatchParam,
    } = require("../utils/scrumDashboardShared");

    const query = util.promisify(db.query).bind(db);

    const parseList = (value) => {
      if (!value) return [];
      return Array.isArray(value)
        ? value
        : String(value)
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);
    };

    const addInFilter = (filters, params, column, value) => {
      const arr = parseList(value);
      if (!arr.length) return;

      if (arr.length === 1) {
        filters.push(`${column} = ?`);
        params.push(arr[0]);
        return;
      }

      filters.push(`${column} IN (${arr.map(() => "?").join(",")})`);
      params.push(...arr);
    };

    const getRequestCircle = (req) =>
      isAllCircle(req.authUser)
        ? req.query.circle ? String(req.query.circle) : ""
        : req.authUser.circle;

    // Latest enb count by MAX(date), optional circle/cmp filters
    router.get("/enb", async (req, res) => {
      
      if (!isConnected()) {
        return res.status(503).json({
          message:
            "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
        });
      }

      const circle = getRequestCircle(req);
      const cmp = req.query.cmp ? String(req.query.cmp) : "";
      const domain = req.query.domain ? String(req.query.domain) : "";

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
      addFilter("domain", domain);

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
        // whereClause is interpolated twice (inner file_id subquery + outer
        // filter), so the bind params have to be supplied twice as well —
        // otherwise MySQL rejects the statement on any filtered request.
        const rows = await query(sql, [...params, ...params]);
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

      const circle = getRequestCircle(req);
      const cmp = req.query.cmp ? String(req.query.cmp) : "";
      const domain = req.query.domain ? String(req.query.domain) : "";

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

      const circle = getRequestCircle(req);
      const cmp = req.query.cmp ? String(req.query.cmp) : "";
      const domain = req.query.domain ? String(req.query.domain) : "";

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
      addFilter("domain", domain);

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

      const circle = getRequestCircle(req);
      const cmp = req.query.cmp ? String(req.query.cmp) : "";
      const domain = req.query.domain ? String(req.query.domain) : "";

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
      addFilter("domain", domain); 

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
        const row = rows && rows[0] ? rows[0] : null;

        // The query selects latestDate/totalRecords/averageValue — reading a
        // non-existent `iscCount` column made this endpoint always answer 0.
        res.json({
          latestDate: row?.latestDate || null,
          iscCount: Number(row?.totalRecords || 0),
          totalRecords: Number(row?.totalRecords || 0),
          previousCount: Number(row?.previousCount || 0),
          averageValue:
            row?.averageValue == null ? null : Number(row.averageValue),
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

      const circle = getRequestCircle(req);
      const cmp = req.query.cmp ? String(req.query.cmp) : "";
      const domain = req.query.domain ? String(req.query.domain) : "";

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
      addFilter("domain", domain); 

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
        const row = rows && rows[0] ? rows[0] : null;

        // Same fix as /isc: the response was reading a column the query
        // never selects, so the count was hard-stuck at 0.
        res.json({
          latestDate: row?.latestDate || null,
          oscCount: Number(row?.totalRecords || 0),
          totalRecords: Number(row?.totalRecords || 0),
          previousCount: Number(row?.previousCount || 0),
          averageValue:
            row?.averageValue == null ? null : Number(row.averageValue),
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

      const circle = getRequestCircle(req);
      const cmp = req.query.cmp ? String(req.query.cmp) : "";
      const domain = req.query.domain ? String(req.query.domain) : "";

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
      addFilter("domain", domain); 

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

      const circle = getRequestCircle(req);
      const cmp = req.query.cmp ? String(req.query.cmp) : "";
      const domain = req.query.domain ? String(req.query.domain) : "";

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
      addFilter("domain", domain); 

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

      const circle = getRequestCircle(req);
      const cmp = req.query.cmp ? String(req.query.cmp) : "";
      const domain = req.query.domain ? String(req.query.domain) : "";

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
      addFilter("domain", domain); 

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
        return res.status(503).json({
          message:
            "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
        });
      }

      const { cmp } = req.query;
      const circle = getRequestCircle(req);
      const siteFilters = [];
      const siteParams = [];

      addInFilter(siteFilters, siteParams, "circle", circle);
      addInFilter(siteFilters, siteParams, "cmp", cmp);

      // Scrum manpower scope, identical to the Scrum/HR pages: own-vendor rows
      // only, the requester's circle, the selected circle/cmp/domain filters,
      // and only the latest upload batch. /stats previously counted every
      // vendor and every historical batch, so the manpower numbers on this
      // page could never agree with the manpower pages.
      const scrumScope = buildScrumFilterClause(req);
      const scrumWhere = `
        ${scrumScope.whereClause}
        AND upload_batch_id IN (${buildLatestScrumBatchSubquery(req)})
      `;
      const buildScrumParams = () => {
        const params = [...scrumScope.params];
        addLatestBatchParam(req, params);
        return params;
      };

      const buildSiteAnd = () =>
        siteFilters.length ? ` AND (${siteFilters.join(" AND ")})` : "";

      // Every site type is expressed as one { sql, params } fragment. Both the
      // "Total Active Sites" card and the "Site Types" list are derived from
      // this single list, so the card is always exactly the sum of the rows the
      // user can see. (Previously the total came from a separate 11-way UNION
      // reading different tables than the breakdown, so the two could disagree,
      // and the bind params were repeated a hard-coded 11 / 5 times — which
      // silently broke whenever a site type was added or removed.)
      //
      // ORDER BY is `date, file_id` and deliberately omits created_at: adding
      // created_at makes the ordering unusable by idx_<table>_date_file, which
      // turned this subquery into a full scan + filesort of the whole table
      // (3.1M rows on enb). file_id is the upload timestamp, so it breaks ties
      // in exactly the same order created_at did — verified to select the
      // identical file_id on every populated table.
      const siteFragment = (label, table) => ({
        sql: `SELECT '${label}' AS type, COUNT(*) AS count, MAX(date) AS latestDate
              FROM ${table}
              WHERE file_id = (
                SELECT file_id
                FROM ${table}
                ORDER BY date DESC, file_id DESC
                LIMIT 1
              )
              ${buildSiteAnd()}`,
        params: [...siteParams],
      });

      // Every type reads its own raw table. The previous code sourced AG1/AG2/
      // ILA/GNB/GSC/WIFI (and the unfiltered ESC/ISC/OSC/HPODSC) from
      // report_uploads instead, which has two consequences: report_uploads has
      // no rows at all for AG1/AG2/ILA/GSC/WIFI, so AG2 (15,717 sites) and ILA
      // (524) were dropped from the dashboard entirely; and its totals are
      // pre-aggregated, so GNB reported the same 25,024 no matter which circle
      // was selected. Raw and report_uploads counts were verified identical for
      // every type that has upload rows, so nothing else moves.
      const siteFragments = [
        siteFragment("ENB", "enb"),
        siteFragment("ESC", "esc"),
        siteFragment("ISC", "isc"),
        siteFragment("OSC", "osc"),
        siteFragment("HPODSC", "hpodsc"),
        siteFragment("AG1", "ag1"),
        siteFragment("AG2", "ag2"),
        siteFragment("ILA", "ila"),
        siteFragment("GNB", "gnb"),
        siteFragment("GSC", "gsc"),
        siteFragment("WIFI", "wifi"),
      ];

      const siteQuery = siteFragments.map((f) => f.sql).join("\n UNION ALL \n");
      const siteQueryParams = siteFragments.flatMap((f) => f.params);

      // Total and active in one pass instead of two identical queries — the
      // old code ran the same COUNT(*) twice and labelled the results
      // "totalManpower" and "totalScrum", so the two cards always matched.
      const manpowerCountQuery = `
        SELECT
          COUNT(*) AS totalScrum,
          SUM(CASE WHEN LOWER(TRIM(COALESCE(status, ''))) = 'active' THEN 1 ELSE 0 END) AS totalManpower
        FROM scrum_manpower
        ${scrumWhere}
      `;

      const manpowerBreakdownQuery = `
        SELECT
          CASE
            WHEN TRIM(COALESCE(function_name, '')) = '' THEN 'Others'
            ELSE TRIM(function_name)
          END AS function,
          COUNT(*) AS count
        FROM scrum_manpower
        ${scrumWhere}
        GROUP BY function
        ORDER BY count DESC, function ASC
      `;

      try {
        // 4 round-trips instead of 11. The removed queries were either never
        // read by any client (site_uptime weekly/monthly, domain breakdown) or
        // only ever fed a console.log (latest upload date, distinct site types).
        const [siteResult, manpowerCountResult, manpowerBreakdownResult, fiberSummary] =
          await Promise.all([
            query(siteQuery, siteQueryParams),
            query(manpowerCountQuery, buildScrumParams()),
            query(manpowerBreakdownQuery, buildScrumParams()),
            // Circle selection now reaches the fiber summary too — the fiber
            // card and total previously ignored the dashboard filters entirely.
            getLatestFiberSummary(req.authUser, { circles: parseList(circle) }),
          ]);

        const siteBreakdown = (siteResult || []).map((item) => ({
          type: item?.type ? String(item.type).trim() : "",
          count: Number(item?.count || 0),
          latestDate: item?.latestDate || null,
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

        res.json({
          // Sum of exactly the rows returned in siteBreakdown, so the card can
          // never disagree with the list beneath it.
          totalSites: siteBreakdown.reduce((sum, item) => sum + item.count, 0),
          totalFiber: Number(totalFiber || 0),
          totalManpower: Number(manpowerCountResult[0]?.totalManpower || 0),
          totalScrum: Number(manpowerCountResult[0]?.totalScrum || 0),
          fiberBreakdown,
          siteBreakdown,
          manpowerBreakdown,
          latestUploadDate: fiberSummary?.latestUpload?.date || null,
        });
      } catch (err) {
        console.error("Dashboard stats error:", err);
        // No mock payload here: a client that receives zeros for a failed query
        // renders them as real values. Fail loudly instead.
        res.status(500).json({
          message:
            err?.code === "ER_NO_SUCH_TABLE"
              ? `Missing table: ${err.sqlMessage}`
              : err?.message || "Dashboard query failed",
        });
      }

    });

    // UPTIME TREND API — powers the Dashboard "Uptime Trend" card.
    // Supports ?type=last7|monthly|yearly and real circle/cmp filters.
    const UPTIME_TREND_CIRCLES = ["Punjab", "Haryana", "Delhi", "Uttar Pradesh (East)"];
    const UPTIME_TREND_TYPES = ["last7", "monthly", "yearly"];

    router.get("/uptime-trend", async (req, res) => {
      if (!isConnected()) {
        return res.status(503).json({
          message: "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
          type: "last7",
          rows: [],
        });
      }

      const type = UPTIME_TREND_TYPES.includes(req.query.type) ? req.query.type : "last7";

      try {
        const circlePlaceholders = UPTIME_TREND_CIRCLES.map(() => "?").join(",");

        let periodSelect;
        let periodGroupBy;

        const filters = [
          "availability IS NOT NULL",
          `circle IN (${circlePlaceholders})`,
        ];
        const params = [...UPTIME_TREND_CIRCLES];

        if (type === "yearly") {
          // One bucket per calendar year, across all available years.
          periodSelect = "YEAR(date)";
          periodGroupBy = "YEAR(date)";
        } else if (type === "monthly") {
          // Jan..Dec of the latest data year.
          periodSelect = "DATE_FORMAT(date, '%Y-%m-01')";
          periodGroupBy = "YEAR(date), MONTH(date)";
          filters.push(
            `YEAR(date) = (SELECT YEAR(MAX(date)) FROM enb WHERE circle IN (${circlePlaceholders}))`
          );
          params.push(...UPTIME_TREND_CIRCLES);
        } else {
          // Latest 7 days of real data, anchored to MAX(date).
          periodSelect = "DATE(date)";
          periodGroupBy = "DATE(date)";
          filters.push(
            `date >= (SELECT MAX(date) FROM enb WHERE circle IN (${circlePlaceholders})) - INTERVAL 6 DAY`
          );
          params.push(...UPTIME_TREND_CIRCLES);
        }

        addInFilter(filters, params, "circle", getRequestCircle(req));
        addInFilter(filters, params, "cmp", req.query.cmp);

        const sql = `
          SELECT
            ${periodSelect} AS period,
            circle,
            ROUND(AVG(availability), 2) AS uptime
          FROM enb
          WHERE ${filters.join(" AND ")}
          GROUP BY ${periodGroupBy}, circle
          ORDER BY period ASC, circle ASC
        `;

        const rows = await query(sql, params);

        res.json({ type, rows });
      } catch (err) {
        console.error("Uptime trend error:", err);
        res.status(500).json({
          message: err?.code === "ER_NO_SUCH_TABLE" ? `Missing table: ${err.sqlMessage}` : err?.message || "Uptime trend query failed",
          type,
          rows: [],
        });
      }
    });

  router.get("/reports-summary", dashboardController.getReportsSummary);
  router.get("/tower-recent", dashboardController.getTowerRecent);
  router.get("/nso-recent", dashboardController.getNsoRecent);
  router.get("/fiber-recent", dashboardController.getFiberRecent);
  router.get("/monthly-stats", dashboardController.getMonthlyStats);
  
    module.exports = router;  
