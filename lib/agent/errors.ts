export type ErrorKind = "auth" | "rate_limit" | "network" | "timeout" | "server" | "aborted" | "client" | "unknown";

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

/** Maps an HTTP status to a structured AgentError with a localized user-facing message. */
export function httpError(status: number): AgentError {
  if (status === 401 || status === 403) {
    return new AgentError("Kimlik doğrulama başarısız oldu. Anahtarı ve erişim izinlerini kontrol edin.", "auth", { status, retryable: false });
  }
  if (status === 429) {
    return new AgentError("Sağlayıcı istek sınırına ulaştı. Biraz sonra yeniden deneyin.", "rate_limit", { status });
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
