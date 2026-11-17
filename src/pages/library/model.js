// Kitaplığın sunucu ve istemcide ortak, saf kuralları (seyir defteri: lib/shelves.ts,
// lib/categories.ts, db/database.ts sabitleri, lib/documentPaper.ts). server/library.js de
// bunları kullanır; React ya da tarayıcıya bağımlı bir şey içermez.

// Kitaplıkta bir rafa yan yana kaç defter sığar; raflar ekranın eni kadardır
export const BOOKS_PER_SHELF = 3

// Her kategorinin kitaplığı en az bu kadar raftan oluşur; dolunca aşağıya yeni raflar eklenir
export const DEFAULT_SHELF_COUNT = 5

export const GENERAL_CATEGORY_ID = 1
export const GENERAL_CATEGORY_NAME = 'Genel'
export const MAX_CATEGORY_NAME = 20
export const MAX_TITLE = 40

// Not defteri (ve PDF) bu kadar sayfayla başlar
export const FIRST_PAGE_COUNT = 10

export const NOTEBOOK_KINDS = ['agenda', 'notes', 'pdf']
export const BINDINGS = ['band', 'spiral', 'file']
export const PAPER_STYLES = ['ruled', 'oxford', 'plain', 'grid', 'dot', 'a4', 'letter']
export const HABIT_LAYOUTS = ['none', 'month', 'week']

// Türün cildi ve önerilen kâğıdı: ajanda lastikli, not defteri telli, PDF bir belge dosyası
export const KIND_DEFAULTS = {
  agenda: { binding: 'band', paper: 'oxford' },
  notes: { binding: 'spiral', paper: 'ruled' },
  pdf: { binding: 'file', paper: 'a4' },
}

// PDF defterinin kâğıtları: sayfa bu oranda (boy / en) beyaz bir kâğıt olarak çizilir; yazı
// kâğıdın boyunu aşarsa kâğıt uzar. Varsayılan A4.
export const DOCUMENT_PAPERS = {
  a4: { name: 'A4', caption: '210 × 297 mm', ratio: Math.SQRT2 },
  letter: { name: 'Letter', caption: '216 × 279 mm', ratio: 11 / 8.5 },
}

export const DEFAULT_DOCUMENT_PAPER = 'a4'

export function isDocumentPaper(paper) {
  return paper === 'a4' || paper === 'letter'
}

export const DAY_NAMES = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar']

// Ajandanın gün ve hafta sayfaları (hafta: pazartesisi) veritabanında tarihin sayısıyla durur:
// 2026-11-17 → 20261117. Ayın sayfaları yıl × 100 + ay, not defterinin sayfaları numarasıyla.
export const DATED_KINDS = ['day', 'goals', 'review']

export function dateRef(iso) {
  return Number(iso.replace(/-/g, ''))
}

export function refDate(ref) {
  const s = String(ref).padStart(8, '0')
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`
}

// Not defteri ve PDF numaralı sayfalardan oluşur; ajanda takvime bölünür
export function hasNumberedPages(kind) {
  return kind === 'notes' || kind === 'pdf'
}

// Yeni defterin gireceği raf: yukarıdan aşağı, yeri olan ilk raf; hepsi doluysa en alta yeni raf.
// counts: her raftaki defter sayısı
export function nextShelf(counts) {
  const shelf = counts.findIndex((count) => count < BOOKS_PER_SHELF)
  return shelf === -1 ? counts.length : shelf
}

// Defter bir rafa girince raf taşarsa en sağdaki defter alttaki rafın başına iner; o da taşarsa
// bir alttakine, ... shelves yerinde değişir.
export function settleOverflow(shelves, from) {
  for (let s = from; s < shelves.length && shelves[s].length > BOOKS_PER_SHELF; s++) {
    if (s + 1 === shelves.length) shelves.push([])
    shelves[s + 1].unshift(...shelves[s].splice(BOOKS_PER_SHELF))
  }
}

// Kategori adı: baştaki/sondaki boşluklar atılır, aradaki boşluklar teke iner
export function cleanCategoryName(name) {
  return String(name ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_CATEGORY_NAME)
}

// Aynı adda (büyük/küçük harf farkı gözetmeden) iki kategori olmaz; Genel'in adı da alınamaz
export function categoryNameTaken(categories, name, exceptId) {
  const key = name.toLocaleLowerCase('tr')
  if (key === GENERAL_CATEGORY_NAME.toLocaleLowerCase('tr')) return true
  return categories.some((c) => c.id !== exceptId && c.name.toLocaleLowerCase('tr') === key)
}
