import { safeErrorMessage } from "./security";
import type { ProviderAdapter, ProviderId, ProviderMessage, ProviderModel, ProviderResponse, ProviderUsage } from "./types";

const OPENAI_MODELS: ProviderModel[] = [
  { id: "gpt-4o-mini", label: "GPT-4o mini", capabilities: ["chat", "streaming", "tools"] },
  { id: "gpt-4.1-mini", label: "GPT-4.1 mini", capabilities: ["chat", "streaming", "tools"] },
];
const ANTHROPIC_MODELS: ProviderModel[] = [
  { id: "claude-3-5-haiku-latest", label: "Claude Haiku", capabilities: ["chat", "streaming"] },
  { id: "claude-sonnet-4-0", label: "Claude Sonnet", capabilities: ["chat", "streaming", "reasoning"] },
];

function responseError(status: number): Error {
  if (status === 401 || status === 403) return new Error("Kimlik doğrulama başarısız oldu. Anahtarı ve erişim izinlerini kontrol edin.");
  if (status === 429) return new Error("Sağlayıcı istek sınırına ulaştı. Biraz sonra yeniden deneyin.");
  return new Error("Sağlayıcı isteği tamamlanamadı.");
}

async function parseOpenAiStream(response: Response, onDelta: (delta: string) => void): Promise<ProviderUsage | undefined> {
  if (!response.body) throw new Error("Akış yanıtı alınamadı.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffered = "";
  let usage: ProviderUsage | undefined;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffered += decoder.decode(value, { stream: true });
    const lines = buffered.split("\n");
    buffered = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const data = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
        const delta = data.choices?.[0]?.delta?.content;
        if (delta) onDelta(delta);
        if (data.usage) usage = { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens };
      } catch {
        // Malformed upstream events are ignored; the final stream remains authoritative.
      }
    }
  }
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

  async listModels(key: string): Promise<ProviderModel[]> {
    const response = await fetch(`${this.baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!response.ok) throw responseError(response.status);
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
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      signal: input.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.key}` },
      body: JSON.stringify({ model: input.model, messages: input.messages, temperature: 0.2 }),
    });
    if (!response.ok) throw responseError(response.status);
    const body = (await response.json()) as { choices?: Array<{ message?: { content?: string } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
    return {
      content: body.choices?.[0]?.message?.content ?? "",
      usage: body.usage ? { inputTokens: body.usage.prompt_tokens, outputTokens: body.usage.completion_tokens } : undefined,
    };
  }

  async stream(input: { key: string; model: string; messages: ProviderMessage[]; onDelta: (delta: string) => void; signal?: AbortSignal }): Promise<ProviderUsage | undefined> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      signal: input.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.key}` },
      body: JSON.stringify({ model: input.model, messages: input.messages, temperature: 0.2, stream: true, stream_options: { include_usage: true } }),
    });
    if (!response.ok) throw responseError(response.status);
    return parseOpenAiStream(response, input.onDelta);
  }
}

class AnthropicAdapter implements ProviderAdapter {
  readonly id = "anthropic" as const;
  readonly label = "Anthropic";

  detectKey(key: string): boolean {
    return /^sk-ant-[A-Za-z0-9_-]{12,}/.test(key.trim());
  }

  async listModels(key: string): Promise<ProviderModel[]> {
    const response = await fetch("https://api.anthropic.com/v1/models?limit=100", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (!response.ok) throw responseError(response.status);
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
    const system = input.messages.filter((message) => message.role === "system").map((message) => message.content).join("\n");
    const messages = input.messages.filter((message) => message.role !== "system").map((message) => ({ role: message.role, content: message.content }));
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: input.signal,
      headers: { "Content-Type": "application/json", "x-api-key": input.key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: input.model, max_tokens: 3000, system, messages }),
    });
    if (!response.ok) throw responseError(response.status);
    const body = (await response.json()) as { content?: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } };
    return { content: body.content?.filter((item) => item.type === "text").map((item) => item.text ?? "").join("") ?? "", usage: body.usage ? { inputTokens: body.usage.input_tokens, outputTokens: body.usage.output_tokens } : undefined };
  }

  async stream(input: { key: string; model: string; messages: ProviderMessage[]; onDelta: (delta: string) => void; signal?: AbortSignal }): Promise<ProviderUsage | undefined> {
    const result = await this.generate(input);
    input.onDelta(result.content);
    return result.usage;
  }
}

export class ProviderRegistry {
  private readonly adapters: ProviderAdapter[] = [
    new OpenAiCompatibleAdapter("openrouter", "OpenRouter", "https://openrouter.ai/api/v1", (key) => /^sk-or-v1-[A-Za-z0-9_-]+/.test(key)),
    new OpenAiCompatibleAdapter("openai", "OpenAI", "https://api.openai.com/v1", (key) => /^sk-(?!ant-|or-v1-)[A-Za-z0-9_-]{12,}/.test(key)),
    new AnthropicAdapter(),
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
