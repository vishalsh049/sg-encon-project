const express = require("express");

const router = express.Router();

const { authMiddleware } = require("../middleware/circleAccess");
const { DESIGNATIONS } = require("../constants/designations");

router.use(authMiddleware);

router.get("/", (req, res) => {
  res.json({
    success: true,
    data: DESIGNATIONS,
  });
});

module.exports = router;
