require("dotenv").config();
const bcrypt = require("bcrypt");
const mysql = require("mysql2/promise");
const { ensureAccessTables } = require("./services/accessControl");

async function main() {
  const connection = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT || 3306),
  });

  console.log("🔗 Connecting to MySQL & seeding users...");
  
  const conn = await connection;
  
  try {
    // Setup tables
    await ensureAccessTables();
    console.log("✅ Access tables ready");

    // Create admin user
    const email = "test@test.com";
    const password = "123456";
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Insert/update user
    await conn.execute(`
      INSERT INTO users (email, password, name, designation, role_id, status) 
      VALUES (?, ?, 'Test Admin', 'Admin', 1, 'active')
      ON DUPLICATE KEY UPDATE 
        password = VALUES(password), status = 'active', role_id = 1
    `, [email, hashedPassword]);
    
    console.log(`✅ Created/Updated user: ${email} (hash starts: ${hashedPassword.substring(0,10)}...)`);

    console.log("🎉 User seed complete! Login with test@test.com / 123456");
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
  } finally {
    await conn.end();
  }
}

main().catch(console.error);
