# Mentor Değerlendirmesi — OguzhanLab Agent

Talepkâr ama yapıcı bir mentor gözüyle uçtan uca denetim. İddialar koda karşılık gelir.
Olgunluk etiketi en sonda.

## 1. Ürün netliği

**Kim için, hangi işi normal bir sohbet uygulamasından daha iyi yapıyor?**
OguzhanLab, kendi API anahtarını getiren teknik-meraklı bir kullanıcı için **yerel öncelikli,
izinleri görünür, araçları denetlenebilir bir agent çalışma ortamı**. Sohbetten farkı:
kalıcı workspace'ler, görev grafiği, izin kapısı, artifact üretimi, MCP/entegrasyon araçları
ve çevrimdışı dayanıklılık. Ayırt edici tek cümle: *"Bir hedefi ver; planı, aracı, izni ve
çıktıyı tek yerde, cihazında gör."*

Risk: konumlandırma hâlâ "her şeyi yapan agent" algısına kayabilir. Odak, **tek güçlü akış**
(workspace → görev → plan → izin → artifact → çevrimdışı devam) üzerinden anlatılmalı.

## 2. Kullanıcı akışları

- Onboarding: Connect AI + **anahtarsız çıkış** artık var (tuzak yok) — `NO_KEY_MODE_SPEC.md`.
- Görev/plan/izin/araç/artifact/hata/çevrimdışı akışları uçtan uca mevcut ve kalıcı.
- **Orta (fixed):** No-key kullanıcı Connect'te kilitleniyordu → `app/connect.tsx` çıkış eklendi.

## 3. UI/UX

- Prompt 1 turundan sonra: responsive (telefon/tablet/web), tutarlı dark tasarım sistemi,
  durum yalnızca renkle iletilmiyor (ikon + renk), erişilebilir etiketler.
- **Düşük:** Canlı tema geçişi (light/dark toggle) `StyleSheet.create`'in renkleri modül
  yüklemede snapshot'laması nedeniyle anlık değişmiyor; ürün dark-first çalışıyor (design.md).

## 4. Agent kalitesi

- Plan şeffaflığı, görev grafiği, iptal, retry, döngü sınırları (`maxSteps`/`maxToolCalls`/hardCap),
  kaynak ayrımı (model / native / MCP / skill / kullanıcı / artifact) mevcut (`orchestrator.ts`).
- **Orta:** No-connection'da `submitInstruction` run oluşturmadan Connect'e yönlendiriyor;
  Prompt 3 önerisi "talimatı ve grafiği koru, üretim adımını engellendi göster" tam
  uygulanmadı (dürüst davranış korunuyor; iyileştirme önerisi — `PRODUCT_RISKS.md`).

## 5. MCP güvenliği

- Prompt 2 turundan sonra: endpoint SSRF, keşif fail-closed doğrulama, per-server enable,
  eski araç yaşam döngüsü, untrusted-content ele alma. Ayrıntı `SECURITY.md`/`MCP.md`.
- **Bilinen sınır:** OAuth-PKCE ve stdio yok (dürüstçe belirtiliyor).

## 6. API anahtarı güvenliği

- Güvenli depolama (`expo-secure-store`), no-key path, geçersiz-anahtar kurtarma,
  sağlayıcı farkları (Anthropic/OpenAI-uyumlu/Gemini header'ları), sızıntı-yok (maskeleme + testler).
- Kota vs rate-limit ayrımı (`errors.ts`) ve normalleştirilmiş taksonomi (`failures.ts`).

## 7. Veri / gizlilik

- Yerel kalıcılık; "tüm yerel verileri temizle" kimlik bilgilerini de siler (`clearLocalData`).
- **Düşük:** Web önizlemesinde `sessionStorage` güvenli enclave değildir (belgelenmiş; üretim için mobil).

## 8. Mühendislik

- TypeScript strict, tek tasarım-sistemi kaynağı, hata sınırları/retry, 89 test, lint, web export.
- **Düşük:** Bazı ekran dosyaları tek-satır yoğun JSX; okunabilirlik için ileride bölünebilir.

## 9. Ürün olgunluğu

- **MVP (çalışan):** yerel workspace/görev/artifact, agent döngüsü, izin, MCP/entegrasyon, çevrimdışı, no-key.
- **Deneysel:** MCP OAuth, canlı tema geçişi, masaüstü `.exe` paketleme (web export mevcut).
- **Eksik/gelecek:** gerçek tarayıcı MCP, skill imza/provenance, sunucu-taraflı proxy (opsiyonel).

## 10. Pazara çıkış hazırlığı

- Tek hedef kullanıcı + tek çekici akış tanımlı; demo betiği: **workspace oluştur → görev ver →
  planı incele → izin ver → artifact üret → bağlantı kesilince yerel moda devam et.**
- Traction iddiası için gereken kanıt henüz yok; "prototip/alpha" dışında bir şey iddia edilmemeli.

---

## Olgunluk etiketi: **alpha**

Çekirdek akışlar çalışıyor, güvenlik kontrolleri ve testler yerinde; ancak canlı tema geçişi,
MCP OAuth ve saha doğrulaması eksik. **"Production ready", "fully autonomous", "offline AI",
"all providers supported", "secure" iddiaları — kod ve testlerin tam kanıtlamadığı biçimde —
kullanılmamalıdır.**

## Önerilen uygulama sırası (sonraki)

1. No-connection'da run'ı "blocked: needs provider" durumunda koru (talimat + grafik kaybolmasın).
2. Canlı tema geçişi (runtime renk sağlayıcı / dinamik stiller).
3. MCP OAuth-PKCE (tarayıcı dönüş akışı) — güvenli uygulanabilirse.
4. Saha testi + tek demo akışının cilalanması.
