# Web Gezinme / Tarayıcı Ajanı

Bu belge, agent'ın web'de nasıl "gezindiğini" **dürüstçe** anlatır. Expo/React Native cihaz üzerinde headless bir tarayıcı (Playwright/Puppeteer/Chromium) çalıştıramaz; bu yüzden gerçek tarayıcı otomasyonu (tıklama, kaydırma, JS ile oluşturulan sayfa, oturum) **cihaz içinde taklit edilmez.**

## Cihaz içi: HTTP tabanlı gezinme (uygulandı)

Agent, gerçek HTTP istekleriyle sayfalar arasında gezinir:

| Araç | İşlev |
|---|---|
| `web.search` | Başlangıç kaynaklarını bulur (DuckDuckGo Instant Answer) |
| `web.fetch` | Bir HTTPS sayfasını getirir ve okunabilir metne dönüştürür |
| `web.extractLinks` | Bir sayfadaki bağlantıları (metin + URL) çıkarır — gezinmenin temeli |

Tipik gezinme döngüsü:

```
web.search  → aday URL'ler
   ↓
web.fetch <url>  → sayfa metni
   ↓
web.extractLinks <url>  → sayfadaki bağlantılar
   ↓
web.fetch <seçilen bağlantı>  → derinleşerek devam
```

**Araştırma Alt-Agent** ve **Web Gezgini** yeteneği bu döngüyü yürütür. `web.extractLinks` çıktısındaki bağlantılar yalnızca veridir; agent bir bağlantıya gitmek için `web.fetch` çağırır ve bu çağrı SSRF korumasını (`assertSafeRemoteUrl`) yeniden uygular.

### Sınırlar (dürüst)

- Yalnızca sunucudan gelen (server-rendered) HTML okunur. **JavaScript ile oluşturulan içerik, tıklama, form gönderme, kaydırma, ekran görüntüsü ve oturum açma desteklenmez.**
- Bağlantı çıkarımı `<a href>` etiketlerine dayanır; SPA yönlendirmeleri veya JS ile üretilen bağlantılar görünmez.
- Tüm hedefler HTTPS olmalı ve özel/loopback ağlara gidilemez.

## Gerçek tarayıcı otomasyonu: uzak tarayıcı (seam hazır)

JS ile oluşturulan sayfalar ve etkileşim (tıkla/yaz/ekran görüntüsü) için **uzak bir tarayıcı hizmeti** gerekir. Bu, mevcut MCP hattına doğrudan takılır:

1. Playwright/Chromium çalıştıran bir **browser-MCP sunucusu** MCP ekranından bağlanır (Bearer token destekli).
2. Sunucunun `tools/list` ile sunduğu araçlar (ör. `navigate`, `click`, `screenshot`) merkezi ToolRegistry'ye girer ve agent bunları native araçlarla birlikte otonom seçer.
3. Böylece gerçek tarayıcı otomasyonu, çekirdek değiştirilmeden ve **uydurma olmadan** eklenir.

Uygulama, cihaz içinde gerçek bir tarayıcı çalıştırdığını iddia etmez; etkileşimli gezinme için uzak yüzeyi işaret eder.
