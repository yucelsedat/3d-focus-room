# Faz Planı — VS Code eklentisi ile paritesi (roomsession · roomchat · multiagent)

**Amaç:** Deneme-yanılmayla nokta atışı token yaması yapmayı bırakmak; headless Claude Code oturum yönetimini **gerçekten çözmüş** referanslardan (resmi Claude Agent SDK, VS Code eklentisi, açık kaynak orkestratörler) öğrenip, roomsession / roomchat / multiagent tile'larını kademeli olarak VS Code eklentisiyle **aynı seviyeye** getirmek.

**Bu doküman:** teşhis + araştırma bulguları + stratejik karar + faz haritası. Her fazın kendi dosyası var (`faz1.md` … `faz6.md`), Fable 5 tek tek uygulayacak.

**Araştırma yöntemi (bu plan tahmine değil kanıta dayanır):**
- Resmi Anthropic dokümanları: `code.claude.com/docs/en/agent-sdk/{sessions, session-storage, streaming-vs-single-mode}`
- Resmi örnek repo: `anthropics/claude-agent-sdk-demos` (Simple Chat App = React+Express+SDK; Research Agent = çok-ajan subagent)
- SDK kaynak: `anthropics/claude-agent-sdk-python` (`SessionStore`, `session_resume.py` iç mantığı)
- CLI bayrak/env referansı: `ytrofr/claude-code-guide`, `Claudient/Claudient` deep-dive
- Açık kaynak orkestratörler: Claude Squad, Crystal→Nimbalyst, Vibe Kanban, Conductor, **ChatML** (Agent SDK + worktree, 750+ PR), Emdash
- **Tüm kritik bayraklar kurulu CLI'da (`2.1.195`) `claude --help` ile DOĞRULANDI** (aşağıda liste).

---

## 1. Teşhis — mevcut durumun DOĞRU resmi

Önce yanlış bir varsayımı düzeltelim: kod tek tip değil, **üç ayrı transport deseni** var ve hepsi aynı derecede sorunlu değil:

| Tile | Transport (server.js) | Durum |
|---|---|---|
| **roomchat / ai-session** | `PersistentSession` + `SessionPool`, streaming input (`--input-format stream-json`), süreç canlı kalır, idle/çökmede `--resume` (satır 1553–1602) | ✅ SDK modeliyle örtüşüyor — doğru desen |
| **roomsession** (`LoopRunner`) | İş turu **kalıcı** `sessionPool` üzerinden (satır 2782), verify turu stateless ucuz haiku (2625) | ✅ Büyük ölçüde doğru; per-iterasyon respawn YOK |
| **multiagent** (`MultiAgentRunner`) | Stateless-epoch worker (her görev taze oturum, görevler arası evict; yalnız aynı görev çökerse `--resume`), deterministik orkestratör, direct fast-path, bütçe frenleri (3040–3214) | ✅ önceki turda uygulanmış (Ek A) — ama uçtan uca kanıtı yok |

**Sonuç:** Taktik token optimizasyonunun büyük kısmı önceki turlarda zaten yapılmış (tam liste: **Ek A**). "6 kat" algısının kaynağı iki gerçek:

1. **multiagent'ın SERİ tek-klasör mimarisi** (2.73M token'lık koşu) — orkestratör her iterasyonda tek rol seçiyor, worker'lar aynı dizinde sırayla çalışıyor. Bu "çok-ajan değeri" değil, **yeniden-yazım makinesi**. (Bkz. Faz 5.)
2. **El-yapımı transport'un kaçınılmaz maliyeti:** her spawn'da default system prompt'un **dinamik bölümleri** (cwd, env, git status, memory) değiştiği için cache prefix'i bozuluyor; CLAUDE.md/hook/plugin keşfi her süreçte yeniden ödeniyor; JSONL formatı "internal" olduğu için kırılgan (önceki analiz bunu keşfetti: beklenen `sessions/` alt-klasörü yok, format sürümler arası değişiyor).

**Asıl yapısal boşluk:** transport **elle** yazılmış. Kod şunları kendi kendine yönetiyor: `spawn(claude)`, stream-json zarfı kurma, çıktı satırı parse etme, session pool + idle respawn + eviction + RSS bekçisi + süreç-grubu kill + MCP çocuk temizliği, sessionId takibi, `--resume`, JSONL yol türetimi, usage muhasebesi, bütçe freni. **Bunların TAMAMINI Claude Agent SDK yerleşik ve bakımlı olarak sağlıyor.** VS Code eklentisi, ChatML ve resmi demolar ham CLI değil **SDK** kullanıyor. "Amerika'yı yeniden keşfetmek" dediğin şey tam olarak bu.

---

## 2. Araştırma bulguları — profesyoneller ne yapıyor

