# Güvenlik

Bu belge uygulanmış güvenlik önlemlerini ve bilinen sınırları anlatır. İddialar koda karşılık gelir (`lib/agent/security.ts`, `mcp.ts`, `storage.ts`, `agent-provider.tsx`).

## Kimlik bilgileri

- Mobilde `expo-secure-store` (Keychain/Keystore, `WHEN_UNLOCKED_THIS_DEVICE_ONLY`). Web önizlemesinde yalnızca oturumluk `sessionStorage` — üretim anahtarları için önerilmez.
- Anahtarlar `AppState`, olay günlükleri, mesajlar veya artifact'lerden **ayrıdır**; yalnızca `CredentialManager` üzerinden erişilir.
- `redactSensitive` / `safeErrorMessage`, hata mesajlarında ve günlüklerde `sk-…`, `AIza…`, `Bearer …` kalıplarını `[REDACTED]` ile maskeler ve mesajı kısaltır.

## Ağ / SSRF

`assertSafeRemoteUrl` (web araştırması ve MCP endpoint ekleme + keşif için zorunlu):

- Yalnızca `https:`.
- URL'de kullanıcı adı/parola yasak.
- `localhost`, `127.0.0.1`, `0.0.0.0`, `::1`, `::`, `169.254.169.254`, `metadata.google.internal`, `*.local`, `*.internal` yasak.
- Özel IPv4 blokları (`10.`, `192.168.`, `172.16–31.`), loopback `127.`, link-local `169.254.` ve **CGNAT `100.64/10`** yasak.
- IPv6 unique-local (`fc00::/7`) ve link-local (`fe80::/10`) yasak; **IPv4-eşlemeli IPv6** (`::ffff:…`, nokta veya hex biçimi) reddedilir.

MCP sunucusu **eklenirken** doğrulanır (yalnızca keşifte değil).

## MCP keşif ve yaşam döngüsü sertleştirmesi

- `tools/list` yanıtı güvenilmeyen içeriktir: araç adları güvenli tanımlayıcıya zorlanır (`isValidMcpToolName`), yinelenenler tekilleştirilir, sunucu başına 100 araçla sınırlanır, yanıt gövdesi 1 MB ile bağlanır, geçersiz JSON reddedilir (fail-closed).
- Devre dışı veya kaldırılmış bir sunucunun araçları katalogda görünmez ve çağrılamaz; yeniden keşif eski araç id'lerini registry'den düşürür (`replaceMcpServerTools`). Ayrıntı: `MCP.md`.

## Yetenek (skill) manifest güvenliği

- Kullanıcı tanımlı yetenek **yalnızca talimat metnidir** — kod taşımaz ve çalıştırılmaz.
- `validateSkillInput` zorunlu alanları ve boyut sınırlarını fail-closed doğrular (ad ≤ 80, açıklama ≤ 300, talimat ≤ 8000, ≤ 24 tetikleyici/araç). `makeCustomSkill` ayrıca savunma amaçlı sınırlara **kırpar** ve `version`/`source: "user"`/`installedAt` damgalar.
- Yetenek talimatları system policy'yi değiştiremez, izinleri sessizce veremez, kimlik bilgisi açığa çıkaramaz; göreve uygun uzmanlık talimatı olarak, güvenilmeyen içerik sınırında enjekte edilir.

## Prompt injection ve tool poisoning

- Web sonuçları, MCP kaynakları/araç açıklamaları ve tool çıktıları **veri** olarak ele alınır; sistem talimatı olarak yorumlanmaz.
- Model system prompt'u dış metni açıkça "güvenilmeyen veri" olarak işaretler ve içindeki komutların yürütülmemesini şart koşar.
- MCP araç adları/açıklamaları asla çalıştırılabilir talimat değildir; yalnızca registry meta verisidir.
- MCP tool çağrı sonuçları 20 KB'a kesilir ve daima veri olarak gösterilir.

## İzin kapısı

Risk seviyeleri `low | medium | high | critical`. Kapı `web.search`, `filesystem.writeMarkdown` gibi işlemleri kullanıcı kararına sunar: **Bu kez izin ver / Bu proje için izin ver / Reddet**. `high`/`critical` işlemler proje geneli "allow" ile otomatik geçmez. MCP tool çalıştırma kullanıcı tetiklidir (açık rıza).

## Alt-agent'lar

- Alt-agent'lar yalnızca rollerinin **salt-okunur** araçlarına erişir; dosya yazma, issue/e-posta ve `agent.spawn` kapsam dışıdır.
- Özyineleme yapısal olarak engellenir: alt-agent kataloğu spawn içermez ve alt-agent'lar temel dispatcher'ı kullanır. Çalışma başına en fazla 4 alt-agent, küçük adım/araç bütçesiyle.
- `agent.spawn` çağrısı izin kapısından geçer (devretme onay noktası); alt-agent sonuçları güvenilmeyen veri olarak ele alınır.

## Girdi güvenliği

- `sanitizeFileName` path traversal'i (`../`), gizli karakterleri ve ayırıcıları temizler; artifact'ler yalnızca aktif workspace sandbox'ına yazılır.
- `safeCalculate` yalnızca aritmetik karakter kabul eder; `eval` veya kod yürütme yoktur (shunting-yard ile yerelde hesaplar).

## Hata ve yeniden deneme güvenliği

- `withRetry` yalnızca geçici (retryable) hatalarda yeniden dener; auth/client hataları anında yükselir.
- Yıkıcı/idempotent-olmayan işlemler (dosya yazımı) yeniden denenmez.
- Model streaming yalnızca delta yayınlanmadan önce yeniden denenir; kısmi yanıt asla tekrarlanmaz.

## Bilinen sınırlar

- Web sessionStorage güvenli enclave değildir; yalnızca önizleme içindir.
- MCP OAuth 2.1/PKCE henüz yok; OAuth korumalı sunucular açık yetkilendirme hatası verir (uydurma OAuth yoktur).
- İçerik güvenlik taraması (ör. zararlı MCP yanıtının derin analizi) temel düzeydedir; izin kapısı ve veri-olarak-ele-alma birincil savunmadır.

## Zafiyet bildirimi

Güvenlik sorunlarını herkese açık issue yerine depo sahibine özel olarak bildirin.
