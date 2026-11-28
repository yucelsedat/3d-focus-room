# Focus Room — Session Tile'ları Yol Haritası

Tarih: 2026-11-28 · Önceki iş: `bench/FAZ2.md`, `bench/FAZ3.md` (Faz 1-3 tamamlandı)
Kapsam: AI Session, Oda Sohbeti, Oda Projesi (LoopFlow), MultiAgent, Blueprint, verify
ajanı ve bunların üstüne kurulacak yeni tile'lar.

Bu belge iki şey içerir: (1) dış araştırmadan ve kendi kullanım verimizden çıkan
**teşhis**, (2) aşamalara bölünmüş **kodlama yol haritası**. Önceki token çalışması
"Faz 1-6" adlarını kullandı (`bench/PARITE.md`; orada Aşama 1 = SDK migrasyonu, NO-GO).
Karışmasın diye bu yol haritası **Aşama 1-9** kullanır.

---

## Durum (2026-11-28, ölçülmüş sonuçlar)

Bu tablo aşağıdaki planın **önüne geçer**: plandaki bazı maddeler ölçümle çürütüldü.
Ayrıntı ve ham veri `bench/ASAMA*.md`, `data/bench/`.

| Aşama | Durum | Ölçülen sonuç / karar |
|---|---|---|
| 1 Kota ölçümü | ✅ main | `quotaPoints`, soğuk tur (turun **ilk** isteği; `iterations` son isteği taşır), model kırılımı |
| — Ajan koruma hook'u | ✅ main | `pkill -f "node server.js"` backend'i öldürmüştü; desen/port/PID kill reddediliyor |
| 2a Spawn profilleri | ✅ main | tüm argv tek modülde; snapshot testi |
| 3 Spawn diyeti | ✅ main + kapanış branch'i | roomsession-crud **−%47** (n=3+3); roomsession 1h TTL idle sohbette **−%66**; verify Haiku 5.5 (~10× ucuz); `--json-schema` **reddedildi** (çıktı/tur artırıyor); kısa yanıt kuralı **ertelendi** (metin çıktının %9-21'i) |
| 4 Bağlam hijyeni | ⏸ ertelendi | bench'te araç çıktısı koşu başına 0.5-1.9K karakter, kazanç ≈ 0; gerçek kullanım `toolResultChars` ile ölçülüyor |
| 5 Loop v2 | ◑ ölçüldü | **taze oturum reddedildi** (3 iterasyonda +%22); deterministik oracle **ürüne alınmadı** (verify hatasına doğrulanmış kanıt yok), bench'te duruyor |
| 6 Model yönlendirme | ◑ ölçüldü | Sonnet 5.5 Opus'a göre −%48/−%60, kalite aynı. **Kullanıcı kararı: varsayılan Opus kalır** |
| 8 Tile arayüzü | ◑ kısmen | tur/oturum kota satırı, gerçek bağlam penceresi |
| 7, 9, 2b | ⏳ | sırada |

## 0. Kısa özet

Faz 1-3 "önbellek tutmuyor" sorununu büyük ölçüde çözdü. Kalan maliyet artık başka
yerlerden geliyor ve şu ana kadar yanlış metrikle ölçtüğümüz için bir kısmı görünmüyordu:

1. **Yanlış şeyi optimize ediyoruz.** `processedTotal` cache okumasını diğer token'larla
   eşit sayıyor. Abonelik sayacında ise bir çıktı token'ı yaklaşık 260 cache-okuma
   token'ı kadar yer kaplıyor (bkz. §1.1). Bizim verimizde **sayacın ~%60'ını çıktı,
   ~%25'ini cache yazma** tüketiyor. Cache okuma sadece ~%12.
2. **Çıktıyı ve soğuk başlangıçları büyüten ayarlar var.** Global `effortLevel: high`
   her spawn'a sızıyor (düşünme token'ları çıktı sayılır). Oda Projesi'nde zorlanan
   5 dakikalık önbellek süresi, aboneliğin varsayılan 1 saatini eziyor. Ayrıca LoopFlow
   aynı oturumu iterasyonlar boyunca büyütüyor.
3. **Her spawn gereksiz yük taşıyor.** Kullanıcının eklentileri, skill listesi,
   SessionStart hook çıktısı ve global `CLAUDE.md` her `claude -p` sürecine giriyor.
4. **Doğrulama pahalı ve belirsiz.** verify bir LLM ajanı. Her iterasyonda 25-35K
   cache yazıyor ve "bitti" kararını yine bir modele bırakıyor. Anthropic'in kendi
   uzun-süreli ajan deneyimi ve Ralph-loop topluluğu aynı sonuca varıyor: deterministik
   bir kontrol (test, build, HTTP) ve dosyada tutulan özellik listesi daha ucuz ve
   daha güvenilir.

Yol haritası: **Aşama 1** ölçümü düzeltir. **Aşama 2** session kodunu `server.js`'ten
ayırır. **Aşama 3-6** maliyeti düşürür (spawn diyeti, bağlam hijyeni, Loop v2, model
yönlendirme). **Aşama 7-9** MultiAgent v2, tile arayüzü ve yeni tile tipleri.

---

## 1. Teşhis

### 1.1 Abonelik sayacı token türlerini çok farklı tartıyor

Abonelikte token kotası yok; 5 saatlik ve haftalık iki yüzdelik sayaç var. Atlas ADE
ekibinin canlı sayaca karşı ölçtüğü ağırlıklar (Ultra plan, Opus; **üçüncü taraf ölçüm,
Anthropic resmi rakam yayınlamıyor**):

