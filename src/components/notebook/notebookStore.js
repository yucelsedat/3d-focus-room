// Açık defterin durumu + kayıt kuyruğu. Overlay kapanıp açılsa da doküman burada
// yaşar (modül seviyesi zustand): tekrar açılış anlıktır, sunucu arkada doğrulanır.
// Kaynak bir kitaplık anahtarıdır: 'room:<odaId>' (oda defteri; kök sunucuda
// çözülür) ya da 'book:<id>' (bağımsız defter). Yüklenen defterin anahtarı `key`.
//
// Kayıt: her değişiklik 600 ms debounce (en geç 3 sn) sonra PUT edilir; aynı anda
// tek istek uçuştadır, uçuş sırasında gelen düzenlemeler ardından kaydedilir.
// Kapanışta anında flush. 409 → sunucudaki hali yüklenir + not düşülür.
import { create } from 'zustand'
import { withPageRows, parseBookKey } from '../../utils/notebookModel'
import { useStore } from '../../store/useStore'
import { loadRoom } from '../../utils/loadRoom'
import { relockGamePointer } from '../../utils/pointerLock'
import { putMeta } from './shelfStore'

const SAVE_DEBOUNCE = 600
const SAVE_MAX_WAIT = 3000
const RETRY = [2000, 5000, 10000]
const KEEPALIVE_MAX = 64 * 1024

export const useNotebookStore = create(() => ({
  key: null,         // yüklenen defter: 'room:<kökId>' | 'book:<id>'
  rootId: null,      // oda defterinde kök
  rootName: '',
  meta: null,        // kitaplık kaydı { name, cover, ... }
  tree: [],          // [{ id, name, parentId }] — kök ağacındaki odalar (bağımsız defterde tümü)
  doc: null,
  rev: 0,
  loadState: 'idle', // idle | loading | ready | error | missing (silinmiş bağımsız defter)
  saveState: 'saved', // saved | dirty | saving | error
  savedAt: null,
  dirty: false,
  focusReq: null,    // { id, caret, n } — hangi satır odaklansın
  toast: null,       // { id, text, undo?: doc }
}))

const get = useNotebookStore.getState
const set = useNotebookStore.setState

let focusN = 0
let toastN = 0
let loadSeq = 0
let lastSrc = null
let timer = null
let firstDirtyAt = 0
let inflight = null
let retryN = 0

// ─── yükleme ──────────────────────────────────────────────────────────────────

const saveUrl = (key) => {
  const ref = parseBookKey(key)
  if (!ref) return null
  return ref.kind === 'book' ? `/api/notebooks/${encodeURIComponent(ref.id)}` : `/api/notebook/${encodeURIComponent(ref.id)}`
}

