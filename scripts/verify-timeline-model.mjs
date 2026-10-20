// Timeline saf modelinin doğrulaması: node scripts/verify-timeline-model.mjs
// Exit 0 = tüm kontroller geçti.
import assert from 'node:assert/strict'
import * as M from '../src/utils/timelineModel.js'

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

// ─── tarih ↔ gün ↔ x ─────────────────────────────────────────────────────────
test('isValidIso: geçerli / geçersiz', () => {
  assert.ok(M.isValidIso('2026-02-28'))
  assert.ok(M.isValidIso('2024-02-29'))          // artık yıl
  assert.ok(!M.isValidIso('2026-02-29'))
  assert.ok(!M.isValidIso('2026-13-01'))
  assert.ok(!M.isValidIso('2026-1-1'))
  assert.ok(!M.isValidIso(null))
})
test('dayIndex ↔ isoFromDay gidiş-dönüş', () => {
  for (const iso of ['1970-01-01', '2000-01-01', '2026-03-29', '2026-10-25', '2099-12-31']) {
    assert.equal(M.isoFromDay(M.dayIndex(iso)), iso)
  }
  assert.equal(M.dayIndex('1970-01-02'), 1)
})
test('dateToX: epoch 0, gün başına DAY_PX, xToDay tersi', () => {
  assert.equal(M.dateToX('2000-01-01'), 0)
  assert.equal(M.dateToX('2000-01-02'), M.DAY_PX)
  const x = M.dateToX('2026-10-18')
  assert.equal(M.isoFromDay(M.xToDay(x)), '2026-10-18')
  assert.equal(M.isoFromDay(M.xToDay(x + M.DAY_PX - 0.01)), '2026-10-18')
  assert.equal(M.isoFromDay(M.xToDay(x - 0.01)), '2026-10-17')
})
test('rangeSpan: bitiş günü dahil, tek gün = 1 gün, ters aralık tek güne iner', () => {
  const a = M.rangeSpan('2026-03-01', '2026-03-03')
  assert.equal(a.x2 - a.x1, 3 * M.DAY_PX)
  const b = M.rangeSpan('2026-03-01', null)
  assert.equal(b.x2 - b.x1, M.DAY_PX)
  const c = M.rangeSpan('2026-03-05', '2026-03-01')
  assert.equal(c.x2 - c.x1, M.DAY_PX)
})
test('todayIso yerel takvimi kullanır', () => {
  assert.equal(M.todayIso(new Date(2026, 0, 5, 23, 59)), '2026-01-05')
})

// ─── biçimlendirme ───────────────────────────────────────────────────────────
test('formatRange', () => {
  assert.equal(M.formatRange('2026-03-03', null), '3 Mar 2026')
  assert.equal(M.formatRange('2026-03-03', '2026-03-12'), '3–12 Mar 2026')
  assert.equal(M.formatRange('2026-03-03', '2026-04-12'), '3 Mar – 12 Nis 2026')
  assert.equal(M.formatRange('2025-12-28', '2026-01-04'), '28 Ara 2025 – 4 Oca 2026')
  assert.equal(M.formatRange('2026-03-03', '2026-03-03'), '3 Mar 2026')
  assert.equal(M.formatRange('bozuk', null), '')
})

