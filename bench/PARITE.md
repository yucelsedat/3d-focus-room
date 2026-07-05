# PARİTE — VS Code / interaktif Claude Code yetenek kontrol listesi

**Kapanış belgesi (Faz 6).** Her satır: nasıl karşılanıyor, hangi fazda geldi,
kanıt referansı. Faz 4/5 kararı: **Faz 4 (SDK migrasyonu) NO-GO/ertelendi; Faz 5
Fork B (routing) varsayılan.** Gerekçe aşağıda "Go/No-Go" bölümünde.

- **Tarih:** 2026-07-05
- **Kanıt kaynakları:** `bench/BASELINE.md`, `bench/FAZ2.md`, `bench/FAZ3.md`,
  `data/bench/*.json`, `server.js` (satır referansları), bench sunucusu logları

---

## Yetenek tablosu

| Yetenek | Nasıl karşılanır | Faz | Durum · Kanıt |
|---|---|---|---|
| Oturum devamı (multi-turn, sıcak cache) | `PersistentSession` kalıcı süreç | mevcut | ✅ roomchat tur 2-3 ~15K (FAZ2.md); sıcak cache-hit |
| Belirli oturuma resume | `--resume` (sessionId) | mevcut | ✅ `PersistentSession._spawn` (server.js:1631) |
| Turu kesme (interrupt) | loop `abort()` / sekme kapanışında sink düşür | kısmi | ⚠️ Uygulama düzeyinde var (`LoopRunner.abort`, `_detachSink`); SDK `query.interrupt()` temiz-kesme **ertelendi (Faz 4)** |
| Token-token kısmi akış | SSE ile assistant/tool/result olayları | kısmi | ⚠️ Olay bazlı akış var; gerçek token-token (`include_partial_messages`) **ertelendi (Faz 4)** |
| Maliyet görünürlüğü (`/cost` benzeri) | `usage-daily` + tur-başı `[turn-usage]` + `processedTotal` | 1 | ✅ `recordGlobalUsage`/`logTurnUsage` (server.js:1368+), `/api/usage/daily` |
| Sıcak cache prefix (düşük token) | `--exclude-dynamic-system-prompt-sections` + cache TTL env | 2 | ✅ 6 spawn noktası; roomchat −%82, verify 213K→63K (FAZ2.md) |
| Cache TTL kadansa uygun | `FORCE_PROMPT_CACHING_5M` (loop) / `ENABLE_PROMPT_CACHING_1H` (sohbet) | 2 | ✅ `result.usage.cache_creation` kırılımı doğruladı; idle-gap cache-hit (FAZ3.md) |
| Az respawn / disk hijyeni | idle-TTL hizalama + `--no-session-persistence` + respawn daraltma | 3 | ✅ tek-atışlar JSONL yazmıyor; aynı-ayar PATCH respawn atlıyor (FAZ3.md) |
| Çökme sonrası geçmiş koruma | idle/çökmede `--resume` | mevcut/3 | ✅ kill→resume testi: "PAPATYA-42" hatırlandı, ilk-tur cacheWrite 554 token (FAZ3.md) |
| Resume maliyet görünürlüğü | `[resume-cost]` + 100K uyarı eşiği | 1/3 | ✅ `RESUME_COST_WARN_TOKENS` (server.js) |
| MCP/tool yükü kontrolü | `--tools` rol bazlı + `--strict-mcp-config` | 2/mevcut | ✅ worker `MA_WORKER_TOOLS`, roomchat `Read,Glob,Grep,Bash`, review `Read,Glob,Grep,Edit` |
| Bellek güvenliği | RSS bekçisi + hard cap + süreç-grubu kill | mevcut | ✅ `_memWatch` (server.js:1909), `MEM_SOFT_MB=1200` (1585), `process.kill(-pid)` (1840) |
| Bütçe freni | `--max-budget-usd` + işlenen-toplam tavanı | mevcut | ✅ `MA_WORKER_BUDGET_USD=1.5`, `MA_MAX_TOTAL_TOKENS`, `MA_MAX_OUTPUT_TOKENS` (server.js:3003+) |
| Eşzamanlılık sınırı | `MAX_ACTIVE_LOOPS` + `PERSIST_HARD_MAX`→429 | mevcut | ✅ (server.js:2914, 1584) |
| Oturum listesi/isim/etiket | SDK `listSessions/rename/tag` | 4 | ⛔ **ertelendi (Faz 4)** — token paritesi için gerekli değil |
| Dosya checkpoint/geri-alma | SDK file checkpointing | 4 | ⛔ **ertelendi (Faz 4)** |
| Cross-restart/host dayanıklılık | `.recall` (yapısal) + SDK `SessionStore` (konuşma) | mevcut/4 | ⚠️ `.recall` checkpoint mevcut (loop kaldığı yerden devam); konuşma-geçmişi cross-host resume **ertelendi (Faz 4)** |
| Gerçek paralel çok-ajan | worktree izolasyonu | 5 | ⛔ **ertelendi (Fork A)** — çoğu iş sıralı-bağımlı; Fork B (routing) varsayılan |

**Özet:** token/maliyet ve dayanıklılık paritesinin tamamı ✅. Ertelenen satırların
tamamı **SDK-özellik** kalemi (interrupt/partial/listSessions/checkpoint/SessionStore)
— token problemini çözmezler, Faz 4 kararına bağlıdırlar.

