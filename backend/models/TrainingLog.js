const { ensureTrainingTables, query } = require("./trainingTables");

// The table stores details in action_details; the API exposes them as details.
const SELECT_FIELDS = `training_logs.*, action_details AS details`;

async function record({ trainingEmployeeId, action, details, performedBy, ipAddress }) {
  try {
    await ensureTrainingTables();
    await query(
      `INSERT INTO training_logs (
        training_employee_id, action, action_details, performed_by, ip_address
      ) VALUES (?, ?, ?, ?, ?)`,
      [
        trainingEmployeeId || null,
        action,
        details ? JSON.stringify(details) : null,
        performedBy || "system",
        ipAddress || null,
      ]
    );
  } catch (error) {
    // Logging must never break the main workflow.
    console.error("TRAINING LOG ERROR:", error.message);
  }
}

async function listByEmployee(trainingEmployeeId, limit = 100) {
  await ensureTrainingTables();
  return query(
    `SELECT ${SELECT_FIELDS} FROM training_logs
     WHERE training_employee_id = ?
     ORDER BY id DESC
     LIMIT ?`,
    [trainingEmployeeId, Math.min(500, Math.max(1, parseInt(limit, 10) || 100))]
  );
}

async function listRecent(limit = 100) {
  await ensureTrainingTables();
  return query(
    `SELECT l.*, l.action_details AS details, e.full_name
     FROM training_logs l
     LEFT JOIN training_employees e ON e.id = l.training_employee_id
     ORDER BY l.id DESC
     LIMIT ?`,
    [Math.min(500, Math.max(1, parseInt(limit, 10) || 100))]
  );
}

module.exports = { record, listByEmployee, listRecent };
