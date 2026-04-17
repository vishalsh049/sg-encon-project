const express = require("express");
const router = express.Router();

// Placeholder routes so server stops skipping missing files.
// Add real uptime handlers here when ready.
router.get("/", (_req, res) => {
  res.json({ message: "uptime placeholder", data: [] });
});

module.exports = router;

