const SENSITIVE_PATTERN = /(?:sk-[A-Za-z0-9_\-]{12,}|AIza[A-Za-z0-9_\-]{20,}|Bearer\s+[A-Za-z0-9._\-]+)/g;

export function redactSensitive(value: string): string {
  return value.replace(SENSITIVE_PATTERN, "[REDACTED]");
}

export function safeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : "Beklenmeyen hata";
  return redactSensitive(raw).slice(0, 280);
}

export function sanitizeFileName(name: string, fallback = "artifact.md"): string {
  const normal = name
    .normalize("NFKD")
    .replace(/[\\/]+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 96);
  if (!normal || normal === "." || normal === "..") return fallback;
  return normal.includes(".") ? normal : `${normal}.md`;
}

export function assertSafeRemoteUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:") {
    throw new Error("Yalnızca HTTPS uzak bağlantılarına izin verilir.");
  }
  if (url.username || url.password) {
    throw new Error("Bağlantı adresinde kullanıcı adı veya parola kullanılamaz.");
  }
  const hostname = url.hostname.toLowerCase();
  const forbidden = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"];
  if (forbidden.includes(hostname) || hostname.endsWith(".local")) {
    throw new Error("Yerel veya özel ağ adreslerine bu sürümde izin verilmez.");
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)) {
    throw new Error("Özel ağ adreslerine bu sürümde izin verilmez.");
  }
  return url;
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
