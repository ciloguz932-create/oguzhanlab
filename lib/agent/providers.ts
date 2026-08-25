import { AgentError, httpError } from "./errors";
import { safeErrorMessage } from "./security";
import type { ProviderAdapter, ProviderId, ProviderMessage, ProviderModel, ProviderResponse, ProviderUsage } from "./types";

// Hard ceiling on any single provider HTTP request so a stalled connection can never
// leave a run stuck "running" forever. The timer is cleared as soon as the response
// headers arrive, so it bounds time-to-first-byte without cutting off a long stream body.
const REQUEST_TIMEOUT_MS = 90_000;

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const external = init.signal ?? undefined;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, REQUEST_TIMEOUT_MS);
  const forward = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", forward, { once: true });
  }
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (timedOut) throw new AgentError("Model zaman aşımına uğradı (yanıt gelmedi). Tekrar deneyin ya da Sağlayıcılar'dan daha hızlı bir model seçin.", "timeout");
    if (external?.aborted) throw new DOMException("Aborted", "AbortError");
    throw err;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", forward);
  }
}

const OPENAI_MODELS: ProviderModel[] = [
  { id: "gpt-4o-mini", label: "GPT-4o mini", capabilities: ["chat", "streaming", "tools"] },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", capabilities: ["chat", "streaming", "tools"] },
];
// Fallback list used only when GET /v1/models fails; the live list is preferred.
const ANTHROPIC_MODELS: ProviderModel[] = [
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5", capabilities: ["chat", "streaming", "vision"] },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5", capabilities: ["chat", "streaming", "reasoning", "vision"] },
  { id: "claude-opus-5", label: "Claude Opus 5", capabilities: ["chat", "streaming", "reasoning", "vision"] },
  { id: "claude-fable-5", label: "Claude Fable 5", capabilities: ["chat", "streaming", "reasoning", "vision"] },
];
const GEMINI_MODELS: ProviderModel[] = [
  { id: "gemini-1.5-flash", label: "Gemini 1.5 Flash", capabilities: ["chat", "streaming", "vision"] },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", capabilities: ["chat", "streaming", "reasoning", "vision"] },
];

/**
 * Reads a Server-Sent Events body line by line and hands each `data:` JSON payload
 * to `onEvent`. Shared by the OpenAI and Anthropic/Gemini streaming parsers so the
 * chunk-buffering logic lives in exactly one place.
 */
async function readSse(response: Response, onEvent: (payload: string) => void): Promise<void> {
  if (!response.body) throw new AgentError("Akış yanıtı alınamadı.", "server");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      onEvent(payload);
    }
  }
}

async function parseOpenAiStream(response: Response, onDelta: (delta: string) => void): Promise<ProviderUsage | undefined> {
  let usage: ProviderUsage | undefined;
  await readSse(response, (payload) => {
    try {
      const data = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
      const delta = data.choices?.[0]?.delta?.content;
      if (delta) onDelta(delta);
      if (data.usage) usage = { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens };
    } catch {
      // Malformed upstream events are ignored; the terminal usage frame remains authoritative.
    }
  });
  return usage;
}

class OpenAiCompatibleAdapter implements ProviderAdapter {
  constructor(
    public readonly id: ProviderId,
    public readonly label: string,
    private readonly baseUrl: string,
    private readonly keyMatcher: (key: string) => boolean,
  ) {}

  detectKey(key: string): boolean {
    return this.keyMatcher(key.trim());
  }

  // OpenRouter recommends HTTP-Referer + X-Title for attribution and reliable routing;
  // harmless for plain OpenAI. Content-Type is added by callers that send a body.
  private authHeaders(key: string): Record<string, string> {
    const base: Record<string, string> = { Authorization: `Bearer ${key}` };
    if (this.baseUrl.includes("openrouter.ai")) {
      base["HTTP-Referer"] = "https://oguzhanlab.app";
      base["X-Title"] = "OguzhanLab Agent";
    }
    return base;
  }

  async listModels(key: string): Promise<ProviderModel[]> {
    const response = await fetchWithTimeout(`${this.baseUrl}/models`, { headers: this.authHeaders(key) });
    if (!response.ok) throw httpError(response.status, await response.text().catch(() => undefined));
    const body = (await response.json()) as { data?: Array<{ id: string }> };
    const models = (body.data ?? []).slice(0, 80).map((item) => ({ id: item.id, label: item.id, capabilities: ["chat", "streaming", "tools"] as ProviderModel["capabilities"] }));
    return models.length ? models : OPENAI_MODELS;
  }

  async validateCredential(key: string): Promise<{ valid: boolean; reason?: string; models: ProviderModel[] }> {
    try {
      const models = await this.listModels(key);
      return { valid: true, models };
    } catch (error) {
      return { valid: false, reason: safeErrorMessage(error), models: [] };
    }
  }

