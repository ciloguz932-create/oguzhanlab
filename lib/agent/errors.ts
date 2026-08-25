export type ErrorKind = "auth" | "rate_limit" | "quota" | "network" | "timeout" | "server" | "aborted" | "client" | "unknown";

/**
 * Structured error for provider/tool/MCP failures. Carries a stable `kind` and a
 * `retryable` hint so the runtime can decide whether an automatic retry is safe,
 * without string-matching localized messages.
 */
export class AgentError extends Error {
  readonly kind: ErrorKind;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(message: string, kind: ErrorKind, options?: { status?: number; retryable?: boolean }) {
    super(message);
    this.name = "AgentError";
    this.kind = kind;
    this.status = options?.status;
    this.retryable = options?.retryable ?? defaultRetryable(kind);
  }
}

function defaultRetryable(kind: ErrorKind): boolean {
  return kind === "rate_limit" || kind === "network" || kind === "timeout" || kind === "server";
}

// Substrings providers use (in the error response body) to signal that the account
// has run out of credits/quota, as opposed to a transient too-many-requests limit.
// Matched case-insensitively; kept broad since each provider phrases this differently
// (OpenAI: "insufficient_quota"; Anthropic: "credit balance"; Gemini: billing/quota
// violations in RESOURCE_EXHAUSTED; OpenRouter: "credits"/"balance").
const QUOTA_EXHAUSTED_PATTERN = /insufficient_quota|out of credits|credit balance|add.*credit|purchase.*credit|billing|payment required|exceeded.*quota|quota.*exceeded/i;

/**
 * Maps an HTTP status (plus, when available, the raw response body) to a structured
 * AgentError with a localized user-facing message. `detail` is used only to classify
 * the failure — its raw text is never surfaced to the user, so it can safely be a
 * response body that might echo back input.
 */
export function httpError(status: number, detail?: string): AgentError {
  if (status === 401 || status === 403) {
    return new AgentError("Kimlik doğrulama başarısız oldu. Anahtarı ve erişim izinlerini kontrol edin.", "auth", { status, retryable: false });
  }
  const quotaExhausted = status === 402 || (status === 429 && !!detail && QUOTA_EXHAUSTED_PATTERN.test(detail));
  if (quotaExhausted) {
    return new AgentError(
      "Bu anahtarın kredisi/kotası bitmiş görünüyor. Sağlayıcının panelinden bakiye veya faturalandırma ekleyin ya da başka bir anahtar deneyin. Tekrar denemek bu hatayı çözmez.",
      "quota",
      { status, retryable: false },
    );
  }
  if (status === 429) {
    return new AgentError("Sağlayıcı istek sınırına ulaştı (çok hızlı/çok istek). Birkaç saniye bekleyip tekrar deneyin.", "rate_limit", { status });
  }
  if (status >= 500) {
    return new AgentError("Sağlayıcı geçici bir hata döndürdü.", "server", { status });
  }
  return new AgentError("Sağlayıcı isteği tamamlanamadı.", "client", { status, retryable: false });
}

/**
 * Classifies any thrown value into an AgentError. Recognizes fetch network
 * failures (TypeError) and abort signals so the runtime treats them correctly.
 */
export function classifyError(error: unknown): AgentError {
  if (error instanceof AgentError) return error;
  if (error instanceof DOMException && error.name === "AbortError") {
    return new AgentError("İşlem durduruldu.", "aborted", { retryable: false });
  }
  if (error instanceof TypeError) {
    // fetch() rejects with a TypeError on DNS/connection/TLS failures.
    return new AgentError("Ağ bağlantısı kurulamadı.", "network");
  }
  const message = error instanceof Error ? error.message : "Beklenmeyen hata";
  return new AgentError(message, "unknown", { retryable: false });
}

/** Exponential backoff with full jitter, capped. Deterministic bounds are testable. */
export function backoffDelayMs(attempt: number, baseMs = 400, capMs = 8000, random: () => number = Math.random): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt));
  return Math.round(exp / 2 + random() * (exp / 2));
}

/** Abortable sleep. Rejects with an AbortError if the signal fires while waiting. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    }, { once: true });
  });
}

export interface RetryOptions {
  retries: number;
  signal?: AbortSignal;
  onRetry?: (error: AgentError, attempt: number, delayMs: number) => void;
  random?: () => number;
  baseMs?: number;
}

/**
 * Runs `fn` and retries only on transient (retryable) errors, honoring an abort
 * signal and a fixed attempt budget. Non-retryable errors (auth, client, aborted)
 * propagate immediately. Never call this around a non-idempotent side effect.
 */
export async function withRetry<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  let attempt = 0;
  for (;;) {
    try {
      return await fn(attempt);
    } catch (raw) {
      const error = classifyError(raw);
      if (!error.retryable || attempt >= options.retries || options.signal?.aborted) throw error;
      const delay = backoffDelayMs(attempt, options.baseMs ?? 400, 8000, options.random);
      options.onRetry?.(error, attempt + 1, delay);
      await sleep(delay, options.signal);
      attempt += 1;
    }
  }
}