// ─── eksen işaretleri ────────────────────────────────────────────────────────
test('pickTickUnit: ppd büyüdükçe birim incelir, etiketler MIN_TICK_PX altına düşmez', () => {
  assert.equal(M.pickTickUnit(100), 'day')
  assert.equal(M.pickTickUnit(10), 'week')
  assert.equal(M.pickTickUnit(2), 'month')
  assert.equal(M.pickTickUnit(1), 'quarter')
  assert.equal(M.pickTickUnit(0.2), 'year')
  assert.equal(M.pickTickUnit(0.001), 'decade')
})
test('axisTicks: gün birimi + ay başı major', () => {
  const from = M.dayIndex('2026-02-26'), to = M.dayIndex('2026-03-03')
  const t = M.axisTicks(from, to, 80)
  assert.equal(t.unit, 'day')
  assert.deepEqual(t.minor.map(x => x.label), ['26', '27', '28', '1', '2', '3'])
  assert.ok(t.major.some(m => m.label === 'Mart 2026' && m.day === M.dayIndex('2026-03-01')))
  // ekranın solundaki aktif major (Şubat) yapışkan etiket için listede
  assert.ok(t.major.some(m => m.label === 'Şubat 2026'))
})
test('axisTicks: hafta birimi pazartesiden başlar', () => {
  const from = M.dayIndex('2026-10-01'), to = M.dayIndex('2026-10-31')
  const t = M.axisTicks(from, to, 10)
  assert.equal(t.unit, 'week')
  for (const m of t.minor) assert.equal(new Date(m.day * M.DAY_MS).getUTCDay(), 1)
  assert.equal(t.minor[0].label, '5 Eki')
})
test('axisTicks: ay / çeyrek / yıl / on yıl', () => {
  const from = M.dayIndex('2025-11-15'), to = M.dayIndex('2026-04-10')
  assert.deepEqual(M.axisTicks(from, to, 2).minor.map(x => x.label), ['Ara', 'Oca', 'Şub', 'Mar', 'Nis'])
  assert.ok(M.axisTicks(from, to, 2).major.some(m => m.label === '2026'))
  const q = M.axisTicks(M.dayIndex('2025-01-01'), M.dayIndex('2025-12-31'), 1)
  assert.deepEqual(q.minor.map(x => x.label), ['Oca', 'Nis', 'Tem', 'Eki'])
  const y = M.axisTicks(M.dayIndex('2019-06-01'), M.dayIndex('2023-01-01'), 0.2)
  assert.deepEqual(y.minor.map(x => x.label), ['2020', '2021', '2022', '2023'])
  const d = M.axisTicks(M.dayIndex('1985-01-01'), M.dayIndex('2011-01-01'), 0.001)
  assert.deepEqual(d.minor.map(x => x.label), ["1990'lar", "2000'ler", "2010'lar"])
})
test('axisTicks: minor işaretleri artan ve görünür aralıkta', () => {
  const from = M.dayIndex('2026-01-10'), to = M.dayIndex('2027-05-01')
  for (const ppd of [80, 10, 2, 1, 0.2]) {
    const { minor } = M.axisTicks(from, to, ppd)
    for (let i = 1; i < minor.length; i++) assert.ok(minor[i].day > minor[i - 1].day)
    assert.ok(minor.every(m => m.day >= from && m.day <= to))
  }
})

test('decadeLabel ses uyumu', () => {
  assert.deepEqual([1960, 1970, 1980, 2000, 2020, 2030, 2050].map(M.decadeLabel),
    ["1960'lar", "1970'ler", "1980'ler", "2000'ler", "2020'ler", "2030'lar", "2050'ler"])
})

