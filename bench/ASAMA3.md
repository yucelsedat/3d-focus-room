# ASAMA 3 — Spawn diyeti: sonuçlar ve kanıtlar

- **Tarih:** 2026-11-28 · Branch: `asama3-spawn-diyeti` (`asama2-session-cekirdegi` üstünde)
- **Yol haritası:** `SESSION-YOL-HARITASI.md` §4 Aşama 3
- **Durum:** dilim 1 (izolasyon, efor, verify modeli) yapıldı. TTL A/B, `--json-schema`,
  kısa yanıt kuralı ve `--fallback-model` sırada. Bench karşılaştırması Aşama 1 baseline'ı
  bitince yapılacak.

## Madde 0 — "ikinci tur 11.5K yazıyor" bulgusunun kaynağı

Aynı 3 önemsiz tur (haiku, ai-session bayrakları, stream-json, 9 sn ara), her satırda tek
bir değişkenle:

| Yapılandırma | t1 cw | t2 cw | t3 cw | 3 tur yazma | t3 bağlam (cr) |
|---|---:|---:|---:|---:|---:|
| A: mevcut (ai-session aynısı) | 14.478 | 11.561 | 81 | 26.1K | 25.6K |
| B: + `--setting-sources project,local` | 8.409 | 5.490 | 81 | 14.0K | 19.6K |
| C: + `--disable-slash-commands` | 16.471 | 3.051 | 81 | 19.6K | 16.5K |
| D: B + C | 5.813 | 2.894 | 81 | **8.8K** | **16.3K** |
| E: cwd = boş klasör | 13.061 | 10.856 | 81 | 24.0K | 24.2K |

Sonuçlar:

- **2. turdaki büyük yazma her turda değil, süreç başına bir kez oluyor.** 3. turda her
  yapılandırmada 81 token. Yani yeni doğan her süreç (ilk spawn, respawn, tek-atış) bunu
  bir kez ödüyor.
- **Ana kaynak skill listesi** (`--disable-slash-commands` kalıcı bağlamı 25.6K → 16.5K
  düşürüyor, ~9K). Kullanıcı ayarları/eklentileri ikinci kaynak.
- Proje `CLAUDE.md`'si önemsiz (E ≈ A).

`init` olayından görülen yan etkiler:

| | skills | slash | eklentiler | graphify/reconstruct |
|---|---:|---:|---|---|
| A | 60 | 96 | frontend-design, last30days, opendesign, html-slides, … | var |
| B | 24 | 60 | yalnız yönetilen/yerleşik | **yok** |
| C | 0 | 0 | hepsi (hook'ları çalışır) | yok |
| D | 0 | 0 | yalnız yönetilen/yerleşik | yok |

`roomchat-graph` graphify skill'ini, `bluprint-build` reconstruct ve diğer kullanıcı
skill'lerini çağırıyor. Bu iki profil ve sohbet tile'ları **izole edilmedi**.

## Uygulanan kurallar (`server/sessions/spawnProfiles.js`)

| Profil | Ayar/skill | Efor |
|---|---|---|
| verify, orchestrate, projectview-detect | tam izolasyon (D) | `low` |
| architect | tam izolasyon (D) | `high` (planlama; izolasyonla kullanıcı eforu düştüğü için açık) |
| roomsession, multiagent (kalıcı) | yalnız `--disable-slash-commands` (C). Global `CLAUDE.md` ve ayarlar korunur | varsayılan `medium` |
| ai-session, roomchat, bluprint (kalıcı) | değişmedi | tile "normal" ise kullanıcı ayarı |
| roomchat-graph, bluprint-build, live-session | değişmedi | değişmedi |

- Tile ayarı `settings.skills` (true/false) ve `settings.effort` varsayılanı ezer. İkisi de
  değişince süreç yeniden doğar (`applySettings`).
- **Efor artık `--effort` bayrağıyla veriliyor.** Kodun kullandığı `CLAUDE_EFFORT` env'i
  dokümanda yok; belgelenmiş değişken `CLAUDE_CODE_EFFORT_LEVEL`. Tek örnekli testte
  `CLAUDE_EFFORT=low` 128, belgelenmiş iki yol 107 düşünme token'ı verdi. Gürültü içinde
  kaldığı için etkisi kanıtlanamadı. Belgelenmiş bayrağa geçmek bu belirsizliği kaldırıyor.
- Neden önemli: kullanıcının `modelSettings`'i Opus 5.5 için `high`. Bu her spawn'a
  sızıyordu. Bir gözlemde "ok yaz" isteği Opus'ta 903 çıktı token'ı üretti.

## verify: Haiku 4.5 → 5.5

Aynı küçük proje, aynı prompt, Aşama 3 argv'si, ikişer koşu. Liste maliyeti CLI'ın
`total_cost_usd` alanından:

| | maliyet | çıktı | düşünme | bağlam (cr) | karar |
|---|---:|---:|---:|---:|---|
| Haiku 4.5, effort low | $0.0065-0.0089 | 592-726 | 320-347 | 26-40K | doğru |
| Haiku 5.5, effort low | **$0.0006** | **332-335** | **0** | 25K | doğru |

- Haiku 4.5 efor tablosunda yok (dokümana göre eforu desteklemiyor). `--effort low` onda
  etkisiz.
- 4.5 ile koşarken Claude Code bazı yardımcı istekleri zaten Haiku 5.5'e gönderiyordu
  (`modelUsage`'da iki model). 5.5'e geçince tek model kalıyor.
- `VERIFY_MODEL = 'claude-haiku-5-5'` (sabit kimlik, bench tekrarlanabilirliği için).

### Eski/yeni argv, verify (Haiku 4.5, ilk koşular)

| | cw | cr | out |
|---|---:|---:|---:|
| eski argv | 14.726 | 28.469 | 672 |
| yeni argv (D + effort low) | 2.265 | 38.420 | 703 |

Soğuk başlangıçta yazma %85 düştü. İkinci koşularda ikisi de sıcak (~800). Not: aynı anda
arka planda baseline bench'i koşuyordu ve o da verify çağırıyordu, yani önbellek durumu
paylaşıldı. Kesin sayılar bench karşılaştırmasından gelecek.

## Kota modülüne not

İki Haiku sürümü liste fiyatında ~10 kat farklı. `quotaLedger.js` ise ikisini aynı `haiku`
ağırlığıyla tartıyor (Sonnet × 3 tahmini). Bu 4.5 için muhtemelen düşük, 5.5 için yüksek
bir tahmin. Ölçülmemiş aileler için `modelUsage[].costUSD` tabanlı bir tahmin daha
sağlam olabilir (Aşama 1 takibi).

## Kanıt / testler

- `npm run verify:spawn`: 14 kontrol. Eski argv'ler değişmeden duruyor; Aşama 3 ekleri
  testte **açıkça** tarif ediliyor (başka her fark testi kırar). Kalıcı oturumda 7.200
  kombinasyon taranıyor (skills: yok/true/false dahil).
- Skill kullanan üç profilin izole edilmediği ayrıca test ediliyor.
- `npm run verify:quota`: 17 kontrol.

## Sırada (bu aşama)

1. Bench karşılaştırması: `asama3` etiketiyle `roomsession-crud` ve `roomchat-3turn`,
   Aşama 1 baseline'ına karşı (`quotaPoints`, soğuk tur, verify geçme).
2. TTL A/B (`roomsession`: 5m zorlaması / varsayılan 1h / ayrık TTL).
3. verify ve orchestrate için `--json-schema` (kod bloklu JSON ve boş laf).
4. Worker ve Oda Projesi için kısa yanıt kuralı.
5. `--fallback-model`.
