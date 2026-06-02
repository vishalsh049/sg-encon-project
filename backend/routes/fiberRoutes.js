const express = require("express");
const path = require("path");
const xlsx = require("xlsx");
const { isConnected } = require("../config/db");

const {
  ensureFiberTables,
  fiberUpload,
  readWorksheetRows,
  createFiberUpload,
  getAllFiberUploads,
  getLatestFiberUpload,
  getFiberUploadById,
  getFiberRowsByUploadId,
  getLatestFiberSummary,
  getLatestFiberInventoryRows,
  updateFiberUpload,
  deleteFiberUpload,
  uploadsDir,
  downloadZip
} = require("../services/fiberInventoryService");

const router = express.Router();

function ensureDbConnection(res) {
  if (!isConnected()) {
    res.status(503).json({
      message:
        "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
    });
    return false;
  }

  return true;
}

router.get("/summary", async (req, res) => {
  if (!ensureDbConnection(res)) return;

  try {
    await ensureFiberTables();
    const summary = await getLatestFiberSummary();
    res.json(summary);
  } catch (err) {
    console.error("Fiber summary error:", err);
    res.status(500).json({
      message: err?.message || "Unable to load fiber summary.",
    });
  }
});

router.get("/uploads", async (req, res) => {
  if (!ensureDbConnection(res)) return;

  try {
    const rows = await getAllFiberUploads();
    res.json(rows);
  } catch (err) {
    console.error("Fetch uploads error:", err);
    res.status(500).json({
      message: err?.message || "Unable to fetch uploads.",
    });
  }
});

router.get("/latest-upload", async (req, res) => {
  if (!ensureDbConnection(res)) return;

  try {
    await ensureFiberTables();
    const latestUpload = await getLatestFiberUpload();
    res.json(latestUpload || null);
  } catch (err) {
    console.error("Latest fiber upload error:", err);
    res.status(500).json({
      message: err?.message || "Unable to load latest fiber upload.",
    });
  }
});

router.get("/latest-dataset", async (req, res) => {
  if (!ensureDbConnection(res)) return;

  try {
    await ensureFiberTables();
    const rows = await getLatestFiberInventoryRows();
    res.json(rows);
  } catch (err) {
    console.error("Latest fiber dataset error:", err);
    res.status(500).json({
      message: err?.message || "Unable to load latest fiber dataset.",
    });
  }
});

router.get("/uploads/:id/download", async (req, res) => {
  if (!ensureDbConnection(res)) return;

  try {
    await ensureFiberTables();
    const upload = await getFiberUploadById(req.params.id);

    if (!upload) {
      return res.status(404).json({ message: "Upload not found." });
    }
const rows = await getFiberRowsByUploadId(req.params.id);

const workbook = xlsx.utils.book_new();

const worksheet = xlsx.utils.json_to_sheet(
  rows.map((r) => ({
    Fiber_Type: r.fiber_type,
    Span_Type: r.span_type,
    CMM_APPD: r.cmm_appd,
    UG: r.ug,
    Aerial: r.aerial,
  }))
);

xlsx.utils.book_append_sheet(
  workbook,
  worksheet,
  "Fiber Data"
);

const buffer = xlsx.write(workbook, {
  type: "buffer",
  bookType: "xlsx",
});

res.setHeader(
  "Content-Disposition",
  `attachment; filename=Fiber_${upload.id}.xlsx`
);

res.setHeader(
  "Content-Type",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
);

return res.send(buffer);
  } catch (err) {
    console.error("Fiber download error:", err);
    res.status(500).json({
      message: err?.message || "Unable to download fiber file.",
    });
  }
});

router.post("/uploads/download-zip", downloadZip);

router.post("/uploads", (req, res) => {
  if (!ensureDbConnection(res)) return;

  fiberUpload.single("file")(req, res, async (err) => {
    if (err) {
      return res.status(400).json({ message: err.message });
    }

    try {
      await ensureFiberTables();
      const { date, uploadedBy } = req.body;
      const file = req.file;

      if (!date || !uploadedBy || !file) {
        return res.status(400).json({
          message: "Date, Uploaded By, and file are required.",
        });
      }

      const rows = readWorksheetRows(file.path);
      const uploadId = await createFiberUpload({
        date,
        uploadedBy,
        fileName: file.filename,
        rows,
      });

      const latestUpload = await getFiberUploadById(uploadId);
      res.status(201).json({
        message: "Fiber file uploaded successfully.",
        upload: latestUpload,
      });
    } catch (error) {
      console.error("Fiber upload error:", error);
      res.status(error.statusCode || 500).json({
        message: error.message || "Fiber upload failed.",
      });
    }
  });
});

router.put("/uploads/:id", async (req, res) => {
  if (!ensureDbConnection(res)) return;

  try {
    await ensureFiberTables();
    await updateFiberUpload(req.params.id, req.body || {});
    const updated = await getFiberUploadById(req.params.id);
    res.json({
      message: "Fiber upload updated successfully.",
      upload: updated,
    });
  } catch (err) {
    console.error("Fiber upload update error:", err);
    res.status(err.statusCode || 500).json({
      message: err.message || "Unable to update fiber upload.",
    });
  }
});

router.delete("/uploads/:id", async (req, res) => {
  if (!ensureDbConnection(res)) return;

  try {
    await ensureFiberTables();
    await deleteFiberUpload(req.params.id);
    res.json({ message: "Fiber upload deleted successfully." });
  } catch (err) {
    console.error("Fiber upload delete error:", err);
    res.status(err.statusCode || 500).json({
      message: err.message || "Unable to delete fiber upload.",
    });
  }
});

router.get("/", async (req, res) => {
  if (!ensureDbConnection(res)) return;

  try {
    await ensureFiberTables();
    const rows = await getLatestFiberInventoryRows();
    res.json(rows);
  } catch (err) {
    console.error("Fiber inventory fetch error:", err);
    res.status(500).json({
      message: err?.message || "Unable to fetch fiber inventory.",
    });
  }
});

module.exports = router;
