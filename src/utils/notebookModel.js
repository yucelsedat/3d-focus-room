// Oda Defteri (Room Notebook) — saf veri modeli.
// JSX/DOM içermez: hem tarayıcı (notebookStore) hem server.js (sanitize + reconcile)
// aynı fonksiyonları kullanır. Her op yeni nesne döndürür; değişmeyen satır
// nesneleri aynen korunur (React.memo satırları gereksiz yere yeniden çizmesin).
//
// Doküman:
//   { version: 1, pages: Page[], archive: ArchivedRow[] }
//   Page = { id, title, seed, createdAt, rows: Row[] }
//   Row  = { id, type: 'todo'|'note'|'heading', text, done, depth (0..2),
//            roomId, roomName (silinen oda için snapshot), seed (≠0), createdAt, doneAt }
//   ArchivedRow = Row & { pageId, pageTitle, archivedAt }
//
// Ağaç kuralı: başlık her zaman derinlik 0'dır ve çocuk almaz; her satır en fazla
// bir üstündeki satırdan bir seviye derin olabilir (normalizeDepths).

export const NB_LIMITS = {
  pages: 30,
  rows: 1000,
  text: 4000,
  title: 40,
  archive: 2000,
  depth: 2,
  bytes: 1_500_000,
}

const TYPES = new Set(['todo', 'note', 'heading'])
const MAX_DEPTH = NB_LIMITS.depth

// ─── kimlik / seed ────────────────────────────────────────────────────────────

export function newId() {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (uuid) return uuid
  return 'nb-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}

// rough.js seed 0'ı "her çizimde rastgele" sayar — asla 0 üretme.
export function newSeed() {
  return 1 + Math.floor(Math.random() * 2147483646)
}

// ─── oluşturucular ────────────────────────────────────────────────────────────

export function makeRow(fields = {}) {
  return {
    id: newId(),
    type: 'todo',
    text: '',
    done: false,
    depth: 0,
    roomId: null,
    roomName: null,
    seed: newSeed(),
    createdAt: Date.now(),
    doneAt: null,
    ...fields,
  }
}

export function makePage(title = 'Sayfa', rows = []) {
  return { id: newId(), title: cleanTitle(title) || 'Sayfa', seed: newSeed(), createdAt: Date.now(), rows }
}

export function createEmptyDoc() {
  return { version: 1, pages: [makePage('Yapılacaklar')], archive: [] }
}

// ─── doğrulama ────────────────────────────────────────────────────────────────

const isSeed = (v) => Number.isInteger(v) && v > 0 && v < 2 ** 31
const num = (v, fallback = 0) => (Number.isFinite(v) ? v : fallback)
const oneLine = (s) => s.replace(/[\r\n\t]+/g, ' ')

export function cleanTitle(t) {
  return typeof t === 'string' ? oneLine(t).trim().slice(0, NB_LIMITS.title) : ''
}

function sanitizeRow(r, usedIds) {
  if (!r || typeof r !== 'object') return null
  let id = typeof r.id === 'string' && r.id ? r.id.slice(0, 64) : newId()
  if (usedIds.has(id)) id = newId()
  usedIds.add(id)
  const type = TYPES.has(r.type) ? r.type : 'note'
  const done = type === 'todo' && r.done === true
  return {
    id,
    type,
    text: typeof r.text === 'string' ? oneLine(r.text).slice(0, NB_LIMITS.text) : '',
    done,
    depth: type === 'heading' ? 0 : Math.max(0, Math.min(MAX_DEPTH, Math.trunc(num(r.depth)))),
    roomId: typeof r.roomId === 'string' && r.roomId ? r.roomId.slice(0, 128) : null,
    roomName: typeof r.roomName === 'string' ? r.roomName.slice(0, 120) : null,
    seed: isSeed(r.seed) ? r.seed : newSeed(),
    createdAt: num(r.createdAt),
    doneAt: done && Number.isFinite(r.doneAt) ? r.doneAt : null,
  }
}

// Geçersiz yapı → null (server 400 döner). Tek tek bozuk satırlar atılır/onarılır.
export function sanitizeNotebook(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.pages)) return null
  const usedIds = new Set()
  const usedPageIds = new Set()
  const pages = []
  for (const p of doc.pages.slice(0, NB_LIMITS.pages)) {
    if (!p || typeof p !== 'object' || !Array.isArray(p.rows)) continue
    let id = typeof p.id === 'string' && p.id ? p.id.slice(0, 64) : newId()
    if (usedPageIds.has(id)) id = newId()
    usedPageIds.add(id)
    const rows = p.rows.slice(0, NB_LIMITS.rows).map(r => sanitizeRow(r, usedIds)).filter(Boolean)
    pages.push({
      id,
      title: cleanTitle(p.title) || 'Sayfa',
      seed: isSeed(p.seed) ? p.seed : newSeed(),
      createdAt: num(p.createdAt),
      rows: normalizeDepths(rows),
    })
  }
  if (!pages.length) pages.push(makePage('Yapılacaklar'))
  const archive = []
  if (Array.isArray(doc.archive)) {
    for (const a of doc.archive.slice(-NB_LIMITS.archive)) {
      const row = sanitizeRow(a, usedIds)
      if (!row) continue
      archive.push({
        ...row,
        depth: 0,
        pageId: typeof a.pageId === 'string' ? a.pageId.slice(0, 64) : null,
        pageTitle: cleanTitle(a.pageTitle),
        archivedAt: num(a.archivedAt),
      })
    }
  }
  return { version: 1, pages, archive }
}

