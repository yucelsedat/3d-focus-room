# ASAMA 5 (ölçüm) — Loop v2 kararları: birikimli mi taze mi, deterministik kontrol gerekli mi

- **Tarih:** 2026-11-28 · Branch: `asama5-dongu-olcumu` (`asama8-kota-gorunurlugu` üstünde)
- **Yol haritası:** `SESSION-YOL-HARITASI.md` §4 Aşama 5
- **Durum:** ölçüm tamam. **Taze-oturum maddesi reddedildi** (+%22 kota). Deterministik
  oracle'ın ürüne alınması **kanıt yok, ertelendi** (bench'te kalıyor). Varsayılan davranış
  değişmedi.

## Ölçülen soru

Yol haritası Loop v2'de iki şey öneriyordu:

1. her iterasyonu taze oturumla başlatmak (bağlam büyümesini önlemek),
2. "bitti mi" kararını önce deterministik bir kontrole bırakmak.

Aşama 3 sonrası iki şey değişti:

- abonelik sayacında cache okuma çok ucuz (Opus'ta %1 = 120M token),
- verify Haiku 5.5 ile döngü kotasının ~%1'i.

Yani iki maddenin de faydası artık ölçülmeden bilinemezdi.

## Düzenek

- Senaryo `roomsession-features`: api-plus hedefi (CRUD, 400, 404, filtre, sayfalama,
  npm test) + yönerge "her iterasyonda yalnızca sıradaki en fazla 2 özellik". Döngü doğal
  olarak 3 iterasyona yayıldı (6/6 koşu).
- Kollar sunucu env'iyle (`FOCUS_ROOM_LOOP_EPOCH`), kod aynı:
  - `accumulate`: bugünkü davranış, tek kalıcı oturum.
  - `fresh`: her iterasyon önceki süreç kapatılır, `--resume` yok; prompt'a önceki
    iterasyon özetleri ve "önce dosyaları incele" eklenir.
- 3 + 3 koşu, dönüşümlü sıra (A, F, A, F, A, F). Opus 5.5 medium, 1h TTL.
- Kalite deterministik: `checkTodoApiPlus` (12 madde).

## Sonuçlar

| Kol | Kota (%) koşular | Ort. | Soğuk tur | Araç-tur | cache yazma | cache okuma | Kalite |
|---|---|---:|---:|---:|---:|---:|---|
| accumulate | 0.0239 · 0.0265 · 0.0272 | **0.0259** | 2/6 | 19.7 | 32K | 288K | 2/3 (bkz. not) |
| fresh | 0.0301 · 0.0321 · 0.0324 | 0.0315 | 4/6 | 23.3 | 48K | 323K | 3/3 |

- **Taze oturum %22 daha pahalı**, aralıklar örtüşmüyor. Nedenler:
  - her iterasyon soğuk başlıyor (cache yazma +%47),
  - ajan önce dosyaları yeniden okuyor (+3.6 araç-tur),
  - çıktı aynı kalıyor (11.1K vs 11.3K).
- Birikimli oturumda 3. iterasyonun bağlamı 74-123K token, 1M pencerenin çok altında.
  Bağlam büyümesi bu uzunlukta sorun değil, okuması da ucuz.

### Not: "verify yanlış pozitif" bulgusu geri çekildi

`feat-acc-r2`'de verify "met" dedi, düzeneğin `npm test` maddesi kaldı. Ajanın oturum
kaydında ise kendi son `npm test` çalıştırması **23/23 geçti**. En olası açıklama düzenek:
`checkTodoApiPlus` önce API'yi deniyor, bu sırada projenin varsayılan SQLite dosyasına
kayıt bırakıyor, `npm test` sonra koşuyordu. Boş veritabanı varsayan testler bu yüzden
kalır. Proje klasörü sonraki koşularca silindiği için **doğrulanamadı**.

Düzeltme: `npm test` artık API denemesinden önce, temiz durumda koşuyor.

Sonuç: 24 döngü koşusunun (crud, api-plus, features) hiçbirinde verify'ın yanlış "met"
dediğine dair doğrulanmış bir kanıt yok.

## Kararlar

1. **Döngü birikimli kalır.** Taze-oturum maddesi reddedildi. `FOCUS_ROOM_LOOP_EPOCH=fresh`
   anahtarı daha uzun döngüler (6+ iterasyon, büyük bağlam) için deney olarak kodda kalıyor;
   varsayılan değişmedi.
2. **Deterministik oracle ürüne alınmadı.** verify'ın yanlış karar verdiğine dair kanıt yok
   ve maliyeti zaten ~%1. Kontrol bench'te (`scripts/bench.mjs`, `--check-only`) yaşamaya
   devam ediyor. Gerçek kullanımda verify hataları görülürse ürüne taşınır.
3. **Açık soru:** 6+ iterasyonlu, büyük kod tabanlı döngüler ölçülmedi. Orada bağlam
   büyümesi ve otomatik sıkıştırma (compaction) devreye girebilir ve sonuç tersine
   dönebilir.

Ölçüm maliyeti: 6 koşu, ~%0.17 Ultra haftası (tahmin).
