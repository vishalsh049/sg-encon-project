const express = require("express");
const router = express.Router();

const { db, isConnected } = require("../config/db");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const {
  ensureAccessTables,
  query,
} = require("../services/accessControl");

const JWT_SECRET = process.env.JWT_SECRET || "SECRET_KEY";

// LOGIN API
router.post("/login", (req, res) => {
  console.log("BODY:", req.body); // debug

  if (!isConnected()) {
    return res.status(503).json({
      message:
        "Backend cannot reach the database. Please verify DB host/credentials or firewall rules.",
    });
  }

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password required",
    });
  }

  (async () => {
    try {
      await ensureAccessTables();

      const result = await query(
        `
          SELECT
            u.*,
            r.name AS role_name,
            r.id AS role_id
          FROM users u
          LEFT JOIN roles r ON r.id = u.role_id
          WHERE u.email = ?
          LIMIT 1
        `,
        [String(email).trim().toLowerCase()]
      );

      if (!result.length) {
        return res.status(401).json({
          message: "Invalid email or password",
        });
      }

      const user = result[0];
      if (String(user.status || "active").toLowerCase() !== "active") {
        return res.status(403).json({ message: "User account is inactive" });
      }

      let passwordMatches = false;
      try {
        passwordMatches = await bcrypt.compare(password, user.password);
      } catch (_error) {
        passwordMatches = false;
      }

      if (!passwordMatches && password === user.password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        await query(`UPDATE users SET password = ? WHERE id = ?`, [
          hashedPassword,
          user.id,
        ]);
        passwordMatches = true;
        user.password = hashedPassword;
      }

      if (!passwordMatches) {
        return res.status(401).json({
          message: "Invalid email or password",
        });
      }

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
        ])
      );
      const token = jwt.sign(
        { id: user.id, email: user.email, roleId: user.role_id },
        JWT_SECRET,
        { expiresIn: "1d" }
      );

      res.json({
        message: "Login successful",
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          designation: user.designation || "",
          circle: user.circle || "",
          domain: user.domain || "",
          status: user.status || "active",
          roleId: user.role_id,
          roleName: user.role_name || "Unassigned",
          permissions,
        },
      });
    } catch (err) {
      console.log("DB ERROR:", err);
      return res.status(500).json({ error: err.message });
    }
  })();
});

module.exports = router;
