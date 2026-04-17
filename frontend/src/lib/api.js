// Get base URL from environment
const rawBase = import.meta.env.VITE_API_BASE_URL || "";

// Normalize to avoid double slashes
const API_BASE_URL = rawBase.endsWith("/")
  ? rawBase.slice(0, -1)
  : rawBase;

// Build full API URL
export function buildApiUrl(path) {
  let normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

export function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token
    ? {
        Authorization: `Bearer ${token}`,
      }
    : {};
}
