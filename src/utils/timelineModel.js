// ── Timeline saf modeli ──────────────────────────────────────────────────────
// Sonsuz canvas'ta soldan sağa akan ölçekli zaman ekseni. DOM'suz: hem tarayıcı
// (Timeline sayfası, canvas not kartı) hem sunucu (sanitize) hem doğrulama
// betiği (scripts/verify-timeline-model.mjs) aynı fonksiyonları kullanır.
//
// Koordinatlar: dünya x = (gün − EPOCH_DAY) × DAY_PX, eksen dünya y = 0'da.
// Tarihler 'YYYY-MM-DD' (bütün gün) ya da 'YYYY-MM-DDTHH:MM' (saatli) damga
// olarak saklanır ve kesirli UTC gün değerine çevrilir → saat dilimi / yaz saati
// kayması olmaz (saat, kullanıcının yazdığı duvar saati olarak tutulur).

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const STAMP_RE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?$/

export const DAY_MS = 86400000
export const DAY_PX = 8                       // zoom 1'de bir gün kaç dünya px'i
export const EPOCH_DAY = dayIndex('2000-01-01') // x=0 noktası (büyük translate değerlerinden kaçınır)

export const TL_LIMITS = { items: 3000, bytes: 4 * 1024 * 1024, name: 80, title: 200, body: 50000, tags: 20, tag: 40, images: 40 }

export const NOTE_STATUSES = [
  { id: 'done',    label: 'Yapıldı',       color: '#4ade80' },
  { id: 'doing',   label: 'Devam ediyor',  color: '#fbbf24' },
  { id: 'planned', label: 'Planlandı',     color: '#818cf8' },
]
export const statusOf = (id) => NOTE_STATUSES.find(s => s.id === id) || NOTE_STATUSES[2]

export const MONTHS_SHORT = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara']
export const MONTHS_LONG  = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık']
export const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
export const WEEKDAYS_SHORT = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt']

// ── Tarih ↔ gün ↔ x ──────────────────────────────────────────────────────────
export function isValidIso(iso) {
  const m = typeof iso === 'string' && ISO_RE.exec(iso)
  if (!m) return false
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3]
}

export function dayIndex(iso) {
  const m = ISO_RE.exec(iso)
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / DAY_MS)
}

