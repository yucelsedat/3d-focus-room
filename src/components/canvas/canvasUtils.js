// ── Canvas ortak yardımcıları ────────────────────────────────────────────────
// Canvas tile (CanvasMesh) ve Timeline sayfası aynı öğe şemasını, aynı yapıştırma
// hattını ve aynı panoyu paylaşır: bir yüzeyde kopyalanan öğe diğerine yapıştırılabilir.
import { parseMd } from '../../utils/markdownRender'
import { clipboardToMarkdown } from '../../utils/richTextToMarkdown'
import { ensureGoogleEmail } from '../../utils/googleAccount'

// 8 bounding-box handle descriptors
export const HANDLES = [
  { h: 'nw', style: { top: -10, left: -10 },                  cursor: 'nw-resize' },
  { h: 'n',  style: { top: -10, left: 'calc(50% - 10px)' },   cursor: 'n-resize'  },
  { h: 'ne', style: { top: -10, right: -10 },                  cursor: 'ne-resize' },
  { h: 'e',  style: { top: 'calc(50% - 10px)', right: -10 },   cursor: 'e-resize'  },
  { h: 'se', style: { bottom: -10, right: -10 },               cursor: 'se-resize' },
  { h: 's',  style: { bottom: -10, left: 'calc(50% - 10px)' }, cursor: 's-resize'  },
  { h: 'sw', style: { bottom: -10, left: -10 },                cursor: 'sw-resize' },
  { h: 'w',  style: { top: 'calc(50% - 10px)', left: -10 },    cursor: 'w-resize'  },
]

export const MAX_IMG_W = 800
export const getImageNaturalSize = (url) => new Promise((resolve) => {
  const img = new Image()
  // render'daki <img referrerPolicy="no-referrer"> ile aynı koşulda test et —
  // hotlink korumalı görseller Referer'sız isteklerde çoğunlukla açılır
  img.referrerPolicy = 'no-referrer'
  img.onload  = () => resolve({ w: img.naturalWidth, h: img.naturalHeight })
  img.onerror = () => resolve(null)
  img.src = url
})

// Toplu resim paste'i: ölçüleri ({w,h}) ~kare bir ızgaraya satır satır dizer, bloğu pt'ye ortalar.
// Her satır kendi içinde yatay, her resim satır yüksekliğinde dikey ortalanır. Sol-üst köşeleri döndürür.
const IMG_GRID_GAP = 24
export const layoutImageGrid = (sizes, pt) => {
  const cols = Math.ceil(Math.sqrt(sizes.length))
  const rows = []
  for (let i = 0; i < sizes.length; i += cols) rows.push(sizes.slice(i, i + cols))
  const rowH = rows.map(r => Math.max(...r.map(s => s.h)))
  let y = pt.y - (rowH.reduce((a, b) => a + b, 0) + IMG_GRID_GAP * (rows.length - 1)) / 2
  return rows.flatMap((r, ri) => {
    let x = pt.x - (r.reduce((a, s) => a + s.w, 0) + IMG_GRID_GAP * (r.length - 1)) / 2
    const out = r.map(s => { const p = { x: Math.round(x), y: Math.round(y + (rowH[ri] - s.h) / 2) }; x += s.w + IMG_GRID_GAP; return p })
    y += rowH[ri] + IMG_GRID_GAP
    return out
  })
}

export const stopEvt = (e) => { e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation() }

// Metin kutusu içeriğiyle birlikte uzar ama en fazla A4 oranına (genişlik × 297/210)
// kadar; taşan içerik kutunun içinde scroll edilir.
export const A4_RATIO = 297 / 210
export const a4MaxH = (w) => Math.max(60, Math.round((w || 0) * A4_RATIO))

