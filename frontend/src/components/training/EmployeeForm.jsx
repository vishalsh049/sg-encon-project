import { useState } from "react";
import { Loader2, Save } from "lucide-react";

const SECTIONS = [
  {
    title: "Personal Details",
    fields: [
      { name: "full_name", label: "Full Name", required: true },
      { name: "father_name", label: "Father Name" },
      { name: "dob", label: "Date of Birth", type: "date" },
      { name: "gender", label: "Gender", type: "select", options: ["Male", "Female", "Other"] },
      { name: "marital_status", label: "Marital Status", type: "select", options: ["Single", "Married", "Other"] },
      { name: "blood_group", label: "Blood Group" },
    ],
  },
  {
    title: "Contact",
    fields: [
      { name: "mobile", label: "Mobile Number", required: true, maxLength: 10 },
      { name: "alt_mobile", label: "Alternate Mobile", maxLength: 10 },
      { name: "email", label: "Email", type: "email" },
      { name: "permanent_address", label: "Permanent Address", type: "textarea", span: true },
      { name: "current_address", label: "Current Address", type: "textarea", span: true },
      { name: "city", label: "City" },
      { name: "state", label: "State" },
      { name: "pincode", label: "Pincode", maxLength: 6 },
    ],
  },
  {
    title: "Identity",
    fields: [
      { name: "aadhaar_no", label: "Aadhaar Number", required: true, maxLength: 12 },
      { name: "pan_no", label: "PAN Number", maxLength: 10 },
    ],
  },
  {
    title: "Professional & Training",
    fields: [
      { name: "qualification", label: "Highest Qualification" },
      { name: "experience_years", label: "Experience (Years)", type: "number" },
      { name: "previous_company", label: "Previous Company" },
      { name: "designation_applied", label: "Designation Applied For" },
      { name: "circle", label: "Circle" },
      { name: "training_batch", label: "Training Batch" },
      { name: "training_start_date", label: "Training Start", type: "date" },
      { name: "training_end_date", label: "Training End", type: "date" },
    ],
  },
  {
    title: "Bank & Emergency",
    fields: [
      { name: "bank_name", label: "Bank Name" },
      { name: "bank_account_no", label: "Account Number", maxLength: 30 },
      { name: "ifsc_code", label: "IFSC Code", maxLength: 11 },
      { name: "emergency_contact_name", label: "Emergency Contact Name" },
      { name: "emergency_contact_no", label: "Emergency Contact Number", maxLength: 10 },
    ],
  },
];

const inputClass =
  "h-10 w-full rounded-2xl border border-border-color bg-surface px-3 text-sm text-text-secondary shadow-sm outline-none transition focus:border-blue-300 focus:dark:border-blue-500/30 focus:ring-4 focus:ring-blue-100";

function validate(form) {
  const errors = {};
  if (!String(form.full_name || "").trim()) errors.full_name = "Full Name is required.";
  if (!/^[6-9]\d{9}$/.test(String(form.mobile || "").trim()))
    errors.mobile = "Enter a valid 10-digit mobile number.";
  if (!/^\d{12}$/.test(String(form.aadhaar_no || "").trim()))
    errors.aadhaar_no = "Aadhaar must be exactly 12 digits.";
  if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(form.email).trim()))
    errors.email = "Email address is invalid.";
  if (form.pan_no && !/^[A-Za-z]{5}\d{4}[A-Za-z]$/.test(String(form.pan_no).trim()))
    errors.pan_no = "PAN format: ABCDE1234F.";
  if (form.pincode && !/^\d{6}$/.test(String(form.pincode).trim()))
    errors.pincode = "Pincode must be 6 digits.";
  return errors;
}

/**
 * Candidate form shared by manual registration and edit.
 * Props: initial (object), onSubmit(data), submitting, submitLabel.
 */
export default function EmployeeForm({ initial = {}, onSubmit, submitting, submitLabel = "Save" }) {
  const [form, setForm] = useState(() => {
    const values = {};
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        const raw = initial[field.name];
        values[field.name] =
          field.type === "date" && raw ? String(raw).slice(0, 10) : raw ?? "";
      }
    }
    return values;
  });
  const [errors, setErrors] = useState({});

  const set = (name, value) => setForm((prev) => ({ ...prev, [name]: value }));

  const handleSubmit = (event) => {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    const data = {};
    for (const [key, value] of Object.entries(form)) {
      if (String(value ?? "").trim() !== "" || initial[key] != null) {
        data[key] = typeof value === "string" ? value.trim() : value;
      }
    }
    onSubmit(data);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {SECTIONS.map((section) => (
        <div
          key={section.title}
          className="rounded-[20px] border border-border-color bg-surface p-4 shadow-sm sm:p-5"
        >
          <h3 className="mb-3 text-sm font-semibold text-text-secondary">{section.title}</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {section.fields.map((field) => (
              <div key={field.name} className={field.span ? "sm:col-span-2 lg:col-span-3" : ""}>
                <label className="mb-1 block px-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                  {field.label}
                  {field.required ? <span className="text-rose-500 dark:text-rose-400"> *</span> : null}
                </label>
                {field.type === "select" ? (
                  <select
                    value={form[field.name]}
                    onChange={(event) => set(field.name, event.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select…</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <textarea
                    rows={2}
                    value={form[field.name]}
                    onChange={(event) => set(field.name, event.target.value)}
                    className={`${inputClass} h-auto py-2`}
                  />
                ) : (
                  <input
                    type={field.type || "text"}
                    value={form[field.name]}
                    maxLength={field.maxLength}
                    onChange={(event) => set(field.name, event.target.value)}
                    className={`${inputClass} ${
                      errors[field.name] ? "border-rose-300 dark:border-rose-500/30 ring-4 ring-rose-100" : ""
                    }`}
                  />
                )}
                {errors[field.name] ? (
                  <p className="mt-1 px-1 text-xs text-rose-500 dark:text-rose-400">{errors[field.name]}</p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ))}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={submitting}
          className="flex h-10 items-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-5 text-sm font-semibold text-white shadow transition hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
