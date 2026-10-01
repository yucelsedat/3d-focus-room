// Oda Defteri saf modelinin doğrulaması: node scripts/verify-notebook-model.mjs
// Exit 0 = tüm kontroller geçti.
import assert from 'node:assert/strict'
import * as M from '../src/utils/notebookModel.js'

let passed = 0
const test = (name, fn) => {
  try {
    fn()
    passed++
  } catch (err) {
    console.error(`✗ ${name}\n`, err)
    process.exit(1)
  }
}

// Kısa satır kurucu: r('a', 0, 'todo') — id = metin
const r = (text, depth = 0, type = 'todo', extra = {}) =>
  M.makeRow({ id: text, text, depth, type, roomId: 'R', ...extra })
const shape = (rows) => rows.map(x => `${'  '.repeat(x.depth)}${x.id}`)
const valid = (rows) => {
  let prev = null
  for (const x of rows) {
    assert.ok(x.depth >= 0 && x.depth <= M.NB_LIMITS.depth, `depth range ${x.id}`)
    if (x.type === 'heading') assert.equal(x.depth, 0, `heading depth ${x.id}`)
    assert.ok(x.depth <= M.maxDepthAfter(prev), `depth jump ${x.id}`)
    prev = x
  }
}

// ─── sanitize ────────────────────────────────────────────────────────────────
test('sanitize: bozuk girdi → null', () => {
  assert.equal(M.sanitizeNotebook(null), null)
  assert.equal(M.sanitizeNotebook({}), null)
  assert.equal(M.sanitizeNotebook({ pages: 'x' }), null)
})
test('sanitize: derinlik, seed, tip, tekrar id, satır sonu', () => {
  const doc = M.sanitizeNotebook({
    pages: [{ id: 'p', title: '  Başlık\n ', rows: [
      { id: 'a', type: 'todo', text: 'x\ny', depth: 5, seed: 0, done: true },
      { id: 'a', type: 'weird', text: 'z', depth: 2 },
      { id: 'h', type: 'heading', text: 'H', depth: 2, done: true },
      'garbage',
    ] }],
  })
  const [a, b, h] = doc.pages[0].rows
  assert.equal(doc.pages[0].title, 'Başlık')
  assert.equal(doc.pages[0].rows.length, 3)
  assert.equal(a.depth, 0)
  assert.ok(a.seed > 0)
  assert.equal(a.text, 'x y')
  assert.equal(a.done, true)
  assert.notEqual(b.id, 'a')
  assert.equal(b.type, 'note')
  assert.equal(b.depth, 1)
  assert.equal(h.depth, 0)
  assert.equal(h.done, false)
  valid(doc.pages[0].rows)
})
test('sanitize: boş sayfa listesi → varsayılan sayfa; idempotent', () => {
  const doc = M.sanitizeNotebook({ pages: [] })
  assert.equal(doc.pages.length, 1)
  assert.deepEqual(M.sanitizeNotebook(doc), doc)
})

// ─── kısayollar ───────────────────────────────────────────────────────────────
test('parseShortcut', () => {
  assert.deepEqual(M.parseShortcut('[] al'), { type: 'todo', done: false, text: 'al' })
  assert.deepEqual(M.parseShortcut('[ ] al'), { type: 'todo', done: false, text: 'al' })
  assert.deepEqual(M.parseShortcut('[x] al'), { type: 'todo', done: true, text: 'al' })
  assert.deepEqual(M.parseShortcut('# Başlık'), { type: 'heading', done: false, text: 'Başlık' })
  assert.deepEqual(M.parseShortcut('- not'), { type: 'note', done: false, text: 'not' })
  assert.deepEqual(M.parseShortcut('* not'), { type: 'note', done: false, text: 'not' })
  assert.equal(M.parseShortcut('a - b'), null)
  assert.equal(M.parseShortcut('#hashtag'), null)
})
test('setText kısayolla tip değiştirir, başlık derinliği 0', () => {
  const rows = [r('a'), r('b', 1)]
  const res = M.setText(rows, 'b', '# Bölüm')
  assert.equal(res.rows[1].type, 'heading')
  assert.equal(res.rows[1].text, 'Bölüm')
  assert.equal(res.rows[1].depth, 0)
  assert.deepEqual(res.focus, { id: 'b', caret: 0 })
  const same = M.setText(rows, 'a', 'a')
  assert.equal(same.rows, rows)
})