// Metin kutusunun render yüksekliğini ölç (A4 sınırında durur). Yapıştırılan uzun
// markdown için h doğru olsun ki seçim çerçevesi / bounds içerikle örtüşsün.
export const measureTextItemH = (content, w, fontSize, markdown) => {
  const el = document.createElement('div')
  if (markdown) el.className = 'cvmd'
  Object.assign(el.style, {
    position: 'absolute', left: '-100000px', top: '0', visibility: 'hidden', width: `${w}px`,
    fontSize: `${fontSize}px`, padding: '14px', boxSizing: 'border-box', wordBreak: 'break-word',
    whiteSpace: markdown ? 'normal' : 'pre-wrap',
  })
  if (markdown) el.innerHTML = parseMd(content)
  else el.textContent = content
  document.body.appendChild(el)
  const h = Math.ceil(el.scrollHeight)
  el.remove()
  return Math.min(Math.max(60, h), Math.max(60, Math.round(w * A4_RATIO)))
}

// bounding box of box-type items matching id set
export function getBounds(ids, items) {
  const sel = items.filter(it => ids.has(it.id) && it.type !== 'arrow')
  if (!sel.length) return null
  const minX = Math.min(...sel.map(it => it.x))
  const minY = Math.min(...sel.map(it => it.y))
  const maxX = Math.max(...sel.map(it => it.x + it.w))
  const maxY = Math.max(...sel.map(it => it.y + it.h))
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

// Bounding-box resize: tutamaç sürüklemesinden (dx,dy dünya px) öğelerin yeni
// konum/boyutunu üretir. Köşe = orantılı ölçek (metin ve not yazısı da büyür),
// kenar = tek eksen (tek resim seçiliyse oran korunur).
export function resizeItems(prev, { handle: rh, initBounds: ib, initItems }, dx, dy) {
  const isCorner = rh.length === 2  // nw ne se sw
  let nx = ib.x, ny = ib.y, nw, nh, scale
  if (isCorner) {
    const rawW = rh.includes('e') ? ib.w + dx : ib.w - dx
    nw = Math.max(40, rawW)
    scale = nw / ib.w
    nh = ib.h * scale
    if (rh.includes('w')) nx = ib.x + ib.w - nw
    if (rh.includes('n')) ny = ib.y + ib.h - nh
  } else {
    nw = ib.w; nh = ib.h
    if (rh.includes('e')) nw = Math.max(40, ib.w + dx)
    if (rh.includes('s')) nh = Math.max(20, ib.h + dy)
    if (rh.includes('w')) { nw = Math.max(40, ib.w - dx); nx = ib.x + ib.w - nw }
    if (rh.includes('n')) { nh = Math.max(20, ib.h - dy); ny = ib.y + ib.h - nh }
    if (initItems.length === 1) {
      const selItem = prev.find(it => it.id === initItems[0].id)
      if (selItem?.type === 'image') {
        const ratio = ib.w / ib.h
        if (rh === 'e' || rh === 'w') {
          nh = nw / ratio
        } else {
          nw = nh * ratio
          if (rh === 'n') ny = ib.y + ib.h - nh
        }
      }
    }
    scale = null
  }
  const sx = nw / ib.w, sy = nh / ib.h
  return prev.map(it => {
    const init = initItems.find(ii => ii.id === it.id)
    if (!init) return it
    const updated = { ...it, x: nx + (init.x - ib.x) * sx, y: ny + (init.y - ib.y) * sy, w: init.w * sx, h: init.h * sy }
    if (isCorner && (it.type === 'text' || it.type === 'note')) updated.fontSize = Math.max(6, Math.round(init.fontSize * scale))
    if (it.type === 'text') updated.h = Math.min(updated.h, a4MaxH(updated.w))
    return updated
  })
}

// ── Resimler ─────────────────────────────────────────────────────────────────
// Canvas'taki resimler okuma sırasıyla (yukarıdan aşağı, soldan sağa) gezilir.
export const imageOrder = (a, b) => (a.y - b.y) || (a.x - b.x)
export const imageName = (url) => {
  try { return decodeURIComponent(new URL(url, location.href).pathname.split('/').pop() || '') } catch { return '' }
}

// String url listesinden (not resimleri) görüntüleyici öğeleri
export const urlsToViewerImages = (urls) => urls.map((url, i) => ({ id: `${i}:${url}`, url }))

export const fetchImageBlob = async (url) => {
  try {
    const r = await fetch(url, { referrerPolicy: 'no-referrer' })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    return await r.blob()
  } catch (err) {
    // CORS engelli harici görsel → sunucu proxy'si üzerinden dene
    const abs = new URL(url, location.href)
    if (abs.origin === location.origin) throw err
    const r = await fetch(`/api/image-proxy?url=${encodeURIComponent(abs.href)}`)
    if (!r.ok) throw new Error(`proxy HTTP ${r.status}`)
    return r.blob()
  }
}

// Görseli blob olarak indirir; başarısızsa hata fırlatır (çağıran karar verir)
export const saveImageItem = async (item) => {
  const blob = await fetchImageBlob(item.url)
  const ext  = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace(/\+.*$/, '')
  let name = 'canvas-image'
  try { const p = new URL(item.url, location.href).pathname.split('/').pop(); if (p) name = decodeURIComponent(p) } catch {}
  if (!/\.[a-z0-9]{2,5}$/i.test(name)) name += `.${ext}`
  const a = document.createElement('a')
  const href = URL.createObjectURL(blob)
  a.href = href; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  // hemen revoke edilirse ardışık indirmelerde tarayıcı dosyayı almadan blob düşebilir
  setTimeout(() => URL.revokeObjectURL(href), 10000)
}

// Pano API'si çoğu tarayıcıda sadece image/png kabul eder — gerekirse çevir
export const copyImageToClipboard = async (url) => {
  const blob = await fetchImageBlob(url)
  let png = blob
  if (blob.type !== 'image/png') {
    const bmp = await createImageBitmap(blob)
    const c = document.createElement('canvas')
    c.width = bmp.width; c.height = bmp.height
    c.getContext('2d').drawImage(bmp, 0, 0)
    bmp.close()
    png = await new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('PNG dönüşümü başarısız')), 'image/png'))
  }
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
}