  async generate(input: { key: string; model: string; messages: ProviderMessage[]; signal?: AbortSignal }): Promise<ProviderResponse> {
    const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      signal: input.signal,
      headers: { "Content-Type": "application/json", ...this.authHeaders(input.key) },
      body: JSON.stringify({ model: input.model, messages: input.messages, temperature: 0.2 }),
    });
    if (!response.ok) throw httpError(response.status, await response.text().catch(() => undefined));
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return {
      content: body.choices?.[0]?.message?.content ?? "",
      usage: body.usage ? { inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens } : undefined,
    };
  }

  async stream(input: { key: string; model: string; messages: ProviderMessage[]; onDelta: (delta: string) => void; signal?: AbortSignal }): Promise<ProviderUsage | undefined> {
    const response = await fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      signal: input.signal,
      headers: { "Content-Type": "application/json", ...this.authHeaders(input.key) },
      body: JSON.stringify({ model: input.model, messages: input.messages, temperature: 0.2, stream: true, stream_options: { include_usage: true } }),
    });
    if (!response.ok) throw httpError(response.status, await response.text().catch(() => undefined));
    return parseOpenAiStream(response, input.onDelta);
  }
}

function splitSystem(messages: ProviderMessage[]): { system: string; rest: Array<{ role: "user" | "assistant"; content: string }> } {
  const system = messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
  const rest = messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role as "user" | "assistant", content: message.content }));
  return { system, rest };
}

class AnthropicAdapter implements ProviderAdapter {
  readonly id = "anthropic" as const;
  readonly label = "Anthropic";
  private readonly headers = (key: string) => ({ "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" });

  detectKey(key: string): boolean {
    return /^sk-ant-[A-Za-z0-9_-]{12,}/.test(key.trim());
  }

  async listModels(key: string): Promise<ProviderModel[]> {
    const response = await fetchWithTimeout("https://api.anthropic.com/v1/models?limit=100", { headers: this.headers(key) });
    if (!response.ok) throw httpError(response.status, await response.text().catch(() => undefined));
    const body = (await response.json()) as { data?: Array<{ id: string; display_name?: string }> };
    const models = (body.data ?? []).map((item) => ({ id: item.id, label: item.display_name ?? item.id, capabilities: ["chat", "streaming"] as ProviderModel["capabilities"] }));
    return models.length ? models : ANTHROPIC_MODELS;
  }

  async validateCredential(key: string): Promise<{ valid: boolean; reason?: string; models: ProviderModel[] }> {
    try {
      return { valid: true, models: await this.listModels(key) };
    } catch (error) {
      return { valid: false, reason: safeErrorMessage(error), models: [] };
    }
  }

  async generate(input: { key: string; model: string; messages: ProviderMessage[]; signal?: AbortSignal }): Promise<ProviderResponse> {
    const { system, rest } = splitSystem(input.messages);
    const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: input.signal,
      headers: this.headers(input.key),
      body: JSON.stringify({ model: input.model, max_tokens: 3000, system, messages: rest }),
    });
    if (!response.ok) throw httpError(response.status, await response.text().catch(() => undefined));
    const body = (await response.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    return {
      content: body.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("") ?? "",
      usage: body.usage ? { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens } : undefined,
    };
  }

  async stream(input: { key: string; model: string; messages: ProviderMessage[]; onDelta: (delta: string) => void; signal?: AbortSignal }): Promise<ProviderUsage | undefined> {
    const { system, rest } = splitSystem(input.messages);
    const response = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: input.signal,
      headers: this.headers(input.key),
      body: JSON.stringify({ model: input.model, max_tokens: 3000, system, messages: rest, stream: true }),
    });
    if (!response.ok) throw httpError(response.status, await response.text().catch(() => undefined));
    let inputTokens: number | undefined;
    let outputTokens: number | undefined;
    await readSse(response, (payload) => {
      try {
        const event = JSON.parse(payload) as {
          type?: string;
          delta?: { type?: string; text?: string };
          message?: { usage?: { input_tokens?: number; output_tokens?: number } };
          usage?: { output_tokens?: number };
        };
        if (event.type === "content_block_delta" && event.delta?.type === "text_delta" && event.delta.text) input.onDelta(event.delta.text);
        if (event.type === "message_start" && event.message?.usage) {
          inputTokens = event.message.usage.input_tokens;
          outputTokens = event.message.usage.output_tokens;
        }
        if (event.type === "message_delta" && event.usage?.output_tokens !== undefined) outputTokens = event.usage.output_tokens;
      } catch {
        // Ignore malformed frames; the final message_delta carries authoritative usage.
      }
    });
    return inputTokens === undefined && outputTokens === undefined ? undefined : { inputTokens, outputTokens };
  }
}

