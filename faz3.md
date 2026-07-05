# Faz 3 — Transport Hijyeni (Respawn / Idle / Verify)

**Amaç:** Cache prefix'ini bozan gereksiz respawn'ları ve pahalı/gereksiz tek-atış spawn'larını kes. Faz 2 prefix'i sabitledi; bu faz **prefix'in ne sıklıkla yeniden yazıldığını** azaltır.

**Kanıt:** Her respawn = `--resume` = tüm JSONL yeniden okunur + cache prefix yeniden yazılır. VS Code eklentisi tek süreci canlı tutar ve mid-session **hiç re-resume etmez** → cache sürekli sıcak. Bizim `PersistentSession` idle-timeout, model/ayar değişimi ve çökmede respawn ediyor; ilk ikisi çoğu zaman gereksiz.

**Ön koşul:** Faz 1 respawn sayacı (İş 1.4) çalışıyor olmalı — bu fazın etkisi respawn sayısındaki düşüşle ölçülür.

---

## İş 3.1 — Idle-timeout'u cache TTL kararıyla hizala
**Bağlam:** Kod tabanında `PERSIST_IDLE_MS` şu an 15 dk (idle sürecin RAM'i boşuna tutmaması için). Ama Faz 2'de roomchat/ai-session için `ENABLE_PROMPT_CACHING_1H` seçtiysek, süreci 1s cache TTL boyunca canlı tutmak **cache-hit demektir** — erken evict edip sonra respawn etmek cacheWrite'ı boşa ödetir.

**Uygulama:**
- Cache TTL kararına bağla: **1H cache'li tile'larda** idle timeout'u cache penceresine yakın tut (ör. 20–30 dk) → kullanıcı geri dönünce sıcak cache. **5M cache'li loop tile'larında** kısa tut (süreç zaten iş bitince evict ediliyor).
- RAM güvenliği (RSS bekçisi + hard cap kod tabanında mevcut) bu uzatmayı zaten sınırlıyor — bellek baskısında evict devrede.
- **Ölç:** Faz 1 bench'inde roomchat-3turn senaryosuna turlar arası 6–10 dk bekleme ekleyen bir varyant koştur; 1H cache + uzun idle ile ikinci/üçüncü turun cacheWrite'ının düştüğünü göster.

## İş 3.2 — Önemsiz ayar değişiminde respawn etme
**Bağlam:** `PersistentSession._next` model/ayar değişiminde yeni ayarlarla respawn ediyor (geçmiş `--resume` ile korunuyor). Ama `effort` gibi model-dışı ayar değişimi respawn gerektirmeyebilir.

**Uygulama:**
- Respawn tetikleyicisini yalnız **gerçekten yeni süreç gerektiren** değişimlere (model, cwd, tools, sys) daralt. `effort`/`permissionMode` gibi tur-başı gönderilebilen alanlar için respawn etme.
- roomsession loop'unda ayarlar başta donduruluyor (satır ~2790 civarı `this.settings`); mid-loop respawn olmadığını doğrula — olmamalı.

## İş 3.3 — Tek-atış spawn'lara `--no-session-persistence`
**Bağlam:** verify (2628), orchestrate (3076), architect (3328), bluprint (3669) tek-atış; asla `--resume` edilmiyorlar ama yine de JSONL yazıyorlar → disk + session listesi kirliliği.

**Uygulama:**
- Bu tek-atış spawn'lara `--no-session-persistence` ekle (yalnız `-p`/`--print` ile çalışır — hepsi öyle). Disk yazımı ve `~/.claude/projects` şişmesi biter, resume gereği yok.
- **İstisna:** multiagent worker'ın "aynı görev çökerse `--resume`" mekanizması persistence gerektirir → worker spawn'ında **KULLANMA**. Yalnız gerçekten tek-atış olanlarda.

## İş 3.4 — Çökme sonrası re-resume maliyetini görünür kıl
- `[resume-cost]` logu (Faz 1) respawn sonrası ilk turun cacheWrite'ını basıyor. Bir eşik ekle: ilk-tur cacheWrite anormal büyükse (`> RESUME_COST_WARN`) uyar → bu, ileride hedefli içerik-diyeti (opsiyonel) kararının tetikleyicisi.

---

## Uygulama sırası
1. İş 3.3 (`--no-session-persistence`) — küçük, net, düşük risk.
2. İş 3.2 (respawn tetik daraltma).
3. İş 3.1 (idle ↔ cache TTL hizalama) — Faz 2 TTL kararına bağlı.
4. İş 3.4 (resume-cost uyarı eşiği).

## Doğrulama
- `node --check server.js`.
- İş 3.3: verify koşusu sonrası `~/.claude/projects/<cwd>/` altında yeni JSONL **oluşmadığını** doğrula.
- İş 3.1/3.2: Faz 1 respawn sayacı — aynı roomchat senaryosunda respawn sayısı baseline'a göre düşük; cacheWrite düşük.
- Çökme senaryosu: worker'ı ortada kill et → aynı görev `--resume` ile devam ediyor (persistence korunmuş).

## Kabul kriteri
Tek-atış spawn'lar disk'e yazmıyor; roomchat/roomsession senaryolarında respawn sayısı ve respawn-sonrası cacheWrite ölçülür şekilde düşük; çökme-dayanıklılığı (worker resume) bozulmamış.

## Risk
Düşük-orta. Tek dikkat: `--no-session-persistence`'ı yanlışlıkla resume gereken worker'a uygulamak → çökme sonrası geçmiş kaybı. İş 3.3'te açık istisna var.
