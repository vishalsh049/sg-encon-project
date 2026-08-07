const express = require("express");
const router = express.Router();

const { db } = require("../config/db");
const {
  addCircleFilter,
  authMiddleware,
  canAccessCircle,
  forbid,
  isAllCircle,
} = require("../middleware/circleAccess");
const { requirePagePermission } = require("../middleware/pagePermission");

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {

    db.query(
      sql,
      params,
      (err, result) => {

        if (err)
          return reject(err);

        resolve(result);
      }
    );
  });

router.use(authMiddleware);

/* GET ALL DATA */

router.get("/", async (req, res) => {

  try {

    await query(`
      CREATE TABLE IF NOT EXISTS signoff (
        id INT AUTO_INCREMENT PRIMARY KEY,

        circle VARCHAR(100),

        cmp VARCHAR(200),

        state_leadership_team INT DEFAULT 0,

        noc_executive INT DEFAULT 0,

        analyst INT DEFAULT 0,

        cmp_lead INT DEFAULT 0,

        technician INT DEFAULT 0,

        rigger INT DEFAULT 0,

        utility_supervisor INT DEFAULT 0,

        utility_engineer INT DEFAULT 0,

        isp_engineer INT DEFAULT 0,

        wh_incharge_cum_security INT DEFAULT 0,

        splicer INT DEFAULT 0,

        assistant_splicer INT DEFAULT 0,

        fiber_helper INT DEFAULT 0,

        patroller INT DEFAULT 0,

        fiber_supervisor INT DEFAULT 0,

        fibre_engineer INT DEFAULT 0,

        fttx_splicer INT DEFAULT 0,

        fttx_assistant_splicer INT DEFAULT 0,

        fttx_supervisor INT DEFAULT 0,

        fttx_helper INT DEFAULT 0,

        fttx_engineer INT DEFAULT 0,

        fttx_technician INT DEFAULT 0,

        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const filters = [];
    const params = [];
    addCircleFilter(filters, params, req.authUser);
    const rows = await query(`
      SELECT *
      FROM signoff
      ${filters.length ? `WHERE ${filters.join(" AND ")}` : ""}
      ORDER BY id ASC
    `, params);

    res.json({
      rows,
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Failed to load data",
    });
  }
});


/* CREATE */

router.post("/", requirePagePermission("Signoff", "edit"), async (req, res) => {

  try {

    const {
      circle,
      cmp,
      state_leadership_team,
      noc_executive,
      analyst,
      cmp_lead,
      technician,
      rigger,
      utility_supervisor,
      utility_engineer,
      isp_engineer,
      wh_incharge_cum_security,
      splicer,
      assistant_splicer,
      fiber_helper,
      patroller,
      fiber_supervisor,
      fibre_engineer,
      fttx_splicer,
      fttx_assistant_splicer,
      fttx_supervisor,
      fttx_helper,
      fttx_engineer,
      fttx_technician,
    } = req.body;

    if (!canAccessCircle(req.authUser, circle)) {
      return forbid(res);
    }

    const existing = await query(
      `
      SELECT id
      FROM signoff
      WHERE circle=? AND cmp=?
      `,
      [circle, cmp]
    );

    if (existing.length > 0) {

      await query(
        `
        UPDATE signoff
        SET
        state_leadership_team=?,
        noc_executive=?,
        analyst=?,
        cmp_lead=?,
        technician=?,
        rigger=?,
        utility_supervisor=?,
        utility_engineer=?,
        isp_engineer=?,
        wh_incharge_cum_security=?,
        splicer=?,
        assistant_splicer=?,
        fiber_helper=?,
        patroller=?,
        fiber_supervisor=?,
        fibre_engineer=?,
        fttx_splicer=?,
        fttx_assistant_splicer=?,
        fttx_supervisor=?,
        fttx_helper=?,
        fttx_engineer=?,
        fttx_technician=?
        WHERE circle=? AND cmp=?
        `,
        [
          Number(state_leadership_team) || 0,
          Number(noc_executive) || 0,
          Number(analyst) || 0,
          Number(cmp_lead) || 0,
          Number(technician) || 0,
          Number(rigger) || 0,
          Number(utility_supervisor) || 0,
          Number(utility_engineer) || 0,
          Number(isp_engineer) || 0,
          Number(wh_incharge_cum_security) || 0,
          Number(splicer) || 0,
          Number(assistant_splicer) || 0,
          Number(fiber_helper) || 0,
          Number(patroller) || 0,
          Number(fiber_supervisor) || 0,
          Number(fibre_engineer) || 0,
          Number(fttx_splicer) || 0,
          Number(fttx_assistant_splicer) || 0,
          Number(fttx_supervisor) || 0,
          Number(fttx_helper) || 0,
          Number(fttx_engineer) || 0,
          Number(fttx_technician) || 0,
          circle,
          cmp,
        ]
      );

      res.json({
        message: "Updated successfully",
      });

    } else {

      await query(
        `
        INSERT INTO signoff
        (
          circle,
          cmp,
          state_leadership_team,
          noc_executive,
          analyst,
          cmp_lead,
          technician,
          rigger,
          utility_supervisor,
          utility_engineer,
          isp_engineer,
          wh_incharge_cum_security,
          splicer,
          assistant_splicer,
          fiber_helper,
          patroller,
          fiber_supervisor,
          fibre_engineer,
          fttx_splicer,
          fttx_assistant_splicer,
          fttx_supervisor,
          fttx_helper,
          fttx_engineer,
          fttx_technician
        )
        VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          circle,
          cmp,
          Number(state_leadership_team) || 0,
          Number(noc_executive) || 0,
          Number(analyst) || 0,
          Number(cmp_lead) || 0,
          Number(technician) || 0,
          Number(rigger) || 0,
          Number(utility_supervisor) || 0,
          Number(utility_engineer) || 0,
          Number(isp_engineer) || 0,
          Number(wh_incharge_cum_security) || 0,
          Number(splicer) || 0,
          Number(assistant_splicer) || 0,
          Number(fiber_helper) || 0,
          Number(patroller) || 0,
          Number(fiber_supervisor) || 0,
          Number(fibre_engineer) || 0,
          Number(fttx_splicer) || 0,
          Number(fttx_assistant_splicer) || 0,
          Number(fttx_supervisor) || 0,
          Number(fttx_helper) || 0,
          Number(fttx_engineer) || 0,
          Number(fttx_technician) || 0,
        ]);

      res.json({
        message: "Created successfully",
      });
    }

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Create failed",
    });
  }
});

