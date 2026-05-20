const mysql = require("mysql2/promise");

async function updatePermissions() {
  const connection = await mysql.createConnection({
    host: "srv1645.hstgr.io",
    user: "u258838439_telecomuser",
    password: "Shakti@2000%",
    database: "u258838439_telecom_portal",
    port: 3306
  });

  try {
    console.log("=== Updating User ID 1 with FULL permissions ===");
    
    const permissions = [
      {"page":"dashboard","view":true,"edit":true,"download":true,"delete":true},
      {"page":"billing-dashboard","view":true,"edit":true,"download":true,"delete":true},
      {"page":"billing-status","view":true,"edit":true,"download":true,"delete":true},
      {"page":"revenue","view":true,"edit":true,"download":true,"delete":true},
      {"page":"kpis-penalty","view":true,"edit":true,"download":true,"delete":true},
      {"page":"general-penalties","view":true,"edit":true,"download":true,"delete":true},
      {"page":"physical","view":true,"edit":true,"download":true,"delete":true},
      {"page":"scrum","view":true,"edit":true,"download":true,"delete":true},
      {"page":"tower-reports","view":true,"edit":true,"download":true,"delete":true},
      {"page":"nso-reports","view":true,"edit":true,"download":true,"delete":true},
      {"page":"fiber-reports","view":true,"edit":true,"download":true,"delete":true},
      {"page":"users","view":true,"edit":true,"download":true,"delete":true},
      {"page":"users & access","view":true,"edit":true,"download":true,"delete":true},
      {"page":"roles & permissions","view":true,"edit":true,"download":true,"delete":true},
      {"page":"site-info","view":true,"edit":true,"download":true,"delete":true},
      {"page":"uptime-monitoring","view":true,"edit":true,"download":true,"delete":true},
      {"page":"accessibility-report","view":true,"edit":true,"download":true,"delete":true}
    ];
    
    const [result] = await connection.execute(
      "UPDATE users SET page_permissions = ? WHERE id = 1",
      [JSON.stringify(permissions)]
    );
    
    console.log("Update result:", result);
    console.log("Rows affected: " + result.affectedRows);
    
    console.log("\n=== Verifying the update ===");
    const [verifyResult] = await connection.execute(
      "SELECT id, email, page_permissions FROM users WHERE id = 1"
    );
    
    console.log("Verification Result:");
    console.log(JSON.stringify(verifyResult, null, 2));
    
    if (verifyResult.length > 0) {
      console.log("\n? Update successful!");
      console.log("User ID: " + verifyResult[0].id);
      console.log("Email: " + verifyResult[0].email);
      console.log("Permissions set to all 17 pages with full access (view, edit, download, delete)");
    }

  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await connection.end();
  }
}

updatePermissions();
