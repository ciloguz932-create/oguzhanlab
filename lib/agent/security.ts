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
  let hostname = url.hostname.toLowerCase();
  // Unwrap [IPv6] brackets. IPv4-mapped IPv6 (::ffff:…, in either dotted or hex form)
  // is blocked outright below so a loopback/private address can't slip through disguised.
  hostname = hostname.replace(/^\[|\]$/g, "");
  if (hostname.startsWith("::ffff:")) {
    throw new Error("IPv4-eşlemeli IPv6 adreslerine izin verilmez.");
  }
  const forbidden = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "::", "169.254.169.254", "metadata.google.internal"];
  if (forbidden.includes(hostname) || hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    throw new Error("Yerel veya özel ağ adreslerine bu sürümde izin verilmez.");
  }
  // Private IPv4 ranges (RFC 1918), loopback /8, link-local, and CGNAT (RFC 6598 100.64/10).
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|127\.|169\.254\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(hostname)) {
    throw new Error("Özel ağ adreslerine bu sürümde izin verilmez.");
  }
  // Unique-local (fc00::/7) and link-local (fe80::/10) IPv6.
  if (/^(f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i.test(hostname)) {
    throw new Error("Özel ağ adreslerine bu sürümde izin verilmez.");
  }
  return url;
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}
