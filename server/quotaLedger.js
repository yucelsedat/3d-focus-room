// Aşama 1 — Kota ölçümü (SESSION-YOL-HARITASI.md §1.1, §4 Aşama 1).
//
// Abonelik sayacı token türlerini çok farklı tartar: bir çıktı token'ı ~260
// cache-okuma token'ı kadar yer kaplar. `processedTotal` hepsini eşit saydığı için
// "neyi optimize etmeliyiz" sorusunu yanlış cevaplıyordu. Bu modül her turun
// usage'ını tahmini "kota puanına" çevirir: haftalık sayacın yüzdesi cinsinden.
//
// Saf modül (I/O yok) — server.js ve scripts/verify-quota-ledger.mjs kullanır.
//
// ÖNEMLİ — CLI sözleşmesi (claude 2.1.332'de canlı doğrulandı, 2026-11-28):
//   result.usage       → TUR başına (kalıcı stream-json süreçte de her tur ayrı)
//   result.modelUsage  → SÜREÇ boyunca BİRİKİMLİ, model kimliği → sayaçlar
// Bu yüzden kalıcı oturumda model kırılımı önceki snapshot'tan delta alınarak bulunur.

// Haftalık sayacın %1'ini dolduran token sayısı, model ailesi ve token türüne göre.
// Kaynak: Atlas ADE "Plan usage burn data" (Ultra plan, canlı sayaca karşı fit,
// 2026-10-29). ÜÇÜNCÜ TARAF TAHMİN — Anthropic resmi rakam yayınlamıyor.
// haiku ölçülmedi: Sonnet × 3 varsayıldı (API fiyat oranı) → estimated:true.
export const DEFAULT_WEIGHTS = {
  source: 'atlas-ade.dev/docs/plan-usage-burn-data (2026-10-29, Ultra, third-party estimate)',
  unit: 'percent-of-weekly-meter',
  families: {
    opus:   { output: 460_000, input: 2_000_000, cacheWrite: 3_200_000, cacheRead: 120_000_000 },
    sonnet: { output: 760_000, input: 3_400_000, cacheWrite: 5_300_000, cacheRead: 200_000_000 },
    fable:  { output: 180_000, input: 790_000, cacheWrite: 1_200_000, cacheRead: 46_000_000 },
    haiku:  { output: 2_280_000, input: 10_200_000, cacheWrite: 15_900_000, cacheRead: 600_000_000, estimated: true },
  },
  // Model bilinmiyorsa (eski kayıtlar, modelUsage yok): cliModel() varsayılanı Opus.
  defaultFamily: 'opus',
}

// Soğuk tur: turun İLK API isteği prefix'in anlamlı bir kısmını yeniden yazdıysa
// (TTL dolması, respawn, model değişimi, compaction). Turun sonraki istekleri doğal
// olarak yeni araç çıktılarını cache'e yazar — o yüzden tüm tura değil ilk isteğe bakılır.
//
// DÜZELTME (2026-11-28, bench/ASAMA3.md TTL A/B): `usage.iterations` turun SON isteğini
// içerir, ilkini değil (canlı doğrulandı: 2 istekli turda iterations[0] = son istek).
// İlk isteğin usage'ı stream'deki ilk `assistant` olayında gelir; çağıran onu
// `firstUsage` olarak verir. Yoksa tur toplamına bakan yedek kural uygulanır.
//
// Oran kuralı: sistem prompt'u + araçlar süreçler arası paylaşılan önbellekte kalabildiği
// için soğuk bir turda bile okuma yazmaya yakın olabilir (gözlem: 5m kolunda 6 dk sonra
// cw=16.7K, cr=16.5K). Bu yüzden "yazma > okuma" değil, "yazma ≥ bağlamın %25'i".
export const COLD_MIN_WRITE = 2048
export const COLD_RATIO = 0.25

export function modelFamily(model) {
  const m = String(model || '').toLowerCase()
  if (m.includes('fable')) return 'fable'
  if (m.includes('haiku')) return 'haiku'
  if (m.includes('sonnet')) return 'sonnet'
  if (m.includes('opus')) return 'opus'
  return null
}

// result.usage (snake_case) → düz sayaçlar. Eksik alanlar 0.
export function normalizeUsage(u) {
  if (!u) return null
  const cc = u.cache_creation || {}
  return {
    input: u.input_tokens || 0,
    output: u.output_tokens || 0,
    cacheWrite: u.cache_creation_input_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cw1h: cc.ephemeral_1h_input_tokens || 0,
    cw5m: cc.ephemeral_5m_input_tokens || 0,
    thinking: u.output_tokens_details?.thinking_tokens || 0,
  }
}

// result.modelUsage girdisi (camelCase) → düz sayaçlar.
function normalizeModelEntry(v) {
  return {
    input: v.inputTokens || 0,
    output: v.outputTokens || 0,
    cacheWrite: v.cacheCreationInputTokens || 0,
    cacheRead: v.cacheReadInputTokens || 0,
  }
}

// Tek bir token sepetinin kota puanı (haftalık sayacın yüzdesi).
export function pointsFor(t, family, weights = DEFAULT_WEIGHTS) {
  const w = weights.families[family] || weights.families[weights.defaultFamily]
  if (!t || !w) return 0
  // Ağırlıklar "%1 başına token" olduğundan token / ağırlık doğrudan yüzde verir.
  return (
    (t.output || 0) / w.output +
    (t.input || 0) / w.input +
    (t.cacheWrite || 0) / w.cacheWrite +
    (t.cacheRead || 0) / w.cacheRead
  )
}

