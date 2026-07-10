const fs = require("fs");
const path = require("path");
const TrainingDocument = require("../models/TrainingDocument");
const TrainingVerification = require("../models/TrainingVerification");
const TrainingLog = require("../models/TrainingLog");
const { getEmployeeOrThrow, httpError } = require("./trainingService");

const UPLOAD_DIR = path.join(__dirname, "..", "uploads", "training");

const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

// Enum labels defined by the training_documents.document_type column.
const { DOCUMENT_TYPES, normalizeDocumentType } = TrainingDocument;

function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  return UPLOAD_DIR;
}

function assertValidUpload(file) {
  if (!file) {
    throw httpError(400, "No file uploaded.");
  }
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
    throw httpError(400, "Only JPG, PNG, WEBP or PDF files are allowed.");
  }
  if (file.size > MAX_FILE_SIZE) {
    throw httpError(400, "File exceeds the 10 MB size limit.");
  }
}

function safeFileName(originalName) {
  const ext = path.extname(originalName || "").toLowerCase().slice(0, 10);
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

async function saveBufferToDisk(file) {
  ensureUploadDir();
  const fileName = safeFileName(file.originalname);
  const fullPath = path.join(UPLOAD_DIR, fileName);
  await fs.promises.writeFile(fullPath, file.buffer);
  // Store relative path so the project can move between machines.
  return path.join("uploads", "training", fileName);
}

/**
 * HR uploads (or replaces) a document for a candidate from the web app.
 */
async function uploadDocument({ trainingEmployeeId, documentType, file }, context = {}) {
  const employee = await getEmployeeOrThrow(trainingEmployeeId);
  if (employee.status === "Converted") {
    throw httpError(409, "Documents cannot be changed after conversion.");
  }

  const type = normalizeDocumentType(documentType);
  if (!type) {
    throw httpError(400, `document_type must be one of: ${DOCUMENT_TYPES.join(", ")}.`);
  }

  assertValidUpload(file);
  const localPath = await saveBufferToDisk(file);

  const existing = await TrainingDocument.findByEmployeeAndType(trainingEmployeeId, type);

  let documentId;
  if (existing) {
    await TrainingDocument.replaceFile(existing.id, {
      file_name: file.originalname,
      local_path: localPath,
      mime_type: file.mimetype,
      file_size: file.size,
      drive_file_id: existing.drive_file_id,
      drive_link: existing.drive_link,
    });
    documentId = existing.id;
  } else {
    documentId = await TrainingDocument.create({
      training_employee_id: trainingEmployeeId,
      document_type: type,
      file_name: file.originalname,
      local_path: localPath,
      mime_type: file.mimetype,
      file_size: file.size,
    });
  }

  await TrainingLog.record({
    trainingEmployeeId,
    action: existing ? "DOCUMENT_REPLACED" : "DOCUMENT_UPLOADED",
    details: { documentId, type, fileName: file.originalname },
    performedBy: context.performedBy,
    ipAddress: context.ipAddress,
  });

  return TrainingDocument.findById(documentId);
}

async function getDocumentOrThrow(id) {
  const doc = await TrainingDocument.findById(id);
  if (!doc) {
    throw httpError(404, "Document not found.");
  }
  return doc;
}

/**
 * Resolve a document to something the client can open:
 * local file stream info, or a Google Drive link redirect.
 */
async function resolveDownload(id) {
  const doc = await getDocumentOrThrow(id);

  if (doc.local_path) {
    const fullPath = path.join(__dirname, "..", doc.local_path);
    // Prevent path traversal — resolved path must stay inside the uploads dir.
    if (!path.resolve(fullPath).startsWith(path.resolve(UPLOAD_DIR))) {
      throw httpError(400, "Invalid document path.");
    }
    if (fs.existsSync(fullPath)) {
      return {
        kind: "local",
        fullPath,
        fileName: doc.file_name || path.basename(fullPath),
        mimeType: doc.mime_type || "application/octet-stream",
      };
    }
  }

  if (doc.drive_link) {
    return { kind: "drive", driveLink: doc.drive_link };
  }

  throw httpError(404, "No stored file or Drive link for this document.");
}

/**
 * Verify or reject a single document, with audit entries.
 */
async function setDocumentVerification(id, { status, remarks }, context = {}) {
  const doc = await getDocumentOrThrow(id);

  const matched = ["Verified", "Rejected", "Pending"].find(
    (s) => s.toLowerCase() === String(status || "").trim().toLowerCase()
  );
  if (!matched) {
    throw httpError(400, "Verification status must be Verified, Rejected or Pending.");
  }
  if (matched === "Rejected" && !String(remarks || "").trim()) {
    throw httpError(400, "Remarks are required when rejecting a document.");
  }

  await TrainingDocument.updateVerification(id, {
    status: matched,
    verifiedBy: context.performedBy || "system",
    remarks,
  });

  await TrainingVerification.create({
    trainingEmployeeId: doc.training_employee_id,
    documentId: id,
    action: matched === "Pending" ? "Reset" : matched,
    remarks,
    verifiedBy: context.performedBy || "system",
  });

  await TrainingLog.record({
    trainingEmployeeId: doc.training_employee_id,
    action: matched === "Verified" ? "DOCUMENT_VERIFIED" : `DOCUMENT_${matched.toUpperCase()}`,
    details: { documentId: id, type: doc.document_type, remarks },
    performedBy: context.performedBy,
    ipAddress: context.ipAddress,
  });

  return TrainingDocument.findById(id);
}

async function deleteDocument(id, context = {}) {
  const doc = await getDocumentOrThrow(id);
  const employee = await getEmployeeOrThrow(doc.training_employee_id);
  if (employee.status === "Converted") {
    throw httpError(409, "Documents cannot be deleted after conversion.");
  }

  await TrainingDocument.deleteById(id);

  if (doc.local_path) {
    const fullPath = path.join(__dirname, "..", doc.local_path);
    if (
      path.resolve(fullPath).startsWith(path.resolve(UPLOAD_DIR)) &&
      fs.existsSync(fullPath)
    ) {
      await fs.promises.unlink(fullPath).catch(() => {});
    }
  }

  await TrainingLog.record({
    trainingEmployeeId: doc.training_employee_id,
    action: "DOCUMENT_DELETED",
    details: { documentId: id, type: doc.document_type, fileName: doc.file_name },
    performedBy: context.performedBy,
    ipAddress: context.ipAddress,
  });
}

module.exports = {
  DOCUMENT_TYPES,
  MAX_FILE_SIZE,
  uploadDocument,
  getDocumentOrThrow,
  resolveDownload,
  setDocumentVerification,
  deleteDocument,
};
