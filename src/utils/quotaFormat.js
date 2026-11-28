// Aşama 8 — kota/bağlam biçimlendirme yardımcıları (QuotaLine ve session tile'ları).

// 0.0056 → "0,0056" · 0.0129 → "0,013" · 1.234 → "1,23"
export function fmtQuota(x) {
  if (!Number.isFinite(x) || x <= 0) return '0'
  const s = x >= 1 ? x.toFixed(2) : String(Number(x.toPrecision(2)))
  return s.replace('.', ',')
}

// result olayındaki modelUsage'dan gerçek bağlam penceresi (Opus/Sonnet 5.5: 1M).
export function contextWindowOf(ev, fallback = 200000) {
  for (const v of Object.values(ev?.modelUsage || {})) {
    if (v && Number(v.contextWindow) > 0) return Number(v.contextWindow)
  }
  return fallback
}

export function fmtTokens(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}
