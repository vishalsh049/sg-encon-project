const express = require("express");
const { authMiddleware } = require("../middleware/circleAccess");
const { requirePagePermission } = require("../middleware/pagePermission");
const trainingVerificationController = require("../controllers/trainingVerificationController");

const router = express.Router();

router.use(authMiddleware);

router.get("/recent", trainingVerificationController.listRecent);
router.get("/employee/:employeeId", trainingVerificationController.listByEmployee);
router.put("/document/:documentId", requirePagePermission("Training", "edit"), trainingVerificationController.verifyDocument);

module.exports = router;
