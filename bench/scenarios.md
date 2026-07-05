# Bench Senaryoları (Faz 1 — İş 1.3)

Amaç: **aynı fikri** optimizasyon öncesi/sonrası koşup farkı tabloya dökmek.
Her senaryo deterministiktir (aynı fikir metni, aynı ayarlar) — fazlar arası fark
ölçüm gürültüsü değil gerçek olsun. Tanımlar `scripts/bench.mjs` içindeki
`SCENARIOS` sabitiyle birebir aynıdır; birini değiştirirsen ikisini de güncelle.

Koşum:

```bash
node scripts/bench.mjs --scenario <ad> --label <etiket>   # ör. --label baseline
```

Script `__bench__` adlı izole bir oda kurar/aktive eder, odanın proje klasörünü
sıfırlar, koşu bitince tile'ı siler ve önceki aktif odayı geri getirir.
Sonuç: `data/bench/<label>-<senaryo>-<ts>.json`
(tile-tipi usage delta + processedTotal + recall{iterasyon, respawns, usage}).

> DİKKAT: gerçek API tüketir. Gün başına 1 baseline koşusu yeter.

## 1. `direct-cafe` — multiagent (direct routing)

- **Fikir:** `tek sayfa HTML cafe sitesi, şık`
- **Beklenen routing:** `classifyIdeaScale` → `direct` (mimar atlanır, tek rol +
  1 görev, review atlanır, 1 haiku verify).
- **Ne ölçer:** multiagent fast-path'in taban maliyeti; Faz 2 prefix
  sabitlemenin worker spawn'ına etkisi.

## 2. `roomsession-crud` — roomsession (LoopFlow)

- **Hedef:** `Express + SQLite todo API: GET /todos, POST /todos, PUT /todos/:id,
  DELETE /todos/:id endpointleri çalışıyor; package.json ve server.js mevcut;
  sunucu hatasız başlıyor.`
- **maxIterations:** 6
- **Ne ölçer:** kalıcı oturumlu iş turu + haiku verify döngüsünün tur-tur
  cacheRead birikimi; respawn sayısı (Faz 3'ün hedefi).

## 3. `roomchat-3turn` — roomchat (3 turluk sohbet)

- **Prompt dizisi (sabit, sırayla):**
  1. `Bu odada hangi içerikler var? Kısaca listele.`
  2. `Bu içeriklerden en önemli 3 temayı çıkar ve her birini bir cümleyle açıkla.`
  3. `Bu üç temayı tek bir cümlede birleştirerek özetle.`
- **Ne ölçer:** kalıcı sohbet oturumunda tur-başı artan maliyet (cache sıcaklığı);
  Faz 2'de `--exclude-dynamic-system-prompt-sections` etkisi.
- **Not:** `__bench__` odası boş olduğundan cevaplar "içerik yok" der — sorun
  değil; ölçülen şey içerik değil transport maliyeti.

## Okuma kılavuzu

- `usageDelta.<tile>.processedTotal` — oturum penceresini tüketen asıl büyüklük
  (input + cacheWrite + cacheRead + output).
- `recall.respawns` — koşu içinde `--resume` ile kaç kez süreç yeniden doğdu.
- Tur-tur birikim için sunucu logunda `[turn-usage]` satırlarını grep'le:
  `grep turn-usage <sunucu-log>` → `cr=` sütununun büyüme eğrisi.
- Fazlar arası karşılaştırma tablosu: `bench/BASELINE.md` ("önce" sütunu).
