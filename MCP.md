# MCP Entegrasyonu

MCP (Model Context Protocol) bu üründe isteğe bağlı bir eklenti değil, temel genişletme mekanizmalarından biridir. Uygulama bir **MCP istemcisi** olarak çalışır.

## Desteklenen transport

- **Streamable HTTP** (tek endpoint'e POST; JSON veya `text/event-stream` yanıt). `lib/agent/mcp.ts`.
- `stdio` bu mobil sürümde desteklenmez (platform kısıtı; sözleşme hazırdır).

## Akış

```
Sunucu ekle (HTTPS doğrulanır)
        ↓
Araçları keşfet ──▶ initialize (best-effort, Mcp-Session-Id yakalanır)
        ↓            + MCP-Protocol-Version başlığı
   tools/list
        ↓
ToolRegistry'ye kayıt  (id = mcp.<serverId>.<toolName>, source="mcp", risk="medium")
        ↓
Aracı çalıştır  ──▶ tools/call { name, arguments }
        ↓
Sonuç (content[].text, 20 KB'a kesilir) — veri olarak gösterilir
```

Keşfedilen araçlar uygulama durumunda saklanır ve **yeniden başlatmada** in-memory registry'ye tekrar yüklenir.

## Kimlik doğrulama

| Tür | Durum |
|---|---|
| `none` (açık sunucu) | Desteklenir. |
| `bearer` (statik token) | Desteklenir; token cihazın güvenli credential katmanında saklanır, `Authorization: Bearer` başlığında taşınır. |
| `oauth-pkce` | **Planlı** — OAuth 2.1 + Protected Resource Metadata + PKCE tarayıcı dönüş akışı henüz uygulanmadı. OAuth korumalı sunucular açık `401` yetkilendirme hatası verir. Uydurma OAuth yoktur; adapter sözleşmesi (`McpAuthType`) hazırdır. |

## Güvenlik

- Endpoint eklenirken `assertSafeRemoteUrl` ile doğrulanır (yalnızca HTTPS, özel ağ/loopback yasak; ayrıntı `SECURITY.md`).
- Araç adları, açıklamaları ve sonuçları **güvenilmeyen veri**dir; asla sistem talimatı olarak yorumlanmaz (tool poisoning / prompt injection koruması — `SECURITY.md`).
- Tool çalıştırma kullanıcı tetiklidir; MCP sunucusu kullanıcı workspace'ine otomatik/sınırsız erişim kazanmaz.

### Keşif doğrulaması (fail-closed)

Keşfedilen `tools/list` yanıtı güvenilmeyen sunucu içeriğidir ve `discoverTools` içinde sıkı doğrulanır:

- **Araç adı** yalnızca güvenli, sınırlı bir tanımlayıcıysa kabul edilir (`^[A-Za-z0-9._-]{1,64}$` — `isValidMcpToolName`). Boş/uzun/güvensiz adlar **atılır**, adreslenebilir bir id'ye dönüşemez.
- Aynı sunucu içinde **yinelenen adlar tekilleştirilir** (bir ad iki id'ye eşlenemez).
- Sunucu başına en fazla **100 araç** keşfedilir; açıklamalar 500 karaktere kesilir.
- Yanıt gövdesi **1 MB** ile sınırlıdır (`content-length` başlığı ya da okunan metin); aşan yanıt reddedilir. Geçersiz JSON reddedilir.
- Namespaced id (`mcp.<serverId>.<toolName>`) çapraz-sunucu ve native çakışmayı yapısal olarak önler.

### Sunucu/araç yaşam döngüsü ve enable/disable

- Her sunucu için **etkin/devre dışı** anahtarı vardır (MCP ekranı). Devre dışı bir sunucunun araçları katalogdan (`buildCatalog`) düşürülür ve çağrıda reddedilir — yapılandırma/token silinmeden.
- Yeniden keşif, sunucunun araçlarını **değiştirir** (biriktirmez): kaldırılan/yeniden adlandırılan araçların eski id'leri registry'den düşer (`ToolRegistry.replaceMcpServerTools`).
- Sunucu kaldırıldığında araçları registry'den temizlenir ve saklı token silinir; kaldırılan sunucunun araçları artık sunulamaz/çağrılamaz.

## Otonom seçim (Phase 2 — uygulandı)

Keşfedilen MCP araçları native araçlarla **aynı katalogda** agent'a sunulur. Otonom agentic döngü (`orchestrator.ts`) sırasında model, hedefe uygun MCP aracını kendisi seçip çağırabilir; sonuç güvenilmeyen veri olarak transcripte eklenir ve model planını buna göre günceller. MCP ekranından manuel `tools/call` testi de mevcuttur.

## Referanslar

- [MCP — Transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [MCP — Authorization](https://modelcontextprotocol.io/specification/draft/basic/authorization)
