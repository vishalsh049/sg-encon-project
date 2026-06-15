const {
  ensureNsoReportsSchema,
  getSummary,
  getCircleRanking,
  getCutsTrend,
  getMttrTrend,
  getCmpSummary,
  getHeatmap,
  getCmpWeekly,
  getFilters,
  buildExportWorkbook,
} = require("../services/nsoDashboardService");

async function handleSummary(req, res) {
  try {
    await ensureNsoReportsSchema();
    const summary = await getSummary(req);
    res.json(summary);
  } catch (error) {
    console.error("NSO dashboard summary error:", error);
    res.status(500).json({ message: "Failed to load dashboard summary" });
  }
}

async function handleCircleRanking(req, res) {
  try {
    await ensureNsoReportsSchema();
    const data = await getCircleRanking(req);
    res.json(data);
  } catch (error) {
    console.error("NSO dashboard circle ranking error:", error);
    res.status(500).json({ message: "Failed to load circle ranking" });
  }
}

async function handleCutsTrend(req, res) {
  try {
    await ensureNsoReportsSchema();
    const data = await getCutsTrend(req);
    res.json(data);
  } catch (error) {
    console.error("NSO dashboard cuts trend error:", error);
    res.status(500).json({ message: "Failed to load cuts trend" });
  }
}

async function handleMttrTrend(req, res) {
  try {
    await ensureNsoReportsSchema();
    const data = await getMttrTrend(req);
    res.json(data);
  } catch (error) {
    console.error("NSO dashboard MTTR trend error:", error);
    res.status(500).json({ message: "Failed to load MTTR trend" });
  }
}

async function handleCmpSummary(req, res) {
  try {
    await ensureNsoReportsSchema();
    const data = await getCmpSummary(req);
    res.json(data);
  } catch (error) {
    console.error("NSO dashboard CMP summary error:", error);
    res.status(500).json({ message: "Failed to load CMP summary" });
  }
}

async function handleHeatmap(req, res) {
  try {
    await ensureNsoReportsSchema();
    const data = await getHeatmap(req);
    res.json(data);
  } catch (error) {
    console.error("NSO dashboard heatmap error:", error);
    res.status(500).json({ message: "Failed to load heatmap data" });
  }
}

async function handleCmpWeekly(req, res) {
  try {
    await ensureNsoReportsSchema();
    const data = await getCmpWeekly(req);
    res.json(data);
  } catch (error) {
    console.error("NSO dashboard CMP weekly error:", error);
    res.status(500).json({ message: "Failed to load CMP weekly details" });
  }
}

async function handleFilters(req, res) {
  try {
    await ensureNsoReportsSchema();
    const data = await getFilters(req);
    res.json(data);
  } catch (error) {
    console.error("NSO dashboard filter options error:", error);
    res.status(500).json({ message: "Failed to load filter options" });
  }
}

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
  handleCircleRanking,
  handleCutsTrend,
  handleMttrTrend,
  handleCmpSummary,
  handleHeatmap,
  handleCmpWeekly,
  handleFilters,
  handleExport,
};
