import { api, ApiError, getToken } from "./api";
import { getApiBase } from "./env";

export type MobileScanStatus = "scanning" | "queued" | "completed" | "failed";
export type Severity = "high" | "warning" | "info" | "secure" | "hotspot";

export type MobileScan = {
  hash: string;
  file_name: string;
  scan_type: string;
  status: MobileScanStatus;
  error: string | null;
  app_name: string;
  package_name: string;
  version_name: string;
  security_score: number | null;
  severity: Partial<Record<Severity, number>>;
  uploaded_by: string;
  created_at: string | null;
  updated_at: string | null;
};

export type MobileScanPage = {
  items: MobileScan[];
  total: number;
  page: number;
  page_size: number;
};

export type EngineStatus = {
  configured: boolean;
  reachable: boolean;
  detail?: string;
};

export type ScorecardFinding = { title: string; description: string; section: string };

export type Scorecard = Partial<Record<Severity, ScorecardFinding[]>> & {
  security_score?: number;
  total_trackers?: number | null;
  trackers?: number;
  app_name?: string;
  file_name?: string;
  version_name?: string;
};

// The engine report is large and platform-specific; sections are read defensively.
export type MobileReport = Record<string, unknown>;

export type CompareResult = Record<string, unknown> & {
  first_app?: Record<string, unknown>;
  second_app?: Record<string, unknown>;
};

const BASE = "/mobile-security";

export const enc = encodeURIComponent;

export const getEngineStatus = () =>
  api<EngineStatus>(`${BASE}/status`, { skipPendingOverlay: true });

export function listScans(params: { page?: number; pageSize?: number; q?: string } = {}) {
  const qs = new URLSearchParams({
    page: String(params.page ?? 1),
    page_size: String(params.pageSize ?? 20),
  });
  if (params.q?.trim()) qs.set("q", params.q.trim());
  return api<MobileScanPage>(`${BASE}/scans?${qs}`, { skipPendingOverlay: true });
}

export const getScan = (hash: string) =>
  api<MobileScan>(`${BASE}/scans/${enc(hash)}`, { skipPendingOverlay: true });

export const getReport = (hash: string) =>
  api<MobileReport>(`${BASE}/scans/${enc(hash)}/report`, { skipPendingOverlay: true });

export const getScorecard = (hash: string) =>
  api<Scorecard>(`${BASE}/scans/${enc(hash)}/scorecard`, { skipPendingOverlay: true });

export const getScanLogs = (hash: string) =>
  api<{ logs: unknown }>(`${BASE}/scans/${enc(hash)}/logs`, { skipPendingOverlay: true });

export const rescan = (hash: string) =>
  api<MobileScan>(`${BASE}/scans/${enc(hash)}/rescan`, { method: "POST" });

export const deleteScan = (hash: string) =>
  api<void>(`${BASE}/scans/${enc(hash)}`, { method: "DELETE" });

export const viewSource = (hash: string, file: string, type: string) =>
  api<{ data?: string; title?: string; file?: string; type?: string }>(
    `${BASE}/scans/${enc(hash)}/source?${new URLSearchParams({ file, type })}`,
  );

export const compareScans = (hash1: string, hash2: string) =>
  api<CompareResult>(`${BASE}/compare?${new URLSearchParams({ hash1, hash2 })}`);

export type EngineParams = Record<string, string | number | boolean | string[]>;

/** Allowlisted engine operation (dynamic analysis, Frida, iOS, suppressions, queue). */
export function engineAction<T = Record<string, unknown>>(name: string, params: EngineParams = {}, quiet = true) {
  return api<T>(`${BASE}/engine/${enc(name)}`, { method: "POST", json: { params }, skipPendingOverlay: quiet });
}

export async function engineDownload(name: string, params: EngineParams, fallbackName: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${getApiBase()}${BASE}/engine/${enc(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ params }),
  });
  if (!res.ok) throw new ApiError(await errorDetail(res, "Download failed"), res.status);
  const disposition = res.headers.get("content-disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  saveBlob(await res.blob(), match?.[1] ?? fallbackName);
}

