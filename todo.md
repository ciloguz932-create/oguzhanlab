# Project TODO

- [x] Ürün gereksinimlerini ve boş GitHub deposunu analiz ederek MVP sınırını belgelemek
- [x] Android dikey kullanımına odaklanan mobil tasarım planını oluşturmak
- [x] Uygulama markasını, temasını ve uygulama simgesini güncellemek
- [x] Tip güvenli temel domain modelleri ve local-first persistence katmanını oluşturmak
- [x] Secure credential manager ve API anahtarı sağlayıcı algılamasını geliştirmek
- [x] OpenAI adapter ile alternatif provider adapter sözleşmesini geliştirmek
- [x] Task graph, planner, tool registry, permission ve workspace çekirdeğini geliştirmek
- [x] MCP yapılandırma ve araç keşfi için istemci sözleşmesini geliştirmek
- [x] Agent runtime, aktivite olayları, hata sınıflandırması ve artifact üretimini geliştirmek
- [x] Connect AI, ana alan, agent, projeler, görevler, dosyalar ve ayarlar ekranlarını geliştirmek
- [x] Unit testleri, type-check, lint, build ve güvenlik kontrollerini çalıştırmak
- [x] README ve environment örneğini hazırlamak
- [x] Tamamlanan projeyi seçili GitHub deposuna aktarmak
- [x] Sürüm kaydını engelleyen mobil simge varlıklarını optimize etmek
- [x] Anthropic gerçek SSE streaming ve Google Gemini adapter'ı eklemek
- [x] Yetenek-farkında model router (task.modelRequirement) eklemek
- [x] Token/maliyet toplama ve UI'da tahmini maliyet göstermek
- [x] Yapısal hata sınıflandırma, backoff'lu yeniden deneme ve döngü/adım sınırları
- [x] Yeniden başlatmada yarıda kalan çalışmaların kurtarılması
- [x] MCP tools/call gerçek çağrısı, SSE yanıt işleme ve keşif sonrası kalıcı registry
- [x] ARCHITECTURE.md, SECURITY.md, MCP.md belgelerini gerçek uygulamayla hizalamak

## Phase 2 — Dinamik replanning + otonom MCP
- [x] Otonom agentic döngü (ReAct): model araçları kendisi seçer, gözlemler, yeniden planlar
- [x] MCP araçlarının native araçlarla aynı katalogda otonom seçimi ve `tools/call` yürütmesi
- [x] İzin askıya alma/devam etme (allow/deny/resume) ve reddedince araçsız uyarlanma
- [x] Adım/araç/hard-cap sınırlarıyla sonsuz döngü koruması
- [x] Orchestrator birim testleri (10 test)

## Phase 3 — Yetenekler / Capabilities
- [x] Yeniden kullanılabilir Skill modeli (talimat + tetikleyici kelimeler + araç/model tercihi)
- [x] Yerleşik yetenekler: Derin Araştırma, Doküman Yazarı, Çalışma Planlayıcı, Veri Analisti
- [x] Hedefe göre otomatik yetenek seçimi ve sistem istemine talimat enjeksiyonu
- [x] Kullanıcı tanımlı özel yetenek ekleme/silme, etkinleştirme/devre dışı bırakma (Yetenekler ekranı)
- [x] Yetenek birim testleri (8 test)

## Phase 4 — Harici entegrasyonlar
- [x] Token tabanlı native entegrasyon çerçevesi (ToolRegistry'ye araç ekler)
- [x] GitHub entegrasyonu (arama, depo/issue/dosya okuma, izinli issue oluşturma)
- [x] E-posta entegrasyonu (Resend ile gerçek gönderim, izinli)
- [x] web.fetch (URL → okunabilir metin, SSRF korumalı) ve derin araştırma güçlendirmesi
- [x] GitHub ve E-posta yerleşik yetenekleri; Entegrasyonlar ekranı
- [x] Entegrasyon birim testleri (11 test); Gmail/Drive için MCP + OAuth planı belgelendi

## Phase 5 — Alt-agent'lar
- [x] Rol tabanlı alt-agent'lar (research/coding/data/writing), salt-okunur kapsam
- [x] agent.spawn aracı; izin kapısı devretme noktası; özyinelemeye yapısal kapalılık
- [x] Bütçe (maxSteps/maxToolCalls, çalışma başına en fazla 4 alt-agent) ve paylaşılan iptal
- [x] Orkestratör yeteneği; alt-agent birim testleri (7 test); SUBAGENTS.md

## Phase 6 — Dayanıklı / arka plan yürütme
- [x] Döngü içi transcript checkpoint'i (onProgress) ile dayanıklılık
- [x] Yeniden başlatmada checkpoint'li çalışmaları queued'e alma, checkpoint'siz olanları failed
- [x] Ön plana gelince (AppState) ve soğuk başlatmada queued çalışmaları otomatik devam
- [x] expo-keep-awake ile aktif çalışma sırasında ekranı açık tutma
- [x] Tamamlama/başarısızlık/izin için yerel bildirimler (expo-notifications, opt-in)
- [x] OS sınırlarının dürüst belgelenmesi (BACKGROUND.md); +2 test (queued/onProgress)

## Sonraki adımlar (planlı — uydurulmadı)
- [ ] Phase 7: Tarayıcı ajanı
- [ ] Phase 8: Fable / uzman modeller
- [ ] Phase 9: Bulut dağıtımı + kendi Agent API'si (gerçek sunucu tarafı arka plan)
- [ ] MCP OAuth 2.1/PKCE (Gmail/Drive native entegrasyonlarının önkoşulu)
- [ ] Phase 5: Sub-agent'lar
- [ ] Phase 6: Arka plan yürütme
- [ ] Phase 7: Tarayıcı ajanı
- [ ] MCP OAuth 2.1/PKCE tarayıcı dönüş akışı ve token yenileme
