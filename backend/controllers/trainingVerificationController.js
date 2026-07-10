const trainingDocumentService = require("../services/trainingDocumentService");
const TrainingVerification = require("../models/TrainingVerification");

function context(req) {
  return {
    performedBy: req.authUser?.name || req.authUser?.username || req.authUser?.email || "system",
    ipAddress: req.ip,
  };
}

function fail(res, error, fallback = "Request failed") {
  console.error("TRAINING VERIFICATION API ERROR:", error);
  if (error.code === "ER_BAD_FIELD_ERROR" || error.code === "ER_NO_SUCH_TABLE") {
    return res.status(500).json({
      success: false,
      message: `Database schema mismatch: ${error.sqlMessage || error.message}. Restart the backend to apply pending training-table migrations.`,
    });
  }
  res.status(error.statusCode || 500).json({
    success: false,
    message: error.statusCode ? error.message : fallback,
  });
}

// PUT /api/training-verifications/document/:documentId
async function verifyDocument(req, res) {
  try {
    const document = await trainingDocumentService.setDocumentVerification(
      req.params.documentId,
      { status: req.body?.status, remarks: req.body?.remarks },
      context(req)
    );
    res.json({ success: true, message: "Verification saved", data: document });
  } catch (error) {
    fail(res, error, "Failed to save verification");
  }
}

// GET /api/training-verifications/employee/:employeeId
async function listByEmployee(req, res) {
  try {
    const rows = await TrainingVerification.listByEmployee(req.params.employeeId);
    res.json({ success: true, data: rows });
  } catch (error) {
    fail(res, error, "Failed to load verification history");
  }
}

// GET /api/training-verifications/recent
async function listRecent(req, res) {
  try {
    const rows = await TrainingVerification.listRecent(req.query.limit);
    res.json({ success: true, data: rows });
  } catch (error) {
    fail(res, error, "Failed to load verification activity");
  }
}

module.exports = { verifyDocument, listByEmployee, listRecent };
