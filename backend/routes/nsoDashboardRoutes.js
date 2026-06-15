const express = require("express");
const {
  handleSummary,
  handleCircleRanking,
  handleCutsTrend,
  handleMttrTrend,
  handleCmpSummary,
  handleHeatmap,
  handleCmpWeekly,
  handleFilters,
  handleExport,
} = require("../controllers/nsoDashboardController");

const router = express.Router();

router.get("/summary", handleSummary);
router.get("/circle-ranking", handleCircleRanking);
router.get("/cuts-trend", handleCutsTrend);
router.get("/mttr-trend", handleMttrTrend);
router.get("/cmp-summary", handleCmpSummary);
router.get("/heatmap", handleHeatmap);
router.get("/cmp-weekly", handleCmpWeekly);
router.get("/filters", handleFilters);
router.get("/export", handleExport);

module.exports = router;
