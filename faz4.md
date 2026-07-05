# Faz 4 — Claude Agent SDK Transport Migrasyonu (Yapısal Parite)

**Amaç:** El-yapımı CLI transport'unu bırak. Şu an kod şunları kendi kendine yönetiyor: `spawn(claude)`, stream-json zarfı kurma, çıktı satırı parse, session pool + idle respawn + eviction + RSS bekçisi + süreç-grubu kill + MCP çocuk temizliği, sessionId takibi, `--resume`, JSONL yol türetimi. **Bunların tamamını `@anthropic-ai/claude-agent-sdk` yerleşik ve bakımlı sağlıyor.** VS Code eklentisi, ChatML ve resmi Anthropic demoları ham CLI değil SDK kullanıyor — parite buradan gelir.

**⚠️ Bu faz yüksek riskli ve büyük. Faz 1'in verisi Faz 2–3'ten sonra hâlâ boşluk gösteriyorsa yap. Uygulamadan önce codex'e ikinci görüş için danışılması önerilir (tek yüksek-riskli mimari hamle).**

**Referans implementasyon:** `anthropics/claude-agent-sdk-demos` → "Simple Chat App" (React + Express + SDK, WebSocket üzerinden streaming, backend oturumu turlar arası tutuyor). Bizim roomchat tile'ının birebir karşılığı.

---

## Neden SDK (kanıt)
| El-yapımı (bugün) | SDK karşılığı | Kazanç |
|---|---|---|
| `PersistentSession` + `SessionPool` + respawn | `query({ continue/resume })`, SDK sessionId'yi izler | Bakım yükü sıfır, format değişimine dayanıklı |
| stream-json parse (`_onLine`) | SDK tipli mesaj akışı (`AssistantMessage`, `ResultMessage`, `StreamEvent`) | Kırılgan parse yok |
| `.recall` + JSONL yol türetimi | `SessionStore` adapter (S3/Redis/DB'ye ayna, cross-host resume) | Restart/host değişiminde sağlam resume |
| Elle abort/kill | `query.interrupt()` | Temiz kesme |
| Kısmi çıktı yok | `include_partial_messages` / partial-message streaming | Gerçek token-token SSE |
| Session listesi elle | `listSessions()`, `getSessionMessages()`, `tagSession()`, `renameSession()` | Agent listesi/geçmiş UI bedava |
| Dosya geri-alma yok | file checkpointing | Ajanın dosya değişikliklerini snapshot/revert |

## Uygulama stratejisi — bayrakla, tile-tipi tile-tipi, geri dönülebilir

### İş 4.1 — Bağımlılık + iskele
- `npm i @anthropic-ai/claude-agent-sdk`.
- `USE_AGENT_SDK` env bayrağı (veya tile-tipi allowlist). Kapalıyken mevcut CLI yolu aynen çalışır — **hiçbir şey bozulmaz.**
- Yeni modül `sdkTransport.js`: `query()` sarmalayıcı, mesaj akışını mevcut SSE olay şemasına (`assistant`/`result`/`done`) çeviren adapter. Amaç: frontend'i **değiştirmeden** transport'u değiştirmek.

### İş 4.2 — İlk tile: roomchat (en basit, zaten kalıcı)
- roomchat'i SDK üzerinden yeniden yaz: ilk mesaj `query({ prompt, options })`, sonraki mesajlar `query({ prompt, options: { continue: true } })` (veya sessionId yakalayıp `resume`).
- sessionId'yi `ResultMessage.session_id`'den yakala, DB `content`'e yaz (bugünkü `formatSessionContent` ile aynı).
- MCP/tools/model/append-system-prompt → `ClaudeAgentOptions` alanlarına map et (`mcpServers`, `allowedTools`, `model`, `appendSystemPrompt`, `settingSources`).
- **Faz 1 bench ile parite kanıtı:** roomchat-3turn senaryosu SDK yolunda CLI yoluna göre token ve davranış olarak **eşit veya daha iyi** olmalı. Değilse migrasyonu durdur, nedenini bul.

### İş 4.3 — roomsession + multiagent'ı SDK'ye taşı
- roomsession iş turu → SDK oturumu (aynı `continue`/`resume`). Verify zaten tek-atış → `query({ maxTurns })` tek çağrı.
- multiagent worker → her görev taze `query()` (stateless-epoch zaten doğru desen; SDK'de `persistSession: false` ile disk'e hiç yazmadan). Çökme-resume gereken görevler için `resume` + sessionId.
- **`fork` fırsatı:** multiagent "alternatif yaklaşım dene" için `forkSession: true` — orijinali bozmadan dallan (Faz 5 ile bağlantılı).

### İş 4.4 — SessionStore (opsiyonel, dayanıklılık)
- `.recall` checkpoint'ini korumaya devam et (yapısal durum), ama konuşma geçmişi resume'u için `SessionStore` adapter yaz (SQLite'a append/load) → restart sonrası konuşma da geri gelir, JSONL yol kırılganlığı biter.

---

## Doğrulama
- `node --check server.js`; `npm run build`.
- `USE_AGENT_SDK` kapalı: mevcut davranış birebir aynı (regresyon yok).
- `USE_AGENT_SDK` açık + roomchat: Faz 1 bench → token/davranış paritesi tablosu (SDK ≤ CLI).
- Interruption testi: uzun turu `interrupt()` ile kes → temiz durur, oturum korunur.
- Cross-restart testi (SessionStore): server restart → roomchat konuşması geçmişiyle devam ediyor.

## Kabul kriteri
En az roomchat SDK transport üzerinden çalışıyor, bench'te CLI yoluna göre parite kanıtlanmış, bayrak kapatılınca eski yol sağlam. roomsession/multiagent migrasyonu ancak roomchat paritesi kanıtlandıktan sonra.

## Risk
**Yüksek.** Azaltma: (1) bayrak arkasında, geri dönülebilir; (2) tile-tipi tile-tipi, her biri bench ile kanıtlı; (3) frontend'e dokunmadan (SSE adapter); (4) codex ikinci görüş. Parite kanıtlanamazsa faz durdurulur, Faz 2–3 kazançlarıyla yetinilir.