// Tek resim dosyasını yükleyip doğal boyutundan (MAX_IMG_W'ye sığdırılmış) ölçü döndürür
export const uploadImageFile = async (file, uploadKey) => {
  const form = new FormData(); form.append('file', file)
  const r = await fetch(`/api/canvas/${uploadKey}/upload`, { method: 'POST', body: form })
  if (!r.ok) return null
  const d = await r.json()
  const dims = await getImageNaturalSize(d.url)
  const w = dims ? Math.min(MAX_IMG_W, dims.w) : MAX_IMG_W
  const h = dims ? Math.round(w * dims.h / dims.w) : Math.round(MAX_IMG_W * 9 / 16)
  return { url: d.url, w, h }
}

export const isImageFile = (f) => f.type.startsWith('image/') || /\.(jpe?g|png|gif|webp|svg|bmp|avif)$/i.test(f.name || '')

// ── Instagram ────────────────────────────────────────────────────────────────
// og:title'dan kullanıcı adı + caption ayıkla ("<isim> on Instagram: "caption"")
export const parseInstaTitle = (raw) => {
  const t = (raw || '').trim()
  let m = t.match(/^(.+?)\s+on\s+Instagram\s*:?\s*(.*)$/i) || t.match(/^(.+?)\s*,\s*Instagram\s*:?\s*(.*)$/i)
  if (m) return { user: m[1].trim(), caption: m[2].replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim() }
  m = t.match(/^(.+?)\s*[•|]\s*Instagram/i)
  if (m) return { user: m[1].trim(), caption: '' }
  return { user: 'instagram', caption: t }
}