// ─── ağaç yardımcıları ────────────────────────────────────────────────────────

// Bu satırın hemen altına gelebilecek en derin seviye
export function maxDepthAfter(prev) {
  if (!prev || prev.type === 'heading') return 0
  return Math.min(MAX_DEPTH, prev.depth + 1)
}

// Derinlik kurallarını uygular; hiçbir satır değişmezse aynı diziyi döndürür.
export function normalizeDepths(rows) {
  let out = null
  let prev = null
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    const want = r.type === 'heading' ? 0 : Math.max(0, Math.min(r.depth, maxDepthAfter(prev)))
    let next = r
    if (want !== r.depth) {
      if (!out) out = rows.slice(0, i)
      next = { ...r, depth: want }
    }
    if (out) out.push(next)
    prev = next
  }
  return out ?? rows
}

// i. satırın alt ağacının bittiği index (hariç)
export function subtreeEnd(rows, i) {
  let j = i + 1
  while (j < rows.length && rows[j].depth > rows[i].depth) j++
  return j
}

const indexOf = (rows, id) => rows.findIndex(r => r.id === id)

function shiftBlock(rows, start, end, delta) {
  if (!delta) return rows
  const out = rows.slice()
  for (let k = start; k < end; k++) {
    out[k] = { ...out[k], depth: Math.max(0, Math.min(MAX_DEPTH, out[k].depth + delta)) }
  }
  return out
}

// ─── metin & kısayollar ──────────────────────────────────────────────────────

