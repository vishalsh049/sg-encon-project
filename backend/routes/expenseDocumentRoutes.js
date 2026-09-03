// -----------------------------------------------------------------------------
// Secure, session-less access to a single Expense Claim document.
//
// Why this exists: the Expense Claim Excel export embeds hyperlinks to each
// attached bill. A browser opening a hyperlink from Excel cannot send an
// `Authorization: Bearer <JWT>` header, so the normal authenticated route
// (/api/expense-claims/attachments/:id) answers "Authentication required".
//
// This route is mounted BEFORE the global auth middleware in server.js. It does
// NOT trust the session — it authorises the request purely by a 256-bit random
// capability token stored on the attachment row (expense_claim_attachments.
// access_token). The token, not the database id, is the credential:
//   * it is cryptographically random, so links cannot be guessed or enumerated
//     by walking /33, /34, /35 …
//   * it grants access to exactly ONE document
//   * deleting the attachment removes the row (and the token) → the link 404s
//   * an optional token_expires_at can time-box a link without code changes
//
// The actual file bytes live in expense_claim_attachments.file_data (LONGBLOB)
// in MariaDB — the same durable store the whole app uses — so documents survive
// every Node/Hostinger restart, redeploy, git deploy, rebuild and cache clear.
// -----------------------------------------------------------------------------

const express = require("express");
const router = express.Router();

const { db } = require("../config/db");
const pool = db.promise();
// Same idempotent, once-per-process schema check the main Expense Claims router
// runs — guarantees the access_token / token_expires_at columns exist and every
// legacy attachment has been backfilled with a token before we query them.
const { ensureTables } = require("./expenseClaimRoutes");

// Types a browser can safely render in a tab. Everything else is sent as a
// download so a stray Office/HTML file can't execute in the app's origin.
const INLINE_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
]);

const TOKEN_RE = /^[a-f0-9]{64}$/;
const NOT_FOUND = "This document link is invalid or has expired.";

router.get("/:token", async (req, res) => {
  try {
    const token = String(req.params.token || "").trim().toLowerCase();
    // Reject anything that isn't a well-formed token before touching the DB.
    if (!TOKEN_RE.test(token)) {
      return res.status(404).json({ success: false, message: NOT_FOUND });
    }

    await ensureTables();

    const [rows] = await pool.query(
      `SELECT file_name, file_type, file_size, file_data, token_expires_at
       FROM expense_claim_attachments
       WHERE access_token = ?
       LIMIT 1`,
      [token]
    );
    const att = rows[0];
    if (!att || !att.file_data) {
      return res.status(404).json({ success: false, message: NOT_FOUND });
    }
    if (att.token_expires_at && new Date(att.token_expires_at).getTime() < Date.now()) {
      return res.status(410).json({
        success: false,
        message: "This document link has expired. Re-export from the portal for a fresh link.",
      });
    }

    const type = (att.file_type || "application/octet-stream").toLowerCase();
    const disposition = INLINE_TYPES.has(type) ? "inline" : "attachment";
    const rawName = att.file_name || "document";
    const asciiName = rawName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");

    res.setHeader("Content-Type", att.file_type || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `${disposition}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(rawName)}`
    );
    res.setHeader("Content-Length", att.file_size || att.file_data.length);
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    return res.send(att.file_data);
  } catch (error) {
    console.error("expense-document fetch failed:", error && error.message);
    return res.status(500).json({ success: false, message: "Could not open the document." });
  }
});

module.exports = router;
