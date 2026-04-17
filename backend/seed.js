require("dotenv").config();

const mysql = require("mysql2/promise");

async function main() {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: 3306,
  });

  console.log("✅ Connected to MySQL, seeding data...");

  // Create tables if they don't exist
  await connection.execute(`
    CREATE TABLE IF NOT EXISTS sites (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      status ENUM('active','inactive') DEFAULT 'active'
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS manpower (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(100) NOT NULL,
      status ENUM('active','inactive') DEFAULT 'active'
    )
  `);

  await connection.execute(`
    CREATE TABLE IF NOT EXISTS site_uptime (
      id INT AUTO_INCREMENT PRIMARY KEY,
      site_id INT NULL,
      date DATE NOT NULL,
      uptime DECIMAL(5,2) NOT NULL
    )
  `);

  // Seed sample data
  await connection.execute(`TRUNCATE TABLE sites`);
  await connection.execute(`TRUNCATE TABLE manpower`);
  await connection.execute(`TRUNCATE TABLE site_uptime`);

  await connection.query(
    `INSERT INTO sites (name, type, status) VALUES ?`,
    [[
      ["Alpha Tower", "Telecom", "active"],
      ["Beta Hub", "Datacenter", "active"],
      ["Gamma Relay", "Telecom", "inactive"],
      ["Delta Edge", "Edge", "active"],
      ["Epsilon Node", "Cloud", "active"]
    ]]
  );

  await connection.query(
    `INSERT INTO manpower (name, role, status) VALUES ?`,
    [[
      ["Alice", "Engineer", "active"],
      ["Bob", "Technician", "active"],
      ["Carol", "Manager", "active"],
      ["Dave", "Engineer", "inactive"],
      ["Eve", "Scrum Master", "active"],
      ["Frank", "Engineer", "active"]
    ]]
  );

  // 7 days of uptime + 4 weeks aggregate
  const today = new Date();
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push([null, d.toISOString().slice(0, 10), 90 + Math.random() * 10]); // 90-100%
  }

  const weeks = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    weeks.push([null, d.toISOString().slice(0, 10), 90 + Math.random() * 10]);
  }

  await connection.query(
    `INSERT INTO site_uptime (site_id, date, uptime) VALUES ?`,
    [days.concat(weeks)]
  );

  console.log("🎉 Seed complete.");
  await connection.end();
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
