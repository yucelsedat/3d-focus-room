# ASAMA 1 — Kota ölçümü: sonuçlar ve kanıtlar

- **Tarih:** 2026-11-28 · Branch: `asama1-kota-olcumu`
- **Yol haritası:** `SESSION-YOL-HARITASI.md` §4 Aşama 1
- **Not:** Önceki token çalışması "Faz 1-6" adlarını kullandı (`PARITE.md`). Bu yol haritası
  çakışmasın diye "Aşama" kullanıyor.

## Neden

`processedTotal` dört token türünü eşit sayıyordu. Abonelik sayacı ise onları çok farklı
tartıyor (üçüncü taraf ölçüm: Opus'ta 1 çıktı token'ı ≈ 260 cache-okuma token'ı). Hangi
değişikliğin kotayı gerçekten düşürdüğünü görmek için önce metrik düzeltilmeliydi.

## Yapılanlar

| İş | Nerede |
|---|---|
| Saf kota modülü: ağırlıklar, model ailesi, tur kaydı, soğuk tur tespiti, birikim | `server/quotaLedger.js` |
| Tüm `result` kaynakları tur kaydına geçti: tek-atış SSE, kalıcı oturum, `runClaudeCapture` | `server.js` |
| `usage-daily.json` ve `recall.usage` yeni alanlar: `quotaPoints`, `quotaByFamily`, `coldTurns`, `turns`, `cw1h`, `cw5m`, `thinking` | `Quota.accumulate` |
| Eski alanlar (`calls`/`input`/`cacheWrite`/`cacheRead`/`output`/`processedTotal`) **aynen** | MultiAgent bütçe freni hâlâ `processedTotal`'a bakıyor; davranış değişmedi |
| `[turn-usage]` logu: `q=` (haftalık %), `cold=`, `tools=`, `cw1h=`, `cw5m=` | `logTurnUsage` |
| Tarayıcıya giden `result` olayına `ev.quota` (Aşama 8 tile arayüzü kullanacak) | `PersistentSession`, `streamClaudeToSSE` |
| `GET /api/usage/daily`: eski kayıtlara tahmini `quotaPoints` + `quotaEstimated:true` (saklanan veri değişmez) | `server.js` |
| `GET /api/usage/weights`: ağırlıklar ve kaynağı | `server.js` |
| Ağırlık override: `data/quota-weights.json` (isteğe bağlı, kendi sayaç okumalarıyla kalibrasyon için) | `Quota.loadWeights` |
| Bench çıktısına yeni alanlar + kota özet satırı | `scripts/bench.mjs` |
| Doğrulama betiği: `npm run verify:quota` (17 kontrol), `--replay` ile geçmiş tablo | `scripts/verify-quota-ledger.mjs` |

## CLI sözleşmesi (canlı gözlemlendi, claude 2.1.332)

İki küçük Haiku çağrısıyla doğrulandı. Fixture'lar `verify-quota-ledger.mjs` içinde.

- `result.usage` **tur başına**. Kalıcı stream-json süreçte de her tur ayrı.
- `result.modelUsage` **süreç boyunca birikimli**. Tur 2'de değerler tam iki katıydı
  (`inputTokens` 2 → 4, `cacheReadInputTokens` 4392 → 8784). Delta alınmasaydı kalıcı
  oturumlarda model kırılımı her turda şişerdi. `PersistentSession._prevModelUsage`
  bunun için var ve her spawn'da sıfırlanıyor.
- `usage.cache_creation.ephemeral_1h_input_tokens` / `ephemeral_5m_input_tokens`,
  `usage.iterations[]` (turun API istekleri), `num_turns` ve
  `output_tokens_details.thinking_tokens` mevcut.
- `haiku` takma adı artık `claude-haiku-5-5`'e çözülüyor. `VERIFY_MODEL` sabiti hâlâ
  `claude-haiku-4-5-20251001` (Aşama 3 işi).

## Geçmiş verinin yeni metrikle yeniden okunması

`node scripts/verify-quota-ledger.mjs --replay`, Opus ağırlıklarıyla, 2026-07-04 → 08-03:

- **roomsession:** kotanın %31-70'i çıktı, %19-60'ı cache yazma, %8-29'u cache okuma.
- **verify:** %46-75'i cache yazma. Her doğrulama sıfırdan başlıyor; maliyetin çoğu
  prefix yazımı.
- **Cache okuma** 31 satırın sadece 4'ünde %20'yi geçiyor.

Sonuç: Faz 1-3'ün hedefi olan cache okuma, kotada üçüncü sırada. Aşama 3-5'in önceliği
çıktı ve soğuk yazma olmalı.

Uyarı: verify Haiku ile koşuyor ama eski kayıtlarda model bilgisi yok. Tablo herkesi Opus
ile tartıyor, yani mutlak verify puanları abartılı. **Paylar** model ailesinden bağımsız
olarak doğru (her aile içinde oranlar benzer).

## Duman testi (canlı, izole)

Port 5099'da ayrı bir sunucu ve ayrı bir `USAGE_FILE` ile, `__bench__` odasında bir
ai-session tile (haiku, efor low) ve 2 tur:

```
[turn-usage] tile=ai-session turn=1 in=2 cw=16021 cr=9446  out=5 q=0.0010 cold=1 tools=1 cw1h=16021 cw5m=0 model=haiku
[turn-usage] tile=ai-session turn=2 in=2 cw=11313 cr=14208 out=7 q=0.0007 cold=0 tools=1 cw1h=11313 cw5m=0 model=haiku
```

- `result.quota` tarayıcıya ulaştı; `byFamily` = haiku (modelUsage'dan, fallback değil).
- `usage-smoke.json`'a yeni alanlar yazıldı: `quotaPoints` 0.001764, `coldTurns` 1/2.
- Tile silindi, önceki aktif oda geri alındı, test süreçleri kapatıldı.

### Yan bulgu (Aşama 3'e girdi)

İkinci tur önemsiz bir mesaj ("tamam 2") olmasına rağmen **11.313 token cache yazdı**.
Sıcak bir oturumda beklenen birkaç yüz token. Prefix'e her turda değişen bir şey giriyor
olabilir. Adaylar:

- `--exclude-dynamic-system-prompt-sections` ile ilk kullanıcı mesajına taşınan dinamik
  bölümler
- tur başına eklenen ekler (git durumu, hafıza, skill listesi)
- kullanıcı eklentilerinin hook çıktısı

Bu tile `cwd = process.cwd()` ile repo kökünde açılıyor. Repo `CLAUDE.md`'si ve global
ayarlar da yükleniyor. Aşama 3'teki `--setting-sources` deneyinin ilk ölçümü bu olmalı:
aynı 2 tur, önce/sonra `cw` karşılaştırması.

## Baseline (2026-11-28)

İzole düzenek: worktree, veritabanının yedek kopyası, ayrı port ve `USAGE_FILE`.
Kaynak: `data/bench/asama1-*.json`.

| Senaryo | Kod | Kota (%) | Soğuk tur | Araç-tur | Sonuç |
|---|---|---:|---:|---:|---|
| roomchat-3turn | `asama1-kota-olcumu` | 0.0078 | 1/3 | 3 | 3 tur |
| roomsession-crud | `ajan-sunucu-koruma` | 0.0274 | 0/2 | 18 | 1. iterasyonda met |
| roomchat-idlegap | `ajan-sunucu-koruma` | 0.0032 | 0/3 | 3 | 6 dk boşluklarda önbellek sıcak |

### İlk deneme yarım kaldı: ajan backend'i öldürdü

İlk baseline denemesinde roomsession ajanı kendi todo sunucusunu kapatmak için
`pkill -f "node server.js"` çalıştırdı. Desen bench sunucusunu (aynı komut satırı) da
öldürdü. Ona bağlı claude süreci kapandı; `roomsession-crud` ve `roomchat-idlegap`
koşamadı. Düzeltme: `bash-guard-hook.js` (commit `fix: oda ajanlarının Focus Room
backend'ini öldürmesini engelle`). roomsession ve idlegap baseline'ı bu düzeltmeyle
yeniden koşuldu. Bench sunucusu artık `node ./server.js` ile başlatılıyor (ek savunma).

## Sınırlar

- Ağırlıklar tek hesabın (Ultra) üçüncü taraf fit'i. Sonnet ağırlığı o kaynakta da tahmin;
  Haiku hiç ölçülmemiş (Sonnet × 3 varsayıldı, `estimated:true`).
- Soğuk tur eşiği bir sezgi: turun ilk isteğinde yazma > okuma ve ≥ 2048 token. Turun
  sonraki isteklerinin doğal yazımı bilinçli olarak sayılmıyor.
- Advisor veya subagent kullanan turlarda `modelUsage` birden çok model içerir. Her aile
  kendi ağırlığıyla tartılıyor. Bunun gerçek bir advisor turunda doğrulanması Aşama 6'da.
