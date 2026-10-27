// Defter overlay'ini bağlayan kabuk: oyun (App), /canvas ve /timeline aynısını
// kullanır. Defter ayrı chunk (roughjs + dnd-kit); açılıştan birkaç saniye sonra
// boşta önceden indirilir, açılınca hazır olur.
//
// onOpenRoom verilirse (sayfalar) satırın oda etiketi oyunu o odada açar; verilmezse
// oyundayız ve oda yerinde yüklenir.
import { lazy, Suspense, useEffect, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { setNotebookHost, closeNotebookOverlay } from './notebookStore'

const loadNotebookOverlay = () => import('./NotebookOverlay')
const NotebookOverlay = lazy(loadNotebookOverlay)

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

export function NotebookHost({ onOpenRoom }) {
  const open = useStore(st => st.notebookOpen)
  const openRef = useRef(onOpenRoom)
  useEffect(() => { openRef.current = onOpenRoom })
  const page = !!onOpenRoom

  useEffect(() => {
    setNotebookHost(page ? { openRoom: (id, name) => openRef.current?.({ id, name }) } : null)
    return () => setNotebookHost(null)
  }, [page])

  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 1))
    const t = setTimeout(() => idle(() => { loadNotebookOverlay().catch(() => {}) }), 4000)
    return () => clearTimeout(t)
  }, [])

  // Sayfadan ayrılırken açık kalmasın (oyuna dönünce B'siz açılmasın)
  useEffect(() => () => { if (useStore.getState().notebookOpen) closeNotebookOverlay() }, [])

  if (!open) return null
  return (
    <Suspense fallback={<NotebookFallback />}>
      <NotebookOverlay />
    </Suspense>
  )
}
