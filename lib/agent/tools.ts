import { assertSafeRemoteUrl, sanitizeFileName, safeErrorMessage } from "./security";
import type { ToolDefinition, ToolResult } from "./types";

export const nativeTools: ToolDefinition[] = [
  { id: "web.search", title: "Web araştırması", description: "Açık webde başlangıç kaynağı arar.", source: "native", risk: "medium", inputSchema: { query: "string" } },
  { id: "text.transform", title: "Metin işleme", description: "Yerel metni başlık ve dosya adına dönüştürür.", source: "native", risk: "low", inputSchema: { text: "string" } },
  { id: "calculator.evaluate", title: "Hesap makinesi", description: "Kısıtlı aritmetik ifadeyi yerelde hesaplar.", source: "native", risk: "low", inputSchema: { expression: "string" } },
  { id: "filesystem.writeMarkdown", title: "Markdown dosyası yaz", description: "Workspace içinde güvenli Markdown artifact’i üretir.", source: "native", risk: "medium", inputSchema: { filename: "string", content: "string" } },
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

export async function executeWebSearch(query: string): Promise<ToolResult> {
  try {
    if (!query.trim()) throw new Error("Arama sorgusu boş olamaz.");
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query.slice(0, 300))}&format=json&no_html=1&skip_disambig=1`;
    assertSafeRemoteUrl(url);
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) throw new Error("Arama hizmeti yanıt vermedi.");
    const data = (await response.json()) as { AbstractText?: string; AbstractURL?: string; RelatedTopics?: Array<{ Text?: string; FirstURL?: string; Topics?: Array<{ Text?: string; FirstURL?: string }> }> };
    const sources = (data.RelatedTopics ?? []).flatMap((item) => item.Topics ?? [item]).filter((item) => item.Text && item.FirstURL).slice(0, 8).map((item) => `- ${item.Text}\n  ${item.FirstURL}`);
    const content = [data.AbstractText ? `Özet: ${data.AbstractText}${data.AbstractURL ? `\nKaynak: ${data.AbstractURL}` : ""}` : "", ...sources].filter(Boolean).join("\n\n");
    return { ok: true, content: content || "Arama tamamlandı; sınırlı yapılandırılmış sonuç döndü.", metadata: { sourceCount: sources.length } };
  } catch (error) {
    return { ok: false, content: "", error: safeErrorMessage(error) };
  }
}

export function makeArtifactName(instruction: string): string {
  const tokens = instruction.split(/\s+/).slice(0, 5).join("-");
  return sanitizeFileName(tokens || "agent-output", "agent-output.md").replace(/\.(?!md$)[^.]+$/, "") + ".md";
}