### 2a. Oturum modeli (resmi docs)
- **Multi-turn chat = tek süreçte kalıcı oturum.** TS'de `query({ continue: true })`, Python'da `ClaudeSDKClient`. SDK sessionId'yi kendi takip eder. Süreç boyunca cache prefix **sıcak** kalır → her tur yalnız yeni mesaj + çıktı öder. Bu, `PersistentSession`'ınızın elle yaptığı şeyin ta kendisi.
- **`resume` (belirli sessionId) çok-kullanıcılı/çok-oturumlu app için;** `continue` en son oturumu bulur. **`fork` (`--fork-session`)** orijinali bozmadan alternatif dal açar — multiagent "farklı yaklaşım dene" için birebir.
- **Resmi tavsiye (kritik):** _"Don't rely on session resume. Capture the results you need (analysis, decisions, file diffs) as application state and pass them into a fresh session's prompt."_ → multiagent'ın stateless-epoch + roleState yaklaşımı (kod tabanında mevcut) **resmi olarak doğru yol**. Kararınızı Anthropic doğruluyor.
- **`SessionStore` adapter:** transcript'leri S3/Redis/DB'ye aynalayıp **başka makinede/restart sonrası** resume. `.recall` checkpoint'inizin olgun karşılığı — ama konuşma geçmişini de taşır.
- **Prompt caching zorunlu desen:** system prompt + tool şeması ilk çağrıda cache'lenir, sonraki çağrılar prefix'in ~%10'unu öder. Cache'i bozan tek şey **prefix değişimi** — dinamik system prompt bölümleri ve tool tanımı değişimi.

### 2b. Çok-ajan değeri NEREDE (açık kaynak ekosistemi)
Tüm orkestratörler (Claude Squad, Crystal/Nimbalyst, Vibe Kanban, Conductor, ChatML, Emdash) çok-ajan değerini **tek yerden** çıkarıyor: **git worktree izolasyonu + paralel oturumlar.** Her ajan kendi worktree'sinde (kendi branch + kendi çalışma dizini), çakışma yok, gerçekten paralel. ChatML bunu Agent SDK ile yapıp kendini kendi aracıyla geliştirerek 750+ PR merge etmiş. VS Code / CLI'ın kendi `claude -w <name>` (worktree) özelliği de aynı fikirde.
→ **Sizin serİ tek-klasör multiagent'ınız bu değeri üretmiyor.** Faz 5 bunu kökten ele alıyor.

### 2c. Kurulu CLI'da DOĞRULANMIŞ kaldıraçlar (`claude --help`, v2.1.195)
| Bayrak / env | Ne yapar | Faz |
|---|---|---|
| `--exclude-dynamic-system-prompt-sections` | cwd/env/git/memory'yi ilk user mesajına taşır → **cache prefix sabitlenir**, cross-tur/respawn cache reuse artar. Yalnız default prompt ile çalışır → kod `--append-system-prompt` kullandığından (1587, 3332) **uygulanabilir** | Faz 2 |
| `ENABLE_PROMPT_CACHING_1H=1` / `FORCE_PROMPT_CACHING_5M=1` | Cache TTL'i 1s / 5dk'ya sabitler (v2.1.108+, kurulu 2.1.195). Önceki turda "bilinmiyor" denen env'ler **var** | Faz 2 |
| `--bare` (`CLAUDE_CODE_SIMPLE=1`) | hook/LSP/plugin/attribution/auto-memory/CLAUDE.md keşfini atlar → ~10× hızlı başlangıç, spawn başı prefix yükü düşer. Tipografi kuralları `--append-system-prompt-file` ile geri verilir | Faz 2 |
| `--fork-session` | resume yerine yeni sessionId ile dallan | Faz 5 |
| `--session-id <uuid>` | kendi UUID'ni ver (yakalama gerekmez) | Faz 4 |
| `--no-session-persistence` | disk'e yazma (verify/tek-atış için) | Faz 3 |
| `--max-budget-usd`, `--tools`, `--strict-mcp-config`, `--setting-sources` | zaten kısmen kullanımda | — |

---

## 3. Stratejik karar

İki yol var:
- **Yol A (derin):** Tüm transport'u `@anthropic-ai/claude-agent-sdk`'ye taşı. VS Code / ChatML / resmi demoların yaptığı. En sağlam, pariteyi "bedavaya" getirir (interruption, checkpointing, listSessions, partial-message streaming) ama büyük yeniden yazım.
- **Yol B (artımlı):** Mevcut CLI transport'u koru, doğrulanmış bayrak/prefix optimizasyonlarını uygula.

**Seçim: sıralı hibrit.** Önce Yol B'nin ucuz-yüksek kaldıraçlı kısmı (Faz 1–3) — bunlar tek başına algılanan farkı büyük ölçüde kapatır ve düşük risk. Sonra ölçüm hâlâ boşluk gösterirse Yol A (Faz 4). Multiagent'ın varlık nedenini Faz 5 ayrıca sorgular. Böylece **her faz ölçülebilir bir kazançla kapanır**, kör yeniden yazım yok.

---

## 4. Faz haritası

