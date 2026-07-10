const trainingService = require("../services/trainingService");
const TrainingEmployee = require("../models/TrainingEmployee");
const TrainingLog = require("../models/TrainingLog");

function context(req) {
  return {
    performedBy: req.authUser?.name || req.authUser?.username || req.authUser?.email || "system",
    ipAddress: req.ip,
  };
}

function fail(res, error, fallback = "Request failed") {
  console.error("TRAINING API ERROR:", error);
  // Surface schema drift explicitly instead of a generic failure message.
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

// GET /api/training
async function listEmployees(req, res) {
  try {
    const { search, status, batch, circle, dateFrom, dateTo, sortBy, sortDir, page, pageSize } =
      req.query;
    const result = await TrainingEmployee.list({
      search,
      status,
      batch,
      circle,
      dateFrom,
      dateTo,
      sortBy,
      sortDir,
      page,
      pageSize,
    });
    res.json({ success: true, data: result.rows, meta: result });
  } catch (error) {
    fail(res, error, "Failed to load training employees");
  }
}

// GET /api/training/stats
async function getStats(req, res) {
  try {
    const stats = await TrainingEmployee.getStats();
    res.json({ success: true, data: stats });
  } catch (error) {
    fail(res, error, "Failed to load training statistics");
  }
}

// GET /api/training/batches
async function listBatches(req, res) {
  try {
    const batches = await TrainingEmployee.listBatches();
    res.json({ success: true, data: batches });
  } catch (error) {
    fail(res, error, "Failed to load batches");
  }
}

// GET /api/training/export — Excel download
async function exportEmployees(req, res) {
  try {
    const { search, status, batch, circle, dateFrom, dateTo } = req.query;
    const workbook = await trainingService.buildEmployeesWorkbook({
      search,
      status,
      batch,
      circle,
      dateFrom,
      dateTo,
    });

    const fileName = `training-employees-${new Date().toISOString().slice(0, 10)}.xlsx`;
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);
    await workbook.xlsx.write(res);
    res.end();

    await TrainingLog.record({
      action: "EXPORTED",
      details: { filters: { search, status, batch, circle, dateFrom, dateTo } },
      performedBy: context(req).performedBy,
      ipAddress: req.ip,
    });
  } catch (error) {
    if (!res.headersSent) {
      fail(res, error, "Failed to export training employees");
    }
  }
}

// GET /api/training/logs — recent activity across the module
async function listRecentLogs(req, res) {
  try {
    const logs = await TrainingLog.listRecent(req.query.limit);
    res.json({ success: true, data: logs });
  } catch (error) {
    fail(res, error, "Failed to load activity logs");
  }
}

// GET /api/training/:id
async function getEmployee(req, res) {
  try {
    const employee = await trainingService.getEmployeeOrThrow(req.params.id);
    res.json({ success: true, data: employee });
  } catch (error) {
    fail(res, error, "Failed to load training employee");
  }
}

// GET /api/training/:id/logs
async function getEmployeeLogs(req, res) {
  try {
    await trainingService.getEmployeeOrThrow(req.params.id);
    const logs = await TrainingLog.listByEmployee(req.params.id, req.query.limit);
    res.json({ success: true, data: logs });
  } catch (error) {
    fail(res, error, "Failed to load activity log");
  }
}

// POST /api/training — manual registration by HR
async function createEmployee(req, res) {
  try {
    const employee = await trainingService.registerEmployee(
      { ...req.body, source: "manual" },
      context(req)
    );
    res.status(201).json({
      success: true,
      message: "Candidate registered successfully",
      data: employee,
    });
  } catch (error) {
    fail(res, error, "Failed to register candidate");
  }
}

// PUT /api/training/:id
async function updateEmployee(req, res) {
  try {
    const employee = await trainingService.updateEmployee(req.params.id, req.body, context(req));
    res.json({ success: true, message: "Candidate updated successfully", data: employee });
  } catch (error) {
    fail(res, error, "Failed to update candidate");
  }
}

// PUT /api/training/:id/status
async function updateStatus(req, res) {
  try {
    const employee = await trainingService.updateStatus(
      req.params.id,
      req.body?.status,
      req.body?.remarks,
      context(req)
    );
    res.json({ success: true, message: "Status updated", data: employee });
  } catch (error) {
    fail(res, error, "Failed to update status");
  }
}

// POST /api/training/:id/convert
async function convertToEmployee(req, res) {
  try {
    const result = await trainingService.convertToEmployee(req.params.id, context(req));
    res.json({
      success: true,
      message: `Converted successfully. Employee Code: ${result.employeeCode}`,
      data: result,
    });
  } catch (error) {
    fail(res, error, "Failed to convert candidate");
  }
}

// DELETE /api/training/:id
async function deleteEmployee(req, res) {
  try {
    await trainingService.deleteEmployee(req.params.id, context(req));
    res.json({ success: true, message: "Training record deleted" });
  } catch (error) {
    fail(res, error, "Failed to delete training record");
  }
}

// POST /api/training-webhook/google-form — called by Google Apps Script
async function googleFormWebhook(req, res) {
  try {
    const result = await trainingService.registerFromGoogleForm(req.body, {
      ipAddress: req.ip,
    });
    res.status(result.duplicate ? 200 : 201).json({
      success: true,
      duplicate: result.duplicate,
      message: result.duplicate
        ? "Submission already processed"
        : "Candidate registered from Google Form",
      data: { id: result.employee.id },
    });
  } catch (error) {
    fail(res, error, "Failed to process Google Form submission");
  }
}

module.exports = {
  listEmployees,
  getStats,
  listBatches,
  exportEmployees,
  listRecentLogs,
  getEmployee,
  getEmployeeLogs,
  createEmployee,
  updateEmployee,
  updateStatus,
  convertToEmployee,
  deleteEmployee,
  googleFormWebhook,
};
