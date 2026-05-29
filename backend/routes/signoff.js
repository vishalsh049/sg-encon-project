const express = require("express");

const router = express.Router();

const { db } = require("../config/db");


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

/* GET ALL DATA */

router.get("/", async (_req, res) => {

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

    const rows = await query(`
      SELECT *
      FROM signoff
      ORDER BY id ASC
    `);

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

router.post("/", async (req, res) => {

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
]      );

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

/* UPDATE */

router.put("/:id", async (req, res) => {

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

router.delete("/:id", async (req, res) => {

  try {

    await query(
      `
      DELETE FROM signoff
      WHERE id=?
      `,
      [req.params.id]
    );

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


module.exports = router;