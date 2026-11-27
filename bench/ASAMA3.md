# ASAMA 3 — Spawn diyeti: sonuçlar ve kanıtlar

- **Tarih:** 2026-11-28 · Branch: `asama3-spawn-diyeti` (`asama2-session-cekirdegi` üstünde)
- **Yol haritası:** `SESSION-YOL-HARITASI.md` §4 Aşama 3
- **Durum:** dilim 1 (izolasyon, efor, verify modeli) yapıldı ve bench ile ölçüldü:
  roomsession-crud kotası −%49 (tek koşu, aynı sonuç). `--json-schema` denendi, reddedildi.
  Sırada: tekrar koşusu, TTL A/B, kısa yanıt kuralı, `--fallback-model`.

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

## Bench karşılaştırması: Aşama 1 baseline vs Aşama 3 dilim 1

Aynı düzenek (worktree, DB kopyası, ayrı port/USAGE_FILE), koşular sırayla, aynı gece.
Kaynak: `data/bench/asama{1,3}-*.json` ve sunucu `[turn-usage]` logları.

### roomsession-crud (asıl hedef)

| | Kota (%) | İş turu | verify | Araç-tur | Çıktı | Düşünme | Sonuç |
|---|---:|---:|---:|---:|---:|---:|---|
| Aşama 1 | 0.0274 | 0.0249 | 0.0025 (Haiku 4.5) | 18 | 8.553 | 1.637 | 1. iterasyonda met |
| Aşama 3 | **0.0141** | 0.0131 | 0.0010 (Haiku 5.5) | 7 | 4.028 | 394 | 1. iterasyonda met |
| Fark | **−%49** | −%47 | −%60 | −%61 | −%53 | −%76 | aynı |

Tur bazında:

```
Aşama 1  roomsession turn=1 in=16 cw=31838 cr=191400 out=6134 q=0.0249 tools=9
         verify            in=58 cw=20407 cr=106863 out=2419 q=0.0025 tools=9 model=haiku-4-5
Aşama 3  roomsession turn=1 in=8  cw=19188 cr=49970  out=3073 q=0.0131 tools=4
         verify            in=6  cw=8555  cr=27172  out=955  q=0.0010 tools=3 model=haiku-5-5
```

**Kalite:** Aşama 3'ün ürettiği API elle denendi (port 3999). POST, GET, PUT ve DELETE
çalışıyor (204); var olmayan id 404 veriyor. Fark: baseline ajanı ek olarak bir
`node:test` dosyası yazmıştı, Aşama 3 ajanı yazmadı. Hedef test istemiyordu, ama bu
"daha az iş yaptı" etkisinin bir kısmı olabilir.

**Yorum:**

- İş turundaki düşüşün olası nedenleri:
  - `medium` efor. Kullanıcının Opus 5.5 için `high` ayarı artık sızmıyor; düşünme
    1.637 → 394.
  - Skill listesinin kalkması.
- verify'daki düşüş Haiku 5.5 + izolasyondan geliyor. Kota modülü iki Haiku'yu aynı
  ağırlıkla tarttığı için verify kazancı burada **olduğundan az görünüyor**. Liste fiyatı
  farkı ~10×.
- **Tek koşu.** Ajan varyansı yüksek (`METHOD.md`: tek koşuda ±%50). Araç-tur sayısının
  18 → 7 düşmesi kısmen ajanın o koşuda farklı yol seçmesinden olabilir. Kesin hüküm
  için en az 2-3 tekrar gerekir.
- İki koşuda da soğuk tur yok. Aynı sistem prompt'u kısa süre önce başka süreçlerce
  önbelleğe alınmıştı; önbellek süreçler arasında paylaşılıyor. Yani izolasyonun soğuk
  başlangıç kazancı (madde 0 ölçümü) bu bench'te görünmüyor; gerçek kullanımda
  önbellek soğukken ortaya çıkar.

### roomchat (kontrol grubu: Aşama 3 roomchat'a dokunmadı)

| | Kota (%) | t1 cw / cr | Soğuk |
|---|---:|---|---:|
| Aşama 1 roomchat-3turn | 0.0078 | 18.026 / 0 | 1/3 |
| Aşama 1 roomchat-idlegap | 0.0032 | 4.309 / 13.989 | 0/3 |
| Aşama 3 roomchat-3turn | 0.0034 | 4.299 / 13.989 | 0/3 |

Aşama 3 roomchat'ı değiştirmedi ve sıcak koşularda sayılar birebir aynı
(4.299 ≈ 4.309, 13.989 = 13.989). Bu, düzeneğin tekrarlanabilir olduğunu gösteriyor.
Aşama 1 3turn'ün iki kat pahalı olması tamamen o gecenin ilk koşusu olup önbelleğin soğuk
olmasından (cr=0). Tek koşuluk kıyaslarda önbellek durumu sonuca bu kadar etki ediyor.

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

## `--json-schema` denendi ve UYGULANMADI (olumsuz sonuç)

Yol haritası madde 4, verify'ın JSON'u regex ile avlamak yerine `--json-schema`
kullanmasını öneriyordu. Asıl verify prompt'u + Haiku 5.5 + Aşama 3 argv'siyle, ikişer
koşu:

| | çıktı | tur | maliyet | yapılandırılmış çıktı |
|---|---:|---:|---:|---|
| şemalı | 479-489 | 4-5 | $0.0008-0.0011 | `result.structured_output` |
| şemasız | 237-399 | 2-3 | $0.0008-0.0015 | yok (`result` zaten temiz JSON) |

Şema, CLI'ın yapılandırılmış çıktıyı ayrı bir araç turuyla üretmesine yol açıyor. Bu da
çıktıyı ve tur sayısını artırıyor. Haiku 5.5 şemasız da kod bloğu olmadan tek satır JSON
döndürüyor, yani `parseVerdict` yeterli. Ayrıca prompt'taki "kısa gerekçe, tek satır"
talimatı olmadan ilk denemede çıktı 608-639'a çıkmıştı. Kısalığı sağlayan şey prompt.

## Sırada (bu aşama)

1. ~~Bench karşılaştırması~~ yapıldı (yukarıda). Tekrar koşusu (varyans için) kaldı:
   Aşama 1 baseline'ına karşı (`quotaPoints`, soğuk tur, verify geçme).
2. TTL A/B (`roomsession`: 5m zorlaması / varsayılan 1h / ayrık TTL).
3. Worker ve Oda Projesi için kısa yanıt kuralı (çıktı en pahalı token; bench ile).
4. `--fallback-model` (maliyet değil güvenilirlik: 529'da döngü durmasın).
