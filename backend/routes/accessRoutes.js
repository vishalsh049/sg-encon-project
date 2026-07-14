const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const {
ensureAccessTables,
listUsers,
query,
} = require("../services/accessControl");

const router = express.Router();

const JWT_SECRET =
process.env.JWT_SECRET ||
"SECRET_KEY";

function getTokenFromRequest(req) {
const header =
req.headers.authorization || "";

if (!header.startsWith("Bearer "))
return null;

return header.slice(7);
}

async function authMiddleware(
req,
res,
next
) {
try {
await ensureAccessTables();


const token =
  getTokenFromRequest(req);

if (!token) {
  return res.status(401).json({
    message:
      "Authentication required",
  });
}

const decoded = jwt.verify(
  token,
  JWT_SECRET
);

const rows = await query(
  `
  SELECT
    id,
    name,
    username,
    email,
    designation,
    circle,
    domain,
    status,
    page_permissions
  FROM users
  WHERE id = ?
  LIMIT 1
  `,
  [decoded.id]
);

const user = rows[0];

if (!user) {
  return res.status(401).json({
    message: "User not found",
  });
}

req.authUser = {
  id: user.id,
  name: user.name,
  username: user.username,
  designation:
    user.designation || "",
  circle: user.circle || "",
  domain: user.domain || "",
  status:
    user.status || "active",

  pagePermissions:
    user.page_permissions
      ? JSON.parse(
          user.page_permissions
        )
      : [],
  pageAccess:
    user.page_permissions
      ? JSON.parse(
          user.page_permissions
        ).map((item) => item.page)
      : [],
};

next();


} catch (_error) {
return res.status(401).json({
message:
"Invalid or expired token",
});
}
}

router.get(
"/users",
authMiddleware,
async (_req, res) => {
try {
const users = await listUsers();


  res.json({
    rows: users,
  });
} catch (_error) {
  res.status(500).json({
    message:
      "Failed to load users",
  });
}


}
);

router.post(
"/users",
authMiddleware,
async (req, res) => {
try {
const {
name,
designation = "",
username,
email,
password,
circle = "",
domain = "",
status = "active",
pagePermissions = [],
} = req.body || {};


  const normalizedName =
    String(name || "").trim();

  const normalizedDesignation =
    String(
      designation || ""
    ).trim();

  const normalizedUsername =
     String(username || "").trim();

     const normalizedEmail =
  String(email || "")
    .trim()
    .toLowerCase();

  const normalizedCircle =
    String(circle || "").trim();

  const normalizedDomain =
    String(domain || "").trim();

  const normalizedPassword =
    String(password || "").trim();

  if (
    !normalizedName ||
    !normalizedDesignation ||
    !normalizedUsername ||
    !normalizedEmail ||
    !normalizedPassword ||
    !normalizedCircle ||
    !normalizedDomain
  ) {
    return res.status(400).json({
      message:
        "Name, designation, username, email, password, circle, and domain are required",
    });
  }

  const result = await query(
    `
    INSERT INTO users (
      name,
      designation,
      username,
      email,
      password,
      circle,
      domain,
      status,
      page_permissions
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      normalizedName,
      normalizedDesignation,
      normalizedUsername,
      normalizedEmail,
      await bcrypt.hash(normalizedPassword, 10),
      normalizedCircle,
      normalizedDomain,
      status,
      JSON.stringify(
        pagePermissions || []
      ),
    ]
  );

  const users =
    await listUsers();

  const created = users.find(
    (user) =>
      user.id === result.insertId
  );

  res.status(201).json({
    message: "User created",
    row: created,
  });
} catch (error) {
  res.status(500).json({
    message:
      error.message ||
      "Failed to create user",
  });
}


}
);

router.put(
"/users/:id",
authMiddleware,
async (req, res) => {
try {
const userId = Number(
req.params.id
);


  const {
    name,
    designation = "",
    username,
    email,
    password,
    circle = "",
    domain = "",
    status = "active",
    pagePermissions = [],
  } = req.body || {};

  const normalizedName =
    String(name || "").trim();

  const normalizedDesignation =
    String(
      designation || ""
    ).trim();

  const normalizedUsername =
     String(username || "").trim();

     const normalizedEmail =
  String(email || "")
    .trim()
    .toLowerCase();

  const normalizedCircle =
    String(circle || "").trim();

  const normalizedDomain =
    String(domain || "").trim();

  const normalizedPassword =
    String(password || "").trim();

  if (
    !userId ||
    !normalizedName ||
    !normalizedDesignation ||
    !normalizedUsername ||
    !normalizedEmail ||
    !normalizedCircle ||
    !normalizedDomain
  ) {
    return res.status(400).json({
      message:
        "Valid user data is required",
    });
  }

  const updates = [
    normalizedName,
    normalizedDesignation,
    normalizedUsername,
    normalizedEmail,
    normalizedCircle,
    normalizedDomain,
    status,
    JSON.stringify(
      pagePermissions || []
    ),
  ];

  let sql = `
    UPDATE users
    SET
      name = ?,
      designation = ?,
      username = ?,
      email = ?,
      circle = ?,
      domain = ?,
      status = ?,
      page_permissions = ?
  `;

  if (normalizedPassword) {
    const hashedPassword = await bcrypt.hash(normalizedPassword, 10);
    sql += `
      , password = ?
      WHERE id = ?
    `;

    updates.push(
      hashedPassword,
      userId
    );
  } else {
    sql += `
      WHERE id = ?
    `;

    updates.push(userId);
  }

  await query(sql, updates);

  const users =
    await listUsers();

  const updated = users.find(
    (user) =>
      user.id === userId
  );

  res.json({
    message: "User updated",
    row: updated,
  });
} catch (error) {
  res.status(500).json({
    message:
      error.message ||
      "Failed to update user",
  });
}

}
);

router.put(
"/users/:id/status",
authMiddleware,
async (req, res) => {
try {
const userId = Number(
req.params.id
);

  const { status } =
    req.body || {};

  const normalizedStatus =
    String(status || "")
      .trim()
      .toLowerCase();

  if (
    !userId ||
    ![
      "active",
      "inactive",
    ].includes(
      normalizedStatus
    )
  ) {
    return res.status(400).json({
      message:
        "Valid status is required",
    });
  }

  await query(
    `
    UPDATE users
    SET status = ?
    WHERE id = ?
    `,
    [
      normalizedStatus,
      userId,
    ]
  );

  res.json({
    message:
      "User status updated",
  });
} catch (error) {
  res.status(500).json({
    message:
      error.message ||
      "Failed to update status",
  });
}

}
);

router.delete(
"/users/:id",
authMiddleware,
async (req, res) => {
try {
const userId = Number(
req.params.id
);

  if (!userId) {
    return res.status(400).json({
      message:
        "Valid user id is required",
    });
  }

  await query(
    `
    DELETE FROM users
    WHERE id = ?
    `,
    [userId]
  );

  res.json({
    message: "User deleted",
  });
} catch (error) {
  res.status(500).json({
    message:
      error.message ||
      "Failed to delete user",
  });
}

}
);

router.get(
"/session",
authMiddleware,
async (req, res) => {
res.json({
user: req.authUser,
});
}
);

module.exports = router;