// ─── saatli damgalar ─────────────────────────────────────────────────────────
test('isValidStamp / stampValue / stampFromValue', () => {
  assert.ok(M.isValidStamp('2026-10-18'))
  assert.ok(M.isValidStamp('2026-10-18T09:30'))
  assert.ok(!M.isValidStamp('2026-10-18T24:00'))
  assert.ok(!M.isValidStamp('2026-10-18T09:60'))
  assert.ok(!M.isValidStamp('2026-02-30T09:00'))
  const d = M.dayIndex('2026-10-18')
  assert.equal(M.stampValue('2026-10-18T06:00'), d + 0.25)
  assert.equal(M.stampFromValue(d + 0.25, true), '2026-10-18T06:00')
  assert.equal(M.stampFromValue(d + 0.999, true), '2026-10-18T23:59')
  assert.equal(M.stampFromValue(d + 1439.6 / 1440, true), '2026-10-19T00:00')   // dakika yuvarlaması gün devreder
  assert.equal(M.stampFromValue(d + 0.7, false), '2026-10-18')
  assert.equal(M.formatClock(d + 13.5 / 24), '13:30')
})
test('rangeSpan: saatli aralık, an, saatsiz bitişin gün sonu', () => {
  const d = M.dayIndex('2026-10-18')
  const a = M.rangeSpan('2026-10-18T09:00', '2026-10-18T11:30')
  assert.equal(a.t1, d + 9 / 24); assert.equal(a.t2, d + 11.5 / 24)
  const p = M.rangeSpan('2026-10-18T09:00', null)
  assert.equal(p.t2, p.t1)
  const c = M.rangeSpan('2026-10-18T22:00', '2026-10-19')
  assert.equal(c.t2, d + 2)
  const bad = M.rangeSpan('2026-10-18T09:00', '2026-10-18T08:00')
  assert.equal(bad.t2, bad.t1)
})
test('formatRange: saatli', () => {
  assert.equal(M.formatRange('2026-10-18T09:00', null), '18 Eki 2026 · 09:00')
  assert.equal(M.formatRange('2026-10-18T09:00', '2026-10-18T11:30'), '18 Eki 2026 · 09:00–11:30')
  assert.equal(M.formatRange('2026-10-18T22:00', '2026-10-19T01:00'), '18 Eki 2026 22:00 – 19 Eki 2026 01:00')
  assert.equal(M.formatRange('2026-10-18T09:00', '2026-10-18T08:00'), '18 Eki 2026 · 09:00')
})
test('formatRangeShort', () => {
  assert.equal(M.formatRangeShort('2026-10-18T10:30', '2026-10-18T12:30'), '10:30–12:30')
  assert.equal(M.formatRangeShort('2026-10-18T10:30', null), '10:30')
  assert.equal(M.formatRangeShort('2026-10-18T22:00', '2026-10-19T01:00'), '18 Eki 2026 22:00 – 19 Eki 2026 01:00')
  assert.equal(M.formatRangeShort('2026-10-18', null), '18 Eki 2026')
})
test('sanitizeNote: saatli damgalar korunur, geçersiz bitiş düşer', () => {
  const a = M.sanitizeNote({ id: 'a', start: '2026-10-18T09:00', end: '2026-10-18T10:00' })
  assert.equal(a.start, '2026-10-18T09:00'); assert.equal(a.end, '2026-10-18T10:00')
  assert.equal(M.sanitizeNote({ id: 'b', start: '2026-10-18T09:00', end: '2026-10-18T09:00' }).end, null)
  assert.equal(M.sanitizeNote({ id: 'c', start: '2026-10-18T09:00', end: '2026-10-18' }).end, '2026-10-18')  // gün sonuna dek
  assert.equal(M.sanitizeNote({ id: 'd', start: '2026-10-18T25:00' }).start, null)
})
test('axisTicks: gün görünümünde saat işaretleri, major = gün', () => {
  const d = M.dayIndex('2026-10-18')
  const t = M.axisTicks(d, d + 1, 1400)
  assert.equal(t.unit, 'hour')
  assert.equal(t.minor.length, 25)
  assert.equal(t.minor[9].label, '09:00')
  assert.ok(t.major.some(m => m.label === '18 Ekim 2026 Pazar' && m.day === d))
  assert.equal(M.axisTicks(d, d + 0.2, 6000).unit, 'min15')
  assert.equal(M.axisTicks(d, d + 3, 450).unit, 'hour3')
  assert.equal(M.pickTickUnit(300), 'day')     // saat birimleri SUBDAY_MIN_PPD altında devreye girmez
  assert.equal(M.pickTickUnit(1344 / 31), 'day')  // ay görünümü (1440 px) her günü etiketler
  const wk = M.axisTicks(M.dayIndex('2026-10-12'), M.dayIndex('2026-10-18'), 1344 / 7)
  assert.equal(wk.minor[0].label, 'Pzt 12')   // hafta görünümünde gün adı
  assert.equal(M.axisTicks(M.dayIndex('2026-10-12'), M.dayIndex('2026-10-18'), 1344 / 31).minor[0].label, '12')
})
test('periodRange / stepPeriod / periodLabel', () => {
  const t = M.dayIndex('2026-10-18') + 0.4   // Pazar
  assert.deepEqual(M.periodRange('day', t), { start: M.dayIndex('2026-10-18'), end: M.dayIndex('2026-10-19') })
  assert.deepEqual(M.periodRange('week', t), { start: M.dayIndex('2026-10-12'), end: M.dayIndex('2026-10-19') })
  assert.deepEqual(M.periodRange('month', t), { start: M.dayIndex('2026-10-01'), end: M.dayIndex('2026-11-01') })
  assert.deepEqual(M.periodRange('year', t), { start: M.dayIndex('2026-01-01'), end: M.dayIndex('2027-01-01') })
  assert.deepEqual(M.stepPeriod('month', t, 1), { start: M.dayIndex('2026-11-01'), end: M.dayIndex('2026-12-01') })
  assert.deepEqual(M.stepPeriod('month', M.dayIndex('2026-03-31'), -1), { start: M.dayIndex('2026-02-01'), end: M.dayIndex('2026-03-01') })
  assert.deepEqual(M.stepPeriod('day', t, -1).start, M.dayIndex('2026-10-17'))
  assert.equal(M.periodLabel('day', t), '18 Ekim 2026, Pazar')
  assert.equal(M.periodLabel('week', t), '12–18 Eki 2026')
  assert.equal(M.periodLabel('month', t), 'Ekim 2026')
  assert.equal(M.periodOfScale(1400, 1400), 'day')
  assert.equal(M.periodOfScale(200, 1400), 'week')
  assert.equal(M.periodOfScale(1400 / 31, 1400), 'month')
})
test('snapStep', () => {
  assert.equal(M.snapStep(5), 1)
  assert.equal(M.snapStep(500), 1 / 24)
  assert.equal(M.snapStep(1400), 1 / 96)
})
test('layoutLanes: saatli notlar aynı günde yan yana şerit paylaşır', () => {
  const { lanes } = M.layoutLanes([
    { id: 'a', start: '2026-10-18T09:00', end: '2026-10-18T10:00' },
    { id: 'b', start: '2026-10-18T10:00', end: '2026-10-18T11:00' },
    { id: 'c', start: '2026-10-18T09:30', end: null },
  ])
  assert.equal(lanes.get('a'), 0)
  assert.equal(lanes.get('b'), 0)   // a bittiği an başlıyor
  assert.equal(lanes.get('c'), 1)
})

