// Seyir defteri: app/pano/index.tsx — Pano: tek sayfalık notların raptiyeyle tutturulduğu mantar.
// Artıya basınca yeni not oxford kâğıtta açılır ve hemen yazılır; geri dönünce not panonun en
// başında durur. Sağ üstteki kalemle düzenlemeye geçilir, notlar basılı tutulup sürüklenerek yer
// değiştirir; sol üstteki büyüteçle notlarda aranır. Nota sağ tıklayınca (dokunmatikte basılı
// tutunca) aç / panodan kaldır seçenekleri çıkar.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import './library.css'
import { createBoardNote, deleteBoardNote, deleteEmptyBoardNotes, getBoardNotes, setBoardNoteOrder, whenSaved } from './api.js'
import { BoardGrid } from './board/BoardGrid.jsx'
import { matchesBoardNote } from './board/boardNotes.js'
import { Cork } from './board/Cork.jsx'
import { AddButton, BottomNav } from './chrome.jsx'
import { Icon } from './icons.jsx'
import { deleteContentFiles } from './notebook/blockClipboard.js'
import { TornPaperMenu } from './TornPaperMenu.jsx'
import { board, colors, fonts, HAND_TAIL, type } from './theme.js'

export default function BoardScreen() {
  const navigate = useNavigate()
  const gridRef = useRef(null)
  const [notes, setNotes] = useState(null)
  const [editing, setEditing] = useState(false)
  // Arama açıkken başlığın yerinde arama alanı durur; aranan yazı geçen notlar görünür
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  // Seçenekleri açılan not; kâğıt kapanırken yazısı silinmesin diye kapanınca da tutulur
  const [selected, setSelected] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // Artıya art arda basılınca iki boş not açılmasın
  const creating = useRef(false)

  // Hiçbir şey yazılmadan bırakılan not panoya tutturulmaz
  useEffect(() => {
    let cancelled = false
    // Nottan dönülünce son yazılanların kaydı bitsin; yoksa yazılan not boş sanılıp silinir
    whenSaved()
      .then(() => deleteEmptyBoardNotes())
      .catch(() => {})
      .then(() => getBoardNotes())
      .then((result) => !cancelled && setNotes(result))
      .catch(() => !cancelled && setNotes([]))
    return () => {
      cancelled = true
    }
  }, [])

  const shown = notes && query.trim() ? notes.filter((note) => matchesBoardNote(note, query)) : notes

  function openNote(id) {
    navigate(`/pano/${id}`)
  }

  function closeSearch() {
    setSearching(false)
    setQuery('')
  }

  // Escape önce aramayı, sonra düzenlemeyi kapatır
  useEffect(() => {
    if (!searching && !editing) return
    const onKey = (e) => {
      if (e.key !== 'Escape' || menuOpen) return
      if (searching) closeSearch()
      else setEditing(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searching, editing, menuOpen])

  async function addNote() {
    if (creating.current) return
    creating.current = true
    try {
      openNote(await createBoardNote())
    } catch {
      creating.current = false
    }
  }

  function move(id, to) {
    if (!notes) return
    const note = notes.find((n) => n.id === id)
    if (!note) return
    const next = notes.filter((n) => n.id !== id)
    next.splice(to, 0, note)
    setNotes(next.map((n, position) => ({ ...n, position })))
    setBoardNoteOrder(next.map((n) => n.id)).catch(() => {})
  }

  function select(note) {
    setConfirmingDelete(false)
    setSelected(note)
    setMenuOpen(true)
  }

  async function removeSelected() {
    if (!selected) return
    const { id } = selected
    setMenuOpen(false)
    const contents = await deleteBoardNote(id).catch(() => null)
    if (contents) deleteContentFiles(contents)
    setNotes((prev) => prev?.filter((n) => n.id !== id) ?? prev)
  }

  const menuOptions = confirmingDelete
    ? [
        { label: 'Evet, sil', danger: true, onPress: removeSelected },
        { label: 'Vazgeç', onPress: () => setConfirmingDelete(false) },
      ]
    : [
        {
          label: 'Aç',
          onPress: () => {
            setMenuOpen(false)
            if (selected) openNote(selected.id)
          },
        },
        { label: 'Panodan kaldır', danger: true, onPress: () => setConfirmingDelete(true) },
      ]

  const selectedName = selected?.title.trim() || 'Pano notu'
  // Yeri değişecek en az iki not olunca düzenlenebilir
  const canEdit = editing || (notes?.length ?? 0) > 1
  const nothingFound = query.trim() !== '' && shown?.length === 0

  return (
    <div className="lib-root">
      <div className="lib-app" style={styles.safe}>
        {searching ? (
          <header style={styles.header}>
            <label style={styles.searchField}>
              <Icon name="search" size={18} color={colors.onInk} style={styles.dim} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoFocus
                placeholder="Notlarda ara"
                aria-label="Notlarda ara"
                className="lib-board-search"
                style={styles.searchInput}
              />
              {query !== '' && (
                <button type="button" onClick={() => setQuery('')} aria-label="Aramayı temizle" className="lib-press" style={styles.clear}>
                  <Icon name="close-circle" size={18} color={colors.onInk} style={styles.dim} />
                </button>
              )}
            </label>
            <button type="button" onClick={closeSearch} aria-label="Aramayı kapat" className="lib-press" style={styles.closeSearch}>
              Kapat
            </button>
          </header>
        ) : (
          <header style={styles.header}>
            <button
              type="button"
              onClick={() => {
                setEditing(false)
                setSearching(true)
              }}
              disabled={editing || !notes?.length}
              aria-label="Notlarda ara"
              title="Notlarda ara"
              className="lib-press"
              style={{ ...styles.headerButton, ...(editing || !notes?.length ? styles.disabled : null) }}
            >
              <Icon name="search" size={22} color={colors.onInk} />
            </button>
            <div style={styles.headerText}>
              <h1 style={styles.title}>Pano</h1>
              {editing && <div style={styles.subtitle}>Basılı tut, sürükle</div>}
            </div>
            <button
              type="button"
              onClick={() => setEditing((on) => !on)}
              disabled={!canEdit}
              aria-label={editing ? 'Düzenlemeyi bitir' : 'Panoyu düzenle'}
              title={editing ? 'Düzenlemeyi bitir' : 'Notların yerini sürükleyerek değiştir'}
              className="lib-press"
              style={{ ...styles.headerButton, ...(!canEdit ? styles.disabled : null) }}
            >
              <Icon name={editing ? 'checkmark' : 'create-outline'} size={24} color={colors.onInk} />
            </button>
          </header>
        )}

        <div style={styles.frame}>
          <div style={styles.board}>
            <Cork />
            {shown && <BoardGrid ref={gridRef} notes={shown} editing={editing} onOpen={(note) => openNote(note.id)} onSelect={select} onMove={move} />}
            {notes?.length === 0 && (
              <div style={styles.empty}>
                <div style={styles.emptyTitle}>{'Pano boş' + HAND_TAIL}</div>
                <div style={styles.emptyText}>{'Yeni not için artıya bas' + HAND_TAIL}</div>
              </div>
            )}
            {nothingFound && (
              <div style={styles.empty}>
                <div style={styles.emptyTitle}>{'Bulunamadı' + HAND_TAIL}</div>
                <div style={styles.emptyText}>{`“${query.trim()}” hiçbir notta yok` + HAND_TAIL}</div>
              </div>
            )}
          </div>
          {!editing && <AddButton label="Yeni not" hint="Yeni bir not açar, panoya tutturur" onPress={addNote} />}
        </div>

        <BottomNav active="board" onReselect={() => gridRef.current?.scrollToTop(true)} />

        <TornPaperMenu
          visible={menuOpen}
          title={confirmingDelete ? `“${selectedName}” panodan kaldırılsın mı?` : selectedName}
          message={confirmingDelete ? 'Notun yazıları da silinir.' : undefined}
          options={menuOptions}
          onClose={() => setMenuOpen(false)}
        />
      </div>
    </div>
  )
}

const plain = {
  margin: 0,
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
}

const styles = {
  safe: {
    backgroundColor: colors.ink,
  },
  header: {
    height: 64,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    padding: '0 8px',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  headerButton: {
    ...plain,
    width: 44,
    height: 44,
    borderRadius: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.25,
    cursor: 'default',
  },
  title: {
    margin: 0,
    ...fonts.displayBold,
    fontSize: type.title,
    color: colors.onInk,
  },
  subtitle: {
    ...fonts.bodyThin,
    fontSize: type.caption,
    letterSpacing: 1.5,
    color: colors.onInk,
  },
  dim: {
    opacity: 0.6,
  },
  searchField: {
    flex: 1,
    height: 42,
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginLeft: 8,
    padding: '0 14px',
    borderRadius: 21,
    backgroundColor: 'rgba(244, 239, 230, 0.12)',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: 42,
    margin: 0,
    padding: 0,
    border: 0,
    outline: 'none',
    background: 'transparent',
    ...fonts.bodyThin,
    fontSize: 17,
    color: colors.onInk,
    caretColor: colors.accent,
  },
  clear: {
    ...plain,
    display: 'flex',
  },
  closeSearch: {
    ...plain,
    height: 44,
    padding: '0 10px',
    borderRadius: 22,
    ...fonts.bodyBold,
    fontSize: type.body,
    color: colors.onInk,
  },
  // Ceviz çerçeve; mantar içinde durur
  frame: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    display: 'flex',
    padding: 8,
    backgroundColor: board.frame,
  },
  board: {
    position: 'relative',
    flex: 1,
    overflow: 'hidden',
    borderRadius: 2,
  },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 24px 50px',
    pointerEvents: 'none',
  },
  emptyTitle: {
    ...fonts.handBold,
    fontSize: 38,
    color: '#3B2716',
  },
  emptyText: {
    ...fonts.hand,
    fontSize: 22,
    textAlign: 'center',
    color: '#4A321D',
  },
}
