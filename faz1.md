# Faz 1 — Ölç & Kanıtla (Ground Truth)

**Amaç:** Optimizasyonu deneme-yanılmadan çıkarmak. "Parite"yi ancak bir sayıyla iddia edebiliriz. Sonraki her fazın etkisini kanıtlayacak **kontrollü A/B düzeneğini** ve **tur-başı görünürlüğü** kur.

**Ön koşul:** Ölçüm altyapısı kısmen var (`recordGlobalUsage` → `data/usage-daily.json`, `GET /api/usage/daily`, `[resume-cost]` logu — kod tabanında mevcut). Bu faz onu **tur-başı cacheRead** ve **A/B koşum** seviyesine çıkarır.

**Neden en başta:** Faz 2–3'ün her biri "cacheWrite/cacheRead düştü" diye kapanacak. Ölçüm katmanı olmadan bu kapanışlar imkânsız.

---

## Değişecek / eklenecek

### İş 1.1 — Tur-başı usage logu (mevcut `addUsage`'ı zenginleştir)
`server.js` `addUsage(rec, u)` (satır ~2598) ve `PersistentSession._onLine` result yakalama noktası:
- Her `result` olayında tek satır yapılandırılmış log bas:
  `[turn-usage] tile=<type> key=<poolKey|mediaId> iter=<n> in=<x> cw=<x> cr=<x> out=<x> model=<m>`
- Amaç: **cacheRead'in tur-tur nasıl biriktiğini** çıplak gözle görmek (multiagent 2.46M kök nedeni buradan okunur).

### İş 1.2 — Tile-tipi kırılımı + "işlenen toplam" alanı
`recordGlobalUsage(tileType, usage)`:
- `data/usage-daily.json`'a `processedTotal = input + cacheWrite + cacheRead + output` alanını da ekle (dolar maliyetinden farklı olarak, oturum penceresini tüketen asıl büyüklük işlenen token toplamıdır).
- `GET /api/usage/daily?days=7` yanıtına tile-tipi başına `{calls, in, cw, cr, out, processedTotal}` ver.

### İş 1.3 — A/B koşum düzeneği (bu planın omurgası)
Amaç: **aynı fikri** optimizasyon öncesi/sonrası koşup farkı tabloya dökmek.
- `scripts/bench.mjs` (yeni): parametre olarak `{ tileType, idea, label }` alır; ilgili endpoint'i tetikler, koşu bitince o koşunun toplam usage'ını `data/bench/<label>-<ts>.json`'a yazar.
- **Sabit test senaryoları** (repo'da `bench/scenarios.md`):
  1. `direct-cafe`: "tek sayfa HTML cafe sitesi, şık" → multiagent tile (routing `direct`'e düşmeli).
  2. `roomsession-crud`: "Express + SQLite todo API, 4 endpoint" → roomsession tile.
  3. `roomchat-3turn`: 3 turluk sohbet (sabit prompt dizisi) → roomchat tile.
- Her senaryo **deterministik** olmalı (aynı fikir metni, aynı ayarlar) ki fazlar arası fark ölçüm gürültüsü değil gerçek olsun.

### İş 1.4 — "resume-cost" ve "respawn" sayaçları
- `PersistentSession`'da respawn sayısını ve her respawn sonrası ilk turun `input+cacheWrite`'ını rec/loga işle (`[resume-cost]` logu zaten kısmi — koşu başına toplam respawn sayısını da say).
- Bu, Faz 3'ün (respawn azaltma) etkisini ölçecek.

---

## Uygulama sırası
1. İş 1.1 + 1.2 (log + processedTotal) — küçük, sıfır risk.
2. İş 1.4 (respawn sayacı).
3. İş 1.3 (bench script + senaryolar) — en çok iş, ama sonraki 5 fazın kanıt temeli.

## Doğrulama
- `node --check server.js`.
- `node scripts/bench.mjs --scenario direct-cafe --label baseline` → `data/bench/baseline-*.json` üretilir, içinde `processedTotal` var.
- `GET /api/usage/daily?days=1` → tile-tipi kırılımı + processedTotal görünür.
- Üç senaryonun **baseline** koşusunu al ve `bench/BASELINE.md`'ye tabloya dök. **Bu tablo, tüm sonraki fazların "önce" sütunu.**

## Kabul kriteri
`bench/BASELINE.md` üç senaryo için `{iterasyon, çağrı, input, cacheWrite, cacheRead, output, processedTotal}` içeriyor; tur-başı `[turn-usage]` logu cacheRead birikimini gösteriyor.

## Risk
Yok (yalnız ölçüm/log ekler). Tek dikkat: bench script gerçek API tüketir — senaryoları küçük tut, gün başına 1 baseline koşusu yeter.