// Birikimli modelUsage'dan bu turun model başına deltasını çıkar.
// prev: aynı süreçteki bir önceki modelUsage snapshot'ı (yoksa {} → tamamı bu tur).
export function modelUsageDelta(modelUsage, prev = {}) {
  const delta = {}
  for (const [model, v] of Object.entries(modelUsage || {})) {
    const cur = normalizeModelEntry(v)
    const p = prev[model] ? normalizeModelEntry(prev[model]) : { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 }
    const d = {
      input: Math.max(0, cur.input - p.input),
      output: Math.max(0, cur.output - p.output),
      cacheWrite: Math.max(0, cur.cacheWrite - p.cacheWrite),
      cacheRead: Math.max(0, cur.cacheRead - p.cacheRead),
    }
    if (d.input || d.output || d.cacheWrite || d.cacheRead) delta[model] = d
  }
  return delta
}

// firstUsage: turun ilk assistant olayının message.usage'ı (varsa). u: result.usage.
export function isColdTurn(u, firstUsage = null) {
  const src = firstUsage || u
  if (!src) return false
  const cw = src.cache_creation_input_tokens || 0
  const cr = src.cache_read_input_tokens || 0
  const inp = src.input_tokens || 0
  return cw >= COLD_MIN_WRITE && cw >= COLD_RATIO * (cw + cr + inp)
}

// Bir `result` olayından tur muhasebe kaydı üret.
//   ev            : CLI result olayı
//   fallbackModel : modelUsage yoksa kullanılacak model adı (spawn'daki --model)
//   prevModelUsage: aynı süreçte önceki result'ın modelUsage'ı (kalıcı oturum)
//   firstUsage    : turun ilk assistant olayının message.usage'ı (soğuk tur tespiti)
// Dönüş: { usage, points, byFamily, turns, cold, family } — usage null ise null.
export function turnRecord(ev, { fallbackModel = null, prevModelUsage = null, firstUsage = null, weights = DEFAULT_WEIGHTS } = {}) {
  const usage = normalizeUsage(ev?.usage)
  if (!usage) return null
  const byFamily = {}
  const delta = ev.modelUsage ? modelUsageDelta(ev.modelUsage, prevModelUsage || {}) : {}
  if (Object.keys(delta).length) {
    for (const [model, t] of Object.entries(delta)) {
      const fam = modelFamily(model) || weights.defaultFamily
      byFamily[fam] = (byFamily[fam] || 0) + pointsFor(t, fam, weights)
    }
  } else {
    const fam = modelFamily(fallbackModel) || weights.defaultFamily
    byFamily[fam] = pointsFor(usage, fam, weights)
  }
  const points = Object.values(byFamily).reduce((a, b) => a + b, 0)
  // Ana model: en çok puan tüketen aile (log/UI etiketi için).
  const family = Object.entries(byFamily).sort((a, b) => b[1] - a[1])[0]?.[0] || null
  return {
    usage,
    points,
    byFamily,
    turns: Number(ev.num_turns) || 0,
    cold: isColdTurn(ev.usage, firstUsage),
    family,
  }
}

// Kümülatif sayaç nesnesine bir tur kaydı ekle (usage-daily ve recall.usage ortak şekli).
// Eski alanlar (calls/input/cacheWrite/cacheRead/output/processedTotal) aynen korunur.
export function accumulate(t, rec) {
  if (!rec) return t
  const u = rec.usage
  t.calls = (t.calls || 0) + 1
  t.input = (t.input || 0) + u.input
  t.cacheWrite = (t.cacheWrite || 0) + u.cacheWrite
  t.cacheRead = (t.cacheRead || 0) + u.cacheRead
  t.output = (t.output || 0) + u.output
  t.processedTotal = (t.processedTotal || 0) + u.input + u.cacheWrite + u.cacheRead + u.output
  // Aşama 1 alanları
  t.quotaPoints = round6((t.quotaPoints || 0) + rec.points)
  t.cw1h = (t.cw1h || 0) + u.cw1h
  t.cw5m = (t.cw5m || 0) + u.cw5m
  t.thinking = (t.thinking || 0) + u.thinking
  t.turns = (t.turns || 0) + rec.turns
  t.coldTurns = (t.coldTurns || 0) + (rec.cold ? 1 : 0)
  const qf = t.quotaByFamily || (t.quotaByFamily = {})
  for (const [fam, p] of Object.entries(rec.byFamily)) qf[fam] = round6((qf[fam] || 0) + p)
  return t
}

// Aşama 1 öncesi kayıtlar (quotaPoints yok): token toplamından varsayılan aileyle tahmin.
export function estimateLegacyPoints(t, weights = DEFAULT_WEIGHTS) {
  return pointsFor(t, weights.defaultFamily, weights)
}

// Ağırlıkları dosyadan oku (isteğe bağlı override). Bozuk/eksik → varsayılan.
export function loadWeights(readJson) {
  try {
    const j = readJson()
    if (j && j.families && typeof j.families === 'object') {
      return { ...DEFAULT_WEIGHTS, ...j, families: { ...DEFAULT_WEIGHTS.families, ...j.families } }
    }
  } catch {}
  return DEFAULT_WEIGHTS
}

function round6(x) { return Math.round(x * 1e6) / 1e6 }
