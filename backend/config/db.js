const mysql = require("mysql2");

const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: Number(process.env.DB_PORT), // ? FIXED (no fallback)
  // Use IST for storage/display consistency
  timezone: "+05:30",
});

let connected = false;

db.connect((err) => {
  if (err) {
    console.log("? DB Error:", err.message, {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      user: process.env.DB_USER,
    });
    connected = false;
  } else {
    console.log("? MySQL Connected");
    connected = true;

    // Ensure CURRENT_TIMESTAMP and TIMESTAMP columns are in IST for this session
    db.query("SET time_zone = '+05:30'", (tzErr) => {
      if (tzErr) {
        console.warn(
          "?? Failed to set MySQL time_zone to IST:",
          tzErr.message
        );
      } else {
        console.log("? MySQL session time_zone set to IST (+05:30)");
      }
    });
  }
});

module.exports = {
  db,
  isConnected: () => connected,
};
