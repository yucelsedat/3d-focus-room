// Seyir defteri: app/pano/[id].tsx — panodaki tek sayfalık not: çevrilecek başka sayfa yok. Boş
// açılırsa ilk satır kendiliğinden açılır, yazmaya hemen başlanır; geri dönünce not panoda görünür.
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import './library.css'
import './notebook/notebook.css'
import { boardPage, deleteBoardNote, getBoardNote } from './api.js'
import { deleteContentFiles } from './notebook/blockClipboard.js'
import { DEFAULT_PEN } from './notebook/marks.js'
import { NotebookPage } from './notebook/NotebookPage.jsx'

const SHEET_MAX = 820

export default function BoardNoteScreen() {
  const navigate = useNavigate()
  const { id } = useParams()
  const noteId = Number(id)
  const page = useMemo(() => boardPage(noteId), [noteId])
  const [note, setNote] = useState(null)
  const [reading, setReading] = useState(false)
  const [pen, setPen] = useState(DEFAULT_PEN)

  function back() {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/pano', { replace: true })
  }

  useEffect(() => {
    let cancelled = false
    getBoardNote(noteId)
      .then((result) => {
        if (cancelled) return
        // Not bu arada panodan kaldırıldıysa açılacak bir şey yok
        if (!result) navigate('/pano', { replace: true })
        else setNote(result)
      })
      .catch(() => !cancelled && navigate('/pano', { replace: true }))
    return () => {
      cancelled = true
    }
  }, [noteId, navigate])

  // Sayfa ayarlarından silinen not, eklerinin dosyalarıyla panodan kalkar; panoya dönülür
  async function deleteNote() {
    const contents = await deleteBoardNote(noteId).catch(() => null)
    if (contents) deleteContentFiles(contents)
    back()
  }

  return (
    <div className="lib-root">
      <div className="lib-app" style={styles.desk}>
        {/* Kâğıdı okunana kadar masa görünür */}
        {note && (
          <div style={styles.sheet}>
            <NotebookPage
              page={page}
              paper={note.paper}
              boardNote={note}
              onBack={back}
              reading={reading}
              onReadingChange={setReading}
              pen={pen}
              onPenChange={setPen}
              onDeletePage={deleteNote}
              autoStart
            />
          </div>
        )}
      </div>
    </div>
  )
}

const styles = {
  desk: {
    backgroundColor: '#2B2620',
    alignItems: 'center',
  },
  sheet: {
    position: 'relative',
    width: '100%',
    maxWidth: SHEET_MAX,
    height: '100%',
    boxShadow: '0 0 40px rgba(0, 0, 0, 0.45)',
  },
}
