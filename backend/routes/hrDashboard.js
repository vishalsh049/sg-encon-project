const express = require("express");
const router = express.Router();
const db = require("../config/db");

// PHYSICAL + NEW JOINING COUNT CMP WISE
router.get("/active-job-role-cmp-count", async (req, res) => {

  try {

    const [rows] = await db.query(`
      SELECT
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

        new_joining

      FROM signoff
    `);

    const formatted = [];

    rows.forEach((item) => {

      const newJoiningCount = Number(item.new_joining || 0);

      const roles = [
        "state_leadership_team",
        "noc_executive",
        "analyst",
        "cmp_lead",

        "technician",
        "rigger",
        "utility_supervisor",
        "utility_engineer",
        "isp_engineer",
        "wh_incharge_cum_security",

        "splicer",
        "assistant_splicer",
        "fiber_helper",
        "patroller",
        "fiber_supervisor",
        "fibre_engineer",

        "fttx_splicer",
        "fttx_assistant_splicer",
        "fttx_supervisor",
        "fttx_helper",
        "fttx_engineer",
        "fttx_technician"
      ];

      roles.forEach((role) => {

        const physicalCount = Number(item[role] || 0);

    const totalCount = physicalCount + newJoiningCount;

const rCount = Math.floor(totalCount * 0.33);
const aCount = Math.floor(totalCount * 0.33);
const gCount = totalCount - rCount - aCount;

formatted.push({
  cmp: item.cmp,
  role_key: role,

  admin: totalCount,

  r: rCount,
  a: aCount,
  g: gCount,

  physical_count: physicalCount,

  new_joining_count: newJoiningCount,

  total: totalCount
});
      });

    });

    res.json({
      success: true,
      data: formatted
    });

  } catch (error) {

    console.log(error);

    res.status(500).json({
      success: false,
      message: "Server Error"
    });

  }

});

module.exports = router;