# Google Form → Training Module integration

Production values for this deployment:

- Form: `https://docs.google.com/forms/d/1cSNaQiIQXLHWCzkf71aLPaiwkYBsMfPWiqf9mDw4Ht4/edit`
- `WEBHOOK_URL` = `https://api.sgencon.in/api/training-webhook/google-form`
- `WEBHOOK_KEY` = the `TRAINING_WEBHOOK_KEY` value in `backend/.env`

End-to-end flow:

```
Candidate → Google Form (details + document uploads)
         → Google Apps Script (on-submit trigger)
         → POST /api/training-webhook/google-form  (shared-secret key)
         → MySQL (training_employees + training_documents)
         → Training Management Module (HR review → Convert to Employee)
```

## 1. Check the existing Google Form's questions

The existing form is used as-is — do not create a new one. Open the form
editor and confirm each question title matches a key in `FIELD_MAP` /
`DOCUMENT_MAP` in `Code.gs` (titles are compared lower-cased and trimmed).
If a title on the form differs, add that title as an extra key in the map —
do not rename the form's questions. Reference titles:

Text/choice questions:

| Question title | Stored as |
| --- | --- |
| Full Name * | full_name |
| Father Name | father_name |
| Date of Birth | dob |
| Gender | gender |
| Marital Status | marital_status |
| Blood Group | blood_group |
| Mobile Number * | mobile |
| Alternate Mobile Number | alt_mobile |
| Permanent Address | permanent_address |
| Current Address | current_address |
| City | city |
| State | state |
| Pincode | pincode |
| Aadhaar Number * | aadhaar_no |
| PAN Number | pan_no |
| Highest Qualification | qualification |
| Total Experience (Years) | experience_years |
| Previous Company | previous_company |
| Designation Applied For | designation_applied |
| Circle | circle |
| Training Batch | training_batch |
| Bank Name | bank_name |
| Bank Account Number | bank_account_no |
| IFSC Code | ifsc_code |
| Emergency Contact Name | emergency_contact_name |
| Emergency Contact Number | emergency_contact_no |

File-upload questions (Google Forms stores files in the form owner's Drive):

| Question title | Document type |
| --- | --- |
| Photo | photo |
| Aadhaar Front | aadhaar_front |
| Aadhaar Back | aadhaar_back |
| PAN Card | pan_card |
| Resume | resume |
| Education Certificate | education_certificate |
| Bank Passbook | bank_passbook |
| Experience Letter | experience_letter |

Mark Full Name, Mobile Number and Aadhaar Number as **Required**.

## 2. Install the Apps Script

1. In the Form editor: **⋮ → Apps Script**.
2. Replace the default `Code.gs` content with the `Code.gs` from this folder.
3. **Project Settings → Script Properties**, add:
   - `WEBHOOK_URL` = `https://<your-backend-host>/api/training-webhook/google-form`
   - `WEBHOOK_KEY` = the same value as `TRAINING_WEBHOOK_KEY` in the backend `.env`
4. In the editor, run the `setup()` function once and grant the requested
   permissions (Forms, Drive, external requests). This installs the
   on-form-submit trigger.
5. Optionally run `testWebhookConnection()` — the log should show
   `Health check 200: {"success":true,"configured":true}`.

## 3. Configure the backend

Add to `backend/.env` (and the production env):

```
TRAINING_WEBHOOK_KEY=<long random string, e.g. openssl rand -hex 32>
```

The backend endpoint rejects calls without this key, so the webhook is safe to
expose publicly.

## 4. Reliability behaviour

- **Duplicate submissions**: the server is idempotent on the form response ID,
  and rejects duplicate Aadhaar numbers with HTTP 409 (the script treats 409 as
  final and does not retry).
- **Retries**: transient failures (network, 5xx, 429) are retried 3 times with
  exponential backoff; still-failing payloads are queued in Script Properties
  and replayed every 30 minutes by a time-based trigger until delivered.
- **Documents**: files stay in Google Drive; the script stores the Drive file
  ID + shareable view link in `training_documents.drive_link`. If your
  Workspace policy blocks link sharing, HR users need Drive access to the
  form's upload folder instead.
