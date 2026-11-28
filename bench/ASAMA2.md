# ASAMA 2a — Spawn profilleri: sonuçlar ve kanıtlar

- **Tarih:** 2026-11-28 · Branch: `asama2-session-cekirdegi` (`asama1-kota-olcumu` üstünde)
- **Yol haritası:** `SESSION-YOL-HARITASI.md` §4 Aşama 2, madde 2-3

## Kapsam

Aşama 2 iki dilime bölündü:

- **2a (bu rapor):** tüm claude spawn argv/env'leri tek modülde. Aşama 3'ün bütün
  değişiklikleri (`--setting-sources`, `--effort`, TTL, `--json-schema`, `--fallback-model`)
  bu dosyaya dokunarak yapılabilir.
- **2b (sonra):** `PersistentSession`, `SessionPool`, `LoopRunner` ve `MultiAgentRunner`
  sınıflarının `server/sessions/` altına taşınması. Bunlar `app`, `prisma`, SSE yardımcıları
  gibi çok sayıda global'e bağlı. Taşıma Aşama 5 (Loop v2) ile birlikte yapılınca daha az
  iş çıkıyor.

## Yapılanlar

| İş | Nerede |
|---|---|
| 7 tek-atış profil: `live-session`, `projectview-detect`, `roomchat-graph`, `verify`, `orchestrate`, `architect`, `bluprint-build` | `server/sessions/spawnProfiles.js` → `ONESHOT` |
| Kalıcı oturum argv + env: model, MCP, partial stream, sys, tools, budget, izin, resume, efor, TTL | `spawnProfiles.persistent()` |
| `cliModel`, `VERIFY_MODEL`, `PARTIAL_STREAM_TILES` modüle taşındı | `server.js` import ediyor |
| Yan etkili bağımlılıklar (`mcpArgs`, `permissionArgs`) `SPAWN_CTX` ile enjekte | `server.js` |
| `server.js`'te elle dizilmiş `'--print'` dizisi kalmadı (önce 8 yer) | `grep "'--print'" server.js` → 0 |
| Snapshot testi: `npm run verify:spawn` | `scripts/verify-spawn-argv.mjs` |

## Davranış değişmedi: kanıt

1. **Snapshot testi (12 kontrol):** her tek-atış profil 4 farklı girdiyle, refactor öncesi
   `server.js`'ten (8b9fb96) kopyalanan dizilerle argv, env ve usageType bazında birebir
   aynı. Kalıcı oturumda 6 tile × 4 model × 4 efor × 5 izin modu × 5 seçenek seti =
   2.400 kombinasyonun hepsi aynı.
2. **Kopyanın doğruluğu:** `server.js`'teki 8 dizi programla çıkarılıp (yorumlar ve
   boşluklar atılarak) LEGACY kopyalarıyla karşılaştırıldı. Tek farklar değişken adları:
   `vModel` = `cliModel(model || VERIFY_MODEL)`, `p` → `prompt`, `profile.body` →
   `systemPrompt`.
3. **Canlı duman testi:** worktree sunucusu port 5097'de, veritabanının yedek kopyası ve
   ayrı `USAGE_FILE` ile çalıştı. ai-session (haiku) 2 tur:

   ```
   turn=1 in=2 cw=14519 cr=11124 out=5 q=0.0009 cold=1 model=haiku
   turn=2 in=2 cw=11561 cr=14136 out=7 q=0.0008 cold=0 model=haiku
   ```

   Aşama 1 duman testiyle aynı sınıf sayılar. **İkinci turdaki ~11.5K cache yazması
   tekrarlandı** (Aşama 1'de 11.313). Tesadüf değil; Aşama 3 madde 0'ın konusu.

## Sınırlar

- Lint'teki iki hata (`once`, `withStreamRegistry`) refactor öncesinden kalma.
- Tek-atış profiller canlı koşulmadı (verify ve architect gerçek kota harcar). Kanıt
  snapshot testine dayanıyor; değişiklik saf bir yer değiştirme.
