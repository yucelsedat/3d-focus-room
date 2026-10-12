import { Marked } from 'marked'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark-dimmed.css'
import DOMPurify from 'dompurify'

// ── Zengin metin (Markdown) render'ı ─────────────────────────────────────────
// Canvas metin kutusu ile metin (markdown) tile'ın ortak render yolu: aynı marked
// örneği (hljs'li kod blokları), aynı DOMPurify süzgeci, aynı .cvmd stilleri.
// Ayrı Marked örneği — session/defter balonlarındaki global `marked`'ı etkilemez.
const richMarked = new Marked({
  renderer: {
    code({ text, lang }) {
      const language = lang && hljs.getLanguage(lang) ? lang : null
      const highlighted = language
        ? hljs.highlight(text, { language }).value
        : hljs.highlightAuto(text).value
      const detectedLang = language || 'code'
      return `<div class="cvmd-code-block"><span class="cvmd-code-lang">${detectedLang}</span><pre><code class="hljs language-${detectedLang}">${highlighted}</code></pre></div>`
    }
  }
})

// newTabLinks: linkler tıklanabilir olan yüzeylerde (metin tile) yeni sekmede açılır
export const parseMd = (content, { newTabLinks = false } = {}) => {
  const html = richMarked.parse(content || '')
  if (!newTabLinks) return DOMPurify.sanitize(html)
  return DOMPurify.sanitize(
    html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" '),
    { ADD_ATTR: ['target'] },
  )
}

// ── Metin tile kolon düzeni ──────────────────────────────────────────────────
// Tile sabit yükseklikte, içerik kolonlara akar. Kolon aralığı = sol+sağ iç boşluk
// olduğundan kolon sayısı kaç olursa olsun her kolon aynı genişlikte kalır
// (MD_COL_PX_W − MD_COL_GAP) ve ölçüm sondası tile ile birebir aynı düzeni kurar.
export const MD_PX_PER_UNIT = 200
export const MD_COL_PX_W    = 600
const MD_COL_PAD     = 24
const MD_COL_GAP     = MD_COL_PAD * 2

