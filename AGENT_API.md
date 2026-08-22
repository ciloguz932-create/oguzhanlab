# Agent API (Bulut Dağıtımı)

Uygulamanın ajan çekirdeği (React Native'e bağımlı olmayan tüm modüller) sunucuda da çalışır. `server/agent-api`, bu çekirdeği kullanan bağımsız bir HTTP Agent API'sidir. Mobil uygulama bu API olmadan da tam çalışır (local-first); API, **isteğe bağlı ek bir dağıtım yüzeyidir** ve mobil OS'in yapamadığı gerçek sunucu tarafı yürütmeyi mümkün kılar.

## Neyi yeniden kullanır

Ana çekirdek birebir paylaşılır — kod kopyalanmaz: `orchestrator` (agentic döngü), `planner`, `providers` (OpenAI/Anthropic/OpenRouter/Gemini), `tools` (web.search/fetch/extractLinks, calculator, text, filesystem), `skills`, `subagents`, `model-router`, `usage`, `errors`, `security`. Sunucu yalnızca RN'e bağımlı olmayan modülleri içe aktarır (`storage`/`artifacts`/UI hariç).

## Kimlik bilgileri (güvenlik)

API **durumsuzdur**: sağlayıcı anahtarı her istekte verilir (`Authorization: Bearer <key>` veya gövdede `apiKey`) ve **asla saklanmaz, günlüklenmez veya yanıtlarda dönmez**. Anahtar yalnızca o çalışmanın model çağrıları için kullanılır. Üretimde API'yi HTTPS arkasında ve kendi kimlik doğrulaması (ör. gateway) ile yayınlayın.

## Uç noktalar

| Metot | Yol | Açıklama |
|---|---|---|
| GET | `/health` | Sağlık kontrolü |
| POST | `/api/agent/runs` | Çalışma başlatır → `{ id, status, provider }` |
| GET | `/api/agent/runs` | Çalışma listesi (özet) |
| GET | `/api/agent/runs/:id` | Çalışma durumu, olaylar, sonuç, artifact adları, token/maliyet |
| GET | `/api/agent/runs/:id/stream` | SSE: olaylar + `done` olayı |

### Çalışma başlatma

```bash
curl -X POST http://localhost:8787/api/agent/runs \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "instruction": "Python öğrenme yol haritası hazırla ve markdown olarak kaydet",
    "allowedTools": ["web.search","web.fetch","filesystem.writeMarkdown","agent.spawn"]
  }'
```

Yanıt: `{ "id": "…", "status": "running", "provider": "openai" }`.

### İzleme (SSE)

```bash
curl -N http://localhost:8787/api/agent/runs/<id>/stream
```

Olaylar canlı akar; çalışma bitince `event: done` gönderilir.

## İzin modeli

API etkileşimli soramaz. Bu yüzden izin, istekteki `allowedTools` ile **önden** verilir. Varsayılan izinli araçlar: `web.search`, `web.fetch`, `web.extractLinks`, `calculator.evaluate`, `text.transform`, `filesystem.writeMarkdown` (çalışmaya özel klasöre), `agent.spawn`. Listede olmayan bir aracı model çağırırsa reddedilir ve agent araçsız uyarlanır. Alt-agent'lar yalnızca salt-okunur rol araçlarını kullanır.

## Çalıştırma

```bash
pnpm dev:agent-api            # geliştirme (tsx watch)
pnpm build:agent-api          # dist/agent-api/index.js üretir
pnpm start:agent-api          # üretim (node)
# Ortam: AGENT_API_PORT (varsayılan 8787)
```

### Docker

```bash
docker build -t oguzhanlab-agent-api .
docker run -p 8787:8787 -v $(pwd)/artifacts:/app/artifacts oguzhanlab-agent-api
```

Herhangi bir konteyner platformuna (Fly.io, Render, Cloud Run, ECS) dağıtılabilir; tek gereksinim Node 22 çalıştıran bir kap ve dışa açık port.

## Sınırlar (dürüst) — sonraki adımlar

- **Kalıcılık**: çalışmalar süreç belleğinde tutulur; süreç yeniden başlarsa geçmiş çalışmalar kaybolur. Kalıcı depo (Postgres/SQLite) sonraki adımdır (mobil çekirdeğin transcript checkpoint deseni buraya taşınabilir).
- **Kimlik doğrulama / kota**: API kendi başına anahtar gerektirmez; üretimde bir gateway veya API anahtarı katmanı ekleyin.
- **MCP ve entegrasyonlar (GitHub/E-posta)**: API MVP'sinde yalnızca native araçlar + alt-agent'lar sunulur; MCP/entegrasyon araçlarının API üzerinden token'la sunulması yol haritasındadır.
- **Ölçekleme**: tek süreç; yatay ölçek için harici durum deposu ve iş kuyruğu gerekir.

Uydurma yok: yalnızca gerçekten çalışan yetenekler sunulur; eksikler burada açıkça belirtilmiştir.