test('setText: metin tamamen silinince satır o anki odaya geçer', () => {
  const parent = { roomId: 'P', roomName: 'Parent' }
  const rows = [r('child notu', 0, 'todo', { roomId: 'C', roomName: 'Child' })]
  // kısmen silmek odayı değiştirmez
  let res = M.setText(rows, 'child notu', 'child', parent)
  assert.equal(res.rows[0].roomId, 'C')
  // tamamen silmek → parent
  res = M.setText(res.rows, 'child notu', '', parent)
  assert.equal(res.rows[0].roomId, 'P')
  assert.equal(res.rows[0].roomName, 'Parent')
  // boş satıra başka odada yazmaya başlamak → o oda
  res = M.setText(res.rows, 'child notu', 'y', { roomId: 'C2', roomName: 'Child 2' })
  assert.equal(res.rows[0].roomId, 'C2')
  // ctx yoksa oda izi korunur
  res = M.setText(res.rows, 'child notu', '', {})
  assert.equal(res.rows[0].roomId, 'C2')
  // kısayolla boşalan satır da odaya geçer ("[] " yazınca metin boş kalır)
  const fresh = [r('', 0, 'note', { id: 'e', roomId: 'C' })]
  res = M.setText(fresh, 'e', '[] ', parent)
  assert.equal(res.rows[0].type, 'todo')
  assert.equal(res.rows[0].roomId, 'P')
})

// ─── bölme / yapıştırma / silme ───────────────────────────────────────────────
test('splitRow: imleçten böler, oda izi ctx’ten', () => {
  const rows = [r('abcd')]
  const res = M.splitRow(rows, 'abcd', 2, { roomId: 'Y', roomName: 'Oda Y' })
  assert.equal(res.rows[0].text, 'ab')
  assert.equal(res.rows[1].text, 'cd')
  assert.equal(res.rows[1].type, 'todo')
  assert.equal(res.rows[1].roomId, 'Y')
  assert.deepEqual(res.focus, { id: res.rows[1].id, caret: 0 })
})
test('splitRow: başlık → not; çocuklu satır → ilk çocuk; boş girintili → outdent', () => {
  const h = M.splitRow([r('H', 0, 'heading')], 'H', 1)
  assert.equal(h.rows[1].type, 'note')
  const p = M.splitRow([r('p'), r('c', 1)], 'p', 1)
  assert.equal(p.rows[1].depth, 1)
  assert.equal(p.rows[2].id, 'c')
  const e = M.splitRow([r('p'), r('', 1, 'todo', { id: 'e' })], 'e', 0)
  assert.equal(e.rows[1].depth, 0)
  assert.equal(e.rows.length, 2)
})
test('splitRow: imleç başta → üste boş satır, odak yerinde', () => {
  const res = M.splitRow([r('abc')], 'abc', 0)
  assert.equal(res.rows.length, 2)
  assert.equal(res.rows[0].text, '')
  assert.equal(res.rows[1].id, 'abc')
  assert.deepEqual(res.focus, { id: 'abc', caret: 0 })
})
test('insertPasted: çok satır → satırlar, kısayollar, kuyruk korunur', () => {
  const rows = [r('AB')]
  const res = M.insertPasted(rows, 'AB', 1, 1, 'x\n[x] y\nz', { roomId: 'R' })
  assert.deepEqual(res.rows.map(x => x.text), ['Ax', 'y', 'zB'])
  assert.equal(res.rows[1].done, true)
  assert.equal(res.focus.id, res.rows[2].id)
  assert.equal(res.focus.caret, 1)
  assert.equal(M.insertPasted(rows, 'AB', 0, 0, 'tek satır'), null)
})
test('backspaceAt zinciri', () => {
  // boş → sil
  let res = M.backspaceAt([r('a'), r('', 0, 'todo', { id: 'e' })], 'e')
  assert.deepEqual(res.rows.map(x => x.id), ['a'])
  assert.deepEqual(res.focus, { id: 'a', caret: 1 })
  // girintili → outdent
  res = M.backspaceAt([r('a'), r('b', 1)], 'b')
  assert.equal(res.rows[1].depth, 0)
  // todo → not
  res = M.backspaceAt([r('a'), r('b')], 'b')
  assert.equal(res.rows[1].type, 'note')
  // not → birleştir
  res = M.backspaceAt([r('a'), r('b', 0, 'note')], 'b')
  assert.deepEqual(res.rows.map(x => x.text), ['ab'])
  assert.deepEqual(res.focus, { id: 'a', caret: 1 })
  // tek boş satır silinmez
  res = M.backspaceAt([r('', 0, 'note', { id: 'only' })], 'only')
  assert.equal(res.rows.length, 1)
})
test('deleteRow: çocuklar bir üste bağlanır', () => {
  const res = M.deleteRow([r('a'), r('b'), r('c', 1), r('d', 2)], 'b')
  valid(res.rows)
  assert.deepEqual(shape(res.rows), ['a', '  c', '    d'])
})

