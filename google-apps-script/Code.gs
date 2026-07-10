/**
 * SG ENCON — Training Registration Google Form → Node.js webhook bridge.
 *
 * Attach this script to the Google Form (Form editor → ⋮ → Apps Script).
 * Then run setup() once to install the submit trigger, and set the two
 * Script Properties described in README.md:
 *   WEBHOOK_URL  — e.g. https://your-server.com/api/training-webhook/google-form
 *   WEBHOOK_KEY  — must equal TRAINING_WEBHOOK_KEY in the backend .env
 */

var MAX_ATTEMPTS = 3;

/**
 * Maps Google Form question titles → API field names.
 * Keys are lower-cased, trimmed question titles. Adjust the left side to
 * match the exact question titles on your form.
 */
var FIELD_MAP = {
  "full name": "full_name",
  "father name": "father_name",
  "father's name": "father_name",
  "date of birth": "dob",
  "gender": "gender",
  "marital status": "marital_status",
  "blood group": "blood_group",
  "mobile number": "mobile",
  "alternate mobile number": "alt_mobile",
  "email": "email",
  "email address": "email",
  "permanent address": "permanent_address",
  "current address": "current_address",
  "city": "city",
  "state": "state",
  "pincode": "pincode",
  "pin code": "pincode",
  "aadhaar number": "aadhaar_no",
  "aadhar number": "aadhaar_no",
  "pan number": "pan_no",
  "highest qualification": "qualification",
  "qualification": "qualification",
  "total experience (years)": "experience_years",
  "experience": "experience_years",
  "previous company": "previous_company",
  "designation applied for": "designation_applied",
  "designation": "designation_applied",
  "circle": "circle",
  "training batch": "training_batch",
  "bank name": "bank_name",
  "bank account number": "bank_account_no",
  "ifsc code": "ifsc_code",
  "emergency contact name": "emergency_contact_name",
  "emergency contact number": "emergency_contact_no",
};

/**
 * Maps file-upload question titles → document type codes used by the API.
 */
var DOCUMENT_MAP = {
  "photo": "photo",
  "passport size photo": "photo",
  "aadhaar front": "aadhaar_front",
  "aadhaar card front": "aadhaar_front",
  "aadhaar back": "aadhaar_back",
  "aadhaar card back": "aadhaar_back",
  "pan card": "pan_card",
  "resume": "resume",
  "resume / cv": "resume",
  "education certificate": "education_certificate",
  "bank passbook": "bank_passbook",
  "bank passbook / cancelled cheque": "bank_passbook",
  "experience letter": "experience_letter",
};

/** Run once manually to install the on-submit trigger. */
function setup() {
  var form = FormApp.getActiveForm();
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "onFormSubmitHandler") {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger("onFormSubmitHandler")
    .forForm(form)
    .onFormSubmit()
    .create();
  Logger.log("Trigger installed. Now set WEBHOOK_URL and WEBHOOK_KEY script properties.");
}

/** Main trigger handler. */
function onFormSubmitHandler(e) {
  var payload = buildPayload(e.response);
  var ok = sendWithRetry(payload);
  if (!ok) {
    queueFailedSubmission(payload);
  }
}

function normalizeTitle(title) {
  return String(title || "").trim().toLowerCase();
}

function buildPayload(formResponse) {
  var employee = {};
  var documents = [];

  var itemResponses = formResponse.getItemResponses();
  for (var i = 0; i < itemResponses.length; i++) {
    var itemResponse = itemResponses[i];
    var item = itemResponse.getItem();
    var title = normalizeTitle(item.getTitle());
    var answer = itemResponse.getResponse();

    if (item.getType() === FormApp.ItemType.FILE_UPLOAD) {
      var docType = DOCUMENT_MAP[title] || "other";
      var fileIds = [].concat(answer || []);
      for (var j = 0; j < fileIds.length; j++) {
        var meta = describeDriveFile(fileIds[j]);
        documents.push({
          type: docType,
          fileName: meta.name,
          driveFileId: fileIds[j],
          driveLink: meta.link,
          mimeType: meta.mimeType,
          fileSize: meta.size,
        });
      }
    } else {
      var field = FIELD_MAP[title];
      if (field && answer !== null && answer !== undefined && String(answer) !== "") {
        employee[field] = String(answer);
      }
    }
  }

  var respondentEmail = formResponse.getRespondentEmail();
  if (respondentEmail && !employee.email) {
    employee.email = respondentEmail;
  }

  return {
    formResponseId: formResponse.getId(),
    submittedAt: formResponse.getTimestamp().toISOString(),
    employee: employee,
    documents: documents,
  };
}