| Faz | Başlık | Risk | Neden bu sırada | Kabul kriteri |
|---|---|---|---|---|
| **1** | Ölç & kanıtla (ground truth) | Yok | Ölçmeden optimizasyon = deneme-yanılma. A/B koşum düzeneği kur | Aynı iş için tur-başı cacheRead ve tile-tipi toplam görünür; before/after tablosu üretilebiliyor |
| **2** | Cache-prefix sabitleme + doğrulanmış bayraklar | Düşük | En büyük ucuz kazanç; hepsi CLI'da doğrulandı | Aynı roomsession işinde cacheWrite/cacheRead ölçülür şekilde düşer; smoke test kaliteyi korur |
| **3** | Transport hijyeni (respawn/idle/verify) | Düşük-orta | Gereksiz cache-busting respawn'ları ve pahalı verify'ı kes | Respawn sayısı ve verify maliyeti düşer, çökme-dayanıklılığı korunur |
| **4** | Agent SDK transport migrasyonu | Yüksek | El-yapımı transport'u bırak — yapısal parite. Bayrakla, tile-tipi tile-tipi | Bir tile tipi SDK üzerinden çalışır, token/davranış paritesi kanıtlanır; geri dönülebilir |
| **5** | Çok-ajanı yeniden düşün (worktree paralellik vs routing) | Orta | "Multiagent'ın faydasını anlamadım" — cevabı worktree izolasyonu ya da emeklilik | Çok-ajan ya gerçek paralel değer üretir ya da routing lehine devre dışı; net karar |
| **6** | Parite kontrol listesi + guardrail + kabul | Düşük | VS Code yeteneklerini tek tek işaretle, bütçe/bellek kilitle | Parite checklist'i dolu; uçtan uca before/after kanıtı |

**Fable 5 için sıra:** Faz 1 → 2 → 3 zorunlu ve düşük risk, önce bunlar. Faz 4 ve 5 **go/no-go kararı** gerektirir (Faz 1'in verisiyle); ben Faz 4 (SDK migrasyonu) öncesi codex'e ikinci görüş için danışılmasını öneririm çünkü tek yüksek-riskli mimari hamle o.

---

## 5. Kapsam dışı (bilinçli)
- **Ek A'daki zaten yapılmış** işleri tekrar etme (verify=haiku, stateless-epoch, MCP kapatma, RSS bekçisi, direct routing, bütçe frenleri). Bu fazlar onların ÜSTÜNE gelir.
- JSONL'dan satır silme (kalıcı rafa kaldırıldı — format internal, parser kırılgan).
- Compaction'ı ilk hamle yapma (asıl sorun gereksiz tur çoğalması; routing/prefix çözülünce bu turlar zaten kalmaz).

## 6. Her fazdan sonra doğrulama
`node --check server.js`; UI dokunulursa `npm run build`. Uçtan uca kanıt her fazın kendi dosyasında.

---

## Ek A — Zaten yapılmış (kod tabanında mevcut, tekrar etme)
Önceki optimizasyon turlarında uygulandı; bu fazlar bunların üstüne gelir:

**Token / routing**
- Doğrulayıcı her yerde Haiku'ya sabit (`VERIFY_MODEL`, satır 2624), roomsession dahil.
- multiagent stateless-epoch worker: her görev taze oturum, görevler arası `evict`, yalnız aynı görev çökerse `--resume` (3099–3163).
- Deterministik orkestratör: bekleyen görev varken LLM'e sorulmaz; ilk bekleyen alınır (3066). LLM orkestratör yalnız kurtarmada.
- Direct fast-path: basit fikir mimara hiç gitmez (`classifyIdeaScale` + `directManifest`), tek rol + 1 görev + verify; review atlanır.
- Mimar minimum-rol kuralları (`.claude/agents/project-architect.md`); `maxIterations` = görev+2-3.
- Tek-sahip / "full-file write en fazla bir kez" worker prompt kuralı (3146).
- multiagent verify-skip: tüm görev + review bitmeden gerçek doğrulama yapılmaz (3167).

**Bütçe / bellek**
- İşlenen-toplam token freni `MA_MAX_TOTAL_TOKENS` + output freni `MA_MAX_OUTPUT_TOKENS` (3183–3190).
- Worker spawn'larına `--max-budget-usd`, `--tools` (Task/WebSearch kapalı → alt-ajan çarpanı yok); verify `--tools Read,Glob,Grep,Bash`; mimar `--tools Read`.
- MCP kapalı: multiagent/verify/architect/orchestrate/bluprint/roomchat → `--strict-mcp-config` (`_NO_MCP`, satır 79–114).
- SessionPool: idle timeout, RSS bekçisi (`/proc/<pid>/status`), hard cap (429), süreç-grubu kill (`detached` + `kill(-pid)`), MCP çocuk temizliği.
- Günlük token sayacı (`recordGlobalUsage` → `data/usage-daily.json`, `GET /api/usage/daily`) + respawn sonrası `[resume-cost]` logu.

**Kaldırıldı / rafa**
- Ölü `trimSessionJsonl` (yanlış yol arıyordu, hiç çalışmıyordu) kaldırıldı; geçmiş diyeti CLI'ın microcompact/auto-compact'ine bırakıldı.
- JSONL satır silme kalıcı olarak reddedildi (format internal).