// Instagram permalink algılama + og:image kapaklı dikey (mobil) item üretimi.
// Hem Ctrl+V paste hem de URL-input (🖼️ Resim) yolları buradan geçer → tek kaynak.
export const isInstaUrl = (text) => {
  try { const u = new URL(text); return /(^|\.)instagram\.com$/i.test(u.hostname) && /\/(p|reel|reels|tv)\/[A-Za-z0-9_-]+/i.test(u.pathname) } catch { return false }
}
export const buildInstaItem = async (url, pt) => {
  let title = '', thumbUrl = '', siteName = 'instagram'
  try {
    const r = await fetch(`/api/link-meta?url=${encodeURIComponent(url)}`)
    if (r.ok) { const d = await r.json(); title = d.title || ''; thumbUrl = d.image || ''; siteName = d.siteName || siteName }
  } catch {}
  // dikey mobil oran (9:15.75)
  return { id: crypto.randomUUID(), type: 'insta', x: pt.x, y: pt.y, w: 320, h: 560, url, thumbUrl, title, siteName }
}

// Open Graph başlık + görsel (link kartı ve not linki ortak)
export const fetchLinkMeta = async (url) => {
  let host = ''
  try { host = new URL(url).hostname } catch {}
  const out = { title: '', thumbUrl: '', siteName: host }
  try {
    const r = await fetch(`/api/link-meta?url=${encodeURIComponent(url)}`)
    if (r.ok) { const d = await r.json(); out.title = d.title || ''; out.thumbUrl = d.image || ''; out.siteName = d.siteName || host }
  } catch {}
  return out
}

