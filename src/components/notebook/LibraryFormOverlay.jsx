// Oyunda (ve /canvas, /timeline'da) kitaplığın defter formu: yeni defter / defteri düzenle.
// Kitaplıktaki formun kendisi (NotebookForm), tam ekran overlay olarak; akış libraryForm.js'te.
// Kabuk LibraryNotebookOverlay ile aynı kurallarla: kökte click durur (drei PointerLockControls),
// klavye durmaz (oyun dinleyicileri notebookOpen ile susar), menüler overlay içindeki portal köküne.
import { useEffect, useRef } from 'react'
import { EditNotebookForm, NewNotebookForm } from '../../pages/library/NotebookForm.jsx'
import { LIB_PORTAL_ID } from '../../pages/library/portalRoot.js'
import { settleLibraryForm } from './libraryForm'

export default function LibraryFormOverlay({ request }) {
  const { token } = request
  // Form başka yoldan kapanırsa (sayfadan çıkma) bekleyen söz vazgeçilmiş sayılır. StrictMode
  // geliştirmede efekti kur–sök–kur yapar: söküm bir tur ertelenir, yeniden kurulduysa bir şey olmaz.
  const alive = useRef(false)
  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      setTimeout(() => { if (!alive.current) settleLibraryForm(null, token) }, 0)
    }
  }, [token])

  const cancel = () => settleLibraryForm(null, token)
  const stop = (e) => e.stopPropagation()

  return (
    <div onClick={stop} onContextMenu={stop}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483647, cursor: 'auto' }}>
      {request.mode === 'edit'
        ? <EditNotebookForm id={request.id} onDone={() => settleLibraryForm(true, token)} onCancel={cancel} />
        : <NewNotebookForm categoryId={request.categoryId} title={request.title} onDone={(id) => settleLibraryForm(id, token)} onCancel={cancel} />}
      <div id={LIB_PORTAL_ID} />
    </div>
  )
}
