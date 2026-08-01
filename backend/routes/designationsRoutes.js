const express = require("express");

const router = express.Router();

const { authMiddleware } = require("../middleware/circleAccess");
const { getDesignationOptions } = require("../services/manpowerConfigService");

router.use(authMiddleware);

// Now backed by manpower_sub_profiles (see backend/services/manpowerConfigService.js)
// instead of a hardcoded array — edit the list from the Manpower Settings page.
router.get("/", async (req, res) => {
  try {
    const data = await getDesignationOptions();
    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: "Failed to load designations" });
  }
});

module.exports = router;
