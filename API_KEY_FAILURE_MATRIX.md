# API Anahtarı / Sağlayıcı Hata Matrisi

Normalleştirilmiş hata durumları. Tek kaynak: `lib/agent/failures.ts` (`FAILURES`), yapısal
sağlayıcı hataları `lib/agent/errors.ts` (`AgentError.kind`) üzerinden eşlenir
(`failureFromError`). Kullanıcıya gösterilen mesajlar asla anahtar, token veya ham HTTP
gövdesi içermez; `redactSensitive`/`safeErrorMessage` maskelemesi ayrıca uygulanır.

| Kod | Ne zaman | Kullanıcı mesajı (özet) | Kurtarma | Retry güvenli? | Onay gerekir? | Log kategorisi |
|---|---|---|---:|:---:|:---:|---|
| `no_provider` | Hiç bağlantı yok | Yerel özellikler çalışır; üretim bağlantı ister | Connect AI / çevrimdışı devam | Hayır | Evet | `config.no_provider` |
| `provider_not_selected` | Anahtar biçimi algılanamadı | Sağlayıcıyı elle seçin | Çipten seç | Hayır | Evet | `config.provider_not_selected` |
| `malformed_key` | Anahtar biçimi tanınmadı | Anahtarı kontrol edin / elle seçin | Doğrulamayı yetkili kıl | Hayır | Evet | `config.malformed_key` |
| `credential_rejected` | 401/403 | Anahtar reddedildi | Geçerli/yeni anahtar | Hayır | Evet | `auth.rejected` |
| `model_unavailable` | Model bu anahtarla yok | Başka model seçin | Sağlayıcılar ekranı | Hayır | Evet | `model.unavailable` |
| `rate_limited` | 429 (geçici) | Çok hızlı/çok istek | Birkaç sn bekle | **Evet** | Hayır | `provider.rate_limited` |
| `quota_exhausted` | 402 / 429+kota gövdesi | Kredi/kota bitti | Bakiye ekle / başka anahtar | Hayır | Evet | `provider.quota_exhausted` |
| `network_unavailable` | fetch TypeError | Ağ kurulamadı | Bağlantıyı kontrol et | **Evet** | Hayır | `net.unavailable` |
| `timeout` | Zaman aşımı | İstek zaman aşımı | Tekrar dene | **Evet** | Hayır | `net.timeout` |
| `provider_error` | 5xx | Geçici sağlayıcı hatası | Sonra tekrar dene | **Evet** | Hayır | `provider.server_error` |
| `streaming_interrupted` | Akış yarıda kesildi | Yanıt tamamlanmadı | Yeniden çalıştır | **Evet** | Hayır | `provider.stream_interrupted` |
| `malformed_response` | Çözümlenemeyen yanıt | Yanıt çözümlenemedi | Tekrar/başka model | **Evet** | Hayır | `provider.malformed_response` |
| `insufficient_permission` | İzin reddi | İzin verilmedi | Onayla/alternatif | Hayır | Evet | `policy.permission_denied` |
| `unsupported_feature` | Desteklenmeyen özellik | Bu sürümde yok | Alternatif kullan | Hayır | Hayır | `feature.unsupported` |
| `offline_mode` | Çevrimdışı + ağ aracı | Ağ araçları durdu | Modu kapat/yerelde devam | Hayır | Hayır | `mode.offline` |
| `local_storage_failure` | Yerel depolama hatası | Yerel veriye erişilemedi | Uygulamayı aç | **Evet** | Hayır | `storage.local_failure` |
| `cancelled` | Kullanıcı durdurdu | İşlem durduruldu | Gerekirse yeniden başlat | Hayır | Hayır | `runtime.cancelled` |
| `unknown` | Sınıflandırılamayan | Beklenmeyen hata | Tekrar dene / log | Hayır | Hayır | `runtime.unknown` |

## Retry davranışı

`withRetry` (`lib/agent/errors.ts`) yalnızca `retrySafe` (retryable) hataları yeniden dener:
`rate_limited`, `network_unavailable`, `timeout`, `provider_error`. `quota_exhausted` ve
`credential_rejected` **yeniden denenmez** — tüketilmiş bir anahtarda döngü yakmaz.
`quota` vs `rate_limit` ayrımı yanıt gövdesinden yapılır (`httpError(status, detail)`), test:
`tests/agent-runtime.test.ts`. Taksonomi testleri: `tests/failures.test.ts`.

## Asla iddia edilmeyecekler

- Bir sağlayıcının "ücretsiz" olduğu veya rate-limit'in ne zaman açılacağı **söylenmez**.
- Kota/kimlik hatası "geçici" gibi gösterilmez; kurtarma adımı nettir.
- Ham hata gövdesi, header veya token kullanıcıya **gösterilmez**.
