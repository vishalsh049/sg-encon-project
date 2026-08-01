import { authFetch, buildApiUrl } from "./api";

// The backend (GET /api/manpower-settings/config) is the single source of
// truth for Main Profiles, Sub Profiles (designation -> role_key mapping),
// Circles/CMPs, and Validation Rules — replaces the hardcoded copies that
// used to live in individual pages/components. Cached in memory for the
// tab's lifetime, invalidated on every write via invalidateManpowerConfig().
let cachedConfig = null;
let inFlightRequest = null;

export function invalidateManpowerConfig() {
  cachedConfig = null;
}

export function fetchManpowerConfig() {
  if (cachedConfig) return Promise.resolve(cachedConfig);

  if (!inFlightRequest) {
    inFlightRequest = authFetch(buildApiUrl("/api/manpower-settings/config"))
      .then((response) => response.json())
      .then((result) => {
        if (!result?.success || !result?.data) {
          throw new Error(result?.message || "Failed to load manpower settings");
        }
        cachedConfig = result.data;
        return cachedConfig;
      })
      .finally(() => {
        inFlightRequest = null;
      });
  }

  return inFlightRequest;
}

// How many current physical/new_joining/scrum_manpower records use each Sub
// Profile right now — no caching (admin-only page, small payload, and it
// should reflect live data every time the tab is opened).
export async function fetchUsageSummary() {
  const response = await authFetch(buildApiUrl("/api/manpower-settings/usage-summary"));
  const result = await response.json();
  if (!result?.success) {
    throw new Error(result?.message || "Failed to load usage summary");
  }
  return result.data;
}

async function request(method, path, body) {
  const response = await authFetch(buildApiUrl(`/api/manpower-settings${path}`), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || result?.success === false) {
    throw new Error(result?.message || `Request failed (${response.status})`);
  }
  invalidateManpowerConfig();
  return result;
}

export const createMainProfile = (payload) => request("POST", "/main-profiles", payload);
export const updateMainProfile = (id, payload) => request("PUT", `/main-profiles/${id}`, payload);
export const deleteMainProfile = (id) => request("DELETE", `/main-profiles/${id}`);

export const createSubProfile = (payload) => request("POST", "/sub-profiles", payload);
export const bulkCreateSubProfiles = (payload) => request("POST", "/sub-profiles/bulk", payload);
export const updateSubProfile = (id, payload) => request("PUT", `/sub-profiles/${id}`, payload);
export const deleteSubProfile = (id) => request("DELETE", `/sub-profiles/${id}`);

export const createCircle = (payload) => request("POST", "/circles", payload);
export const updateCircle = (id, payload) => request("PUT", `/circles/${id}`, payload);
export const deleteCircle = (id) => request("DELETE", `/circles/${id}`);

export const createCmp = (payload) => request("POST", "/cmps", payload);
export const updateCmp = (id, payload) => request("PUT", `/cmps/${id}`, payload);
export const deleteCmp = (id) => request("DELETE", `/cmps/${id}`);

export const createValidationRule = (payload) => request("POST", "/validation-rules", payload);
export const updateValidationRule = (id, payload) => request("PUT", `/validation-rules/${id}`, payload);
export const deleteValidationRule = (id) => request("DELETE", `/validation-rules/${id}`);