// ─── görünüm koordinatları ───────────────────────────────────────────────────
test('toDisplay / fromDisplay: serbest öğeler zamana bağlı, gidiş-dönüş', () => {
  const img = { id: 'i', type: 'image', x: 1000, y: 5, w: 300 }
  const arr = { id: 'a', type: 'arrow', x1: 10, y1: 0, x2: 50, y2: 9 }
  for (const it of [img, arr]) assert.deepEqual(M.toDisplay(it, 1), it)
  for (const k of [0.01, 3.7, 175]) for (const it of [img, arr]) {
    const back = M.fromDisplay(M.toDisplay(it, k), k)
    for (const key of ['x', 'x1', 'x2']) if (key in it) assert.ok(Math.abs(back[key] - it[key]) < 1e-6, `${it.id}.${key} k=${k}`)
  }
  const di = M.toDisplay(img, 175)
  assert.ok(Math.abs(M.fromDisplay({ ...di, x: di.x + 175 }, 175).x - (img.x + 1)) < 1e-9)
})
test('toDisplay: tarihli not kendi zaman aralığına oturur', () => {
  // gün görünümü: 1344 px = 1 gün, kart zoom 0.6
  const zoom = 0.6, ppd = 1344, k = ppd / (M.DAY_PX * zoom)
  const hour = { id: 'h', type: 'note', x: 0, y: -600, w: 520, h: 560, start: '2026-10-18T10:00', end: '2026-10-18T11:00' }
  const d = M.toDisplay(hour, k, zoom)
  assert.ok(Math.abs(d.x * zoom - (M.dateToX('2026-10-18T10:00') / M.DAY_PX) * ppd) < 1e-6, 'sol kenar 10:00')
  assert.ok(Math.abs(d.w * zoom - ppd / 24) < 1e-6, '1 saat genişlik')
  assert.equal(d.natW, 520)
  const q = M.toDisplay({ ...hour, end: '2026-10-18T10:15' }, k, zoom)
  assert.ok(Math.abs(q.w * zoom - M.MIN_CARD_PX) < 1e-6, '15 dk → en dar kart')
  const q1 = M.dateToX('2026-10-18T10:00') * k, q2 = M.dateToX('2026-10-18T10:15') * k
  assert.ok(Math.abs((q.x + q.w / 2) - (q1 + q2) / 2) < 1e-6, 'en dar kart aralığın ortasında')
  const qb = M.fromDisplay(q, k)
  assert.equal(qb.start, '2026-10-18T10:00'); assert.equal(qb.end, '2026-10-18T10:15')
  const day = M.toDisplay({ ...hour, start: '2026-10-18', end: null }, k, zoom)
  assert.equal(day.w, 520, 'aralık karttan geniş → kart kendi genişliğinde')
  const point = M.toDisplay({ ...hour, end: null }, k, zoom)
  assert.ok(Math.abs(point.w * zoom - ppd / 24) < 1e-6, 'anlık not 1 saat yer kaplar')
})
test('fromDisplay: tarihli not — gidiş-dönüş ve yatay kaydırma = zaman', () => {
  const zoom = 0.6, ppd = 1344, k = ppd / (M.DAY_PX * zoom)
  const n = { id: 'n', type: 'note', x: 123, y: -600, w: 520, h: 560, start: '2026-10-18T10:00', end: '2026-10-18T11:30' }
  const back = M.fromDisplay(M.toDisplay(n, k, zoom), k)
  assert.equal(back.start, n.start); assert.equal(back.end, n.end); assert.equal(back.w, 520); assert.equal(back.x, 123)
  assert.ok(!('natW' in back) && !('natX' in back))
  const d = M.toDisplay(n, k, zoom)
  const moved = M.fromDisplay({ ...d, x: d.x + (ppd / 24 * 2) / zoom, y: -700 }, k)   // 2 saat sağa
  assert.equal(moved.start, '2026-10-18T12:00'); assert.equal(moved.end, '2026-10-18T13:30'); assert.equal(moved.y, -700)
  const allDay = { ...n, start: '2026-10-18', end: '2026-10-20' }
  const dd = M.toDisplay(allDay, k, zoom)
  const m2 = M.fromDisplay({ ...dd, x: dd.x + 1.4 * ppd / zoom }, k)   // 1.4 gün → 1 güne yuvarlanır
  assert.equal(m2.start, '2026-10-19'); assert.equal(m2.end, '2026-10-21')
})
test('withRange: kart tarihle birlikte kayar', () => {
  const n = { type: 'note', x: 100, start: '2026-10-18', end: null }
  assert.equal(M.withRange(n, '2026-10-20', null).x, 100 + 2 * M.DAY_PX)
  assert.equal(M.withRange({ ...n, start: null }, '2026-10-20', null).x, 100)
})
test('shiftRange: saatsiz günlerle, saatli dakikalarla', () => {
  assert.deepEqual(M.shiftRange('2026-10-10', '2026-10-12', 'move', 3.4), { start: '2026-10-13', end: '2026-10-15' })
  assert.deepEqual(M.shiftRange('2026-10-10', '2026-10-12', 'start', 5), { start: '2026-10-12', end: null })
  assert.deepEqual(M.shiftRange('2026-10-10', null, 'end', 2), { start: '2026-10-10', end: '2026-10-12' })
  assert.deepEqual(M.shiftRange('2026-10-18T09:00', '2026-10-18T10:00', 'move', 0.5 / 24), { start: '2026-10-18T09:30', end: '2026-10-18T10:30' })
  assert.deepEqual(M.shiftRange('2026-10-18T09:00', '2026-10-18T10:00', 'end', 2 / 24), { start: '2026-10-18T09:00', end: '2026-10-18T12:00' })
  assert.deepEqual(M.shiftRange('2026-10-18T09:00', '2026-10-18T10:00', 'start', 3 / 24), { start: '2026-10-18T09:45', end: '2026-10-18T10:00' })
  assert.deepEqual(M.shiftRange('2026-10-18T09:00', null, 'end', 1 / 24), { start: '2026-10-18T09:00', end: '2026-10-18T10:00' })
  assert.deepEqual(M.shiftRange('2026-10-18T23:30', null, 'move', 1 / 24), { start: '2026-10-19T00:30', end: null })
})

