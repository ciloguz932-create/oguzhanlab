import { AgentError, type ErrorKind } from "./errors";

/**
 * Normalized, user-facing failure taxonomy for the whole app. Every provider/tool/UX
 * failure resolves to exactly one FailureState with a stable `code`, a safe Turkish
 * `message` (never containing secrets or raw provider bodies), a concrete `recovery`
 * action, and machine flags the runtime uses: whether a retry can help (`retrySafe`),
 * whether the user must confirm to proceed (`needsConfirmation`), and a redacted
 * `category` safe to write to logs/analytics.
 *
 * This is the single source of truth referenced by API_KEY_FAILURE_MATRIX.md.
 */
export type FailureCode =
  | "no_provider"
  | "provider_not_selected"
  | "malformed_key"
  | "credential_rejected"
  | "model_unavailable"
  | "rate_limited"
  | "quota_exhausted"
  | "network_unavailable"
  | "timeout"
  | "provider_error"
  | "streaming_interrupted"
  | "malformed_response"
  | "insufficient_permission"
  | "unsupported_feature"
  | "offline_mode"
  | "local_storage_failure"
  | "cancelled"
  | "unknown";

export interface FailureState {
  code: FailureCode;
  /** Safe, user-facing Turkish message. Never includes a key, token, or raw HTTP body. */
  message: string;
  /** Concrete recovery action the user can take. */
  recovery: string;
  /** Whether retrying the same operation can plausibly succeed. */
  retrySafe: boolean;
  /** Whether the user must make a choice/confirm before proceeding. */
  needsConfirmation: boolean;
  /** Redacted diagnostic category, safe to log. */
  category: string;
}

