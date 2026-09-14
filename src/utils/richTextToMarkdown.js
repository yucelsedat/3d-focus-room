import TurndownService from 'turndown'

// ── Rich text (panodaki text/html) → Markdown ────────────────────────────────
// Web sayfası, Google Docs, Word/LibreOffice, Notion vb. yerlerden kopyalanan biçimli
// metni canvas metin kutusu, defter ve markdown tile'ın anladığı GFM Markdown'a çevirir.
// Tarayıcıya özel (DOMParser) — yalnızca paste handler'larından çağrılır.
//
// Akış: HTML'i ayrıştır → kaynak uygulamaya özgü kalıpları normalize et (Docs span
// stilleri, Word liste paragrafları, iç içe liste yapısı, <p> içindeki <li>…) → biçim
// taşıyor mu bak (taşımıyorsa düz metin yolu korunur) → turndown + özel kurallar.

const SEMANTIC_SELECTOR = 'h1,h2,h3,h4,h5,h6,strong,b,em,i,s,del,strike,ul,ol,li,a[href],table,pre,code,blockquote,hr,img[src],input[type="checkbox"]'
// kod editörü tespitinde "gerçek" biçim sayılanlar (pre/code hariç — editörler bunları kullanmaz ama bazıları kullanabilir)
const PROSE_SELECTOR = 'h1,h2,h3,h4,h5,h6,strong,b,em,i,ul,ol,li,a[href],table,blockquote,hr,img[src]'
const MONO_FONT = /(^|[\s,'"])(courier|consolas|monaco|menlo|monospace|source code|fira code|jetbrains mono|roboto mono|sf mono|cascadia|lucida console)/i

const isSafeUrl = (url) => /^(https?:|mailto:)/i.test((url || '').trim())

const unwrap = (el) => {
  const parent = el.parentNode
  if (!parent) return
  while (el.firstChild) parent.insertBefore(el.firstChild, el)
  parent.removeChild(el)
}

const wrapChildren = (el, tagName) => {
  const doc = el.ownerDocument
  const wrapper = doc.createElement(tagName)
  while (el.firstChild) wrapper.appendChild(el.firstChild)
  el.appendChild(wrapper)
}

// Kod dilini sınıf / data özniteliklerinden bul: language-js, lang-py, highlight-source-ts, data-language
const detectLang = (...els) => {
  for (const el of els) {
    if (!el?.getAttribute) continue
    const data = el.getAttribute('data-language') || el.getAttribute('data-lang')
    if (data) return data.trim().toLowerCase()
    const m = (el.getAttribute('class') || '').match(/(?:^|\s)(?:language|lang|highlight-source|brush:?)-?([a-z0-9+#_-]+)/i)
    if (m && !/^(none|plaintext|text)$/i.test(m[1])) return m[1].toLowerCase()
  }
  return ''
}

// ── Normalizasyon ──────────────────────────────────────────────────────────

// Word / LibreOffice: listeler <ul> değil, mso-list stilli paragraflar. Ardışık liste
// paragraflarını seviyelerine göre gerçek (iç içe) <ul>/<ol> yapısına çevir.
function normalizeWordLists(root) {
  const doc = root.ownerDocument
  const listIdOf = (el) => (el?.nodeType === 1 && (el.getAttribute('style') || '').match(/mso-list:\s*(l\d+)\s+level\d+/i)?.[1]) || null
  const isListPara = (el) => !!listIdOf(el)
  const paras = [...root.querySelectorAll('p')].filter(isListPara)
  const handled = new Set()
  for (const first of paras) {
    if (handled.has(first)) continue
    // aynı ebeveyn altında ardışık liste paragraflarını topla (arada boş metin düğümleri olabilir)
    const group = []
    const listId = listIdOf(first)
    let node = first
    while (node) {
      if (node.nodeType === 3 && !node.textContent.trim()) { node = node.nextSibling; continue }
      if (listIdOf(node) !== listId) break   // farklı Word listesi (l0 → l1) ayrı liste olur
      group.push(node); handled.add(node); node = node.nextSibling
    }
    const stack = []   // [{ level, list }]
    for (const p of group) {
      const level = Number((p.getAttribute('style').match(/level(\d+)/i) || [])[1] || 1)
      const marker = p.querySelector('[style*="mso-list:Ignore"], [style*="mso-list: Ignore"]')
      const ordered = marker ? /^\s*[\w]{1,4}[.)]\s*$/.test(marker.textContent.replace(/\u00a0/g, ' ')) && !/^[·•o§▪\-–]$/.test(marker.textContent.trim()) : false
      marker?.remove()
      while (stack.length && stack[stack.length - 1].level > level) stack.pop()
      let cur = stack[stack.length - 1]
      if (!cur || cur.level < level) {
        const list = doc.createElement(ordered ? 'ol' : 'ul')
        if (cur) {
          const lastLi = cur.list.lastElementChild
          ;(lastLi || cur.list).appendChild(list)
        } else {
          first.parentNode.insertBefore(list, first)
        }
        cur = { level, list }
        stack.push(cur)
      }
      const li = doc.createElement('li')
      while (p.firstChild) li.appendChild(p.firstChild)
      cur.list.appendChild(li)
      p.remove()
    }
  }
}

// Google Docs: biçim etiket değil inline stil ile gelir; tüm seçim font-weight:normal bir <b> ile sarılır.
function normalizeInlineStyles(root) {
  for (const b of root.querySelectorAll('b[id^="docs-internal-guid"]')) unwrap(b)
  for (const el of root.querySelectorAll('b, strong')) {
    if (/font-weight:\s*(normal|[1-4]00)\b/i.test(el.getAttribute('style') || '')) unwrap(el)
  }
  for (const span of root.querySelectorAll('span')) {
    const st = (span.getAttribute('style') || '').toLowerCase()
    if (!st || span.closest('pre, code')) continue
    const wm = st.match(/font-weight:\s*(bold|bolder|\d{3})/)
    const bold = wm && (wm[1] === 'bold' || wm[1] === 'bolder' || Number(wm[1]) >= 600)
    const italic = /font-style:\s*italic/.test(st)
    const strike = /text-decoration[^;]*line-through/.test(st)
    const ffm = st.match(/font-family:\s*([^;]+)/)
    const mono = ffm && MONO_FONT.test(ffm[1]) && span.textContent.trim()
    // içten dışa sar: `**~~*x*~~**`
    if (mono) wrapChildren(span, 'code')
    if (italic) wrapChildren(span, 'em')
    if (strike) wrapChildren(span, 's')
    if (bold && !span.closest('h1,h2,h3,h4,h5,h6,th,b,strong')) wrapChildren(span, 'strong')
  }
}

function normalizeStructure(root) {
  const doc = root.ownerDocument

  // Gürültü: script/stil, formlar, SVG ikonlar, gizli öğeler, bizim canvas kod-bloğu dil etiketi
  root.querySelectorAll('script, style, noscript, template, meta, link, title, head, iframe, object, embed, svg, canvas, button, select, textarea, [hidden], [aria-hidden="true"], .cvmd-code-lang').forEach(el => el.remove())
  root.querySelectorAll('[style]').forEach(el => { if (/display:\s*none|visibility:\s*hidden/i.test(el.getAttribute('style'))) el.remove() })
  root.querySelectorAll('input:not([type="checkbox"])').forEach(el => el.remove())

  // Görseller: yalnızca http(s) — data:/file:/blob: (Word, yapıştırılmış yerel görseller) ve 1px izleme pikselleri atılır
  root.querySelectorAll('img').forEach(img => {
    const src = img.getAttribute('src') || ''
    const tiny = Number(img.getAttribute('width')) === 1 || Number(img.getAttribute('height')) === 1
    if (!/^https?:/i.test(src) || tiny) img.remove()
  })

  // Linkler: güvenli olmayan / sayfa içi (#başlık) linkler metne indirgenir; boş linkler (ikon anchor'ları) silinir
  root.querySelectorAll('a').forEach(a => {
    if (!a.textContent.trim() && !a.querySelector('img')) { a.remove(); return }
    if (!isSafeUrl(a.getAttribute('href'))) unwrap(a)
  })

  // <pre> içindeki <br> → gerçek satır sonu (textContent'te kaybolmasın)
  root.querySelectorAll('pre br').forEach(br => br.replaceWith(doc.createTextNode('\n')))
  // GitHub / highlight.js: <pre> içindeki satır <div>'leri → satır sonu
  root.querySelectorAll('pre div').forEach(div => { div.append(doc.createTextNode('\n')); unwrap(div) })

  // Geçersiz iç içe liste: <ul><li/><ul/></ul> (Google Docs) → alt listeyi önceki <li>'ye taşı
  root.querySelectorAll('ul > ul, ul > ol, ol > ul, ol > ol').forEach(sub => {
    let prev = sub.previousElementSibling
    while (prev && prev.nodeName !== 'LI') prev = prev.previousElementSibling
    if (prev) prev.appendChild(sub)
    else { const li = doc.createElement('li'); sub.parentNode.insertBefore(li, sub); li.appendChild(sub) }
  })

  // Başlık içindeki kalın → gereksiz `## **x**` üretmesin
  root.querySelectorAll('h1 b, h1 strong, h2 b, h2 strong, h3 b, h3 strong, h4 b, h4 strong, h5 b, h5 strong, h6 b, h6 strong').forEach(unwrap)

  // <li><p>…</p></li> → sıkı liste (her maddenin arasına boş satır girmesin)
  root.querySelectorAll('li').forEach(li => {
    const ps = [...li.children].filter(c => c.nodeName === 'P')
    ps.forEach((p, i) => { if (i < ps.length - 1) p.append(doc.createElement('br')); unwrap(p) })
  })

  // Tablo hücrelerindeki paragraf / div'ler → satır içi (<br> ile)
  root.querySelectorAll('td, th').forEach(cell => {
    ;[...cell.querySelectorAll('p, div')].forEach(b => { if (b.nextSibling) b.append(doc.createElement('br')); unwrap(b) })
  })
}

// Biçim taşıyor mu? Taşımıyorsa (ör. düz metin editörü, VS Code renkli span'leri) düz metin yolu kullanılır.
function hasFormatting(root) {
  for (const el of root.querySelectorAll(SEMANTIC_SELECTOR)) {
    if (el.nodeName === 'LI' || el.nodeName === 'UL' || el.nodeName === 'OL') return true
    if (el.nodeName === 'A' || el.nodeName === 'IMG' || el.nodeName === 'HR' || el.nodeName === 'TABLE' || el.nodeName === 'INPUT') return true
    if (el.textContent.trim()) return true
  }
  return false
}

// Kod editörleri (VS Code, JetBrains…) seçimi white-space:pre + monospace kutu içinde renkli span'lerle verir.
function looksLikeCodeEditor(root) {
  if (root.querySelector(PROSE_SELECTOR)) return false
  const box = [...root.querySelectorAll('div, span')].find(el => (el.getAttribute('style') || '').length)
  const st = (box?.getAttribute('style') || '').toLowerCase()
  return /white-space:\s*pre/.test(st) && MONO_FONT.test(st)
}

const fenceFor = (code) => {
  const longest = Math.max(2, ...(code.match(/`{3,}/g) || []).map(s => s.length))
  return '`'.repeat(longest + 1)
}

const cellText = (md) => md.trim().replace(/[ \t]*\n+[ \t]*/g, '<br>').replace(/\|/g, '\\|')

// ── Turndown servisi ───────────────────────────────────────────────────────
let service = null
function getService() {
  if (service) return service
  const td = new TurndownService({
    headingStyle: 'atx', hr: '---', bulletListMarker: '-', codeBlockStyle: 'fenced',
    fence: '```', emDelimiter: '*', strongDelimiter: '**', linkStyle: 'inlined',
  })

  // Liste maddesi: turndown varsayılanı "-   " (3 boşluk) yerine "- " / "1. "; alt içerik işaret genişliği kadar girintilenir
  td.addRule('listItem', {
    filter: 'li',
    replacement: (content, node, options) => {
      const parent = node.parentNode
      let prefix = `${options.bulletListMarker} `
      if (parent?.nodeName === 'OL') {
        const start = Number(parent.getAttribute('start')) || 1
        prefix = `${start + [...parent.children].indexOf(node)}. `
      }
      const body = content
        .replace(/^\n+/, '').replace(/\n+$/, '\n')
        .replace(/^\[( |x)\]\s+/, '[$1] ')          // görev kutusu sonrası çift boşluk
        .replace(/\n/gm, `\n${' '.repeat(prefix.length)}`)
      return prefix + body + (node.nextSibling && !/\n$/.test(body) ? '\n' : '')
    },
  })

  td.addRule('strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: (content) => (content.trim() ? `~~${content}~~` : content),
  })

  // Alt çizgi / vurgulama → Markdown karşılığı yok, sadece metin
  td.addRule('plainInline', { filter: ['u', 'ins', 'mark', 'small', 'font'], replacement: (content) => content })

  td.addRule('taskCheckbox', {
    filter: (node) => node.nodeName === 'INPUT' && node.getAttribute('type') === 'checkbox',
    replacement: (_, node) => (node.hasAttribute('checked') ? '[x] ' : '[ ] '),
  })

  // Tüm <pre> blokları (içinde <code> olsun olmasın) → dil etiketli çitli kod bloğu
  td.addRule('fencedPre', {
    filter: 'pre',
    replacement: (_, node) => {
      const code = node.querySelector('code')
      const lang = detectLang(code, node, node.parentNode, node.parentNode?.parentNode)
      const text = (node.textContent || '').replace(/\u00a0/g, ' ').replace(/\n+$/, '')
      const fence = fenceFor(text)
      return `\n\n${fence}${lang}\n${text}\n${fence}\n\n`
    },
  })

  // GFM tablo: thead yoksa ilk satır başlık olur; colspan boş hücreyle doldurulur.
  // Tek satır/tek sütunlu "yerleşim tabloları" (e-posta, eski siteler) tablo olarak değil içerik olarak çıkar.
  td.addRule('table', {
    filter: 'table',
    replacement: (content, node) => {
      const rows = [...node.rows].filter(r => r.closest('table') === node)
      const cols = Math.max(0, ...rows.map(r => [...r.cells].reduce((n, c) => n + (Number(c.colSpan) || 1), 0)))
      if (rows.length < 2 || cols < 2 || node.querySelector('table')) return `\n\n${content}\n\n`
      const grid = rows.map(r => {
        const out = []
        for (const c of r.cells) {
          out.push(cellText(td.turndown(c.innerHTML)))
          for (let k = 1; k < (Number(c.colSpan) || 1); k++) out.push('')
        }
        while (out.length < cols) out.push('')
        return out
      })
      const line = (cells) => `| ${cells.join(' | ')} |`
      const align = [...rows[0].cells].flatMap(c => {
        const a = (c.getAttribute('align') || c.style?.textAlign || '').toLowerCase()
        const s = a === 'center' ? ':---:' : a === 'right' ? '---:' : '---'
        return Array(Number(c.colSpan) || 1).fill(s)
      })
      while (align.length < cols) align.push('---')
      // başlık satırı zaten kalın render edilir → tamamı **…** olan başlık hücresini sadeleştir
      const [head, ...body] = grid
      for (let k = 0; k < head.length; k++) head[k] = head[k].replace(/^\*\*(.+)\*\*$/, '$1')
      return `\n\n${[line(head), line(align), ...body.map(line)].join('\n')}\n\n`
    },
  })
  // tablo alt öğeleri tablo kuralında işlenir; tek başına gelirlerse içerikleri geçsin
  td.addRule('tableParts', { filter: ['thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col'], replacement: (content) => content })

  service = td
  return td
}

// ── Genel API ──────────────────────────────────────────────────────────────

// Kaynağın adresini panoya koymadığı linkler: görünür metni olan ama href'i olmayan <a>.
// Ör. ChatGPT'de metni seçip kopyalayınca bazı linkler JS ile açıldığından href'siz gelir.
// name/id taşıyan eski tip sayfa-içi çapalar (<a name="x">) link sayılmaz.
const countLinksWithoutUrl = (root) => [...root.querySelectorAll('a')].filter(a =>
  !(a.getAttribute('href') || '').trim() && !a.hasAttribute('name') && !a.hasAttribute('id') && a.textContent.trim()).length

// HTML → { md, missingLinks }. Biçim yoksa md null (çağıran düz metni kullanır).
function convertHtml(html, plain) {
  if (!html || typeof DOMParser === 'undefined') return { md: null, missingLinks: 0 }
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const root = doc.body
  if (!root) return { md: null, missingLinks: 0 }
  const missingLinks = countLinksWithoutUrl(root)
  return { md: htmlBodyToMarkdown(root, plain), missingLinks }
}

// HTML → Markdown. Biçim yoksa null döner (çağıran düz metni kullanır).
// plain: aynı kopyalamanın text/plain hali — kod editörü seçimlerinde satırları birebir korumak için.
export function htmlToMarkdown(html, plain = '') {
  return convertHtml(html, plain).md
}

function htmlBodyToMarkdown(root, plain) {
  if (looksLikeCodeEditor(root)) {
    // editör HTML'inde satırlar <div>'lerdir (textContent satır sonlarını kaybeder) → text/plain kullan
    const text = (plain || root.textContent || '').replace(/\u00a0/g, ' ').replace(/\r\n?/g, '\n').replace(/\n+$/, '')
    if (!text.trim()) return null
    const fence = fenceFor(text)
    return `${fence}\n${text}\n${fence}`
  }

  normalizeStructure(root)
  normalizeWordLists(root)
  normalizeInlineStyles(root)
  if (!hasFormatting(root)) return null

  let md = getService().turndown(root.innerHTML)
  md = md
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+$/gm, (m) => (m === '  ' ? m : ''))   // satır sonu tam "  " (turndown <br>) korunur, diğer boşluklar atılır
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return md || null
}

// Tek başına bir URL mi? (link kartı / YouTube vb. mevcut akışlar bozulmasın)
const isBareUrl = (text) => /^\s*https?:\/\/\S+\s*$/i.test(text || '')

// Panodan Markdown üret. { text, rich, missingLinks } döner: rich=false → düz metin (dönüşüm yapılmadı);
// missingLinks → adresi kaynakta olmadığı için düz metin kalan link sayısı (uyarı göstermek için).
// Ctrl+Shift+V (tarayıcıların "biçimsiz yapıştır"ı) text/html göndermediği için daima düz kalır.
export function clipboardToMarkdown(clipboardData) {
  const plain = clipboardData?.getData('text/plain') || ''
  const html = clipboardData?.getData('text/html') || ''
  if (!html || isBareUrl(plain)) return { text: plain, rich: false, missingLinks: 0 }
  try {
    const { md, missingLinks } = convertHtml(html, plain)
    if (md && md.trim()) return { text: md, rich: true, missingLinks }
  } catch (err) {
    console.warn('[richTextToMarkdown] dönüştürme başarısız, düz metne düşülüyor:', err)
  }
  return { text: plain, rich: false, missingLinks: 0 }
}

export const missingLinksMessage = (n) => `⚠ ${n} linkin adresi kaynakta yok, düz metin olarak eklendi`

// Yapıştırılan alanın hemen üstünde (yer yoksa altında) birkaç saniyelik bildirim.
// Body'ye fixed eklenir → 3D Html transform içindeki alanlarda ve modallarda da aynı görünür.
export function showPasteNotice(message, anchor) {
  if (typeof document === 'undefined') return
  const el = document.createElement('div')
  el.setAttribute('role', 'status')
  el.textContent = message
  el.title = "ChatGPT gibi uygulamalarda metni seçmek yerine mesajın kopyala butonunu kullanınca linkler adresleriyle gelir"
  Object.assign(el.style, {
    position: 'fixed', zIndex: '2147483647', left: '0', top: '0', maxWidth: 'min(460px, calc(100vw - 16px))',
    padding: '9px 14px', borderRadius: '10px', boxSizing: 'border-box',
    background: 'rgba(28, 22, 6, 0.96)', border: '1px solid rgba(251, 191, 36, 0.55)', color: '#fcd34d',
    font: "800 14px/1.35 system-ui, sans-serif", boxShadow: '0 10px 28px rgba(0,0,0,0.5)',
    pointerEvents: 'none', opacity: '0', transform: 'translateY(4px)', transition: 'opacity 180ms, transform 180ms',
  })
  document.body.appendChild(el)
  const r = anchor?.getBoundingClientRect?.()
  const w = el.offsetWidth, h = el.offsetHeight, gap = 8
  let left = r ? r.left : (window.innerWidth - w) / 2
  let top = r ? r.top - h - gap : window.innerHeight - h - 24
  if (r && top < gap) top = Math.min(r.bottom + gap, window.innerHeight - h - gap)   // üstte yer yoksa alta
  left = Math.min(Math.max(gap, left), window.innerWidth - w - gap)
  top = Math.min(Math.max(gap, top), window.innerHeight - h - gap)
  el.style.left = `${left}px`; el.style.top = `${top}px`
  requestAnimationFrame(() => { el.style.opacity = '1'; el.style.transform = 'none' })
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 220) }, 5000)
}

// Blok içerik (başlık, liste, tablo, kod…) satır ortasına eklenirse Markdown bozulur →
// imleç satır başında değilse önce, sonrası satır sonu değilse sonra boş satır ekle.
const isBlockMarkdown = (md) => md.includes('\n') || /^(#{1,6}\s|[-*+]\s|\d+[.)]\s|>|```|\|)/.test(md)
export function padForInsertion(md, before, after) {
  if (!isBlockMarkdown(md)) return md
  const pre = !before || /\n\n$/.test(before) ? '' : /\n$/.test(before) ? '\n' : '\n\n'
  const post = !after || /^\n\n/.test(after) ? '' : /^\n/.test(after) ? '\n' : '\n\n'
  return pre + md + post
}

// textarea / input'a imleç konumuna metin ekle. execCommand geri al (Ctrl+Z) geçmişini korur ve
// native input olayı üretir (React onChange / onInput tetiklenir); desteklenmezse setRangeText'e düşer.
export function insertIntoTextField(el, text) {
  if (!el) return
  el.focus()
  const { selectionStart: s = el.value.length, selectionEnd: e = el.value.length } = el
  const padded = padForInsertion(text, el.value.slice(0, s), el.value.slice(e))
  let ok = false
  try { ok = document.execCommand('insertText', false, padded) } catch { ok = false }
  if (!ok) {
    el.setRangeText(padded, s, e, 'end')
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

// textarea onPaste için hazır handler: rich text ise Markdown olarak ekler ve true döner.
export function pasteRichTextAsMarkdown(e) {
  const { text, rich, missingLinks } = clipboardToMarkdown(e.clipboardData)
  if (!rich) return false
  e.preventDefault()
  e.stopPropagation()
  const field = e.currentTarget
  insertIntoTextField(field, text)
  if (missingLinks) showPasteNotice(missingLinksMessage(missingLinks), field)
  return true
}
