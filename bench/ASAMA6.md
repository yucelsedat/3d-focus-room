# ASAMA 6 (ölçüm) — Oda Projesi için model seçimi: Opus 5.5 vs Sonnet 5.5

- **Tarih:** 2026-11-28 · Branch: `asama6-model-olcumu` (`asama3-tamamlama` üstünde)
- **Yol haritası:** `SESSION-YOL-HARITASI.md` §4 Aşama 6 (ölçüm kısmı; ön ayarlar ve
  danışman henüz yok)
- **Durum:** ölçüm tamam. **Karar (kullanıcı, 2026-11-28): varsayılan Opus kalıyor.** Sonnet
  tile ayarından seçilebilir. Kazanç, kullanıcının bilinçli seçimine bırakıldı; bunun için
  tile'da kota görünürlüğü (Aşama 8) öne alındı.

## Neden bu ölçüm

Aşama 3'ten sonra roomsession-crud kotasının %99'u iş turu, iş turunun ~%54'ü çıktı
(çoğu yazılan kod). Sayaçta Sonnet çıktısı Opus'tan ~%40 hafif (Atlas: %1 = 760K vs 460K).
Kod kısaltılamayacağına göre kalan en büyük kaldıraç model seçimi.

## Düzenek

- Kod: `asama6-model-olcumu` (Aşama 3 kuralları: efor `medium`, skill listesi kapalı, 1h TTL).
- Tile modeli bench `--model` ile: varsayılan (`claude-fable-5` → `cliModel` → Opus 5.5) ve `sonnet`.
- Koşular **dönüşümlü** (O, S, O, S, O, S), her kol 3 koşu, ayrı port/USAGE_FILE, DB kopyası.
- **Kalite deterministik ölçüldü** (model çağırmayan `checkTodoApi` / `checkTodoApiPlus`).
  Üretilen sunucu boş bir portta başlatılıp HTTP ile denenir, `npm test` ayrıca koşulur.
  verify'ın "met" kararından bağımsız.

## Sonuçlar

### roomsession-crud (kolay)

| Model | Kota (%) koşular | Ort. | Araç-tur | İş turu çıktı | API kontrolü (6) | met |
|---|---|---:|---:|---:|---|---|
| Opus 5.5 | 0.0130 · 0.0107 · 0.0135 | 0.0124 | 7-11 | 3.0-4.1K | 3/3 geçti | 3/3 |
| Sonnet 5.5 | 0.0054 · 0.0047 · 0.0047 | **0.0049** | 6-7 | 2.0-2.5K | 3/3 geçti | 3/3 |

Fark **−%60**, aralıklar örtüşmüyor.

### roomsession-api-plus (zor)

Görev: CRUD + boş title'da 400 (POST ve PUT) + olmayan id'de 404 + `?completed=` filtresi +
`?limit&offset` sayfalama + bu kuralları test eden ve geçen `npm test`. Kontrol 12 madde.

| Model | Kota (%) koşular | Ort. | Araç-tur | İş turu çıktı | Kontrol (12) | met |
|---|---|---:|---:|---:|---|---|
| Opus 5.5 | 0.0169 · 0.0158 · 0.0148 | 0.0158 | 9-14 | 4.7-5.5K | 3/3 tam geçti | 3/3, 1. iterasyon |
| Sonnet 5.5 | 0.0081 · 0.0079 · 0.0087 | **0.0082** | 7-11 | 4.1-4.4K | 3/3 tam geçti | 3/3, 1. iterasyon |

Fark **−%48**, aralıklar örtüşmüyor.

## Yorum ve sınırlar

- İki görevde de Sonnet 5.5 kaliteyi kaybetmeden kotayı yarıya indirdi. Kalite tavana
  vurdu (iki model de her kontrolü geçti), yani bu görevler modelleri **ayırt edemeyecek
  kadar kolay** olabilir. Mimari karar gerektiren, belirsiz ya da büyük kod tabanlı işlerde
  Opus'un üstünlüğü bu bench'te görünmez.
- Sonnet ağırlıkları Atlas'ın tahmini (ölçülmemiş). Fiyat türetmesiyle (Opus'un $→% oranı)
  Sonnet daha da hafif çıkar (çıktı/%1 920K). Yani fark muhtemelen en az bu kadar.
- Ölçüm maliyeti: 12 koşu, toplam ~%0.13 Ultra haftası (tahmin).
- Yan veri: iş turunda modele dönen araç sonucu koşu başına 0.5-1.9K karakter. Aşama 4'ün
  (çıktı sıkıştırma) bench'te kazandıracağı bir şey yok; gerçek kullanım verisi
  `toolResultChars` ile birikiyor.

## Öneri (sunulan) ve karar

Kullanıcı "Opus kalsın" seçti. Aşağıdaki öneri kayıt için duruyor.

1. Yeni Oda Projesi tile'larının varsayılanı **Sonnet 5.5**. Tile ayarından Opus seçilebilir
   kalır; mevcut tile'ların ayarı değişmez.
2. Opus için en iyi yer planlama ve zor kararlar. Sonraki adım: Sonnet yürütücü +
   `--advisor opus` (danışman) kolunu aynı iki senaryoda ölçmek. Bir saha raporunda Sonnet
   danışmana kendiliğinden başvurmadı; prompt'ta açık tetik gerekebilir.
3. MultiAgent worker'ları (agent profilindeki model) ayrıca ölçülmeli.
