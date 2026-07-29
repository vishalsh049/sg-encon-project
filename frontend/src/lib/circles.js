import { authFetch, buildApiUrl } from "./api";

let cachedCircleData = null;
let inFlightRequest = null;

// The backend (GET /api/circles) is the single source of truth for the
// approved Circle list and per-circle CMP allow-list, shared by the New
// Joining and Physical pages. Cached in memory for the tab's lifetime so
// multiple dropdowns don't re-fetch it.
export function fetchCircles() {
  if (cachedCircleData) return Promise.resolve(cachedCircleData);

  if (!inFlightRequest) {
    inFlightRequest = authFetch(buildApiUrl("/api/circles"))
      .then((response) => response.json())
      .then((result) => {
        if (!result?.success || !result?.data) {
          throw new Error(result?.message || "Failed to load circles");
        }
        cachedCircleData = {
          circles: Array.isArray(result.data.circles) ? result.data.circles : [],
          circleCmpMap: result.data.circleCmpMap || {},
        };
        return cachedCircleData;
      })
      .finally(() => {
        inFlightRequest = null;
      });
  }

  return inFlightRequest;
}
