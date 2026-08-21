import { AgentError, httpError } from "./errors";
import { assertSafeRemoteUrl, sanitizeFileName } from "./security";
import type { ToolDefinition, ToolResult } from "./types";

export const nativeTools: ToolDefinition[] = [
  { id: "web.search", title: "Web araştırması", description: "Açık webde başlangıç kaynağı arar.", source: "native", risk: "medium", inputSchema: { query: "string" } },
  { id: "web.fetch", title: "Web sayfası getir", description: "Bir HTTPS URL'sini getirir ve okunabilir metne dönüştürür.", source: "native", risk: "medium", inputSchema: { url: "string" } },
  { id: "text.transform", title: "Metin işleme", description: "Yerel metni başlık ve dosya adına dönüştürür.", source: "native", risk: "low", inputSchema: { text: "string" } },
  { id: "calculator.evaluate", title: "Hesap makinesi", description: "Kısıtlı aritmetik ifadeyi yerelde hesaplar.", source: "native", risk: "low", inputSchema: { expression: "string" } },
  { id: "filesystem.writeMarkdown", title: "Markdown dosyası yaz", description: "Workspace içinde güvenli Markdown artifact’i üretir.", source: "native", risk: "medium", inputSchema: { filename: "string", content: "string" } },
  { id: "agent.spawn", title: "Alt-agent çalıştır", description: "Odaklı bir alt görevi rol tabanlı, salt-okunur bir alt-agent'a devreder. Roller: research, coding, data, writing.", source: "native", risk: "medium", inputSchema: { role: "research|coding|data|writing", task: "string" } },
];

export class ToolRegistry {
  private readonly tools = new Map(nativeTools.map((tool) => [tool.id, tool]));

  register(tool: ToolDefinition): void {
    this.tools.set(tool.id, tool);
  }

  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }
}

export function safeCalculate(expression: string): number {
  if (!/^[0-9+\-*/().\s%]+$/.test(expression) || expression.length > 100) {
    throw new Error("Yalnızca temel aritmetik karakterlere izin verilir.");
  }
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+\-*/%]/g) ?? [];
  if (!tokens.length || tokens.join("") !== expression.replace(/\s/g, "")) throw new Error("Geçersiz matematik ifadesi.");
  const output: string[] = [];
  const operators: string[] = [];
  const precedence: Record<string, number> = { "+": 1, "-": 1, "*": 2, "/": 2, "%": 2 };
  for (const token of tokens) {
    if (/^\d/.test(token)) output.push(token);
    else if (token === "(") operators.push(token);
    else if (token === ")") {
      while (operators.length && operators.at(-1) !== "(") output.push(operators.pop()!);
      if (operators.pop() !== "(") throw new Error("Dengesiz parantez.");
    } else {
      while (operators.length && operators.at(-1) !== "(" && precedence[operators.at(-1)!] >= precedence[token]) output.push(operators.pop()!);
      operators.push(token);
    }
  }
  while (operators.length) {
    const operator = operators.pop()!;
    if (operator === "(") throw new Error("Dengesiz parantez.");
    output.push(operator);
  }
  const stack: number[] = [];
  for (const token of output) {
    if (/^\d/.test(token)) stack.push(Number(token));
    else {
      const right = stack.pop();
      const left = stack.pop();
      if (left === undefined || right === undefined) throw new Error("Geçersiz matematik ifadesi.");
      if ((token === "/" || token === "%") && right === 0) throw new Error("Sıfıra bölme yapılamaz.");
      stack.push(token === "+" ? left + right : token === "-" ? left - right : token === "*" ? left * right : token === "/" ? left / right : left % right);
    }
  }
  if (stack.length !== 1 || !Number.isFinite(stack[0])) throw new Error("Hesaplama başarısız oldu.");
  return stack[0];
}

/**
 * Runs a read-only open-web lookup via the DuckDuckGo Instant Answer API. Throws
 * on transport/HTTP failure (so callers can classify + retry transient errors) and
 * returns a successful ToolResult even when the structured answer is sparse.
 */
export async function executeWebSearch(query: string, signal?: AbortSignal): Promise<ToolResult> {
  if (!query.trim()) throw new AgentError("Arama sorgusu boş olamaz.", "client", { retryable: false });
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query.slice(0, 300))}&format=json&no_html=1&skip_disambig=1`;
  assertSafeRemoteUrl(url);
  const response = await fetch(url, { headers: { Accept: "application/json" }, signal });
  if (!response.ok) throw httpError(response.status);
  const data = (await response.json()) as { AbstractText?: string; AbstractURL?: string; RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }> };
  const sources = (data.RelatedTopics ?? []).flatMap((item) => item.Topics ?? [item]).filter((item) => item.Text && item.FirstURL).slice(0, 8).map((item) => `- ${item.Text}\n  ${item.FirstURL}`);
  const content = [data.AbstractText ? `Özet: ${data.AbstractText}${data.AbstractURL ? `\nKaynak: ${data.AbstractURL}` : ""}` : "", ...sources].filter(Boolean).join("\n\n");
  return { ok: true, content: content || "Arama tamamlandı; sınırlı yapılandırılmış sonuç döndü.", metadata: { sourceCount: sources.length } };
}

/** Converts an HTML document to readable plain text: drops scripts/styles, strips tags, decodes common entities. */
export function htmlToText(html: string): string {
  const withoutBlocks = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const withBreaks = withoutBlocks
    .replace(/<\/(p|div|h[1-6]|li|tr|section|article|header|footer)>/gi, "\n")
    .replace(/<br\s*\/?>(?!\n)/gi, "\n");
  const text = withBreaks.replace(/<[^>]+>/g, " ");
  const decoded = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)));
  return decoded.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").split("\n").map((line) => line.trim()).join("\n").trim();
}

/**
 * Fetches an open-web page over HTTPS and returns readable text. SSRF-guarded via
 * assertSafeRemoteUrl; throws on transport/HTTP failure so callers can retry transient errors.
 */
export async function executeWebFetch(rawUrl: string, signal?: AbortSignal): Promise<ToolResult> {
  const url = assertSafeRemoteUrl(rawUrl.trim());
  const response = await fetch(url.toString(), { headers: { Accept: "text/html,application/xhtml+xml,text/plain" }, signal });
  if (!response.ok) throw httpError(response.status);
  const raw = (await response.text()).slice(0, 400_000);
  const contentType = response.headers.get("content-type") ?? "";
  const text = /html|xml/.test(contentType) ? htmlToText(raw) : raw;
  return { ok: true, content: text.slice(0, 20_000), metadata: { url: url.toString(), truncated: text.length > 20_000 } };
}

export function makeArtifactName(instruction: string): string {
  const tokens = instruction.split(/\s+/).slice(0, 5).join("-");
  return sanitizeFileName(tokens || "agent-output", "agent-output.md").replace(/\.(?!md$)[^.]+$/, "") + ".md";
}

/** Local, side-effect-free text utility used by the `text.transform` native tool. */
export function sanitizeTextTransform(text: string): { title: string; filename: string } {
  const clean = text.trim().replace(/\s+/g, " ").slice(0, 120);
  const title = clean ? clean[0].toUpperCase() + clean.slice(1) : "Başlıksız";
  return { title, filename: makeArtifactName(text) };
}
