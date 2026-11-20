// Kitaplık defterlerinin oyundaki listesi (new-defter-system): canvas'taki defter kartları,
// kitaplık menüsü ve defter overlay'i aynı listeyi okur. Hafif modül — defter ekranının
// chunk'ını çekmez; kartlar duvarda da çizilir.
//
// Anahtar: 'lib:<ShelfBook.id>'. Eski sistemin 'book:' / 'room:' anahtarlarıyla karışmasın diye
// ayrı önek (id'ler farklı tablolardan gelir).
import { create } from 'zustand'
import { getCategories, getNotebooks } from '../../pages/library/api.js'

const LIB_RE = /^lib:(\d{1,12})$/

export const libKey = (id) => `lib:${id}`
export function parseLibKey(key) {
  const m = typeof key === 'string' ? LIB_RE.exec(key) : null
  return m ? Number(m[1]) : null
}
export const isLibKey = (key) => parseLibKey(key) !== null

export const useLibrary = create(() => ({
  byId: {},        // id → kitaplık defteri (api.js getNotebooks satırı, snake_case)
  books: [],       // kitaplık sırası: raf, konum
  categories: [],  // { id, name, position }
  state: 'idle',   // idle | loading | ready | error
}))

const get = useLibrary.getState
const set = useLibrary.setState
let inflight = null
let fetchedAt = 0
// Kitaplıkta (başka sekmede / sayfada) yapılan değişiklikler kart yeniden çizilince görünsün
const STALE_MS = 60_000

export function refreshLibrary() {
  if (inflight) return inflight
  if (get().state !== 'ready') set({ state: 'loading' })
  inflight = Promise.all([getNotebooks(), getCategories()])
    .then(([books, categories]) => {
      fetchedAt = Date.now()
      set({
        byId: Object.fromEntries(books.map((b) => [b.id, b])),
        books,
        categories, // sunucu sırası: Genel başta, sonra kullanıcının dizdiği sıra
        state: 'ready',
      })
    })
    .catch(() => set({ state: get().state === 'ready' ? 'ready' : 'error' }))
    .finally(() => { inflight = null })
  return inflight
}

// Bir yazmadan (oluştur / düzenle) sonra: yoldaki istek yazmadan önce başlamış olabilir, onu
// bekleyip taze bir istek atar
export async function reloadLibrary() {
  if (inflight) await inflight.catch(() => {})
  return refreshLibrary()
}

// Kart ilk çizildiğinde; liste bayatsa tazelenir, sonraki kartlar aynı isteği paylaşır
export function ensureLibrary() {
  if (get().state === 'idle' || Date.now() - fetchedAt > STALE_MS) refreshLibrary()
}

// Kitaplıkta silinen defter listeden düşer (kartlar "silinmiş" görünür)
export function forgetLibraryBook(id) {
  if (!get().byId[id]) return
  set((s) => {
    const byId = { ...s.byId }
    delete byId[id]
    return { byId, books: s.books.filter((b) => b.id !== id) }
  })
}

export const KIND_LABEL = { agenda: 'Ajanda', notes: 'Not defteri', pdf: 'PDF' }