export function isoFromDay(day) {
  const d = new Date(day * DAY_MS)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`
}

// Yerel takvime göre bugün (UTC'ye göre değil — gece yarısı civarı bir gün kaymasın)
export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

// ── Saatli damga ─────────────────────────────────────────────────────────────
export function isValidStamp(s) {
  const m = typeof s === 'string' && STAMP_RE.exec(s)
  if (!m || !isValidIso(m[1])) return false
  return m[2] === undefined || (+m[2] < 24 && +m[3] < 60)
}
export const hasTime = (s) => typeof s === 'string' && s.length > 10

// Damganın kesirli gün değeri (saatsizse günün başı)
export function stampValue(s) {
  const m = STAMP_RE.exec(s)
  return dayIndex(m[1]) + (m[2] === undefined ? 0 : (+m[2] * 60 + +m[3]) / 1440)
}

// Kesirli gün → damga. withTime=false: yalnız tarih; true: dakikaya yuvarlanmış saat
export function stampFromValue(v, withTime) {
  if (!withTime) return isoFromDay(Math.floor(v))
  const total = Math.round(v * 1440)
  const day = Math.floor(total / 1440), min = total - day * 1440
  const p = (n) => String(n).padStart(2, '0')
  return `${isoFromDay(day)}T${p(Math.floor(min / 60))}:${p(min % 60)}`
}

export const formatClock = (v) => {
  const min = Math.round((v - Math.floor(v)) * 1440) % 1440
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
}

export const dayToX = (day) => (day - EPOCH_DAY) * DAY_PX
export const xToDay = (x) => Math.floor(x / DAY_PX) + EPOCH_DAY
export const xToValue = (x) => x / DAY_PX + EPOCH_DAY        // kesirli gün
export const dateToX = (s) => dayToX(stampValue(s))

// Bitiş damgasının değeri: saatsiz bitiş o günün sonuna dek kapsar (dahil)
const endValue = (end) => (hasTime(end) ? stampValue(end) : dayIndex(end) + 1)

// Aralığın zaman kapsamı [t1, t2) (kesirli gün) ve dünya x'i.
// Saatsiz başlangıç + bitişsiz = bütün gün; saatli başlangıç + bitişsiz = an (t1 = t2).
export function rangeSpan(start, end) {
  const t1 = stampValue(start)
  let t2 = end && isValidStamp(end) ? endValue(end) : null
  if (t2 === null || t2 <= t1) t2 = hasTime(start) ? t1 : Math.floor(t1) + 1
  return { t1, t2, x1: dayToX(t1), x2: dayToX(t2), startDay: Math.floor(t1), endDay: Math.ceil(t2) - 1 }
}

// ── Biçimlendirme ────────────────────────────────────────────────────────────
const parts = (iso) => { const m = ISO_RE.exec(iso); return { y: +m[1], mo: +m[2] - 1, d: +m[3] } }

export function formatDate(iso) {
  if (!isValidIso(iso)) return ''
  const { y, mo, d } = parts(iso)
  return `${d} ${MONTHS_SHORT[mo]} ${y}`
}

const formatStamp = (s) => (hasTime(s) ? `${formatDate(s.slice(0, 10))} ${s.slice(11)}` : formatDate(s))

export function formatRange(start, end) {
  if (!isValidStamp(start)) return ''
  const validEnd = end && isValidStamp(end) && endValue(end) > stampValue(start) && !(end <= start && !hasTime(end) && !hasTime(start))
  if (hasTime(start) || (validEnd && hasTime(end))) {
    if (!validEnd) return `${formatDate(start.slice(0, 10))} · ${start.slice(11)}`
    if (hasTime(end) && end.slice(0, 10) === start.slice(0, 10)) return `${formatDate(start.slice(0, 10))} · ${start.slice(11)}–${end.slice(11)}`
    return `${formatStamp(start)} – ${formatStamp(end)}`
  }
  if (!validEnd) return formatDate(start)
  const a = parts(start), b = parts(end)
  if (a.y !== b.y) return `${formatDate(start)} – ${formatDate(end)}`
  if (a.mo !== b.mo) return `${a.d} ${MONTHS_SHORT[a.mo]} – ${b.d} ${MONTHS_SHORT[b.mo]} ${b.y}`
  return `${a.d}–${b.d} ${MONTHS_SHORT[a.mo]} ${a.y}`
}

// Dar kartlar için: aynı gün içindeki saatli aralık yalnız saatle ("10:30–12:30")
export function formatRangeShort(start, end) {
  if (isValidStamp(start) && hasTime(start)) {
    const sameDayEnd = end && isValidStamp(end) && hasTime(end) && end.slice(0, 10) === start.slice(0, 10) && end > start
    if (sameDayEnd) return `${start.slice(11)}–${end.slice(11)}`
    if (!end) return start.slice(11)
  }
  return formatRange(start, end)
}

// ── Eksen işaretleri ─────────────────────────────────────────────────────────
// Ekrandaki gün başına piksel (ppd) değerine göre etiketlenebilir en ince birim
// seçilir: 15 dk → 30 dk → saat → 3/6/12 saat → gün → hafta → ay → çeyrek → yıl →
// 5 yıl → 10 yıl. Her birimin bir de üst birimi (major) vardır: saatler → gün,
// gün/hafta → ay, ay/çeyrek → yıl, yıl → on yıl. Saat birimleri yalnız bir gün
// ekranda en az SUBDAY_MIN_PPD px olunca devreye girer (aksi halde gün etiketi daha anlamlı).
export const MIN_TICK_PX = 56
export const SUBDAY_MIN_PPD = 400

const startOfUtc = (day) => { const d = new Date(day * DAY_MS); return { y: d.getUTCFullYear(), mo: d.getUTCMonth(), d: d.getUTCDate(), dow: d.getUTCDay() } }
const dayOf = (y, mo, d = 1) => Math.floor(Date.UTC(y, mo, d) / DAY_MS)

// Her birim: ortalama uzunluk (gün), [from,to] aralığındaki birim başlangıçları, etiket
const subDay = (step) => ({
  len: step,
  starts: (from, to) => { const out = []; for (let i = Math.ceil(from / step - 1e-9); i * step <= to; i++) out.push(i * step); return out },
  label: (v) => formatClock(v),
  minPx: 44,
})
const UNITS = {
  min15: subDay(1 / 96),
  min30: subDay(1 / 48),
  hour: subDay(1 / 24),
  hour3: subDay(1 / 8),
  hour6: subDay(1 / 4),
  hour12: subDay(1 / 2),
  day: {
    len: 1,
    starts: (from, to) => { const out = []; for (let d = from; d <= to; d++) out.push(d); return out },
    label: (day) => String(startOfUtc(day).d),
    minPx: 24,   // etiket 1–2 rakam: ay görünümünde her gün okunur (ve tıklanır)
  },
  week: {
    len: 7,
    starts: (from, to) => {
      const { dow } = startOfUtc(from)
      const first = from - ((dow + 6) % 7)   // pazartesi
      const out = []; for (let d = first; d <= to; d += 7) out.push(d); return out
    },
    label: (day) => { const p = startOfUtc(day); return `${p.d} ${MONTHS_SHORT[p.mo]}` },
  },
  month: {
    len: 30.44,
    starts: (from, to) => monthStarts(from, to, 1),
    label: (day) => MONTHS_SHORT[startOfUtc(day).mo],
  },
  quarter: {
    len: 91.3,
    starts: (from, to) => monthStarts(from, to, 3),
    label: (day) => MONTHS_SHORT[startOfUtc(day).mo],
  },
  year: {
    len: 365.25,
    starts: (from, to) => yearStarts(from, to, 1),
    label: (day) => String(startOfUtc(day).y),
  },
  year5: {
    len: 365.25 * 5,
    starts: (from, to) => yearStarts(from, to, 5),
    label: (day) => String(startOfUtc(day).y),
  },
  decade: {
    len: 365.25 * 10,
    starts: (from, to) => yearStarts(from, to, 10),
    label: (day) => decadeLabel(startOfUtc(day).y),
  },
}

// "1990'lar", "2000'ler": ek, yılın okunuşundaki son kelimenin ünlüsüne uyar
// (on, otuz, kırk, altmış, doksan → -lar; yirmi, elli, yetmiş, seksen, yüz, bin → -ler)
const TENS_BACK = new Set([1, 3, 4, 6, 9])
export const decadeLabel = (y) => `${y}'${TENS_BACK.has(Math.floor(y / 10) % 10) ? 'lar' : 'ler'}`

function monthStarts(from, to, step) {
  const a = startOfUtc(from)
  let y = a.y, mo = a.mo - (a.mo % step)
  const out = []
  for (;;) {
    const d = dayOf(y, mo)
    if (d > to) break
    out.push(d)
    mo += step; if (mo > 11) { mo -= 12; y++ }
  }
  return out
}

function yearStarts(from, to, step) {
  const a = startOfUtc(from)
  const out = []
  for (let y = a.y - (((a.y % step) + step) % step); ; y += step) {
    const d = dayOf(y, 0)
    if (d > to) break
    out.push(d)
  }
  return out
}

const SUBDAY = ['min15', 'min30', 'hour', 'hour3', 'hour6', 'hour12']
const MINOR_ORDER = [...SUBDAY, 'day', 'week', 'month', 'quarter', 'year', 'year5', 'decade']
const MAJOR_OF = {
  min15: 'day', min30: 'day', hour: 'day', hour3: 'day', hour6: 'day', hour12: 'day',
  day: 'month', week: 'month', month: 'year', quarter: 'year', year: 'decade', year5: 'decade', decade: 'decade',
}

export function pickTickUnit(ppd) {
  return MINOR_ORDER.find(u => (!SUBDAY.includes(u) || ppd >= SUBDAY_MIN_PPD) && UNITS[u].len * ppd >= (UNITS[u].minPx || MIN_TICK_PX)) || 'decade'
}

// fromDay..toDay görünür (kesirli) gün aralığı, ppd ekrandaki gün başına px.
// Dönüş: { unit, minor:[{day,label}], major:[{day,label}] } — day kesirli olabilir
// (saat işaretleri); major etiketleri daha geniş bağlam taşır ("18 Ekim 2026 Pazar", "Mart 2026").
export function axisTicks(fromDay, toDay, ppd) {
  const unit = pickTickUnit(ppd)
  const majorUnit = MAJOR_OF[unit]
  const sub = SUBDAY.includes(unit)
  const lo = sub ? fromDay : Math.floor(fromDay), hi = sub ? toDay : Math.ceil(toDay)
  // gün birimi geniş aralıklıysa (hafta görünümü) haftanın günü de yazılır: "Pzt 12"
  const label = unit === 'day' && ppd >= 110
    ? (day) => { const p = startOfUtc(day); return `${WEEKDAYS_SHORT[p.dow]} ${p.d}` }
    : UNITS[unit].label
  const minor = UNITS[unit].starts(lo, hi).filter(d => d >= lo).map(day => ({ day, label: label(day) }))
  const majorLabel = (day) => {
    const p = startOfUtc(day)
    if (majorUnit === 'day') return `${p.d} ${MONTHS_LONG[p.mo]} ${p.y} ${WEEKDAYS[p.dow]}`
    if (majorUnit === 'month') return `${MONTHS_LONG[p.mo]} ${p.y}`
    if (majorUnit === 'year') return String(p.y)
    return decadeLabel(p.y)
  }
  // Ekranın solundaki son major başlangıcı da dahil: yapışkan etiket için
  const majorStarts = UNITS[majorUnit].starts(Math.floor(fromDay) - Math.ceil(UNITS[majorUnit].len) - 1, Math.ceil(toDay))
  const major = majorStarts.map(day => ({ day, label: majorLabel(day) }))
  return { unit, majorUnit, minor, major }
}

// ── Dönemler (Gün / Hafta / Ay / Yıl görünümleri) ────────────────────────────
// t'yi içeren dönemin [start, end) aralığı (kesirli gün). Hafta pazartesi başlar.
export const PERIODS = [
  { id: 'day', label: 'Gün' }, { id: 'week', label: 'Hafta' }, { id: 'month', label: 'Ay' }, { id: 'year', label: 'Yıl' },
]

export function periodRange(unit, t) {
  const day = Math.floor(t)
  const p = startOfUtc(day)
  if (unit === 'day') return { start: day, end: day + 1 }
  if (unit === 'week') { const s = day - ((p.dow + 6) % 7); return { start: s, end: s + 7 } }
  if (unit === 'month') return { start: dayOf(p.y, p.mo), end: dayOf(p.y, p.mo + 1) }
  return { start: dayOf(p.y, 0), end: dayOf(p.y + 1, 0) }
}

// Bir önceki / sonraki dönem (dir = −1 / +1)
export function stepPeriod(unit, t, dir) {
  const r = periodRange(unit, t)
  return periodRange(unit, dir > 0 ? r.end : r.start - 1)
}

export function periodLabel(unit, t) {
  const r = periodRange(unit, t)
  const p = startOfUtc(r.start)
  if (unit === 'day') return `${p.d} ${MONTHS_LONG[p.mo]} ${p.y}, ${WEEKDAYS[p.dow]}`
  if (unit === 'week') return formatRange(isoFromDay(r.start), isoFromDay(r.end - 1))
  if (unit === 'month') return `${MONTHS_LONG[p.mo]} ${p.y}`
  return String(p.y)
}

// Ekran ölçeğinden (ppd) dönem: görünümün hangi dönem düğmesine karşılık geldiği
export function periodOfScale(ppd, widthPx) {
  const days = widthPx / ppd
  if (days <= 1.6) return 'day'
  if (days <= 10) return 'week'
  if (days <= 45) return 'month'
  if (days <= 500) return 'year'
  return null
}

// Sürükleme / oluşturma ızgarası (gün cinsinden): saatler okunur hâle gelince
// 15 dk / 1 saat, yoksa 1 gün
export function snapStep(ppd) {
  if (ppd >= 24 * 40) return 1 / 96
  if (ppd >= SUBDAY_MIN_PPD) return 1 / 24
  return 1
}

// ── Görünüm koordinatları (Timeline sayfası) ─────────────────────────────────
// Görünüm { x, y, zoom, ppd }: zoom kart boyu, ppd ekranda gün başına px. Zaman
// ölçeği ile kart boyu ayrıdır → gün görünümünde (saatler okunurken) kartlar
// devleşmez. Kayıtlı x "taban" ölçektedir (gün × DAY_PX, canvas tile ile aynı);
// görüntü x'i k = ppd / (DAY_PX × zoom) germesiyle elde edilir:
//   • tarihli not: takvim etkinliği gibi kendi zaman aralığına oturur — sol kenar
//     başlangıçta, genişlik aralık kadar (en az MIN_CARD_PX ekran px, en çok kartın
//     kendi genişliği w). Kartın yatay yeri = zamanı; kayıtlı x yalnız canvas içindir.
//   • diğer öğeler (resim, metin, ok uçları): sol kenar zamana bağlı → x × k
// Görüntüdeki not, kendi genişliğini ve kayıtlı x'ini natW / natX'te taşır (fromDisplay geri koyar).
export const MIN_CARD_PX = 36
export const stretchOf = (view) => view.ppd / (DAY_PX * view.zoom)

const isDatedNote = (it) => it.type === 'note' && isValidStamp(it.start)

// zoom verilirse en dar kart MIN_CARD_PX ekran px'i olur; aralıktan genişse kart
// aralığın ortasına hizalanır. Anlık (bitişsiz saatli) not 1 saatlik yer kaplar.
const spanOf = (it, k) => { const r = rangeSpan(it.start, it.end); return { x1: r.x1 * k, span: (r.t2 > r.t1 ? r.t2 - r.t1 : 1 / 24) * DAY_PX * k } }

export function toDisplay(it, k, zoom = null) {
  if (it.type === 'arrow') return { ...it, x1: it.x1 * k, x2: it.x2 * k }
  if (isDatedNote(it)) {
    const { x1, span } = spanOf(it, k)
    const minW = zoom ? MIN_CARD_PX / zoom : 0
    const w = Math.min(it.w, Math.max(span, minW))
    return { ...it, x: x1 - Math.max(0, w - span) / 2, w, natW: it.w, natX: it.x }
  }
  return { ...it, x: it.x * k }
}

// Görüntü koordinatındaki öğeyi (d) kayıt koordinatına çevirir. Tarihli notta
// görüntü x'i başlangıç zamanıdır: süre korunarak tarih kayar (saatliyse dakikaya,
// saatsizse güne yuvarlanır).
export function fromDisplay(d, k) {
  if (d.type === 'arrow') return { ...d, x1: d.x1 / k, x2: d.x2 / k }
  const { natW, natX, ...rest } = d
  if (isDatedNote(d)) {
    const t = xToValue((d.x + Math.max(0, d.w - spanOf(d, k).span) / 2) / k)
    const t1 = rangeSpan(d.start, d.end).t1
    const shift = hasTime(d.start) ? Math.round(t * 1440) / 1440 - t1 : Math.round(t) - t1
    const r = Math.abs(shift) < 1e-9 ? { start: d.start, end: d.end } : shiftRange(d.start, d.end, 'move', shift)
    return withRange({ ...rest, w: natW ?? d.w, x: natX ?? dateToX(d.start) }, r.start, r.end)
  }
  return { ...rest, x: d.x / k }
}

// Notun tarihi değişince kart da tarihiyle birlikte kayar (ofset korunur)
export function withRange(note, start, end) {
  const dx = isValidStamp(note.start) && isValidStamp(start) ? dateToX(start) - dateToX(note.start) : 0
  return { ...note, start, end, x: note.x + dx }
}

// Çubuk sürükleme: mode 'move' | 'start' | 'end', d gün (ızgaraya oturtulmuş).
// Saatsiz notlar bütün günlerle, saatli notlar dakika hassasiyetinde kayar.
export function shiftRange(start, end, mode, d) {
  const r = rangeSpan(start, end)
  if (hasTime(start)) {
    let t1 = r.t1, t2 = r.t2
    const point = t2 === t1
    if (mode === 'move' || (point && mode === 'start')) { t1 += d; t2 += d }
    else if (mode === 'start') t1 = Math.min(t1 + d, t2 - 1 / 96)
    else t2 = Math.max(t2 + d, t1 + 1 / 96)
    return { start: stampFromValue(t1, true), end: t2 > t1 + 1e-9 ? stampFromValue(t2, true) : null }
  }
  const dd = Math.round(d)
  let s1 = r.startDay, e1 = r.endDay
  if (mode === 'move') { s1 += dd; e1 += dd }
  else if (mode === 'start') s1 = Math.min(e1, s1 + dd)
  else e1 = Math.max(s1, e1 + dd)
  return { start: isoFromDay(s1), end: e1 > s1 ? isoFromDay(e1) : null }
}

// ── Ay ızgarası + gün canvas'ları ────────────────────────────────────────────
// /timeline ay ızgarasıyla açılır; her gün kendi canvas'ına sahiptir: o güne ait
// öğeler. Aidiyet zamandan gelir (tek doküman, ayrı depo yok):
//   • not: aralığının kapsadığı her gün (çok günlü not her günde görünür)
//   • diğer öğeler: sol kenarının (okta başlangıç ucunun) düştüğü gün
export const monthKey = (y, mo) => `${y}-${String(mo + 1).padStart(2, '0')}`
export function parseMonthKey(key) {
  const m = /^(\d{4})-(\d{2})$/.exec(key || '')
  return m && +m[2] >= 1 && +m[2] <= 12 ? { y: +m[1], mo: +m[2] - 1 } : null
}
export const monthOfDay = (day) => { const p = startOfUtc(day); return { y: p.y, mo: p.mo } }
export const shiftMonth = ({ y, mo }, dir) => { const t = y * 12 + mo + dir; return { y: Math.floor(t / 12), mo: ((t % 12) + 12) % 12 } }
export const monthLabel = ({ y, mo }) => `${MONTHS_LONG[mo]} ${y}`
export const dayLabel = (day) => { const p = startOfUtc(day); return `${p.d} ${MONTHS_LONG[p.mo]} ${p.y}, ${WEEKDAYS[p.dow]}` }
export const weekdayOf = (day) => startOfUtc(day).dow

// Ayı kapsayan pazartesi başlı haftalar: [[gün × 7], …] (4–6 satır)
export function monthWeeks({ y, mo }) {
  const first = dayOf(y, mo), last = dayOf(y, mo + 1) - 1
  const start = first - ((startOfUtc(first).dow + 6) % 7)
  const weeks = []
  for (let d = start; d <= last; d += 7) weeks.push(Array.from({ length: 7 }, (_, i) => d + i))
  return weeks
}

// Notun kapsadığı günler [d1, d2] (dahil). Gece yarısında biten saatli not o güne taşmaz.
export function noteDays(n) {
  const r = rangeSpan(n.start, n.end)
  const d1 = Math.floor(r.t1)
  return { d1, d2: Math.max(d1, Math.ceil(r.t2) - 1) }
}

export function itemAnchorDay(it) {
  if (it.type === 'note') return isValidStamp(it.start) ? Math.floor(stampValue(it.start)) : null
  const x = it.type === 'arrow' ? it.x1 : it.x
  return Number.isFinite(x) ? Math.floor(xToValue(x)) : null
}

export function itemInDay(it, day) {
  if (it.type === 'note') {
    if (!isValidStamp(it.start)) return false
    const { d1, d2 } = noteDays(it)
    return d1 <= day && day <= d2
  }
  return itemAnchorDay(it) === day
}

// Haftalık satır yerleşimi: çok günlü notlar satıra yayılan şeritler (şeritlere
// dağıtılmış), tek günlükler o günün hücresinde saat sırasıyla (bütün gün önce).
// Dönüş: { bars: [{ note, c1, c2, lane, openL, openR }], laneCount, singles: Map(gün → [not]) }
export function weekLayout(notes, week) {
  const w0 = week[0], w6 = week[6]
  const bars = [], singles = new Map(week.map(d => [d, []]))
  const multi = []
  for (const n of notes) {
    if (!isValidStamp(n.start)) continue
    const { d1, d2 } = noteDays(n)
    if (d2 < w0 || d1 > w6) continue
    if (d2 > d1) multi.push({ n, d1, d2 })
    else singles.get(d1).push(n)
  }
  multi.sort((a, b) => a.d1 - b.d1 || b.d2 - a.d2 || (a.n.id < b.n.id ? -1 : 1))
  const laneEnds = []
  for (const { n, d1, d2 } of multi) {
    const c1 = Math.max(d1, w0) - w0, c2 = Math.min(d2, w6) - w0
    let lane = laneEnds.findIndex(end => end < c1)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(c2) } else laneEnds[lane] = c2
    bars.push({ note: n, c1, c2, lane, openL: d1 < w0, openR: d2 > w6 })
  }
  const timeKey = (n) => (hasTime(n.start) ? stampValue(n.start) : Math.floor(stampValue(n.start)) - 1)
  for (const list of singles.values()) list.sort((a, b) => timeKey(a) - timeKey(b) || (a.id < b.id ? -1 : 1))
  return { bars, laneCount: laneEnds.length, singles }
}

