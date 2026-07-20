import { authFetch, buildApiUrl } from "./api";

// Case-insensitive, whitespace-collapsed comparison mirroring the backend's
// normalizeDesignation (backend/constants/designations.js) so client-side
// comparisons agree with server-side validation.
export function normalizeDesignation(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

let cachedDesignations = null;
let inFlightRequest = null;

// The backend (GET /api/designations) is the single source of truth for the
// approved Designation/Job Role list, shared by the New Joining and Physical
// pages. Cached in memory for the tab's lifetime so multiple dropdowns don't
// re-fetch it.
export function fetchDesignations() {
  if (cachedDesignations) return Promise.resolve(cachedDesignations);

  if (!inFlightRequest) {
    inFlightRequest = authFetch(buildApiUrl("/api/designations"))
      .then((response) => response.json())
      .then((result) => {
        if (!result?.success || !Array.isArray(result.data)) {
          throw new Error(result?.message || "Failed to load designations");
        }
        cachedDesignations = result.data;
        return cachedDesignations;
      })
      .finally(() => {
        inFlightRequest = null;
      });
  }

  return inFlightRequest;
}
