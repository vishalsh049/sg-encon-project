const mysql = require("mysql2/promise");

async function runQueries() {
  const connection = await mysql.createConnection({
    host: "srv1645.hstgr.io",
    user: "u258838439_telecomuser",
    password: "Shakti@2000%",
    database: "u258838439_telecom_portal",
    port: 3306
  });

  try {
    console.log("=== Query 1: Users with test email ===");
    const [testUsers] = await connection.execute("SELECT id, email, role_id, status FROM users WHERE email LIKE '%test%' LIMIT 10");
    console.log("Found " + testUsers.length + " users:");
    console.log(JSON.stringify(testUsers, null, 2));

    console.log("\n=== Query 2: First 5 users ===");
    const [allUsers] = await connection.execute("SELECT * FROM users LIMIT 5");
    console.log("Sample of all users:");
    console.log(JSON.stringify(allUsers, null, 2));

    console.log("\n=== Query 3: Page permissions from first 5 users ===");
    const [userPerms] = await connection.execute("SELECT id, email, page_permissions FROM users WHERE page_permissions IS NOT NULL LIMIT 5");
    console.log("Users with page permissions:");
    
    // Parse and display page permissions
    const uniquePages = new Set();
    userPerms.forEach(user => {
      console.log("\nUser ID: " + user.id + ", Email: " + user.email);
      console.log("Page Permissions: " + user.page_permissions);
      
      try {
        const pages = JSON.parse(user.page_permissions);
        if (Array.isArray(pages)) {
          pages.forEach(p => uniquePages.add(p));
        } else if (typeof pages === "object") {
          Object.keys(pages).forEach(k => uniquePages.add(k));
        }
      } catch(e) {
        console.log("Could not parse: " + e.message);
      }
    });
    
    console.log("\n=== All Available Pages ===");
    console.log(Array.from(uniquePages));

  } catch (error) {
    console.error("Query error:", error.message);
  } finally {
    await connection.end();
  }
}

runQueries();
