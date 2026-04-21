const mysql = require("mysql2");

// ✅ Use CONNECTION POOL (IMPORTANT)
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT),

  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,

  timezone: "+05:30",
});

let connected = false;

// ✅ Test connection once
db.getConnection((err, connection) => {
  if (err) {
    console.log("❌ DB Error:", err.message, {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
    });
    connected = false;
  } else {
    console.log("✅ MySQL Connected");
    connected = true;

    connection.query("SET time_zone = '+05:30'", (tzErr) => {
      if (tzErr) {
        console.warn("⚠️ Failed to set time_zone:", tzErr.message);
      } else {
        console.log("✅ MySQL session time_zone set to IST (+05:30)");
      }
    });

    connection.release(); // 🔥 VERY IMPORTANT
  }
});

// ✅ HANDLE ERRORS (prevents crash)
db.on("error", (err) => {
  console.error("❌ MySQL Pool Error:", err);
});

module.exports = {
  db,
  isConnected: () => connected,
};