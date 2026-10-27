// Defter satır bloklarının panosu. Seçili satırlar panoya iki biçimde yazılır:
//   text/html  — başlık + iç içe liste (yapılacak = checkbox, biten = üstü çizili).
//                Canvas / timeline / not editörü bunu richTextToMarkdown ile Markdown
//                metin kutusuna çevirir; Docs, Notion gibi dış uygulamalar da anlar.
//                Sarmalayıcıdaki data-nb-clip, satırları (tip, işaret, girinti, oda izi)
//                kayıpsız taşır → başka deftere yapıştırınca aynen geri kurulur.
//   text/plain — GFM Markdown ("- [ ] iş", "# başlık", 2 boşluk girinti)
//
// Yazma: Ctrl+C'de odakta seçim olmadığından tarayıcı kendi copy olayını üretmez.
// execCommand('copy') boş seçimde de copy olayı tetikler (kullanıcı hareketi içinde);
// olayda setData ile veri yazılır. Gerçek copy olayı olduğu için canvasUtils'teki
// dinleyici canvas'ın iç panosunu da temizler → canvas'ta Ctrl+V defter satırlarını alır.
import { cleanClip } from '../../utils/notebookModel'

const ATTR = 'data-nb-clip'

const esc = (s) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

function itemHtml(r) {
  const t = esc(r.text)
  if (r.type !== 'todo') return t
  return `<input type="checkbox"${r.done ? ' checked' : ''}> ${r.done ? `<s>${t}</s>` : t}`
}

export function clipToHtml(clip, key) {
  let html = ''
  const stack = [] // açık <ul>'ler; değer = içinde açık <li> var mı
  const closeList = () => { if (stack.pop()) html += '</li>'; html += '</ul>' }
  for (const r of clip) {
    if (!r.text) continue
    if (r.type === 'heading') {
      while (stack.length) closeList()
      html += `<h2>${esc(r.text)}</h2>`
      continue
    }
    const level = r.depth + 1
    while (stack.length > level) closeList()
    while (stack.length < level) { html += '<ul>'; stack.push(false) }
    if (stack[stack.length - 1]) html += '</li>'
    html += `<li>${itemHtml(r)}`
    stack[stack.length - 1] = true
  }
  while (stack.length) closeList()
  const data = esc(JSON.stringify({ v: 1, key, rows: clip }))
  return `<div ${ATTR}="${data}">${html}</div>`
}

export function clipToPlain(clip) {
  return clip.filter(r => r.text).map(r => {
    if (r.type === 'heading') return `# ${r.text}`
    const box = r.type === 'todo' ? `[${r.done ? 'x' : ' '}] ` : ''
    return `${'  '.repeat(r.depth)}- ${box}${r.text}`
  }).join('\n')
}

// → Promise<boolean>
export function writeNotebookClip(clip, key) {
  const html = clipToHtml(clip, key)
  const plain = clipToPlain(clip)
  let ok = false
  const onCopy = (e) => {
    e.clipboardData.setData('text/html', html)
    e.clipboardData.setData('text/plain', plain)
    e.preventDefault()
    ok = true
  }
  document.addEventListener('copy', onCopy, true)
  try { document.execCommand('copy') } catch { /* aşağıdaki yola düş */ }
  document.removeEventListener('copy', onCopy, true)
  if (ok) return Promise.resolve(true)
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return Promise.resolve(false)
  return navigator.clipboard.write([new ClipboardItem({
    'text/html': new Blob([html], { type: 'text/html' }),
    'text/plain': new Blob([plain], { type: 'text/plain' }),
  })]).then(() => true, () => false)
}

// Paste olayının panosunda defter satırları var mı → { rows, key } | null
export function readNotebookClip(cd) {
  const html = cd?.getData('text/html') || ''
  if (!html.includes(ATTR)) return null
  try {
    const raw = new DOMParser().parseFromString(html, 'text/html').querySelector(`[${ATTR}]`)?.getAttribute(ATTR)
    const data = raw ? JSON.parse(raw) : null
    if (data?.v !== 1) return null
    const rows = cleanClip(data.rows)
    return rows ? { rows, key: typeof data.key === 'string' ? data.key : null } : null
  } catch {
    return null
  }
}
