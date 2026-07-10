const { ensureTrainingTables, query } = require("./trainingTables");

/**
 * The API uses stable field names; the table (Phase 1 schema) uses different
 * column names for some of them. Writes are mapped API name -> column here,
 * and reads alias the columns back to the API names in SELECT_FIELDS.
 */
const FIELD_TO_COLUMN = {
  status: "training_status",
  alt_mobile: "alternate_mobile",
  permanent_address: "address",
  designation_applied: "position_applied",
  bank_account_no: "account_number",
  emergency_contact_name: "emergency_contact1_name",
  emergency_contact_no: "emergency_contact1_mobile",
};

// API-level writable fields (left side of FIELD_TO_COLUMN or 1:1 column names).
const WRITABLE_COLUMNS = [
  "form_response_id",
  "source",
  "full_name",
  "father_name",
  "dob",
  "gender",
  "marital_status",
  "blood_group",
  "mobile",
  "alt_mobile",
  "email",
  "permanent_address",
  "current_address",
  "city",
  "state",
  "pincode",
  "aadhaar_no",
  "pan_no",
  "qualification",
  "experience_years",
  "previous_company",
  "designation_applied",
  "circle",
  "training_batch",
  "training_start_date",
  "training_end_date",
  "bank_name",
  "bank_account_no",
  "ifsc_code",
  "emergency_contact_name",
  "emergency_contact_no",
  "status",
  "remarks",
];

// API sort key -> real column
const SORTABLE_COLUMNS = {
  id: "id",
  full_name: "full_name",
  created_at: "created_at",
  updated_at: "updated_at",
  status: "training_status",
  training_batch: "training_batch",
  circle: "circle",
  dob: "dob",
};

const SELECT_FIELDS = `
  training_employees.*,
  training_status AS status,
  alternate_mobile AS alt_mobile,
  address AS permanent_address,
  position_applied AS designation_applied,
  account_number AS bank_account_no,
  emergency_contact1_name AS emergency_contact_name,
  emergency_contact1_mobile AS emergency_contact_no
`;

function pickWritable(data) {
  const picked = {};
  for (const field of WRITABLE_COLUMNS) {
    if (data[field] !== undefined) {
      picked[FIELD_TO_COLUMN[field] || field] = data[field];
    }
  }
  return picked;
}

/** training_id is NOT NULL UNIQUE in the schema — generate one per record. */
function generateTrainingId() {
  return `TRN${Date.now()}${Math.floor(Math.random() * 100)}`.slice(0, 20);
}

/** first_name is NOT NULL in the schema — derive name parts from full_name. */
function nameParts(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  return {
    first_name: parts[0] || "",
    middle_name: parts.length > 2 ? parts.slice(1, -1).join(" ") : null,
    last_name: parts.length > 1 ? parts[parts.length - 1] : null,
  };
}

async function create(data) {
  await ensureTrainingTables();
  const record = pickWritable(data);

  record.training_id = generateTrainingId();
  Object.assign(record, nameParts(data.full_name));

  const columns = Object.keys(record);
  const result = await query(
    `INSERT INTO training_employees (${columns.join(", ")})
     VALUES (${columns.map(() => "?").join(", ")})`,
    columns.map((column) => record[column])
  );
  return result.insertId;
}

async function updateById(id, data) {
  await ensureTrainingTables();
  const record = pickWritable(data);
  if (data.full_name !== undefined) {
    Object.assign(record, nameParts(data.full_name));
  }
  const columns = Object.keys(record);
  if (!columns.length) return 0;
  const result = await query(
    `UPDATE training_employees
     SET ${columns.map((column) => `${column} = ?`).join(", ")}
     WHERE id = ?`,
    [...columns.map((column) => record[column]), id]
  );
  return result.affectedRows;
}

