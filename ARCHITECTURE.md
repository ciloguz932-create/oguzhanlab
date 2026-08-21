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
| `lib/agent/orchestrator.ts` | **Otonom agentic döngü** (ReAct): model araçları (native + MCP) kendisi seçer, sonuçları güvenilmeyen veri olarak gözlemler, her turda planını günceller; adım/araç sınırlarıyla sınırlıdır. Aktif yetenek talimatlarını sistem istemine enjekte eder. Saf ve DI'lı — test edilebilir. |
| `lib/agent/skills.ts` | **Yetenek (Skill) sistemi**: yeniden kullanılabilir uzmanlık paketleri (talimat + tetikleyici kelimeler + araç/model tercihi). Yerleşik yetenekler + kullanıcı tanımlı özel yetenekler; hedefe göre otomatik seçim (`selectSkills`). Saf ve test edilebilir. |
| `lib/agent/integrations.ts` | **Entegrasyon çerçevesi**: token tabanlı harici servisler (GitHub, E-posta/Resend) native araçlar olarak ToolRegistry'ye eklenir; gerçek HTTP çağrıları, güvenli token saklama, yazma işlemleri için izin kapısı. OAuth gerektiren servisler MCP ile bağlanır (bkz. `INTEGRATIONS.md`). |
| `lib/agent/subagents.ts` | **Alt-agent'lar**: `agent.spawn` ile rol tabanlı (research/coding/data/writing), salt-okunur, bütçeli, iptal edilebilir ve özyinelemeye kapalı alt-agent yürütmesi. Saf ve DI'lı — test edilebilir (bkz. `SUBAGENTS.md`). |
| `lib/agent/planner.ts` | Agentic yürütme için hafif üç aşamalı iskelet (`createOutline`) ve geriye dönük statik plan (`createPlan`). |
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

## Yürütme yaşam döngüsü (otonom / agentic)

1. Kullanıcı hedef girer → `submitInstruction`; `Planner.createOutline` üç aşamalı iskelet üretir (anla → araçlarla yürüt → üret & doğrula). `selectSkills` hedefe uygun etkin yetenekleri seçer ve çalışmaya iliştirir.
2. `executeRun`, `ToolRegistry`'den araç kataloğunu (native + MCP; çevrimdışında ağ araçları hariç) toplar; aktif yeteneklerin talimatlarını ve model tercihini (`skillModelRequirement`) uygular ve `runAgentLoop`'u başlatır.
3. Döngü her turda:
   - Model bir JSON kararı üretir: **tool** (araç çağır) veya **final** (bitir).
   - **tool** → izin kapısı (`allow`/`deny`/`ask`). `ask` ise çalışma askıya alınır, transcript kalıcı hale gelir; kullanıcı kararından sonra kaldığı yerden **devam eder** (resume). `allow` → araç çalışır (native dispatch veya MCP `tools/call`); sonuç "güvenilmeyen veri" etiketiyle transcripte eklenir.
   - **final** → nihai Markdown yanıt üretilir.
4. Model, her araç gözleminden sonra planını **dinamik olarak** günceller (yeniden planlama). İzin reddedilirse agent araçsız devam edecek biçimde bilgilendirilir.
5. Güvenlik sınırları: `maxSteps`, `maxToolCalls` ve mutlak bir tavan (`hardCap`) sonsuz döngüyü imkânsız kılar; her model çağrısı token/maliyet olarak toplanır.
6. Her adım `ActivityEvent` yayınlar; UI bu olaylara ve iskelet görev durumuna abone olur (uydurma ilerleme yoktur). Durdurma `AbortController` ile gerçektir; hata `AgentError` ile sınıflandırılır.

## Kalıcılık ve kurtarma

Tüm uygulama durumu (`AppState`) AsyncStorage'da saklanır; kimlik bilgileri ayrı güvenli katmanda tutulur. Açılışta `recoverInterruptedRuns` yarıda kalan çalışmaları "yeniden denenebilir" hale getirir; tamamlanmış görevlerin yan etkileri tekrarlanmaz.

## Güvenlik sınırları

`SECURITY.md`'ye bakın. Özet: dış içerik (web, MCP, tool çıktısı) daima veri; risk tabanlı izin kapısı; secret redaction; SSRF koruması.

## Uygulandı (Phase 2–3)

- **Dinamik replanning**: model her araç gözleminden sonra planını günceller (`orchestrator.ts`).
- **Otonom MCP tool seçimi**: MCP araçları native araçlarla aynı katalogda; agent bunları planlama sırasında kendisi seçip çağırır.
- **Yetenek (Skill) sistemi**: hedefe göre otomatik seçilen, sistem istemine talimat enjekte eden ve model tercihini biçimlendiren yeniden kullanılabilir uzmanlık paketleri; yerleşik + kullanıcı tanımlı, Yetenekler ekranından yönetilir (`skills.ts`).

## Uygulandı (Phase 4–5)

- **Entegrasyon çerçevesi** + yerleşik GitHub (PAT) ve E-posta (Resend) entegrasyonları; `web.fetch` ile derin araştırma. GitHub/E-posta yetenekleri. Bkz. `INTEGRATIONS.md`.
- **Alt-agent'lar**: `agent.spawn` ile rol tabanlı, salt-okunur, bütçeli, özyinelemeye kapalı delegasyon; Orkestratör yeteneği. Bkz. `SUBAGENTS.md`.

## Planlı (henüz uygulanmadı — uydurulmadı)

- MCP OAuth 2.1 / PKCE tarayıcı dönüş akışı ve token yenileme (Gmail/Drive native entegrasyonlarının önkoşulu).
- Arka plan yürütme (Phase 6), tarayıcı ajanı (Phase 7), yerel model inference.

Bu yetenekler için sözleşmeler (`ProviderAdapter`, `ToolRegistry`, `McpAuthType`) hazırdır; eklenmeleri çekirdeği yeniden yazmayı gerektirmez.
