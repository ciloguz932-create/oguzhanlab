# Android APK Üretimi (EAS Build — terminalsiz)

Telefona kurulabilir bir APK, GitHub Actions üzerinden bulutta (Expo EAS) üretilir. Kendi bilgisayarında terminal gerekmez; yalnızca **bir kez** üç değer eklersin, sonra butona basarsın.

## 1) Tek seferlik kurulum (senin yapman gerekenler)

Bir **ücretsiz Expo hesabı** gerekir (expo.dev). Ardından bu depoda GitHub'da şunları ekle — **Settings → Secrets and variables → Actions**:

| Ad | Tür | Nereden alınır | Gizli mi? |
|---|---|---|---|
| `EXPO_TOKEN` | **Secret** | expo.dev → Account → **Access Tokens** → yeni token | ✅ Evet (gizli) |
| `EAS_PROJECT_ID` | **Variable** | expo.dev'de bir proje oluştur → proje ayarlarındaki **Project ID** | Hayır |
| `EXPO_OWNER` | **Variable** | Expo kullanıcı adın (veya organizasyon adın) | Hayır |

> `EAS_PROJECT_ID`'yi terminalsiz almanın yolu: expo.dev → **Projects → Create a project** → oluşan projenin ID'sini kopyala. (Alternatif: bir bilgisayarda `eas init` — ama gerekmez.)
>
> Depoda hardcode edilmiş hiçbir hesap değeri yoktur; bu üç değer yalnızca CI'da kullanılır. Anahtarın hiçbir zaman koda veya loglara yazılmaz.

## 2) Build başlatma (telefondan bile)

1. GitHub'da bu depo → **Actions** sekmesi.
2. Soldan **"EAS Android Build"** → sağdan **"Run workflow"**.
3. Profil: **preview** (kurulabilir APK) — varsayılan. `production` Play Store için AAB üretir (doğrudan kurulmaz).
4. **Run workflow**'a bas.

## 3) Sonuç: kurulabilir bağlantı

Build bitince (birkaç dakika) çalışmanın **Summary** ekranında:

- **İndirilebilir dosya:** doğrudan APK bağlantısı,
- **Build sayfası:** Expo'daki kurulum/QR sayfası.

Telefonunda bu bağlantıyı aç → APK'yı indir → kur. Android ilk seferde **"Bilinmeyen kaynaklara izin ver"** isteyebilir; bir kez onayla. Kurulunca uygulamayı aç, **Connect AI** ile anahtarını gir, alt menüden **✨ Agent** sekmesinde görev ver.

## Notlar

- **Mimari korunur:** Bu kurulum yalnızca yapılandırma + CI'dır. Agent sekmesi ve local-first çalışma değişmez; uygulama internetsizken de yerel verilere erişir.
- **Doğrulama:** `eas.json`, `app.config.ts` env enjeksiyonu ve workflow yerelde doğrulandı (config yükleniyor, JSON/YAML geçerli, type-check/lint/test yeşil). Gerçek APK derlemesi senin `EXPO_TOKEN`'ını gerektirdiğinden bu ortamda çalıştırılamaz; değerleri ekleyip "Run workflow" dediğinde EAS derlemeyi yapıp indirme bağlantısını üretir.
- İlk çalıştırmada eksik bir secret/variable varsa workflow, hangi değerin eksik olduğunu açık bir hata mesajıyla söyleyip durur.
