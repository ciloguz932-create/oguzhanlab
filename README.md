# OguzhanLab Agent

OguzhanLab Agent, mobil cihazlarda kullanılmak üzere tasarlanmış **local-first AI agent çalışma alanı**dır. Uygulama, sıradan bir sohbet ekranı yerine doğal dilde verilen hedefleri görev grafiğine dönüştürür; uygun araçları çalıştırır, çalışma durumunu görünür kılar, izin ister ve üretilen çıktıları workspace artifact’i olarak saklar.

## MVP Kapsamı

| Alan | Uygulanan davranış |
|---|---|
| Sağlayıcılar | OpenAI, Anthropic, OpenRouter ve Google Gemini için ortak adapter sözleşmesi, anahtar biçiminden algılama, bağlantı doğrulama ve model listesi. Tüm sağlayıcılarda **gerçek streaming** (Anthropic ve Gemini için SSE). |
| Model yönlendirme | Görevin gereksinimine (`fast`/`reasoning`/`coding`/`vision`) göre yetenek-farkında model seçimi; güvenli varsayılana düşme. |
| Yetenekler (Skills) | Hedefe göre otomatik seçilen, sistem istemine uzmanlık talimatı enjekte eden ve model tercihini biçimlendiren yeniden kullanılabilir paketler. Yerleşik (Derin Araştırma, Doküman Yazarı, Çalışma Planlayıcı, Veri Analisti, GitHub Asistanı, E-posta Gönderici) + kullanıcı tanımlı özel yetenekler. |
| Entegrasyonlar | Token tabanlı harici servisler araçlarını agent'a ekler: **GitHub** (arama/okuma/issue), **E-posta** (Resend ile gerçek gönderim) ve token'sız `web.fetch`. OAuth gerektiren Gmail/Drive için MCP sunucusu bağlanır. Bkz. [`INTEGRATIONS.md`](./INTEGRATIONS.md). |
| Alt-agent'lar | Ana agent, karmaşık hedefleri `agent.spawn` ile rol tabanlı (research/coding/data/writing) **salt-okunur** alt-agent'lara devreder; bütçeli, iptal edilebilir, özyinelemeye kapalı. Bkz. [`SUBAGENTS.md`](./SUBAGENTS.md). |
| Dayanıklı yürütme | Çalışmalar döngü içinde checkpoint'lenir; uygulama kapanırsa `queued` olur ve ön plana gelince kaldığı yerden **otomatik devam eder**. Aktif çalışmada ekran açık tutulur; arka planda tamamlama/izin için yerel bildirim gönderilir. OS sınırları dürüstçe belgelidir. Bkz. [`BACKGROUND.md`](./BACKGROUND.md). |
| Web gezinme | `web.fetch` + `web.extractLinks` ile HTTP tabanlı gezinme (getir → bağlantıları çıkar → takip et); Web Gezgini yeteneği. Gerçek tarayıcı otomasyonu (JS render/tıklama) uzak tarayıcı-MCP ile eklenir; cihaz içi taklit edilmez. Bkz. [`BROWSER.md`](./BROWSER.md). |
| Kimlik bilgileri | Android/iOS’ta `expo-secure-store`; web önizlemesinde yalnızca oturumluk `sessionStorage` geri dönüşü. Anahtarlar olay günlüklerinden ve kalıcı uygulama durumundan ayrıdır. |
| Agent Runtime | **Otonom agentic döngü**: model araçları (native + MCP) kendisi seçer, sonuçları güvenilmeyen veri olarak gözlemler ve her turda planını günceller (dinamik replanning). İzin askıya alma/devam etme, geçici hatalarda backoff’lu yeniden deneme, gerçek durdurma, adım/araç/hard-cap sınırları ve yarıda kalan çalışmaların kurtarılması. |
| Maliyet/token | Çalışma başına token toplama ve **tahmini** maliyet (public liste fiyatları, açıkça "tahmini" etiketli). |
| Yerel çalışma | Workspace, görevler, mesajlar, olaylar, MCP yapılandırması ve artifact metadata’sı AsyncStorage’da; mobil Markdown dosyaları uygulama sandbox’ında tutulur. |
| Araçlar | Web araştırması, güvenli hesaplama, metin işlemleri ve yalnızca aktif workspace’e Markdown yazma. |
| Güvenlik | Prompt/tool çıktıları güvenilmeyen veri olarak ele alınır; secret redaction, URL/özel ağ kısıtlaması, dosya adı sanitizasyonu ve risk tabanlı izin kapısı kullanılır. |
| MCP | HTTPS Streamable HTTP ile `tools/list` keşfi ve `tools/call` **gerçek çağrısı**; açık veya Bearer token korumalı sunucular için araçların merkezi registry’ye alınması; JSON + SSE yanıt desteği. |

