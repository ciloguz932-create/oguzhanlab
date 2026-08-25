# Ürün Riskleri Kaydı

Her madde: **önem** (blocker / high / medium / low), yer, neden önemli, minimal güvenli
düzeltme, doğrulama, iddia edilmemesi gereken. Bu tur (Prompt 3) kapatılanlar işaretli.

## No-key kullanıcı Connect'te kilitleniyordu — [medium] ✅ düzeltildi
- **Yer:** `app/_layout.tsx` (initialRoute connect) + `app/connect.tsx` (çıkış yoktu).
- **Neden:** Anahtarı olmayan kullanıcı yerel özelliklere hiç ulaşamıyordu.
- **Düzeltme:** Connect'e "Anahtarsız / çevrimdışı devam et" → `router.replace("/")`.
- **Doğrulama:** Connect'ten sekmelere geç, workspace oluştur/artifact görüntüle.
- **İddia edilmez:** "anahtarsız AI üretimi" — yalnızca yerel özellikler çalışır.

## No-connection'da talimat/grafik korunmuyor — [medium] açık
- **Yer:** `app/(tabs)/agent.tsx` `submit` → bağlantı yoksa doğrudan Connect'e yönlendirir.
- **Neden:** Kullanıcının yazdığı hedef, run/grafik olarak saklanmadan kayboluyor.
- **Minimal düzeltme:** Run'ı "blocked: needs provider" durumunda oluştur; bağlantı sonrası tekrar dene.
- **Doğrulama:** Anahtarsızken görev yaz → Görevler'de "engellendi" olarak görünsün, uydurma çıktı olmasın.
- **İddia edilmez:** engellenen adım için sahte bir yanıt/başarı.

## Canlı tema geçişi anlık değil — [low] açık
- **Yer:** `StyleSheet.create` renkleri modül yüklemede snapshot'lar; `theme-provider` toggle'ı stilleri canlı değiştirmez.
- **Neden:** Light/dark toggle beklenen anlık etkiyi vermez; ürün dark-first.
- **Minimal düzeltme:** Runtime renk sağlayıcı / dinamik stil nesneleri.
- **İddia edilmez:** "tam tema desteği".

## MCP OAuth-PKCE ve stdio yok — [low] bilinen sınır
- **Yer:** `lib/agent/mcp.ts`, `McpAuthType`.
- **Neden:** OAuth korumalı sunucular bağlanamaz (açık 401 verilir).
- **Düzeltme (gelecek):** Güvenli PKCE tarayıcı dönüş akışı.
- **İddia edilmez:** "Manus'a eşdeğer MCP", "tüm MCP sunucuları".

## Web önizleme sessionStorage güvenli değil — [low] bilinen sınır
- **Yer:** `lib/agent/storage.ts` (web fallback).
- **Neden:** Güvenli enclave değil; üretim anahtarları için uygun değil.
- **Düzeltme:** Üretimde mobil güvenli depolama; web yalnızca önizleme.
- **İddia edilmez:** web'de üretim seviyesi anahtar güvenliği.

## Görsel/saha doğrulama boşluğu — [medium] süreç
- **Neden:** Değişiklikler cihazda görsel olarak sandbox içinde doğrulanamıyor; test/typecheck/lint/web export kanıt.
- **Düzeltme:** Kullanıcı APK/web ile akışları test eder; ekran görüntüleriyle iyileştirme.
- **İddia edilmez:** "cihazda doğrulandı" — otomatik kapılar yeşil, görsel doğrulama kullanıcıda.

## Genel: aşırı-vaat riski — [high] süreç
- **Neden:** "Otonom/production/secure" gibi iddialar kolayca abartılır.
- **Düzeltme:** Her iddiayı koda + teste bağla; olgunluk **alpha** olarak etiketli (`MENTOR_REVIEW.md`).
- **İddia edilmez:** kanıtsız "production ready / fully autonomous / offline AI / secure".
