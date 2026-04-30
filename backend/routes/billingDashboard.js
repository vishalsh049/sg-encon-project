const express = require("express");
const router = express.Router();

// ✅ GET Billing Summary
router.get("/summary", async (req, res) => {
  try {
    // 🔥 Replace with real DB later
    const data = {
      totalBills: 120000,
      revenue: 85000,
      penalties: 5200,
    };

    res.status(200).json(data);
  } catch (error) {
    console.error("Billing Dashboard Error:", error);
    res.status(500).json({ message: "Server Error" });
  }
});

module.exports = router;