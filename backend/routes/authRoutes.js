  const express = require("express");
  const router = express.Router();

  const bcrypt = require("bcrypt");
  const { db, isConnected } = require("../config/db");
  const jwt = require("jsonwebtoken");
  const {
    ensureAccessTables,
    query,
  } = require("../services/accessControl");

  const JWT_SECRET = process.env.JWT_SECRET || "SECRET_KEY";

  // LOGIN API
  router.post("/login", (req, res) => {
   const { loginId, password } = req.body || {};

console.log("=== LOGIN DEBUG ===");
console.log("Login ID received:", loginId);
    console.log("DB connected:", isConnected());
    
    if (!isConnected()) {
      console.log("DB CONNECTION FAILED");
      return res.status(503).json({
        message: "Database connection failed. Check DB_HOST, DB_USER, DB_PASSWORD, DB_PORT env vars."
      });
    }

    if (!loginId || !password) {
      console.log("MISSING CREDENTIALS");
      return res.status(400).json({ message: "Email and password required" });
    }

    (async () => {
      try {
        console.log("Ensuring access tables...");
        await ensureAccessTables();

       const queryLoginId = String(loginId).trim();
console.log("Searching loginId:", queryLoginId);
        
        const result = await query(
          `
            SELECT
              u.*,
              r.name AS role_name,
              r.id AS role_id
            FROM users u
            LEFT JOIN roles r ON r.id = u.role_id
            WHERE u.email = ?
            OR u.username = ?
             LIMIT 1
          `,
          [
  queryLoginId.toLowerCase(),
  queryLoginId
]
        );

        if (!result.length) {
          console.log("NO USER FOUND for loginId:", queryLoginId);
          return res.status(401).json({ message: "Login ID not found" });
        }

        const user = result[0];
        console.log("User found:", user.id, user.email, "status:", user.status);
        
        if (String(user.status || "active").toLowerCase() !== "active") {
          console.log("USER INACTIVE:", user.status);
          return res.status(403).json({ message: `User account is inactive (status: ${user.status})` });
        }

        let passwordMatches = false;
        const storedPassword = String(user.password || "");

        if (storedPassword.startsWith("$2a$") || storedPassword.startsWith("$2b$") || storedPassword.startsWith("$2y$")) {
          passwordMatches = await bcrypt.compare(password, storedPassword);
        } else {
          passwordMatches = password === storedPassword;
        }

        if (!passwordMatches) {
          console.log("PASSWORD MISMATCH");
          return res.status(401).json({ message: "Wrong password" });
        }

        try {
          await query("UPDATE users SET last_login = NOW() WHERE id = ?", [user.id]);
        } catch (lastLoginError) {
          console.log("Failed to update last_login:", lastLoginError.message);
        }

        let permissions = ['dashboard.view']; // default
        try {
          console.log("Fetching permissions for role:", user.role_id, "user:", user.id);
          
          const [rolePermissionRows, userPermissionRows] = await Promise.all([
            query(
              `
                SELECT p.permission_key AS permissionKey
                FROM role_permissions rp
                INNER JOIN permissions p ON p.id = rp.permission_id
                WHERE rp.role_id = ?
              `,
              [user.role_id || 0]
            ),
            query(
              `
                SELECT p.permission_key AS permissionKey
                FROM user_permissions up
                INNER JOIN permissions p ON p.id = up.permission_id
                WHERE up.user_id = ?
              `,
              [user.id]
            ),
          ]);

          permissions = Array.from(
            new Set([
              ...rolePermissionRows.map((row) => row.permissionKey),
              ...userPermissionRows.map((row) => row.permissionKey),
            ])
          );
          console.log("Permissions loaded:", permissions.length, "total");
        } catch (permError) {
          console.log("Permissions query failed, using defaults:", permError.message);
          permissions = ['dashboard.view'];
        }
        console.log("JWT_SECRET set:", !!JWT_SECRET ? 'YES' : 'NO');
        console.log("Generating token...");
        
        const token = jwt.sign(
          {
            id: user.id,
            email: user.email,
            roleId: user.role_id || null,
            circle: user.circle || "",
            domain: user.domain || "",
          },
          JWT_SECRET || "fallback_secret_do_not_use_in_prod",
          { expiresIn: "1d" }
        );

        console.log("Token generated, sending response");
        
        res.json({
          message: "Login successful",
          token,
          user: {
            id: user.id,
            name: user.name || 'Admin',
            email: user.email,
            designation: user.designation || "Admin",
            circle: user.circle || "",
            domain: user.domain || "",
            status: user.status || "active",
            roleId: user.role_id || null,
            roleName: user.role_name || "Unassigned",
            permissions,
            pagePermissions: user.page_permissions
              ? JSON.parse(user.page_permissions)
              : [],
            pageAccess: user.page_permissions
              ? JSON.parse(user.page_permissions)
                  .filter((item) => item.view)
                  .map((item) => item.page)
              : [],
          },
        });
      } catch (err) {
        console.error("LOGIN FULL ERROR:", err);
        return res.status(500).json({ message: "Login failed" });
      }
    })();
    
    console.log("=== END LOGIN DEBUG ===");
  });

  module.exports = router;