async function findById(id) {
  await ensureTrainingTables();
  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM training_employees WHERE id = ? LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findByAadhaar(aadhaarNo) {
  await ensureTrainingTables();
  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM training_employees WHERE aadhaar_no = ? LIMIT 1`,
    [aadhaarNo]
  );
  return rows[0] || null;
}

async function findByFormResponseId(formResponseId) {
  await ensureTrainingTables();
  const rows = await query(
    `SELECT ${SELECT_FIELDS} FROM training_employees
     WHERE form_response_id = ? OR google_form_response_id = ?
     LIMIT 1`,
    [formResponseId, formResponseId]
  );
  return rows[0] || null;
}

/**
 * List with search, filters, sorting, pagination.
 * options: { search, status, batch, circle, dateFrom, dateTo, sortBy, sortDir, page, pageSize }
 */
async function list(options = {}) {
  await ensureTrainingTables();

  const filters = [];
  const params = [];

  const search = String(options.search || "").trim();
  if (search) {
    filters.push(
      `(full_name LIKE ? OR aadhaar_no LIKE ? OR mobile LIKE ? OR employee_code LIKE ? OR email LIKE ?)`
    );
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }

  if (options.status) {
    filters.push(`training_status = ?`);
    params.push(options.status);
  }

  if (options.batch) {
    filters.push(`training_batch = ?`);
    params.push(options.batch);
  }

  if (options.circle) {
    filters.push(`LOWER(TRIM(circle)) = LOWER(TRIM(?))`);
    params.push(options.circle);
  }

  if (options.dateFrom) {
    filters.push(`DATE(created_at) >= ?`);
    params.push(options.dateFrom);
  }

  if (options.dateTo) {
    filters.push(`DATE(created_at) <= ?`);
    params.push(options.dateTo);
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";

  const sortBy = SORTABLE_COLUMNS[options.sortBy] || "id";
  const sortDir = String(options.sortDir || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";

  const page = Math.max(1, parseInt(options.page, 10) || 1);
  const pageSize = Math.min(200, Math.max(1, parseInt(options.pageSize, 10) || 20));
  const offset = (page - 1) * pageSize;

  const [countRows, rows] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM training_employees ${whereClause}`, params),
    query(
      `SELECT ${SELECT_FIELDS} FROM training_employees ${whereClause}
       ORDER BY ${sortBy} ${sortDir}
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    ),
  ]);

  return {
    rows,
    total: countRows[0]?.total || 0,
    page,
    pageSize,
  };
}

async function getStats() {
  await ensureTrainingTables();
  const [statusRows, recentRows, batchRows] = await Promise.all([
    query(
      `SELECT training_status AS status, COUNT(*) AS count
       FROM training_employees
       GROUP BY training_status`
    ),
    query(
      `SELECT DATE(created_at) AS day, COUNT(*) AS count
       FROM training_employees
       WHERE created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
       GROUP BY DATE(created_at)
       ORDER BY day`
    ),
    query(
      `SELECT training_batch, COUNT(*) AS count
       FROM training_employees
       WHERE training_batch IS NOT NULL AND training_batch <> ''
       GROUP BY training_batch
       ORDER BY count DESC
       LIMIT 10`
    ),
  ]);

  const byStatus = {};
  let total = 0;
  for (const row of statusRows) {
    byStatus[row.status] = row.count;
    total += row.count;
  }

  return { total, byStatus, registrationsLast30Days: recentRows, topBatches: batchRows };
}

async function listBatches() {
  await ensureTrainingTables();
  const rows = await query(
    `SELECT DISTINCT training_batch
     FROM training_employees
     WHERE training_batch IS NOT NULL AND training_batch <> ''
     ORDER BY training_batch`
  );
  return rows.map((row) => row.training_batch);
}

async function markConverted(id, { employeeCode, convertedBy }) {
  await ensureTrainingTables();
  const result = await query(
    `UPDATE training_employees
     SET training_status = 'Converted', employee_code = ?, converted_at = NOW(), converted_by = ?
     WHERE id = ? AND training_status <> 'Converted'`,
    [employeeCode, convertedBy, id]
  );
  return result.affectedRows;
}

async function deleteById(id) {
  await ensureTrainingTables();
  const result = await query(`DELETE FROM training_employees WHERE id = ?`, [id]);
  return result.affectedRows;
}

module.exports = {
  WRITABLE_COLUMNS,
  create,
  updateById,
  findById,
  findByAadhaar,
  findByFormResponseId,
  list,
  getStats,
  listBatches,
  markConverted,
  deleteById,
};
