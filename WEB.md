# Web / Bilgisayar Sürümü

Uygulamanın tarayıcıda (telefon veya bilgisayar) çalışan sürümü. Expo/RN kod
tabanının aynısı `react-native-web` ile web'e derlenir — ayrı bir kod tabanı yok.

## Nasıl yayınlanır (kurulum gerektirmeyen canlı adres)

1. **Repo → Settings → Pages → Source = "GitHub Actions"** olarak ayarla (tek seferlik).
2. **Actions → "Web (bilgisayar/tarayıcı sürümü)" → Run workflow.**
   - `deploy_pages` açık kalsın.
3. Bittiğinde çalışmanın özetinde **canlı adres** çıkar:
   `https://<kullanıcı>.github.io/oguzhanlab/`
4. Bu adresi telefonda/bilgisayarda tarayıcıdan aç. Uygulama gibi kurmak için
   tarayıcı menüsünden **"Ana ekrana ekle" / "Install"** de (PWA — masaüstü ikonu olur).

> Not: Expo/EAS hesabı veya secret **gerekmez**. Bu tamamen statik bir export.

## İndirilebilir statik build (yerelde sunmak / .exe'ye çevirmek için)

Aynı workflow, her çalışmada **Artifacts → `web-build`** altında `dist/` klasörünü
zip olarak da bırakır. İndir, aç, herhangi bir statik sunucuyla aç:

```bash
npx serve dist        # veya: python3 -m http.server -d dist 8080
```

Bu `dist/` klasörü, ileride **Tauri/Electron** ile gerçek bir Windows `.exe`
(veya macOS/Linux uygulaması) haline getirilebilir — sarmalayıcı web çıktısını gömer.

## Yerelde deneme (geliştirici)

```bash
npx expo export --platform web   # -> dist/ üretir
npx serve dist
```

Kök adreste (alt-yol olmadan) sunacaksan `EXPO_WEB_BASE_URL` boş kalmalı.
GitHub Pages alt-yolu (`/oguzhanlab/`) workflow tarafından otomatik ayarlanır
(`app.config.ts` → `experiments.baseUrl`, `EXPO_WEB_BASE_URL` env ile).