// ─── ay ızgarası / gün canvas'ları ──────────────────────────────────────────
test('monthWeeks: pazartesi başlı, ayın tüm günlerini kapsar', () => {
  const w = M.monthWeeks({ y: 2026, mo: 9 })   // Ekim 2026: 1'i Perşembe
  assert.equal(w.length, 5)
  assert.equal(M.isoFromDay(w[0][0]), '2026-09-28')
  assert.equal(M.isoFromDay(w[0][3]), '2026-10-01')
  assert.equal(M.weekdayOf(w[0][3]), 4)
  assert.equal(M.isoFromDay(w[4][6]), '2026-11-01')
  assert.equal(M.monthWeeks({ y: 2026, mo: 1 }).length, 5)   // Şubat 2026: 1'i Pazar → 5 satır
  assert.equal(M.monthWeeks({ y: 2027, mo: 1 }).length, 4)   // Şubat 2027: 1'i Pzt, 28 gün → 4 satır
  assert.equal(M.monthWeeks({ y: 2026, mo: 2 }).length, 6)   // Mart 2026: Paz 1 → 6 satır
  for (const ws of [M.monthWeeks({ y: 2026, mo: 9 })]) for (const wk of ws) assert.equal(M.weekdayOf(wk[0]), 1)
})
test('ay anahtarları / etiketler', () => {
  assert.deepEqual(M.parseMonthKey('2026-10'), { y: 2026, mo: 9 })
  assert.equal(M.parseMonthKey('2026-13'), null)
  assert.equal(M.monthKey(2026, 9), '2026-10')
  assert.deepEqual(M.shiftMonth({ y: 2026, mo: 11 }, 1), { y: 2027, mo: 0 })
  assert.deepEqual(M.shiftMonth({ y: 2026, mo: 0 }, -1), { y: 2025, mo: 11 })
  assert.equal(M.monthLabel({ y: 2026, mo: 9 }), 'Ekim 2026')
  assert.equal(M.dayLabel(M.dayIndex('2026-10-18')), '18 Ekim 2026, Pazar')
})
test('itemInDay: not aralığı, öğe sol kenarı; gece yarısı biten saatli not taşmaz', () => {
  const d = M.dayIndex('2026-10-18')
  assert.ok(M.itemInDay({ type: 'note', start: '2026-10-18T10:00', end: '2026-10-18T11:00' }, d))
  assert.ok(!M.itemInDay({ type: 'note', start: '2026-10-18T10:00', end: '2026-10-18T11:00' }, d + 1))
  assert.ok(!M.itemInDay({ type: 'note', start: '2026-10-17T22:00', end: '2026-10-18T00:00' }, d))
  const multi = { type: 'note', start: '2026-10-16', end: '2026-10-19' }
  assert.ok([16, 17, 18, 19].every(x => M.itemInDay(multi, d - 18 + x)))
  assert.ok(!M.itemInDay(multi, d + 2))
  assert.ok(!M.itemInDay({ type: 'note', start: null }, d))
  assert.ok(M.itemInDay({ type: 'image', x: M.dateToX('2026-10-18T23:00') }, d))
  assert.ok(M.itemInDay({ type: 'arrow', x1: M.dateToX('2026-10-18T01:00'), x2: M.dateToX('2026-10-20') }, d))
})
test('weekLayout: çok günlü şeritler, tek günlükler saat sırasıyla', () => {
  const week = M.monthWeeks({ y: 2026, mo: 9 })[2]   // 12–18 Ekim
  const notes = [
    { id: 'a', start: '2026-10-13', end: '2026-10-15' },
    { id: 'b', start: '2026-10-14', end: '2026-10-22' },          // haftanın sağından taşar
    { id: 'c', start: '2026-10-10', end: '2026-10-12' },          // soldan taşar
    { id: 'd', start: '2026-10-18T10:00', end: '2026-10-18T11:00' },
    { id: 'e', start: '2026-10-18' },
    { id: 'f', start: '2026-10-18T08:00' },
    { id: 'x', start: '2026-11-01' },
  ]
  const L = M.weekLayout(notes, week)
  const bar = (id) => L.bars.find(b => b.note.id === id)
  assert.deepEqual([bar('c').c1, bar('c').c2, bar('c').openL, bar('c').lane], [0, 0, true, 0])
  assert.deepEqual([bar('a').c1, bar('a').c2, bar('a').lane], [1, 3, 0])
  assert.deepEqual([bar('b').c1, bar('b').c2, bar('b').openR, bar('b').lane], [2, 6, true, 1])
  assert.equal(L.laneCount, 2)
  assert.deepEqual(L.singles.get(M.dayIndex('2026-10-18')).map(n => n.id), ['e', 'f', 'd'])
  assert.ok(![...L.singles.values()].flat().some(n => n.id === 'x'))
})

