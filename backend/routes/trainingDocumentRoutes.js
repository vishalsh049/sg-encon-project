const express = require("express");
const multer = require("multer");
const { authMiddleware } = require("../middleware/circleAccess");
const { requirePagePermission } = require("../middleware/pagePermission");
const trainingDocumentController = require("../controllers/trainingDocumentController");
const { MAX_FILE_SIZE } = require("../services/trainingDocumentService");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

router.use(authMiddleware);

router.get("/", trainingDocumentController.listAll);
router.get("/types", trainingDocumentController.listTypes);
router.get("/employee/:employeeId", trainingDocumentController.listByEmployee);
router.post(
  "/employee/:employeeId",
  requirePagePermission("Training", "edit"),
  upload.single("file"),
  trainingDocumentController.upload
);
router.get("/:id/download", requirePagePermission("Training", "download"), trainingDocumentController.download);
router.delete("/:id", requirePagePermission("Training", "delete"), trainingDocumentController.remove);

module.exports = router;
