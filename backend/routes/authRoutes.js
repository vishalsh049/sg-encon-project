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
  const { email, password } = req.body || {};
  console.log("=== LOGIN DEBUG ===");
  console.log("Email received:", email);
  console.log("DB connected:", isConnected());
  
  if (!isConnected()) {
    console.log("DB CONNECTION FAILED");
    return res.status(503).json({
      message: "Database connection failed. Check DB_HOST, DB_USER, DB_PASSWORD, DB_PORT env vars."
    });
  }

  if (!email || !password) {
    console.log("MISSING CREDENTIALS");
    return res.status(400).json({ message: "Email and password required" });
  }

  (async () => {
    try {
      console.log("Ensuring access tables...");
      await ensureAccessTables();

      const queryEmail = String(email).trim().toLowerCase();
      console.log("Searching email:", queryEmail);
      
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
        [queryEmail]
      );

      if (!result.length) {
        console.log("NO USER FOUND for email:", queryEmail);
        return res.status(401).json({ message: "Email not found" });
      }

      const user = result[0];
      console.log("User found:", user.id, user.email, "status:", user.status);
      
      if (String(user.status || "active").toLowerCase() !== "active") {
        console.log("USER INACTIVE:", user.status);
        return res.status(403).json({ message: `User account is inactive (status: ${user.status})` });
      }

      let passwordMatches = false;
      try {
        passwordMatches = await bcrypt.compare(password, user.password);
        console.log("Bcrypt compare result:", passwordMatches ? "MATCH" : "NO MATCH");
        console.log("Stored hash preview:", user.password?.substring(0,10) + "...");
      } catch (hashError) {
        console.log("Bcrypt compare ERROR:", hashError.message);
        passwordMatches = false;
      }

      // Auto-hash fallback
      if (!passwordMatches && password === user.password) {
        console.log("AUTO-HASHING PLAIN PASSWORD");
        const hashedPassword = await bcrypt.hash(password, 10);
        await query(`UPDATE users SET password = ? WHERE id = ?`, [hashedPassword, user.id]);
        passwordMatches = true;
        user.password = hashedPassword;
      }

      if (!passwordMatches) {
        console.log("PASSWORD MISMATCH");
        return res.status(401).json({ message: "Wrong password" });
      }

      let permissions = ['dashboard.view']; // default
      try {
        console.log("Fetching permissions for role:", user.role_id, "user:", user.id);
        
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
        { id: user.id, email: user.email, roleId: user.role_id || 1 },
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
          roleId: user.role_id || 1,
          roleName: user.role_name || "Admin",
          permissions,
        },
      });
    } catch (err) {
      console.error("LOGIN FULL ERROR:", err);
      return res.status(500).json({ error: err.message, stack: process.env.NODE_ENV === 'development' ? err.stack : undefined });
    }
  })();
  
  console.log("=== END LOGIN DEBUG ===");
});

module.exports = router;
