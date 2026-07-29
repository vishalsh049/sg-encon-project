const express = require("express");

const router = express.Router();

const { authMiddleware } = require("../middleware/circleAccess");
const { CIRCLES, CIRCLE_CMP_MAP } = require("../constants/circles");

router.use(authMiddleware);

router.get("/", (req, res) => {
  res.json({
    success: true,
    data: {
      circles: CIRCLES,
      circleCmpMap: CIRCLE_CMP_MAP,
    },
  });
});

module.exports = router;
