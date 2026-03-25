const express = require("express");
const router = express.Router();

const db = require("../config/db");
const jwt = require("jsonwebtoken");

// LOGIN API
router.post("/login", (req, res) => {
  console.log("BODY:", req.body); // debug

  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({
      message: "Email and password required",
    });
  }

  const sql = "SELECT * FROM users WHERE email=?";

  db.query(sql, [email], (err, result) => {
    if (err) {
      console.log("DB ERROR:", err); // debug
      return res.status(500).json({ error: err.message });
    }

    if (result.length === 0) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const user = result[0];

    if (password !== user.password) {
      return res.status(401).json({
        message: "Invalid email or password",
      });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      "SECRET_KEY",
      { expiresIn: "1d" }
    );

    res.json({
      message: "Login successful",
      token,
    });
  });
});

module.exports = router;