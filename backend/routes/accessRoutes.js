const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {
  ensureAccessTables,
  listPermissions,
  listRoles,
  listUsers,
  query,
} = require("../services/accessControl");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "SECRET_KEY";

function getTokenFromRequest(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7);
}

async function authMiddleware(req, res, next) {
  try {
    await ensureAccessTables();
    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ message: "Authentication required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const rows = await query(
      `
        SELECT
          u.id,
          u.name,
          u.email,
          u.designation,
          u.circle,
          u.domain,
          u.status,
          r.id AS roleId,
          r.name AS roleName
        FROM users u
        LEFT JOIN roles r ON r.id = u.role_id
        WHERE u.id = ?
        LIMIT 1
      `,
      [decoded.id]
    );

    const user = rows[0];
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }

    const rolePermissions = await query(
      `
        SELECT p.permission_key AS permissionKey
        FROM role_permissions rp
        INNER JOIN permissions p ON p.id = rp.permission_id
        WHERE rp.role_id = ?
      `,
      [user.roleId || 0]
    );

    const userPermissions = await query(
      `
        SELECT p.permission_key AS permissionKey
        FROM user_permissions up
        INNER JOIN permissions p ON p.id = up.permission_id
        WHERE up.user_id = ?
      `,
      [user.id]
    );

    const permissions = Array.from(
      new Set([
        ...rolePermissions.map((permission) => permission.permissionKey),
        ...userPermissions.map((permission) => permission.permissionKey),
      ])
    );

    req.authUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      designation: user.designation || "",
      circle: user.circle || "",
      domain: user.domain || "",
      roleId: user.roleId,
      roleName: user.roleName || "Unassigned",
      permissions,
    };

    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (!req.authUser?.permissions?.includes(permissionKey)) {
      return res.status(403).json({ message: "Permission denied" });
    }
    next();
  };
}

async function replaceRolePermissions(roleId, permissionIds) {
  await query(`DELETE FROM role_permissions WHERE role_id = ?`, [roleId]);

  if (!permissionIds.length) return;

  const values = permissionIds.map((permissionId) => [roleId, permissionId]);
  await query(
    `INSERT INTO role_permissions (role_id, permission_id) VALUES ?`,
    [values]
  );
}

async function replaceUserPermissions(userId, permissionIds) {
  await query(`DELETE FROM user_permissions WHERE user_id = ?`, [userId]);

  if (!permissionIds.length) return;

  const values = permissionIds.map((permissionId) => [userId, permissionId]);
  await query(
    `INSERT INTO user_permissions (user_id, permission_id) VALUES ?`,
    [values]
  );
}

router.get("/permissions", authMiddleware, async (_req, res) => {
  try {
    const permissions = await listPermissions();
    res.json({ rows: permissions });
  } catch (error) {
    res.status(500).json({ message: "Failed to load permissions" });
  }
});

router.get("/roles", authMiddleware, async (_req, res) => {
  try {
    const roles = await listRoles();
    res.json({ rows: roles });
  } catch (error) {
    res.status(500).json({ message: "Failed to load roles" });
  }
});

router.post(
  "/roles",
  authMiddleware,
  requirePermission("users.manage"),
  async (req, res) => {
    try {
      const { name, description = "", permissionIds = [] } = req.body || {};
      if (!name?.trim()) {
        return res.status(400).json({ message: "Role name is required" });
      }

      const result = await query(
        `INSERT INTO roles (name, description) VALUES (?, ?)`,
        [name.trim(), description.trim() || null]
      );

      await replaceRolePermissions(result.insertId, permissionIds);
      const roles = await listRoles();
      const created = roles.find((role) => role.id === result.insertId);
      res.status(201).json({ message: "Role created", row: created });
    } catch (error) {
      res.status(500).json({ message: error.message || "Failed to create role" });
    }
  }
);

router.put(
  "/roles/:id",
  authMiddleware,
  requirePermission("users.manage"),
  async (req, res) => {
    try {
      const roleId = Number(req.params.id);
      const { name, description = "", permissionIds = [] } = req.body || {};

      if (!roleId) {
        return res.status(400).json({ message: "Valid role id is required" });
      }

      await query(`UPDATE roles SET name = ?, description = ? WHERE id = ?`, [
        name.trim(),
        description.trim() || null,
        roleId,
      ]);

      await replaceRolePermissions(roleId, permissionIds);
      const roles = await listRoles();
      const updated = roles.find((role) => role.id === roleId);
      res.json({ message: "Role updated", row: updated });
    } catch (error) {
      res.status(500).json({ message: error.message || "Failed to update role" });
    }
  }
);

