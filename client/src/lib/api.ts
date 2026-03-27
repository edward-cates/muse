/** Base URL for API calls — empty in dev (uses Vite proxy), full URL in prod. */
const API_BASE = import.meta.env.VITE_API_URL ?? '';

/** Prepend the API base URL to a path. */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}
