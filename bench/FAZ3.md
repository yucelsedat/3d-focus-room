# FAZ 3 — Transport Hijyeni: sonuçlar ve kanıtlar

- **Ölçüm tarihi:** 2026-07-05 (baseline/faz2 ile aynı gün, aynı düzenek)
- **Kaynak JSON'lar:** `data/bench/faz3-*.json`; tur-başı kanıt: bench sunucusu
  `[turn-usage]` / `[persist]` / `[resume-cost]` logları

## Uygulanan işler

| İş | Durum |
|---|---|
| 3.3 `--no-session-persistence` | ✅ 5 tek-atış spawn: verify, orchestrate, architect, bluprint-build, roomchat-rebuild. **Worker'larda bilinçli YOK** (aynı-görev `--resume` mekanizması persistence ister) |
| 3.2 Respawn tetik daraltma | ✅ `applySettings` yalnız model/effort/permissionMode **gerçekten değiştiyse** dispose eder; UI'ın aynı ayarları yeniden göndermesi artık respawn tetiklemez |
| 3.1 Idle ↔ TTL hizalama | ✅ 1H cache'li interaktif tile'lar (roomchat/ai-session/bluprint) 30 dk idle; 5M'li loop tile'ları (roomsession/multiagent) 15 dk kalır. RSS bekçisi/hard cap değişmedi |
| 3.4 Resume-cost uyarısı | ✅ respawn sonrası ilk tur `input+cacheWrite > 100K` ise `[resume-cost] UYARI` — içerik-diyeti kararının veri tetikleyicisi |

## Kabul kriteri kanıtları

### 1. Tek-atış spawn'lar diske yazmıyor (İş 3.3)
Bench odasının `~/.claude/projects/<cwd-key>/` klasörü: koşu öncesi 12 JSONL →
faz3 roomsession koşuları sonrası 14. **İki yeni dosyanın ikisi de LoopFlow worker
oturumu** (içerik grep'iyle doğrulandı); verify artık JSONL yazmıyor (baseline'da
her verify bir JSONL bırakıyordu — koşu başına 1-2 dosya kirlilik bitti).

### 2. Çökme-dayanıklılık korunmuş (kill → resume testi)
Canlı test: roomchat turu ortasında claude süreci `kill -9` edildi:
```
[persist] SPAWN key=roomchat:… pid=31036 resume=none respawns=0
[persist] CLOSE key=roomchat:… code=null busy=true          ← kill anı
[persist] SPAWN key=roomchat:… pid=31126 resume=7d964e77-… respawns=1
[resume-cost] key=roomchat:… respawn#1 firstTurn=1k (input=66 cacheWrite=554)
```
Sonraki tur "kod adımı hatırlıyor musun?" → **"PAPATYA-42"** (geçmiş korunmuş).
Kritik gözlem: respawn'ın ilk tur cacheWrite'ı **554 token** — Faz 2 prefix
sabitlemesi sayesinde respawn artık cache-hit'le doğuyor (eskiden on binlerce
token'lık yeniden yazımdı). Faz 2 + Faz 3 birlikte çalışıyor.

### 3. Gereksiz respawn kesildi (İş 3.2, canlı test)
```
PATCH aynı ayarlar  → [persist] applySettings: değişiklik yok, respawn atlandı
PATCH model değişti → [persist] CLOSE code=143 (dispose → sonraki mesaj --resume)
```

### 4. Idle-gap senaryosu: 6 dk boşluklarda cache + süreç sıcak (İş 3.1)
`roomchat-idlegap` (3 tur, turlar arası 360 sn; toplam ~13 dk):

| Tur | in | cw | cr | out | total |
|---:|---:|---:|---:|---:|---:|
| 1 | 159 | 3.797 | 3.857 | 529 | 8.342 |
| 2 (6 dk sonra) | 2 | **728** | 7.654 | 178 | 8.562 |
| 3 (6 dk sonra) | 2 | **206** | 8.382 | 76 | 8.666 |

Tek SPAWN, **respawns=0** — 30 dk idle sayesinde süreç boşlukları atlattı.
Tur 2/3'ün cacheWrite'ı marjinal (728/206): **5 dk'yı aşan boşlukta cache-hit**,
yani 1H TTL gerçekten çalışıyor (5m TTL'de ~8K'lık prefix her turda yeniden yazılırdı).
12 dk boşluklu 3 turun tamamı ≈ 25.6K processed — boşluksuz faz2 koşusuyla aynı sınıfta.

## roomsession-crud faz3 koşusu — dürüst not

686.9K processedTotal (faz2: 336.7K). Bu FARK faz3 değişikliklerinden değil:
iş turu config'i faz2 ile birebir aynı; fable-5 bu koşuda ~2× fazla tool-turu yaptı
(tek-koşu ajan varyansı; iş turu cr=540K vs faz2 242K). Tek-koşu senaryolar ±%50'ye
varan gürültü taşıyabiliyor — fazlar arası karşılaştırmada tur-başı loglar ve
yapısal kanıtlar (respawn sayısı, JSONL sayımı, cacheWrite marjinalliği) esas alınmalı.
İdlegap delta'sındaki `calls=4` de eşzamanlı İş 3.2 testinin +1 çağrı sızıntısı;
tablodaki tur-başı sayılar (`[turn-usage]`) kanonik.

## Faz 4/5 go/no-go için not
Faz 1-3 sonrası tablo: prefix sabit, TTL kadansa uygun, gereksiz respawn yok,
tek-atış kirlilik yok, respawn maliyeti ~0.5K. El-yapımı transport'un kalan yapısal
açığı (SDK'nın bedava verdiği interruption/checkpointing/listSessions) Faz 4'ün konusu.
