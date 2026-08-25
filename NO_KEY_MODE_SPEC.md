# Anahtarsız (No-Key) Mod Spesifikasyonu

OguzhanLab, bağlı bir AI sağlayıcısı olmadan da **gerçekten kullanışlı** olmalıdır — fakat
"anahtarsız yapay zekâ üretimi" **taklit edilmez**. Model üretimi yalnızca doğrulanmış bir
kullanıcı bağlantısıyla yapılır; onun dışındaki her şey yereldir.

## Kullanıcı hiç anahtar bağlamadan yapabilecekleri

| Yetenek | Durum | Kaynak |
|---|---|---|
| Workspace oluştur/seç | ✅ Yerel | `createWorkspace`/`selectWorkspace` (`agent-provider.tsx`) |
| Geçmiş görev ve run'ları görüntüle | ✅ Yerel | `tasks.tsx`, kalıcı `AppState` |
| Artifact görüntüle/kopyala | ✅ Yerel | `files.tsx`, `artifact.tsx`, `artifacts.read` |
| Hesap makinesi (deterministik) | ✅ Yerel | `safeCalculate` (`tools.ts`) |
| Metin/başlık/dosya-adı dönüşümü | ✅ Yerel | `sanitizeTextTransform` |
| Ayarlar, çevrimdışı mod, yerel veri temizleme | ✅ Yerel | `settings.tsx` |
| Model üretimi (agent çalıştırma) | ⛔ Bağlantı ister | `executeRun` net "önce sağlayıcı bağlayın" der (uydurma yanıt yok) |
| Web araştırma / uzak MCP | ⛔ Çevrimdışı/anahtarsız kapalı | `buildCatalog`/`dispatchBase` çevrimdışı filtreleri |

## Connect ekranında tuzak yok

`RootNavigator` bağlantı yoksa **Connect** ekranını açar. Connect artık bir **çıkış** sunar:
**"Anahtarsız / çevrimdışı devam et"** → `router.replace("/")` ile sekmelere geçer
(`app/connect.tsx`). Böylece kullanıcı Connect'te kilitlenmez; anahtarı sonra ekleyebilir.

## Sağlayıcı seçim UX

- Otomatik biçim algılama yalnızca kolaylık içindir; **elle sağlayıcı seçimi her zaman** vardır
  (`inferProvider` + çipler). Algılanamayınca net yönlendirme (`provider_not_selected`).
- Anahtar girişten sonra tam olarak gösterilmez (`secureTextEntry`); güvenli depolamaya alınır.
- Doğrulama başarısızsa anahtar yalnızca giriş alanında kalır, kalıcılaştırılmaz.

## Kademeli fallback (yanlış vaat yok)

- **Tier 0 — yerel deterministik:** workspace, görev, artifact, hesap makinesi, geçmiş, izin, çevrimdışı.
- **Tier 1 — bağlı sağlayıcı:** yalnızca doğrulanmış bağlantıdan sonra model üretimi; run bağlamında sağlayıcı/model/durum gösterilir.
- **Tier 2 — alternatif bağlı sağlayıcı:** kullanıcı başka bağlı sağlayıcı/model seçebilir; anahtarlar/sağlayıcılar **otomatik döndürülmez**.
- **Tier 3 — kullanılamaz:** görev/plan korunur, engellenen üretim adımı açıklanır, bağlantı sonrası tekrar denenir; **uydurma çıktı yoktur**.

## Sınırlar

- Anahtarsız modda gerçek bir **yerel model çalıştırma yoktur**; "offline AI" iddia edilmez.
- Bilinmeyen sayı/kullanım/maliyet yerine "Bilinmiyor / raporlanmadı" gösterilir; sahte metrik üretilmez.
