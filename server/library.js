// Kitaplık (all-books) API'si: Seyir Defteri mobil uygulamasının db/database.ts sorgularının
// sunucu karşılığı. Yanıtlar mobil tiplerle aynı alan adlarını taşır (snake_case), istemci
// (src/pages/library/api.js) mobildeki fonksiyonların birebir karşılığını çağırır.
import fs from 'fs'
import path from 'path'
import { randomBytes } from 'crypto'
import multer from 'multer'

import {
  BINDINGS,
  categoryNameTaken,
  cleanCategoryName,
  FIRST_PAGE_COUNT,
  GENERAL_CATEGORY_ID,
  HABIT_LAYOUTS,
  KIND_DEFAULTS,
  MAX_TITLE,
  nextShelf,
  NOTEBOOK_KINDS,
  PAPER_STYLES,
} from '../src/pages/library/model.js'

// Mobildeki datetime('now', 'localtime') biçimi: "YYYY-AA-GG SS:DD:ss"
function stamp(date) {
  const d = date instanceof Date ? date : new Date(date)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function bookOut(b) {
  return {
    id: b.id,
    title: b.title,
    color: b.color,
    created_at: stamp(b.createdAt),
    kind: b.kind,
    binding: b.binding,
    paper: b.paper,
    year: b.year,
    weekly_pages: b.weeklyPages,
    month_goals: b.monthGoals,
    month_review: b.monthReview,
    habits: b.habits,
    page_count: b.pageCount,
    category_id: b.categoryId,
    shelf: b.shelf,
    position: b.position,
  }
}

function noteOut(n) {
  return {
    id: n.id,
    content: n.content,
    time: n.time,
    highlights: n.highlights,
    inks: n.inks,
    times: n.times,
    position: n.position,
    created_at: stamp(n.createdAt),
    updated_at: stamp(n.updatedAt),
  }
}

const COLOR_KEY = /^[a-z]{2,20}$/
const TIME = /^\d{2}:\d{2}$/
const MAX_NOTE = 1_000_000
const MAX_MARKS = 200_000

function int(value) {
  const n = Number(value)
  return Number.isInteger(n) ? n : null
}

function cleanTitle(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE)
}

// Oluşturma ekranının ayarları; geçersiz alan → hata
function parseSettings(body, { create }) {
  const title = cleanTitle(body?.title)
  if (!title) return { error: 'Defterin adı boş olamaz' }
  const color = typeof body.color === 'string' && COLOR_KEY.test(body.color) ? body.color : 'ink'
  const kind = create ? body.kind : undefined
  if (create && !NOTEBOOK_KINDS.includes(kind)) return { error: 'Geçersiz defter türü' }
  const paper = PAPER_STYLES.includes(body.paper) ? body.paper : null
  const binding = BINDINGS.includes(body.binding) ? body.binding : null
  const category = int(body.category_id) ?? GENERAL_CATEGORY_ID
  const out = { title, color, paper, binding, category }
  if (create) {
    out.kind = kind
    out.binding = KIND_DEFAULTS[kind].binding
    out.paper = paper ?? KIND_DEFAULTS[kind].paper
    const year = int(body.year)
    out.year = kind === 'pdf' ? null : year
    const flag = (v, d) => (v === 0 || v === 1 ? v : d)
    out.weeklyPages = flag(body.weekly_pages, 1)
    out.monthGoals = flag(body.month_goals, 1)
    out.monthReview = flag(body.month_review, 1)
    out.habits = HABIT_LAYOUTS.includes(body.habits) ? body.habits : 'none'
  }
  return { data: out }
}

