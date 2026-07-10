const { db } = require("../config/db");

const query = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });

async function ensureColumn(table, column, definition) {
  try {
    await query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch (error) {
    if (error.code !== "ER_DUP_FIELDNAME") {
      throw error;
    }
  }
}

let ensureTrainingTablesPromise = null;

function ensureTrainingTables() {
  if (!ensureTrainingTablesPromise) {
    ensureTrainingTablesPromise = ensureTrainingTablesOnce().catch((error) => {
      ensureTrainingTablesPromise = null;
      throw error;
    });
  }
  return ensureTrainingTablesPromise;
}

/**
 * The CREATE TABLE statements mirror the production schema (Phase 1 design).
 * The ALTER section below patches pre-existing tables so the backend and the
 * database stay synchronized. Everything here is idempotent.
 */
async function ensureTrainingTablesOnce() {
  await query(`
    CREATE TABLE IF NOT EXISTS training_employees (
      id INT AUTO_INCREMENT PRIMARY KEY,
      training_id VARCHAR(20) NOT NULL UNIQUE,
      employee_code VARCHAR(20) NULL,
      first_name VARCHAR(100) NOT NULL,
      middle_name VARCHAR(100) NULL,
      last_name VARCHAR(100) NULL,
      full_name VARCHAR(255) NULL,
      father_name VARCHAR(255) NULL,
      father_aadhaar VARCHAR(20) NULL,
      mother_name VARCHAR(255) NULL,
      mother_aadhaar VARCHAR(20) NULL,
      spouse_name VARCHAR(255) NULL,
      spouse_aadhaar VARCHAR(20) NULL,
      gender ENUM('Male', 'Female', 'Other') NULL,
      dob DATE NULL,
      marital_status VARCHAR(50) NULL,
      blood_group VARCHAR(20) NULL,
      mobile VARCHAR(15) NOT NULL,
      alternate_mobile VARCHAR(15) NULL,
      email VARCHAR(150) NULL,
      emergency_contact1_name VARCHAR(255) NULL,
      emergency_contact1_relation VARCHAR(100) NULL,
      emergency_contact1_mobile VARCHAR(15) NULL,
      emergency_contact2_name VARCHAR(255) NULL,
      emergency_contact2_relation VARCHAR(100) NULL,
      emergency_contact2_mobile VARCHAR(15) NULL,
      aadhaar_no VARCHAR(20) NOT NULL UNIQUE,
      pan_no VARCHAR(20) NULL,
      imei_number VARCHAR(50) NULL,
      nominee_name VARCHAR(255) NULL,
      nominee_relation VARCHAR(100) NULL,
      nominee_mobile VARCHAR(15) NULL,
      pf_uan_available ENUM('Yes','No') NULL,
      pf_uan_number VARCHAR(100) NULL,
      esic_available ENUM('Yes','No') NULL,
      esic_number VARCHAR(100) NULL,
      voter_id VARCHAR(30) NULL,
      driving_license VARCHAR(50) NULL,
      passport_no VARCHAR(50) NULL,
      current_address TEXT NULL,
      current_pincode VARCHAR(10) NULL,
      aadhaar_address TEXT NULL,
      aadhaar_pincode VARCHAR(10) NULL,
      address TEXT NULL,
      city VARCHAR(100) NULL,
      district VARCHAR(100) NULL,
      state VARCHAR(100) NULL,
      pincode VARCHAR(10) NULL,
      qualification VARCHAR(150) NULL,
      specialization VARCHAR(150) NULL,
      passing_year VARCHAR(10) NULL,
      institute_name VARCHAR(255) NULL,
      institute_state VARCHAR(100) NULL,
      experience_years DECIMAL(4,1) NULL,
      previous_company VARCHAR(255) NULL,
      designation VARCHAR(150) NULL,
      position_applied VARCHAR(150) NULL,
      employee_vendor_code VARCHAR(100) NULL,
      department VARCHAR(100) NULL,
      circle VARCHAR(100) NULL,
      cmp VARCHAR(150) NULL,
      project VARCHAR(150) NULL,
      reporting_manager VARCHAR(150) NULL,
      training_location VARCHAR(150) NULL,
      joining_date DATE NULL,
      bank_name VARCHAR(150) NULL,
      account_number VARCHAR(50) NULL,
      ifsc_code VARCHAR(20) NULL,
      branch_name VARCHAR(150) NULL,
      account_holder_name VARCHAR(150) NULL,
      training_status ENUM('Pending', 'Under Review', 'Approved', 'Rejected', 'Converted')
        NULL DEFAULT 'Pending',
      employee_status ENUM('Active','Inactive') NULL DEFAULT 'Active',
      remarks TEXT NULL,
      google_form_response_id VARCHAR(100) NULL,
      created_by INT NULL,
      updated_by INT NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      form_response_id VARCHAR(191) NULL,
      converted_at DATETIME NULL,
      converted_by VARCHAR(150) NULL,
      training_batch VARCHAR(120) NULL,
      training_start_date DATE NULL,
      training_end_date DATE NULL,
      source ENUM('google_form','manual') NOT NULL DEFAULT 'google_form'
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS training_documents (
      id INT AUTO_INCREMENT PRIMARY KEY,
      training_employee_id INT NOT NULL,
      document_type ENUM('Photo','Resume','Aadhaar Front','Aadhaar Back','PAN','Passbook',
        'Driving License','Police Verification','Medical Certificate',
        'Education Certificate','Experience Letter','Other') NOT NULL,
      file_name VARCHAR(255) NULL,
      file_url TEXT NULL,
      google_drive_file_id VARCHAR(255) NULL,
      uploaded_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      local_path VARCHAR(500) NULL,
      drive_file_id VARCHAR(191) NULL,
      mime_type VARCHAR(120) NULL,
      file_size BIGINT NULL,
      verification_status ENUM('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending',
      verified_by VARCHAR(150) NULL,
      verified_at DATETIME NULL,
      remarks TEXT NULL,
      INDEX idx_training_documents_employee (training_employee_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS training_verifications (
      id INT AUTO_INCREMENT PRIMARY KEY,
      training_employee_id INT NOT NULL,
      aadhaar_verified TINYINT(1) NULL DEFAULT 0,
      pan_verified TINYINT(1) NULL DEFAULT 0,
      bank_verified TINYINT(1) NULL DEFAULT 0,
      police_verified TINYINT(1) NULL DEFAULT 0,
      medical_verified TINYINT(1) NULL DEFAULT 0,
      documents_verified TINYINT(1) NULL DEFAULT 0,
      verified_by VARCHAR(150) NULL,
      verified_at DATETIME NULL,
      verification_status ENUM('Pending','Verified','Rejected') NULL DEFAULT 'Pending',
      remarks TEXT NULL,
      document_id INT NULL,
      action VARCHAR(50) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_training_verifications_employee (training_employee_id)
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS training_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      training_employee_id INT NULL,
      action VARCHAR(150) NULL,
      action_by INT NULL,
      action_details TEXT NULL,
      ip_address VARCHAR(100) NULL,
      created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
      performed_by VARCHAR(150) NULL DEFAULT 'system',
      INDEX idx_training_logs_employee (training_employee_id)
    )
  `);

  // -------------------------------------------------------------------------
  // Patches for databases where the tables pre-existed (Phase 1 schema).
  // -------------------------------------------------------------------------

  // training_employees: columns the application requires
  await ensureColumn("training_employees", "form_response_id", "VARCHAR(191) NULL");
  await ensureColumn("training_employees", "converted_at", "DATETIME NULL");
  await ensureColumn("training_employees", "converted_by", "VARCHAR(150) NULL");
  await ensureColumn("training_employees", "training_batch", "VARCHAR(120) NULL");
  await ensureColumn("training_employees", "training_start_date", "DATE NULL");
  await ensureColumn("training_employees", "training_end_date", "DATE NULL");
  await ensureColumn(
    "training_employees",
    "source",
    "ENUM('google_form','manual') NOT NULL DEFAULT 'google_form'"
  );

  // training_employees: align the training_status enum with the app workflow.
  // Step 1: widen to the union of old + new values, Step 2: remap old values,
  // Step 3: narrow to the final set. Safe to re-run.
  await query(`
    ALTER TABLE training_employees MODIFY training_status
    ENUM('Registered','Under Verification','Training','Completed',
         'Pending','Under Review','Approved','Rejected','Converted')
    NULL DEFAULT 'Pending'
  `);
  await query(`UPDATE training_employees SET training_status = 'Pending' WHERE training_status = 'Registered'`);
  await query(`UPDATE training_employees SET training_status = 'Under Review' WHERE training_status IN ('Under Verification','Training')`);
  await query(`UPDATE training_employees SET training_status = 'Approved' WHERE training_status = 'Completed'`);
  await query(`
    ALTER TABLE training_employees MODIFY training_status
    ENUM('Pending','Under Review','Approved','Rejected','Converted')
    NULL DEFAULT 'Pending'
  `);

  // training_documents: verification + file metadata columns
  await ensureColumn("training_documents", "local_path", "VARCHAR(500) NULL");
  await ensureColumn("training_documents", "drive_file_id", "VARCHAR(191) NULL");
  await ensureColumn("training_documents", "mime_type", "VARCHAR(120) NULL");
  await ensureColumn("training_documents", "file_size", "BIGINT NULL");
  await ensureColumn(
    "training_documents",
    "verification_status",
    "ENUM('Pending','Verified','Rejected') NOT NULL DEFAULT 'Pending'"
  );
  await ensureColumn("training_documents", "verified_by", "VARCHAR(150) NULL");
  await ensureColumn("training_documents", "verified_at", "DATETIME NULL");
  await ensureColumn("training_documents", "remarks", "TEXT NULL");

  // training_documents: extend the document_type enum with the two types the
  // Google Form collects that the original enum lacked.
  await query(`
    ALTER TABLE training_documents MODIFY document_type
    ENUM('Photo','Resume','Aadhaar Front','Aadhaar Back','PAN','Passbook',
         'Driving License','Police Verification','Medical Certificate',
         'Education Certificate','Experience Letter','Other') NOT NULL
  `);

  // training_verifications: per-document audit columns
  await ensureColumn("training_verifications", "document_id", "INT NULL");
  await ensureColumn("training_verifications", "action", "VARCHAR(50) NULL");
  await ensureColumn(
    "training_verifications",
    "created_at",
    "TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP"
  );
  // verified_by was INT (user id); the app records the verifier's name.
  await query(`ALTER TABLE training_verifications MODIFY verified_by VARCHAR(150) NULL`);

  // training_logs: module-level entries (e.g. exports) have no employee id,
  // and the app records the actor's name rather than a numeric id.
  await query(`ALTER TABLE training_logs MODIFY training_employee_id INT NULL`);
  await ensureColumn("training_logs", "performed_by", "VARCHAR(150) NULL DEFAULT 'system'");
}

module.exports = { ensureTrainingTables, query };
