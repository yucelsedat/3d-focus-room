// Oda defteri — kağıt, kalem ve tipografi sabitleri + bileşen olmayan yardımcılar.
// (react-refresh kuralı: bileşen dosyaları yalnızca bileşen export etsin.)
import { useEffect, useState } from 'react'

export const LH = 32 // satır aralığı = çizgili kağıt periyodu (px)
export const TEXT_SHIFT = 5 // el yazısının tabanını çizginin hemen üstüne oturtur (yalnızca görsel)
export const INDENT = 30
export const MARGIN_LINE = 44 // çift kırmızı kenar çizgisi: cilt deliklerinin hemen yanında
export const MARGIN_X = 54 // yazı kenar çizgisinin hemen ardından başlar
export const GUTTER_R = 30 // sağ kağıt boşluğu
export const FLAG_IN = 14 // oda ayracının kağıt üstünde kalan kısmı
export const FLAG_OUT = 190 // ayraçların taştığı, kağıt dışındaki şerit

export const HAND = "'Caveat', 'Segoe Print', 'Bradley Hand', cursive"
export const SANS = "'DM Sans', system-ui, sans-serif"
export const SERIF = "'Fraunces', Georgia, serif"
export const MONO = "'JetBrains Mono', ui-monospace, monospace"

export const PAPER = '#f7f2e4'
export const PENCIL = 'rgba(44,44,52,0.9)'
export const PENCIL_SOFT = 'rgba(44,44,52,0.42)'
export const RED_PENCIL = 'rgba(166,56,46,0.82)'
export const RULE = 'rgba(92,128,186,0.30)'
export const MARGIN_RED = 'rgba(214,88,88,0.55)'

// Defter boyutu: dikey ama geniş (en/boy ≈ 0.92). Sol: araç rayı, sağ: ayraç şeridi.
export const BOOK_H = 'min(90vh, 1080px)'
export const BOOK_W = `min(calc(${BOOK_H} * 0.92), calc(100vw - 540px))`

export const TAB_COLORS = ['#f4d35e', '#9fd6c3', '#f4a9bb', '#a9c7ef', '#d8c3f0', '#f6bb8c']
export const FLAG_COLORS = ['#f7d154', '#8fd3bd', '#f59fb4', '#9cc1f2', '#cfb6f2', '#f7b27a', '#b9df7c']

// Oda id'si → sabit ayraç rengi
export function flagColor(roomId) {
  let h = 0
  for (const ch of String(roomId)) h = (h * 31 + ch.charCodeAt(0)) | 0
  return FLAG_COLORS[Math.abs(h) % FLAG_COLORS.length]
}

const svgUri = (svg) => `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`

// Kağıt lifi: çok hafif kahverengi gürültü
export const GRAIN = svgUri(
  "<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'>" +
  "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3' stitchTiles='stitch'/>" +
  "<feColorMatrix values='0 0 0 0 .36  0 0 0 0 .30  0 0 0 0 .20  0 0 0 .10 0'/></filter>" +
  "<rect width='100%' height='100%' filter='url(#n)'/></svg>",
)

// Grafit dokusu: kağıt renginde, alfası gürültülü bir katman. Kağıdın üstünde
// görünmez; kalem izinin üstünde yer yer açık benekler bırakır → kurşun kalem hissi.
export const GRAPHITE = svgUri(
  "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>" +
  "<filter id='g'><feTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='2' stitchTiles='stitch'/>" +
  "<feColorMatrix values='0 0 0 0 .969  0 0 0 0 .949  0 0 0 0 .894  0 0 0 1.4 -.55'/></filter>" +
  "<rect width='100%' height='100%' filter='url(#g)'/></svg>",
)

// Spiral cilt delikleri + çift kırmızı kenar çizgisi + lif + kenar kararması
export const SHEET_BG = [
  'radial-gradient(circle at 22px 16px, rgba(14,14,18,0.88) 0 5.5px, rgba(0,0,0,0.18) 6.5px, transparent 7.5px) 0 0 / 44px 32px repeat-y',
  `linear-gradient(90deg, transparent ${MARGIN_LINE}px, ${MARGIN_RED} ${MARGIN_LINE}px ${MARGIN_LINE + 1.5}px, transparent ${MARGIN_LINE + 1.5}px ${MARGIN_LINE + 4}px, ${MARGIN_RED} ${MARGIN_LINE + 4}px ${MARGIN_LINE + 5}px, transparent ${MARGIN_LINE + 5}px)`,
  `${GRAIN}`,
  'radial-gradient(130% 95% at 55% 38%, transparent 62%, rgba(120,88,40,0.13) 100%)',
  PAPER,
].join(', ')

export const RULED_BG = `repeating-linear-gradient(180deg, transparent 0 ${LH - 1}px, ${RULE} ${LH - 1}px ${LH}px)`

