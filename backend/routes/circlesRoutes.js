const express = require("express");

const router = express.Router();

const { authMiddleware } = require("../middleware/circleAccess");
const { getCirclesPayload } = require("../services/manpowerConfigService");

router.use(authMiddleware);

// Now backed by manpower_circles/manpower_cmps (see
// backend/services/manpowerConfigService.js) instead of a hardcoded map —
// edit the hierarchy from the Manpower Settings page.
router.get("/", async (req, res) => {
  try {
    const data = await getCirclesPayload();
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to load circles" });
  }
});

module.exports = router;
