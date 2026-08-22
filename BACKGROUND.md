# Arka Plan Yürütme

Bu belge, uzun görevlerin uygulama yaşam döngüsü karşısında nasıl davrandığını **dürüstçe** anlatır. Mobil işletim sistemleri, uygulama arka plandayken uzun süre keyfi JavaScript çalıştırmaya izin vermez; bu yüzden "kapalıyken saatlerce çalışan agent" mümkün değildir ve taklit edilmez.

## Uygulanan model: dayanıklı + kaldığı yerden devam

1. **Checkpoint (dayanıklılık).** Agent döngüsü her temiz sınırda (model sırası gelmeden önce) transcript'i ve sayaçları kalıcı olarak kaydeder (`orchestrator.onProgress` → `updateRun`). Kaydedilen anlık görüntü değişmez bir kopyadır; asla yürütülmemiş bir araç kararıyla bitmez.
2. **Kurtarma (recovery).** Uygulama, bir çalışma sürerken kapanırsa, açılışta:
   - Checkpoint'i olan `running`/`planning` çalışmalar → `queued` (kaldığı yerden devam edecek).
   - Checkpoint'i olmayanlar → `failed` (yeniden denenebilir; sıfırdan çalıştırmak yan etkiyi tekrarlayabileceği için otomatik değil).
   - `waiting_for_permission` çalışmalar dokunulmadan bırakılır; bekleyen izin kalıcıdır ve kullanıcı çözünce devam eder.
3. **Otomatik devam.** Uygulama açıldığında (soğuk başlatma) ve her ön plana geldiğinde (`AppState` 'active'), `queued` çalışmalar checkpoint'ten **otomatik olarak kaldığı yerden** devam eder — sıfırdan değil.
4. **Ekranı açık tut.** Bir çalışma etkinken (`running`/`planning`) `expo-keep-awake` ile ekran kilidinin görevi kesmesi önlenir (uygulama ön plandayken).
5. **Bildirimler.** Kullanıcı etkinleştirirse, uygulama **arka plandayken** bir görev tamamlandığında, başarısız olduğunda veya izin gerektiğinde yerel bildirim gönderilir (`expo-notifications`). Yalnızca yerel bildirim; sunucu push'u yoktur. OS izni gerekir.

## OS sınırı (dürüst)

- iOS ve Android, arka plandaki JS'e yalnızca kısa, kısıtlı pencereler verir (`BGTaskScheduler` / WorkManager). Bu pencereler uzun agent döngüleri için uygun değildir; süre ve sıklık OS tarafından kısıtlanır ve garanti edilmez.
- Bu yüzden uygulama, "uygulama tamamen kapalıyken sınırsız çalışma" iddiasında bulunmaz. Bunun yerine iş **dayanıklıdır** ve uygulama tekrar etkin olduğunda kaldığı yerden **hızla** devam eder.
- Gerçek sunucu tarafı arka plan yürütme (cihazdan bağımsız) yalnızca bir backend ile mümkündür; bu, local-first mimarinin kapsamı dışındadır ve Phase 9 (bulut) için planlıdır.

## Güvenlik

- Checkpoint transcript'i kalıcı uygulama durumunda saklanır; API anahtarları ve tokenlar transcript'te değil, ayrı güvenli credential katmanındadır (`SECURITY.md`).
- Devam eden bir çalışma, yeni izin gerektiren bir araca ulaştığında yeniden izin kapısından geçer; sessizce yan etki üretmez.
- Yeniden başlatmada tamamlanmış görevlerin yan etkileri asla tekrarlanmaz.