router.post("/bulk", requirePagePermission("Signoff", "edit"), async (req, res) => {

  try {

    const rows = req.body;

    if (!Array.isArray(rows)) {
      return res.status(400).json({
        message: "Invalid data"
      });
    }

    for (const row of rows) {
      if (!canAccessCircle(req.authUser, row.circle)) {
        return forbid(res);
      }
    }

    // No UNIQUE KEY exists on (circle, cmp), so an INSERT ... ON DUPLICATE KEY
    // UPDATE would silently never trigger the UPDATE branch and just insert a
    // duplicate row every time the same circle/cmp is uploaded again. Look up
    // existing rows first and split into explicit updates vs inserts instead.
    const existingRows = await query(
      `SELECT id, circle, cmp FROM signoff`
    );
    const existingIdByKey = new Map(
      existingRows.map((row) => [`${row.circle}||${row.cmp}`, row.id])
    );

    const toInsert = [];
    const toUpdate = [];

    rows.forEach((row) => {
      const values = [
        Number(row.state_leadership_team) || 0,
        Number(row.noc_executive) || 0,
        Number(row.analyst) || 0,
        Number(row.cmp_lead) || 0,
        Number(row.technician) || 0,
        Number(row.rigger) || 0,
        Number(row.utility_supervisor) || 0,
        Number(row.utility_engineer) || 0,
        Number(row.isp_engineer) || 0,
        Number(row.wh_incharge_cum_security) || 0,
        Number(row.splicer) || 0,
        Number(row.assistant_splicer) || 0,
        Number(row.fiber_helper) || 0,
        Number(row.patroller) || 0,
        Number(row.fiber_supervisor) || 0,
        Number(row.fibre_engineer) || 0,
        Number(row.fttx_splicer) || 0,
        Number(row.fttx_assistant_splicer) || 0,
        Number(row.fttx_supervisor) || 0,
        Number(row.fttx_helper) || 0,
        Number(row.fttx_engineer) || 0,
        Number(row.fttx_technician) || 0,
      ];

      const existingId = existingIdByKey.get(`${row.circle}||${row.cmp}`);

      if (existingId) {
        toUpdate.push({ id: existingId, values });
      } else {
        toInsert.push([row.circle, row.cmp, ...values]);
      }
    });

    if (toInsert.length) {
      await query(
        `
        INSERT INTO signoff
        (
        circle,
        cmp,
        state_leadership_team,
        noc_executive,
        analyst,
        cmp_lead,
        technician,
        rigger,
        utility_supervisor,
        utility_engineer,
        isp_engineer,
        wh_incharge_cum_security,
        splicer,
        assistant_splicer,
        fiber_helper,
        patroller,
        fiber_supervisor,
        fibre_engineer,
        fttx_splicer,
        fttx_assistant_splicer,
        fttx_supervisor,
        fttx_helper,
        fttx_engineer,
        fttx_technician
        )
        VALUES ?
        `,
        [toInsert]
      );
    }

    for (const { id, values } of toUpdate) {
      await query(
        `
        UPDATE signoff
        SET
        state_leadership_team=?,
        noc_executive=?,
        analyst=?,
        cmp_lead=?,
        technician=?,
        rigger=?,
        utility_supervisor=?,
        utility_engineer=?,
        isp_engineer=?,
        wh_incharge_cum_security=?,
        splicer=?,
        assistant_splicer=?,
        fiber_helper=?,
        patroller=?,
        fiber_supervisor=?,
        fibre_engineer=?,
        fttx_splicer=?,
        fttx_assistant_splicer=?,
        fttx_supervisor=?,
        fttx_helper=?,
        fttx_engineer=?,
        fttx_technician=?
        WHERE id=?
        `,
        [...values, id]
      );
    }

    res.json({
      success: true
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false
    });

  }

});

