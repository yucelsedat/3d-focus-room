// Oda defteri durumu + kayıt kuyruğu. Overlay kapanıp açılsa da doküman burada
// yaşar (modül seviyesi zustand): tekrar açılış anlıktır, sunucu arkada doğrulanır.
//
// Kayıt: her değişiklik 600 ms debounce (en geç 3 sn) sonra PUT edilir; aynı anda
// tek istek uçuştadır, uçuş sırasında gelen düzenlemeler ardından kaydedilir.
// Kapanışta anında flush. 409 → sunucudaki hali yüklenir + not düşülür.
import { create } from 'zustand'
import { withPageRows } from '../../utils/notebookModel'
import { useStore } from '../../store/useStore'
import { loadRoom } from '../../utils/loadRoom'
import { relockGamePointer } from '../../utils/pointerLock'

const SAVE_DEBOUNCE = 600
const SAVE_MAX_WAIT = 3000
const RETRY = [2000, 5000, 10000]
const KEEPALIVE_MAX = 64 * 1024

export const useNotebookStore = create(() => ({
  rootId: null,
  rootName: '',
  tree: [],          // [{ id, name, parentId }] — kök ağacındaki odalar
  doc: null,
  rev: 0,
  loadState: 'idle', // idle | loading | ready | error
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
let lastRoomId = null
let timer = null
let firstDirtyAt = 0
let inflight = null
let retryN = 0

// ─── yükleme ──────────────────────────────────────────────────────────────────

export async function loadNotebook(roomId) {
  lastRoomId = roomId
  const seq = ++loadSeq
  if (get().dirty) await flushNotebook()
  if (!get().doc) set({ loadState: 'loading' })
  try {
    const res = await fetch(`/api/notebook/${encodeURIComponent(roomId)}`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    if (seq !== loadSeq) return
    const cur = get()
    // Yerel kopya daha yeniyse (kaydedilmemiş düzenleme / uçuşta kayıt) onu koru
    const keepLocal = cur.rootId === data.rootRoomId && cur.doc &&
      (cur.dirty || inflight || cur.rev >= data.rev)
    set({
      rootId: data.rootRoomId,
      rootName: data.rootName,
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
  const { dirty, rootId, doc, rev } = get()
  if (!dirty || !rootId || !doc) return Promise.resolve()
  firstDirtyAt = 0
  set({ dirty: false, saveState: 'saving' })

  inflight = (async () => {
    try {
      const res = await fetch(`/api/notebook/${encodeURIComponent(rootId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: doc, rev }),
      })
      const data = await res.json().catch(() => ({}))
      if (get().rootId !== rootId) return
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
          set({ dirty: false, saveState: 'saved', doc: null, rootId: null })
          showToast('Oda ağacı değişti — defter yeniden yüklendi')
          if (lastRoomId) loadNotebook(lastRoomId)
        }
        return
      }
      if (res.status === 400 || res.status === 413) {
        set({ dirty: true, saveState: 'error' })
        showToast(data.error || 'Defter kaydedilemedi')
        return
      }
      throw new Error(`HTTP ${res.status}`)
    } catch {
      if (get().rootId !== rootId) return
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
    const { dirty, rootId, doc, rev } = get()
    if (!dirty || !rootId || !doc || inflight) return
    const body = JSON.stringify({ content: doc, rev })
    if (body.length > KEEPALIVE_MAX) return
    try {
      fetch(`/api/notebook/${encodeURIComponent(rootId)}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body, keepalive: true,
      })
    } catch { /* sayfa kapanıyor */ }
  })
}

// ─── kapatma / ışınlanma ──────────────────────────────────────────────────────

// relock yalnızca bir tıklama (kullanıcı etkileşimi) içinden çağrılırsa işe yarar
export function closeNotebookOverlay({ relock = false } = {}) {
  flushNotebook()
  useStore.getState().closeNotebook()
  if (relock) relockGamePointer()
}

// Satırın oda etiketine tıklayınca o odaya git (RoomNavHUD.goTo ile aynı akış)
export function teleportToRoom(id, name) {
  closeNotebookOverlay({ relock: true })
  loadRoom(id, name).catch(err => console.error('[notebook] loadRoom error:', err))
}

// Yeni satırın oda izi
export function currentRoomCtx() {
  const st = useStore.getState()
  return { roomId: st.currentRoomId, roomName: st.currentRoomName }
}