export async function loadNotebook(src) {
  lastSrc = src
  const seq = ++loadSeq
  if (get().dirty) await flushNotebook()
  const ref = parseBookKey(src)
  if (!ref) { set({ loadState: 'error' }); return }
  // Başka bir defter açılıyorsa eskisini başlığın altında göstermeyelim. Oda → oda
  // geçişinde (aynı ağaç olabilir) eski doküman sunucu cevap verene kadar kalır.
  const cur0 = get()
  const other = cur0.key && (ref.kind === 'book' ? cur0.key !== src : !cur0.key.startsWith('room:'))
  if (other) set({ doc: null, key: null, rootId: null, meta: null, loadState: 'loading' })
  else if (!cur0.doc) set({ loadState: 'loading' })
  try {
    const res = await fetch(ref.kind === 'book'
      ? `/api/notebooks/${encodeURIComponent(ref.id)}`
      : `/api/notebook/${encodeURIComponent(ref.id)}`)
    if (res.status === 404 && ref.kind === 'book') {
      if (seq === loadSeq) set({ doc: null, key: null, meta: null, loadState: 'missing' })
      return
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (seq !== loadSeq) return
    const key = data.meta.key
    const cur = get()
    // Yerel kopya daha yeniyse (kaydedilmemiş düzenleme / uçuşta kayıt) onu koru
    const keepLocal = cur.key === key && cur.doc &&
      (cur.dirty || inflight || cur.rev >= data.rev)
    putMeta(data.meta)
    set({
      key,
      rootId: data.rootRoomId ?? null,
      rootName: data.rootName ?? '',
      meta: data.meta,
      tree: data.tree,
      loadState: 'ready',
      ...(keepLocal ? {} : { doc: data.content, rev: data.rev, dirty: false, saveState: 'saved' }),
    })
  } catch {
    if (seq === loadSeq) set({ loadState: get().doc ? 'ready' : 'error' })
  }
}

// ─── değişiklik uygulama ──────────────────────────────────────────────────────

// fn(doc) → { doc, focus? }. Doküman değiştiyse kayıt planlanır.
export function applyDoc(fn) {
  const { doc } = get()
  if (!doc) return null
  const res = fn(doc)
  if (!res) return null
  const patch = {}
  if (res.doc && res.doc !== doc) {
    patch.doc = res.doc
    patch.dirty = true
    patch.saveState = 'dirty'
  }
  if (res.focus) patch.focusReq = { ...res.focus, n: ++focusN }
  set(patch)
  if (patch.doc) scheduleSave()
  return res
}

// Sayfa satırlarına op: fn(rows) → { rows, focus? }
export function applyRows(pageId, fn) {
  return applyDoc(doc => withPageRows(doc, pageId, fn))
}

export function requestFocus(id, caret) {
  set({ focusReq: { id, caret, n: ++focusN } })
}

// ─── not kağıdı (toast) ───────────────────────────────────────────────────────

export function showToast(text, undo = null) {
  const id = ++toastN
  set({ toast: { id, text, undo } })
  setTimeout(() => {
    if (get().toast?.id === id) set({ toast: null })
  }, undo ? 6000 : 4000)
}

export function undoToast() {
  const t = get().toast
  if (!t?.undo) return
  set({ toast: null })
  applyDoc(() => ({ doc: t.undo }))
}

export function dismissToast() {
  set({ toast: null })
}

// ─── kayıt ────────────────────────────────────────────────────────────────────

function scheduleSave(delay) {
  if (!firstDirtyAt) firstDirtyAt = Date.now()
  clearTimeout(timer)
  const wait = delay ?? Math.max(0, Math.min(SAVE_DEBOUNCE, firstDirtyAt + SAVE_MAX_WAIT - Date.now()))
  timer = setTimeout(() => { flushNotebook() }, wait)
}

export function flushNotebook() {
  clearTimeout(timer)
  timer = null
  if (inflight) return inflight
  const { dirty, key, doc, rev } = get()
  const url = saveUrl(key)
  if (!dirty || !url || !doc) return Promise.resolve()
  firstDirtyAt = 0
  set({ dirty: false, saveState: 'saving' })

  inflight = (async () => {
    try {
      const res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: doc, rev }),
      })
      const data = await res.json().catch(() => ({}))
      if (get().key !== key) return
      if (res.ok) {
        retryN = 0
        set({ rev: data.rev, saveState: get().dirty ? 'dirty' : 'saved', savedAt: Date.now() })
        return
      }
      if (res.status === 409) {
        if (data.code === 'rev-mismatch' && data.content) {
          set({ doc: data.content, rev: data.rev, dirty: false, saveState: 'saved' })
          showToast('Defter başka bir yerde güncellenmiş — son hali yüklendi')
        } else {
          set({ dirty: false, saveState: 'saved', doc: null, key: null, rootId: null })
          showToast('Oda ağacı değişti — defter yeniden yüklendi')
          if (lastSrc) loadNotebook(lastSrc)
        }
        return
      }
      if (res.status === 404 && key.startsWith('book:')) {
        set({ dirty: false, saveState: 'saved', doc: null, key: null, meta: null, loadState: 'missing' })
        return
      }
      if (res.status === 400 || res.status === 413) {
        set({ dirty: true, saveState: 'error' })
        showToast(data.error || 'Defter kaydedilemedi')
        return
      }
      throw new Error(`HTTP ${res.status}`)
    } catch {
      if (get().key !== key) return
      set({ dirty: true, saveState: 'error' })
      scheduleSave(RETRY[Math.min(retryN++, RETRY.length - 1)])
    } finally {
      inflight = null
      if (get().dirty && !timer && get().saveState !== 'error') scheduleSave()
    }
  })()
  return inflight
}

// Sekme gizlenince kaydet; kapanırken keepalive ile son bir deneme
if (typeof window !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushNotebook()
  })
  window.addEventListener('pagehide', () => {
    const { dirty, key, doc, rev } = get()
    const url = saveUrl(key)
    if (!dirty || !url || !doc || inflight) return
    const body = JSON.stringify({ content: doc, rev })
    if (body.length > KEEPALIVE_MAX) return
    try {
      fetch(url, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: true,
      })
    } catch { /* sayfa kapanıyor */ }
  })
}

// ─── kapatma / ışınlanma ──────────────────────────────────────────────────────

// Defteri açan yüzey: oyun (varsayılan) ya da /canvas, /timeline sayfası. Sayfalarda
// oda etiketi oyunu o odada açar (NotebookHost).
const GAME_HOST = {
  openRoom: (id, name) => { loadRoom(id, name).catch(err => console.error('[notebook] loadRoom error:', err)) },
}
let host = GAME_HOST
export function setNotebookHost(h) {
  host = h ? { ...GAME_HOST, ...h } : GAME_HOST
}
export const notebookInGame = () => host === GAME_HOST

// relock yalnızca bir tıklama (kullanıcı etkileşimi) içinden çağrılırsa işe yarar;
// ve yalnızca defter oyundan kilitliyken açıldıysa (karttan açılınca imleç serbest kalır)
export function closeNotebookOverlay({ relock = false } = {}) {
  flushNotebook()
  const st = useStore.getState()
  const again = relock && st.notebookRelock
  st.closeNotebook()
  if (again) relockGamePointer()
}

// Satırın oda etiketine tıklayınca o odaya git (RoomNavHUD.goTo ile aynı akış)
export function teleportToRoom(id, name) {
  closeNotebookOverlay({ relock: true })
  host.openRoom(id, name)
}

// Yeni satırın oda izi
export function currentRoomCtx() {
  const st = useStore.getState()
  return { roomId: st.currentRoomId, roomName: st.currentRoomName }
}
