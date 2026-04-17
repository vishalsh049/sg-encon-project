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

const DEFAULT_ROLES = [
  {
    name: "Admin",
    description: "Full dashboard control",
    permissions: PERMISSIONS.map((permission) => permission.key),
  },
  {
    name: "Operations",
    description: "Upload and manage report activity",
    permissions: [
      "dashboard.view",
      "reports.upload",
      "files.download",
      "site.WIFI",
      "site.GSC",
    ],
  },
  {
    name: "Viewer",
    description: "Read-only visibility",
    permissions: [
      "dashboard.view",
      "files.download",
      "site.WIFI",
      "site.GSC",
    ],
  },
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

async function ensureAccessTables() {
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
      PRIMARY KEY (role_id, permission_id),
      CONSTRAINT fk_role_permissions_role
        FOREIGN KEY (role_id) REFERENCES roles(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_role_permissions_permission
        FOREIGN KEY (permission_id) REFERENCES permissions(id)
        ON DELETE CASCADE
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
  await ensureColumn("users", "circle", "VARCHAR(120) NULL");
  await ensureColumn("users", "domain", "VARCHAR(120) NULL");
  await ensureColumn("users", "status", "ENUM('active','inactive') DEFAULT 'active'");
  await ensureColumn("users", "created_at", "TIMESTAMP DEFAULT CURRENT_TIMESTAMP");

  await query(`
    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INT NOT NULL,
      permission_id INT NOT NULL,
      PRIMARY KEY (user_id, permission_id),
      CONSTRAINT fk_user_permissions_user
        FOREIGN KEY (user_id) REFERENCES users(id)
        ON DELETE CASCADE,
      CONSTRAINT fk_user_permissions_permission
        FOREIGN KEY (permission_id) REFERENCES permissions(id)
        ON DELETE CASCADE
    )
  `);

  try {
    await query(`
      ALTER TABLE users
      ADD CONSTRAINT fk_users_role
      FOREIGN KEY (role_id) REFERENCES roles(id)
      ON DELETE SET NULL
    `);
  } catch (error) {
    if (error.code !== "ER_DUP_KEYNAME" && error.code !== "ER_CANT_CREATE_TABLE") {
      if (!String(error.message || "").includes("Duplicate")) {
        throw error;
      }
    }
  }

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

  const permissionRows = await query(
    `SELECT id, permission_key FROM permissions ORDER BY id ASC`
  );
  const permissionMap = new Map(
    permissionRows.map((permission) => [permission.permission_key, permission.id])
  );

  for (const role of DEFAULT_ROLES) {
    await query(
      `
        INSERT INTO roles (name, description)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE description = VALUES(description)
      `,
      [role.name, role.description]
    );
  }

  const roleRows = await query(`SELECT id, name FROM roles`);
  const roleMap = new Map(roleRows.map((role) => [role.name, role.id]));

  for (const role of DEFAULT_ROLES) {
    const roleId = roleMap.get(role.name);
    if (!roleId) continue;

    const existing = await query(
      `SELECT COUNT(*) AS count FROM role_permissions WHERE role_id = ?`,
      [roleId]
    );

    if (Number(existing[0]?.count || 0) > 0) {
      continue;
    }

    for (const permissionKey of role.permissions) {
      const permissionId = permissionMap.get(permissionKey);
      if (!permissionId) continue;
      await query(
        `
          INSERT INTO role_permissions (role_id, permission_id)
          VALUES (?, ?)
          ON DUPLICATE KEY UPDATE role_id = role_id
        `,
        [roleId, permissionId]
      );
    }
  }

  const adminRoleId = roleMap.get("Admin") || null;
  if (adminRoleId) {
    await query(
      `
        UPDATE users
        SET role_id = ?
        WHERE role_id IS NULL
      `,
      [adminRoleId]
    );
  }
}

async function getRolePermissionsMap() {
  const rows = await query(`
    SELECT
      rp.role_id,
      p.id,
      p.permission_key,
      p.display_name,
      p.category
    FROM role_permissions rp
    INNER JOIN permissions p ON p.id = rp.permission_id
    ORDER BY p.category ASC, p.display_name ASC
  `);

  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.role_id)) {
      map.set(row.role_id, []);
    }
    map.get(row.role_id).push({
      id: row.id,
      key: row.permission_key,
      name: row.display_name,
      category: row.category,
    });
  });
  return map;
}

async function getUserPermissionsMap() {
  const rows = await query(`
    SELECT
      up.user_id,
      p.id,
      p.permission_key,
      p.display_name,
      p.category
    FROM user_permissions up
    INNER JOIN permissions p ON p.id = up.permission_id
    ORDER BY p.category ASC, p.display_name ASC
  `);

  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.user_id)) {
      map.set(row.user_id, []);
    }
    map.get(row.user_id).push({
      id: row.id,
      key: row.permission_key,
      name: row.display_name,
      category: row.category,
    });
  });
  return map;
}

async function listPermissions() {
  return query(`
    SELECT
      id,
      permission_key AS permissionKey,
      display_name AS displayName,
      category
    FROM permissions
    ORDER BY
      CASE category
        WHEN 'dashboard' THEN 1
        WHEN 'reports' THEN 2
        WHEN 'users' THEN 3
        WHEN 'site_type' THEN 4
        ELSE 5
      END,
      display_name ASC
  `);
}

async function listRoles() {
  const roles = await query(`
    SELECT id, name, description, created_at AS createdAt
    FROM roles
    ORDER BY created_at DESC, name ASC
  `);
  const permissionMap = await getRolePermissionsMap();

  return roles.map((role) => ({
    ...role,
    permissions: permissionMap.get(role.id) || [],
  }));
}

async function listUsers() {
  const rows = await query(`
    SELECT
      u.id,
      u.name,
      u.email,
      u.designation,
      u.circle,
      u.domain,
      u.status,
      u.created_at AS createdAt,
      r.id AS roleId,
      r.name AS roleName
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    ORDER BY u.created_at DESC, u.id DESC
  `);

  const permissionMap = await getRolePermissionsMap();
  const userPermissionMap = await getUserPermissionsMap();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    designation: row.designation,
    circle: row.circle,
    domain: row.domain,
    status: row.status,
    createdAt: row.createdAt,
    roleId: row.roleId,
    roleName: row.roleName || "Unassigned",
    permissions: [
      ...(permissionMap.get(row.roleId) || []),
      ...(userPermissionMap.get(row.id) || []),
    ],
  }));
}

module.exports = {
  PERMISSIONS,
  ensureAccessTables,
  getUserPermissionsMap,
  listPermissions,
  listRoles,
  listUsers,
  query,
};
