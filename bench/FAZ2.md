# FAZ 2 — Cache-Prefix Sabitleme: BASELINE'a karşı sonuçlar

- **Ölçüm tarihi:** 2026-07-05 (baseline ile aynı gün)
- **Koşum:** `node scripts/bench.mjs --scenario <ad> --label faz2 --base http://localhost:5099`
  (izole sunucu + `USAGE_FILE`, BASELINE.md ile aynı düzenek)
- **Kaynak JSON'lar:** `data/bench/faz2-*.json`

## Uygulanan işler

| İş | Durum |
|---|---|
| 2.1 `--exclude-dynamic-system-prompt-sections` | ✅ 6 spawn noktası: `PersistentSession._spawn`, verifyGoal, `_orchestrate`, architect, bluprint, roomchat-rebuild |
| 2.2 Cache TTL env | ✅ roomsession/multiagent → `FORCE_PROMPT_CACHING_5M=1`; roomchat/ai-session/bluprint → `ENABLE_PROMPT_CACHING_1H=1`. **Kanıt:** `result.usage.cache_creation` kırılımı env'leri birebir izliyor (1H → tümü `ephemeral_1h`, 5M → tümü `ephemeral_5m`) |
| 2.4 Tool kısma | ✅ roomchat → `Read,Glob,Grep,Bash`; multiagent review rolü → `Read,Glob,Grep,Edit` (Write/Bash yok) |
| 2.3 `--bare` | ⏸️ **ERTELENDİ** — kurulum OAuth (ANTHROPIC_API_KEY yok); `--bare` keychain/OAuth okumadığından spawn auth alamaz. API key kurulursa yeniden değerlendirilir |

## Sonuç tablosu (koşu toplamı, önce → sonra)

| Senaryo | processedTotal | Δ | cacheWrite | cacheRead | output |
|---|---|---:|---|---|---|
| `direct-cafe` | 146.587 → **131.493** | **−10%** | 60.634 → 58.926 | 66.030 → 57.257 | 19.892 → 15.123 |
| `roomsession-crud` | 489.155 → **336.744** | **−31%** | 22.356 → 35.289 | 449.411 → 286.497 | 10.852 → 8.606 |
| `roomchat-3turn` | 219.833 → **38.875** | **−82%** | 16.736 → 22.837 | 193.094 → 14.951 | 3.561 → 680 |

**Kabul kriteri sağlandı:** üç senaryonun hepsinde processedTotal ölçülebilir düşük;
her iki loop senaryosu da `met` ile kapandı (kalite korunmuş), roomchat 3 turu tutarlı yanıtladı.

## Tur-başı okuma (`[turn-usage]`, faz2)

**roomchat-3turn** — asıl kazanç burada: baseline'da tur 1 `cr=148K` ödüyordu
(dinamik prefix + tam tool seti + oda korpusu cache kurulumu); şimdi:

| Tur | in | cw | cr | out | total |
|---:|---:|---:|---:|---:|---:|
| 1 | 159 | 7.532 | 0 | 516 | 8.207 |
| 2 | 246 | 14.951 | 0 | 82 | 15.279 |
| 3 | 2 | 354 | 14.951 | 82 | 15.389 |

→ Baseline'da tur başına ~23K sabit cacheRead vardı; şimdi ~15K (tool tanımı diyeti).
Tur 2'nin `cr=0` (prefix yeniden yazımı) tek seferlik — tur 3 cache-hit.

**roomsession-crud** — iş turu 275.6K → 274.0K (işin kendisi aynı; kazanç verify'da),
**verify 213.6K → 62.7K (−71%)**: `--exclude-dynamic` + salt-okur küçük prefix ile
haiku doğrulayıcı artık bağlamı çok daha ucuz kuruyor.

## Notlar / dürüst gözlemler

- cacheWrite roomsession/roomchat'te bir miktar YÜKSELDİ (22K→35K, 17K→23K):
  exclude-dynamic geçişi sonrası ilk koşuda prefix'ler yeniden kuruluyor + 1h TTL
  yazımları 2× sayılıyor. Pencereyi tüketen büyüklük (processedTotal) yine de her
  senaryoda düştü; kalıcı kazanç asıl **cacheRead çöküşünde** (449K→286K, 193K→15K).
- Ölçüm sırasında bir kez abonelik oturum limitine takıldık; limit-hata yolu doğru
  çalıştı (iterasyon yakılmadı, `status=error`, recall korundu) — matbaa-vakası
  düzeltmesinin gerçek-dünya doğrulaması.
- Faz 3 hedefleri bu veriden: verify'ın hâlâ ödediği ~60K/tur ve respawn davranışı.
