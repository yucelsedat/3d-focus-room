// Defter overlay'ini bağlayan kabuk: oyun (App), /canvas ve /timeline aynısını kullanır.
// notebookOpen açıkken ya kitaplık defter formu (notebookForm: yeni / düzenle) ya da elde tutulan
// kitaplık defteri ('lib:<id>') açılır. İkisi de ayrı chunk; açılıştan birkaç saniye sonra boşta
// önceden indirilir, açılınca hazır olur.
import { lazy, Suspense, useEffect } from 'react'
import { useStore } from '../../store/useStore'
import { closeNotebookOverlay } from './notebookUi'
import { parseLibKey } from './libraryShelf'

const loadLibraryOverlay = () => import('./LibraryNotebookOverlay')
const LibraryNotebookOverlay = lazy(loadLibraryOverlay)
const loadLibraryForm = () => import('./LibraryFormOverlay')
const LibraryFormOverlay = lazy(loadLibraryForm)

// Chunk henüz inmediyse anında geri bildirim. Tıklama yayılımı durdurulur:
// aksi halde drei PointerLockControls imleci yeniden kilitler.
function NotebookFallback() {
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483647, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(6,6,8,0.88)', color: 'rgba(247,242,228,0.7)',
        fontFamily: "'Caveat', cursive", fontSize: 34,
      }}
    >
      defter açılıyor…
    </div>
  )
}

export function NotebookHost() {
  const open = useStore(st => st.notebookOpen)
  const libId = useStore(st => parseLibKey(st.heldNotebook))
  const form = useStore(st => st.notebookForm)
  // Açık ama gösterilecek bir şey yok (elde kitaplık defteri yok, form yok): kapı açık kalıp oyunu
  // kilitlemesin
  const empty = open && !form && libId === null

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 1))
    const t = setTimeout(() => idle(() => {
      loadLibraryOverlay().catch(() => {})
      loadLibraryForm().catch(() => {})
    }), 4000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => { if (empty) closeNotebookOverlay() }, [empty])

  // Sayfadan ayrılırken açık kalmasın (oyuna dönünce B'siz açılmasın)
  useEffect(() => () => { if (useStore.getState().notebookOpen) closeNotebookOverlay() }, [])

  if (!open || empty) return null
  return (
    <Suspense fallback={<NotebookFallback />}>
      {form ? <LibraryFormOverlay key={form.token} request={form} />
        : <LibraryNotebookOverlay key={libId} id={libId} />}
    </Suspense>
  )
}
