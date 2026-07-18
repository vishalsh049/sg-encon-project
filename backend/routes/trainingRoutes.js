const express = require("express");
const { authMiddleware } = require("../middleware/circleAccess");
const { requirePagePermission } = require("../middleware/pagePermission");
const trainingController = require("../controllers/trainingController");

const router = express.Router();

router.use(authMiddleware);

// Collection-level endpoints (must come before /:id)
router.get("/", trainingController.listEmployees);
router.get("/stats", trainingController.getStats);
router.get("/batches", trainingController.listBatches);
router.get("/export", requirePagePermission("Training", "download"), trainingController.exportEmployees);
router.get("/logs", trainingController.listRecentLogs);
router.post("/", requirePagePermission("Training", "edit"), trainingController.createEmployee);

// Record-level endpoints
router.get("/:id", trainingController.getEmployee);
router.get("/:id/logs", trainingController.getEmployeeLogs);
router.put("/:id", requirePagePermission("Training", "edit"), trainingController.updateEmployee);
router.put("/:id/status", requirePagePermission("Training", "edit"), trainingController.updateStatus);
router.post("/:id/convert", requirePagePermission("Training", "edit"), trainingController.convertToEmployee);
router.delete("/:id", requirePagePermission("Training", "delete"), trainingController.deleteEmployee);

module.exports = router;
