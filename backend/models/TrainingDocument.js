const { ensureTrainingTables, query } = require("./trainingTables");

/**
 * document_type is an ENUM in the database. The Google Form webhook and the
 * older API send snake_case codes, so every write normalizes to the enum label.
 */
const DOCUMENT_TYPES = [
  "Photo",
  "Resume",
  "Aadhaar Front",
  "Aadhaar Back",
  "PAN",
  "Passbook",
  "Driving License",
  "Police Verification",
  "Medical Certificate",
  "Education Certificate",
  "Experience Letter",
  "Other",
];

const TYPE_ALIASES = {
  photo: "Photo",
  resume: "Resume",
  aadhaar_front: "Aadhaar Front",
  aadhaar_back: "Aadhaar Back",
  pan: "PAN",
  pan_card: "PAN",
  passbook: "Passbook",
  bank_passbook: "Passbook",
  driving_license: "Driving License",
  police_verification: "Police Verification",
  medical_certificate: "Medical Certificate",
  education_certificate: "Education Certificate",
  experience_letter: "Experience Letter",
  other: "Other",
};

/** Returns the enum label for any accepted spelling, or null if unknown. */
function normalizeDocumentType(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const exact = DOCUMENT_TYPES.find((t) => t.toLowerCase() === raw.toLowerCase());
  if (exact) return exact;
  return TYPE_ALIASES[raw.toLowerCase().replace(/[\s-]+/g, "_")] || null;
}

// file_url is the stored column; the API exposes it as drive_link.
const SELECT_FIELDS = `training_documents.*, file_url AS drive_link`;

async function create(data) {
  await ensureTrainingTables();
  const result = await query(
    `INSERT INTO training_documents (
      training_employee_id, document_type, file_name, drive_file_id,
      file_url, local_path, mime_type, file_size
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.training_employee_id,
      data.document_type,
      data.file_name || null,
      data.drive_file_id || null,
      data.drive_link || null,
      data.local_path || null,
      data.mime_type || null,
      data.file_size || null,
    ]
  );
  return result.insertId;
}

async function findById(id) {
  await ensureTrainingTables();
  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM training_documents WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function listByEmployee(trainingEmployeeId) {
  await ensureTrainingTables();
  return query(
    `SELECT ${SELECT_FIELDS} FROM training_documents
     WHERE training_employee_id = ?
     ORDER BY document_type, id`,
    [trainingEmployeeId]
  );
}

async function findByEmployeeAndType(trainingEmployeeId, documentType) {
  await ensureTrainingTables();
  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM training_documents
     WHERE training_employee_id = ? AND document_type = ?
     LIMIT 1`,
    [trainingEmployeeId, documentType]
  );
  return rows[0] || null;
}

/**
 * List documents across employees for the Documents / Verification screens.
 * options: { status, search, page, pageSize }
 */
async function listAll(options = {}) {
  await ensureTrainingTables();

  const filters = [];
  const params = [];

  if (options.status) {
    filters.push(`d.verification_status = ?`);
    params.push(options.status);
  }

  const search = String(options.search || "").trim();
  if (search) {
    filters.push(`(e.full_name LIKE ? OR e.aadhaar_no LIKE ? OR e.mobile LIKE ?)`);
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(options.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  const [countRows, rows] = await Promise.all([
    query(
      `SELECT COUNT(*) AS total
       FROM training_documents d
       JOIN training_employees e ON e.id = d.training_employee_id
       ${whereClause}`,
      params
    ),
    query(
      `SELECT d.*, d.file_url AS drive_link,
              e.full_name, e.aadhaar_no, e.mobile,
              e.training_status AS employee_status
       FROM training_documents d
       JOIN training_employees e ON e.id = d.training_employee_id
       ${whereClause}
       ORDER BY d.id DESC
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    ),
  ]);

  return { rows, total: countRows[0]?.total || 0, page, pageSize };
}

async function updateVerification(id, { status, verifiedBy, remarks }) {
  await ensureTrainingTables();
  const result = await query(
    `UPDATE training_documents
     SET verification_status = ?, verified_by = ?, verified_at = NOW(), remarks = ?
     WHERE id = ?`,
    [status, verifiedBy, remarks || null, id]
  );
  return result.affectedRows;
}

async function replaceFile(id, data) {
  await ensureTrainingTables();
  const result = await query(
    `UPDATE training_documents
     SET file_name = ?, drive_file_id = ?, file_url = ?, local_path = ?,
         mime_type = ?, file_size = ?, verification_status = 'Pending',
         verified_by = NULL, verified_at = NULL
     WHERE id = ?`,
    [
      data.file_name || null,
      data.drive_file_id || null,
      data.drive_link || null,
      data.local_path || null,
      data.mime_type || null,
      data.file_size || null,
      id,
    ]
  );
  return result.affectedRows;
}

async function deleteById(id) {
  await ensureTrainingTables();
  const result = await query(`DELETE FROM training_documents WHERE id = ?`, [id]);
  return result.affectedRows;
}

async function deleteByEmployee(trainingEmployeeId) {
  await ensureTrainingTables();
  const result = await query(
    `DELETE FROM training_documents WHERE training_employee_id = ?`,
    [trainingEmployeeId]
  );
  return result.affectedRows;
}

async function getVerificationSummary(trainingEmployeeId) {
  await ensureTrainingTables();
  const rows = await query(
    `SELECT verification_status, COUNT(*) AS count
     FROM training_documents
     WHERE training_employee_id = ?
     GROUP BY verification_status`,
    [trainingEmployeeId]
  );
  const summary = { Pending: 0, Verified: 0, Rejected: 0, total: 0 };
  for (const row of rows) {
    summary[row.verification_status] = row.count;
    summary.total += row.count;
  }
  return summary;
}

module.exports = {
  DOCUMENT_TYPES,
  normalizeDocumentType,
  create,
  findById,
  listByEmployee,
  findByEmployeeAndType,
  listAll,
  updateVerification,
  replaceFile,
  deleteById,
  deleteByEmployee,
  getVerificationSummary,
};
