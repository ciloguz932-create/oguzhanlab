# Alt-Agent'lar (Sub-Agents)

Ana agent, karmaşık ve bağımsız parçalara ayrılabilen hedefleri `agent.spawn` aracıyla **rol tabanlı alt-agent'lara** devreder. Alt-agent, kendi kapsamlı `runAgentLoop` örneğidir; sonucu ana agent'a bir gözlem olarak döner (`lib/agent/subagents.ts`).

## Roller

| Rol | Kapsam (yalnızca bu araçlar) | Amaç |
|---|---|---|
| `research` | `web.search`, `web.fetch` | Odaklı web araştırması ve kaynaklı özet |
| `coding` | `github.*` (okuma), `web.fetch` | Depo/kod/issue inceleme ve teknik özet |
| `data` | `calculator.evaluate` | Sayısal analiz, doğrulanmış hesap |
| `writing` | `text.transform` | Metin üretimi/düzenleme |

Her rol **yalnızca salt-okunur** araçlara erişir. Hiçbir rolde dosya yazma, issue oluşturma, e-posta gönderme veya `agent.spawn` yoktur.

## Güvenlik ve sınırlar

- **Kapsam (scoped tools)**: alt-agent kataloğu, ana katalog ∩ rolün araç listesidir. Kapsam dışı araç çağrıları yürütülmez (`dispatchTool`'a hiç ulaşmaz).
- **İzin**: ana agent'ın `agent.spawn` çağrısı izin noktasıdır (MEDIUM risk, izin kapısından geçer). Kullanıcı devretmeyi onayladıktan sonra alt-agent, salt-okunur rol araçlarını otomatik kullanır; iç içe (nested) izin askıya alma oluşmaz.
- **Özyineleme (recursion) koruması**: alt-agent kataloğu `agent.spawn` içermez ve alt-agent'lar `dispatchBase`'i kullanır (`runTool`'u değil); bu yüzden bir alt-agent **başka bir alt-agent oluşturamaz** — yapısal garanti.
- **Bütçe**: alt-agent'lar daha küçük sınırlarla çalışır (`maxSteps=6`, `maxToolCalls=4`) ve çalışma başına en fazla **4** alt-agent üretilir. Model çağrıları ana çalışmanın token/maliyet toplamına eklenir.
- **İptal**: alt-agent, ana çalışmanın `AbortController` sinyalini paylaşır; çalışmayı durdurmak alt-agent'ları da durdurur.
- **Hata yayılımı**: alt-agent başarısız olursa ana agent'a `ok:false` gözlemi döner; ana agent buna göre yeniden planlar.

## Akış

```
Ana agent (Orkestratör yeteneği etkin)
   │  agent.spawn { role:"research", task:"..." }   ← izin kapısı
   ▼
runSubAgent → scoped runAgentLoop (yalnızca rol araçları, auto-allow)
   │  web.search / web.fetch ...
   ▼
Alt-agent final → ToolResult (ok, content)
   ▼
Ana agent gözlem olarak alır → diğer alt-agent'ları toplar → sentezler
```

Ana agent'ı devretmeye yönlendiren yerleşik **Orkestratör** yeteneği, karmaşık/çok parçalı hedeflerde otomatik etkinleşir; basit tek adımlı görevlerde alt-agent kullanılmaz.