/** Make the uploaded file readable via link and return its metadata. */
function describeDriveFile(fileId) {
  var meta = { name: "", link: "", mimeType: "", size: null };
  try {
    var file = DriveApp.getFileById(fileId);
    meta.name = file.getName();
    meta.mimeType = file.getMimeType();
    meta.size = file.getSize();
    // Anyone in the organisation with the link can view (HR opens links from the app).
    try {
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (sharingError) {
      // Workspace policy may forbid link sharing; HR will need Drive access instead.
      Logger.log("Sharing not changed for " + fileId + ": " + sharingError);
    }
    meta.link = "https://drive.google.com/file/d/" + fileId + "/view";
  } catch (error) {
    Logger.log("Drive metadata failed for " + fileId + ": " + error);
    meta.link = "https://drive.google.com/file/d/" + fileId + "/view";
  }
  return meta;
}

function getConfig() {
  var props = PropertiesService.getScriptProperties();
  var url = props.getProperty("WEBHOOK_URL");
  var key = props.getProperty("WEBHOOK_KEY");
  if (!url || !key) {
    throw new Error("Set WEBHOOK_URL and WEBHOOK_KEY in Script Properties.");
  }
  return { url: url, key: key };
}

/** POST payload with exponential-backoff retries. Returns true on success. */
function sendWithRetry(payload) {
  var config = getConfig();

  for (var attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      var response = UrlFetchApp.fetch(config.url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(payload),
        headers: { "x-training-webhook-key": config.key },
        muteHttpExceptions: true,
      });
      var code = response.getResponseCode();

      // 2xx = stored; 409 = duplicate Aadhaar (permanent, do not retry).
      if (code >= 200 && code < 300) return true;
      if (code === 409) {
        Logger.log("Duplicate submission rejected by server: " + response.getContentText());
        return true;
      }
      if (code >= 400 && code < 500 && code !== 429) {
        Logger.log("Permanent webhook error " + code + ": " + response.getContentText());
        return false;
      }
      Logger.log("Attempt " + attempt + " failed with HTTP " + code);
    } catch (error) {
      Logger.log("Attempt " + attempt + " network error: " + error);
    }
    if (attempt < MAX_ATTEMPTS) {
      Utilities.sleep(Math.pow(2, attempt) * 1000);
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Failed-submission queue: stored in Script Properties and replayed
// every 30 minutes until delivered.
// ---------------------------------------------------------------------------

function queueFailedSubmission(payload) {
  var props = PropertiesService.getScriptProperties();
  var queue = JSON.parse(props.getProperty("FAILED_QUEUE") || "[]");
  queue.push(payload);
  props.setProperty("FAILED_QUEUE", JSON.stringify(queue));
  ensureRetryTrigger();
  Logger.log("Submission queued for retry. Queue size: " + queue.length);
}

function ensureRetryTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "retryFailedSubmissions") return;
  }
  ScriptApp.newTrigger("retryFailedSubmissions")
    .timeBased()
    .everyMinutes(30)
    .create();
}

function retryFailedSubmissions() {
  var props = PropertiesService.getScriptProperties();
  var queue = JSON.parse(props.getProperty("FAILED_QUEUE") || "[]");
  if (!queue.length) return;

  var remaining = [];
  for (var i = 0; i < queue.length; i++) {
    if (!sendWithRetry(queue[i])) {
      remaining.push(queue[i]);
    }
  }
  props.setProperty("FAILED_QUEUE", JSON.stringify(remaining));
  Logger.log("Retry pass done. Remaining in queue: " + remaining.length);
}

/** Optional: run manually to verify connectivity end-to-end. */
function testWebhookConnection() {
  var config = getConfig();
  var healthUrl = config.url.replace(/\/google-form\/?$/, "/health");
  var response = UrlFetchApp.fetch(healthUrl, { muteHttpExceptions: true });
  Logger.log("Health check " + response.getResponseCode() + ": " + response.getContentText());
}
