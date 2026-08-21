import { AgentError, httpError } from "./errors";
import { safeErrorMessage } from "./security";
import type { IntegrationConfig, IntegrationId, ToolDefinition, ToolResult } from "./types";

/**
 * A native HTTP integration: a token-backed external service that contributes real
 * tools to the central ToolRegistry. Executors perform real API calls and never
 * fabricate results; a missing token yields a clear "not configured" error.
 */
export interface IntegrationDef {
  id: IntegrationId;
  name: string;
  description: string;
  credentialLabel: string;
  credentialHint: string;
  requiresToken: boolean;
  tools: ToolDefinition[];
  execute(toolId: string, args: Record<string, unknown>, token: string | null, signal?: AbortSignal): Promise<ToolResult>;
}

const str = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value));

function b64ToUtf8(base64: string): string {
  const clean = base64.replace(/\s/g, "");
  const binary = atob(clean);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

// --- GitHub -----------------------------------------------------------------

const GITHUB_API = "https://api.github.com";

async function githubRequest(token: string, path: string, init: RequestInit | undefined, signal: AbortSignal | undefined): Promise<unknown> {
  const response = await fetch(`${GITHUB_API}${path}`, {
    ...init,
    signal,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "OguzhanLab-Agent",
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  if (!response.ok) throw httpError(response.status);
  return response.json();
}

const GITHUB_TOOLS: ToolDefinition[] = [
  { id: "github.search_repositories", title: "GitHub depo ara", description: "GitHub'da depo arar (salt-okunur).", source: "integration", risk: "low", inputSchema: { query: "string" } },
  { id: "github.get_repo", title: "GitHub depo bilgisi", description: "Bir deponun özet bilgisini getirir.", source: "integration", risk: "low", inputSchema: { owner: "string", repo: "string" } },
  { id: "github.list_issues", title: "GitHub issue listele", description: "Bir deponun açık issue'larını listeler.", source: "integration", risk: "low", inputSchema: { owner: "string", repo: "string" } },
  { id: "github.read_file", title: "GitHub dosya oku", description: "Bir depodaki dosyanın içeriğini okur.", source: "integration", risk: "medium", inputSchema: { owner: "string", repo: "string", path: "string", ref: "string?" } },
  { id: "github.create_issue", title: "GitHub issue oluştur", description: "Bir depoda yeni issue açar (yazma işlemi).", source: "integration", risk: "high", inputSchema: { owner: "string", repo: "string", title: "string", body: "string?" } },
];

export const GITHUB_INTEGRATION: IntegrationDef = {
  id: "github",
  name: "GitHub",
  description: "Depo arama, depo/issue okuma ve issue oluşturma. Fine-grained veya classic Personal Access Token kullanır.",
  credentialLabel: "GitHub Personal Access Token",
  credentialHint: "github.com → Settings → Developer settings → Personal access tokens",
  requiresToken: true,
  tools: GITHUB_TOOLS,
  async execute(toolId, args, token, signal) {
    if (!token) return { ok: false, content: "", error: "GitHub bağlı değil. Ayarlar → Entegrasyonlar'dan bir token ekleyin." };
    try {
      if (toolId === "github.search_repositories") {
        const query = str(args.query);
        if (!query.trim()) throw new AgentError("Arama sorgusu boş olamaz.", "client", { retryable: false });
        const body = (await githubRequest(token, `/search/repositories?q=${encodeURIComponent(query)}&per_page=5`, undefined, signal)) as { items?: Array<{ full_name: string; description?: string; stargazers_count: number; html_url: string }> };
        const lines = (body.items ?? []).map((item) => `- ${item.full_name} ⭐${item.stargazers_count}\n  ${item.description ?? ""}\n  ${item.html_url}`);
        return { ok: true, content: lines.length ? lines.join("\n\n") : "Sonuç bulunamadı.", metadata: { count: body.items?.length ?? 0 } };
      }
      if (toolId === "github.get_repo") {
        const repo = (await githubRequest(token, `/repos/${encodeURIComponent(str(args.owner))}/${encodeURIComponent(str(args.repo))}`, undefined, signal)) as { full_name: string; description?: string; stargazers_count: number; language?: string; topics?: string[]; default_branch: string; open_issues_count: number };
        return { ok: true, content: `${repo.full_name}\n${repo.description ?? ""}\nDil: ${repo.language ?? "-"} · ⭐${repo.stargazers_count} · açık issue: ${repo.open_issues_count}\nVarsayılan dal: ${repo.default_branch}\nKonular: ${(repo.topics ?? []).join(", ") || "-"}` };
      }
      if (toolId === "github.list_issues") {
        const body = (await githubRequest(token, `/repos/${encodeURIComponent(str(args.owner))}/${encodeURIComponent(str(args.repo))}/issues?state=open&per_page=10`, undefined, signal)) as Array<{ number: number; title: string; html_url: string; pull_request?: unknown }>;
        const issues = body.filter((item) => !item.pull_request).map((item) => `#${item.number} ${item.title}\n  ${item.html_url}`);
        return { ok: true, content: issues.length ? issues.join("\n") : "Açık issue yok.", metadata: { count: issues.length } };
      }
      if (toolId === "github.read_file") {
        const ref = str(args.ref);
        const path = `/repos/${encodeURIComponent(str(args.owner))}/${encodeURIComponent(str(args.repo))}/contents/${str(args.path).split("/").map(encodeURIComponent).join("/")}${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
        const file = (await githubRequest(token, path, undefined, signal)) as { content?: string; encoding?: string; size?: number };
        if (!file.content || file.encoding !== "base64") return { ok: false, content: "", error: "Dosya içeriği okunamadı (ikili veya çok büyük olabilir)." };
        return { ok: true, content: b64ToUtf8(file.content).slice(0, 20_000), metadata: { size: file.size } };
      }
      if (toolId === "github.create_issue") {
        const title = str(args.title);
        if (!title.trim()) throw new AgentError("Issue başlığı boş olamaz.", "client", { retryable: false });
        const issue = (await githubRequest(token, `/repos/${encodeURIComponent(str(args.owner))}/${encodeURIComponent(str(args.repo))}/issues`, { method: "POST", body: JSON.stringify({ title, body: str(args.body) }) }, signal)) as { number: number; html_url: string };
        return { ok: true, content: `Issue #${issue.number} oluşturuldu: ${issue.html_url}`, metadata: { number: issue.number } };
      }
      return { ok: false, content: "", error: `Bilinmeyen GitHub aracı: ${toolId}` };
    } catch (error) {
      return { ok: false, content: "", error: safeErrorMessage(error) };
    }
  },
};

// --- Email (Resend) ---------------------------------------------------------

const EMAIL_TOOLS: ToolDefinition[] = [
  { id: "email.send", title: "E-posta gönder", description: "Resend API ile gerçek e-posta gönderir. 'from' adresi Resend'de doğrulanmış bir alan adı olmalıdır.", source: "integration", risk: "high", inputSchema: { from: "string", to: "string", subject: "string", text: "string" } },
];

export const EMAIL_INTEGRATION: IntegrationDef = {
  id: "email",
  name: "E-posta (Resend)",
  description: "Resend transactional e-posta API'si ile gerçek e-posta gönderir. OAuth gerektirmez; bir Resend API anahtarı kullanır.",
  credentialLabel: "Resend API Key",
  credentialHint: "resend.com → API Keys (re_… ile başlar)",
  requiresToken: true,
  tools: EMAIL_TOOLS,
  async execute(toolId, args, token, signal) {
    if (toolId !== "email.send") return { ok: false, content: "", error: `Bilinmeyen e-posta aracı: ${toolId}` };
    if (!token) return { ok: false, content: "", error: "E-posta bağlı değil. Ayarlar → Entegrasyonlar'dan bir Resend API anahtarı ekleyin." };
    const from = str(args.from);
    const to = str(args.to);
    const subject = str(args.subject);
    const text = str(args.text);
    if (!from || !to || !subject || !text) return { ok: false, content: "", error: "from, to, subject ve text alanları zorunludur." };
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        signal,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ from, to: [to], subject, text }),
      });
      if (!response.ok) {
        const detail = (await response.json().catch(() => ({}))) as { message?: string };
        if (response.status === 401 || response.status === 403) throw httpError(response.status);
        return { ok: false, content: "", error: detail.message ? `E-posta gönderilemedi: ${detail.message}` : "E-posta gönderilemedi." };
      }
      const body = (await response.json()) as { id?: string };
      return { ok: true, content: `E-posta gönderildi (id: ${body.id ?? "?"}).`, metadata: { id: body.id } };
    } catch (error) {
      return { ok: false, content: "", error: safeErrorMessage(error) };
    }
  },
};