| Token türü | Haftanın %1'i kaç token | Bir çıktı token'ına denk |
|---|---:|---:|
| Çıktı (düşünme dahil) | 460K | 1 |
| Girdi | 2M | ~4 |
| Cache yazma | 3.2M | ~7 |
| Cache okuma | 120M | ~260 |

Bizim `data/usage-daily.json` verimize uygulanınca:

| Gün · tile | Çıktı | Cache yazma | Cache okuma | Girdi | Tahmini Ultra haftası |
|---|---:|---:|---:|---:|---:|
| 2026-07-17 · roomsession | **%62** | %24 | %12 | %2 | ~%0.59 |
| 2026-07-22 · roomsession | **%40** | %30 | %29 | %1 | ~%0.26 |

Sonuç: Faz 1-3'te cache okumayı (kadratik büyüme) baş düşman saymıştık. Dolar
cinsinden doğruydu, ama abonelik kotasında asıl kalemler **çıktı** ve **cache yazma**.
Bu yüzden öncelik sırası değişiyor:

- Çıktıyı küçült: efor seviyesi, model seçimi, kısa yanıt kuralları, yapılandırılmış
  (JSON) çıktı.
- Soğuk başlangıçları azalt: yeniden doğuş (respawn), önbellek süresinin dolması,
  model değişimi, sıkıştırma (compaction). Atlas'ın tablosunda 200K bağlamlı soğuk bir
  tur, sıcak turun ~11 katı yer kaplıyor; 800K'da ~23 katı.
- Cache okuma hâlâ önemli ama üçüncü sırada.

### 1.2 Headless `claude -p` farklı sayılıyor olabilir

Focus Room'daki her şey `claude -p` (headless) ile çalışıyor. İki bağımsız üçüncü taraf
ölçüme göre (Atlas ADE, claude-usage-tracker) Pro ve Max planlarda headless iş, aynı
işin interaktif haline göre 5 saatlik sayacı **~1.5 kat** daha hızlı ilerletiyor.
Haftalık sayaç daha az etkileniyor. Ultra'da 5 saatlik limit 2026-10-31'den beri yok.

Bunu koddan değiştiremeyiz. Ama "VS Code'dan daha pahalı hissettiriyor" şikâyetinin
yapısal bir açıklaması bu olabilir. Pratik sonucu: **token kadar tur sayısı da önemli.**
Anthropic bunu resmi olarak doğrulamadı; Aşama 1'deki ölçümle kendi hesabımızda test
edeceğiz.

### 1.3 Önbellek süresi (TTL) ayarı aboneliğe göre yanlış

Resmi doküman (`code.claude.com/docs/en/prompt-caching`): abonelikte plan kotası
içindeyken ana konuşma (interaktif, `-p` ve Agent SDK turları) varsayılan olarak
**1 saatlik** önbellek alıyor. Subagent'lar ve yardımcı istekler 5 dakika alıyor.

Bizde [server.js:2508](server.js#L2508) `roomsession` ve `multiagent` için
`FORCE_PROMPT_CACHING_5M=1` koyuyor. Bu, öncelik sırasında en üstteki ayar; her şeyi
5 dakikaya zorluyor. Faz 2'deki gerekçe API fiyatıydı (5 dakikalık yazma 1.25×,
1 saatlik 2×). Abonelikte ise asıl maliyet soğuk başlangıç. Oda Projesi tile'ı hem
LoopFlow hem de **interaktif sohbet** olarak kullanılıyor. Kullanıcı 5 dakikadan uzun
düşünürse sonraki tur tüm prefix'i yeniden yazıyor.

