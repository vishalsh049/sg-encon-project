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

const normalizeUptimeValue = (value) => {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return 0;
  }

  // Some uploads store uptime as 0-1 while others store 0-100.
  if (numericValue > 0 && numericValue <= 1) {
    return Number((numericValue * 100).toFixed(2));
  }

  return Number(numericValue.toFixed(2));
};

router.get("/tower-uptime", async (req, res) => {

  try {

    const siteTables = [

      {
        name: "AG1",
        table: "ag1",
        color: "blue",
        possibleColumns: [
          "kpi_value",
          "availability",
        ],
      },

      {
        name: "ENB",
        table: "enb",
        color: "emerald",
        possibleColumns: [
          "availability",
          "kpi_value",
        ],
      },

    {
  name: "ESC",
  table: "esc",
  color: "violet",
  possibleColumns: [
    "total_availability",
    "kpi_value",
    "availability",
  ],
},

      {
        name: "GNB",
        table: "gnb",
        color: "orange",
        possibleColumns: [
          "kpi_value",
          "availability",
        ],
      },

      {
        name: "OSC",
        table: "osc",
        color: "cyan",
        possibleColumns: [
          "kpi_value",
          "availability",
        ],
      },

    {
  name: "HPODSC",
  table: "hpodsc",
  color: "rose",
  possibleColumns: [
    "total_availability",
    "kpi_value",
    "availability",
  ],
},

    ];

    const finalData = [];

    for (const site of siteTables) {

      try {

        // CHECK TABLE EXISTS

        const tableCheck = await query(`
          SHOW TABLES LIKE '${site.table}'
        `);

        if (tableCheck.length === 0) {

          console.log(
            `Table not found: ${site.table}`
          );

          continue;

        }

        // GET TABLE COLUMNS

        const columns = await query(`
          SHOW COLUMNS FROM ${site.table}
        `);

        const columnNames =
          columns.map((c) => c.Field);

        // AUTO DETECT KPI COLUMN

        const kpiColumn =
          site.possibleColumns.find((c) =>
            columnNames.includes(c)
          );

        if (!kpiColumn) {

          console.log(
            `No KPI column found in ${site.table}`
          );

          continue;

        }

        // AUTO DETECT DATE COLUMN

     const possibleDateColumns = [
  "Date",
  "date",
  "created_at",
  "report_date",
  "timestamp",
];

        const dateColumn =
          possibleDateColumns.find((c) =>
            columnNames.includes(c)
          );

        if (!dateColumn) {

          console.log(
            `No date column found in ${site.table}`
          );

          continue;

        }

        // MAIN QUERY

        const rows = await query(`

          SELECT

            DATE(${dateColumn}) as report_date,

            ROUND(

              AVG(

                CAST(

                  REPLACE(
                    ${kpiColumn},
                    '%',
                    ''
                  )

                  AS DECIMAL(10,2)

                )

              ),

              2

            ) as uptime

          FROM ${site.table}

          WHERE DATE(${dateColumn}) >= (

            SELECT
              DATE(MAX(${dateColumn}))
              - INTERVAL 6 DAY

            FROM ${site.table}

          )

          GROUP BY DATE(${dateColumn})

          ORDER BY DATE(${dateColumn}) ASC

        `);

        const normalizedRows = rows.map((row) => ({
          ...row,
          uptime: normalizeUptimeValue(row.uptime),
        }));

        const last7Days = [];

        for (let i = 6; i >= 0; i--) {

          const latestDate =
  normalizedRows.length > 0
    ? new Date(
        Math.max(
          ...normalizedRows.map(
            (r) => new Date(r.report_date)
          )
        )
      )
    : new Date();

          const d =
            new Date(latestDate);

          d.setDate(
            latestDate.getDate() - i
          );

          const formatted =
            d.toISOString()
              .split("T")[0];

          const existing =
            normalizedRows.find(
              (r) =>
                new Date(
                  r.report_date
                )
                  .toISOString()
                  .split("T")[0] ===
                formatted
            );

          last7Days.push({

            date:
              d.toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                }
              ),

            uptime: existing
              ? Number(
                  existing.uptime || 0
                )
              : 0,

          });

        }

        const bars =
          last7Days.map(
            (d) => d.uptime
          );

        const validBars =
          normalizedRows.map((r) =>
            Number(r.uptime || 0)
          );

        const avg =

          validBars.length > 0

            ? (

                validBars.reduce(
                  (a, b) => a + b,
                  0
                ) /

                validBars.length

              ).toFixed(2)

            : "0.00";

        const dates =
          last7Days.map(
            (d) => d.date
          );

        finalData.push({

          name: site.name,

          uptime: `${avg}%`,

          increase: "+0.00%",

          color: site.color,

          bars,

          dates,

        });

      } catch (siteError) {

        console.log(

          `Error in ${site.table}:`,

          siteError.sqlMessage ||
          siteError.message

        );

      }

    }

    res.json(finalData);

  } catch (error) {

    console.log(

      "Tower uptime error:",

      error.sqlMessage ||
      error.message

    );

    res.status(500).json({

      success: false,

      message:
        "Failed to fetch tower uptime data",

    });

  }

});

module.exports = router;
