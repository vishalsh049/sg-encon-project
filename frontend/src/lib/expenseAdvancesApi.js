// API client for the Advance Payment + Bill Closure workflow.
// Advance REQUESTS are created via lib/expenseClaimsApi.js (createClaim with
// claimKind:'advance'); everything post-approval lives here.

import { authFetch, buildApiUrl } from "./api";

const BASE = "/api/expense-advances";

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

function qs(params = {}) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && String(v) !== "") s.set(k, v);
  }
  const str = s.toString();
  return str ? `?${str}` : "";
}

export function fetchAdvances(filters = {}) {
  return request(`${BASE}${qs(filters)}`);
}

export function fetchAdvanceMeta() {
  return request(`${BASE}/meta`);
}

export function fetchAdvance(id) {
  return request(`${BASE}/${id}`);
}

export function fetchAdvancePayments(id) {
  return request(`${BASE}/${id}/payments`);
}

export function recordAdvancePayment(id, payload) {
  return request(`${BASE}/${id}/payments`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// --- Advance Bills (Milestone C) -------------------------------------------

function jsonBody(payload) {
  return {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  };
}

export function fetchAdvanceBillApprovals(filters = {}) {
  return request(`${BASE}/bill-approvals${qs(filters)}`);
}

export function fetchAdvanceBill(billId) {
  return request(`${BASE}/bills/${billId}`);
}

export function createAdvanceBill(advanceId, payload) {
  return request(`${BASE}/${advanceId}/bills`, { method: "POST", ...jsonBody(payload) });
}

export function updateAdvanceBill(billId, payload) {
  return request(`${BASE}/bills/${billId}`, { method: "PUT", ...jsonBody(payload) });
}

export function deleteAdvanceBill(billId) {
  return request(`${BASE}/bills/${billId}`, { method: "DELETE" });
}

export function submitAdvanceBill(billId) {
  return request(`${BASE}/bills/${billId}/submit`, { method: "POST" });
}

export function advanceBillDecision(billId, payload) {
  return request(`${BASE}/bills/${billId}/decision`, { method: "POST", ...jsonBody(payload) });
}

export function sendBackAdvanceBill(billId, reason) {
  return request(`${BASE}/bills/${billId}/send-back`, { method: "POST", ...jsonBody({ reason }) });
}

export function rejectAdvanceBill(billId, reason) {
  return request(`${BASE}/bills/${billId}/reject`, { method: "POST", ...jsonBody({ reason }) });
}

export function uploadAdvanceBillFile(billId, file) {
  const fd = new FormData();
  fd.append("file", file);
  return request(`${BASE}/bills/${billId}/file`, { method: "POST", body: fd });
}

export function deleteAdvanceBillFile(billId, attachmentId) {
  return request(`${BASE}/bills/${billId}/attachments/${attachmentId}`, { method: "DELETE" });
}

// --- Reconciliation close-out (Milestone D) -------------------------------

export function finalizeAdvanceBills(advanceId) {
  return request(`${BASE}/${advanceId}/finalize-bills`, { method: "POST" });
}

export function recordAdvanceRefund(advanceId, payload) {
  return request(`${BASE}/${advanceId}/refunds`, { method: "POST", ...jsonBody(payload) });
}

export function recordAdditionalPayment(advanceId, payload) {
  return request(`${BASE}/${advanceId}/additional-payments`, { method: "POST", ...jsonBody(payload) });
}

export function fetchAdvanceDashboard() {
  return request(`${BASE}/dashboard`);
}

export async function exportAdvancesExcel() {
  const res = await authFetch(buildApiUrl(`${BASE}/export`));
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      message = (await res.json())?.message || message;
    } catch {
      /* not json */
    }
    throw new Error(message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `advances_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
