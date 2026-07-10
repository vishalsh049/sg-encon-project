import { authFetch, buildApiUrl } from "./api";

async function request(path, options = {}) {
  const response = await authFetch(buildApiUrl(path), options);

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || (body && body.success === false)) {
    const message = body?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return body;
}

function toQueryString(params = {}) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && String(value) !== "") {
      search.set(key, value);
    }
  }
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

// ---------------------------------------------------------------------------
// Employees
// ---------------------------------------------------------------------------

export function fetchTrainingEmployees(filters = {}) {
  return request(`/api/training${toQueryString(filters)}`);
}

export function fetchTrainingStats() {
  return request("/api/training/stats");
}

export function fetchTrainingBatches() {
  return request("/api/training/batches");
}

export function fetchTrainingEmployee(id) {
  return request(`/api/training/${id}`);
}

export function fetchEmployeeLogs(id) {
  return request(`/api/training/${id}/logs`);
}

export function fetchRecentLogs(limit = 100) {
  return request(`/api/training/logs${toQueryString({ limit })}`);
}

export function createTrainingEmployee(data) {
  return request("/api/training", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateTrainingEmployee(id, data) {
  return request(`/api/training/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function updateTrainingStatus(id, status, remarks) {
  return request(`/api/training/${id}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, remarks }),
  });
}

export function convertTrainingEmployee(id) {
  return request(`/api/training/${id}/convert`, { method: "POST" });
}

export function deleteTrainingEmployee(id) {
  return request(`/api/training/${id}`, { method: "DELETE" });
}

/** Downloads the filtered employee list as an .xlsx file. */
export async function exportTrainingEmployees(filters = {}) {
  const response = await authFetch(
    buildApiUrl(`/api/training/export${toQueryString(filters)}`)
  );
  if (!response.ok) {
    throw new Error(`Export failed (${response.status})`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `training-employees-${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function fetchAllDocuments(filters = {}) {
  return request(`/api/training-documents${toQueryString(filters)}`);
}

export function fetchDocumentTypes() {
  return request("/api/training-documents/types");
}

export function fetchEmployeeDocuments(employeeId) {
  return request(`/api/training-documents/employee/${employeeId}`);
}

export function uploadEmployeeDocument(employeeId, documentType, file) {
  const formData = new FormData();
  formData.append("document_type", documentType);
  formData.append("file", file);
  return request(`/api/training-documents/employee/${employeeId}`, {
    method: "POST",
    body: formData,
  });
}

export function deleteDocument(documentId) {
  return request(`/api/training-documents/${documentId}`, { method: "DELETE" });
}

/**
 * Opens/downloads a document. Local files stream as a download;
 * Drive-hosted files open the Drive link in a new tab.
 */
export async function downloadDocument(doc) {
  const response = await authFetch(
    buildApiUrl(`/api/training-documents/${doc.id}/download`)
  );
  if (!response.ok) {
    let message = `Download failed (${response.status})`;
    try {
      message = (await response.json())?.message || message;
    } catch {
      /* body was not JSON */
    }
    throw new Error(message);
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await response.json();
    if (body?.data?.driveLink) {
      window.open(body.data.driveLink, "_blank", "noopener");
      return;
    }
    throw new Error(body?.message || "No file available for this document.");
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = doc.file_name || `document-${doc.id}`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export function verifyDocument(documentId, status, remarks) {
  return request(`/api/training-verifications/document/${documentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, remarks }),
  });
}

export function fetchEmployeeVerifications(employeeId) {
  return request(`/api/training-verifications/employee/${employeeId}`);
}

export function fetchRecentVerifications(limit = 50) {
  return request(`/api/training-verifications/recent${toQueryString({ limit })}`);
}
