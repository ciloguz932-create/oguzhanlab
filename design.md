# OguzhanLab Agent — Mobil Arayüz Tasarımı

## Tasarım Amacı

OguzhanLab Agent, kullanıcının sadece bir soru sorduğu bir sohbet arayüzü değil; işleri planlayan, araç kullanan, çıktılar üreten ve sürecini görünür kılan **yerel öncelikli bir AI çalışma ortamı** olacaktır. Tasarım, Android önceliği korunurken Apple Human Interface Guidelines’ın okunabilirlik, hiyerarşi ve tek elle kullanım ilkelerine uygun, dikey 9:16 ekranda rahat kullanılan bir yapı hedefler.

## Ekran Listesi

| Ekran | Birincil içerik ve işlev |
|---|---|
| İlk Kurulum / Connect AI | API anahtarını yapıştırma, sağlayıcıyı otomatik algılama, bağlantı testi ve varsayılan model seçimi. |
| Ana Alan | Aktif workspace özeti, devam eden görevler, son artifact’ler ve yeni görev başlatma. |
| Agent Çalışması | Kullanıcı talimatı, canlı plan, görev grafiği, izin istekleri, araç aktivitesi, akış hâlindeki cevap ve artifact listesi. |
| Projeler | Yerel workspace’lerin oluşturulması, seçilmesi, adı değiştirilmesi ve özet durumlarının görülmesi. |
| Görevler | Bekleyen, çalışan, engellenen ve tamamlanan görevlerin filtrelenebilir listesi; duraklatma, devam ettirme, yeniden deneme ve iptal denetimleri. |
| Dosyalar / Artifact’ler | Workspace dosyaları ve agent çıktılarının tür, tarih ve görev bağlamı ile listelenmesi; metin artifact’lerini uygulama içinden görüntüleme. |
| Sağlayıcılar | Birden fazla sağlayıcının güvenli kimlik bilgileri, bağlantı durumu, model listesi ve varsayılan model tercihi. |
| MCP | Yerel veya uzak MCP sunucu tanımı, keşfedilen araçlar, bağlantı durumu ve sunucu düzeyinde etkinleştirme denetimi. |
| Ayarlar | İzin politikaları, çevrimdışı mod, kalıcı bellek tercihleri, log düzeyi ve tüm yerel verileri temizleme. |

## Ana Kullanıcı Akışları

İlk akışta kullanıcı uygulamayı açar, API anahtarını tek alana yapıştırır ve sağlayıcı algılaması gösterilir. Bağlantı testi başarılı olursa erişilebilir modeller yüklenir; kullanıcı otomatik seçimle devam edebilir ya da varsayılan modeli değiştirebilir. Anahtar, görüntülenmeden cihazın güvenli depolama alanına alınır ve kullanıcı ana çalışma alanına yönlendirilir.

Görev akışında kullanıcı aktif workspace içinden bir hedef yazar. Uygulama önce görevi anlamlandırır, sonra bağımlılıkları olan bir görev grafiği oluşturur ve kullanıcıya kompakt bir plan özeti gösterir. Çalışma sırasında durum kartları, okunabilir aktivite olayları ve üretilen dosyalar akış hâlinde güncellenir. Yüksek riskli bir eylem gerektiğinde işlem kesilir; kullanıcı bir alt sayfa yerine bağlamı koruyan bottom sheet üzerinden bir defalık veya proje çapında izin verir ya da reddeder.

Tamamlanma akışında agent doğrulama olayını kaydeder, artifact’i workspace’e bağlar ve görev durumunu tamamlandı yapar. Kullanıcı artifact ekranından içeriği açabilir, paylaşabilir veya görevin ayrıntılarına dönerek adımları inceleyebilir. Uygulama yeniden açıldığında yerel saklanan workspace, görev, aktivite ve artifact metadata’sı tekrar yüklenir.

## Düzen ve Etkileşim İlkeleri

Alt sekme çubuğu yalnızca en yüksek frekanslı alanları taşır: **Ana Alan**, **Projeler**, **Görevler**, **Dosyalar** ve **Ayarlar**. Sağlayıcılar ve MCP, Ayarlar içindeki ayrı tam ekran listelerden açılır; bu yaklaşım hem 9:16 ekranda bilgi yoğunluğunu sınırlar hem de tek elle erişilebilirliği korur. Yeni görev, Ana Alan ve Agent ekranında sabit olmayan ama başparmak erişim bölgesinde konumlanan belirgin bir ana eylemle başlatılır.

Agent ekranı üç katmanlıdır: üstte kısa hedef ve durum, ortada canlı plan/aktivite zaman çizelgesi, altta sohbet girişi ve artifact bağlamı. Teknik ham log’lar varsayılan olarak saklanır fakat göz önünde tutulmaz; kullanıcı isteğiyle açılabilen detay alanında gösterilir. Uzun listeler `FlatList` ile sanallaştırılacak ve hiçbir araç çıktısı doğrudan kontrolsüz uzunlukta arayüze yazdırılmayacaktır.

## Renk Seçimleri

Uygulamanın marka dili, araç kullanımı ve güven hissi için koyu lacivert taban ile parlak elektrik turkuazı kullanır. Açık modda arka plan sıcak beyaz, koyu modda gece mavisidir. Başarı, izin ve hata durumları semantik renklerle ayrışır.

| Amaç | Açık mod | Koyu mod |
|---|---:|---:|
| Birincil vurgu | `#0C6EAF` | `#42B6F5` |
| Arka plan | `#F7F9FC` | `#0B1220` |
| Yüzey | `#FFFFFF` | `#121D2E` |
| Ana metin | `#10243E` | `#EAF2FF` |
| İkincil metin | `#63748A` | `#9BACBF` |
| Başarı | `#11845B` | `#45D6A4` |
| Uyarı / izin | `#B56A00` | `#FFC561` |
| Hata | `#C33C4A` | `#FF8893` |

## Erişilebilirlik ve Durum İletişimi

Metin hiyerarşisi dinamik yazı boyutlarıyla uyumlu tutulacak, sadece renge dayalı durum bildirilmesinden kaçınılacak ve tüm kritik kontrol alanlarına erişilebilir etiketler eklenecektir. Uzun görevlerde her zaman gözle görülür bir çalışma durumu, son güncellenme bilgisi ve kullanıcı denetimleri bulunacaktır. Çevrimdışı durumda internet gerektiren eylemler kapatılacak, buna karşılık yerel workspace ve geçmiş görevler açık kalacaktır.
