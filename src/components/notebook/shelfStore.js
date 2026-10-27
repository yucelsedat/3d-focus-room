// Kitaplık: defterlerin ad / kapak listesi (içerik yok). Canvas'taki defter kartları,
// kitaplık menüsü ve defter rayı aynı listeyi okur. Hafif modül — defter overlay
// chunk'ını (roughjs, dnd-kit) çekmez; kartlar duvarda da çizilir.
//
// Anahtar: 'book:<id>' bağımsız defter, 'room:<kökId>' oda defteri (notebookModel).
import { create } from 'zustand'
import { parseBookKey } from '../../utils/notebookModel'
import { useStore } from '../../store/useStore'

export const useShelf = create(() => ({
  byKey: {},       // key → { key, kind, id, name, customName, roomName, cover, updatedAt }
  order: [],       // sunucu sırası: bağımsız defterler (yeniden eskiye), sonra oda defterleri
  hereKey: null,   // oyundaki odanın defteri
  state: 'idle',   // idle | loading | ready | error
}))

const get = useShelf.getState
const set = useShelf.setState
let inflight = null

// Kitaplıkta "bu odanın defteri" yalnızca oyunda anlamlı
function hereRoomId() {
  return typeof location !== 'undefined' && location.pathname === '/game' ? useStore.getState().currentRoomId : null
}

async function json(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw Object.assign(new Error(data.error || `HTTP ${res.status}`), { status: res.status })
  return data
}

export function refreshShelf() {
  if (inflight) return inflight
  if (get().state !== 'ready') set({ state: 'loading' })
  const room = hereRoomId()
  inflight = fetch(`/api/notebooks${room ? `?room=${encodeURIComponent(room)}` : ''}`)
    .then(json)
    .then(data => {
      set({
        byKey: Object.fromEntries(data.books.map(b => [b.key, b])),
        order: data.books.map(b => b.key),
        hereKey: data.hereKey,
        state: 'ready',
      })
    })
    .catch(() => set({ state: get().state === 'ready' ? 'ready' : 'error' }))
    .finally(() => { inflight = null })
  return inflight
}

// Kart ilk çizildiğinde bir kez; sonraki kartlar aynı isteği paylaşır
export function ensureShelf() {
  if (get().state === 'idle') refreshShelf()
}

export function putMeta(meta) {
  if (!meta?.key) return
  set(s => ({
    byKey: { ...s.byKey, [meta.key]: meta },
    order: s.order.includes(meta.key) ? s.order : [meta.key, ...s.order],
  }))
}

function dropMeta(key) {
  set(s => {
    const byKey = { ...s.byKey }
    delete byKey[key]
    return { byKey, order: s.order.filter(k => k !== key) }
  })
}

export async function createBook(name) {
  const meta = await fetch('/api/notebooks', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }),
  }).then(json)
  putMeta(meta)
  return meta
}

// patch: { name?, cover? } — oda defterinde boş ad = kök odanın adı
export async function saveBookMeta(key, patch) {
  const ref = parseBookKey(key)
  if (!ref) throw new Error('Geçersiz defter')
  const url = ref.kind === 'book'
    ? `/api/notebooks/${encodeURIComponent(ref.id)}`
    : `/api/notebook/${encodeURIComponent(ref.id)}/meta`
  const meta = await fetch(url, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch),
  }).then(json)
  // Oda defterinde ağaç değişmişse sunucu yeni kökün anahtarını döndürür
  if (meta.key !== key) dropMeta(key)
  putMeta(meta)
  return meta
}

export async function deleteBook(key) {
  const ref = parseBookKey(key)
  if (ref?.kind !== 'book') throw new Error('Oda defteri silinemez')
  await fetch(`/api/notebooks/${encodeURIComponent(ref.id)}`, { method: 'DELETE' }).then(json)
  dropMeta(key)
  const st = useStore.getState()
  if (st.heldNotebook === key) st.setHeldNotebook(null)
}

export async function uploadCover(file) {
  const fd = new FormData()
  fd.append('file', file)
  const { url } = await fetch('/api/notebooks/cover', { method: 'POST', body: fd }).then(json)
  return url
}

// Kapaksız defterin bez rengi: anahtardan sabit (her kart / liste satırı aynı)
const BOOK_CLOTH = ['#7a3b2e', '#2f4f3e', '#2c3d63', '#6a5233', '#55345e', '#2e5a5f', '#4b4f2a']
export function clothOf(key = '') {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) | 0
  return BOOK_CLOTH[Math.abs(h) % BOOK_CLOTH.length]
}

// Karttan: defter elde kalır (B artık bunu açar) ve hemen açılır
export function takeNotebook(key) {
  const st = useStore.getState()
  st.setHeldNotebook(key)
  st.openNotebook()
}
