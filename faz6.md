# Faz 6 — Parite Kontrol Listesi + Guardrail'ler + Kabul

**Amaç:** "VS Code eklentisiyle aynı seviye"yi somut, işaretlenebilir bir kontrol listesine dökmek; bütçe/bellek güvenliğini kilitlemek; uçtan uca before/after kanıtıyla kapatmak.

**Ön koşul:** Faz 1–3 tamam (Faz 4–5 kararına göre kısmen). Bu faz doğrular ve mühürler.

---

## Parite kontrol listesi (VS Code / interaktif Claude Code yetenekleri)
Her satır: mevcut mu? hangi fazda geldi? kanıt?

| Yetenek | Nasıl karşılanır | Faz |
|---|---|---|
| Oturum devamı (multi-turn, sıcak cache) | `PersistentSession` / SDK `continue` | mevcut / 4 |
| Belirli oturuma resume | `--resume` / SDK `resume` | mevcut / 4 |
| Alternatif dal (fork) | `--fork-session` / SDK `forkSession` | 4/5 |
| Turu kesme (interrupt) | SDK `query.interrupt()` | 4 |
| Token-token kısmi akış | SDK `include_partial_messages` | 4 |
| Dosya checkpoint/geri-alma | SDK file checkpointing | 4 |
| Oturum listesi/isim/etiket | SDK `listSessions/rename/tag` | 4 |
| Cross-restart/host dayanıklılık | `.recall` + SDK `SessionStore` | 4 |
| Maliyet görünürlüğü (`/cost` benzeri) | `usage-daily` + tur-başı log | 1 |
| Sıcak cache prefix (düşük token) | exclude-dynamic + TTL + bare | 2 |
| Az respawn / disk hijyeni | idle hizalama + no-session-persistence | 3 |
| MCP/tool yükü kontrolü | `--tools` + `--strict-mcp-config` | 2/mevcut |
| Bellek güvenliği | RSS bekçisi + hard cap + süreç-grubu kill | mevcut |
| Bütçe freni | `--max-budget-usd` + işlenen-toplam tavanı | mevcut |
| Gerçek paralel çok-ajan | worktree izolasyonu (opsiyonel) | 5 |

**Çıktı:** `bench/PARITE.md` — bu tablo, her satır "✅ kanıt: <bench/log referansı>" ile doldurulmuş.

## Guardrail'ler (kilitlenecek)
1. **Bütçe:** her spawn'da `--max-budget-usd` + `MultiAgentRunner`'daki işlenen-toplam tavanı aktif ve tile-tipine göre makul. Kaçak koşu → temiz hata, recall korunur.
2. **Bellek:** RSS bekçisi + `PERSIST_HARD_MAX` + süreç-grubu kill smoke test'ten geçmiş (spawn → `ps --ppid` çocukları gör → evict → ağaç öldü).
3. **Eşzamanlılık:** `MAX_ACTIVE_LOOPS` sınırı; worktree kullanılırsa paralel worker sayısı da tavanlı.
4. **Auth:** `--bare` kullanılan yollarda `ANTHROPIC_API_KEY` mevcut (bare OAuth okumaz).

## Uçtan uca kabul (before/after)
Faz 1 baseline'ına karşı üç senaryoyu son haliyle koştur:
| Senaryo | Baseline (Faz 1) | Son | Hedef |
|---|---|---|---|
| `direct-cafe` (multiagent tile) | ~2.73M (eski) | ölç | ~30–60K (direct'e düşer) |
| `roomsession-crud` | ölç | ölç | interaktif referansın ~1.2× bandı |
| `roomchat-3turn` | ölç | ölç | cacheWrite baseline'ın altında |

**Parite tanımı:** aynı iş için focus-room tile'ı, interaktif Claude Code oturumunun **işlenen-toplam token'ının makul bandında** (≤ ~1.3×) kalıyor; kaçak koşu yok; kalite korunuyor.

---

## Doğrulama
- `node --check server.js`; `npm run build`.
- `bench/PARITE.md` her satırı işaretli.
- Üç senaryo before/after tablosu hedef bandında.
- Guardrail smoke test'leri (bütçe kes, bellek evict, çökme resume) geçiyor.

## Kabul kriteri
Parite kontrol listesi dolu + before/after tablosu hedefte + guardrail'ler kilitli. Bu noktada "roomsession/roomchat/multiagent VS Code eklentisiyle aynı seviyede" **kanıtlı** olarak söylenebilir.

## Risk
Düşük (doğrulama/mühürleme fazı). Tek risk: bir parite satırı kanıtlanamazsa → ilgili faza geri dön, kör "tamam" deme.