// ── Şerit (lane) yerleşimi ───────────────────────────────────────────────────
// Eksen altındaki aralık çubukları çakışmasın: başlangıca göre sıralayıp her
// çubuğu, son çubuğu bitmiş ilk şeride koy. Kararlı: eşit başlangıçta id sırası.
// Anlık (t1 = t2) notlar çakışma için 15 dk kaplar.
export function layoutLanes(notes) {
  const sorted = notes
    .filter(n => isValidStamp(n.start))
    .map(n => { const r = rangeSpan(n.start, n.end); return { id: n.id, t1: r.t1, t2: Math.max(r.t2, r.t1 + 1 / 96) } })
    .sort((a, b) => a.t1 - b.t1 || a.t2 - b.t2 || (a.id < b.id ? -1 : 1))
  const laneEnds = []
  const lanes = new Map()
  for (const n of sorted) {
    let lane = laneEnds.findIndex(end => end <= n.t1 + 1e-9)
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(n.t2) } else laneEnds[lane] = n.t2
    lanes.set(n.id, lane)
  }
  return { lanes, count: laneEnds.length }
}

// ── Not öğesi ────────────────────────────────────────────────────────────────
// Ölçek canvas tile ile ortak ("1920 px mantıksal pencere"): timeline aynı dünya
// ölçeğinde ~0.6 zoom ile açılır → iki yüzey arasında kopyalanan öğeler orantılı kalır.
export const NOTE_DEFAULTS = { w: 520, h: 560, fontSize: 26 }