export async function engineUpload<T = Record<string, unknown>>(name: string, file: File, params: EngineParams): Promise<T> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  form.append("params", JSON.stringify(params));
  const res = await fetch(`${getApiBase()}${BASE}/engine/${enc(name)}/upload`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new ApiError(await errorDetail(res, "Upload failed"), res.status);
  return (await res.json()) as T;
}

/** Streams a long-lived engine output (e.g. logcat) until aborted. */
export async function engineStream(name: string, params: EngineParams, onText: (chunk: string) => void, signal: AbortSignal): Promise<void> {
  const token = getToken();
  const res = await fetch(`${getApiBase()}${BASE}/engine/${enc(name)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ params }),
    signal,
  });
  if (!res.ok || !res.body) throw new ApiError(await errorDetail(res, "Stream failed"), res.status);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onText(decoder.decode(value, { stream: true }));
  }
}

async function errorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const j = (await res.json()) as { detail?: unknown };
    if (typeof j.detail === "string") return j.detail;
  } catch {
    /* keep fallback */
  }
  return fallback;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export type EngineTask = {
  task_id: string;
  file_name: string;
  app_name?: string;
  checksum: string;
  created_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: string;
};

/** XHR so the dropzone can show real upload progress. */
export function uploadScan(file: File, onProgress?: (pct: number) => void): Promise<MobileScan> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getApiBase()}${BASE}/scans`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      let body: unknown = null;
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(body as MobileScan);
      else {
        const detail = (body as { detail?: unknown } | null)?.detail;
        reject(
          new ApiError(
            typeof detail === "string" ? detail : xhr.statusText || "Upload failed",
            xhr.status,
            xhr.responseText,
          ),
        );
      }
    };
    xhr.onerror = () => reject(new ApiError("Network error during upload", 0));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
}

export async function downloadPdf(scan: Pick<MobileScan, "hash" | "file_name">): Promise<void> {
  const token = getToken();
  const res = await fetch(`${getApiBase()}${BASE}/scans/${enc(scan.hash)}/pdf`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    let msg = "Could not generate PDF";
    try {
      const j = (await res.json()) as { detail?: unknown };
      if (typeof j.detail === "string") msg = j.detail;
    } catch {
      /* keep msg */
    }
    throw new ApiError(msg, res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = `${scan.file_name.replace(/\.[^.]+$/, "") || "report"}-mobile-security.pdf`;
  a.click();
  URL.revokeObjectURL(url);
}

export const ACCEPTED_EXTENSIONS = [
  ".apk", ".aab", ".xapk", ".apks", ".ipa", ".appx", ".jar", ".aar", ".so", ".dylib", ".a", ".zip",
];

export const isPending = (s: MobileScan) => s.status === "scanning" || s.status === "queued";

export function platformOf(scan: Pick<MobileScan, "scan_type" | "file_name">): "android" | "ios" | "windows" | "other" {
  const t = (scan.scan_type || scan.file_name.split(".").pop() || "").toLowerCase();
  if (["apk", "aab", "xapk", "apks", "jar", "aar", "so", "zip"].includes(t)) return "android";
  if (["ipa", "dylib", "a"].includes(t)) return "ios";
  if (t === "appx") return "windows";
  return "other";
}

/** Engine titles/descriptions embed HTML; never render it — flatten to text. */
export function plain(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

export function scoreGrade(score: number | null | undefined): { grade: string; tone: "good" | "ok" | "bad" | "none" } {
  if (score === null || score === undefined) return { grade: "–", tone: "none" };
  if (score >= 75) return { grade: "A", tone: "good" };
  if (score >= 60) return { grade: "B", tone: "ok" };
  if (score >= 40) return { grade: "C", tone: "ok" };
  return { grade: "F", tone: "bad" };
}

export function formatBytes(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value !== "number" || !Number.isFinite(value)) return "–";
  const units = ["B", "KB", "MB", "GB"];
  let n = value;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "–";
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return d.toLocaleDateString();
}
