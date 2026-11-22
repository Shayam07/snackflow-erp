const API = import.meta.env.VITE_API_URL || "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(message: string, status: number, code = "error") {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

export type Paged<T> = { items: T[]; total: number; limit: number; offset: number };
export type QueryValue = string | number | boolean | null | undefined;

export function token(): string | null {
  return localStorage.getItem("snackflow_token");
}

export function clearSession() {
  localStorage.removeItem("snackflow_token");
  localStorage.removeItem("snackflow_role");
  localStorage.removeItem("snackflow_username");
}

export function qs(params: Record<string, QueryValue>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
}

async function readError(response: Response): Promise<ApiError> {
  let detail = response.statusText || "Request failed";
  let code = "error";
  try {
    const body = await response.json();
    if (typeof body?.detail === "string") detail = body.detail;
    else if (Array.isArray(body?.detail)) detail = body.detail.map((d: any) => d.msg).join(", ");
    if (typeof body?.code === "string") code = body.code;
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(detail, response.status, code);
}

export async function api<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const auth = token();
  if (auth) headers.set("Authorization", `Bearer ${auth}`);

  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (response.status === 401 && auth) {
    clearSession();
    window.dispatchEvent(new Event("snackflow:unauthorized"));
  }
  if (!response.ok) throw await readError(response);

  const type = response.headers.get("content-type") || "";
  if (type.includes("application/json")) return response.json() as Promise<T>;
  return response.blob() as unknown as Promise<T>;
}

export async function apiWithTotal<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers || {});
  const auth = token();
  if (auth) headers.set("Authorization", `Bearer ${auth}`);
  const response = await fetch(`${API}${path}`, { ...options, headers });
  if (!response.ok) throw await readError(response);
  const total = Number(response.headers.get("X-Total-Count") || 0);
  const items = (await response.json()) as T[];
  return { items, total };
}

export async function download(path: string, filename: string) {
  const headers = new Headers();
  const auth = token();
  if (auth) headers.set("Authorization", `Bearer ${auth}`);
  const response = await fetch(`${API}${path}`, { headers });
  if (!response.ok) throw await readError(response);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export const money = (value: string | number | null | undefined) =>
  `₹${Number(value ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
