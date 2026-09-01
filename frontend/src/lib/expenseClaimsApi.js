// API client for the Expense Claims module (employee reimbursement workflow).
// Mirrors the shape of lib/trainingApi.js.

import { authFetch, buildApiUrl } from "./api";

const BASE = "/api/expense-claims";

async function request(path, options = {}) {
  const response = await authFetch(buildApiUrl(path), options);

  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (!response.ok || (body && body.success === false)) {
    const error = new Error(body?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.details = body?.details || null;
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

export function fetchExpenseMeta() {
  return request(`${BASE}/meta`);
}

export function lookupEmployee(code) {
  return request(`${BASE}/employee-lookup${toQueryString({ code })}`);
}

// Dynamic Raise Expense — pickers
export function searchEmployees(search) {
  return request(`${BASE}/employees${toQueryString({ search })}`);
}
export function fetchVendors(params = {}) {
  return request(`${BASE}/vendors${toQueryString(params)}`);
}
export function createVendor(payload) {
  return request(`${BASE}/vendors`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
export function fetchPOs(params = {}) {
  return request(`${BASE}/pos${toQueryString(params)}`);
}

export function fetchMyClaims(filters = {}) {
  return request(`${BASE}/claims${toQueryString(filters)}`);
}

export function fetchClaim(id) {
  return request(`${BASE}/claims/${id}`);
}

export function createClaim(payload) {
  return request(`${BASE}/claims`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateClaim(id, payload) {
  return request(`${BASE}/claims/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function submitClaim(id) {
  return request(`${BASE}/claims/${id}/submit`, { method: "POST" });
}

export function deleteClaim(id) {
  return request(`${BASE}/claims/${id}`, { method: "DELETE" });
}

export function uploadBill(claimId, itemId, file) {
  const formData = new FormData();
  formData.append("file", file);
  return request(`${BASE}/claims/${claimId}/items/${itemId}/bill`, {
    method: "POST",
    body: formData,
  });
}

export function deleteBill(attachmentId) {
  return request(`${BASE}/attachments/${attachmentId}`, { method: "DELETE" });
}

// --- Approvals (L1 / L2 / Final) -------------------------------------------

export function fetchApprovals(filters = {}) {
  return request(`${BASE}/approvals${toQueryString(filters)}`);
}

export function submitDecision(claimId, payload) {
  return request(`${BASE}/claims/${claimId}/decision`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function sendBackClaim(claimId, reason) {
  return request(`${BASE}/claims/${claimId}/send-back`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

export function rejectClaim(claimId, reason) {
  return request(`${BASE}/claims/${claimId}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
}

// --- Finance processing --------------------------------------------------

export function fetchFinanceMeta() {
  return request(`${BASE}/finance-meta`);
}

export function fetchFinanceClaims(filters = {}) {
  return request(`${BASE}/finance${toQueryString(filters)}`);
}

export function fetchFinanceClaim(id) {
  return request(`${BASE}/finance/${id}`);
}

export function saveFinance(id, payload) {
  return request(`${BASE}/finance/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function exportFinanceExcel(filters = {}) {
  const response = await authFetch(buildApiUrl(`${BASE}/finance-export${toQueryString(filters)}`));
  if (!response.ok) {
    let message = `Export failed (${response.status})`;
    try {
      message = (await response.json())?.message || message;
    } catch {
      /* not json */
    }
    throw new Error(message);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `expense_claims_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// --- Dashboard ---------------------------------------------------------
export function fetchExpenseDashboard(filters = {}) {
  return request(`${BASE}/dashboard${toQueryString(filters)}`);
}

// --- Admin ------------------------------------------------------------
export function fetchAdminConfig() {
  return request(`${BASE}/admin/config`);
}

function adminWrite(path, method, body) {
  return request(`${BASE}/admin/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

export const admin = {
  getApprovalChain: () => request(`${BASE}/admin/approval-chain`),
  saveApprovalChain: (b) => adminWrite("approval-chain", "PUT", b),
  addCategory: (b) => adminWrite("categories", "POST", b),
  updateCategory: (id, b) => adminWrite(`categories/${id}`, "PUT", b),
  deleteCategory: (id) => adminWrite(`categories/${id}`, "DELETE"),
  addSubCategory: (b) => adminWrite("sub-categories", "POST", b),
  deleteSubCategory: (id) => adminWrite(`sub-categories/${id}`, "DELETE"),
  addCostCentre: (b) => adminWrite("cost-centres", "POST", b),
  updateCostCentre: (id, b) => adminWrite(`cost-centres/${id}`, "PUT", b),
  deleteCostCentre: (id) => adminWrite(`cost-centres/${id}`, "DELETE"),
  addMatrix: (b) => adminWrite("matrix", "POST", b),
  updateMatrix: (id, b) => adminWrite(`matrix/${id}`, "PUT", b),
  deleteMatrix: (id) => adminWrite(`matrix/${id}`, "DELETE"),
  // dynamic-form masters
  addVendorType: (b) => adminWrite("vendor-types", "POST", b),
  updateVendorType: (id, b) => adminWrite(`vendor-types/${id}`, "PUT", b),
  deleteVendorType: (id) => adminWrite(`vendor-types/${id}`, "DELETE"),
  addEmployeeType: (b) => adminWrite("employee-types", "POST", b),
  updateEmployeeType: (id, b) => adminWrite(`employee-types/${id}`, "PUT", b),
  deleteEmployeeType: (id) => adminWrite(`employee-types/${id}`, "DELETE"),
  updateVendor: (id, b) => adminWrite(`vendors/${id}`, "PUT", b),
  deleteVendor: (id) => adminWrite(`vendors/${id}`, "DELETE"),
  addPO: (b) => adminWrite("pos", "POST", b),
  updatePO: (id, b) => adminWrite(`pos/${id}`, "PUT", b),
  deletePO: (id) => adminWrite(`pos/${id}`, "DELETE"),
};

// --- Notifications --------------------------------------------------
export function fetchNotifications(params = {}) {
  return request(`${BASE}/notifications${toQueryString(params)}`);
}
export function markNotificationRead(id) {
  return request(`${BASE}/notifications/${id}/read`, { method: "POST" });
}
export function markAllNotificationsRead() {
  return request(`${BASE}/notifications/read-all`, { method: "POST" });
}

export function billUrl(attachmentId) {
  return buildApiUrl(`${BASE}/attachments/${attachmentId}`);
}

/** Opens a bill in a new tab. The auth header can't ride on window.open, so we
 *  fetch the bytes and hand the browser a short-lived object URL. The blank tab
 *  is opened synchronously (inside the click) so popup blockers allow it. */
export async function openBill(attachmentId) {
  const tab = window.open("", "_blank");
  try {
    const response = await authFetch(billUrl(attachmentId));
    if (!response.ok) {
      let message = `Could not open the bill (${response.status})`;
      try {
        message = (await response.json())?.message || message;
      } catch {
        /* not json */
      }
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    if (tab) tab.location = url;
    else window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    if (tab) tab.close();
    throw error;
  }
}