/* UPDATE */

router.put("/:id", requirePagePermission("Signoff", "edit"), async (req, res) => {

  try {

    const {
      circle,
      cmp,
      state_leadership_team,
      noc_executive,
      analyst,
      cmp_lead,
      technician,
      rigger,
      utility_supervisor,
      utility_engineer,
      isp_engineer,
      wh_incharge_cum_security,
      splicer,
      assistant_splicer,
      fiber_helper,
      patroller,
      fiber_supervisor,
      fibre_engineer,
      fttx_splicer,
      fttx_assistant_splicer,
      fttx_supervisor,
      fttx_helper,
      fttx_engineer,
      fttx_technician,
    } = req.body;

    const [existing] = await query(`SELECT circle FROM signoff WHERE id = ? LIMIT 1`, [
      req.params.id,
    ]);
    if (
      !existing ||
      !canAccessCircle(req.authUser, existing.circle) ||
      !canAccessCircle(req.authUser, circle)
    ) {
      return forbid(res);
    }

    await query(
      `
      UPDATE signoff
      SET
      circle=?,
      cmp=?,
      state_leadership_team=?,
      noc_executive=?,
      analyst=?,
      cmp_lead=?,
      technician=?,
      rigger=?,
      utility_supervisor=?,
      utility_engineer=?,
      isp_engineer=?,
      wh_incharge_cum_security=?,
      splicer=?,
      assistant_splicer=?,
      fiber_helper=?,
      patroller=?,
      fiber_supervisor=?,
      fibre_engineer=?,
      fttx_splicer=?,
      fttx_assistant_splicer=?,
      fttx_supervisor=?,
      fttx_helper=?,
      fttx_engineer=?,
      fttx_technician=?
      WHERE id=?
      `,
      [
        circle,
        cmp,
        state_leadership_team,
        noc_executive,
        analyst,
        cmp_lead,
        technician,
        rigger,
        utility_supervisor,
        utility_engineer,
        isp_engineer,
        wh_incharge_cum_security,
        splicer,
        assistant_splicer,
        fiber_helper,
        patroller,
        fiber_supervisor,
        fibre_engineer,
        fttx_splicer,
        fttx_assistant_splicer,
        fttx_supervisor,
        fttx_helper,
        fttx_engineer,
        fttx_technician,
        req.params.id,
      ]
    );

    res.json({
      message: "Updated successfully",
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Update failed",
    });
  }
});


/* DELETE */

router.delete("/:id", requirePagePermission("Signoff", "delete"), async (req, res) => {

  try {

    const filters = ["id=?"];
    const params = [req.params.id];
    addCircleFilter(filters, params, req.authUser);
    const result = await query(
      `
      DELETE FROM signoff
      WHERE ${filters.join(" AND ")}
      `,
      params
    );
    if (!result.affectedRows) return forbid(res);

    res.json({
      message: "Deleted successfully",
    });

  } catch (error) {

    console.error(error);

    res.status(500).json({
      message: "Delete failed",
    });
  }
});

