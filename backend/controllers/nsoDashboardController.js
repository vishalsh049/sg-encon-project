const {
  ensureNsoReportsSchema,
  getSummary,
  getCutsTrend,
  getMttrTrend,
  getFtkmTrend,
  getCutsByCircle,
  getFtkmByCircle,
  getTopMttrByCircle,
  getCircleRanking,
  getCmpScopeDetails,
  getFilters,
  buildExportWorkbook,
} = require("../services/nsoDashboardService");

// Every handler follows the same shape: ensure the schema, run the one
// service function it needs, and never let a raw error reach the client —
// log the detail server-side, return a generic message client-side.
function makeHandler(serviceFn, failureMessage) {
  return async function handle(req, res) {
    try {
      await ensureNsoReportsSchema();
      const data = await serviceFn(req);
      res.json(data);
    } catch (error) {
      console.error(`NSO dashboard error (${failureMessage}):`, error);
      res.status(500).json({ message: failureMessage });
    }
  };
}

const handleSummary = makeHandler(getSummary, "Failed to load dashboard summary");
const handleCutsTrend = makeHandler(getCutsTrend, "Failed to load cuts trend");
const handleMttrTrend = makeHandler(getMttrTrend, "Failed to load MTTR trend");
const handleFtkmTrend = makeHandler(getFtkmTrend, "Failed to load FTKM trend");
const handleCutsByCircle = makeHandler(getCutsByCircle, "Failed to load cuts distribution");
const handleFtkmByCircle = makeHandler(getFtkmByCircle, "Failed to load FTKM distribution");
const handleTopMttr = makeHandler(getTopMttrByCircle, "Failed to load top MTTR ranking");
const handleCircleRanking = makeHandler(getCircleRanking, "Failed to load circle ranking");
const handleCmpScopeDetails = makeHandler(getCmpScopeDetails, "Failed to load CMP & Scope details");
const handleFilters = makeHandler(getFilters, "Failed to load filter options");

async function handleExport(req, res) {
  try {
    await ensureNsoReportsSchema();
    const workbook = await buildExportWorkbook(req);
    const buffer = await workbook.xlsx.writeBuffer();

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="nso-fiber-performance-dashboard.xlsx"`
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(Buffer.from(buffer));
  } catch (error) {
    console.error("NSO dashboard export error:", error);
    res.status(500).json({ message: "Failed to export dashboard report" });
  }
}

module.exports = {
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
};