// --- Registry ---------------------------------------------------------------

export const INTEGRATION_DEFS: IntegrationDef[] = [GITHUB_INTEGRATION, EMAIL_INTEGRATION];

export function getIntegrationDef(id: IntegrationId): IntegrationDef | undefined {
  return INTEGRATION_DEFS.find((def) => def.id === id);
}

/** Resolves the integration that owns a given tool id (tools are namespaced by integration id). */
export function integrationForToolId(toolId: string): IntegrationDef | undefined {
  const prefix = toolId.split(".")[0];
  return INTEGRATION_DEFS.find((def) => def.id === prefix);
}

/**
 * Cheaply validates a token where the API allows it (GitHub /user). Email (Resend)
 * has no free validation endpoint, so it is accepted and verified on first real send.
 */
export async function validateIntegrationToken(id: IntegrationId, token: string, signal?: AbortSignal): Promise<{ ok: boolean; reason?: string }> {
  try {
    if (id === "github") {
      const response = await fetch(`${GITHUB_API}/user`, { headers: { Accept: "application/vnd.github+json", "User-Agent": "OguzhanLab-Agent", Authorization: `Bearer ${token}` }, signal });
      if (!response.ok) throw httpError(response.status);
      return { ok: true };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: safeErrorMessage(error) };
  }
}

export function seedIntegrations(): IntegrationConfig[] {
  return INTEGRATION_DEFS.map((def) => ({ id: def.id, enabled: false, connected: false, createdAt: new Date().toISOString() }));
}

/** Adds configs for any newly shipped integrations, preserving existing ones. */
export function mergeIntegrations(existing: IntegrationConfig[]): IntegrationConfig[] {
  const known = new Set(existing.map((config) => config.id));
  const additions = seedIntegrations().filter((config) => !known.has(config.id));
  return additions.length ? [...existing, ...additions] : existing;
}