/* CREATE SIGNOFF REQUEST */

router.post("/request", requirePagePermission("Signoff", "edit"), async (req, res) => {

  console.log(
    "REQUEST BODY:",
    req.body
  );

  try {

    const {
      request_type,
      signoff_id,
      circle,
      cmp,

      state_leadership_team,
      noc_executive,
      analyst,
      cmp_lead,

      technician,
      rigger,
      utility_supervisor,
      utility_engineer,
      isp_engineer,
      wh_incharge_cum_security,

      splicer,
      assistant_splicer,
      fiber_helper,
      patroller,
      fiber_supervisor,
      fibre_engineer,

      fttx_splicer,
      fttx_assistant_splicer,
      fttx_supervisor,
      fttx_helper,

      fttx_engineer,
      fttx_technician

    } = req.body;

    if (!canAccessCircle(req.authUser, circle)) {
      return forbid(res);
    }

    console.log(
      "INSERTING INTO signoff_requests"
    );
    await query(`
      INSERT INTO signoff_requests
      (
        request_type,
        signoff_id,

        circle,
        cmp,

        state_leadership_team,
        noc_executive,
        analyst,
        cmp_lead,

        technician,
        rigger,
        utility_supervisor,
        utility_engineer,
        isp_engineer,
        wh_incharge_cum_security,

        splicer,
        assistant_splicer,
        fiber_helper,
        patroller,
        fiber_supervisor,
        fibre_engineer,

        fttx_splicer,
        fttx_assistant_splicer,
        fttx_supervisor,
        fttx_helper,

        fttx_engineer,
        fttx_technician,

        requested_by,
        status
      )
      VALUES
      (
        ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
      )
    `, [

      request_type || "CREATE",
      signoff_id || null,

      circle,
      cmp,

      Number(state_leadership_team) || 0,
      Number(noc_executive) || 0,
      Number(analyst) || 0,
      Number(cmp_lead) || 0,

      Number(technician) || 0,
      Number(rigger) || 0,
      Number(utility_supervisor) || 0,
      Number(utility_engineer) || 0,
      Number(isp_engineer) || 0,
      Number(wh_incharge_cum_security) || 0,

      Number(splicer) || 0,
      Number(assistant_splicer) || 0,
      Number(fiber_helper) || 0,
      Number(patroller) || 0,
      Number(fiber_supervisor) || 0,
      Number(fibre_engineer) || 0,

      Number(fttx_splicer) || 0,
      Number(fttx_assistant_splicer) || 0,
      Number(fttx_supervisor) || 0,
      Number(fttx_helper) || 0,

      Number(fttx_engineer) || 0,
      Number(fttx_technician) || 0,

      req.authUser.username || req.authUser.email,
      "PENDING"
    ]);

    res.json({
      success: true,
      message: "Request submitted successfully"
    });

  } catch (error) {

    console.error(
      "SIGNOFF REQUEST ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      message: error.message
    });

  }

});


/* MY OWN REQUESTS (any user, view-only) */

router.get(
  "/my-requests",
  async (req, res) => {

    try {

      const requestedBy = req.authUser.username || req.authUser.email;

      const rows = await query(
        `
        SELECT *
        FROM signoff_requests
        WHERE requested_by = ?
        ORDER BY id DESC
        `,
        [requestedBy]
      );

      res.json({
        rows
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        rows: []
      });

    }

  }
);

