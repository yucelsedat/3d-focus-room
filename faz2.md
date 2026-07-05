# Faz 2 — Cache-Prefix Sabitleme + Doğrulanmış Bayraklar

**Amaç:** En büyük ucuz kazanç. Cache prefix'ini bozan dinamik bölümleri sabitle, cache TTL'ini loop kadansına göre ayarla, spawn-başı gereksiz keşif yükünü at. **Tüm bayraklar kurulu CLI 2.1.195'te `claude --help` ile DOĞRULANDI.**

**Kanıt:** Prompt caching resmi olarak "zorunlu desen"; cache'i bozan tek şey prefix değişimi. Default system prompt'un dinamik bölümleri (cwd, env, git status, memory) her spawn'da değişir → prefix bozulur → cacheWrite tekrar ödenir. `--exclude-dynamic-system-prompt-sections` bunları ilk user mesajına taşıyıp prefix'i sabitler.

**Ön koşul:** Faz 1 baseline'ı alınmış olmalı (aksi halde kazanç ölçülemez).

---

## İş 2.1 — `--exclude-dynamic-system-prompt-sections` (⭐ en yüksek kaldıraç)
**Neden uygulanabilir:** Kod `--append-system-prompt` kullanıyor (satır 1587 `PersistentSession._spawn`, 3332 architect), yani **default system prompt korunuyor**. Bayrak "yalnız default prompt ile çalışır" kısıtını sağlıyor.

**Uygulama:**
- `PersistentSession._spawn` argümanlarına (satır ~1583) `--exclude-dynamic-system-prompt-sections` ekle.
- `verifyGoal` (2628), `_orchestrate` (3076), architect (3328), bluprint (3669), roomchat (2251) spawn'larına da ekle — hepsi default prompt + `--append-system-prompt` deseninde.
- **Kural:** cwd/env/git artık ilk user mesajına gireceği için, çalışma klasörü yönergesini (zaten prompt'ta var) koru; çift bilgi zararsız ama gereksiz tekrar etme.

**Beklenen etki:** cross-tur ve özellikle respawn sonrası cacheWrite düşer (prefix artık stabil, cache-hit olur). En net kazanç çok-turlu roomchat ve roomsession'da.

## İş 2.2 — Cache TTL'ini kadansa göre ayarla (önceki turda "bilinmiyor" denmişti, artık çözülü)
**Doğrulanmış env'ler (v2.1.108+, kurulu 2.1.195):** `ENABLE_PROMPT_CACHING_1H=1`, `FORCE_PROMPT_CACHING_5M=1`.
- **Hot loop (multiagent worker, roomsession iterasyonları saniyeler/dakikalar arası):** `FORCE_PROMPT_CACHING_5M` — cacheWrite 1.25× (1s'lik 2× yerine). Turlar 5 dk içinde ardışıksa 5m TTL yeterli, yazma %37.5 ucuz.
- **Uzun/sessiz oturum (roomchat, kullanıcı arada uzun düşünür):** `ENABLE_PROMPT_CACHING_1H` — cache 5 dk yerine 1s yaşar, kullanıcı geri dönünce cache-hit.

**Uygulama:** `buildSpawnEnv` (env override noktası) tile tipine göre bu env'i basar. Multiagent/roomsession loop → 5M; roomchat/ai-session → 1H. **ÖNCE `--debug` ile giden gövdedeki `cache_control.ttl`'i doğrula** (env'in gerçekten uygulandığını gör), sonra kalıcılaştır.

## İş 2.3 — `--bare` + tipografi kuralı geri-enjeksiyonu
**Bağlam:** Önceki turda `--bare` "CLAUDE.md tipografi kuralları worker kalitesi için gerekli" diye bilinçli kullanılmamıştı. Ama `--bare` yalnız **keşif/hook/plugin/auto-memory**'yi atar; kuralları `--append-system-prompt-file` ile geri verebiliriz. Böylece spawn-başı ~10× hızlı başlangıç + daha az prefix yükü **kalite kaybı olmadan**.

**Uygulama (dikkatli, opsiyonel — smoke test'e bağlı):**
1. `.claude/agents/_typography.md` gibi minimal bir dosyaya yalnız gerekli kuralları (tipografi + otonom çalışma) çıkar.
2. Worker/verify/orchestrate gibi **interaktif olmayan** spawn'larda: `--bare --append-system-prompt-file .claude/agents/_typography.md` dene.
3. **roomchat/ai-session'da `--bare` KULLANMA** — interaktif kullanımda CLAUDE.md/hook değeri var.
4. Smoke test: tek worker koşusu, çıktı kalitesi + tipografi kuralına uyum kontrol. Kalite düşerse geri al.

**Uyarı:** `--bare` OAuth/keychain okumaz, kimlik doğrulama `ANTHROPIC_API_KEY`/`--settings` ile olur. Kurulumun API key ile çalıştığını doğrula (aksi halde bare spawn auth alamaz).

## İş 2.4 — Tool tanımı yükünü rol bazlı minimuma indir (mevcut kısıtların üstüne)
Zaten `MA_WORKER_TOOLS`, verify `Read,Glob,Grep,Bash` var (kod tabanında). Genişlet:
- roomchat/ai-session gibi kod yazmayan sohbet tile'larında da `--tools` ile gereksiz tool tanımlarını kıs (her cacheWrite'ta ödenen yük).
- Review rolüne yalnız `Read,Glob,Grep` (yazma yok — zaten Edit ile hedefli düzeltme prompt'u var, tool seviyesinde de kilitle).

---

## Uygulama sırası
1. İş 2.1 (exclude-dynamic) — en büyük, en düşük risk, tek satır ×5 spawn noktası.
2. İş 2.2 (cache TTL) — `--debug` ile doğrula, sonra tile tipine bağla.
3. İş 2.4 (tool kısma) — smoke test.
4. İş 2.3 (`--bare`) — en dikkatli, smoke test'e bağlı; kalite riski varsa ertele.

## Doğrulama
- `node --check server.js`; UI dokunulmaz.
- **Her iş'ten sonra Faz 1 bench'ini yeniden koştur** (aynı 3 senaryo) ve `bench/BASELINE.md`'ye karşı fark tablosu üret.
- İş 2.1 sonrası: roomsession-crud senaryosunda respawn sonrası ilk turun cacheWrite'ı belirgin düşmeli (`[resume-cost]` logu).
- İş 2.2 sonrası: `--debug` gövdesinde `cache_control.ttl` beklenen değerde (`5m`/`1h`).
- İş 2.3 sonrası: worker çıktısı tipografi kuralına hâlâ uyuyor (kalite regresyonu yok).

## Kabul kriteri
Üç bench senaryosunun **hepsinde** processedTotal baseline'a göre ölçülebilir düşük (özellikle cacheWrite), **ve** smoke test'lerde çıktı kalitesi korunmuş.

## Risk
- İş 2.1: düşük (yalnız prefix'i stabilize eder).
- İş 2.2: düşük-orta (yanlış TTL cache-miss artırabilir → `--debug` ile doğrula).
- İş 2.3: orta (agresif kısma kaliteyi düşürebilir → smoke test şart, geri alınabilir).