// Inject markdown styles once (HMR'da mevcut etiketi günceller)
if (typeof document !== 'undefined') {
  const s = document.getElementById('cvmd-styles') || document.createElement('style')
  s.id = 'cvmd-styles'
  s.textContent = `
    .cvmd { line-height: 1.5; }
    .cvmd > *:first-child { margin-top: 0 !important; }
    .cvmd > *:last-child  { margin-bottom: 0 !important; }
    .cvmd h1 { font-size: 1.75em; font-weight: 800; margin: 0 0 0.3em; }
    .cvmd h2 { font-size: 1.4em;  font-weight: 700; margin: 0.6em 0 0.25em; }
    .cvmd h3 { font-size: 1.15em; font-weight: 600; margin: 0.5em 0 0.2em; }
    .cvmd p  { margin: 0 0 0.55em; }
    .cvmd ul, .cvmd ol { margin: 0 0 0.55em; padding-left: 1.5em; }
    .cvmd li { margin-bottom: 0.2em; }
    .cvmd code { background: rgba(255,255,255,0.1); padding: 0.1em 0.38em; border-radius: 4px; font-family: 'Fira Code', 'Cascadia Code', monospace; font-size: 0.85em; }
    .cvmd blockquote { border-left: 3px solid rgba(255,255,255,0.25); padding-left: 0.75em; margin: 0 0 0.55em 0; opacity: 0.8; }
    .cvmd a  { color: #60a5fa; text-decoration: underline; }
    .cvmd hr { border: none; border-top: 1px solid rgba(255,255,255,0.18); margin: 0.6em 0; }
    .cvmd strong { font-weight: 700; }
    .cvmd em     { font-style: italic; }
    .cvmd table  { border-collapse: collapse; margin-bottom: 0.55em; width: 100%; }
    .cvmd th, .cvmd td { border: 1px solid rgba(255,255,255,0.18); padding: 0.25em 0.55em; }
    .cvmd th { background: rgba(255,255,255,0.08); font-weight: 600; }

    /* code block wrapper */
    .cvmd-code-block { position: relative; margin: 0 0 0.6em; border-radius: 8px; overflow: hidden; background: #1c2128; }
    .cvmd-code-lang {
      display: inline-block; position: absolute; top: 0; right: 0;
      padding: 0.18em 0.7em; font-size: 0.72em; font-family: monospace;
      background: rgba(255,255,255,0.07); color: rgba(148,163,184,0.7);
      border-bottom-left-radius: 6px; letter-spacing: 0.05em; text-transform: lowercase;
      pointer-events: none;
    }
    .cvmd-code-block pre { margin: 0; padding: 0.9em 1em 0.8em; overflow-x: auto; background: transparent !important; border-radius: 0; }
    .cvmd-code-block pre code.hljs { padding: 0; font-size: 0.88em; font-family: 'Fira Code', 'Cascadia Code', 'JetBrains Mono', Menlo, monospace; line-height: 1.55; background: transparent !important; }
    .cvmd pre code { font-family: 'Fira Code', 'Cascadia Code', monospace; }

    /* açık zemin (metin tile): beyaz-alfa tonlar görünmez kalır → koyu-alfa karşılıkları */
    .cvmd-light code { background: rgba(15,23,42,0.07); }
    .cvmd-light blockquote { border-left-color: rgba(15,23,42,0.28); }
    .cvmd-light a  { color: #1d4ed8; }
    .cvmd-light hr { border-top-color: rgba(15,23,42,0.2); }
    .cvmd-light th, .cvmd-light td { border-color: rgba(15,23,42,0.22); }
    .cvmd-light th { background: rgba(15,23,42,0.06); }

    /* metin tile: kolonlu akış. Her içerik kendi kolonunda kalır — kırılamayan içerik
       (uzun URL/kelime, kod satırı, geniş tablo, görsel) taşmak yerine alt satıra sarar. */
    .mdtile {
      box-sizing: border-box; padding: 44px ${MD_COL_PAD}px ${MD_COL_PAD}px; border: 2px solid transparent;
      font-family: system-ui, sans-serif; font-size: 16px; line-height: 1.6; color: #1a1a1a;
      column-gap: ${MD_COL_GAP}px; column-fill: auto;
      overflow-wrap: anywhere;
    }
    .mdtile .cvmd-code-block pre,
    .mdtile pre code.hljs,
    .mdtile pre, .mdtile pre code { white-space: pre-wrap; overflow: visible; }
    .mdtile table { table-layout: fixed; }
    .mdtile img, .mdtile video { max-width: 100%; height: auto; }
    .mdtile h1, .mdtile h2, .mdtile h3, .mdtile h4 { break-after: avoid; }
    .mdtile tr, .mdtile img { break-inside: avoid; }
  `
  if (!s.isConnected) document.head.appendChild(s)
}

// İçeriğin, pxHeight yüksekliğinde MD_COL_PX_W'lik kolonlardan kaç tanesine sığdığını
// tile ile aynı düzeni kuran gizli bir sondada ölçer.
export function measureMdCols(content, pxHeight) {
  const probe = document.createElement('div')
  probe.className = 'mdtile cvmd cvmd-light'
  probe.style.cssText = `position:fixed;left:-99999px;top:0;visibility:hidden;pointer-events:none;overflow:hidden;width:${MD_COL_PX_W}px;height:${pxHeight}px;column-count:1`
  probe.innerHTML = parseMd(content)
  document.body.appendChild(probe)
  // taşan her kolon scrollWidth'e bir kolon + aralık (= MD_COL_PX_W) ekler
  const n = Math.ceil((probe.scrollWidth - 1) / MD_COL_PX_W)
  probe.remove()
  return Math.max(1, n)
}

// İçeriğin tamamını gösteren tile genişliği (3D birim) — yükseklik sabit, kolon kolon genişler
export const mdTileWidth = (content, height) =>
  measureMdCols(content, Math.round(height * MD_PX_PER_UNIT)) * MD_COL_PX_W / MD_PX_PER_UNIT

// Düzenleme yüzeyi (ham metin): tile'ın kolonlarına sığmıyorsa kırpılmak ya da kolonları
// daraltmak yerine sağa doğru tam genişlikte kolon ekler. Kullanılan kolon sayısını döner.
export function fitMdCols(el, minCols) {
  if (!el) return minCols
  const apply = (n) => { el.style.columnCount = n; el.style.width = `${n * MD_COL_PX_W}px` }
  apply(minCols)
  let n = Math.max(minCols, Math.ceil((el.scrollWidth - 1) / MD_COL_PX_W))
  apply(n)
  // kenarlık payı kolonları ~1px daraltır → sınırda bir kolon daha gerekebilir
  for (let i = 0; i < 3 && el.scrollWidth > el.clientWidth + 1; i++) apply(++n)
  return n
}
