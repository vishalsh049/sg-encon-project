const { db } = require("../config/db");

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

const PERMISSIONS = [
  { key: "dashboard.view", name: "Dashboard View", category: "dashboard" },
  { key: "reports.upload", name: "Upload Reports", category: "reports" },
  { key: "reports.delete", name: "Delete Reports", category: "reports" },
  { key: "files.download", name: "Download Files", category: "reports" },
  { key: "users.manage", name: "User Management", category: "users" },
  { key: "site.WIFI", name: "WIFI Data Access", category: "site_type" },
  { key: "site.GSC", name: "GSC Data Access", category: "site_type" },
];

async function ensureColumn(table, column, definition) {
  try {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }
}

let ensureAccessTablesPromise = null;

async function ensureAccessTables() {
  if (!ensureAccessTablesPromise) {
    ensureAccessTablesPromise = ensureAccessTablesOnce().catch((error) => {
      ensureAccessTablesPromise = null;
      throw error;
    });
  }
  return ensureAccessTablesPromise;
}

async function ensureAccessTablesOnce() {
  await query(`
    CREATE TABLE IF NOT EXISTS roles (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100) NOT NULL UNIQUE,
      description VARCHAR(255) NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS permissions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      permission_key VARCHAR(120) NOT NULL UNIQUE,
      display_name VARCHAR(150) NOT NULL,
      category VARCHAR(60) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INT NOT NULL,
      permission_id INT NOT NULL,
      PRIMARY KEY (role_id, permission_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(120) NULL,
      email VARCHAR(120) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL
    )
  `);

  await ensureColumn("users", "role_id", "INT NULL");
  await ensureColumn("users", "designation", "VARCHAR(120) NULL");
  await ensureColumn(
  "users",
  "username",
  "VARCHAR(120) NULL"
);
  await ensureColumn("users", "circle", "VARCHAR(120) NULL");
  await ensureColumn("users", "domain", "VARCHAR(120) NULL");
  await ensureColumn("users", "status", "ENUM('active','inactive') DEFAULT 'active'");
  await ensureColumn("users", "created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");
  await ensureColumn("users", "page_permissions", "LONGTEXT NULL");
  await ensureColumn("users", "employee_id", "VARCHAR(60) NULL");
  await ensureColumn("users", "department", "VARCHAR(120) NULL");
  await ensureColumn("users", "mobile", "VARCHAR(20) NULL");
  await ensureColumn("users", "date_of_joining", "DATE NULL");
  await ensureColumn("users", "last_login", "DATETIME NULL");
  await ensureColumn("users", "profile_photo", "VARCHAR(255) NULL");
  await ensureColumn("users", "experience_years", "INT NULL");

  await query(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INT NOT NULL,
      permission_id INT NOT NULL,
      PRIMARY KEY (user_id, permission_id)
    )
  `);

  for (const permission of PERMISSIONS) {
    await query(
      `
        INSERT INTO permissions (permission_key, display_name, category)
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE
          display_name = VALUES(display_name),
          category = VALUES(category)
      `,
      [permission.key, permission.name, permission.category]
    );
  }

  await query(
    `
      INSERT INTO roles (name, description)
      VALUES (?, ?)
      ON DUPLICATE KEY UPDATE description = VALUES(description)
    `,
    ["Admin", "Full access"]
  );
}

function parsePagePermissions(rawValue) {
  if (!rawValue) return [];
  try {
    const parsed = JSON.parse(rawValue);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_error) {
    return [];
  }
}

async function listUsers() {
  const rows = await query(`
    SELECT
      u.id,
      u.name,
      u.username,
      u.email,
      u.designation,
      u.circle,
      u.domain,
      u.status,
      u.created_at AS createdAt,
      r.id AS roleId,
      r.name AS roleName,
      u.page_permissions AS pagePermissions
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    ORDER BY u.created_at DESC, u.id DESC
  `);

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    username: row.username,
    email: row.email,
    designation: row.designation,
    circle: row.circle,
    domain: row.domain,
    status: row.status,
    createdAt: row.createdAt,
    roleId: row.roleId,
    roleName: row.roleName || "Unassigned",
    pagePermissions: parsePagePermissions(row.pagePermissions),
    pageAccess: parsePagePermissions(row.pagePermissions).map((item) =>
  item.page.toLowerCase()
),
  }));
}

module.exports = {
  PERMISSIONS,
  ensureAccessTables,
  listUsers,
  query,
};
