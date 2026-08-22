# Modeller ve Yönlendirme

Uygulama sağlayıcıdan bağımsızdır: modeller her sağlayıcının canlı `/models` uç noktasından alınır. Ana agent ve alt-agent'lar, göreve uygun modeli **Model Router** ile seçer (`lib/agent/model-router.ts`).

## Yönlendirme mantığı

Her çalışma bir gereksinim tier'ına eşlenir (aktif yeteneklerden türetilir; varsayılan `reasoning`):

| Tier | Amaç |
|---|---|
| `reasoning` | Planlama, sentez, karmaşık akıl yürütme |
| `coding` | Kod/depo işleri |
| `vision` | Görsel içeren görevler |
| `fast` | Basit, hızlı, ucuz görevler (ör. alt-agent'lar) |

Seçim önceliği:

1. **Kullanıcı sabitlemesi (override).** Kullanıcı bir tier için belirli bir model sabitlediyse ve bu model bağlantıda mevcutsa, o kullanılır.
2. **Yetenek sezgisi.** Model kimliği ve bildirilen yetenekler taranır (ör. `fable`/`opus`/`sonnet`/`o3` → reasoning; `haiku`/`mini`/`flash` → fast).
3. **Güvenli varsayılan.** Uygun model yoksa bağlantının varsayılan modeline düşülür; böylece yönlendirme asla çalışmayı bloke etmez.

Sabitleme **Ayarlar → AI Sağlayıcıları → Uzman model yönlendirme** ekranından yapılır; "Otomatik" seçilerek kaldırılır.

## Claude Fable 5

Claude Fable 5 (`claude-fable-5`), Anthropic'in en yetenekli yaygın modelidir (1M bağlam). Anahtarınızın erişimi varsa `/models` listesinde otomatik görünür ve seçilebilir; ayrıca reasoning/coding/vision tier'larında sezgisel olarak tercih edilir. Uygulama düz `/v1/messages` çağrısı yaptığından (prefill veya `budget_tokens` göndermez) Fable ile uyumludur. Maliyet tahmini güncel liste fiyatını kullanır ($10/$50 / 1M) ve daima "tahmini" olarak etiketlenir.

## Maliyet tahmini

Token kullanımı sağlayıcıdan geldiğinde tahmini USD maliyet hesaplanır (`lib/agent/usage.ts`). Fiyatlar zamanla değişebileceği için sonuç **her zaman tahmini** olarak gösterilir; en uzun kimlik eşleşmesiyle bulunur, bilinmeyen modeller sağlayıcı varsayılanına düşer.

## Alt-agent'lar

Alt-agent'lar ana çalışmanın model çağrısını paylaşır (aynı model, aynı token toplamı). Basit/okuma ağırlıklı roller için daha ucuz bir `fast` tier modeli sabitlemek, ileride rol bazlı yönlendirme ile genişletilebilir.