---

## Go/No-Go kararı (Faz 4 / Faz 5)

**FAZLAR.md §3 koşulu:** "Faz 1-3'ten sonra ölçüm HÂLÂ boşluk gösteriyorsa Faz 4."

**Denetim — boşluk kapandı mı?** Evet:
- roomchat processedTotal 219.8K → 38.9K (−%82); tur 2-3 ~15K (sıcak interaktif oturum bandında).
- verify 213K → 63K; respawn ilk-tur cacheWrite on binlerce → 554 token.
- direct-cafe: eski bozuk multiagent 2.73M → bugün 131K (direct routing).
- Kullanıcının asıl şikâyeti ("6 kat token") Faz 1-3 ile giderildi.

**Karar: Faz 4 NO-GO (şimdilik).** Faz 4'ün token gerekçesi artık geçersiz; kalan
gerekçeleri **bakım + özellik** (interrupt, partial streaming, listSessions,
SessionStore). Bunlar için tüm transport'u yeniden yazmak yüksek blast-radius'lu ve
maliyet/fayda şu an negatif. Bağımsız ikinci görüş (codex gpt-5.5/high) aynı sonuca
vardı: *"Faz 4 NO-GO. Faz 6 GO. Faz 4.1 sadece feature-flag iskele olarak KOŞULLU.
Faz 5'te default Fork B, Fork A istisna."*

**Faz 4'ün açılma koşulu (gelecekte):** kullanıcı açıkça şu özelliklerden birini
isterse — turu temiz kesme, gerçek token-token akış, oturum listesi/geçmiş UI,
restart sonrası konuşma resume. O zaman İş 4.1 (bayrak arkası SDK adapter iskelesi,
davranış değiştirmez) ile başlanır; roomchat'te bench paritesi kanıtlanmadan
roomsession/multiagent'a geçilmez.

**Faz 5: Fork B varsayılan.** `classifyIdeaScale` + `directManifest` (server.js:3007+)
zaten basit işi direct'e, karmaşığı team'e yönlendiriyor. Worktree paralellik (Fork A)
yalnızca kanıtlanabilir bağımsız çok-domain + kullanıcının açık paralel talebi varken
açılmalı — çoğu focus-room işi sıralı-bağımlı olduğundan istisna kalır.

---

## Before/After (Faz 1 baseline → Faz 2/3)

| Senaryo | Baseline | Sonra | Not |
|---|---|---|---|
| `direct-cafe` (multiagent, direct) | 146.6K¹ | 131.5K (faz2) | ¹Eski bozuk seri-multiagent ~2.73M → routing düzeltmesiyle bu banda indi |
| `roomsession-crud` | 489.2K | 336.7K (faz2) | faz3 koşusu 687K çıktı = ajan varyansı (config aynı); tur-başı log kanonik |
| `roomchat-3turn` | 219.8K | 38.9K (faz2) | Asıl kazanç; tur 2-3 sıcak cache ~15K |

**Parite tanımı (FAZLAR.md/faz6):** aynı iş için tile, sıcak interaktif oturumun
işlenen-toplam token bandında kalmalı. **Dürüst sınır:** birebir interaktif referans
koşusu ayrıca ölçülmedi; parite, sıcak-cache davranışıyla dolaylı gösteriliyor
(tur 2-3 ~15K, respawn ~0.5K — yeni-oturum maliyeti değil, cache-hit).

---

## Guardrail doğrulama

| Guardrail | Doğrulama yöntemi | Sonuç |
|---|---|---|
| Çökme→resume | Canlı kill -9 testi (Faz 3) | ✅ geçmiş korundu, cacheWrite 554 |
| Aynı-ayar respawn kesme | Canlı PATCH testi (Faz 3) | ✅ "respawn atlandı" logu |
| Tek-atış disk hijyeni | JSONL sayımı (Faz 3) | ✅ yalnız worker oturumu yazıldı |
| Bütçe freni | Kod kablolaması (server.js:3183+) + limit-hata yolu (faz2 koşusunda gözlendi) | ✅ iterasyon yakmadan durdu |
| Bellek/süreç-grubu kill | Kod kablolaması (`_memWatch`, `process.kill(-pid)`) + kill→resume ağaç ölümü | ✅ kod-doğrulandı |

**Dürüst not:** süreç-grubu-kill için ayrı bir `ps --ppid` ağaç-ölümü smoke testi
yapılmadı — bu makine (8GB, Chrome+Antigravity ile ~600MB boş RAM) ölçüm sırasında
bir kez OOM-kill yaşadı; ek spawn riskini almak yerine kod-kablolaması + Faz 3
kill→resume kanıtıyla yetinildi.

---

## Kalan öneri (codex + Faz 6 guardrail ruhu)

Kazanımları regresyona kapatmak için bench senaryolarını **eşikli regresyon-guard'ına**
bağlamak değerli olur (ör. `scripts/bench.mjs --assert` ile committed baseline'a karşı
processedTotal/cacheWrite/respawn eşikleri). Bu repo'da CI olmadığından şimdilik
öneri olarak bırakıldı; kullanıcı isterse düşük-riskli bir sonraki adım.
