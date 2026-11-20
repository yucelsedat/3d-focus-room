// Oyunda (ve /canvas, /timeline'da) kitaplık defter formu: yeni defter oluşturma ve düzenleme
// (new-defter-system Faz 3). Form, defterle aynı kapıdan açılır — notebookOpen + notebookForm —
// böylece oyunun bütün tuş / tekerlek / yapıştırma dinleyicileri (Player, KeyHandler, CanvasMesh
// noteOverlayRef, TimelinePage) form açıkken de susar. NotebookHost formu LibraryFormOverlay'de çizer.
//
// openLibraryForm bir söz döndürür: kaydedince sonuç (oluşturmada yeni defterin id'si), vazgeçince
// ya da form başka yoldan kapanınca (sayfadan çıkma, yeni form) null.
import { useStore } from '../../store/useStore'
import { libKey, reloadLibrary, useLibrary } from './libraryShelf'

let pending = null   // { token, resolve }
let seq = 0

export function openLibraryForm(request) {
  settleLibraryForm(null)
  return new Promise((resolve) => {
    const token = ++seq
    pending = { token, resolve }
    useStore.setState({
      notebookOpen: true,
      notebookForm: { ...request, token },
      notebookRelock: typeof document !== 'undefined' && !!document.pointerLockElement,
    })
  })
}

// Formu kapatır ve bekleyen sözü çözer (bir kez). token verilirse yalnız o istek açıksa — sökülen
// eski bir overlay'in gecikmiş temizliği yeni açılan formu kapatmasın.
export function settleLibraryForm(result, token) {
  if (!pending || (token !== undefined && pending.token !== token)) return
  const { resolve } = pending
  pending = null
  if (useStore.getState().notebookForm) useStore.getState().closeNotebook()
  resolve(result)
}

// Canvas kartının kopyası için defterin özeti (NotebookShelfMenu onPick ile aynı biçim)
export function libraryMeta(book) {
  return { lib: true, key: libKey(book.id), name: book.title, color: book.color, binding: book.binding, year: book.year }
}

// Yeni defter: form kaydedilince kitaplık tazelenir, yeni defterin özeti döner (vazgeçilirse null)
export async function createLibraryBook({ categoryId } = {}) {
  const id = await openLibraryForm({ mode: 'create', categoryId })
  if (id == null) return null
  await reloadLibrary()
  const book = useLibrary.getState().byId[id]
  return book ? libraryMeta(book) : null
}

// Defteri düzenle: kaydedilince kitaplık tazelenir — aynı deftere bakan bütün kartlar değişir
export async function editLibraryBook(id) {
  // LibraryFormOverlay düzenlemede kaydedince true ile çözer
  const saved = await openLibraryForm({ mode: 'edit', id })
  if (!saved) return false
  await reloadLibrary()
  return true
}
