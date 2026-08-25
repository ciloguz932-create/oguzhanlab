# MCP ve Skill Güvenlik Notları

Bu belge özet bir giriştir; ayrıntılı ve güncel kaynak `SECURITY.md` ve `MCP.md`'dir.

## MCP (standart istemci — Manus'a eşdeğer değildir)

- Yalnızca **Streamable HTTP**; stdio ve OAuth-PKCE **yok** (dürüst sınır — sahte OAuth yok).
- Endpoint eklenirken `assertSafeRemoteUrl` ile SSRF koruması (HTTPS, özel/CGNAT/metadata/IPv6 ULA + IPv4-eşlemeli engelli).
- `tools/list` **güvenilmeyen** içeriktir: ad doğrulama (`isValidMcpToolName`), tekilleştirme, ≤100 araç, 1 MB gövde sınırı, geçersiz JSON reddi (fail-closed).
- Namespaced id (`mcp.<serverId>.<name>`) çakışmayı önler; per-server enable/disable **uygulanır**; devre dışı/kaldırılmış sunucunun araçları katalogdan düşer ve çağrılamaz (`replaceMcpServerTools`).
- Araç adları/açıklamaları/sonuçları asla sistem talimatı değildir; sonuçlar veri olarak, 20 KB'a kesilerek gösterilir.

## Skill (yalnızca talimat — kod yok)

- Yetenek = talimat/iş akışı paketi; **kod taşımaz ve çalıştırılmaz**.
- `validateSkillInput` zorunlu alan + boyut sınırlarını fail-closed doğrular; `makeCustomSkill` kırpar ve `version`/`source: "user"`/`installedAt` damgalar.
- Skill talimatları system policy'yi/izinleri değiştiremez, kimlik bilgisi açığa çıkaramaz; güvenilmeyen içerik sınırında enjekte edilir.

## İzin ve gizlilik modeli

- Risk seviyeleri `low|medium|high|critical`; `high`/`critical` proje-geneli "allow" ile atlanamaz.
- Kimlik bilgileri `expo-secure-store`'da; `AppState`/log/artifact'ten ayrıdır; hata/loglarda maskelenir.

Testler: `tests/mcp-skill-security.test.ts`, `tests/failures.test.ts`, `tests/agent-runtime.test.ts`.
