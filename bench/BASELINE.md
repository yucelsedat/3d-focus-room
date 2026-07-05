# BASELINE — Faz 1 ground truth (optimizasyon ÖNCESİ)

Bu tablo, **sonraki tüm fazların "önce" sütunudur.** Faz 2/3/4 kapanışında
"cacheWrite/cacheRead düştü mü" iddiası bu sayılara karşı ölçülür.

- **Ölçüm tarihi:** 2026-07-05
- **Koşum:** `node scripts/bench.mjs --scenario <ad> --label baseline --base http://localhost:5099`
- **İzolasyon:** ayrı port (5099) + ayrı usage dosyası (`USAGE_FILE=data/bench/usage-bench.json`)
  → dev sunucusuyla `data/usage-daily.json` paylaşımı yok, delta temiz.
- **Kaynak JSON'lar:** `data/bench/baseline-*.json`
- **Model:** worker/chat = `claude-fable-5`, verify = `claude-haiku-4-5`

> Not: token sayıları API'nin anlık cache davranışına göre koşudan koşuya ±%10-15
> oynar. Fazlar arası anlamlı fark bu gürültünün üstünde olmalı.

## Özet tablo (koşu toplamı)

| Senaryo | Sonuç | İter | Çağrı | input | cacheWrite | cacheRead | output | **processedTotal** | Süre |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| `direct-cafe` (multiagent, direct) | met | 2 | 2 | 31 | 60.634 | 66.030 | 19.892 | **146.587** | 237s |
| `roomsession-crud` (LoopFlow) | met | 1 | 2 | 6.536 | 22.356 | 449.411 | 10.852 | **489.155** | 238s |
| `roomchat-3turn` (sohbet) | 3 tur | — | 3 | 6.442 | 16.736 | 193.094 | 3.561 | **219.833** | 125s |

`processedTotal = input + cacheWrite + cacheRead + output` (oturum penceresini
tüketen asıl büyüklük). `respawns = 0` her üç senaryoda (koşular kısa, idle-evict
olmadı — Faz 3'ün respawn-azaltma etkisi ancak uzun/kesintili koşularda görünür).

## Tur-başı cacheRead birikimi (`[turn-usage]` logu)

Planın çekirdek gözlemi — **cacheRead'in tur tur nasıl biriktiği.** Kaynak: bench
sunucusu stderr, `grep turn-usage`.

**`roomchat-3turn`** — kalıcı (sıcak) oturum, cache prefix sabit:

| Tur | input | cacheWrite | cacheRead | output | total |
|---:|---:|---:|---:|---:|---:|
| 1 | 6.316 | 15.612 | 148.369 | 2.956 | 173.253 |
| 2 | 2 | 629 | 22.048 | 467 | 23.146 |
| 3 | 124 | 495 | 22.677 | 138 | 23.434 |

→ İlk tur sistem prompt + oda içeriğini cache'ler (cr 148K); sonraki turlar sabit
~22K cacheRead + küçük delta öder. **Sıcak oturum doğru çalışıyor** — tur-tur büyüme yok.

**`roomsession-crud`** — iş turu (fable-5) + verify (haiku), tek iterasyon:

| Tur | model | input | cacheWrite | cacheRead | output | total |
|---|---|---:|---:|---:|---:|---:|
| iş turu | fable-5 | 6.438 | 16.565 | 244.369 | 8.197 | 275.569 |
| verify | haiku-4-5 | 98 | 5.791 | 205.042 | 2.655 | 213.586 |

→ Verify'ın cacheRead'i (205K) iş turununkine yakın: haiku ucuz ama dosyaları okuyup
bağlamı yeniden yüklüyor. **Faz 3'ün gereksiz-verify kısma hedefinin veri temeli budur.**

**`direct-cafe`** — direct routing (mimar spawn'ı atlandı): 2 worker turu + haiku verify,
toplam 146K. Karşılaştırma referansı: aynı iş eski seri-multiagent mimarisinde 2.73M yakmıştı
(FAZLAR.md §1). Direct fast-path bunu ~%95 kısmış durumda — Faz 2 prefix sabitlemesi
worker'ın 60K cacheWrite'ını daha da düşürmeli.

## Sonraki fazlar için okuma

- **Faz 2** (cache-prefix sabitleme): `cacheWrite` sütunu düşmeli — özellikle
  `direct-cafe` worker (60K) ve `roomsession` iş turu (16K) ilk-tur cacheWrite'ı.
- **Faz 3** (transport hijyeni): `roomsession`/`multiagent` verify'ın cacheRead'i
  (205K) ve `respawns` sayısı düşmeli.
- Her fazdan sonra: `--label faz2` / `--label faz3` ile aynı üç senaryoyu koş,
  bu tabloyla yan yana koy.
