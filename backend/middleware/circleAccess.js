const jwt = require("jsonwebtoken");
const { ensureAccessTables, query } = require("../services/accessControl");

// Without JWT_SECRET the app signs and verifies tokens with a well-known string
// that is published in this repository, so anyone can mint a token for any user
// (including an admin). Set JWT_SECRET in every environment.
//
// This warns rather than exits on purpose: a hard failure here would take a
// running deployment offline the moment it restarts. Once JWT_SECRET is set in
// all environments, replace this block with a startup throw.
const JWT_SECRET = process.env.JWT_SECRET || "SECRET_KEY";

if (!process.env.JWT_SECRET) {
  console.error(
    "\n" +
    "=".repeat(78) + "\n" +
    "  SECURITY WARNING: JWT_SECRET is not set.\n" +
    "\n" +
    "  Authentication is falling back to a hardcoded value that is visible in\n" +
    "  the source code. Anyone who knows it can sign a token for any account,\n" +
    "  including an administrator.\n" +
    "\n" +
    "  Fix: generate a secret and set JWT_SECRET in this environment, then\n" +
    "  restart. All users will need to sign in again once. Generate one with:\n" +
    "    node -e \"console.log(require('crypto').randomBytes(48).toString('base64url'))\"\n" +
    "=".repeat(78) + "\n"
  );
}

function normalizeCircle(value) {
  return String(value || "").trim();
}

function isAllCircle(userOrCircle) {
  const circle =
    typeof userOrCircle === "object"
      ? userOrCircle?.circle
      : userOrCircle;

  const normalized = normalizeCircle(circle).toUpperCase();
  return ["ALL", "ALL CIRCLE", "ALL CIRCLES"].includes(normalized);
}

function canAccessCircle(authUser, circle) {
  return (
    isAllCircle(authUser) ||
    normalizeCircle(authUser?.circle).toLowerCase() ===
      normalizeCircle(circle).toLowerCase()
  );
}

function addCircleFilter(filters, params, authUser, column = "circle") {
  if (!isAllCircle(authUser)) {
    filters.push(`LOWER(TRIM(${column})) = LOWER(TRIM(?))`);
    params.push(normalizeCircle(authUser?.circle));
  }
}

function circleUploadMessage(authUser) {
  return `Upload failed: You can upload only ${normalizeCircle(authUser?.circle)} circle data.`;
}

function assertRowsAllowedCircle(authUser, rows, getCircle, message) {
  if (isAllCircle(authUser)) return;

  const hasForeignCircle = rows.some((row) => !canAccessCircle(authUser, getCircle(row)));
  if (hasForeignCircle) {
    const error = new Error(message || circleUploadMessage(authUser));
    error.statusCode = 403;
    throw error;
  }
}

function forbid(res, message = "You cannot access another circle's data.") {
  return res.status(403).json({ success: false, message });
}

async function authMiddleware(req, res, next) {
  try {
    if (req.authUser) {
      return next();
    }

    const header = req.headers.authorization || "";
    if (!header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Authentication required" });
    }

    await ensureAccessTables();
    const decoded = jwt.verify(header.slice(7), JWT_SECRET);
    const rows = await query(
      `SELECT id, name, username, email, designation, circle, domain, status, role_id, page_permissions
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [decoded.id]
    );
    const user = rows[0];

    let roleName = "";
    if (user?.role_id) {
      const roleRows = await query(
        `SELECT name FROM roles WHERE id = ? LIMIT 1`,
        [user.role_id]
      );
      roleName = roleRows[0]?.name || "";
    }

    if (!user || String(user.status || "active").toLowerCase() !== "active") {
      return res.status(401).json({ message: "User not found or inactive" });
    }

    let pagePermissions = [];
    if (user.page_permissions) {
      try {
        const parsed = JSON.parse(user.page_permissions);
        pagePermissions = Array.isArray(parsed) ? parsed : [];
      } catch (_parseError) {
        pagePermissions = [];
      }
    }

    req.authUser = {
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      designation: user.designation || "",
      roleId: user.role_id || null,
      roleName,
      circle: normalizeCircle(user.circle),
      domain: user.domain || "",
      status: user.status || "active",
      pagePermissions,
      pageAccess: pagePermissions.filter((p) => p.view).map((p) => p.page),
    };

    if (!req.authUser.circle) {
      return res.status(403).json({ message: "User circle is not assigned" });
    }

    next();
  } catch (_error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

module.exports = {
  addCircleFilter,
  assertRowsAllowedCircle,
  authMiddleware,
  canAccessCircle,
  circleUploadMessage,
  forbid,
  isAllCircle,
  normalizeCircle,
};