// ─── girinti ──────────────────────────────────────────────────────────────────
test('indent/outdent sınırları', () => {
  const rows = [r('a'), r('b'), r('c', 1)]
  let res = M.indentBlock(rows, 'b')
  assert.deepEqual(shape(res.rows), ['a', '  b', '    c'])
  // derinlik 2'yi aşacak blok girintilenmez
  res = M.indentBlock(res.rows, 'b')
  assert.deepEqual(shape(res.rows), ['a', '  b', '    c'])
  // ilk satır girintilenmez
  assert.equal(M.indentBlock(rows, 'a').rows, rows)
  // başlık girintilenmez; başlık altındaki satır girintilenemez
  const hs = [r('H', 0, 'heading'), r('x')]
  assert.equal(M.indentBlock(hs, 'H').rows, hs)
  assert.equal(M.indentBlock(hs, 'x').rows, hs)
  // outdent bloğu taşır
  res = M.outdentBlock([r('a'), r('b', 1), r('c', 2)], 'b')
  assert.deepEqual(shape(res.rows), ['a', 'b', '  c'])
  assert.equal(M.outdentBlock(rows, 'a').rows, rows)
})

// ─── tamamlama ────────────────────────────────────────────────────────────────
test('toggleDone: üst → alt todo’lar; kaldırma yalnızca kendisi', () => {
  const rows = [r('p'), r('c1', 1), r('n', 1, 'note'), r('c2', 1), r('q')]
  let res = M.toggleDone(rows, 'p', 100)
  assert.deepEqual(res.rows.map(x => x.done), [true, true, false, true, false])
  assert.equal(res.rows[1].doneAt, 100)
  res = M.toggleDone(res.rows, 'p', 200)
  assert.deepEqual(res.rows.map(x => x.done), [false, true, false, true, false])
  assert.equal(M.toggleDone(rows, 'n').rows, rows)
})
test('pageStats / childProgressMap', () => {
  const rows = [r('p'), r('c1', 1, 'todo', { done: true }), r('c2', 1), r('H', 0, 'heading'), r('q', 0, 'todo', { done: true })]
  assert.deepEqual(M.pageStats(rows), { total: 4, done: 2 })
  const m = M.childProgressMap(rows)
  assert.deepEqual(m.get('p'), { done: 1, total: 2 })
  assert.equal(m.has('q'), false)
})

