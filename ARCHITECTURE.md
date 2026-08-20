# Mimari

OguzhanLab Agent, **local-first** bir mobil AI agent çalışma alanıdır. Sunucu tarafı iş mantığı olmadan, kullanıcının kendi sağlayıcı anahtarıyla cihaz üzerinde çalışır. Bu belge gerçek uygulamayı — kod ile birebir — anlatır; hedeflenen ama henüz uygulanmayan yetenekler açıkça "planlı" olarak işaretlenir.

## Katmanlar

```
                 MOBİL UI  (app/*)
                     │  useAgent()
                     ▼
        AgentProvider  (lib/agent/agent-provider.tsx)
   tek durum reducer + runtime orchestrator, olay yayını
          │            │             │
          ▼            ▼             ▼
      Planner     ProviderRegistry   LocalStateRepository
   (planner.ts)   (providers.ts)     (storage.ts + recovery.ts)
          │            │
          ▼            ▼
    TaskGraphManager   ModelRouter
   (task-graph.ts)     (model-router.ts)
          │
          ▼
    Yürütme döngüsü (executeRun)
          │
     ┌────┼──────────────┐
     ▼    ▼              ▼
  Native  MCP           Usage/Cost
  Tools   Client        (usage.ts)
 (tools)  (mcp.ts)
     │    │
     └────┼──────────────┘
          ▼
    ArtifactStore (artifacts.ts) + secure credentials (storage.ts)
```

Katmanlar tek yönde bağımlıdır: UI yalnızca `AgentProvider`'ı bilir; runtime sağlayıcıları soyut `ProviderAdapter` sözleşmesi üzerinden kullanır; araçlar merkezi `ToolRegistry`'de toplanır. Bu ayrım sayesinde yeni provider, MCP sunucusu veya native tool eklemek çekirdeği değiştirmez.

## Modüller

| Dosya | Sorumluluk |
|---|---|
| `lib/agent/types.ts` | Tüm domain sözleşmeleri (tek kaynak). |
| `lib/agent/providers.ts` | OpenAI, OpenRouter (OpenAI-uyumlu), Anthropic ve Gemini adapter'ları; anahtar algılama, model listesi, `generate`, gerçek SSE `stream`. |
| `lib/agent/model-router.ts` | `task.modelRequirement` + yetenek sezgisiyle model seçimi; her zaman güvenli varsayılana düşer. |
| `lib/agent/planner.ts` | Doğal dil hedefini bağımlılıklı görev grafiğine dönüştürür (anahtar-kelime tabanlı, deterministik). |
| `lib/agent/task-graph.ts` | DAG doğrulama, topolojik sıralama, döngü tespiti, hazır görev seçimi. |
| `lib/agent/tools.ts` | Native tool registry; güvenli hesap makinesi; read-only web araştırması; artifact adı üretimi. |
| `lib/agent/mcp.ts` | Streamable HTTP MCP istemcisi: `initialize`, `tools/list`, `tools/call`; JSON + SSE yanıt işleme. |
| `lib/agent/usage.ts` | Token toplama ve **tahmini** maliyet (public liste fiyatları). |
| `lib/agent/errors.ts` | `AgentError`, hata sınıflandırma, jitter'lı exponential backoff, `withRetry`, abortable `sleep`. |
| `lib/agent/recovery.ts` | Yeniden başlatmada yarıda kalan çalışmaları kurtarma (saf, RN'siz, test edilebilir). |
| `lib/agent/security.ts` | Secret redaction, dosya adı sanitizasyonu, SSRF/özel-ağ koruması, id üretimi. |
| `lib/agent/storage.ts` | AsyncStorage kalıcılığı + `CredentialManager` (expo-secure-store / web sessionStorage). |
| `lib/agent/artifacts.ts` | Markdown artifact yazımı (mobilde sandbox dosya sistemi, web'de AsyncStorage). |
| `lib/agent/agent-provider.tsx` | Runtime: durum makinesi, yürütme döngüsü, izin kapısı, olay yayını, model/tool orkestrasyonu. |

## Yürütme yaşam döngüsü

1. Kullanıcı hedef girer → `submitInstruction`.
2. `Planner` görev grafiği üretir; `AgentRun` `planning` durumunda kaydedilir.
3. `executeRun` grafiği topolojik sırada gezer. Her görev tipi:
   - **research** → izin kapısı → `web.search` (transient hatada backoff'lu yeniden deneme).
   - **generation** → `ModelRouter` model seçer → gerçek streaming (delta yayınlanmadan önce yeniden denenebilir) → token/maliyet toplanır.
   - **artifact** → izin kapısı → dosya sistemine gerçek yazım → artifact kaydı.
   - **verification** → artifact beklendiyse varlığı doğrulanır.
4. Her adım `ActivityEvent` yayınlar; UI bu olaylara ve görev durumuna abone olur (uydurma ilerleme yoktur).
5. Durdurma `AbortController` ile gerçektir; hata `AgentError` ile sınıflandırılır.

## Kalıcılık ve kurtarma

Tüm uygulama durumu (`AppState`) AsyncStorage'da saklanır; kimlik bilgileri ayrı güvenli katmanda tutulur. Açılışta `recoverInterruptedRuns` yarıda kalan çalışmaları "yeniden denenebilir" hale getirir; tamamlanmış görevlerin yan etkileri tekrarlanmaz.

## Güvenlik sınırları

`SECURITY.md`'ye bakın. Özet: dış içerik (web, MCP, tool çıktısı) daima veri; risk tabanlı izin kapısı; secret redaction; SSRF koruması.

## Planlı (henüz uygulanmadı — uydurulmadı)

- Gözlem→değerlendir→yeniden planla döngüsü (dinamik replanning).
- LLM güdümlü otonom MCP tool seçimi (şu an MCP tool çağrısı kullanıcı tetiklidir).
- MCP OAuth 2.1 / PKCE tarayıcı dönüş akışı ve token yenileme.
- Sub-agent'lar, arka plan yürütme, tarayıcı otomasyonu, yerel model inference.

Bu yetenekler için sözleşmeler (`ProviderAdapter`, `ToolRegistry`, `McpAuthType`) hazırdır; eklenmeleri çekirdeği yeniden yazmayı gerektirmez.
