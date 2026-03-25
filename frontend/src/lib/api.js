const rawBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
export const API_BASE_URL = rawBaseUrl || "";

export function buildApiUrl(path) {
  return `${API_BASE_URL}${path}`;
}
