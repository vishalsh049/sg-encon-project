const express = require("express");
const jwt = require("jsonwebtoken");
const { query, ensureAccessTables } = require("../services/accessControl");

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || "SECRET_KEY";

function getTokenFromRequest(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  return header.slice(7);
}

router.get("/me", async (req, res) => {
  try {
    await ensureAccessTables();

    const token = getTokenFromRequest(req);
    if (!token) return res.status(401).json({ message: "Authentication required" });

    const decoded = jwt.verify(token, JWT_SECRET);

    const rows = await query(
      `
      SELECT
        u.*,
        r.id AS role_id,
        r.name AS role_name
      FROM users u
      LEFT JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?
      LIMIT 1
    `,
      [decoded.id]
    );

    if (!rows.length) return res.status(401).json({ message: "User not found" });

    const user = rows[0];

    const rolePermissionRows = await query(
      `
      SELECT p.permission_key AS permissionKey
      FROM role_permissions rp
      INNER JOIN permissions p ON p.id = rp.permission_id
      WHERE rp.role_id = ?
    `,
      [user.role_id || 0]
    );

    const userPermissionRows = await query(
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
        ...rolePermissionRows.map((row) => row.permissionKey),
        ...userPermissionRows.map((row) => row.permissionKey),
      ]),
    );

    const pagePermissions = user.page_permissions ? JSON.parse(user.page_permissions) : [];
    const pageAccess = Array.isArray(pagePermissions)
      ? pagePermissions.filter((p) => p.view).map((p) => p.page)
      : [];

    res.json({
      id: user.id,
      name: user.name || "Admin",
      username: user.username || "",
      email: user.email,
      designation: user.designation || "",
      circle: user.circle || "",
      domain: user.domain || "",
      status: user.status || "active",
      roleId: user.role_id || null,
      roleName: user.role_name || "Unassigned",
      employeeId: user.employee_id || "",
      department: user.department || "",
      mobile: user.mobile || "",
      dateOfJoining: user.date_of_joining || null,
      lastLogin: user.last_login || null,
      profilePhoto: user.profile_photo || "",
      experienceYears: user.experience_years || null,
      createdAt: user.created_at || null,
      permissions,
      pagePermissions,
      pageAccess,
    });
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
});

module.exports = router;
