const express = require("express");
const {
  handleSummary,
  handleCutsTrend,
  handleMttrTrend,
  handleFtkmTrend,
  handleCutsByCircle,
  handleFtkmByCircle,
  handleTopMttr,
  handleCircleRanking,
  handleCmpScopeDetails,
  handleFilters,
  handleExport,
} = require("../controllers/nsoDashboardController");

const router = express.Router();

router.get("/summary", handleSummary);
router.get("/cuts-trend", handleCutsTrend);
router.get("/mttr-trend", handleMttrTrend);
router.get("/ftkm-trend", handleFtkmTrend);
router.get("/cuts-by-circle", handleCutsByCircle);
router.get("/ftkm-by-circle", handleFtkmByCircle);
router.get("/top-mttr", handleTopMttr);
router.get("/circle-ranking", handleCircleRanking);
router.get("/cmp-scope-details", handleCmpScopeDetails);
router.get("/filters", handleFilters);
router.get("/export", handleExport);

module.exports = router;