router.delete(
  "/roles/:id",
  authMiddleware,
  requirePermission("users.manage"),
  async (req, res) => {
    try {
      const roleId = Number(req.params.id);
      if (!roleId) {
        return res.status(400).json({ message: "Valid role id is required" });
      }

      const users = await query(`SELECT COUNT(*) AS count FROM users WHERE role_id = ?`, [
        roleId,
      ]);
      if (Number(users[0]?.count || 0) > 0) {
        return res
          .status(400)
          .json({ message: "Cannot delete a role that is assigned to users" });
      }

      await query(`DELETE FROM roles WHERE id = ?`, [roleId]);
      res.json({ message: "Role deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message || "Failed to delete role" });
    }
  }
);

router.get("/users", authMiddleware, requirePermission("users.manage"), async (_req, res) => {
  try {
    const users = await listUsers();
    res.json({ rows: users });
  } catch (error) {
    res.status(500).json({ message: "Failed to load users" });
  }
});

router.post(
  "/users",
  authMiddleware,
  requirePermission("users.manage"),
  async (req, res) => {
    try {
      const {
        name,
        designation = "",
        email,
        password,
        roleId = null,
        circle = "",
        domain = "",
        status = "active",
        permissionIds = [],
      } = req.body || {};

      if (
        !name?.trim() ||
        !designation?.trim() ||
        !circle?.trim() ||
        !domain?.trim() ||
        !email?.trim() ||
        !password?.trim()
      ) {
        return res.status(400).json({
          message: "Name, designation, circle, domain, email, and password are required",
        });
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      const result = await query(
        `
          INSERT INTO users (name, designation, email, password, role_id, circle, domain, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          name.trim(),
          designation.trim(),
          email.trim().toLowerCase(),
          hashedPassword,
          roleId ? Number(roleId) : null,
          circle || null,
          domain || null,
          status,
        ]
      );

      await replaceUserPermissions(result.insertId, permissionIds);

      const users = await listUsers();
      const created = users.find((user) => user.id === result.insertId);
      res.status(201).json({ message: "User created", row: created });
    } catch (error) {
      res.status(500).json({ message: error.message || "Failed to create user" });
    }
  }
);

router.put(
  "/users/:id",
  authMiddleware,
  requirePermission("users.manage"),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const {
        name,
        designation = "",
        email,
        password,
        roleId = null,
        circle = "",
        domain = "",
        status = "active",
        permissionIds = [],
      } = req.body || {};

      if (
        !userId ||
        !name?.trim() ||
        !designation?.trim() ||
        !circle?.trim() ||
        !domain?.trim() ||
        !email?.trim()
      ) {
        return res.status(400).json({
          message: "Valid user data is required",
        });
      }

      const updates = [
        name.trim(),
        designation.trim(),
        email.trim().toLowerCase(),
        roleId ? Number(roleId) : null,
        circle || null,
        domain || null,
        status,
        userId,
      ];
      let sql = `
        UPDATE users
        SET name = ?, designation = ?, email = ?, role_id = ?, circle = ?, domain = ?, status = ?
      `;

      if (password?.trim()) {
        const hashedPassword = await bcrypt.hash(password, 10);
        sql += `, password = ? WHERE id = ?`;
        updates.splice(7, 0, hashedPassword);
      } else {
        sql += ` WHERE id = ?`;
      }

      await query(sql, updates);
      await replaceUserPermissions(userId, permissionIds);
      const users = await listUsers();
      const updated = users.find((user) => user.id === userId);
      res.json({ message: "User updated", row: updated });
    } catch (error) {
      res.status(500).json({ message: error.message || "Failed to update user" });
    }
  }
);

router.put(
  "/users/:id/status",
  authMiddleware,
  requirePermission("users.manage"),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const { status } = req.body || {};
      if (!userId || !["active", "inactive"].includes(String(status).toLowerCase())) {
        return res.status(400).json({ message: "Valid status is required" });
      }

      await query(`UPDATE users SET status = ? WHERE id = ?`, [status, userId]);
      res.json({ message: "User status updated" });
    } catch (error) {
      res.status(500).json({ message: error.message || "Failed to update status" });
    }
  }
);

router.delete(
  "/users/:id",
  authMiddleware,
  requirePermission("users.manage"),
  async (req, res) => {
    try {
      const userId = Number(req.params.id);
      if (!userId) {
        return res.status(400).json({ message: "Valid user id is required" });
      }

      await query(`DELETE FROM users WHERE id = ?`, [userId]);
      res.json({ message: "User deleted" });
    } catch (error) {
      res.status(500).json({ message: error.message || "Failed to delete user" });
    }
  }
);

router.get("/session", authMiddleware, async (req, res) => {
  res.json({ user: req.authUser });
});

module.exports = router;