const SHORTCUTS = [
  { re: /^\[\s?\]\s/, type: 'todo', done: false },
  { re: /^\[[xX]\]\s/, type: 'todo', done: true },
  { re: /^#\s/, type: 'heading' },
  { re: /^[-*]\s/, type: 'note' },
]

// "[] ", "[x] ", "# ", "- " / "* " satır başı kısayolları → { type, done, text } | null
export function parseShortcut(text) {
  for (const s of SHORTCUTS) {
    const m = s.re.exec(text)
    if (m) return { type: s.type, done: !!s.done, text: text.slice(m[0].length) }
  }
  return null
}

function retype(row, type, done = false, now = Date.now()) {
  const isDone = type === 'todo' && done
  return {
    ...row,
    type,
    done: isDone,
    doneAt: isDone ? (row.doneAt ?? now) : null,
    depth: type === 'heading' ? 0 : row.depth,
  }
}

// Metni yazar; satır başında kısayol varsa tipi değiştirip öneki siler.
// Oda izi: metin tamamen silinince ya da boş satıra yazılmaya başlanınca satır
// içeriğiyle birlikte sahipliğini de kaybeder → ctx'teki (o anki) odaya geçer.
// Dönüş: { rows, focus? } — kısayol uygulandıysa imleç başa alınır.
export function setText(rows, id, text, ctx = {}, now = Date.now()) {
  const i = indexOf(rows, id)
  if (i < 0) return { rows }
  const clean = oneLine(text).slice(0, NB_LIMITS.text)
  let row = rows[i]
  let focus
  const wasEmpty = row.text === ''
  const sc = parseShortcut(clean)
  if (sc) {
    row = { ...retype(row, sc.type, sc.done, now), text: sc.text }
    focus = { id, caret: 0 }
  } else {
    if (clean === row.text) return { rows }
    row = { ...row, text: clean }
  }
  if ((wasEmpty || row.text === '') && ctx.roomId && row.roomId !== ctx.roomId) {
    row = { ...row, roomId: ctx.roomId, roomName: ctx.roomName ?? null }
  }
  const out = rows.slice()
  out[i] = row
  return { rows: normalizeDepths(out), focus }
}

export function setType(rows, id, type, now = Date.now()) {
  const i = indexOf(rows, id)
  if (i < 0 || !TYPES.has(type) || rows[i].type === type) return { rows }
  const out = rows.slice()
  out[i] = retype(rows[i], type, false, now)
  return { rows: normalizeDepths(out), focus: { id, caret: null } }
}

// ─── satır ekleme / bölme / silme ────────────────────────────────────────────

// ctx = { roomId, roomName } — yeni satırın oluşturulduğu oda (oda izi)
export function appendRow(rows, ctx = {}) {
  if (rows.length >= NB_LIMITS.rows) return { rows }
  const last = rows[rows.length - 1]
  const row = makeRow({
    type: last && last.type !== 'heading' ? last.type : 'todo',
    depth: last && last.type !== 'heading' ? last.depth : 0,
    roomId: ctx.roomId ?? null,
    roomName: ctx.roomName ?? null,
  })
  return { rows: normalizeDepths([...rows, row]), focus: { id: row.id, caret: 0 } }
}

// Enter: imleçten böler. Başlıkta Enter not açar. Boş girintili satırda girinti azaltır.
export function splitRow(rows, id, caret, ctx = {}) {
  const i = indexOf(rows, id)
  if (i < 0) return { rows }
  const row = rows[i]
  if (!row.text && row.depth > 0) return outdentBlock(rows, id)
  if (rows.length >= NB_LIMITS.rows) return { rows }

  const c = Math.max(0, Math.min(row.text.length, caret ?? row.text.length))
  const hasChildren = i + 1 < rows.length && rows[i + 1].depth > row.depth
  const nextType = row.type === 'heading' ? 'note' : row.type
  const base = { type: nextType, roomId: ctx.roomId ?? null, roomName: ctx.roomName ?? null }

  // İmleç başta ve satır doluysa: üstüne boş satır aç, imleç yerinde kalsın
  if (c === 0 && row.text) {
    const above = makeRow({ ...base, type: row.type, depth: row.depth })
    const out = [...rows.slice(0, i), above, ...rows.slice(i)]
    return { rows: normalizeDepths(out), focus: { id: row.id, caret: 0 } }
  }

  const before = row.text.slice(0, c)
  const after = row.text.slice(c)
  // Çocukları olan satırda yeni satır ilk çocuk olur — aksi halde çocuklar ona kayardı
  const depth = row.type === 'heading' ? 0 : hasChildren ? Math.min(MAX_DEPTH, row.depth + 1) : row.depth
  const created = makeRow({ ...base, text: after, depth })
  const out = rows.slice()
  out[i] = { ...row, text: before }
  out.splice(i + 1, 0, created)
  return { rows: normalizeDepths(out), focus: { id: created.id, caret: 0 } }
}

// Çok satırlı yapıştırma → her satır ayrı defter satırı. Tek satırsa null (tarayıcı halletsin).
export function insertPasted(rows, id, caret, caretEnd, pasted, ctx = {}) {
  const lines = String(pasted).split(/\r?\n/)
  if (lines.length < 2) return null
  const i = indexOf(rows, id)
  if (i < 0) return { rows }
  const row = rows[i]
  const s = Math.max(0, Math.min(row.text.length, caret ?? row.text.length))
  const e = Math.max(s, Math.min(row.text.length, caretEnd ?? s))
  const head = row.text.slice(0, s)
  const tail = row.text.slice(e)
  const room = rows.length
  const extra = lines.slice(1, Math.max(1, NB_LIMITS.rows - room + 1))
  const out = rows.slice()
  out[i] = { ...row, text: oneLine(head + lines[0]).slice(0, NB_LIMITS.text) }
  const baseType = row.type === 'heading' ? 'note' : row.type
  const created = extra.map((line, k) => {
    const isLast = k === extra.length - 1
    let text = line + (isLast ? tail : '')
    let type = baseType
    let done = false
    const sc = parseShortcut(text)
    if (sc) { type = sc.type; done = sc.done; text = sc.text }
    return makeRow({
      type, done, doneAt: done ? Date.now() : null,
      text: oneLine(text).slice(0, NB_LIMITS.text),
      depth: type === 'heading' ? 0 : row.depth,
      roomId: ctx.roomId ?? null, roomName: ctx.roomName ?? null,
    })
  })
  if (!created.length) {
    out[i] = { ...out[i], text: oneLine(out[i].text + tail).slice(0, NB_LIMITS.text) }
    return { rows: normalizeDepths(out), focus: { id: row.id, caret: out[i].text.length - tail.length } }
  }
  out.splice(i + 1, 0, ...created)
  const last = created[created.length - 1]
  return { rows: normalizeDepths(out), focus: { id: last.id, caret: last.text.length - tail.length } }
}

// Satırı siler (çocukları normalizeDepths ile bir üste bağlanır). Tek satır silinmez.
export function deleteRow(rows, id) {
  const i = indexOf(rows, id)
  if (i < 0 || rows.length <= 1) return { rows }
  const out = [...rows.slice(0, i), ...rows.slice(i + 1)]
  const prev = out[i - 1]
  const focus = prev ? { id: prev.id, caret: prev.text.length } : { id: out[0].id, caret: 0 }
  return { rows: normalizeDepths(out), focus }
}

// Satırı üsttekinin sonuna ekleyip siler (Backspace @ 0)
export function mergeWithPrev(rows, id) {
  const i = indexOf(rows, id)
  if (i <= 0) return { rows }
  const prev = rows[i - 1]
  const cur = rows[i]
  const out = rows.slice()
  out[i - 1] = { ...prev, text: (prev.text + cur.text).slice(0, NB_LIMITS.text) }
  out.splice(i, 1)
  return { rows: normalizeDepths(out), focus: { id: prev.id, caret: prev.text.length } }
}

// Backspace imleç 0'dayken: boş → sil; girintili → girinti azalt; todo/başlık → not; not → birleştir
export function backspaceAt(rows, id) {
  const i = indexOf(rows, id)
  if (i < 0) return { rows }
  const row = rows[i]
  if (!row.text) {
    if (rows.length > 1) return deleteRow(rows, id)
    if (row.type !== 'note' || row.depth) return setType(rows, id, 'note')
    return { rows }
  }
  if (row.depth > 0) return { ...outdentBlock(rows, id), focus: { id, caret: 0 } }
  if (row.type !== 'note') return { ...setType(rows, id, 'note'), focus: { id, caret: 0 } }
  return mergeWithPrev(rows, id)
}

// ─── girinti ──────────────────────────────────────────────────────────────────

export function indentBlock(rows, id) {
  const i = indexOf(rows, id)
  if (i <= 0) return { rows }
  const row = rows[i]
  if (row.type === 'heading') return { rows }
  if (row.depth + 1 > maxDepthAfter(rows[i - 1])) return { rows }
  const end = subtreeEnd(rows, i)
  for (let k = i; k < end; k++) if (rows[k].depth + 1 > MAX_DEPTH) return { rows }
  return { rows: normalizeDepths(shiftBlock(rows, i, end, 1)), focus: { id, caret: null } }
}

export function outdentBlock(rows, id) {
  const i = indexOf(rows, id)
  if (i < 0 || rows[i].depth === 0) return { rows }
  const end = subtreeEnd(rows, i)
  return { rows: normalizeDepths(shiftBlock(rows, i, end, -1)), focus: { id, caret: null } }
}

// ─── tamamlama ────────────────────────────────────────────────────────────────

// İşaretlemek alt todo'ları da işaretler; kaldırmak yalnızca bu satırı etkiler.
export function toggleDone(rows, id, now = Date.now()) {
  const i = indexOf(rows, id)
  if (i < 0 || rows[i].type !== 'todo') return { rows }
  const out = rows.slice()
  const done = !rows[i].done
  out[i] = { ...rows[i], done, doneAt: done ? now : null }
  if (done) {
    const end = subtreeEnd(rows, i)
    for (let k = i + 1; k < end; k++) {
      if (out[k].type === 'todo' && !out[k].done) out[k] = { ...out[k], done: true, doneAt: now }
    }
  }
  return { rows: out }
}

// ─── sürükle-bırak ────────────────────────────────────────────────────────────

// activeId bloğunu (çocuklarıyla) overId'nin yerine taşır. Aşağı taşırken over'ın
// arkasına, yukarı taşırken önüne düşer — dnd-kit sortable önizlemesiyle aynı yer.
// Derinlik yeni komşulara göre sınırlanır; başka bloğun çocuklarını "çalmaz".
export function moveBlock(rows, activeId, overId) {
  const a = indexOf(rows, activeId)
  const b = indexOf(rows, overId)
  if (a < 0 || b < 0 || a === b) return { rows }
  const aEnd = subtreeEnd(rows, a)
  if (b > a && b < aEnd) return { rows }
  const block = rows.slice(a, aEnd)
  const rest = [...rows.slice(0, a), ...rows.slice(aEnd)]
  const ob = indexOf(rest, overId)
  const o = b > a ? ob + 1 : ob
  const prev = rest[o - 1]
  const next = rest[o]
  const head = block[0]
  let top
  if (head.type === 'heading') {
    top = 0
  } else {
    const hi = maxDepthAfter(prev)
    if (prev && next && next.depth > prev.depth) {
      // prev ile ilk çocuğu arasına düştü → ilk çocuk ol
      top = Math.min(next.depth, hi)
    } else {
      const lastRel = block[block.length - 1].depth - head.depth
      const lo = next ? Math.max(0, next.depth - lastRel - 1) : 0
      top = Math.min(hi, Math.max(lo, head.depth))
    }
  }
  const moved = top !== head.depth
    ? block.map(r => ({ ...r, depth: Math.max(0, Math.min(MAX_DEPTH, r.depth + top - head.depth)) }))
    : block
  return { rows: normalizeDepths([...rest.slice(0, o), ...moved, ...rest.slice(o)]) }
}

// Alt+↑/↓: bloğu bir komşu satır ötesine taşır
export function nudgeBlock(rows, id, dir) {
  const i = indexOf(rows, id)
  if (i < 0) return { rows }
  const end = subtreeEnd(rows, i)
  const over = dir < 0 ? rows[i - 1] : rows[end]
  if (!over) return { rows }
  return { ...moveBlock(rows, id, over.id), focus: { id, caret: null } }
}

// Sürüklenen bloğun (başı hariç) id'leri — sürükleme sırasında gizlenir
export function descendantIds(rows, id) {
  const i = indexOf(rows, id)
  if (i < 0) return []
  return rows.slice(i + 1, subtreeEnd(rows, i)).map(r => r.id)
}

// ─── ilerleme ─────────────────────────────────────────────────────────────────

export function pageStats(rows) {
  let total = 0
  let done = 0
  for (const r of rows) {
    if (r.type !== 'todo') continue
    total++
    if (r.done) done++
  }
  return { total, done }
}

// Her satır id'si → alt todo ilerlemesi ({done,total}); yalnızca çocuk todo'su olanlar
export function childProgressMap(rows) {
  const map = new Map()
  for (let i = 0; i < rows.length; i++) {
    const end = subtreeEnd(rows, i)
    if (end === i + 1) continue
    let total = 0
    let done = 0
    for (let k = i + 1; k < end; k++) {
      if (rows[k].type !== 'todo') continue
      total++
      if (rows[k].done) done++
    }
    if (total) map.set(rows[i].id, { done, total })
  }
  return map
}

// ─── arşiv ────────────────────────────────────────────────────────────────────

// Tamamen bitmiş todo bloklarını (kendisi + tüm alt todo'ları bitmiş) arşive taşır.
export function archiveCompleted(doc, pageId, now = Date.now()) {
  const page = doc.pages.find(p => p.id === pageId)
  if (!page) return { doc, count: 0 }
  const keep = []
  const moved = []
  const rows = page.rows
  let i = 0
  while (i < rows.length) {
    const r = rows[i]
    const end = subtreeEnd(rows, i)
    const block = rows.slice(i, end)
    const allDone = r.type === 'todo' && r.done && block.every(x => x.type !== 'todo' || x.done)
    if (allDone) {
      for (const x of block) moved.push({ ...x, depth: 0, pageId: page.id, pageTitle: page.title, archivedAt: now })
      i = end
    } else {
      keep.push(r)
      i++
    }
  }
  if (!moved.length) return { doc, count: 0 }
  const pages = doc.pages.map(p => (p.id === pageId ? { ...p, rows: normalizeDepths(keep) } : p))
  const archive = [...doc.archive, ...moved].slice(-NB_LIMITS.archive)
  return { doc: { ...doc, pages, archive }, count: moved.length }
}

// Arşivden tek satırı (işaretsiz değil, olduğu gibi) kendi sayfasının sonuna geri koyar
export function restoreArchived(doc, rowId) {
  const a = doc.archive.find(x => x.id === rowId)
  if (!a) return { doc }
  const target = doc.pages.find(p => p.id === a.pageId) ?? doc.pages[0]
  if (target.rows.length >= NB_LIMITS.rows) return { doc }
  const { pageId: _p, pageTitle: _t, archivedAt: _a, ...row } = a
  const pages = doc.pages.map(p => (p.id === target.id ? { ...p, rows: normalizeDepths([...p.rows, { ...row, depth: 0 }]) } : p))
  return { doc: { ...doc, pages, archive: doc.archive.filter(x => x.id !== rowId) }, pageId: target.id }
}

// ─── sayfalar ─────────────────────────────────────────────────────────────────

export function addPage(doc, title) {
  if (doc.pages.length >= NB_LIMITS.pages) return { doc }
  const page = makePage(title || `Sayfa ${doc.pages.length + 1}`)
  return { doc: { ...doc, pages: [...doc.pages, page] }, pageId: page.id }
}

export function renamePage(doc, pageId, title) {
  const t = cleanTitle(title)
  if (!t) return { doc }
  const page = doc.pages.find(p => p.id === pageId)
  if (!page || page.title === t) return { doc }
  return { doc: { ...doc, pages: doc.pages.map(p => (p.id === pageId ? { ...p, title: t } : p)) } }
}

export function deletePage(doc, pageId) {
  if (doc.pages.length <= 1) return { doc }
  const i = doc.pages.findIndex(p => p.id === pageId)
  if (i < 0) return { doc }
  const pages = doc.pages.filter(p => p.id !== pageId)
  return { doc: { ...doc, pages }, pageId: pages[Math.max(0, i - 1)].id }
}

// Sayfa satırlarına op uygulayıp dokümanı günceller: fn(rows) → { rows, focus? }
export function withPageRows(doc, pageId, fn) {
  const page = doc.pages.find(p => p.id === pageId)
  if (!page) return { doc }
  const res = fn(page.rows)
  if (!res || res.rows === page.rows) return { doc, focus: res?.focus }
  return {
    doc: { ...doc, pages: doc.pages.map(p => (p.id === pageId ? { ...p, rows: res.rows } : p)) },
    focus: res.focus,
  }
}

// ─── filtre ───────────────────────────────────────────────────────────────────

// "Sadece bu oda": eşleşen satırlar + bağlam için soluk ataları → [{ row, dim }]
export function filterForRoom(rows, roomId) {
  const keep = new Array(rows.length).fill(0) // 0 yok, 1 soluk, 2 eşleşme
  const stack = [] // atalar (index), derinliğe göre
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    while (stack.length && rows[stack[stack.length - 1]].depth >= r.depth) stack.pop()
    if (r.roomId === roomId) {
      keep[i] = 2
      for (const s of stack) if (!keep[s]) keep[s] = 1
    }
    stack.push(i)
  }
  const out = []
  for (let i = 0; i < rows.length; i++) if (keep[i]) out.push({ row: rows[i], dim: keep[i] === 1 })
  return out
}