// ─── sürükle-bırak ────────────────────────────────────────────────────────────
test('moveBlock: aşağı/yukarı, çocuklar birlikte, kendi çocuğuna no-op', () => {
  const rows = [r('a'), r('a1', 1), r('b'), r('c')]
  let res = M.moveBlock(rows, 'a', 'b')
  assert.deepEqual(shape(res.rows), ['b', 'a', '  a1', 'c'])
  res = M.moveBlock(rows, 'c', 'a')
  assert.deepEqual(shape(res.rows), ['c', 'a', '  a1', 'b'])
  assert.equal(M.moveBlock(rows, 'a', 'a1').rows, rows)
  assert.equal(M.moveBlock(rows, 'a', 'a').rows, rows)
})
test('moveBlock: ebeveyn ile ilk çocuk arasına → ilk çocuk olur, çocukları çalmaz', () => {
  const rows = [r('x'), r('p'), r('c', 1), r('d', 1)]
  const res = M.moveBlock(rows, 'x', 'p')
  assert.deepEqual(shape(res.rows), ['p', '  x', '  c', '  d'])
  valid(res.rows)
})
test('moveBlock: derinlik yeni yerde sınırlanır', () => {
  const rows = [r('a'), r('b', 1), r('c', 2), r('z')]
  // derin c, en başa → derinlik 0
  let res = M.moveBlock(rows, 'c', 'a')
  assert.equal(res.rows[0].id, 'c')
  valid(res.rows)
  // başlık altına bırakılan satır 0'a iner
  const hs = [r('H', 0, 'heading'), r('k'), r('m', 1), r('n', 2)]
  res = M.moveBlock(hs, 'n', 'k')
  valid(res.rows)
  assert.deepEqual(res.rows.map(x => x.id), ['H', 'n', 'k', 'm'])
})
test('nudgeBlock ve descendantIds', () => {
  const rows = [r('a'), r('b'), r('b1', 1), r('c')]
  assert.deepEqual(M.nudgeBlock(rows, 'b', -1).rows.map(x => x.id), ['b', 'b1', 'a', 'c'])
  assert.deepEqual(M.nudgeBlock(rows, 'b', 1).rows.map(x => x.id), ['a', 'c', 'b', 'b1'])
  assert.deepEqual(M.descendantIds(rows, 'b'), ['b1'])
})

// ─── arşiv ────────────────────────────────────────────────────────────────────
test('archiveCompleted: tam biten bloklar; bitmemiş çocuklu ebeveyn kalır; geri yükleme', () => {
  const page = M.makePage('P', [
    r('done1', 0, 'todo', { done: true }), r('dn', 1, 'note'),
    r('p', 0, 'todo', { done: true }), r('pc', 1),
    r('open'),
    r('q'), r('q1', 1, 'todo', { done: true }),
  ])
  const doc = { version: 1, pages: [page], archive: [] }
  const { doc: d2, count } = M.archiveCompleted(doc, page.id, 5)
  assert.equal(count, 3)
  assert.deepEqual(d2.pages[0].rows.map(x => x.id), ['p', 'pc', 'open', 'q'])
  assert.deepEqual(d2.archive.map(x => x.id), ['done1', 'dn', 'q1'])
  assert.equal(d2.archive[0].pageTitle, 'P')
  const back = M.restoreArchived(d2, 'q1')
  assert.equal(back.doc.archive.length, 2)
  const last = back.doc.pages[0].rows.at(-1)
  assert.equal(last.id, 'q1')
  assert.equal('archivedAt' in last, false)
  valid(back.doc.pages[0].rows)
})