// Canvas tile ile ortak öğe tipi: { type:'note', x,y,w,h, fontSize, title, body
// (markdown), images:[url], status, start, end, tags:[], link }.
// link: null | { kind:'url', url, title, thumbUrl, siteName } | { kind:'room', roomId, roomName }

const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '')
const num = (v, d) => (Number.isFinite(v) ? v : d)

export function sanitizeLink(link) {
  if (!link || typeof link !== 'object') return null
  if (link.kind === 'room' && typeof link.roomId === 'string' && link.roomId) {
    return { kind: 'room', roomId: link.roomId.slice(0, 120), roomName: str(link.roomName, 200) }
  }
  if (link.kind === 'url' && typeof link.url === 'string' && /^https?:\/\//i.test(link.url)) {
    return { kind: 'url', url: link.url.slice(0, 2000), title: str(link.title, 300), thumbUrl: str(link.thumbUrl, 2000), siteName: str(link.siteName, 120) }
  }
  return null
}

export function sanitizeNote(n) {
  const start = isValidStamp(n.start) ? n.start : null
  // Bitiş başlangıçtan sonra olmalı; ikisi de saatsizse aynı gün bitiş anlamsız (tek gün)
  const end = start && isValidStamp(n.end) && endValue(n.end) > stampValue(start)
    && !(!hasTime(start) && !hasTime(n.end) && n.end <= start) ? n.end : null
  const tags = [...new Set((Array.isArray(n.tags) ? n.tags : [])
    .map(t => str(t, TL_LIMITS.tag).trim()).filter(Boolean))].slice(0, TL_LIMITS.tags)
  return {
    ...n,
    type: 'note',
    w: Math.max(120, num(n.w, NOTE_DEFAULTS.w)),
    h: Math.max(80, num(n.h, NOTE_DEFAULTS.h)),
    fontSize: Math.min(200, Math.max(6, num(n.fontSize, NOTE_DEFAULTS.fontSize))),
    title: str(n.title, TL_LIMITS.title),
    body: str(n.body, TL_LIMITS.body),
    images: (Array.isArray(n.images) ? n.images : []).filter(u => typeof u === 'string' && u).slice(0, TL_LIMITS.images),
    status: NOTE_STATUSES.some(s => s.id === n.status) ? n.status : 'planned',
    start, end, tags,
    link: sanitizeLink(n.link),
  }
}