export const formatBytes = (n) => {
  if (!n) return ''
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`
  return `${(n / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

// ── Müzik ses havuzu ─────────────────────────────────────────────────────────
// <audio> elementi React ağacına bağlı OLMAMALI: edit ↔ görüntüleme modu geçişinde
// MusicCard unmount/remount olur; DOM'daki <audio> de kaldırılırsa çalan şarkı kesilir.
// Bu yüzden ses elementleri module-level bir havuzda (item.id → HTMLAudioElement)
// tutulur; React unmount'tan bağımsız çalmaya devam eder. Kart yalnızca UI'ı yönetir.
export const audioPool = new Map()
let currentlyPlayingAudio = null   // aynı anda tek mp3 çalsın
export const getPoolAudio = (id, url) => {
  let a = audioPool.get(id)
  if (!a) { a = new Audio(url); a.preload = 'none'; audioPool.set(id, a) }
  return a
}
export const disposePoolAudio = (id) => {
  const a = audioPool.get(id)
  if (!a) return
  try { a.pause() } catch {}
  if (currentlyPlayingAudio === a) currentlyPlayingAudio = null
  audioPool.delete(id)
}
export const togglePoolAudio = (id, url) => {
  const a = getPoolAudio(id, url)
  if (a.paused) {
    if (currentlyPlayingAudio && currentlyPlayingAudio !== a) { try { currentlyPlayingAudio.pause() } catch {} }
    currentlyPlayingAudio = a
    a.play().catch(() => {})
  } else a.pause()
}
export const releasePoolAudio = (a) => { if (currentlyPlayingAudio === a) currentlyPlayingAudio = null }

// ── Ortak canvas panosu ──────────────────────────────────────────────────────
// Module-level clipboard — canvas tile'lar ve timeline arasında ortak.
// When the user copies something outside the canvas, clear the internal clipboard
// so Ctrl+V uses the OS clipboard instead of stale canvas items.
// The 50ms guard prevents this from firing on our own Ctrl+C (where e.preventDefault
// blocks the copy event but a tiny race is possible in some browsers).
let canvasClipboard = null
let canvasClipboardTs = 0
if (typeof document !== 'undefined') {
  document.addEventListener('copy', () => {
    if (Date.now() - canvasClipboardTs > 50) canvasClipboard = null
  }, true)
}
export const getCanvasClipboard = () => canvasClipboard
export const setCanvasClipboard = (sourceId, items) => {
  canvasClipboardTs = Date.now()
  canvasClipboard = { sourceId, items }
}

// Başka yüzeye yapıştırırken /uploads altındaki dosyaları çoğaltır: kaynak öğe
// silinince (dosyası da silinir) kopya kırık kalmasın. Not resimleri de dahil.
export async function copyItemAssets(clipItems) {
  const urls = clipItems.flatMap(it => {
    const out = []
    if ((it.type === 'image' || it.type === 'music' || it.type === 'pdf') && it.url?.startsWith('/uploads/')) out.push(it.url)
    if (it.type === 'music' && it.coverUrl?.startsWith('/uploads/')) out.push(it.coverUrl)
    if (it.type === 'note') for (const u of it.images || []) if (u.startsWith('/uploads/')) out.push(u)
    return out
  })
  if (!urls.length) return clipItems
  const r = await fetch('/api/canvas/copy-images', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
  })
  const d = await r.json()
  if (!r.ok || !d.mapping) return clipItems
  const m = d.mapping
  return clipItems.map(it => {
    if ((it.type === 'image' || it.type === 'pdf') && m[it.url]) return { ...it, url: m[it.url] }
    if (it.type === 'music') {
      const next = { ...it }
      if (m[it.url]) next.url = m[it.url]
      if (m[it.coverUrl]) next.coverUrl = m[it.coverUrl]
      return next
    }
    if (it.type === 'note' && it.images?.length) return { ...it, images: it.images.map(u => m[u] || u) }
    return it
  })
}

// Panodaki öğeleri yeni id'lerle, sınır kutusu pt'ye ortalanacak şekilde kaydırır
export function placeClipItems(clipItems, pt) {
  const box = getBounds(new Set(clipItems.map(i => i.id)), clipItems)
  const ox = box ? pt.x - box.x - box.w / 2 : 0
  const oy = box ? pt.y - box.y - box.h / 2 : 0
  return clipItems.map(it => ({
    ...it,
    id: crypto.randomUUID(),
    x: (it.x ?? 0) + ox,
    y: (it.y ?? 0) + oy,
    ...(it.type === 'arrow' ? { x1: it.x1 + ox, y1: it.y1 + oy, x2: it.x2 + ox, y2: it.y2 + oy } : {}),
  }))
}

// ── İşletim sistemi panosundan yapıştırma ────────────────────────────────────
// Paste olayının clipboardData'sından yeni canvas öğeleri üretir; state'e dokunmaz.
// clipboardData olay bittikten sonra okunamaz → her şey ilk await'ten ÖNCE okunur.
//   uploadKey : /api/canvas/:key/upload* yolundaki anahtar
//   center()  : öğelerin yerleşeceği dünya noktası (await sonrası da çağrılabilir)
//   onLoading : ağ işi başlarken (yükleme göstergesi için)
// Dönüş: null (işlenecek bir şey yok) | { items, select, editId, msg, ms }
export async function buildPasteItems(cd, { uploadKey, center, onLoading = () => {} }) {
  if (!cd) return null
  const files = [...(cd.files || [])]
  const clipItems = [...(cd.items || [])]

  // Biçimli metin (web sayfası, Google Docs, Word…) → Markdown modunda metin kutusu.
  // Resim kontrolünden önce: Word/LibreOffice seçimi text/html'in yanında image/png de koyar.
  // Yalnızca text/plain de varsa — "Resmi kopyala" (sadece <img> + image/png) resim olarak kalsın.
  const hasFiles = files.length > 0 && !clipItems.some(it => it.type === 'text/html')
  const richPaste = hasFiles ? null : clipboardToMarkdown(cd)
  const plain = cd.getData('text/plain') || ''
  if (richPaste?.rich && plain.trim()) {
    const pt = center()
    const w = 800, fontSize = 30
    const h = measureTextItemH(richPaste.text, w, fontSize, true)
    const ni = { id: crypto.randomUUID(), type: 'text', x: pt.x, y: pt.y, w, h, content: richPaste.text, fontSize, markdown: true }
    // adresi kaynakta olmayan link varsa uyarı daha uzun kalsın
    const missing = richPaste.missingLinks
    return { items: [ni], select: true, msg: missing ? `md-nolink:${missing}` : 'md', ms: missing ? 5000 : 1600 }
  }

  // Resim dosyaları — toplu paste destekli: FileList (dosya yöneticisinden çoklu kopya) yoksa items'tan topla.
  // Dosya yöneticisi bazı uzantılarda (avif, heic…) MIME tipini boş bırakır → uzantıya da bak.
  let imgFiles = files.filter(isImageFile)
  if (!imgFiles.length) imgFiles = clipItems.filter(it => it.type.startsWith('image/')).map(it => it.getAsFile()).filter(Boolean)
  if (imgFiles.length) {
    onLoading()
    let res = { items: [], msg: 'err', ms: 1800 }
    try {
      // Hepsini paralel yükle + ölç, sıra korunur; tek dosyanın hatası diğerlerini düşürmesin
      const sized = await Promise.all(imgFiles.map(f => uploadImageFile(f, uploadKey).catch(() => null)))
      const ok = sized.filter(Boolean)
      if (ok.length) {
        const pos = layoutImageGrid(ok, center())
        const items = ok.map((s, i) => ({ id: crypto.randomUUID(), type: 'image', x: pos[i].x, y: pos[i].y, w: s.w, h: s.h, url: s.url }))
        const partial = ok.length < imgFiles.length
        res = { items, select: true, msg: partial ? `partial:${ok.length}/${imgFiles.length}` : 'ok', ms: partial ? 4000 : 1800 }
      }
    } catch {}
    return res
  }

  // Ses dosyaları — toplu paste destekli: FileList (daha güvenilir) yoksa items'tan topla.
  let audioFiles = files.filter(f => f.type.startsWith('audio/'))
  if (!audioFiles.length) audioFiles = clipItems.filter(it => it.type.startsWith('audio/')).map(it => it.getAsFile()).filter(Boolean)
  // PDF dosyaları — ses ile aynı toplu paste akışı
  const isPdf = (f) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name || '')
  let pdfFiles = files.filter(isPdf)
  if (!pdfFiles.length) pdfFiles = clipItems.filter(it => it.kind === 'file' && it.type === 'application/pdf').map(it => it.getAsFile()).filter(Boolean)

  const uploadRow = async (list, path, W, H, toItem) => {
    onLoading()
    try {
      const metas = await Promise.all(list.map(async (file) => {
        const form = new FormData(); form.append('file', file)
        const r = await fetch(`/api/canvas/${uploadKey}/${path}`, { method: 'POST', body: form })
        return r.ok ? r.json() : null
      }))
      const ok = metas.filter(Boolean)
      if (!ok.length) return { items: [], msg: 'err', ms: 1800 }
      const GAP = 24, step = W + GAP
      const pt = center()
      const startX = pt.x - ((ok.length - 1) * step) / 2   // grubu merkeze yatay ortala
      return { items: ok.map((d, i) => ({ id: crypto.randomUUID(), x: startX + i * step, y: pt.y, w: W, h: H, ...toItem(d) })), msg: 'ok', ms: 1800 }
    } catch { return { items: [], msg: 'err', ms: 1800 } }
  }
  if (audioFiles.length) {
    return uploadRow(audioFiles, 'upload-audio', 300, 480, d => ({
      type: 'music', url: d.url, title: d.title, artist: d.artist, coverUrl: d.coverUrl, duration: d.duration,
    }))
  }
  if (pdfFiles.length) {
    // A4 oranı (1:√2)
    return uploadRow(pdfFiles, 'upload-pdf', 300, 424, d => ({ type: 'pdf', url: d.url, title: d.title, size: d.size, pages: d.pages }))
  }

  const text = plain.trim()
  if (!text) return null

  // YouTube link
  const ytId = (() => { try { const u = new URL(text); if (u.hostname.includes('youtube.com')) return u.searchParams.get('v'); if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('?')[0] } catch {} return null })()
  if (ytId) {
    onLoading()
    const pt = center()
    let title = '', thumbUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`
    try {
      const r = await fetch(`/api/youtube-meta?url=${encodeURIComponent(text)}`)
      if (r.ok) { const d = await r.json(); title = d.title || ''; if (d.thumbnail_url) thumbUrl = d.thumbnail_url }
    } catch {}
    return { items: [{ id: crypto.randomUUID(), type: 'youtube', x: pt.x, y: pt.y, w: 480, h: 270, url: text, videoId: ytId, thumbUrl, title }], msg: 'ok', ms: 1200 }
  }

  // Instagram reel/gönderi linki → dikey mobil kart (og görsel + başlık)
  if (isInstaUrl(text)) {
    onLoading()
    return { items: [await buildInstaItem(text, center())], msg: 'ok', ms: 1200 }
  }

  const parsedUrl = (() => { try { const u = new URL(text); return /^https?:$/.test(u.protocol) && u.hostname.includes('.') ? u : null } catch { return null } })()
  const isImgUrl = parsedUrl ? /\.(jpe?g|png|gif|webp|svg|bmp|avif|tiff?)$/i.test(parsedUrl.pathname) : false
  const pt = center()
  // Generic link — Open Graph görsel + başlıktan kart oluştur
  const linkCard = async () => {
    const meta = await fetchLinkMeta(text)
    const googleEmail = ensureGoogleEmail()
    return { id: crypto.randomUUID(), type: 'link', x: pt.x, y: pt.y, w: 480, h: 300, url: text, ...meta, ...(googleEmail ? { googleEmail } : {}) }
  }
  if (isImgUrl) {
    onLoading()
    const dims = await getImageNaturalSize(text)
    if (dims) {
      const iw = Math.min(MAX_IMG_W, dims.w)
      const ih = Math.round(iw * dims.h / dims.w)
      return { items: [{ id: crypto.randomUUID(), type: 'image', x: pt.x, y: pt.y, w: iw, h: ih, url: text }], msg: 'ok', ms: 1200 }
    }
    // Görsel yüklenemedi (hotlink koruması / ölü link) — şeffaf blok yerine link kartı
    return { items: [await linkCard()], msg: 'ok', ms: 1200 }
  }
  if (parsedUrl) {
    onLoading()
    return { items: [await linkCard()], msg: 'ok', ms: 1200 }
  }
  const ni = { id: crypto.randomUUID(), type: 'text', x: pt.x, y: pt.y, w: 500, h: 220, content: text, fontSize: 30 }
  return { items: [ni], editId: ni.id, msg: 'ok', ms: 1200 }
}

// Yapıştırma / kopyalama geri bildirim metni ve rengi (toolbar rozeti)
export function pasteMsgView(msg, missingLinksMessage) {
  const warn = msg.startsWith('md-nolink:') || msg.startsWith('partial:')
  const good = ['ok', 'copy', 'cut', 'imgcopy', 'md'].includes(msg)
  const color = warn ? '#fbbf24' : msg === 'loading' ? '#60a5fa' : good ? '#4ade80' : '#f87171'
  const text = msg === 'loading' ? '⟳ Yapıştırılıyor…' : msg === 'copy' ? '⧉ Kopyalandı' : msg === 'cut' ? '✂ Kesildi'
    : msg === 'imgcopy' ? '🖼 Resim panoya kopyalandı' : msg === 'md' ? '✓ Markdown olarak yapıştırıldı'
    : msg.startsWith('md-nolink:') ? `✓ Markdown olarak yapıştırıldı · ${missingLinksMessage(Number(msg.split(':')[1]))}`
    : msg.startsWith('partial:') ? `⚠ ${msg.split(':')[1]} resim yapıştırıldı, kalanı yüklenemedi`
    : msg === 'ok' ? '✓ Yapıştırıldı' : '✕ Hata'
  return { color, text }
}

// Defter kartı: kitaplıktaki deftere bakar (src); ad/kapak kopyası ilk çizim için.
// Boy canvas'ın 1920 px'lik mantıksal ölçeğinde (timeline aynı ölçek).
export const NOTEBOOK_CARD = { w: 300, h: 400 }
export function makeNotebookItem(meta, pt) {
  return { id: crypto.randomUUID(), type: 'notebook', x: pt.x, y: pt.y, w: NOTEBOOK_CARD.w, h: NOTEBOOK_CARD.h, src: meta.key, name: meta.name, cover: meta.cover }
}
