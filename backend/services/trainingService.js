const ExcelJS = require("exceljs");
const TrainingEmployee = require("../models/TrainingEmployee");
const TrainingDocument = require("../models/TrainingDocument");
const TrainingVerification = require("../models/TrainingVerification");
const TrainingLog = require("../models/TrainingLog");
const { query } = require("../models/trainingTables");
const { sanitizeText } = require("../utils/sanitizeText");

const EMPLOYEE_CODE_PREFIX = "SG";
const EMPLOYEE_CODE_DIGITS = 6;

const STATUSES = ["Pending", "Under Review", "Approved", "Rejected", "Converted"];

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function cleanDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeMobile(value) {
  let digits = cleanDigits(value);
  // Strip common Indian prefixes (+91 / 0)
  if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

function isValidMobile(value) {
  return /^[6-9]\d{9}$/.test(value);
}

function isValidAadhaar(value) {
  return /^\d{12}$/.test(value);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function isValidPan(value) {
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(value);
}

function toDateOnly(value) {
  if (!value) return null;
  const str = String(value).trim();
  if (!str) return null;
  // Accept dd/mm/yyyy or dd-mm-yyyy (Google Forms India locale)
  const dmy = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (dmy) {
    return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
  }
  const date = new Date(str);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

/**
 * Normalize and validate an employee payload.
 * mode: "create" (all required checks) | "update" (only validate provided fields)
 */
function validateEmployeePayload(payload = {}, mode = "create") {
  const data = {};
  const errors = [];

  const assign = (key, value) => {
    if (value !== undefined) data[key] = value;
  };

  const trimmed = (value) =>
    value === undefined || value === null ? undefined : String(value).trim();

  const fullName = trimmed(payload.full_name);
  if (mode === "create" && !fullName) errors.push("Full Name is required.");
  if (fullName !== undefined) assign("full_name", fullName);

  if (payload.mobile !== undefined || mode === "create") {
    const mobile = normalizeMobile(payload.mobile);
    if (!isValidMobile(mobile)) {
      errors.push("Mobile Number must be a valid 10-digit Indian number.");
    } else {
      assign("mobile", mobile);
    }
  }

  if (payload.alt_mobile !== undefined && String(payload.alt_mobile).trim() !== "") {
    const altMobile = normalizeMobile(payload.alt_mobile);
    if (!isValidMobile(altMobile)) {
      errors.push("Alternate Mobile Number must be a valid 10-digit Indian number.");
    } else {
      assign("alt_mobile", altMobile);
    }
  }

  if (payload.aadhaar_no !== undefined || mode === "create") {
    const aadhaar = cleanDigits(payload.aadhaar_no);
    if (!isValidAadhaar(aadhaar)) {
      errors.push("Aadhaar Number must contain exactly 12 digits.");
    } else {
      assign("aadhaar_no", aadhaar);
    }
  }

  if (payload.email !== undefined && String(payload.email).trim() !== "") {
    const email = String(payload.email).trim().toLowerCase();
    if (!isValidEmail(email)) {
      errors.push("Email address is invalid.");
    } else {
      assign("email", email);
    }
  }

  if (payload.pan_no !== undefined && String(payload.pan_no).trim() !== "") {
    const pan = String(payload.pan_no).trim().toUpperCase();
    if (!isValidPan(pan)) {
      errors.push("PAN Number is invalid (format: ABCDE1234F).");
    } else {
      assign("pan_no", pan);
    }
  }

  if (payload.pincode !== undefined && String(payload.pincode).trim() !== "") {
    const pincode = cleanDigits(payload.pincode);
    if (!/^\d{6}$/.test(pincode)) {
      errors.push("Pincode must contain exactly 6 digits.");
    } else {
      assign("pincode", pincode);
    }
  }

  if (payload.gender !== undefined && String(payload.gender).trim() !== "") {
    const gender = String(payload.gender).trim();
    const matched = ["Male", "Female", "Other"].find(
      (g) => g.toLowerCase() === gender.toLowerCase()
    );
    if (!matched) {
      errors.push("Gender must be Male, Female or Other.");
    } else {
      assign("gender", matched);
    }
  }

  if (payload.status !== undefined) {
    const status = String(payload.status).trim();
    const matched = STATUSES.find((s) => s.toLowerCase() === status.toLowerCase());
    if (!matched) {
      errors.push(`Status must be one of: ${STATUSES.join(", ")}.`);
    } else if (matched === "Converted") {
      errors.push("Status 'Converted' can only be set by the conversion workflow.");
    } else {
      assign("status", matched);
    }
  }

  for (const dateField of ["dob", "training_start_date", "training_end_date"]) {
    if (payload[dateField] !== undefined && String(payload[dateField]).trim() !== "") {
      const value = toDateOnly(payload[dateField]);
      if (!value) {
        errors.push(`${dateField.replace(/_/g, " ")} is not a valid date.`);
      } else {
        assign(dateField, value);
      }
    }
  }

  if (
    payload.experience_years !== undefined &&
    String(payload.experience_years).trim() !== ""
  ) {
    const years = Number(payload.experience_years);
    if (Number.isNaN(years) || years < 0 || years > 60) {
      errors.push("Experience years must be a number between 0 and 60.");
    } else {
      assign("experience_years", years);
    }
  }

  // Free-text fields — trim only.
  const textFields = [
    "father_name",
    "marital_status",
    "blood_group",
    "permanent_address",
    "current_address",
    "city",
    "state",
    "qualification",
    "previous_company",
    "designation_applied",
    "circle",
    "training_batch",
    "bank_name",
    "bank_account_no",
    "ifsc_code",
    "emergency_contact_name",
    "emergency_contact_no",
    "remarks",
    "source",
    "form_response_id",
  ];
  for (const field of textFields) {
    const value = trimmed(payload[field]);
    if (value !== undefined) assign(field, value);
  }

  if (errors.length) {
    throw httpError(400, errors.join(" "));
  }

  return data;
}

// ---------------------------------------------------------------------------
// Registration (manual + Google Form webhook)
// ---------------------------------------------------------------------------

async function assertNoDuplicateAadhaar(aadhaarNo, excludeId = null) {
  const existing = await TrainingEmployee.findByAadhaar(aadhaarNo);
  if (existing && existing.id !== excludeId) {
    throw httpError(409, "A candidate with this Aadhaar Number is already registered.");
  }
}

async function registerEmployee(payload, context = {}) {
  const data = validateEmployeePayload(payload, "create");
  await assertNoDuplicateAadhaar(data.aadhaar_no);

  data.source = data.source === "google_form" ? "google_form" : "manual";
  const id = await TrainingEmployee.create(data);

  await TrainingLog.record({
    trainingEmployeeId: id,
    action: "REGISTERED",
    details: { source: data.source, full_name: data.full_name },
    performedBy: context.performedBy,
    ipAddress: context.ipAddress,
  });

  return TrainingEmployee.findById(id);
}

/**
 * Idempotent webhook intake from Google Apps Script.
 * payload: { formResponseId, employee: {...}, documents: [{type, fileName, driveFileId, driveLink, mimeType, fileSize}] }
 */
async function registerFromGoogleForm(payload = {}, context = {}) {
  const formResponseId = String(payload.formResponseId || "").trim();
  const employeePayload = payload.employee || {};
  const documents = Array.isArray(payload.documents) ? payload.documents : [];

  if (!formResponseId) {
    throw httpError(400, "formResponseId is required.");
  }

  // Duplicate submission (Apps Script retry / form resubmit) — return existing record.
  const existingByResponse = await TrainingEmployee.findByFormResponseId(formResponseId);
  if (existingByResponse) {
    return { employee: existingByResponse, duplicate: true };
  }

  const data = validateEmployeePayload(
    { ...employeePayload, source: "google_form", form_response_id: formResponseId },
    "create"
  );

  const existingByAadhaar = await TrainingEmployee.findByAadhaar(data.aadhaar_no);
  if (existingByAadhaar) {
    await TrainingLog.record({
      trainingEmployeeId: existingByAadhaar.id,
      action: "DUPLICATE_SUBMISSION_BLOCKED",
      details: { formResponseId },
      performedBy: "google-form-webhook",
      ipAddress: context.ipAddress,
    });
    throw httpError(409, "A candidate with this Aadhaar Number is already registered.");
  }

  const id = await TrainingEmployee.create(data);

  let documentCount = 0;
  for (const doc of documents) {
    // Unknown labels from the form fall back to 'Other' so no upload is lost.
    const documentType =
      TrainingDocument.normalizeDocumentType(doc.type || doc.document_type) ||
      (String(doc.type || doc.document_type || "").trim() ? "Other" : "");
    if (!documentType) continue;
    await TrainingDocument.create({
      training_employee_id: id,
      document_type: documentType,
      file_name: doc.fileName || doc.file_name || null,
      drive_file_id: doc.driveFileId || doc.drive_file_id || null,
      drive_link: doc.driveLink || doc.drive_link || null,
      mime_type: doc.mimeType || doc.mime_type || null,
      file_size: doc.fileSize || doc.file_size || null,
    });
    documentCount += 1;
  }

  await TrainingLog.record({
    trainingEmployeeId: id,
    action: "REGISTERED",
    details: { source: "google_form", formResponseId, documents: documentCount },
    performedBy: "google-form-webhook",
    ipAddress: context.ipAddress,
  });

  return { employee: await TrainingEmployee.findById(id), duplicate: false };
}

// ---------------------------------------------------------------------------
// Read / update / delete
// ---------------------------------------------------------------------------

async function getEmployeeOrThrow(id) {
  const employee = await TrainingEmployee.findById(id);
  if (!employee) {
    throw httpError(404, "Training record not found.");
  }
  return employee;
}

async function updateEmployee(id, payload, context = {}) {
  const existing = await getEmployeeOrThrow(id);

  if (existing.status === "Converted") {
    throw httpError(409, "This record has been converted and can no longer be edited.");
  }

  const data = validateEmployeePayload(payload, "update");
  delete data.form_response_id;
  delete data.source;

  if (data.aadhaar_no && data.aadhaar_no !== existing.aadhaar_no) {
    await assertNoDuplicateAadhaar(data.aadhaar_no, existing.id);
  }

  if (!Object.keys(data).length) {
    throw httpError(400, "No valid fields provided for update.");
  }

  await TrainingEmployee.updateById(id, data);

  const changed = {};
  for (const key of Object.keys(data)) {
    if (String(existing[key] ?? "") !== String(data[key] ?? "")) {
      changed[key] = { from: existing[key], to: data[key] };
    }
  }

  await TrainingLog.record({
    trainingEmployeeId: id,
    action: "UPDATED",
    details: changed,
    performedBy: context.performedBy,
    ipAddress: context.ipAddress,
  });

  return TrainingEmployee.findById(id);
}

async function updateStatus(id, status, remarks, context = {}) {
  const existing = await getEmployeeOrThrow(id);

  const matched = STATUSES.find(
    (s) => s.toLowerCase() === String(status || "").trim().toLowerCase()
  );
  if (!matched || matched === "Converted") {
    throw httpError(400, "Status must be Pending, Under Review, Approved or Rejected.");
  }
  if (existing.status === "Converted") {
    throw httpError(409, "Converted records cannot change status.");
  }

  await TrainingEmployee.updateById(id, {
    status: matched,
    ...(remarks !== undefined ? { remarks: String(remarks || "").trim() } : {}),
  });

  await TrainingLog.record({
    trainingEmployeeId: id,
    action: matched === "Rejected" ? "REJECTED" : "STATUS_CHANGED",
    details: { from: existing.status, to: matched, remarks },
    performedBy: context.performedBy,
    ipAddress: context.ipAddress,
  });

  return TrainingEmployee.findById(id);
}

async function deleteEmployee(id, context = {}) {
  const existing = await getEmployeeOrThrow(id);

  if (existing.status === "Converted") {
    throw httpError(409, "Converted records cannot be deleted.");
  }

  // Remove child rows explicitly — the production tables have no
  // ON DELETE CASCADE foreign keys.
  await TrainingDocument.deleteByEmployee(id);
  await TrainingVerification.deleteByEmployee(id);
  await TrainingEmployee.deleteById(id);

  // training_logs.training_employee_id has an FK (ON DELETE CASCADE), so the
  // deletion entry cannot reference the removed row — keep the id in details.
  await TrainingLog.record({
    trainingEmployeeId: null,
    action: "DELETED",
    details: {
      training_employee_id: Number(id),
      full_name: existing.full_name,
      aadhaar_no: existing.aadhaar_no,
    },
    performedBy: context.performedBy,
    ipAddress: context.ipAddress,
  });
}

// ---------------------------------------------------------------------------
// Convert to Employee (new_joining)
// ---------------------------------------------------------------------------

async function findNextEmployeeCode() {
  const rows = await query(
    `SELECT employee_code FROM new_joining WHERE employee_code REGEXP '^SG[0-9]+$'
     UNION
     SELECT employee_code FROM training_employees WHERE employee_code REGEXP '^SG[0-9]+$'`
  );

  let maxNumber = 0;
  for (const row of rows) {
    const numericPart = parseInt(row.employee_code.slice(EMPLOYEE_CODE_PREFIX.length), 10);
    if (!Number.isNaN(numericPart) && numericPart > maxNumber) {
      maxNumber = numericPart;
    }
  }

  let candidateNumber = maxNumber + 1;

  while (true) {
    const candidateCode = `${EMPLOYEE_CODE_PREFIX}${String(candidateNumber).padStart(
      EMPLOYEE_CODE_DIGITS,
      "0"
    )}`;
    const existing = await query(
      `SELECT id FROM new_joining WHERE employee_code = ? LIMIT 1`,
      [candidateCode]
    );
    if (!existing.length) return candidateCode;
    candidateNumber += 1;
  }
}

async function convertToEmployee(id, context = {}) {
  const employee = await getEmployeeOrThrow(id);

  if (employee.status === "Converted") {
    throw httpError(409, "This candidate has already been converted to an employee.");
  }
  if (employee.status !== "Approved") {
    throw httpError(400, "Only Approved candidates can be converted to employees.");
  }

  const documents = await TrainingDocument.listByEmployee(id);
  const docSummary = await TrainingDocument.getVerificationSummary(id);
  if (docSummary.total > 0 && docSummary.Pending > 0) {
    throw httpError(400, "All uploaded documents must be verified or rejected before conversion.");
  }

  // Guard against another employee record already holding this Aadhaar.
  const existingEmployee = await query(
    `SELECT id, employee_code FROM new_joining WHERE aadhaar_no = ? LIMIT 1`,
    [employee.aadhaar_no]
  );
  if (existingEmployee.length) {
    throw httpError(
      409,
      `An employee with this Aadhaar already exists (${existingEmployee[0].employee_code || "no code"}).`
    );
  }

  const employeeCode = await findNextEmployeeCode();

  await query(
    `INSERT INTO new_joining (
      employee_code, employee_name, circle, cmp, designation, aadhaar_no,
      nth_salary, joining_status, l2_status, employee_status, uploaded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      employeeCode,
      sanitizeText(employee.full_name),
      sanitizeText(employee.circle || ""),
      sanitizeText(employee.training_batch || ""),
      sanitizeText(employee.designation_applied || ""),
      sanitizeText(employee.aadhaar_no),
      0,
      "Pending",
      "Pending",
      "Active",
    ]
  );

  const affected = await TrainingEmployee.markConverted(id, {
    employeeCode,
    convertedBy: context.performedBy || "system",
  });
  if (!affected) {
    throw httpError(409, "This candidate has already been converted to an employee.");
  }

  await TrainingLog.record({
    trainingEmployeeId: id,
    action: "CONVERTED",
    details: {
      employee_code: employeeCode,
      documents: documents.map((doc) => ({
        id: doc.id,
        type: doc.document_type,
        drive_link: doc.drive_link,
      })),
    },
    performedBy: context.performedBy,
    ipAddress: context.ipAddress,
  });

  return {
    employeeCode,
    employee: await TrainingEmployee.findById(id),
    documentsCarried: documents.length,
  };
}

// ---------------------------------------------------------------------------
// Excel export
// ---------------------------------------------------------------------------

const EXPORT_COLUMNS = [
  { header: "ID", key: "id", width: 8 },
  { header: "Employee Code", key: "employee_code", width: 14 },
  { header: "Full Name", key: "full_name", width: 26 },
  { header: "Father Name", key: "father_name", width: 24 },
  { header: "DOB", key: "dob", width: 12 },
  { header: "Gender", key: "gender", width: 10 },
  { header: "Mobile", key: "mobile", width: 14 },
  { header: "Alt Mobile", key: "alt_mobile", width: 14 },
  { header: "Email", key: "email", width: 26 },
  { header: "Aadhaar No", key: "aadhaar_no", width: 16 },
  { header: "PAN No", key: "pan_no", width: 13 },
  { header: "City", key: "city", width: 16 },
  { header: "State", key: "state", width: 16 },
  { header: "Pincode", key: "pincode", width: 10 },
  { header: "Qualification", key: "qualification", width: 20 },
  { header: "Experience (yrs)", key: "experience_years", width: 14 },
  { header: "Designation Applied", key: "designation_applied", width: 20 },
  { header: "Circle", key: "circle", width: 14 },
  { header: "Training Batch", key: "training_batch", width: 16 },
  { header: "Training Start", key: "training_start_date", width: 14 },
  { header: "Training End", key: "training_end_date", width: 14 },
  { header: "Status", key: "status", width: 14 },
  { header: "Source", key: "source", width: 12 },
  { header: "Registered At", key: "created_at", width: 20 },
  { header: "Converted At", key: "converted_at", width: 20 },
  { header: "Remarks", key: "remarks", width: 30 },
];

async function buildEmployeesWorkbook(filters = {}) {
  // Export ignores pagination — pull everything matching the filters.
  const all = await TrainingEmployee.list({
    ...filters,
    page: 1,
    pageSize: 200,
  });
  let exportRows = all.rows;
  if (all.total > all.rows.length) {
    const pages = Math.ceil(all.total / 200);
    for (let page = 2; page <= pages; page += 1) {
      const next = await TrainingEmployee.list({ ...filters, page, pageSize: 200 });
      exportRows = exportRows.concat(next.rows);
    }
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SG ENCON Training Module";
  const sheet = workbook.addWorksheet("Training Employees");
  sheet.columns = EXPORT_COLUMNS;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1E3A8A" },
  };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 22;

  for (const row of exportRows) {
    sheet.addRow(row);
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: EXPORT_COLUMNS.length },
  };
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  return workbook;
}

module.exports = {
  STATUSES,
  httpError,
  validateEmployeePayload,
  registerEmployee,
  registerFromGoogleForm,
  getEmployeeOrThrow,
  updateEmployee,
  updateStatus,
  deleteEmployee,
  convertToEmployee,
  findNextEmployeeCode,
  buildEmployeesWorkbook,
};