// ─── şeritler ────────────────────────────────────────────────────────────────
test('layoutLanes: çakışanlar ayrı şeride, bitenler şeridi boşaltır, tarihsizler atlanır', () => {
  const { lanes, count } = M.layoutLanes([
    { id: 'a', start: '2026-01-01', end: '2026-01-10' },
    { id: 'b', start: '2026-01-05', end: '2026-01-20' },
    { id: 'c', start: '2026-01-11', end: null },
    { id: 'd', start: '2026-01-10', end: null },   // a'nın son günüyle çakışır
    { id: 'x', start: null },
  ])
  assert.equal(lanes.get('a'), 0)
  assert.equal(lanes.get('b'), 1)
  assert.equal(lanes.get('d'), 2)
  assert.equal(lanes.get('c'), 0)
  assert.ok(!lanes.has('x'))
  assert.equal(count, 3)
})

// ─── not / doküman sanitize ──────────────────────────────────────────────────
test('sanitizeNote: varsayılanlar, tarih, etiket, link', () => {
  const n = M.sanitizeNote({ id: 'n', type: 'note', x: 0, y: 0, start: '2026-03-01', end: '2026-02-01', status: 'x',
    tags: [' a ', 'a', '', 5, 'b'], images: ['/u/1.png', 3, ''], link: { kind: 'url', url: 'javascript:alert(1)' } })
  assert.equal(n.end, null)
  assert.equal(n.status, 'planned')
  assert.deepEqual(n.tags, ['a', 'b'])
  assert.deepEqual(n.images, ['/u/1.png'])
  assert.equal(n.link, null)
  assert.equal(n.fontSize, M.NOTE_DEFAULTS.fontSize)
  const r = M.sanitizeNote({ id: 'r', start: 'yok', link: { kind: 'room', roomId: 'room-1', roomName: 'Ofis' } })
  assert.equal(r.start, null)
  assert.deepEqual(r.link, { kind: 'room', roomId: 'room-1', roomName: 'Ofis' })
  const u = M.sanitizeNote({ id: 'u', link: { kind: 'url', url: 'https://ex.com', title: 'T' } })
  assert.equal(u.link.url, 'https://ex.com')
})
test('sanitizeTimeline: bozuk girdi → null; tekrar id, bozuk öğe atılır, bilinmeyen tip korunur', () => {
  assert.equal(M.sanitizeTimeline(null), null)
  assert.equal(M.sanitizeTimeline({ items: 'x' }), null)
  const doc = M.sanitizeTimeline({
    items: [
      { id: 'a', type: 'image', x: 1, y: 2, w: 3, h: 4, url: '/x.png' },
      { id: 'a', type: 'image', x: 9, y: 9 },
      { id: 'b', type: 'arrow', x1: 0, y1: 0, x2: 1 },
      { id: 'c', type: 'gelecekTip', x: 0, y: 0, ozel: 1 },
      { id: 'd', type: 'note', x: 0, y: 0, start: '2026-01-01' },
      { type: 'text', x: 0, y: 0 },
    ],
    view: { x: 1, y: 2, zoom: 0 },
  })
  assert.deepEqual(doc.items.map(i => i.id), ['a', 'c', 'd'])
  assert.equal(doc.items[1].ozel, 1)
  assert.equal(doc.items[2].status, 'planned')
  assert.equal(doc.view, null)
})
test('sanitizeTimelineName', () => {
  assert.equal(M.sanitizeTimelineName('  Yol   haritası \n'), 'Yol haritası')
  assert.equal(M.sanitizeTimelineName('   '), null)
  assert.equal(M.sanitizeTimelineName(3), null)
})

console.log(`✓ ${passed} kontrol geçti`)
