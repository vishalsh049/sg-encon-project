const express = require("express");
const trainingController = require("../controllers/trainingController");

const router = express.Router();

/**
 * Shared-secret authentication for server-to-server calls from
 * Google Apps Script (which cannot obtain a user JWT).
 * Set TRAINING_WEBHOOK_KEY in the backend .env and the same value
 * in the Apps Script project's Script Properties.
 */
function webhookKeyMiddleware(req, res, next) {
  const expectedKey = process.env.TRAINING_WEBHOOK_KEY;

  if (!expectedKey) {
    console.error("TRAINING_WEBHOOK_KEY is not configured; rejecting webhook call.");
    return res.status(503).json({
      success: false,
      message: "Webhook is not configured on the server (TRAINING_WEBHOOK_KEY missing).",
    });
  }

  const providedKey =
    req.headers["x-training-webhook-key"] || req.query.key || "";

  if (String(providedKey) !== String(expectedKey)) {
    return res.status(401).json({ success: false, message: "Invalid webhook key." });
  }

  next();
}

router.post("/google-form", webhookKeyMiddleware, trainingController.googleFormWebhook);

// Lightweight health check so Apps Script setup can be verified quickly.
router.get("/health", (_req, res) => {
  res.json({
    success: true,
    configured: Boolean(process.env.TRAINING_WEBHOOK_KEY),
  });
});

module.exports = router;