class GeminiAdapter implements ProviderAdapter {
  readonly id = "gemini" as const;
  readonly label = "Google Gemini";
  private readonly base = "https://generativelanguage.googleapis.com/v1beta";
  private readonly headers = (key: string) => ({ "Content-Type": "application/json", "x-goog-api-key": key });

  detectKey(key: string): boolean {
    return /^AIza[A-Za-z0-9_-]{30,}$/.test(key.trim());
  }

  async listModels(key: string): Promise<ProviderModel[]> {
    const response = await fetchWithTimeout(`${this.base}/models`, { headers: this.headers(key) });
    if (!response.ok) throw httpError(response.status, await response.text().catch(() => undefined));
    const body = (await response.json()) as { models?: Array<{ name: string; displayName?: string; supportedGenerationMethods?: string[] }> };
    const models = (body.models ?? [])
      .filter((item) => item.supportedGenerationMethods?.includes("generateContent"))
      .map((item) => {
        const id = item.name.replace(/^models\//, "");
        const caps: ProviderModel["capabilities"] = ["chat", "streaming", "vision"];
        if (/pro/i.test(id)) caps.push("reasoning");
        return { id, label: item.displayName ?? id, capabilities: caps };
      });
    return models.length ? models : GEMINI_MODELS;
  }

  async validateCredential(key: string): Promise<{ valid: boolean; reason?: string; models: ProviderModel[] }> {
    try {
      return { valid: true, models: await this.listModels(key) };
    } catch (error) {
      return { valid: false, reason: safeErrorMessage(error), models: [] };
    }
  }

  private buildBody(messages: ProviderMessage[]) {
    const { system, rest } = splitSystem(messages);
    const contents = rest.map((message) => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] }));
    return { contents, ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), generationConfig: { temperature: 0.2, maxOutputTokens: 3000 } };
  }

  async generate(input: { key: string; model: string; messages: ProviderMessage[]; signal?: AbortSignal }): Promise<ProviderResponse> {
    const response = await fetchWithTimeout(`${this.base}/models/${encodeURIComponent(input.model)}:generateContent`, {
      method: "POST",
      signal: input.signal,
      headers: this.headers(input.key),
      body: JSON.stringify(this.buildBody(input.messages)),
    });
    if (!response.ok) throw httpError(response.status, await response.text().catch(() => undefined));
    const body = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
    };
    const content = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
    return { content, usage: body.usageMetadata ? { inputTokens: body.usageMetadata.promptTokenCount, outputTokens: body.usageMetadata.candidatesTokenCount } : undefined };
  }

  async stream(input: { key: string; model: string; messages: ProviderMessage[]; onDelta: (delta: string) => void; signal?: AbortSignal }): Promise<ProviderUsage | undefined> {
    const response = await fetchWithTimeout(`${this.base}/models/${encodeURIComponent(input.model)}:streamGenerateContent?alt=sse`, {
      method: "POST",
      signal: input.signal,
      headers: this.headers(input.key),
      body: JSON.stringify(this.buildBody(input.messages)),
    });
    if (!response.ok) throw httpError(response.status, await response.text().catch(() => undefined));
    let usage: ProviderUsage | undefined;
    await readSse(response, (payload) => {
      try {
        const event = JSON.parse(payload) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
          usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
        };
        const text = event.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
        if (text) input.onDelta(text);
        if (event.usageMetadata) usage = { inputTokens: event.usageMetadata.promptTokenCount, outputTokens: event.usageMetadata.candidatesTokenCount };
      } catch {
        // Ignore malformed frames.
      }
    });
    return usage;
  }
}

export class ProviderRegistry {
  private readonly adapters: ProviderAdapter[] = [
    new OpenAiCompatibleAdapter("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", (key) => /^sk-or-v1-[A-Za-z0-9_-]+/.test(key)),
    new OpenAiCompatibleAdapter("openai", "OpenAI", "https://api.openai.com/v1", (key) => /^sk-(?!ant-|or-v1-)[A-Za-z0-9_-]{12,}/.test(key)),
    new AnthropicAdapter(),
    new GeminiAdapter(),
  ];

  detect(key: string): ProviderAdapter | undefined {
    return this.adapters.find((adapter) => adapter.detectKey(key));
  }

  get(provider: ProviderId): ProviderAdapter | undefined {
    return this.adapters.find((adapter) => adapter.id === provider);
  }

  getSupported(): Array<Pick<ProviderAdapter, "id" | "label">> {
    return this.adapters.map(({ id, label }) => ({ id, label }));
  }
}
