const express = require("express");
const { authMiddleware } = require("../middleware/circleAccess");
const trainingController = require("../controllers/trainingController");

const router = express.Router();

router.use(authMiddleware);

// Collection-level endpoints (must come before /:id)
router.get("/", trainingController.listEmployees);
router.get("/stats", trainingController.getStats);
router.get("/batches", trainingController.listBatches);
router.get("/export", trainingController.exportEmployees);
router.get("/logs", trainingController.listRecentLogs);
router.post("/", trainingController.createEmployee);

// Record-level endpoints
router.get("/:id", trainingController.getEmployee);
router.get("/:id/logs", trainingController.getEmployeeLogs);
router.put("/:id", trainingController.updateEmployee);
router.put("/:id/status", trainingController.updateStatus);
router.post("/:id/convert", trainingController.convertToEmployee);
router.delete("/:id", trainingController.deleteEmployee);

module.exports = router;