export function registerLibraryRoutes(app, prisma) {
  const R = '/api/library'

  // Genel satırı (migration ekler; DB elle temizlenmişse yeniden açılır)
  async function ensureGeneral(db = prisma) {
    const row = await db.shelfCategory.findUnique({ where: { id: GENERAL_CATEGORY_ID } })
    if (!row) await db.shelfCategory.create({ data: { id: GENERAL_CATEGORY_ID, name: 'Genel', position: 0 } })
  }

  // Kategoriler sekmelerdeki sırasıyla; Genel hep en baştadır
  async function categories(db = prisma) {
    await ensureGeneral(db)
    const rows = await db.shelfCategory.findMany({ orderBy: [{ position: 'asc' }, { id: 'asc' }] })
    const list = rows.map(({ id, name, position }) => ({ id, name, position }))
    return [...list.filter((c) => c.id === GENERAL_CATEGORY_ID), ...list.filter((c) => c.id !== GENERAL_CATEGORY_ID)]
  }

  // Silinmiş (ya da hiç olmamış) bir kategori Genel'e düşer
  async function existingCategory(db, id) {
    const row = await db.shelfCategory.findUnique({ where: { id } })
    return row?.id ?? GENERAL_CATEGORY_ID
  }

  // Kategorinin raflarında her rafta kaç defter var ve sıradaki defterin sırası
  async function shelfFill(db, categoryId) {
    const rows = await db.shelfBook.groupBy({
      by: ['shelf'],
      where: { categoryId },
      _count: { _all: true },
      _max: { position: true },
    })
    const length = rows.reduce((max, row) => Math.max(max, row.shelf + 1), 0)
    const counts = Array(length).fill(0)
    const next = Array(length).fill(0)
    for (const row of rows) {
      counts[row.shelf] = row._count._all
      next[row.shelf] = (row._max.position ?? -1) + 1
    }
    return { counts, next }
  }

  async function nextSlot(db, categoryId) {
    const { counts, next } = await shelfFill(db, categoryId)
    const shelf = nextShelf(counts)
    return { shelf, position: next[shelf] ?? 0 }
  }

  // Defter başka kategoriye geçer, o kategorinin raflarında ilk boş yere konur. Yeni yeri döner
  // (kategori değişmediyse null).
  async function setBookCategory(db, id, category) {
    const current = await db.shelfBook.findUnique({ where: { id } })
    const categoryId = await existingCategory(db, category)
    if (!current || current.categoryId === categoryId) return null
    const slot = await nextSlot(db, categoryId)
    await db.shelfBook.update({ where: { id }, data: { categoryId, ...slot } })
    return { category_id: categoryId, ...slot }
  }

  // Migration uygulanmamışsa (Shelf* tabloları yok) her istekte yığın basılmaz: tek satır uyarı,
  // istemciye ne yapılacağını söyleyen 503
  let warnedMissing = false
  const wrap = (fn) => async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      const missingTable = err?.code === 'P2021' || /no such table/i.test(String(err?.message))
      if (missingTable) {
        if (!warnedMissing) {
          warnedMissing = true
          console.warn('[library] Kitaplık tabloları yok — `npx prisma migrate deploy` çalıştırın (20261116000000_add_shelf_library)')
        }
        return res.status(503).json({ error: 'Veritabanı güncel değil: npx prisma migrate deploy' })
      }
      console.error('[library]', req.method, req.path, err?.message ?? err)
      res.status(500).json({ error: 'Kitaplık işlemi başarısız' })
    }
  }

  // ─── Kategoriler ────────────────────────────────────────────────────────────
  app.get(`${R}/categories`, wrap(async (req, res) => {
    res.json(await categories())
  }))

  // Her kategoride kaç defter var: { [id]: sayı }
  app.get(`${R}/categories/counts`, wrap(async (req, res) => {
    const rows = await prisma.shelfBook.groupBy({ by: ['categoryId'], _count: { _all: true } })
    res.json(Object.fromEntries(rows.map((r) => [r.categoryId, r._count._all])))
  }))

  // Yeni kategori sekmelerin sonuna eklenir
  app.post(`${R}/categories`, wrap(async (req, res) => {
    const name = cleanCategoryName(req.body?.name)
    if (!name) return res.status(400).json({ error: 'Kategori adı boş olamaz' })
    const list = await categories()
    if (categoryNameTaken(list, name)) return res.status(409).json({ error: `“${name}” zaten var` })
    const last = await prisma.shelfCategory.aggregate({ _max: { position: true } })
    const row = await prisma.shelfCategory.create({ data: { name, position: (last._max.position ?? 0) + 1 } })
    res.json({ id: row.id })
  }))

  app.patch(`${R}/categories/:id`, wrap(async (req, res) => {
    const id = int(req.params.id)
    if (id === GENERAL_CATEGORY_ID) return res.json({ ok: true })
    const name = cleanCategoryName(req.body?.name)
    if (!name) return res.status(400).json({ error: 'Kategori adı boş olamaz' })
    const list = await categories()
    if (!list.some((c) => c.id === id)) return res.status(404).json({ error: 'Kategori bulunamadı' })
    if (categoryNameTaken(list, name, id)) return res.status(409).json({ error: `“${name}” zaten var` })
    await prisma.shelfCategory.update({ where: { id }, data: { name } })
    res.json({ ok: true })
  }))

  // Sekmelerin yeni sırası (Genel hariç, soldan sağa id'ler)
  app.put(`${R}/categories/order`, wrap(async (req, res) => {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(int).filter((x) => x !== null) : null
    if (!ids) return res.status(400).json({ error: 'Geçersiz sıra' })
    await prisma.$transaction(
      ids.filter((id) => id !== GENERAL_CATEGORY_ID)
        .map((id, i) => prisma.shelfCategory.updateMany({ where: { id }, data: { position: i + 1 } })),
    )
    res.json({ ok: true })
  }))

  // Kategori silinir; defterleri Genel'in raflarına, oradaki defterlerin arkasına dizilir
  app.delete(`${R}/categories/:id`, wrap(async (req, res) => {
    const id = int(req.params.id)
    if (id === null || id === GENERAL_CATEGORY_ID) return res.json({ ok: true })
    await prisma.$transaction(async (tx) => {
      await ensureGeneral(tx)
      const books = await tx.shelfBook.findMany({
        where: { categoryId: id },
        orderBy: [{ shelf: 'asc' }, { position: 'asc' }, { id: 'asc' }],
        select: { id: true },
      })
      const { counts, next } = await shelfFill(tx, GENERAL_CATEGORY_ID)
      for (const book of books) {
        const shelf = nextShelf(counts)
        await tx.shelfBook.update({
          where: { id: book.id },
          data: { categoryId: GENERAL_CATEGORY_ID, shelf, position: next[shelf] ?? 0 },
        })
        counts[shelf] = (counts[shelf] ?? 0) + 1
        next[shelf] = (next[shelf] ?? 0) + 1
      }
      await tx.shelfCategory.deleteMany({ where: { id } })
    })
    res.json({ ok: true })
  }))

  // ─── Defterler ──────────────────────────────────────────────────────────────
  app.get(`${R}/books`, wrap(async (req, res) => {
    const rows = await prisma.shelfBook.findMany({
      orderBy: [{ shelf: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    })
    res.json(rows.map(bookOut))
  }))

  // Kitaplıkta yer değiştiren defterlerin yeni düzeni: shelves[raf] o raftaki defterlerin soldan
  // sağa id'leri
  app.put(`${R}/books/shelves`, wrap(async (req, res) => {
    const shelves = req.body?.shelves
    if (!Array.isArray(shelves) || !shelves.every(Array.isArray)) {
      return res.status(400).json({ error: 'Geçersiz raf düzeni' })
    }
    const ops = []
    shelves.forEach((ids, shelf) => ids.forEach((raw, position) => {
      const id = int(raw)
      if (id !== null) ops.push(prisma.shelfBook.updateMany({ where: { id }, data: { shelf, position } }))
    }))
    await prisma.$transaction(ops)
    res.json({ ok: true })
  }))

  app.get(`${R}/books/:id`, wrap(async (req, res) => {
    const row = await prisma.shelfBook.findUnique({ where: { id: int(req.params.id) ?? -1 } })
    res.json(row ? bookOut(row) : null)
  }))

  // Yeni defter, kategorisinin raflarında ilk boş yere konur. Kategori bu arada silinmişse Genel'e.
  app.post(`${R}/books`, wrap(async (req, res) => {
    const parsed = parseSettings(req.body, { create: true })
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    const { category, ...data } = parsed.data
    const row = await prisma.$transaction(async (tx) => {
      await ensureGeneral(tx)
      const categoryId = await existingCategory(tx, category)
      const slot = await nextSlot(tx, categoryId)
      return tx.shelfBook.create({ data: { ...data, pageCount: FIRST_PAGE_COUNT, categoryId, ...slot } })
    })
    res.json({ id: row.id })
  }))

  // Defterin türü ve ajandanın sayfa düzeni sonradan değişmez; adı, kapağı, kâğıdı ve kategorisi
  // değişir. Başka kategoriye geçen defter o kategorinin raflarında ilk boş yere konur.
  app.patch(`${R}/books/:id`, wrap(async (req, res) => {
    const id = int(req.params.id)
    const book = id !== null && await prisma.shelfBook.findUnique({ where: { id } })
    if (!book) return res.status(404).json({ error: 'Defter bulunamadı' })
    const parsed = parseSettings(req.body, { create: false })
    if (parsed.error) return res.status(400).json({ error: parsed.error })
    const { title, color, binding, paper, category } = parsed.data
    // Kâğıt türün kâğıtları arasında kalır: PDF'te a4/letter, not defterinde çizgili/kareli...
    const docPaper = (p) => p === 'a4' || p === 'letter'
    const keepPaper = !paper || docPaper(paper) !== docPaper(book.paper) ? book.paper : paper
    await prisma.$transaction(async (tx) => {
      await tx.shelfBook.update({
        where: { id },
        data: { title, color, binding: binding ?? book.binding, paper: keepPaper },
      })
      await setBookCategory(tx, id, category)
    })
    res.json(bookOut(await prisma.shelfBook.findUnique({ where: { id } })))
  }))

  app.put(`${R}/books/:id/category`, wrap(async (req, res) => {
    const id = int(req.params.id)
    const category = int(req.body?.category_id)
    if (id === null || category === null) return res.status(400).json({ error: 'Geçersiz kategori' })
    const slot = await prisma.$transaction((tx) => setBookCategory(tx, id, category))
    res.json(slot)
  }))

  app.put(`${R}/books/:id/page-count`, wrap(async (req, res) => {
    const id = int(req.params.id)
    const count = int(req.body?.count)
    if (id === null || count === null || count < 1) return res.status(400).json({ error: 'Geçersiz sayfa sayısı' })
    await prisma.shelfBook.updateMany({ where: { id }, data: { pageCount: count } })
    res.json({ ok: true })
  }))

  // Defter, içindeki bütün notlarla birlikte silinir
  app.delete(`${R}/books/:id`, wrap(async (req, res) => {
    const id = int(req.params.id)
    if (id === null) return res.status(400).json({ error: 'Geçersiz defter' })
    await prisma.$transaction([
      prisma.shelfNote.deleteMany({ where: { bookId: id } }),
      prisma.shelfPageTitle.deleteMany({ where: { bookId: id } }),
      prisma.shelfFavorite.deleteMany({ where: { bookId: id } }),
      prisma.shelfDrawing.deleteMany({ where: { bookId: id } }),
      prisma.shelfBook.deleteMany({ where: { id } }),
    ])
    res.json({ ok: true })
  }))

  // ─── Sayfalar ve bloklar (not defteri / PDF: kind 'page', ref = sayfa numarası) ─────────────
  function pageOf(req) {
    const bookId = int(req.params.id)
    const ref = int(req.params.ref)
    const kind = typeof req.query.kind === 'string' && /^[a-z-]{1,20}$/.test(req.query.kind) ? req.query.kind : 'page'
    return bookId === null || ref === null ? null : { bookId, kind, ref }
  }

  app.get(`${R}/books/:id/pages/:ref/notes`, wrap(async (req, res) => {
    const page = pageOf(req)
    if (!page) return res.status(400).json({ error: 'Geçersiz sayfa' })
    const rows = await prisma.shelfNote.findMany({
      where: page,
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    })
    res.json(rows.map(noteOut))
  }))

  // Yeni blok sayfanın en altına gelir (Enter ile bölünen blok sonra araya taşınır)
  app.post(`${R}/books/:id/pages/:ref/notes`, wrap(async (req, res) => {
    const page = pageOf(req)
    if (!page) return res.status(400).json({ error: 'Geçersiz sayfa' })
    const row = await prisma.$transaction(async (tx) => {
      const last = await tx.shelfNote.aggregate({ where: page, _max: { position: true } })
      return tx.shelfNote.create({ data: { ...page, position: (last._max.position ?? -1) + 1 } })
    })
    res.json(noteOut(row))
  }))

  // Sürüklenip yer değiştiren notların yeni sırası: ids sayfadaki notların yukarıdan aşağı sırası
  app.put(`${R}/books/:id/pages/:ref/order`, wrap(async (req, res) => {
    const page = pageOf(req)
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(int).filter((x) => x !== null) : null
    if (!page || !ids) return res.status(400).json({ error: 'Geçersiz sıra' })
    await prisma.$transaction(ids.map((id, i) =>
      prisma.shelfNote.updateMany({ where: { id, bookId: page.bookId }, data: { position: i } })))
    res.json({ ok: true })
  }))

  // Sayfanın sonundaki boş bloklar silinir; yazılı blokların arasındaki boş bloklar boşluk olarak
  // kalır. Sayfada yazılı blok yoksa hepsi silinir.
  app.delete(`${R}/books/:id/pages/:ref/empty-notes`, wrap(async (req, res) => {
    const page = pageOf(req)
    if (!page) return res.status(400).json({ error: 'Geçersiz sayfa' })
    const rows = await prisma.shelfNote.findMany({ where: page, select: { id: true, content: true, position: true } })
    const lastWritten = rows.filter((n) => n.content.trim() !== '').reduce((m, n) => Math.max(m, n.position), -1)
    const ids = rows.filter((n) => n.content.trim() === '' && n.position > lastWritten).map((n) => n.id)
    if (ids.length) await prisma.shelfNote.deleteMany({ where: { id: { in: ids } } })
    res.json({ deleted: ids.length })
  }))

  app.put(`${R}/notes/:noteId`, wrap(async (req, res) => {
    const id = int(req.params.noteId)
    const b = req.body ?? {}
    const str = (v, max) => (typeof v === 'string' && v.length <= max ? v : null)
    const content = str(b.content, MAX_NOTE)
    const highlights = str(b.highlights ?? '', MAX_MARKS)
    const inks = str(b.inks ?? '', MAX_MARKS)
    const times = str(b.times ?? '', MAX_MARKS)
    const time = b.time == null ? null : TIME.test(b.time) ? b.time : undefined
    if (id === null || content === null || highlights === null || inks === null || times === null || time === undefined) {
      return res.status(400).json({ error: 'Geçersiz blok' })
    }
    const r = await prisma.shelfNote.updateMany({ where: { id }, data: { content, highlights, inks, times, time } })
    if (!r.count) return res.status(404).json({ error: 'Blok bulunamadı' })
    res.json({ ok: true })
  }))

  app.delete(`${R}/notes/:noteId`, wrap(async (req, res) => {
    const id = int(req.params.noteId)
    if (id !== null) await prisma.shelfNote.deleteMany({ where: { id } })
    res.json({ ok: true })
  }))

  // Defterin yazılı sayfaları (okuma modu, sayfa listesi): { kind, ref }
  app.get(`${R}/books/:id/written`, wrap(async (req, res) => {
    const bookId = int(req.params.id)
    if (bookId === null) return res.status(400).json({ error: 'Geçersiz defter' })
    const [rows, drawings] = await Promise.all([
      prisma.shelfNote.findMany({ where: { bookId }, select: { kind: true, ref: true, content: true } }),
      prisma.shelfDrawing.findMany({ where: { bookId, NOT: { strokes: '' } }, select: { kind: true, pageId: true } }),
    ])
    const seen = new Set()
    const out = []
    const add = (kind, ref) => {
      const key = `${kind}:${ref}`
      if (seen.has(key)) return
      seen.add(key)
      out.push({ kind, at: null, ref })
    }
    for (const r of rows) if (r.content.trim() !== '') add(r.kind, r.ref)
    // Yalnızca çizilmiş sayfa da yazılıdır
    for (const d of drawings) add(d.kind, d.pageId)
    res.json(out)
  }))

  // Not defterinin yazılı sayfalarındaki notlar, sayfa sırasıyla (sayfalarda arama için)
  app.get(`${R}/books/:id/page-texts`, wrap(async (req, res) => {
    const bookId = int(req.params.id)
    if (bookId === null) return res.status(400).json({ error: 'Geçersiz defter' })
    const rows = await prisma.shelfNote.findMany({
      where: { bookId, kind: 'page' },
      orderBy: [{ ref: 'asc' }, { position: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
      select: { ref: true, content: true },
    })
    res.json(rows.filter((r) => r.content.trim() !== ''))
  }))

  // Sayfa başlıkları: { [ref]: başlık }
  app.get(`${R}/books/:id/titles`, wrap(async (req, res) => {
    const bookId = int(req.params.id)
    if (bookId === null) return res.status(400).json({ error: 'Geçersiz defter' })
    const rows = await prisma.shelfPageTitle.findMany({ where: { bookId } })
    res.json(Object.fromEntries(rows.map((r) => [r.ref, r.title])))
  }))

  app.get(`${R}/books/:id/pages/:ref/title`, wrap(async (req, res) => {
    const page = pageOf(req)
    if (!page) return res.status(400).json({ error: 'Geçersiz sayfa' })
    const row = await prisma.shelfPageTitle.findUnique({ where: { bookId_ref: { bookId: page.bookId, ref: page.ref } } })
    res.json({ title: row?.title ?? '' })
  }))

  // Silinen (boşaltılan) başlığın satırı kalkar
  app.put(`${R}/books/:id/pages/:ref/title`, wrap(async (req, res) => {
    const page = pageOf(req)
    const title = typeof req.body?.title === 'string' ? req.body.title.slice(0, 500) : null
    if (!page || title === null) return res.status(400).json({ error: 'Geçersiz başlık' })
    const where = { bookId_ref: { bookId: page.bookId, ref: page.ref } }
    if (title.trim() === '') {
      await prisma.shelfPageTitle.deleteMany({ where: { bookId: page.bookId, ref: page.ref } })
    } else {
      await prisma.shelfPageTitle.upsert({ where, create: { bookId: page.bookId, ref: page.ref, title }, update: { title } })
    }
    res.json({ ok: true })
  }))

  // number. sayfanın yerine boş bir sayfa girer: o sayfa ve ardındakiler yazıları ve başlıklarıyla
  // birer sayfa ileri kayar. Başlıkların numarası eşsiz; kayan numaralar çakışmasın diye önce
  // eksiye çevrilir, sonra yerine konur.
  app.post(`${R}/books/:id/pages/:ref/insert`, wrap(async (req, res) => {
    const page = pageOf(req)
    if (!page) return res.status(400).json({ error: 'Geçersiz sayfa' })
    const { bookId, ref } = page
    await prisma.$transaction([
      prisma.$executeRaw`UPDATE "ShelfNote" SET "ref" = "ref" + 1 WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "ref" >= ${ref}`,
      prisma.$executeRaw`UPDATE "ShelfPageTitle" SET "ref" = -("ref" + 1) WHERE "bookId" = ${bookId} AND "ref" >= ${ref}`,
      prisma.$executeRaw`UPDATE "ShelfPageTitle" SET "ref" = -"ref" WHERE "bookId" = ${bookId} AND "ref" < 0`,
      prisma.$executeRaw`UPDATE "ShelfFavorite" SET "pageId" = -("pageId" + 1) WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "pageId" >= ${ref}`,
      prisma.$executeRaw`UPDATE "ShelfFavorite" SET "pageId" = -"pageId" WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "pageId" < 0`,
      prisma.$executeRaw`UPDATE "ShelfDrawing" SET "pageId" = -("pageId" + 1) WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "pageId" >= ${ref}`,
      prisma.$executeRaw`UPDATE "ShelfDrawing" SET "pageId" = -"pageId" WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "pageId" < 0`,
      prisma.$executeRaw`UPDATE "ShelfBook" SET "pageCount" = "pageCount" + 1 WHERE "id" = ${bookId}`,
    ])
    res.json({ ok: true })
  }))

  // number. sayfa yazıları ve başlığıyla çıkar; ardındaki sayfalar birer sayfa geri kayar. Defterde
  // en az bir sayfa kalır. Silinen yazıların içerikleri döner (eklerinin dosyaları ayrıca silinir).
  app.delete(`${R}/books/:id/pages/:ref`, wrap(async (req, res) => {
    const page = pageOf(req)
    if (!page) return res.status(400).json({ error: 'Geçersiz sayfa' })
    const { bookId, ref } = page
    const rows = await prisma.shelfNote.findMany({ where: { bookId, kind: 'page', ref }, select: { content: true } })
    await prisma.$transaction([
      prisma.$executeRaw`DELETE FROM "ShelfNote" WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "ref" = ${ref}`,
      prisma.$executeRaw`UPDATE "ShelfNote" SET "ref" = "ref" - 1 WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "ref" > ${ref}`,
      prisma.$executeRaw`DELETE FROM "ShelfPageTitle" WHERE "bookId" = ${bookId} AND "ref" = ${ref}`,
      prisma.$executeRaw`UPDATE "ShelfPageTitle" SET "ref" = -("ref" - 1) WHERE "bookId" = ${bookId} AND "ref" > ${ref}`,
      prisma.$executeRaw`UPDATE "ShelfPageTitle" SET "ref" = -"ref" WHERE "bookId" = ${bookId} AND "ref" < 0`,
      prisma.$executeRaw`DELETE FROM "ShelfFavorite" WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "pageId" = ${ref}`,
      prisma.$executeRaw`UPDATE "ShelfFavorite" SET "pageId" = -("pageId" - 1) WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "pageId" > ${ref}`,
      prisma.$executeRaw`UPDATE "ShelfFavorite" SET "pageId" = -"pageId" WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "pageId" < 0`,
      prisma.$executeRaw`DELETE FROM "ShelfDrawing" WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "pageId" = ${ref}`,
      prisma.$executeRaw`UPDATE "ShelfDrawing" SET "pageId" = -("pageId" - 1) WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "pageId" > ${ref}`,
      prisma.$executeRaw`UPDATE "ShelfDrawing" SET "pageId" = -"pageId" WHERE "bookId" = ${bookId} AND "kind" = 'page' AND "pageId" < 0`,
      prisma.$executeRaw`UPDATE "ShelfBook" SET "pageCount" = MAX(1, "pageCount" - 1) WHERE "id" = ${bookId}`,
    ])
    res.json({ contents: rows.map((r) => r.content) })
  }))

  // ─── Ayraçlar ─────────────────────────────────────────────────────────────────
  app.get(`${R}/books/:id/pages/:ref/favorite`, wrap(async (req, res) => {
    const page = pageOf(req)
    if (!page) return res.status(400).json({ error: 'Geçersiz sayfa' })
    const row = await prisma.shelfFavorite.findFirst({ where: { bookId: page.bookId, kind: page.kind, pageId: page.ref } })
    res.json({ favorite: !!row })
  }))

  app.put(`${R}/books/:id/pages/:ref/favorite`, wrap(async (req, res) => {
    const page = pageOf(req)
    if (!page) return res.status(400).json({ error: 'Geçersiz sayfa' })
    const where = { bookId: page.bookId, kind: page.kind, pageId: page.ref }
    if (req.body?.favorite) {
      await prisma.shelfFavorite.upsert({ where: { bookId_kind_pageId: where }, create: where, update: {} })
    } else {
      await prisma.shelfFavorite.deleteMany({ where })
    }
    res.json({ ok: true })
  }))

  // Bütün ayraçlar (Ayraçlar sekmesi): defter, sayfa, başlık ya da ilk yazı
  app.get(`${R}/favorites`, wrap(async (req, res) => {
    const rows = await prisma.shelfFavorite.findMany({ orderBy: { createdAt: 'desc' } })
    res.json(rows.map((f) => ({ id: f.id, notebook_id: f.bookId, kind: f.kind, page_id: f.pageId, created_at: stamp(f.createdAt) })))
  }))

  // ─── Çizimler ─────────────────────────────────────────────────────────────────
  app.get(`${R}/books/:id/pages/:ref/drawing`, wrap(async (req, res) => {
    const page = pageOf(req)
    if (!page) return res.status(400).json({ error: 'Geçersiz sayfa' })
    const row = await prisma.shelfDrawing.findFirst({ where: { bookId: page.bookId, kind: page.kind, pageId: page.ref } })
    res.json({ strokes: row?.strokes ?? '' })
  }))

  // Boş çizim satırı silinir
  app.put(`${R}/books/:id/pages/:ref/drawing`, wrap(async (req, res) => {
    const page = pageOf(req)
    const strokes = typeof req.body?.strokes === 'string' ? req.body.strokes : null
    if (!page || strokes === null || strokes.length > 4_000_000) return res.status(400).json({ error: 'Geçersiz çizim' })
    const where = { bookId: page.bookId, kind: page.kind, pageId: page.ref }
    if (strokes === '') await prisma.shelfDrawing.deleteMany({ where })
    else await prisma.shelfDrawing.upsert({ where: { bookId_kind_pageId: where }, create: { ...where, strokes }, update: { strokes } })
    res.json({ ok: true })
  }))

  // ─── Ekler (resim ve dosya) ───────────────────────────────────────────────────
  // Mobilde uygulamanın belge klasöründeki note-images/; burada public/uploads/shelf/ (/uploads/shelf/
  // adresinden sunulur). Blokta yalnızca dosya adı saklanır. Her dosyayı tek bir blok kullanır:
  // kopyalanan ya da çoğaltılan blok ekinin kopyasını alır, blok silinince eki de silinir.
  const SHELF_DIR = path.join('public', 'uploads', 'shelf')
  fs.mkdirSync(SHELF_DIR, { recursive: true })
  const NAME = /^(img|file)-[A-Za-z0-9._-]{1,120}$/
  const freshName = (kind, ext) => `${kind}-${Date.now()}-${randomBytes(3).toString('hex')}${ext}`
  const safeExt = (name) => {
    const ext = path.extname(String(name ?? '')).toLowerCase()
    return /^\.[a-z0-9]{1,10}$/.test(ext) ? ext : ''
  }

  const attachmentUpload = multer({
    // Dosya adları UTF-8 gelir (Türkçe harfler bozulmasın)
    defParamCharset: 'utf8',
    limits: { fileSize: 50 * 1024 * 1024 },
    storage: multer.diskStorage({
      destination: (req, file, cb) => cb(null, SHELF_DIR),
      filename: (req, file, cb) => {
        const image = file.mimetype.startsWith('image/')
        cb(null, freshName(image ? 'img' : 'file', safeExt(file.originalname) || (image ? '.jpg' : '')))
      },
    }),
  })

  app.post(`${R}/attachments`, attachmentUpload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'Dosya yok' })
    res.json({ name: req.file.filename, label: req.file.originalname, mime: req.file.mimetype, size: req.file.size })
  })

  // Ekin dosyası yeni adla çoğaltılır; dosyası bulunamazsa 404 (ek eski adıyla kalır)
  app.post(`${R}/attachments/:name/copy`, wrap(async (req, res) => {
    const { name } = req.params
    if (!NAME.test(name)) return res.status(400).json({ error: 'Geçersiz ek' })
    const source = path.join(SHELF_DIR, name)
    if (!fs.existsSync(source)) return res.status(404).json({ error: 'Ek bulunamadı' })
    const copy = freshName(name.startsWith('img-') ? 'img' : 'file', safeExt(name))
    await fs.promises.copyFile(source, path.join(SHELF_DIR, copy))
    res.json({ name: copy })
  }))

  app.delete(`${R}/attachments/:name`, wrap(async (req, res) => {
    const { name } = req.params
    if (!NAME.test(name)) return res.status(400).json({ error: 'Geçersiz ek' })
    await fs.promises.unlink(path.join(SHELF_DIR, name)).catch(() => {})
    res.json({ ok: true })
  }))
}
