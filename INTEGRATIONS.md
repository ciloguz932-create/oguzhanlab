# Entegrasyonlar

Entegrasyonlar, token tabanlı harici servisleri **native araçlar** olarak agent'ın merkezi ToolRegistry'sine ekler. Bunlar MCP'den farklıdır: doğrudan HTTP API çağrıları yapar, OAuth gerektirmez ve tokenlar cihazın güvenli credential katmanında saklanır (`lib/agent/integrations.ts`).

## Akış

```
Ayarlar → Entegrasyonlar → Bağlan (token gir)
        ↓ validateIntegrationToken (mümkünse)
   token güvenli depoya kaydedilir, connected + enabled
        ↓
Araçlar ToolRegistry'de görünür → agent otonom olarak seçer
        ↓ izin kapısı (yazma işlemleri HIGH)
   integration.execute(toolId, args, token) → gerçek API çağrısı
        ↓
   sonuç güvenilmeyen veri olarak transcripte eklenir
```

Entegrasyon araçları yalnızca ilgili entegrasyon **bağlı ve etkin** olduğunda agent kataloğuna girer; çevrimdışı modda tümü devre dışı kalır.

## Yerleşik entegrasyonlar

### GitHub (Personal Access Token)

Gerçek GitHub REST API (`api.github.com`). OAuth gerekmez.

| Araç | Risk | Açıklama |
|---|---|---|
| `github.search_repositories` | low | Depo arama |
| `github.get_repo` | low | Depo özeti |
| `github.list_issues` | low | Açık issue listesi |
| `github.read_file` | medium | Dosya içeriği (base64 → UTF-8) |
| `github.create_issue` | high | Yeni issue açar (izin gerektirir) |

Token: github.com → Settings → Developer settings → Personal access tokens (fine-grained veya classic). Bağlanırken `/user` ile doğrulanır.

### E-posta (Resend API Key)

Gerçek transactional e-posta gönderimi (`api.resend.com`). OAuth gerekmez.

| Araç | Risk | Açıklama |
|---|---|---|
| `email.send` | high | from/to/subject/text ile gerçek e-posta gönderir (izin gerektirir) |

`from` adresi Resend'de doğrulanmış bir alan adı olmalıdır; aksi halde Resend'in döndürdüğü hata dürüstçe yüzeye çıkarılır. Anahtar cihazda saklanır.

## Web araştırması (token'sız)

- `web.search` — DuckDuckGo Instant Answer ile başlangıç kaynakları (native).
- `web.fetch` — bir HTTPS URL'sini getirir ve okunabilir metne dönüştürür (native, SSRF korumalı). Derin Araştırma yeteneği önce arar, sonra umut vaadeden sayfaları getirir.

## OAuth gerektiren servisler (Gmail, Google Drive, …)

Bu servisler yalnızca API anahtarıyla özel verilere erişemez; OAuth 2.0 gerektirir. Uygulama backend'siz ve local-first olduğundan bu akış **planlıdır** (MCP OAuth 2.1/PKCE ile birlikte). Bugün bu servisleri kullanmak için:

1. İlgili servisin bir **MCP sunucusunu** MCP ekranından bağlayın (Bearer token destekli), veya
2. OAuth desteği geldiğinde native entegrasyon olarak eklenecektir.

Uydurma bir API-anahtarı yolu sunulmaz.

## Güvenlik

- Tokenlar yalnızca `CredentialManager` üzerinden; `AppState`, olay günlüğü veya artifact'lerde asla saklanmaz.
- Yazma işlemleri (issue oluşturma, e-posta gönderme) HIGH risklidir ve izin kapısından geçer.
- API yanıtları güvenilmeyen veri olarak ele alınır ve boyut sınırıyla kesilir.
- Sabit hostlara (api.github.com, api.resend.com) gidilir; `web.fetch` keyfi URL'ler için `assertSafeRemoteUrl` ile korunur.
