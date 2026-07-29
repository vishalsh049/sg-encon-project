const { isAllCircle, normalizeCircle } = require("../middleware/circleAccess");

const physicalDashboardCache = new Map();

function getCacheKey(prefix, payload = {}) {
  return `${prefix}:${JSON.stringify(payload)}`;
}

function getCachedValue(prefix, payload) {
  const key = getCacheKey(prefix, payload);
  const cached = physicalDashboardCache.get(key);
  if (!cached) return null;

  if (cached.expiresAt <= Date.now()) {
    physicalDashboardCache.delete(key);
    return null;
  }

  return cached.value;
}

function setCachedValue(prefix, payload, value, ttlMs = 60 * 1000) {
  physicalDashboardCache.set(getCacheKey(prefix, payload), {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function clearPhysicalCache() {
  physicalDashboardCache.clear();
}

async function ensureIndex(query, table, indexName, ddl) {
  const rows = await query(
    `
      SELECT 1
      FROM information_schema.statistics
      WHERE table_schema = DATABASE()
        AND table_name = ?
        AND index_name = ?
      LIMIT 1
    `,
    [table, indexName]
  );

  if (!rows.length) {
    await query(ddl);
  }
}

async function ensurePhysicalInfrastructure(query, ensureColumn) {
  await query(`
    CREATE TABLE IF NOT EXISTS physical_audit_logs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      entity_type VARCHAR(50) NOT NULL DEFAULT 'employee',
      entity_id BIGINT DEFAULT NULL,
      report_id BIGINT DEFAULT NULL,
      upload_job_id BIGINT DEFAULT NULL,
      action VARCHAR(100) NOT NULL,
      circle VARCHAR(100) DEFAULT NULL,
      cmp VARCHAR(100) DEFAULT NULL,
      actor_user_id BIGINT DEFAULT NULL,
      actor_name VARCHAR(255) DEFAULT NULL,
      actor_email VARCHAR(255) DEFAULT NULL,
      ip_address VARCHAR(64) DEFAULT NULL,
      user_agent TEXT DEFAULT NULL,
      previous_data LONGTEXT DEFAULT NULL,
      new_data LONGTEXT DEFAULT NULL,
      meta_json LONGTEXT DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS physical_employee_timeline (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      employee_id BIGINT NOT NULL,
      action VARCHAR(100) NOT NULL,
      actor_user_id BIGINT DEFAULT NULL,
      actor_name VARCHAR(255) DEFAULT NULL,
      circle VARCHAR(100) DEFAULT NULL,
      cmp VARCHAR(100) DEFAULT NULL,
      previous_data LONGTEXT DEFAULT NULL,
      new_data LONGTEXT DEFAULT NULL,
      meta_json LONGTEXT DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      module_name VARCHAR(100) NOT NULL,
      event_type VARCHAR(100) NOT NULL,
      title VARCHAR(255) NOT NULL,
      message TEXT DEFAULT NULL,
      circle VARCHAR(100) DEFAULT NULL,
      cmp VARCHAR(100) DEFAULT NULL,
      actor_user_id BIGINT DEFAULT NULL,
      reference_id BIGINT DEFAULT NULL,
      reference_type VARCHAR(100) DEFAULT NULL,
      is_read TINYINT(1) NOT NULL DEFAULT 0,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS physical_upload_jobs (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      file_name VARCHAR(255) DEFAULT NULL,
      original_name VARCHAR(255) DEFAULT NULL,
      uploaded_by_user_id BIGINT DEFAULT NULL,
      uploaded_by_name VARCHAR(255) DEFAULT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'PENDING',
      progress_percent DECIMAL(5,2) NOT NULL DEFAULT 0,
      current_row INT NOT NULL DEFAULT 0,
      total_rows INT NOT NULL DEFAULT 0,
      eta_seconds INT DEFAULT NULL,
      error_report_json LONGTEXT DEFAULT NULL,
      preview_payload_json LONGTEXT DEFAULT NULL,
      confirmed_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await ensureColumn("physical", "is_deleted", "TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn("physical", "deleted_at", "DATETIME NULL DEFAULT NULL");
  await ensureColumn("physical", "deleted_by", "BIGINT NULL DEFAULT NULL");
  await ensureColumn("physical", "updated_at", "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP");

  await ensureColumn("physical_reports", "is_deleted", "TINYINT(1) NOT NULL DEFAULT 0");
  await ensureColumn("physical_reports", "deleted_at", "DATETIME NULL DEFAULT NULL");
  await ensureColumn("physical_reports", "deleted_by", "BIGINT NULL DEFAULT NULL");
  await ensureColumn("physical_reports", "version_no", "INT NOT NULL DEFAULT 1");
  await ensureColumn("physical_reports", "archived_at", "DATETIME NULL DEFAULT NULL");
  await ensureColumn("physical_reports", "archived_by", "BIGINT NULL DEFAULT NULL");
  await ensureColumn("physical_reports", "parent_report_id", "BIGINT NULL DEFAULT NULL");

  await ensureIndex(
    query,
    "physical",
    "idx_physical_soft_circle",
    "CREATE INDEX idx_physical_soft_circle ON physical (is_deleted, circle)"
  );
  await ensureIndex(
    query,
    "physical",
    "idx_physical_employee_code",
    "CREATE INDEX idx_physical_employee_code ON physical (employee_code)"
  );
  await ensureIndex(
    query,
    "physical",
    "idx_physical_aadhaar",
    "CREATE INDEX idx_physical_aadhaar ON physical (aadhaar_no)"
  );
  await ensureIndex(
    query,
    "physical",
    "idx_physical_pf",
    "CREATE INDEX idx_physical_pf ON physical (pf_no)"
  );
  await ensureIndex(
    query,
    "physical",
    "idx_physical_uan",
    "CREATE INDEX idx_physical_uan ON physical (uan_no)"
  );
  await ensureIndex(
    query,
    "physical",
    "idx_physical_cmp",
    "CREATE INDEX idx_physical_cmp ON physical (cmp)"
  );
  await ensureIndex(
    query,
    "physical",
    "idx_physical_employment_status",
    "CREATE INDEX idx_physical_employment_status ON physical (employment_status)"
  );
  await ensureIndex(
    query,
    "physical",
    "idx_physical_job_role",
    "CREATE INDEX idx_physical_job_role ON physical (job_role)"
  );
  await ensureIndex(
    query,
    "physical",
    "idx_physical_report_id",
    "CREATE INDEX idx_physical_report_id ON physical (report_id)"
  );
  await ensureIndex(
    query,
    "physical_reports",
    "idx_physical_reports_soft_uploaded",
    "CREATE INDEX idx_physical_reports_soft_uploaded ON physical_reports (is_deleted, uploaded_at)"
  );
  await ensureIndex(
    query,
    "physical_employee_timeline",
    "idx_timeline_employee_created",
    "CREATE INDEX idx_timeline_employee_created ON physical_employee_timeline (employee_id, created_at)"
  );
  await ensureIndex(
    query,
    "physical_audit_logs",
    "idx_audit_entity_created",
    "CREATE INDEX idx_audit_entity_created ON physical_audit_logs (entity_type, entity_id, created_at)"
  );
}

function getActorContext(req) {
  return {
    actorUserId: req?.authUser?.id || null,
    actorName: req?.authUser?.name || req?.authUser?.username || null,
    actorEmail: req?.authUser?.email || null,
    ipAddress:
      req?.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req?.socket?.remoteAddress ||
      null,
    userAgent: req?.headers?.["user-agent"] || null,
  };
}

function sanitizeJsonPayload(value) {
  if (value === undefined) return null;
  return JSON.stringify(value === null ? null : value);
}

async function insertAuditLog(executor, payload) {
  await executor.query(
    `
      INSERT INTO physical_audit_logs (
        entity_type,
        entity_id,
        report_id,
        upload_job_id,
        action,
        circle,
        cmp,
        actor_user_id,
        actor_name,
        actor_email,
        ip_address,
        user_agent,
        previous_data,
        new_data,
        meta_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.entityType || "employee",
      payload.entityId || null,
      payload.reportId || null,
      payload.uploadJobId || null,
      payload.action,
      payload.circle || null,
      payload.cmp || null,
      payload.actorUserId || null,
      payload.actorName || null,
      payload.actorEmail || null,
      payload.ipAddress || null,
      payload.userAgent || null,
      sanitizeJsonPayload(payload.previousData),
      sanitizeJsonPayload(payload.newData),
      sanitizeJsonPayload(payload.meta),
    ]
  );
}

async function insertTimelineEvent(executor, payload) {
  if (!payload.employeeId) return;

  await executor.query(
    `
      INSERT INTO physical_employee_timeline (
        employee_id,
        action,
        actor_user_id,
        actor_name,
        circle,
        cmp,
        previous_data,
        new_data,
        meta_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.employeeId,
      payload.action,
      payload.actorUserId || null,
      payload.actorName || null,
      payload.circle || null,
      payload.cmp || null,
      sanitizeJsonPayload(payload.previousData),
      sanitizeJsonPayload(payload.newData),
      sanitizeJsonPayload(payload.meta),
    ]
  );
}

async function insertNotification(executor, payload) {
  await executor.query(
    `
      INSERT INTO notifications (
        module_name,
        event_type,
        title,
        message,
        circle,
        cmp,
        actor_user_id,
        reference_id,
        reference_type
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      payload.moduleName || "physical",
      payload.eventType,
      payload.title,
      payload.message || null,
      payload.circle || null,
      payload.cmp || null,
      payload.actorUserId || null,
      payload.referenceId || null,
      payload.referenceType || null,
    ]
  );
}

function createExecutor(queryFn) {
  return {
    query(sql, params = []) {
      return queryFn(sql, params);
    },
  };
}

// Wraps a single mysql2 pooled connection (already inside a transaction) in
// the same { query(sql, params) } executor shape as createExecutor(), so the
// insertAuditLog/insertTimelineEvent/insertNotification helpers below work
// identically whether called against the pool or a single transactional
// connection.
function createConnectionExecutor(conn) {
  return createExecutor((sql, params = []) =>
    conn.promise().query(sql, params).then(([rows]) => rows)
  );
}

function getSoftDeleteClause(alias = "physical") {
  return `COALESCE(${alias}.is_deleted, 0) = 0`;
}

function buildPhysicalFilters({
  authUser,
  filters = {},
  search = "",
  sortBy = "id",
  sortOrder = "DESC",
  tableAlias = "physical",
}) {
  const clauses = [getSoftDeleteClause(tableAlias)];
  const params = [];

  if (!isAllCircle(authUser)) {
    clauses.push(`LOWER(TRIM(${tableAlias}.circle)) = LOWER(TRIM(?))`);
    params.push(authUser.circle);
  }

  const exactFilters = [
    ["circle", `${tableAlias}.circle`],
    ["cmp", `${tableAlias}.cmp`],
    ["jobRole", `${tableAlias}.job_role`],
    ["employmentStatus", `${tableAlias}.employment_status`],
    ["reportingManager", `${tableAlias}.reporting_manager`],
    ["laptopStatus", `${tableAlias}.laptop_status`],
  ];

  exactFilters.forEach(([key, column]) => {
    if (filters[key]) {
      clauses.push(`LOWER(TRIM(COALESCE(${column}, ''))) = LOWER(TRIM(?))`);
      params.push(filters[key]);
    }
  });

  if (filters.salaryMin !== undefined && filters.salaryMin !== "") {
    clauses.push(`${tableAlias}.nth_salary >= ?`);
    params.push(Number(filters.salaryMin) || 0);
  }

  if (filters.salaryMax !== undefined && filters.salaryMax !== "") {
    clauses.push(`${tableAlias}.nth_salary <= ?`);
    params.push(Number(filters.salaryMax) || 0);
  }

  if (filters.ageMin !== undefined && filters.ageMin !== "") {
    clauses.push(`${tableAlias}.age >= ?`);
    params.push(Number(filters.ageMin) || 0);
  }

  if (filters.ageMax !== undefined && filters.ageMax !== "") {
    clauses.push(`${tableAlias}.age <= ?`);
    params.push(Number(filters.ageMax) || 0);
  }

  if (filters.dojFrom) {
    clauses.push(`${tableAlias}.date_of_joining >= ?`);
    params.push(filters.dojFrom);
  }

  if (filters.dojTo) {
    clauses.push(`${tableAlias}.date_of_joining <= ?`);
    params.push(filters.dojTo);
  }

  if (filters.uploadDateFrom) {
    clauses.push(`DATE(${tableAlias}.created_at) >= ?`);
    params.push(filters.uploadDateFrom);
  }

  if (filters.uploadDateTo) {
    clauses.push(`DATE(${tableAlias}.created_at) <= ?`);
    params.push(filters.uploadDateTo);
  }

  if (filters.reportDateFrom) {
    clauses.push(`pr.report_date >= ?`);
    params.push(filters.reportDateFrom);
  }

  if (filters.reportDateTo) {
    clauses.push(`pr.report_date <= ?`);
    params.push(filters.reportDateTo);
  }

  if (search) {
    const wildcard = `%${String(search).trim()}%`;
    clauses.push(`
      (
        ${tableAlias}.employee_name LIKE ?
        OR ${tableAlias}.employee_code LIKE ?
        OR ${tableAlias}.aadhaar_no LIKE ?
        OR ${tableAlias}.mobile_number LIKE ?
        OR ${tableAlias}.pan_no LIKE ?
        OR ${tableAlias}.pf_no LIKE ?
        OR ${tableAlias}.uan_no LIKE ?
        OR ${tableAlias}.circle LIKE ?
        OR ${tableAlias}.cmp LIKE ?
        OR ${tableAlias}.reporting_manager LIKE ?
      )
    `);
    params.push(
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      wildcard,
      wildcard
    );
  }

  const sortMap = {
    id: `${tableAlias}.id`,
    employee_name: `${tableAlias}.employee_name`,
    employee_code: `${tableAlias}.employee_code`,
    circle: `${tableAlias}.circle`,
    cmp: `${tableAlias}.cmp`,
    job_role: `${tableAlias}.job_role`,
    employment_status: `${tableAlias}.employment_status`,
    date_of_joining: `${tableAlias}.date_of_joining`,
    age: `${tableAlias}.age`,
    nth_salary: `${tableAlias}.nth_salary`,
    reporting_manager: `${tableAlias}.reporting_manager`,
    laptop_status: `${tableAlias}.laptop_status`,
    created_at: `${tableAlias}.created_at`,
    report_date: "pr.report_date",
  };

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
    orderBy: sortMap[sortBy] || `${tableAlias}.id`,
    orderDirection: String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC",
  };
}

function getDuplicateColumns(payload = {}) {
  return [
    ["aadhaar_no", payload.aadhaar_no],
    ["employee_code", payload.employee_code],
    ["pf_no", payload.pf_no],
    ["pan_no", payload.pan_no],
    ["uan_no", payload.uan_no],
    ["mobile_number", payload.mobile_number],
    ["company_email_id", payload.company_email_id],
  ].filter(([, value]) => String(value || "").trim() !== "");
}

async function findDuplicateEmployees(query, payload, excludeId = null) {
  const duplicateColumns = getDuplicateColumns(payload);
  if (!duplicateColumns.length) return [];

  const conditions = [];
  const params = [];

  duplicateColumns.forEach(([column, value]) => {
    conditions.push(`TRIM(COALESCE(${column}, '')) = TRIM(?)`);
    params.push(String(value).trim());
  });

  let sql = `
    SELECT id, employee_name, employee_code, circle, cmp, aadhaar_no, pf_no, pan_no, uan_no, mobile_number, company_email_id
    FROM physical
    WHERE COALESCE(is_deleted, 0) = 0
      AND (${conditions.join(" OR ")})
  `;

  if (excludeId) {
    sql += " AND id <> ?";
    params.push(excludeId);
  }

  return query(sql, params);
}

function isPrivilegedPhysicalAdmin(authUser) {
  const roleName = String(authUser?.roleName || "").trim().toLowerCase();
  return roleName === "admin" || isAllCircle(authUser);
}

function normalizeEmployeePayload(payload = {}) {
  const result = {};
  Object.keys(payload).forEach((key) => {
    result[key] = payload[key] === undefined ? null : payload[key];
  });

  if (result.circle) result.circle = normalizeCircle(result.circle) ? payload.circle : payload.circle;

  return result;
}

module.exports = {
  buildPhysicalFilters,
  clearPhysicalCache,
  createExecutor,
  createConnectionExecutor,
  ensurePhysicalInfrastructure,
  findDuplicateEmployees,
  getActorContext,
  getCachedValue,
  insertAuditLog,
  insertNotification,
  insertTimelineEvent,
  isPrivilegedPhysicalAdmin,
  normalizeEmployeePayload,
  setCachedValue,
};
