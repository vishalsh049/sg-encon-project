const { ensureTrainingTables, query } = require("./trainingTables");

async function create({ trainingEmployeeId, documentId, action, remarks, verifiedBy }) {
  await ensureTrainingTables();
  const result = await query(
    `INSERT INTO training_verifications (
      training_employee_id, document_id, action, remarks, verified_by,
      verification_status, verified_at
    ) VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [
      trainingEmployeeId,
      documentId || null,
      action,
      remarks || null,
      verifiedBy,
      // Keep the schema's own status column in sync where the action maps to it.
      ["Verified", "Rejected", "Pending"].includes(action) ? action : "Pending",
    ]
  );
  return result.insertId;
}

async function listByEmployee(trainingEmployeeId) {
  await ensureTrainingTables();
  return query(
    `SELECT v.*, d.document_type, d.file_name
     FROM training_verifications v
     LEFT JOIN training_documents d ON d.id = v.document_id
     WHERE v.training_employee_id = ?
     ORDER BY v.id DESC`,
    [trainingEmployeeId]
  );
}

async function listRecent(limit = 50) {
  await ensureTrainingTables();
  return query(
    `SELECT v.*, d.document_type, e.full_name
     FROM training_verifications v
     JOIN training_employees e ON e.id = v.training_employee_id
     LEFT JOIN training_documents d ON d.id = v.document_id
     ORDER BY v.id DESC
     LIMIT ?`,
    [Math.min(200, Math.max(1, parseInt(limit, 10) || 50))]
  );
}

async function deleteByEmployee(trainingEmployeeId) {
  await ensureTrainingTables();
  const result = await query(
    `DELETE FROM training_verifications WHERE training_employee_id = ?`,
    [trainingEmployeeId]
  );
  return result.affectedRows;
}

module.exports = { create, listByEmployee, listRecent, deleteByEmployee };