// ─── sayfalar ─────────────────────────────────────────────────────────────────
test('sayfa ekle / adlandır / sil (son sayfa silinmez)', () => {
  let doc = M.createEmptyDoc()
  const added = M.addPage(doc)
  doc = added.doc
  assert.equal(doc.pages.length, 2)
  assert.equal(doc.pages[1].title, 'Sayfa 2')
  doc = M.renamePage(doc, added.pageId, '  Fikirler ').doc
  assert.equal(doc.pages[1].title, 'Fikirler')
  assert.equal(M.renamePage(doc, added.pageId, '   ').doc, doc)
  const del = M.deletePage(doc, added.pageId)
  assert.equal(del.doc.pages.length, 1)
  assert.equal(del.pageId, doc.pages[0].id)
  assert.equal(M.deletePage(del.doc, del.pageId).doc, del.doc)
})
test('withPageRows: değişmezse aynı doküman', () => {
  const doc = M.createEmptyDoc()
  const pid = doc.pages[0].id
  assert.equal(M.withPageRows(doc, pid, rows => ({ rows })).doc, doc)
  const res = M.withPageRows(doc, pid, rows => M.appendRow(rows, { roomId: 'R' }))
  assert.equal(res.doc.pages[0].rows.length, 1)
  assert.equal(res.focus.id, res.doc.pages[0].rows[0].id)
})

// ─── filtre ───────────────────────────────────────────────────────────────────
test('filterForRoom: eşleşme + soluk atalar', () => {
  const rows = [
    r('a', 0, 'todo', { roomId: 'X' }), r('a1', 1, 'todo', { roomId: 'Y' }),
    r('b', 0, 'todo', { roomId: 'X' }), r('c', 0, 'todo', { roomId: 'Y' }),
  ]
  const out = M.filterForRoom(rows, 'Y')
  assert.deepEqual(out.map(x => [x.row.id, x.dim]), [['a', true], ['a1', false], ['c', false]])
})

// ─── ağaç & uzlaştırma ────────────────────────────────────────────────────────
const tree = (...pairs) => pairs.map(([id, parentId]) => ({ id, name: id.toUpperCase(), parentId }))
const book = (root, rows, extra = {}) => ({
  rootRoomId: root,
  rev: 3,
  content: { version: 1, pages: [{ id: 'p1', title: 'Yapılacaklar', seed: 1, createdAt: 0, rows }], archive: extra.archive ?? [] },
})
const rr = (id, roomId, depth = 0) => M.makeRow({ id, text: id, roomId, depth })
const apply = (books, plan) => {
  const map = new Map(books.map(b => [b.rootRoomId, b]))
  for (const d of plan.deletes) map.delete(d)
  for (const u of plan.upserts) map.set(u.rootRoomId, { rootRoomId: u.rootRoomId, rev: u.rev + 1, content: u.content })
  return [...map.values()]
}