export function makeNote({ id, start, end = null, x, y, fontSize = NOTE_DEFAULTS.fontSize, w = NOTE_DEFAULTS.w, h = NOTE_DEFAULTS.h, status = 'planned', title = '' }) {
  return sanitizeNote({ id, type: 'note', x, y, w, h, fontSize, title, body: '', images: [], status, start, end, tags: [], link: null })
}

// ── Timeline dokümanı ────────────────────────────────────────────────────────
// { items: [...canvas öğeleri + not], bg, view: { x, y, zoom } }.
// Canvas öğeleri canvas tile ile aynı şemayı paylaşır; yalnız kaba yapı denetlenir
// (bilinmeyen tipler korunur → canvas'a eklenen yeni öğe tipleri timeline'da da yaşar).
export function createEmptyTimeline() {
  return { items: [], bg: '#0b0b10', view: null }
}

export function sanitizeTimeline(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.items)) return null
  const seen = new Set()
  const items = []
  for (const it of doc.items) {
    if (items.length >= TL_LIMITS.items) break
    if (!it || typeof it !== 'object' || typeof it.id !== 'string' || !it.id || typeof it.type !== 'string') continue
    if (seen.has(it.id)) continue
    seen.add(it.id)
    if (it.type === 'arrow') {
      if (![it.x1, it.y1, it.x2, it.y2].every(Number.isFinite)) continue
      items.push(it)
    } else {
      if (![it.x, it.y].every(Number.isFinite)) continue
      items.push(it.type === 'note' ? sanitizeNote(it) : it)
    }
  }
  const v = doc.view
  const view = v && [v.x, v.y, v.zoom].every(Number.isFinite) && v.zoom > 0 ? { x: v.x, y: v.y, zoom: v.zoom } : null
  return { items, bg: typeof doc.bg === 'string' ? doc.bg.slice(0, 40) : '#0b0b10', view }
}

export function sanitizeTimelineName(name) {
  const s = typeof name === 'string' ? name.replace(/\s+/g, ' ').trim().slice(0, TL_LIMITS.name) : ''
  return s || null
}

// ── Sunucu yardımcıları ──────────────────────────────────────────────────────
// Notun düz metin özeti (oda sohbeti korpusu vb.)
export function noteToText(n) {
  const head = [formatRange(n.start, n.end), statusOf(n.status).label].filter(Boolean).join(' · ')
  return [n.title?.trim() && `## ${n.title.trim()}`, head, n.body?.trim(), n.tags?.length ? n.tags.map(t => `#${t}`).join(' ') : '']
    .filter(Boolean).join('\n')
}

// Öğenin sunucuda tuttuğu /uploads dosyaları (silme / klonlama için)
export function itemAssetUrls(it) {
  const out = []
  if (typeof it?.url === 'string' && it.url.startsWith('/uploads/')) out.push(it.url)
  if (typeof it?.coverUrl === 'string' && it.coverUrl.startsWith('/uploads/')) out.push(it.coverUrl)
  if (it?.type === 'note' && Array.isArray(it.images)) for (const u of it.images) if (typeof u === 'string' && u.startsWith('/uploads/')) out.push(u)
  return out
}