router.get(
  "/pending-requests",
  async (req, res) => {

    try {

      if (!isAllCircle(req.authUser)) {
        return forbid(res);
      }

      const rows = await query(`
        SELECT *
        FROM signoff_requests
        WHERE status IN ('PENDING','REJECTED')
        ORDER BY id DESC
      `);

      res.json({
        rows
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        rows: []
      });

    }

  }
);
router.put(
  "/approve/:id",
  async (req, res) => {

    try {

      if (!isAllCircle(req.authUser)) {
        return forbid(res);
      }

      const rows = await query(
        `
        SELECT *
        FROM signoff_requests
        WHERE id = ?
        `,
        [req.params.id]
      );

      if (!rows.length) {
        return res.status(404).json({
          success: false
        });
      }

      const request = rows[0];

      const rowValues = [
        request.state_leadership_team,
        request.noc_executive,
        request.analyst,
        request.cmp_lead,
        request.technician,
        request.rigger,
        request.utility_supervisor,
        request.utility_engineer,
        request.isp_engineer,
        request.wh_incharge_cum_security,
        request.splicer,
        request.assistant_splicer,
        request.fiber_helper,
        request.patroller,
        request.fiber_supervisor,
        request.fibre_engineer,
        request.fttx_splicer,
        request.fttx_assistant_splicer,
        request.fttx_supervisor,
        request.fttx_helper,
        request.fttx_engineer,
        request.fttx_technician,
      ];

      // Prefer the specific row this request targets (UPDATE requests carry
      // signoff_id); otherwise fall back to matching by circle+cmp, since
      // there's no unique key to rely on for an upsert.
      let targetId = request.signoff_id;
      if (!targetId) {
        const [existing] = await query(
          `SELECT id FROM signoff WHERE circle=? AND cmp=? LIMIT 1`,
          [request.circle, request.cmp]
        );
        targetId = existing?.id || null;
      }

      if (targetId) {
        await query(
          `
          UPDATE signoff
          SET
          circle=?,
          cmp=?,
          state_leadership_team=?,
          noc_executive=?,
          analyst=?,
          cmp_lead=?,
          technician=?,
          rigger=?,
          utility_supervisor=?,
          utility_engineer=?,
          isp_engineer=?,
          wh_incharge_cum_security=?,
          splicer=?,
          assistant_splicer=?,
          fiber_helper=?,
          patroller=?,
          fiber_supervisor=?,
          fibre_engineer=?,
          fttx_splicer=?,
          fttx_assistant_splicer=?,
          fttx_supervisor=?,
          fttx_helper=?,
          fttx_engineer=?,
          fttx_technician=?
          WHERE id=?
          `,
          [request.circle, request.cmp, ...rowValues, targetId]
        );
      } else {
        await query(
          `
          INSERT INTO signoff
          (
            circle,
            cmp,
            state_leadership_team,
            noc_executive,
            analyst,
            cmp_lead,
            technician,
            rigger,
            utility_supervisor,
            utility_engineer,
            isp_engineer,
            wh_incharge_cum_security,
            splicer,
            assistant_splicer,
            fiber_helper,
            patroller,
            fiber_supervisor,
            fibre_engineer,
            fttx_splicer,
            fttx_assistant_splicer,
            fttx_supervisor,
            fttx_helper,
            fttx_engineer,
            fttx_technician
          )
          VALUES
          (
            ?,?,?,?,?,?,?,?,?,?,
            ?,?,?,?,?,?,?,?,?,?,
            ?,?,?,?
          )
          `,
          [request.circle, request.cmp, ...rowValues]
        );
      }

      const approverName = req.authUser.username || req.authUser.email;
      const remarks = typeof req.body?.remarks === "string" ? req.body.remarks.trim() || null : null;

      await query(
        `
        UPDATE signoff_requests
        SET status='APPROVED', approved_by=?, remarks=?, approved_at=NOW()
        WHERE id=?
        `,
        [approverName, remarks, req.params.id]
      );

      res.json({
        success: true
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false
      });

    }

  }
);

router.put(
  "/reject/:id",
  async (req, res) => {

    try {

      if (!isAllCircle(req.authUser)) {
        return forbid(res);
      }

      const approverName = req.authUser.username || req.authUser.email;
      const remarks = typeof req.body?.remarks === "string" ? req.body.remarks.trim() || null : null;

      await query(
        `
        UPDATE signoff_requests
        SET status = 'REJECTED', approved_by=?, remarks=?, approved_at=NOW()
        WHERE id = ?
        `,
        [approverName, remarks, req.params.id]
      );

      res.json({
        success: true,
        message: "Request Rejected"
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        success: false
      });

    }

  }
);

/* PENDING REQUEST COUNT */

router.get(
  "/request-count",
  async (req, res) => {

    try {

      const rows = await query(`
       SELECT COUNT(*) AS count
FROM signoff_requests
WHERE status = 'PENDING'
      `);

      console.log(
        "PENDING COUNT:",
        rows[0]
      );

      res.json({
        count: Number(rows[0]?.count || 0),
      });

    } catch (error) {

      console.error(error);

      res.status(500).json({
        count: 0,
      });

    }

  }
);

module.exports = router;