// ─── oda ağacı & uzlaştırma ───────────────────────────────────────────────────

// byId: Map<id, { parentId }>. Kayıp/döngüsel parent zincirinde son geçerli oda kök sayılır.
export function resolveRoot(byId, id) {
  let cur = id
  const seen = new Set()
  while (true) {
    seen.add(cur)
    const p = byId.get(cur)?.parentId
    if (!p || !byId.has(p) || seen.has(p)) return cur
    cur = p
  }
}

// books: [{ rootRoomId, rev, content (doc) }], rooms: [{ id, name, parentId }]
// → { upserts: [{ rootRoomId, rev (mevcut; yeni defterde 0), content }], deletes: [rootRoomId] }
// Kurallar: her satır eklendiği odanın bugünkü kökünün defterine gider; kökü artık
// kök olmayan defter dağıtılıp silinir; silinmiş odaların satırları defterde kalır
// (defter canlı kökse) ya da en çok satır devralan köke gider. İdempotent.
export function planNotebookReconcile(books, rooms) {
  const byId = new Map(rooms.map(r => [r.id, r]))
  const isLiveRoot = (id) => byId.has(id) && !byId.get(id).parentId
  const rootOf = (id) => (id && byId.has(id) ? resolveRoot(byId, id) : null)
  const sorted = [...books].sort((x, y) => (x.rootRoomId < y.rootRoomId ? -1 : x.rootRoomId > y.rootRoomId ? 1 : 0))

  const out = new Map() // root → { doc, rev, changed, existed }
  const deletes = []

  // 1) canlı kök defterler kendi kalan satırlarıyla başlar
  for (const book of sorted) {
    if (!isLiveRoot(book.rootRoomId)) continue
    out.set(book.rootRoomId, {
      doc: { ...book.content, pages: book.content.pages.map(p => ({ ...p, rows: [] })), archive: [...book.content.archive] },
      rev: book.rev,
      changed: false,
      existed: true,
      ids: new Set(book.content.archive.map(a => a.id)),
    })
  }

  const target = (root) => {
    let t = out.get(root)
    if (!t) {
      t = { doc: { version: 1, pages: [], archive: [] }, rev: 0, changed: true, existed: false, ids: new Set() }
      out.set(root, t)
    }
    return t
  }
  const pageIn = (t, page) => {
    let p = t.doc.pages.find(x => x.id === page.id)
    if (!p) {
      const title = page.title.trim().toLocaleLowerCase('tr')
      p = t.doc.pages.find(x => x.title.trim().toLocaleLowerCase('tr') === title)
    }
    if (!p) {
      p = { ...page, rows: [] }
      t.doc.pages.push(p)
    }
    return p
  }

  // hedefleri hesapla
  const plans = sorted.map(book => {
    const selfLive = isLiveRoot(book.rootRoomId)
    const counts = new Map()
    const dests = book.content.pages.map(p => p.rows.map(r => {
      const d = rootOf(r.roomId)
      if (d) counts.set(d, (counts.get(d) ?? 0) + 1)
      return d
    }))
    let heir = null
    if (selfLive) heir = book.rootRoomId
    else {
      let best = -1
      for (const [root, n] of [...counts.entries()].sort((x, y) => (x[0] < y[0] ? -1 : 1))) {
        if (n > best) { best = n; heir = root }
      }
      if (!heir) heir = rootOf(book.rootRoomId)
    }
    return { book, selfLive, dests, heir }
  })

  // 2) kalan satırlar (sıra korunur) — önce defterin kendi satırları
  for (const { book, selfLive, dests } of plans) {
    if (!selfLive) continue
    const t = out.get(book.rootRoomId)
    book.content.pages.forEach((page, pi) => {
      const p = t.doc.pages.find(x => x.id === page.id)
      page.rows.forEach((row, ri) => {
        const d = dests[pi][ri] ?? book.rootRoomId
        if (d === book.rootRoomId) {
          p.rows.push(row)
          t.ids.add(row.id)
        } else t.changed = true
      })
    })
  }

  // 3) taşınan satırlar + dağıtılan defterler
  for (const { book, selfLive, dests, heir } of plans) {
    book.content.pages.forEach((page, pi) => {
      page.rows.forEach((row, ri) => {
        const d = dests[pi][ri] ?? heir
        if (!d || (selfLive && d === book.rootRoomId)) return
        const t = target(d)
        // Yarım kalmış önceki uzlaştırmadan kalan kopyayı tekrar ekleme
        if (t.ids.has(row.id)) return
        pageIn(t, page).rows.push(row)
        t.ids.add(row.id)
        t.changed = true
      })
    })
    if (!selfLive) {
      const fresh = heir ? book.content.archive.filter(a => !out.get(heir)?.ids.has(a.id)) : []
      if (fresh.length) {
        const t = target(heir)
        for (const a of fresh) t.ids.add(a.id)
        t.doc.archive = [...t.doc.archive, ...fresh].slice(-NB_LIMITS.archive)
        t.changed = true
      }
      deletes.push(book.rootRoomId)
    }
  }

  const upserts = []
  for (const [root, t] of out) {
    if (!t.changed) continue
    const pages = t.doc.pages.length ? t.doc.pages : [makePage('Yapılacaklar')]
    upserts.push({
      rootRoomId: root,
      rev: t.rev,
      existed: t.existed,
      content: { version: 1, pages: pages.map(p => ({ ...p, rows: normalizeDepths(p.rows) })), archive: t.doc.archive },
    })
  }
  return { upserts, deletes }
}