// Textarea ile üstündeki ayna katmanı AYNI metrikleri paylaşmalı — yoksa üstü
// çizme çizgisi kayar. İkisi de bu nesneden türetilir.
export const textMetrics = (heading) => ({
  fontFamily: HAND,
  fontSize: heading ? 42 : 27,
  fontWeight: heading ? 700 : 400,
  lineHeight: `${heading ? LH * 2 : LH}px`,
  letterSpacing: heading ? '0.2px' : '0.3px',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'break-word',
  wordBreak: 'normal',
  padding: 0,
  margin: 0,
  border: 0,
  boxSizing: 'border-box',
  width: '100%',
  fontKerning: 'normal',
})

// Bu CSS tek bir <style> bloğu olarak overlay'e basılır (inline style :hover/@keyframes yapamaz)
export const NOTEBOOK_CSS = `
.nb-root ::selection { background: rgba(244, 211, 94, 0.55); }
.nb-text::placeholder { color: transparent; }
.nb-text:focus::placeholder { color: ${PENCIL_SOFT}; }
.nb-handle { opacity: 0; transition: opacity .15s; }
.nb-row:hover .nb-handle, .nb-row:focus-within .nb-handle, .nb-handle:focus-visible { opacity: .75; }
.nb-row.nb-dragging .nb-handle { opacity: 1; }
.nb-flag { transition: transform .15s ease, filter .15s ease; }
button.nb-flag:hover { transform: translateX(5px); filter: brightness(1.04); }
button.nb-flag:focus-visible { outline: 2px dashed rgba(44,44,52,.7); outline-offset: 2px; }
.nb-filler:hover .nb-filler-hint { opacity: 1; }
.nb-rail button:focus-visible, .nb-tab:focus-visible, .nb-check:focus-visible, .nb-handle:focus-visible {
  outline: 2px dashed rgba(244, 211, 94, 0.9); outline-offset: 2px;
}
.nb-body { scrollbar-width: none; }
.nb-body::-webkit-scrollbar { display: none; }
.nb-draw path { stroke-dasharray: 1; stroke-dashoffset: 1; animation: nb-draw 280ms ease-out forwards; }
@keyframes nb-draw { to { stroke-dashoffset: 0; } }
.nb-strike-anim { animation: nb-strike 380ms ease-out both; }
@keyframes nb-strike { from { background-size: 0% 100%; } to { background-size: 100% 100%; } }
@keyframes nb-in { from { opacity: 0; transform: translateY(14px) rotate(-0.6deg); } to { opacity: 1; transform: none; } }
@keyframes nb-fade { from { opacity: 0; } to { opacity: 1; } }
@keyframes nb-toast { from { opacity: 0; transform: translate(-50%, 10px) rotate(-1.5deg); } to { opacity: 1; transform: translate(-50%, 0) rotate(-1.5deg); } }
.nb-leaf { position: absolute; inset: 0; transform-origin: left center; transform-style: preserve-3d; }
.nb-leaf.fwd { animation: nb-fwd 650ms cubic-bezier(.35,.1,.25,1) forwards; }
.nb-leaf.back { animation: nb-back 650ms cubic-bezier(.35,.1,.25,1) forwards; }
@keyframes nb-fwd { 0% { transform: rotateY(0); } 50% { transform: rotateY(-90deg) skewY(-2.5deg); } 100% { transform: rotateY(-178deg); } }
@keyframes nb-back { 0% { transform: rotateY(-178deg); } 50% { transform: rotateY(-90deg) skewY(-2.5deg); } 100% { transform: rotateY(0); } }
.nb-face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; overflow: hidden; border-radius: 3px 10px 10px 3px; }
.nb-face-back { transform: rotateY(180deg); }
.nb-leaf .nb-face-front::after { content: ''; position: absolute; inset: 0; pointer-events: none;
  background: linear-gradient(90deg, rgba(0,0,0,.22), transparent 45%); opacity: 0; animation: nb-shade 650ms ease-in-out both; }
@keyframes nb-shade { 50% { opacity: 1; } 100% { opacity: 0; } }
.nb-sheet-in { animation: none; }
@media (prefers-reduced-motion: reduce) {
  .nb-leaf { animation: none !important; display: none; }
  .nb-sheet-in { animation: nb-fade 140ms ease-out; }
  .nb-draw path, .nb-strike-anim { animation: none !important; stroke-dashoffset: 0; }
  .nb-book-in { animation: none !important; }
}
`

// Caveat yüklenmeden ölçülen textarea yükseklikleri yanlış çıkar: yüklenince yeniden ölç
let fontsReady = false
const fontsPromise = typeof document !== 'undefined' && document.fonts
  ? Promise.all([
    document.fonts.load(`400 27px ${HAND}`),
    document.fonts.load(`700 42px ${HAND}`),
  ]).catch(() => {}).then(() => { fontsReady = true })
  : Promise.resolve()

export function useFontsReady() {
  const [ready, setReady] = useState(fontsReady)
  useEffect(() => {
    if (ready) return
    let alive = true
    fontsPromise.then(() => { if (alive) setReady(true) })
    return () => { alive = false }
  }, [ready])
  return ready
}

export function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

// localStorage erişimi gizli sekmede / kapalı depolamada fırlatabilir
export function readLS(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
export function writeLS(key, value) {
  try { localStorage.setItem(key, value) } catch { /* yoksay */ }
}
