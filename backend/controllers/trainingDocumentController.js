const trainingDocumentService = require("../services/trainingDocumentService");
const TrainingDocument = require("../models/TrainingDocument");

function context(req) {
  return {
    performedBy: req.authUser?.name || req.authUser?.username || req.authUser?.email || "system",
    ipAddress: req.ip,
  };
}

function fail(res, error, fallback = "Request failed") {
  console.error("TRAINING DOCUMENT API ERROR:", error);
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

// GET /api/training-documents — all documents (Documents/Verification screens)
async function listAll(req, res) {
  try {
    const { status, search, page, pageSize } = req.query;
    const result = await TrainingDocument.listAll({ status, search, page, pageSize });
    res.json({ success: true, data: result.rows, meta: result });
  } catch (error) {
    fail(res, error, "Failed to load documents");
  }
}

// GET /api/training-documents/types
async function listTypes(req, res) {
  res.json({ success: true, data: trainingDocumentService.DOCUMENT_TYPES });
}

// GET /api/training-documents/employee/:employeeId
async function listByEmployee(req, res) {
  try {
    const rows = await TrainingDocument.listByEmployee(req.params.employeeId);
    const summary = await TrainingDocument.getVerificationSummary(req.params.employeeId);
    res.json({ success: true, data: rows, summary });
  } catch (error) {
    fail(res, error, "Failed to load documents");
  }
}

// POST /api/training-documents/employee/:employeeId — multipart upload
async function upload(req, res) {
  try {
    const document = await trainingDocumentService.uploadDocument(
      {
        trainingEmployeeId: req.params.employeeId,
        documentType: req.body?.document_type,
        file: req.file,
      },
      context(req)
    );
    res.status(201).json({ success: true, message: "Document uploaded", data: document });
  } catch (error) {
    fail(res, error, "Failed to upload document");
  }
}

// GET /api/training-documents/:id/download
async function download(req, res) {
  try {
    const resolved = await trainingDocumentService.resolveDownload(req.params.id);

    if (resolved.kind === "drive") {
      return res.json({ success: true, data: { driveLink: resolved.driveLink } });
    }

    res.setHeader("Content-Type", resolved.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(resolved.fileName)}"`
    );
    res.sendFile(resolved.fullPath);
  } catch (error) {
    fail(res, error, "Failed to download document");
  }
}

// DELETE /api/training-documents/:id
async function remove(req, res) {
  try {
    await trainingDocumentService.deleteDocument(req.params.id, context(req));
    res.json({ success: true, message: "Document deleted" });
  } catch (error) {
    fail(res, error, "Failed to delete document");
  }
}

module.exports = { listAll, listTypes, listByEmployee, upload, download, remove };