export const FAILURES: Record<FailureCode, FailureState> = {
  no_provider: {
    code: "no_provider",
    message: "Henüz bir AI sağlayıcısı bağlı değil. Yerel çalışma alanı, notlar ve geçmiş kullanılabilir; model üretimi bağlantı gerektirir.",
    recovery: "Connect AI'dan bir sağlayıcı anahtarı ekleyin ya da çevrimdışı devam edin.",
    retrySafe: false,
    needsConfirmation: true,
    category: "config.no_provider",
  },
  provider_not_selected: {
    code: "provider_not_selected",
    message: "Sağlayıcı otomatik algılanamadı.",
    recovery: "Listeden sağlayıcıyı elle seçip yeniden deneyin.",
    retrySafe: false,
    needsConfirmation: true,
    category: "config.provider_not_selected",
  },
  malformed_key: {
    code: "malformed_key",
    message: "Anahtar biçimi tanınmadı.",
    recovery: "Anahtarı kontrol edin veya sağlayıcıyı elle seçerek doğrulamayı yetkili kılın.",
    retrySafe: false,
    needsConfirmation: true,
    category: "config.malformed_key",
  },
  credential_rejected: {
    code: "credential_rejected",
    message: "Kimlik doğrulama başarısız oldu (anahtar reddedildi).",
    recovery: "Anahtarın geçerli ve yetkili olduğundan emin olun; gerekirse yeni bir anahtar oluşturun.",
    retrySafe: false,
    needsConfirmation: true,
    category: "auth.rejected",
  },
  model_unavailable: {
    code: "model_unavailable",
    message: "Seçilen model bu anahtarla kullanılamıyor.",
    recovery: "Sağlayıcılar ekranından başka bir model seçin.",
    retrySafe: false,
    needsConfirmation: true,
    category: "model.unavailable",
  },
  rate_limited: {
    code: "rate_limited",
    message: "Sağlayıcı istek sınırına ulaştı (çok hızlı/çok istek).",
    recovery: "Birkaç saniye bekleyip tekrar deneyin. Ne zaman açılacağı garanti edilemez.",
    retrySafe: true,
    needsConfirmation: false,
    category: "provider.rate_limited",
  },
  quota_exhausted: {
    code: "quota_exhausted",
    message: "Bu anahtarın kredisi/kotası bitmiş görünüyor.",
    recovery: "Sağlayıcı panelinden bakiye/faturalandırma ekleyin ya da başka bir anahtar kullanın. Tekrar denemek çözmez.",
    retrySafe: false,
    needsConfirmation: true,
    category: "provider.quota_exhausted",
  },
  network_unavailable: {
    code: "network_unavailable",
    message: "Ağ bağlantısı kurulamadı.",
    recovery: "İnternet bağlantınızı kontrol edip tekrar deneyin.",
    retrySafe: true,
    needsConfirmation: false,
    category: "net.unavailable",
  },
  timeout: {
    code: "timeout",
    message: "İstek zaman aşımına uğradı.",
    recovery: "Tekrar deneyin; sorun sürerse daha küçük bir istekle deneyin.",
    retrySafe: true,
    needsConfirmation: false,
    category: "net.timeout",
  },
  provider_error: {
    code: "provider_error",
    message: "Sağlayıcı geçici bir hata döndürdü.",
    recovery: "Kısa süre sonra tekrar deneyin.",
    retrySafe: true,
    needsConfirmation: false,
    category: "provider.server_error",
  },
  streaming_interrupted: {
    code: "streaming_interrupted",
    message: "Akış yarıda kesildi; yanıt tamamlanmadı.",
    recovery: "Görevi yeniden çalıştırın; kısmi yanıt tekrarlanmaz.",
    retrySafe: true,
    needsConfirmation: false,
    category: "provider.stream_interrupted",
  },
  malformed_response: {
    code: "malformed_response",
    message: "Sağlayıcı yanıtı çözümlenemedi.",
    recovery: "Tekrar deneyin; sorun sürerse farklı bir model deneyin.",
    retrySafe: true,
    needsConfirmation: false,
    category: "provider.malformed_response",
  },
  insufficient_permission: {
    code: "insufficient_permission",
    message: "Bu işlem için gerekli izin verilmedi.",
    recovery: "İşlemi onaylayın ya da alternatif bir yaklaşım seçin.",
    retrySafe: false,
    needsConfirmation: true,
    category: "policy.permission_denied",
  },
  unsupported_feature: {
    code: "unsupported_feature",
    message: "Bu özellik bu sürümde desteklenmiyor.",
    recovery: "Desteklenen bir alternatif kullanın (ayrıntı için ilgili ekran/belgeler).",
    retrySafe: false,
    needsConfirmation: false,
    category: "feature.unsupported",
  },
  offline_mode: {
    code: "offline_mode",
    message: "Çevrimdışı moddasınız; ağ gerektiren araçlar durduruldu.",
    recovery: "Ayarlar'dan çevrimdışı modu kapatın ya da yerel araçlarla devam edin.",
    retrySafe: false,
    needsConfirmation: false,
    category: "mode.offline",
  },
  local_storage_failure: {
    code: "local_storage_failure",
    message: "Yerel veriye erişilemedi.",
    recovery: "Uygulamayı yeniden açın; sorun sürerse cihaz depolamasını kontrol edin.",
    retrySafe: true,
    needsConfirmation: false,
    category: "storage.local_failure",
  },
  cancelled: {
    code: "cancelled",
    message: "İşlem durduruldu.",
    recovery: "Gerekirse görevi yeniden başlatın.",
    retrySafe: false,
    needsConfirmation: false,
    category: "runtime.cancelled",
  },
  unknown: {
    code: "unknown",
    message: "Beklenmeyen bir hata oluştu.",
    recovery: "Tekrar deneyin; sorun sürerse ayrıntılı günlüğü kontrol edin.",
    retrySafe: false,
    needsConfirmation: false,
    category: "runtime.unknown",
  },
};

/** Returns the FailureState for a stable code. */
export function failure(code: FailureCode): FailureState {
  return FAILURES[code];
}

const KIND_TO_CODE: Record<ErrorKind, FailureCode> = {
  auth: "credential_rejected",
  rate_limit: "rate_limited",
  quota: "quota_exhausted",
  network: "network_unavailable",
  timeout: "timeout",
  server: "provider_error",
  aborted: "cancelled",
  client: "malformed_response",
  unknown: "unknown",
};

/**
 * Maps any thrown value to a normalized FailureState. AgentError is mapped by its
 * structured `kind`; an AbortError maps to `cancelled`; anything else is `unknown`.
 * The raw error text is never surfaced — only the taxonomy's safe message.
 */
export function failureFromError(error: unknown): FailureState {
  if (error instanceof AgentError) return FAILURES[KIND_TO_CODE[error.kind]];
  if (error instanceof DOMException && error.name === "AbortError") return FAILURES.cancelled;
  return FAILURES.unknown;
}
