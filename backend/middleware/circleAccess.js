const jwt = require("jsonwebtoken");
const { ensureAccessTables, query } = require("../services/accessControl");

const JWT_SECRET = process.env.JWT_SECRET || "SECRET_KEY";

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

function assertRowsAllowedCircle(authUser, rows, getCircle) {
  if (isAllCircle(authUser)) return;

  const hasForeignCircle = rows.some((row) => !canAccessCircle(authUser, getCircle(row)));
  if (hasForeignCircle) {
    const error = new Error(circleUploadMessage(authUser));
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
      `SELECT id, name, username, email, designation, circle, domain, status, role_id
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