Ayrıntılı belgeler: [`ARCHITECTURE.md`](./ARCHITECTURE.md) · [`SECURITY.md`](./SECURITY.md) · [`MCP.md`](./MCP.md) · [`INTEGRATIONS.md`](./INTEGRATIONS.md) · [`SUBAGENTS.md`](./SUBAGENTS.md) · [`BACKGROUND.md`](./BACKGROUND.md) · [`BROWSER.md`](./BROWSER.md)

> Web önizlemesi, tarayıcının güvenli depolama modelinden dolayı mobil secure storage ile aynı güvenlik garantisini vermez. Üretim anahtarlarını yalnızca Android/iOS uygulamasında saklayın.

## Gereksinimler

Node.js 22+, pnpm 9+ ve Android test için Expo Go veya Android Studio gerekir. Sağlayıcıya gerçek istek atmak için kullanıcının kendi geçerli OpenAI, Anthropic veya OpenRouter anahtarı gerekir. Uygulamanın planlama, görev kalıcılığı, artifact görüntüleme ve yerel ayar ekranları için harici sunucu gerekli değildir.

## Kurulum ve Çalıştırma

```bash
pnpm install
pnpm dev
```

Android cihazda terminal çıktısındaki QR kodu Expo Go ile okutun veya aşağıdaki komutu kullanın.

```bash
pnpm android
```

İlk açılışta **Connect AI** ekranına bir API anahtarı yapıştırın. Uygulama sağlayıcıyı algılar, bağlantıyı test eder, erişilebilir modelleri getirir ve anahtarı platformun güvenli alanına kaydeder. Anahtar doğrulanamazsa hiçbir hassas değer hata mesajında gösterilmez.

## MCP Kurulumu

MCP ekranından HTTPS Streamable HTTP uç noktası ekleyin. Açık sunucularda `none`, statik token kullanan sunucularda `bearer` seçin. Token cihazdaki güvenli credential katmanında saklanır. Araç keşfi, MCP sunucusuna JSON-RPC `tools/list` isteği gönderir; dönen araçlar agent’ın merkezi tool registry’sine eklenir.

MCP’nin resmi HTTP yetkilendirme akışı OAuth 2.1, Protected Resource Metadata ve PKCE içerir. Bu MVP, bu çok adımlı tarayıcı dönüş akışını henüz uygulamaz; OAuth korumalı sunucular açıkça yetkilendirme hatası verir ve yüksek güvenlikli sonraki sürüm için adapter sözleşmesi hazırdır. Resmi MCP standardı JSON-RPC ve Streamable HTTP için tek uç noktaya POST/SSE modelini tanımlar.[1] HTTP tabanlı yetkilendirme modelinde tokenlar her istek için `Authorization` başlığında taşınır; URI sorgusuna eklenmez.[2]

## Test, Kontrol ve Paketleme

```bash
pnpm check
pnpm test
pnpm lint
pnpm build
```

`pnpm check` TypeScript sözleşmelerini, `pnpm test` görev grafiği, planlayıcı, sağlayıcı algılama ve güvenlik yardımcılarını, `pnpm lint` Expo lint kurallarını denetler. `pnpm build` dahilî Node sunucu paketini üretir. Mobil paketi üretmek için Expo/EAS yapılandırması ve mağaza kimlikleri gereklidir; uygulama kaynak kodu Android odaklı çalışacak biçimde Expo üzerinden paketlenmeye hazırdır.

## Sorun Giderme

| Durum | Kontrol |
|---|---|
| Bağlantı doğrulanmıyor | Anahtarın doğru sağlayıcıya ait olduğunu, hesabın model erişimi olduğunu ve cihazın internete bağlı olduğunu kontrol edin. |
| Web araştırması durdu | Çevrimdışı modun kapalı olduğunu ve web araştırması için izin verdiğinizi doğrulayın. |
| Artifact açılmıyor | Web önizlemesinde içerik oturum depolamasından; mobilde uygulama sandbox’ından okunur. Uygulama verisi temizlendiyse artifact erişilemeyebilir. |
| MCP araçları görünmüyor | HTTPS endpoint’i, `tools/list` erişimi ve gerekiyorsa Bearer token’ı doğrulayın. |

## Mimari Notlar

Ana kod alanları `lib/agent` altında tutulur. `types.ts` core sözleşmeleri; `providers.ts` provider adapter’ları; `planner.ts` ve `task-graph.ts` orchestration modelini; `tools.ts` merkezi native tool registry’sini; `storage.ts` ile `artifacts.ts` local-first kalıcılığı; `mcp.ts` MCP araç keşfini; `agent-provider.tsx` ise mobil UI ile runtime arasındaki durumsal sınırı sağlar. Bu ayrım ileride local model, ek provider, background agent, gelişmiş MCP OAuth ve eşzamanlama modüllerinin core’u değiştirmeden eklenebilmesi içindir.

## References

[1]: https://modelcontextprotocol.io/specification/2026-07-28/basic/transports "Model Context Protocol — Transport Overview"
[2]: https://modelcontextprotocol.io/specification/draft/basic/authorization "Model Context Protocol — Authorization"