test('resolveRoot: kayıp parent ve döngü', () => {
  const byId = new Map(tree(['a', null], ['b', 'a'], ['c', 'b'], ['o', 'ghost'], ['x', 'y'], ['y', 'x']).map(x => [x.id, x]))
  assert.equal(M.resolveRoot(byId, 'c'), 'a')
  assert.equal(M.resolveRoot(byId, 'o'), 'o')
  assert.ok(['x', 'y'].includes(M.resolveRoot(byId, 'x')))
})
test('reconcile: aynı ağaç → boş plan', () => {
  const rooms = tree(['a', null], ['b', 'a'])
  const plan = M.planNotebookReconcile([book('a', [rr('1', 'a'), rr('2', 'b')])], rooms)
  assert.deepEqual(plan, { upserts: [], deletes: [] })
})
test('reconcile: alt ağaç ayrılır → satırları yeni köke gider', () => {
  const rooms = tree(['a', null], ['b', null], ['c', 'b'])
  const books = [book('a', [rr('1', 'a'), rr('2', 'b'), rr('3', 'c', 1)])]
  const plan = M.planNotebookReconcile(books, rooms)
  const byRoot = Object.fromEntries(plan.upserts.map(u => [u.rootRoomId, u]))
  assert.deepEqual(byRoot.a.content.pages[0].rows.map(x => x.id), ['1'])
  assert.deepEqual(byRoot.b.content.pages[0].rows.map(x => x.id), ['2', '3'])
  assert.equal(byRoot.b.content.pages[0].id, 'p1')
  assert.equal(byRoot.b.existed, false)
  valid(byRoot.b.content.pages[0].rows)
  const again = M.planNotebookReconcile(apply(books, plan), rooms)
  assert.deepEqual(again, { upserts: [], deletes: [] })
})
test('reconcile: kök başka ağaca eklenir → birleşir, eski defter silinir', () => {
  const rooms = tree(['a', null], ['b', 'a'])
  const books = [book('a', [rr('1', 'a')]), book('b', [rr('2', 'b')])]
  books[1].content.pages[0].id = 'other'
  const plan = M.planNotebookReconcile(books, rooms)
  assert.deepEqual(plan.deletes, ['b'])
  assert.equal(plan.upserts.length, 1)
  // sayfa id tutmadı ama başlık tuttu → aynı sayfaya eklendi, kendi satırları önde
  assert.deepEqual(plan.upserts[0].content.pages.map(p => p.rows.map(x => x.id)), [['1', '2']])
  assert.deepEqual(M.planNotebookReconcile(apply(books, plan), rooms), { upserts: [], deletes: [] })
})
test('reconcile: kök cascade’siz silinir → satırlar çocuklara, ölü satırlar varise', () => {
  // a silindi; b ve c artık kök
  const rooms = tree(['b', null], ['c', null], ['b1', 'b'])
  const books = [book('a', [rr('dead', 'a'), rr('1', 'b'), rr('2', 'b1'), rr('3', 'c')], { archive: [{ id: 'arc' }] })]
  const plan = M.planNotebookReconcile(books, rooms)
  const byRoot = Object.fromEntries(plan.upserts.map(u => [u.rootRoomId, u]))
  assert.deepEqual(plan.deletes, ['a'])
  assert.deepEqual(byRoot.b.content.pages[0].rows.map(x => x.id), ['dead', '1', '2'])
  assert.deepEqual(byRoot.c.content.pages[0].rows.map(x => x.id), ['3'])
  assert.equal(byRoot.b.content.archive.length, 1)
  assert.deepEqual(M.planNotebookReconcile(apply(books, plan), rooms), { upserts: [], deletes: [] })
})
test('reconcile: yarım kalmış önceki koşu → satır çoğalmaz', () => {
  // a silindi; önceki koşu b defterini yazdı ama a'yı silemedi
  const rooms = tree(['b', null], ['c', null])
  const books = [
    book('a', [rr('1', 'b'), rr('2', 'c')], { archive: [M.makeRow({ id: 'arc' })] }),
    book('b', [rr('1', 'b')], { archive: [M.makeRow({ id: 'arc' })] }),
  ]
  const plan = M.planNotebookReconcile(books, rooms)
  const byRoot = Object.fromEntries(plan.upserts.map(u => [u.rootRoomId, u]))
  assert.equal(byRoot.b, undefined)
  assert.deepEqual(byRoot.c.content.pages[0].rows.map(x => x.id), ['2'])
  assert.deepEqual(plan.deletes, ['a'])
})
test('reconcile: tüm ağaç silindi → defter silinir', () => {
  const plan = M.planNotebookReconcile([book('a', [rr('1', 'a'), rr('2', 'b')])], tree(['z', null]))
  assert.deepEqual(plan, { upserts: [], deletes: ['a'] })
})
test('reconcile: canlı defterdeki ölü oda satırı yerinde kalır', () => {
  const plan = M.planNotebookReconcile([book('a', [rr('1', 'a'), rr('2', 'gone')])], tree(['a', null]))
  assert.deepEqual(plan, { upserts: [], deletes: [] })
})

console.log(`✓ notebookModel: ${passed} kontrol geçti`)