Aynı zorlama verify, orchestrate ve projectview-detect için de var
([server.js:4016](server.js#L4016), [server.js:4464](server.js#L4464),
[server.js:3070](server.js#L3070)). Tek seferlik spawn'larda zararsız olabilir. Ama
ardışık verify çağrıları aynı sistem prompt'unu paylaşıyor ve iterasyonlar arası boşluk
5 dakikayı aşabiliyor.

**Karar ölçümle verilmeli:** Aşama 3'te A/B testi var (aşağıda).

### 1.4 LoopFlow bağlamı iterasyonlar boyunca büyütüyor

`LoopRunner._workTurn` ([server.js:4164](server.js#L4164)) her iterasyonda aynı
`roomsession:<id>` kalıcı oturumuna yazıyor. 8 iterasyonluk bir koşuda 8. tur ilk 7 turun
tüm araç çıktılarını yeniden okuyor. Bağlam büyüdükçe otomatik sıkıştırma tetikleniyor;
bu da soğuk başlangıç ve kalite kaybı demek. MultiAgent bu sorunu "stateless epoch" ile
zaten çözdü ([server.js:4480](server.js#L4480) civarı: 2.46M cacheRead ölçümü).
LoopFlow çözmedi.

Ek sorun: kullanıcının elle yazdığı sohbet ile otonom döngü aynı oturumu paylaşıyor.
Biri diğerinin bağlamını kirletiyor.

### 1.5 Her spawn kullanıcının global ayarlarını taşıyor

Spawn argümanlarında `--setting-sources` yok. Bu yüzden her süreç şunları yüklüyor:

- `~/.claude/settings.json`: `effortLevel: high`, `model: opus` ve 3 eklenti
  (frontend-design, last30days, opendesign).
- Eklentilerin skill listesi ve **last30days'in SessionStart hook'u** (her oturumun
  başına metin basıyor).
- 12 kullanıcı skill'i, global `~/.claude/CLAUDE.md` (tipografi kuralları,
  graphify notu) ve `rules/context7.md`.

Bir verify ajanının ya da bir worker'ın bunların hiçbirine ihtiyacı yok. Üstelik
`effortLevel: high` her rolde düşünme (= çıktı) token'ını artırıyor.

Not: `--bare` bu işi tek bayrakla yapardı ama **abonelik girişini (OAuth) okumuyor**,
sadece `ANTHROPIC_API_KEY` kabul ediyor (yerel `claude --help` çıktısıyla doğrulandı).
Bu yüzden `--setting-sources project,local` + `--disable-slash-commands` + açık
`--effort` kullanacağız.

### 1.6 Araç çıktısı gürültüsü bağlamda kalıyor

Oda projelerinin tipik araç çıktıları `npm install`, `vite build`, dev server logları ve
test çıktıları. Hepsi oturumun geri kalanı boyunca her turda yeniden okunuyor.
Claude Code v2.1.121'den beri `PostToolUse` hook'u, **Bash dahil her aracın** çıktısını
model görmeden önce değiştirebiliyor (`updatedToolOutput`).

Dış araçların ölçümleri dürüst okunmalı:

- slimctx: sabit örneklerde %85, ama gerçek bir aylık geçmişte sadece %3
  (çünkü rtk zaten açıktı ve büyük çıktıların çoğu bilinçli dosya okumalarıydı).
- ctxprune: gerçek Linux Claude Code oturumlarında %0.3.
- squeez: örnek senaryolarda %91.

Bizim iş yükümüz (npm/vite/test) bu araçların en iyi sonuç verdiği tür. Ama kazancı
kendi bench'imizle ölçmeden iddia etmeyeceğiz.

### 1.7 Doğrulama bir LLM'e bırakılmış

`verifyGoal` ([server.js:4004](server.js#L4004)) en fazla 12 tur süren, dosya okuyan bir
haiku ajanı. Mevcut verilerde verify günde 50-150K cache yazıyor. Daha önemlisi, "hedef
karşılandı mı" sorusunu yine bir modele soruyoruz. Anthropic'in "Effective harnesses for
long-running agents" yazısındaki iki hata modu bizde de görülebilir:

- Ajan her şeyi tek seferde yapmaya çalışıyor, bağlamı ortada bitiyor.
- Sonraki bir ajan ilerlemeyi görüp işi erken "bitti" sayıyor.

Önerilen çözüm:

- İlk oturumda `feature_list.json` (her özellik `passes:false` ile başlıyor),
  `progress.md` ve `init.sh` yazılıyor.
- Her sonraki oturum tek bir özellik üzerinde çalışıyor, git commit atıyor ve uçtan uca
  test ediyor.

---

## 2. Araştırmadan çıkan dersler

| Yaklaşım | Ne yapıyor | Bildirilen etki | Focus Room'a uyarlama |
|---|---|---|---|
| Anthropic uzun-süreli ajan düzeneği | Başlatıcı oturum + kodlama oturumu, `feature_list.json`, `progress.md`, git commit | Erken "bitti" ve yarım bırakma hatalarını azaltıyor | **Loop v2'nin iskeleti** (Aşama 5) |
| Ralph loop | Her iterasyon yeni süreç, durum dosyada, bitişe test karar veriyor | Bağlam çürümesi yapısal olarak yok | Stateless iterasyon + deterministik kontrol (Aşama 5) |
| Context editing / compaction (API) | Eski araç sonuçlarını silme, sunucu tarafı özet | 100 turluk testte %84 daha az token (Anthropic) | CLI'da doğrudan yok; hook'larla kendi "eski çıktıyı kırp" katmanımız (Aşama 4) |
| RTK / slimctx / squeez / tokenslim | Bash çıktısını hook'ta sıkıştırıyor, orijinali diskte tutuyor | Sabit örneklerde %60-90, gerçek geçmişte %0.3-3 | Kendi küçük hook'umuz, **sadece spawn'larımıza**, `--settings` ile (Aşama 4) |
| context-mode | Büyük çıktıyı sandbox'ta tutuyor, FTS5 ile aranabilir yapıyor | 315 KB → 5.4 KB (örnek) | Büyük log'lar için "dosyaya yaz + özet ver" deseni (Aşama 4) |
| Code Mode / programmatic tool calling | Ara sonuçları kodda tutup modele sadece özeti veriyor | Örnekte 150K → 2K; üretimde %20-40 | Claude Code **dynamic workflows** ile MultiAgent fan-out (Aşama 7) |
| Advisor (`--advisor`) | Ucuz yürütücü + güçlü danışman, karar noktalarında | Sonnet 5 + Fable: Fable'ın ~%92 skoru, ~%63 maliyet (iddia) | Oda Projesi'nde Sonnet + Opus danışman (Aşama 6). **Uyarı:** bir saha testinde Sonnet danışmana istenmeden hiç başvurmadı |
| opusplan | Planı Opus, yürütmeyi Sonnet yapıyor | Yürütme ağırlıklı işte büyük tasarruf | "Planla → onayla → yürüt" akışı (Aşama 6) |
| Code graph MCP (codebase-memory, serena) | Dosya okuma yerine graf sorgusu | Bir çalışmada 10× az token (%83 vs %92 kalite); bir başkasında bazen **daha pahalı** | Oda projeleri küçük; şimdilik yapma. graphify'ı sadece büyük projede dene (Aşama 9, isteğe bağlı) |
| Vibe Kanban, Worktree Kanban, Tessera, Conductor | Görev başına git worktree, kanban, diff incelemesi, kart üstünde onay | UX deseni | Görev Panosu ve İnceleme Masası tile'ları (Aşama 8-12) |
| Atlas ADE, claude-usage-tracker | Sayaç ağırlıklarını ölçüyor | §1.1 tablosu | "Kota puanı" metriği (Aşama 1) |

Kategori notu: Conductor Meta'ya katılıp kapanıyor, Vibe Kanban'ı geliştiren şirket
kapandı. **Kendi orkestrasyonumuzu dış bir araca bağlamıyoruz.** Desenleri alıp kendi
tile'larımızda uyguluyoruz.

---

## 3. Hedef mimari

```
                   ┌───────────────────────── server/sessions/ ─────────────────────────┐
 Tile (UI) ──HTTP──▶ routes.js ──▶ SessionKernel                                          │
                   │                 ├─ profiles.js    tile → SpawnProfile               │
                   │                 │    (model, effort, advisor, tools, mcp,           │
                   │                 │     settingSources, ttl, maxTurns, budget, hooks) │
                   │                 ├─ spawn.js       profile → claude argv + env        │
                   │                 ├─ persistent.js  PersistentSession (sıcak süreç)    │
                   │                 ├─ pool.js        SessionPool (LRU, RSS bekçisi)     │
                   │                 ├─ ledger.js      tur muhasebesi + kota puanı        │
                   │                 └─ hooks/         PostToolUse çıktı sıkıştırıcı      │
                   │                                                                    │
                   │ LoopEngine v2 (loop.js)                                            │
                   │   init epoch → feature_list.json / progress.md / init.sh           │
                   │   her iterasyon: taze oturum · tek özellik · commit                │
                   │   oracle.js: deterministik kontrol → gerekirse LLM verify (JSON)   │
                   └────────────────────────────────────────────────────────────────────┘
```

İlke: **her spawn bir profilden türer.** Şu an argümanlar 6 farklı yerde elle
diziliyor (`_spawn`, `verifyGoal`, `_orchestrate`, architect, bluprint-build,
projectview-detect). Bir ayarın (ör. `--setting-sources`) her yere eklenmesi bu yüzden
hata yapmaya açık.

---

## 4. Aşamalar

Her aşama için: amaç, işler, dokunulan dosyalar, kabul kriteri. Her aşama bench ile
kapanıyor (§5).

### Aşama 1 — Doğru ölçüm (önce bu)

**Amaç:** Hangi değişikliğin kotayı gerçekten düşürdüğünü görmek. Mevcut
`processedTotal` bu soruyu cevaplayamıyor.

1. `ledger.js` ekle (şimdilik `server.js` içinde bir fonksiyon olabilir).
   `quotaPoints = out/460K + in/2M + cw/3.2M + cr/120M`, haftalık yüzde cinsinden,
   model ailesine göre katsayı: Sonnet ≈ Opus × 0.6, Haiku ayrı tahmin. Katsayılar
   `data/quota-weights.json`'da tutulsun, değiştirilebilsin. "Tahmin" etiketiyle göster.
2. `recordGlobalUsage` ve `addUsage` alanlarına `quotaPoints` ekle. Yanına şunları
   kaydet: `turns` (araç-tur sayısı, `result.num_turns`), `cw_1h` / `cw_5m` kırılımı
   (`usage.cache_creation`), `model` ve efor.
3. "Soğuk tur" tespiti: bir turda `cw > 0.5 × (cr + cw)` ise `cold=true` say.
   Tile ve gün bazında soğuk tur oranını tut.
4. `scripts/bench.mjs` çıktısına `quotaPoints`, `coldTurns`, `turns` ekle;
   `bench/METHOD.md`'yi güncelle.
5. `GET /api/usage/daily` yanıtına `quotaPoints` ekle (Kota Panosu tile'ı bunu kullanacak).

**Kabul:** Mevcut üç senaryo (`roomsession-crud`, `roomchat-3turn`, `roomchat-idlegap`)
yeni metrikle koşulup `bench/ASAMA1.md`'ye yazıldı.

### Aşama 2 — Session çekirdeğini `server.js`'ten ayır

**Amaç:** 5140 satırlık dosyada session kodu yaklaşık 2160-4830 satırları arasında.
Sonraki fazların hepsi bu bölgeye dokunuyor.

1. Taşınacaklar:
   - `server/sessions/persistent.js` ← `PersistentSession`
   - `pool.js` ← `SessionPool`, `ensureSessionOr429`
   - `spawn.js` ← `buildSpawnEnv`, `mcpArgs`, `permissionArgs`, `cliModel`,
     `runClaudeCapture`
   - `loop.js` ← `LoopRunner`, `MultiAgentRunner`, `verifyGoal`
   - `ledger.js` ← usage fonksiyonları
2. `profiles.js` ekle. Her tile tipi ve her tek-atış rol (verify, orchestrate, architect,
   bluprint-build, projectview-detect) için tek bir `SpawnProfile` nesnesi tanımla.
   `spawn.js` argv'yi sadece profilden üretsin.
3. **Davranış değişikliği yok.** Spawn argv'leri refactor öncesi ve sonrası birebir
   aynı olmalı. Bunu bir test sağlasın: her profil için argv snapshot'ı
   (`scripts/verify-spawn-argv.mjs`).

**Kabul:** argv snapshot testi geçiyor; bench sonuçları Aşama 1 baseline'ının gürültü
payı içinde.

### Aşama 3 — Spawn diyeti

**Amaç:** Her spawn'ın başlangıç yükünü ve çıktısını küçültmek.

0. **İlk ölçüm (Aşama 1'den gelen bulgu, `bench/ASAMA1.md`):** sıcak bir ai-session'da
   önemsiz ikinci tur 11.313 token cache yazdı. Önce bunun kaynağını bul: aynı 2 tur,
   `--setting-sources` açık ve kapalı, `cw` karşılaştırması.

1. **Ayar kaynağı izolasyonu:** tüm profillerde `--setting-sources project,local`.
   Worker, verify, orchestrate ve architect için ek olarak `--disable-slash-commands`.
   Kullanıcının elle sohbet ettiği tile'larda (AI Session, Oda Sohbeti) skill'ler
   açık kalabilir; bu profil bazında bir seçenek olsun.
   - Doğrulama: global `CLAUDE.md` ve SessionStart hook çıktısı artık ilk turda
     görünmüyor (`--output-format stream-json`'daki `system/init` olayından ve ilk tur
     `cw`'sinden kontrol).
2. **Efor açık:** her profilde `--effort` açıkça verilsin.
   - verify, orchestrate: `low`
   - worker ve Oda Projesi: `medium`
   - Blueprint ve architect: `high`
   - Tile ayarındaki efor seçimi bunun üstüne yazsın. Şu anki `CLAUDE_EFFORT` env yolu
     ([server.js:2502](server.js#L2502)) bayrağa taşınsın.
3. **TTL A/B testi:** `roomsession` için üç kol:
   - (a) mevcut `FORCE_PROMPT_CACHING_5M`
   - (b) varsayılan (abonelikte 1 saat)
   - (c) `CLAUDE_CODE_PROMPT_CACHE_TTL=1h` + `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL=5m`

   Senaryolar: `roomsession-crud` ve yeni bir `roomsession-chat-idlegap` (3 tur, 6 dakika
   ara). Karar `quotaPoints` ve soğuk tur oranına göre verilecek. Muhtemel sonuç: sohbet
   için (b) veya (c), sıkı döngü iterasyonları için kısa TTL. Bu ayrımı Aşama 5 zaten
   getiriyor, çünkü döngü kendi oturumunu kullanacak.
4. **Yapılandırılmış çıktı:** verify ve orchestrate'e `--json-schema` ver. Regex ile
   JSON avlamak ([server.js:4466](server.js#L4466) civarı) yerine şemaya uygun yanıt
   alınsın; boş laf (= çıktı token'ı) kesilsin.
5. **Kısa yanıt kuralı:** worker ve Oda Projesi `sys` prompt'una 2-3 satırlık bir kural
   ekle: "Açıklama yazma, sonunda ne değiştiğini en fazla 5 madde ile özetle." Çıktı en
   pahalı token olduğu için bu ucuz bir kazanç. Kalite düşüşü bench'te izlenecek.
6. `VERIFY_MODEL`'i ([server.js:4003](server.js#L4003)) sabit kimlik yerine `haiku`
   takma adına çevir. Haiku 5.5 kullanılabilir.
7. Her tek-atış profile `--fallback-model` ekle. 529 (aşırı yük) hatasında döngü
   iterasyon yakmasın.

**Kabul:** `roomsession-crud` için `quotaPoints` Aşama 1 baseline'ına göre en az %25
düşük, verify geçme oranı aynı. (Hedef bir rakam; tutmazsa hangi kalemin tutmadığı
yazılacak.)

### Aşama 4 — Bağlam hijyeni hook'ları

**Amaç:** Araç çıktısının bağlamda kalan kısmını küçültmek. Kullanıcının kendi
Claude Code oturumlarına dokunmadan, sadece Focus Room spawn'larında.

1. `server/sessions/hooks/compress.mjs`: bağımlılıksız bir Node betiği, `PostToolUse`
   hook'u olarak çalışacak.
   - Bash çıktısında: ANSI kodlarını ve ilerleme çubuklarını sil, tekrar eden satırları
     daralt, geçen testleri say ve sadece başarısızları göster, `npm install` ve
     `vite build` gürültüsünü özetle.
   - Uzun çıktıyı baş + son + ortadaki hata satırları olarak kes.
   - **Orijinali** `<proje>/.focus-room/raw/<hash>.log`'a yaz, özetin sonuna yolunu ekle
     (kayıpsız geri dönüş).
2. Net kazanç koruması: çıktı ancak en az 80 token **ve** en az %25 küçülüyorsa
   değiştirilsin (slimctx'in kuralı).
3. Tekrar okuma tekilleştirme: aynı dosya değişmeden tekrar okunursa
   "değişmedi, bkz. önceki okuma" döndür (squeez, tokenslim deseni).
4. `PreToolUse` koruması: 600 satırı aşan tüm-dosya `Read` çağrısında önce sembol
   özeti döndür (outline-first). İkinci denemede tüm dosyayı ver.
5. Hook, profil üzerinden `--settings` JSON'una eklenir. Permission hook'u da zaten bu
   yoldan geliyor ([server.js:1933](server.js#L1933)).
6. Her müdahaleyi ledger'a yaz: önce ve sonra byte, araç adı, kurtarma (orijinal tekrar
   okundu mu?). Kurtarma oranı %15'i geçerse kural çok agresif demektir.

**Kabul:** Bench'te araç çıktısı token'ları en az %40 düşük, kurtarma oranı %15'in
altında, görev geçme oranı aynı.

### Aşama 5 — Loop motoru v2 (LoopFlow'un yeniden yazımı)

**Amaç:** §1.4 ve §1.7'deki iki yapısal sorunu birlikte çözmek.

1. **Başlatıcı epoch:** ilk koşuda ayrı bir prompt'la (Opus veya Blueprint profiliyle)
   şu dosyaları üret:
   - `feature_list.json`: her özellik `{id, description, steps[], passes:false}`
   - `progress.md`
   - `init.sh`: kurulum ve dev server başlatma
   - `oracle.json`: deterministik kontrol tanımı (bkz. madde 3)

   Ardından ilk git commit'i at. Kullanıcı bu listeyi tile'da görüp düzenleyebilsin.
2. **Stateless iterasyon:** her iterasyon taze bir oturumla başlasın. Prompt şunları
   içersin: `progress.md`'nin sonu, `git log --oneline -10` ve sıradaki tek özellik.
   - Aynı özellik yarıda kaldıysa (çökme, limit) o özelliğin oturumuna `--resume`
     edilsin. MultiAgent'taki kural aynen uygulanır.
   - Kullanıcının sohbet oturumu (`roomsession:<id>`) döngüden ayrılsın; döngü kendi
     anahtarını kullansın (`roomsession-loop:<id>:<featureId>`).
3. **Deterministik oracle** (`oracle.js`): `oracle.json` şunları tanımlar:
   - komutlar ve beklenen çıkış kodu (`npm test`, `npm run build`)
   - HTTP kontrolleri (`GET /` → 200 ve içinde X)
   - isteğe bağlı bir Playwright betiği

   Oracle model çağırmadan çalışır. LLM verify sadece oracle geçtiğinde ve özelliğin
   "kullanıcı gözüyle" kontrolü gerektiğinde, `--json-schema` ile ve tek dosya
   bağlamıyla çağrılır.
4. **İlerleme ve takılma tespiti:**
   - İki ardışık iterasyonda ne `passes` değişti ne diff anlamlı büyüdü ise dur ve
     kullanıcıya sor.
   - Ralph topluluğunun ve Anthropic'in ortak uyarısı: üst sınır olmadan döngü kotayı
     yakar. `maxIterations` korunur; yanına `maxQuotaPoints` bütçesi gelir.
5. **Git ile geri alma:** her iterasyon sonunda commit. Oracle bir önceki commit'te
   geçen bir özelliği bozduysa otomatik `git revert` önerisi göster (otomatik yapma).
6. `recall` şeması v2: `{features, currentFeature, epochs[{featureId, sessionId,
   quotaPoints, oracle, commit}], budget}`. v1 recall dosyaları okunup dönüştürülsün.

**Kabul:**
- Yeni `roomsession-features-3` senaryosu (3 özellikli küçük bir uygulama) oracle ile
  "met" bitiyor.
- 8. iterasyonun ilk tur `cr` değeri 1. iterasyonunkiyle aynı mertebede (bağlam
  büyümüyor).
- `quotaPoints` v1'e göre en az %40 düşük.

### Aşama 6 — Model yönlendirme ve ön ayarlar

**Amaç:** Her rolün modelini ve eforunu bilinçli seçmek ve bunu kullanıcıya üç ön ayarla
sunmak.

1. Tile ayarlarında **Ekonomik / Dengeli / Güçlü** ön ayarları:

   | Rol | Ekonomik | Dengeli (varsayılan) | Güçlü |
   |---|---|---|---|
   | Başlatıcı / planlama | Sonnet | Opus | Opus/Fable |
   | Worker / iterasyon | Haiku 5.5 | Sonnet | Opus |
   | Danışman (`--advisor`) | yok | Opus | Fable |
   | Doğrulama (LLM) | Haiku | Haiku | Sonnet |
   | Efor | low | medium | high |

2. **Danışman (advisor):** Dengeli ön ayarda worker'lara `--advisor opus`. Doküman `-p`
   ile çalıştığını söylüyor (v2.1.260+; yerel CLI 2.1.332). Saha testinde Sonnet
   danışmana kendiliğinden başvurmadığı için worker prompt'una açık bir tetik eklenmeli:
   "İki başarısız denemeden sonra ya da 'bitti' demeden önce danışmana sor."
   Advisor kullanımı ledger'a ayrı kalem olarak yazılsın.
3. **Planla → onayla → yürüt:** Oda Projesi'nde "Planla" düğmesi. Opus,
   `--permission-mode plan` ile planı çıkarır; tile planı bir onay kartı olarak gösterir.
   Onayda Sonnet ile yürütülür (opusplan deseni, ama kontrol bizde).
4. `cliModel()` ([server.js:2048](server.js#L2048)) artık "model yoksa Opus" demesin;
   profilin varsayılanını kullansın.

**Kabul:** Dengeli ön ayar `roomsession-features-3`'ü Güçlü ile aynı oracle sonucuyla,
en az %35 daha az `quotaPoints` ile bitiriyor.

### Aşama 7 — MultiAgent v2

1. **Görev başına git worktree:** roller birbirinin dosyasına basmasın. Bağımsız
   görevler paralel çalışsın (`MAX_ACTIVE_LOOPS` ve `PERSIST_HARD_MAX` sınırları
   içinde).
2. **Diff tabanlı review:** code-reviewer rolü tüm projeyi okumak yerine görevin
   `git diff`'ini alsın. code-review-graph'ın "etki yarıçapı" fikri için basit sürüm:
   değişen dosyaları import eden dosyaların listesi.
3. **Dynamic workflows denemesi (spike):** fan-out gereken işlerde (ör. "tüm sayfalara
   erişilebilirlik denetimi") Claude Code'un workflow çalışma zamanı ara sonuçları
   script değişkenlerinde tutuyor. Tek bir orkestratör oturumunda workflow tetikleyip
   bizim döngümüzle karşılaştır. Headless'ta nasıl davrandığı ve sayacı nasıl
   etkilediği bilinmiyor; önce ölçüm.
4. Manifest = `feature_list.json`. MultiAgent ve Loop v2 aynı veri modelini kullansın;
   iki ayrı görev formatı kalmasın.

### Aşama 8 — Tile arayüzü (marjinal ama etkili değişiklikler)

Mevcut tile'lar ([MediaOverlay.jsx](src/components/MediaOverlay.jsx),
[MultiAgentTile.jsx](src/components/MultiAgentTile.jsx)) için:

1. **Ortak başlık şeridi:** durum rozeti (zaten var) + model/ön ayar etiketi +
   **kota puanı hapı** (bu oturum ve bugün) + soğuk/sıcak önbellek göstergesi.
2. **Önbellek geri sayımı:** "önbellek ~12 dk daha sıcak". Kullanıcı neden bazen
   pahalı olduğunu öğrenir ve dönme zamanını ona göre seçer. TTL bilgisi ledger'daki
   `cw_1h` / `cw_5m` kırılımından gelir.
3. **Bağlam doluluk çubuğu:** son turun `cr + cw + in` değeri ile model penceresine
   oran. %60'ı geçince "Özetle ve yeni oturuma geç" düğmesi önerilsin (Ralph tarzı
   el ile reset).
4. **Araç çıktılarını katla:** sohbette Bash ve Read çıktıları varsayılan kapalı tek
   satır, tıklayınca açılsın. Aşama 4'teki "orijinal diskte" bağlantısı gösterilsin.
5. **Plan onay kartı** (Aşama 6) ve **özellik listesi şeridi** (Aşama 5): Oda Projesi tile'ı
   açıldığında üstte `feature_list.json` ilerlemesi (ör. 3/7 geçti).
6. **Bütçe kaydırıcısı:** döngü başlatırken `maxQuotaPoints`.
7. Yeni arayüz parçalarında tipografi kuralları: başlık Fraunces veya DM Serif Display,
   gövde DM Sans, kod JetBrains Mono; ağırlık zıtlığı 200/800; net bir boyut ölçeği.

### Aşama 9 — Yeni tile tipleri

Odada duvara asılan, birbirine bağlanan araçlar. Öncelik sırasıyla:

| Tile | Simge | Ne yapar | Bağlı olduğu aşama |
|---|---|---|---|
| **Kota Panosu** (`quotaboard`) | 📊 | Duvarda günlük/haftalık kota puanı grafiği; tile tipine göre kırılım; soğuk tur oranı; "bugün en pahalı 3 tur" listesi. `/api/usage/daily` + ledger | Aşama 1 |
| **Görev Panosu** (`taskboard`) | 🗂 | `feature_list.json`'ı kanban olarak gösterir: Bekliyor, Çalışıyor, Oracle, Geçti. Kartı sürükleyince o özellik için iterasyon başlar; kartın üstünde oracle sonucu ve kota puanı görünür | Aşama 5, 10 |
| **İnceleme Masası** (`review`) | 🔍 | Son iterasyonun `git diff`'i; hunk bazında kabul/ret; satıra yorum yazınca yorum ilgili oturuma mesaj olarak gider (Vibe Kanban'ın satır içi yorum deseni) | Aşama 5 |
| **Test Kulesi** (`oracle`) | 🧪 | `oracle.json`'ı görsel olarak düzenleme (komut, URL, beklenen); geçmiş geçti/kaldı zaman çizelgesi; elle "şimdi çalıştır". Model çağırmaz, maliyeti sıfır | Aşama 5 |
| **Proje Hafızası** (`memory`) | 🧠 | `progress.md` ve karar günlüğü; kullanıcı düzenleyebilir; Loop v2 her iterasyonda bunun sonunu okur (yapılandırılmış not alma) | Aşama 5 |
| Arka Plan Ajanı (spike) | 🛰 | `claude --bg` ve `claude agents` ile sunucu yeniden başlasa da süren işler. **Önce** headless ile sayaç farkı ölçülmeli | Aşama 1 ölçümü sonrası |

Görev Panosu, İnceleme Masası ve Test Kulesi birlikte, Conductor, Vibe Kanban ve
Worktree Kanban'ın "görev → çalışma alanı → diff → onay" akışını odanın içinde, dış
araca bağımlı olmadan kurar.

---

## 5. Ölçüm planı

Mevcut bench düzeni (`scripts/bench.mjs`, `bench/scenarios.md`, izole `__bench__`
odası) korunur. Eklenecek senaryolar:

| Senaryo | Ne ölçer | Aşama |
|---|---|---|
| `roomsession-chat-idlegap` | Oda Projesi sohbetinde 6 dakika aralı 3 tur; TTL etkisi | 6 |
| `roomsession-features-3` | Loop v2 uçtan uca; oracle ile bitiş | 8, 9 |
| `tool-noise` | `npm install` + `vite build` + başarısız test içeren tur; hook etkisi | 7 |
| `verify-only` | Hazır bir projede sadece doğrulama; LLM verify ile oracle karşılaştırması | 8 |

Her aşama raporu (`bench/ASAMAn.md`) şu sütunları içersin:

- `quotaPoints`
- `cw` / `cr` / `out` / `in`
- soğuk tur sayısı
- araç-tur sayısı
- görev geçti mi
- kurtarma oranı (Aşama 4'ten sonra)

Faz 3 raporundaki gibi, model davranışından kaynaklanan sapmalar dürüstçe not edilsin.

Gerçek API tükettiği için: senaryo başına günde en fazla 1 koşu. A/B testlerinde her kol
2 kez koşulsun.

---

## 6. Riskler ve açık sorular

- **Sayaç ağırlıkları üçüncü taraf ölçüm.** Atlas ADE tek hesap ve Ultra plan üzerinde
  ölçmüş. Katsayıları dosyada tutup "tahmin" olarak gösteriyoruz. Kendi sayaç okumamızla
  (Aşama 1 sonrası, `/usage` değerleri elle not edilerek) kalibre edilebilir.
- **Headless ağırlığı** (§1.2) doğrulanmadı. Arka Plan Ajanı spike'ı bu soruya bağlı.
- **`--setting-sources project,local`** kullanıcı ayarlarındaki bir şeyi (ör. izinler,
  ortam değişkenleri) kesebilir. İzinleri zaten `--settings` ile veriyoruz, MCP
  `--strict-mcp-config` ile ayrı. Yine de Aşama 3'te her profil için init olayı
  kontrol edilmeli.
- **Advisor deneysel.** Davranışı ve fiyatı değişebilir; `CLAUDE_CODE_DISABLE_ADVISOR_TOOL`
  ile kapatılabilir. Ön ayar tablosunda kapatma yolu hazır olsun.
- **Hook'lar kaliteyi bozabilir.** Fazla sıkıştırma modelin ihtiyaç duyduğu hatayı
  gizleyebilir. Bunun için kurtarma oranı metriği ve net kazanç koruması var.
- **Loop v2 büyük bir değişiklik.** v1 bir sürüm boyunca ayar ile seçilebilir kalsın
  (`loopEngine: 'v1' | 'v2'`).
- **server.js refactor'ü** (Aşama 2) davranışı bozmamalı. Argv snapshot testi bunun için.

---

## 7. İlk sprint önerisi

Sırayla, her biri ayrı branch:

1. `asama1-kota-olcumu`: ledger, kota puanı, bench çıktısı, baseline raporu.
2. `asama2-session-cekirdegi`: modüllere bölme ve argv snapshot testi. Davranış değişmez.
3. `asama3-spawn-diyeti`: setting-sources, efor, json-schema, TTL A/B. Sonuç raporu.

Aşama 4-9 bu üçünün ölçüm sonuçlarına göre yeniden sıralanabilir. Örneğin TTL A/B testi
büyük kazanç gösterirse Aşama 5 önce gelir.

---

## 8. Kaynaklar

- Anthropic — Effective harnesses for long-running agents:
  https://www.anthropic.com/research/effective-harnesses-for-long-running-agents
- Anthropic — Effective context engineering for AI agents:
  https://www.anthropic.com/research/effective-context-engineering-for-ai-agents
- Anthropic — Code execution with MCP: https://www.anthropic.com/research/code-execution-with-mcp
- Claude Cookbook — Context engineering (memory, compaction, tool clearing):
  https://platform.claude.com/cookbook/tool-use-context-engineering-context-engineering-tools
- Claude Docs — Programmatic tool calling:
  https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling
- Claude Code Docs — Prompt caching (TTL kovaları): https://code.claude.com/docs/en/prompt-caching
- Claude Code Docs — Advisor: https://code.claude.com/docs/en/advisor
- Claude Code Docs — Dynamic workflows: https://code.claude.com/docs/en/workflows
- Claude Code Docs — Agent teams: https://code.claude.com/docs/en/agent-teams
- Atlas ADE — Plan usage burn data (sayaç ağırlıkları):
  https://atlas-ade.dev/docs/plan-usage-burn-data/
- claude-usage-tracker: https://github.com/jonathanavis96/claude-usage-tracker
- ClaudePluginHub — Eklentilerin oturum başı bağlam maliyeti:
  https://www.claudepluginhub.com/blog/claude-code-plugin-context-cost-always-on-tokens
- Advisor saha testi (Sonnet + Opus danışman):
  https://github.com/siem684/agentic-boilerplate/pull/17
- slimctx: https://github.com/tauseefahmad/slimctx
- squeez: https://github.com/claudioemmanuel/squeez
- tokenslim: https://github.com/alilfrances/tokenslim
- ctxprune: https://github.com/riceharvest/ctxprune
- context-mode: https://github.com/mksglu/context-mode
- wet (eski araç sonuçlarını sıkıştıran proxy): https://github.com/volexomega-code/wet
- PostToolUse `updatedToolOutput` isteği: https://github.com/anthropics/claude-code/issues/32105
- Codebase-Memory makalesi: https://arxiv.org/abs/2603.27277
- ttsc graph karşılaştırması (code graph MCP'lerin bazen daha pahalı olduğu ölçüm):
  https://ttsc.dev/blog/i-made-ts-compiler-graph-mcp/
- code-review-graph: https://github.com/tirth8205/code-review-graph
- Ralph loop quickstart: https://github.com/coleam00/ralph-loop-quickstart
- Ralph loop ve `/goal` analizi: https://ranjankumar.in/ralph-loop-claude-code-goal-autonomous-coding
- Paralel ajan araçları karşılaştırması (Conductor, Claude Squad, Vibe Kanban):
  https://gitta.io/guides/parallel-coding-agent-tools
- Ajan orkestratörleri 2026: https://www.plyloft.com/blog/ai-coding-agent-orchestrators
- Worktree Kanban: https://github.com/kazuya83/worktree-kanban
- Tessera: https://github.com/horang-labs/tessera
- Advisor, opusplan ve alt ajan karşılaştırması:
  https://explainx.ai/blog/fable-5-advisor-sonnet-5-executor-claude-code-guide-july-2026
