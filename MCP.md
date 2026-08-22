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

- Endpoint eklenirken `assertSafeRemoteUrl` ile doğrulanır (yalnızca HTTPS, özel ağ/loopback yasak).
- Araç adları, açıklamaları ve sonuçları **güvenilmeyen veri**dir; asla sistem talimatı olarak yorumlanmaz (tool poisoning / prompt injection koruması — `SECURITY.md`).
- Tool çalıştırma kullanıcı tetiklidir; MCP sunucusu kullanıcı workspace'ine otomatik/sınırsız erişim kazanmaz.

## Otonom seçim (Phase 2 — uygulandı)

Keşfedilen MCP araçları native araçlarla **aynı katalogda** agent'a sunulur. Otonom agentic döngü (`orchestrator.ts`) sırasında model, hedefe uygun MCP aracını kendisi seçip çağırabilir; sonuç güvenilmeyen veri olarak transcripte eklenir ve model planını buna göre günceller. MCP ekranından manuel `tools/call` testi de mevcuttur.

## Referanslar

- [MCP — Transports](https://modelcontextprotocol.io/specification/2026-07-28/basic/transports)
- [MCP — Authorization](https://modelcontextprotocol.io/specification/draft/basic/authorization)
