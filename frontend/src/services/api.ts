const API = import.meta.env.VITE_API_URL || "http://localhost:8000";
export function token() { return localStorage.getItem("snackflow_token"); }
export async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if (token()) headers.set("Authorization", `Bearer ${token()}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: response.statusText }));
    throw new Error(body.detail || "Request failed");
  }
  const type = response.headers.get("content-type") || "";
  return (type.includes("application/json") ? response.json() : response.blob()) as Promise<T>;
}
export async function download(path: string, filename: string) {
  const headers = new Headers();
  if (token()) headers.set("Authorization", `Bearer ${token()}`);
  const res = await fetch(`${API}${path}`, { headers });
  if (!res.ok) throw new Error("Download failed");
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
