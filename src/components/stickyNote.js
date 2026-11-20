// Sticky note tile — paylaşılan sabitler ve metin sığdırma (auto-fit) motoru.
// İçerik media.content'te JSON: { text, color }.

export const STICKY_FONT = "'Caveat', 'Segoe Print', 'Bradley Hand', cursive"
export const STICKY_WEIGHT = 600
export const STICKY_LINE_HEIGHT = 1.12
export const STICKY_MAX_CHARS = 1000

export const STICKY_COLORS = [
  { id: 'sari',    hex: '#fde96b', label: 'Sarı' },
  { id: 'turuncu', hex: '#ffc07a', label: 'Turuncu' },
  { id: 'pembe',   hex: '#ffadc6', label: 'Pembe' },
  { id: 'mor',     hex: '#d7b8ff', label: 'Mor' },
  { id: 'mavi',    hex: '#a6d8ff', label: 'Mavi' },
  { id: 'yesil',   hex: '#bdf0a0', label: 'Yeşil' },
  { id: 'nane',    hex: '#9eeedc', label: 'Nane' },
  { id: 'krem',    hex: '#f6f1e3', label: 'Krem' },
]
export const STICKY_DEFAULT_COLOR = STICKY_COLORS[0].hex

const HEX_RE = /^#[0-9a-f]{6}$/i

export function normalizeStickyColor(c) {
  return typeof c === 'string' && HEX_RE.test(c) ? c.toLowerCase() : STICKY_DEFAULT_COLOR
}

export function normalizeStickyText(t) {
  if (typeof t !== 'string') return ''
  return t.replace(/\r\n?/g, '\n').slice(0, STICKY_MAX_CHARS)
}

// Bozuk/eksik JSON'a karşı dayanıklı okuma; bilinmeyen alanlar korunur (ileri uyum).
export function parseStickyContent(content) {
  let raw = {}
  try {
    const p = JSON.parse(content || '{}')
    if (p && typeof p === 'object' && !Array.isArray(p)) raw = p
  } catch { /* bozuk içerik → varsayılanlar */ }
  return { ...raw, text: normalizeStickyText(raw.text), color: normalizeStickyColor(raw.color) }
}

// Renk koyuysa açık mürekkep, açıksa koyu mürekkep (özel hex gelirse de okunur kalsın).
export function stickyInk(hex) {
  const n = parseInt(normalizeStickyColor(hex).slice(1), 16)
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin(n >> 16 & 255) + 0.7152 * lin(n >> 8 & 255) + 0.0722 * lin(n & 255)
  return L > 0.36 ? '#2d2a26' : '#fbf8f2'
}

// ── auto-fit ────────────────────────────────────────────────────────────────
// Gerçek DOM satır kırma algoritmasıyla ölçer (canvas measureText kelime kaydırmayı
// bilmez). Tüm notlar tek gizli ölçüm elemanını paylaşır; drei Html transform'unun
// dışında, body'de durur → ölçek/rotasyon ölçümü bozmaz.
let measurer = null
function getMeasurer() {
  if (measurer?.isConnected) return measurer
  measurer = document.createElement('div')
  measurer.setAttribute('aria-hidden', 'true')
  Object.assign(measurer.style, {
    position: 'fixed', left: '-100000px', top: '0', visibility: 'hidden', pointerEvents: 'none',
    whiteSpace: 'pre-wrap', fontFamily: STICKY_FONT, fontWeight: String(STICKY_WEIGHT),
    lineHeight: String(STICKY_LINE_HEIGHT), textAlign: 'center', padding: '0', margin: '0',
    border: '0', boxSizing: 'content-box', letterSpacing: '0',
  })
  document.body.appendChild(measurer)
  return measurer
}

// Sondaki '\n' div'de yeni satır açmaz ama textarea'da açar → ölçüm textarea ile aynı olsun.
const measurable = text => (text === '' ? ' ' : text.endsWith('\n') ? text + '​' : text)

function largestFit(el, lo, hi, maxW, maxH) {
  const fits = s => {
    el.style.fontSize = `${s}px`
    return el.scrollHeight <= maxH + 0.5 && el.scrollWidth <= maxW + 0.5
  }
  if (!fits(lo)) return null
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (fits(mid)) lo = mid; else hi = mid - 1
  }
  return lo
}

/**
 * Metni kutuya sığan en büyük punto ile yerleştirir; satır sayısı bu puntoda kendiliğinden çıkar.
 * Önce kelimeleri bölmeden dener; tek uzun kelime/URL puntoyu çok küçültüyorsa kelime içinden böler.
 * En küçük puntoda bile sığmıyorsa overflow=true (kırpılır + kaydırılır).
 * @returns {{ fontSize:number, lines:number, breakWords:boolean, overflow:boolean, contentH:number }}
 */
export function fitStickyText(text, maxW, maxH, minSize, maxSize) {
  minSize = Math.max(1, Math.floor(minSize))
  maxSize = Math.max(minSize, Math.floor(maxSize))
  if (typeof document === 'undefined' || maxW <= 0 || maxH <= 0) {
    return { fontSize: minSize, lines: 1, breakWords: false, overflow: false, contentH: minSize * STICKY_LINE_HEIGHT }
  }
  const el = getMeasurer()
  el.style.width = `${maxW}px`
  el.textContent = measurable(text)

  el.style.overflowWrap = 'normal'; el.style.wordBreak = 'normal'
  const whole = largestFit(el, minSize, maxSize, maxW, maxH)
  el.style.overflowWrap = 'anywhere'; el.style.wordBreak = 'normal'
  const broken = largestFit(el, minSize, maxSize, maxW, maxH)

  // Kelime bütünlüğü tercih edilir; ama bölmek puntoyu belirgin büyütüyorsa böl.
  const breakWords = whole === null || (broken !== null && whole < broken * 0.6)
  const overflow = !breakWords ? false : broken === null
  const fontSize = breakWords ? (broken ?? minSize) : whole

  el.style.overflowWrap = breakWords ? 'anywhere' : 'normal'
  el.style.fontSize = `${fontSize}px`
  const contentH = el.scrollHeight
  const lines = text === '' ? 0 : Math.max(1, Math.round(contentH / (fontSize * STICKY_LINE_HEIGHT)))
  return { fontSize, lines, breakWords, overflow, contentH }
}
