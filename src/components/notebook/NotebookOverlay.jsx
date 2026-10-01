// B ile açılan oda defteri. Defter en üstteki kök odaya aittir; ağaçtaki tüm
// alt odalar aynı defteri görür.
//
// Pointer lock: drei PointerLockControls document'e gelen HER tıklamada lock()
// çağırır (enabled=false olsa bile). Bu yüzden kökte click yayılımı durdurulur ve
// hiçbir şey body'ye portal edilmez. Yeniden kilit yalnızca X / oda etiketi
// tıklamasında (kullanıcı etkileşimi içinde) istenir; Esc kilitlemez.
//
// Klavye: textarea/input'tan gelen keydown kökte durdurulur → drei
// KeyboardControls ve Player'ın window dinleyicileri yazıyı duymaz. keyup asla
// durdurulmaz (drei basılı tuşu basılı sanmasın); tutamaktan gelen tuşlar
// dnd-kit KeyboardSensor document'te dinlediği için geçer.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useStore } from '../../store/useStore'
import {
  addPage, archiveCompleted, deletePage, renamePage, restoreArchived,
} from '../../utils/notebookModel'
import {
  useNotebookStore, loadNotebook, applyDoc, showToast, undoToast, dismissToast,
  closeNotebookOverlay,
} from './notebookStore'
import { NotebookBook } from './NotebookBook'
import { RoughCircle } from './Rough'
import { lineDataUri } from './roughUtils'
import {
  NOTEBOOK_CSS, HAND, SANS, SERIF, MONO, PAPER, PENCIL, PENCIL_SOFT, GRAIN, BOOK_H, BOOK_W, FLAG_OUT,
  readLS, writeLS,
} from './paperStyles'

const pad2 = (n) => String(n).padStart(2, '0')
const clock = (t) => { const d = new Date(t); return `${pad2(d.getHours())}:${pad2(d.getMinutes())}` }

function SaveStatus({ saveState, savedAt }) {
  const text = {
    saved: savedAt ? `kaydedildi · ${clock(savedAt)}` : 'kaydedildi',
    dirty: 'yazılıyor…',
    saving: 'kaydediliyor…',
    error: 'kaydedilemedi — tekrar denenecek',
  }[saveState]
  return (
    <div role="status" aria-live="polite" style={{ ...s.status, color: saveState === 'error' ? '#f0a29a' : 'rgba(247,242,228,0.55)' }}>
      <span style={{ ...s.statusDot, background: saveState === 'error' ? '#e0685c' : saveState === 'saved' ? '#9fd6c3' : '#f4d35e' }} />
      {text}
    </div>
  )
}

function ArchiveNote({ archive, onRestore }) {
  const items = archive.slice(-40).reverse()
  return (
    <div style={s.archive}>
      <div style={s.archiveTitle}>arşiv</div>
      {!items.length && <div style={s.archiveEmpty}>henüz bir şey yok</div>}
      <ul style={s.archiveList}>
        {items.map(a => (
          <li key={a.id} style={s.archiveItem}>
            <span style={s.archiveCell} title={a.pageTitle ? `${a.pageTitle} sayfasından` : undefined}>
              {/* flex item blok kutu olur; üstü çizme her satıra düşsün diye iç span inline kalır */}
              <span style={{ ...s.archiveText, backgroundImage: a.type === 'todo' ? lineDataUri(a.seed, 'strike') : 'none' }}>
                {a.text || '—'}
              </span>
            </span>
            <button type="button" onClick={() => onRestore(a.id)} style={s.archiveBtn} title="Sayfasına geri koy">geri al</button>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function NotebookOverlay() {
  const currentRoomId = useStore(st => st.currentRoomId)
  const currentRoomName = useStore(st => st.currentRoomName)
  const { doc, rootId, rootName, tree, loadState, saveState, savedAt, toast } = useNotebookStore(useShallow(st => ({
    doc: st.doc, rootId: st.rootId, rootName: st.rootName, tree: st.tree, loadState: st.loadState,
    saveState: st.saveState, savedAt: st.savedAt, toast: st.toast,
  })))

  const [filter, setFilter] = useState(() => (readLS('nb:filter') === 'room' ? 'room' : 'all'))
  const [selected, setSelected] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [archiveOpen, setArchiveOpen] = useState(false)
  const draggingRef = useRef(false)
  const editingRef = useRef(false)

  useEffect(() => { loadNotebook(currentRoomId) }, [currentRoomId])

  const treeById = useMemo(() => new Map(tree.map(r => [r.id, r])), [tree])
  const storedActive = useMemo(() => (rootId ? readLS(`nb:active:${rootId}`) : null), [rootId])
  const pages = doc?.pages ?? []
  const activeId = [selected, storedActive].find(id => id && pages.some(p => p.id === id)) ?? pages[0]?.id
  const archivable = useMemo(
    () => (doc && activeId ? archiveCompleted(doc, activeId).count : 0),
    [doc, activeId],
  )

  const selectPage = (id) => {
    setSelected(id)
    if (rootId) writeLS(`nb:active:${rootId}`, id)
  }
  const setFilterMode = (mode) => {
    setFilter(mode)
    writeLS('nb:filter', mode)
  }

  const onAddPage = () => {
    const res = applyDoc(d => addPage(d))
    if (!res?.pageId) return null
    selectPage(res.pageId)
    setEditingId(res.pageId)
    editingRef.current = true
    return res.pageId
  }
  const onDeletePage = (id) => {
    const before = useNotebookStore.getState().doc
    const res = applyDoc(d => deletePage(d, id))
    if (res?.pageId) {
      selectPage(res.pageId)
      const title = before.pages.find(p => p.id === id)?.title ?? 'Sayfa'
      showToast(`“${title}” silindi`, before)
    }
  }
  const onArchive = () => {
    const before = useNotebookStore.getState().doc
    const res = applyDoc(d => archiveCompleted(d, activeId))
    if (res?.count) showToast(`${res.count} satır arşive kaldırıldı`, before)
  }
  const onRestore = (rowId) => {
    const res = applyDoc(d => restoreArchived(d, rowId))
    if (res?.pageId && res.pageId !== activeId) selectPage(res.pageId)
  }

  const onKeyDown = (e) => {
    const tag = e.target.tagName
    const typing = tag === 'TEXTAREA' || tag === 'INPUT'
    if (e.key === 'Escape') {
      if (draggingRef.current || editingRef.current) return
      e.stopPropagation()
      if (typing) { e.target.blur(); return }
      closeNotebookOverlay({ relock: false })
      return
    }
    if (typing) e.stopPropagation()
  }

  // Esc'i odak defterin dışındayken de yakala (açılışta odak body'de)
  useEffect(() => {
    const onDocKey = (e) => {
      if (e.key !== 'Escape' || draggingRef.current || editingRef.current) return
      if (e.target instanceof Element && e.target.closest('.nb-root')) return
      closeNotebookOverlay({ relock: false })
    }
    document.addEventListener('keydown', onDocKey)
    return () => document.removeEventListener('keydown', onDocKey)
  }, [])

  const stop = (e) => e.stopPropagation()

  const closeButton = (
    <button
      type="button"
      onClick={() => closeNotebookOverlay({ relock: true })}
      aria-label="Defteri kapat"
      title="Kapat (Esc)"
      style={s.close}
    >
      <RoughCircle size={56} seed={4242} stroke="rgba(247,242,228,0.85)" />
      <span style={s.closeX}>×</span>
    </button>
  )

  return (
    <div
      className="nb-root"
      role="dialog"
      aria-modal="true"
      aria-label={`Oda defteri — ${rootName || 'yükleniyor'}`}
      style={s.backdrop}
      onClick={stop}
      onMouseDown={stop}
      onWheel={stop}
      onContextMenu={stop}
      onKeyDown={onKeyDown}
    >
      <style>{NOTEBOOK_CSS}</style>
      <div style={s.stage}>
        <aside className="nb-rail" style={s.rail}>
          <div>
            <div style={s.eyebrow}>Oda defteri</div>
            <div style={s.rootName} title="Bu defter kök odaya ait; tüm alt odalar aynı defteri görür">
              {rootName || '…'}
            </div>
            <div style={s.here}>şu an: <b style={s.hereName}>{currentRoomName}</b></div>
          </div>

          <div role="radiogroup" aria-label="Görünüm" style={s.segment}>
            {[['all', 'Tüm ağaç'], ['room', 'Bu oda']].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={filter === mode}
                onClick={() => setFilterMode(mode)}
                style={{ ...s.segBtn, ...(filter === mode ? s.segOn : null) }}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={s.actions}>
            <button type="button" disabled={!archivable} onClick={onArchive} style={{ ...s.action, opacity: archivable ? 1 : 0.4 }}>
              Bitenleri arşivle{archivable ? ` · ${archivable}` : ''}
            </button>
            <button type="button" onClick={() => setArchiveOpen(v => !v)} aria-expanded={archiveOpen} style={s.action}>
              {archiveOpen ? 'Arşivi gizle' : `Arşiv · ${doc?.archive.length ?? 0}`}
            </button>
          </div>

          {archiveOpen && doc && <ArchiveNote archive={doc.archive} onRestore={onRestore} />}

          <SaveStatus saveState={saveState} savedAt={savedAt} />

          <dl style={s.keys}>
            {[
              ['[] ', 'yapılacak'], ['# ', 'başlık'], ['- ', 'not'],
              ['Tab', 'alt görev'], ['Alt ↑↓', 'taşı'], ['Ctrl ↵', 'bitir'], ['Esc', 'kapat'],
            ].map(([k, v]) => (
              <div key={k} style={s.keyRow}>
                <dt style={s.kbd}>{k}</dt>
                <dd style={s.keyDesc}>{v}</dd>
              </div>
            ))}
          </dl>
        </aside>

        {doc && activeId ? (
          <NotebookBook
            doc={doc}
            activeId={activeId}
            onSelectPage={selectPage}
            filter={filter}
            currentRoomId={currentRoomId}
            treeById={treeById}
            onDragState={(v) => { draggingRef.current = v }}
            editingId={editingId}
            onEditStart={(id) => { setEditingId(id); editingRef.current = true }}
            onEditEnd={() => { setEditingId(null); editingRef.current = false }}
            onAddPage={onAddPage}
            onRenamePage={(id, title) => applyDoc(d => renamePage(d, id, title))}
            onDeletePage={onDeletePage}
          >
            {closeButton}
            {toast && (
              <div key={toast.id} role="status" style={s.toast}>
                <span>{toast.text}</span>
                {toast.undo && <button type="button" onClick={undoToast} style={s.toastBtn}>geri al</button>}
                <button type="button" onClick={dismissToast} aria-label="Kapat" style={s.toastX}>×</button>
              </div>
            )}
          </NotebookBook>
        ) : (
          <div style={s.placeholder}>
            {closeButton}
            <div style={s.placeholderText}>
              {loadState === 'error' ? 'defter açılamadı…' : 'defter açılıyor…'}
            </div>
            {loadState === 'error' && (
              <button type="button" onClick={() => loadNotebook(currentRoomId)} style={s.retry}>tekrar dene</button>
            )}
          </div>
        )}

      </div>
    </div>
  )
}

const RAIL_W = 216

const s = {
  backdrop: {
    position: 'fixed',
    inset: 0,
    zIndex: 2147483647,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Oda net görünsün: bulanıklık yok, yalnızca kenarlarda hafif kararma
    background: 'radial-gradient(130% 100% at 50% 50%, transparent 55%, rgba(0,0,0,0.38) 100%)',
    cursor: 'default',
    overflow: 'hidden',
  },
  stage: {
    position: 'relative',
    display: 'flex',
    alignItems: 'flex-start',
    gap: 44,
    paddingRight: FLAG_OUT - 20, // sağa taşan ayraç şeridi kadar dengele
  },
  placeholder: {
    position: 'relative',
    height: BOOK_H,
    width: BOOK_W,
    marginTop: 30,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    background: `${GRAIN}, ${PAPER}`,
    borderRadius: '3px 10px 10px 3px',
    boxShadow: '0 30px 60px -20px rgba(0,0,0,0.75)',
  },
  placeholderText: { fontFamily: HAND, fontSize: 34, color: PENCIL_SOFT },
  retry: {
    fontFamily: SANS, fontWeight: 800, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
    padding: '8px 14px', border: `1.5px solid ${PENCIL}`, background: 'transparent', color: PENCIL, cursor: 'pointer', borderRadius: 3,
  },
  // Arka plan artık net oda: ray kendi koyu cam kartında okunur kalır
  rail: {
    width: RAIL_W,
    marginTop: 30,
    boxSizing: 'border-box',
    padding: '22px 20px',
    display: 'flex',
    flexDirection: 'column',
    gap: 22,
    color: 'rgba(247,242,228,0.88)',
    maxHeight: BOOK_H,
    overflowY: 'auto',
    scrollbarWidth: 'none',
    background: 'rgba(14,14,17,0.78)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(247,242,228,0.12)',
    borderRadius: 10,
    boxShadow: '0 18px 40px -18px rgba(0,0,0,0.7)',
  },
  // Defterin sağ üst köşesinin dışında (başlık hizası: ayraçlarla çakışmaz)
  close: {
    position: 'absolute',
    top: 2,
    right: -74,
    zIndex: 4,
    width: 56,
    height: 56,
    padding: 0,
    background: 'rgba(14,14,17,0.72)',
    border: 0,
    borderRadius: '50%',
    boxShadow: '0 8px 18px -8px rgba(0,0,0,0.7)',
    cursor: 'pointer',
  },
  closeX: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: HAND,
    fontWeight: 700,
    fontSize: 38,
    lineHeight: 1,
    color: 'rgba(247,242,228,0.92)',
    paddingBottom: 4,
  },
  eyebrow: {
    fontFamily: SANS,
    fontWeight: 800,
    fontSize: 10,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: 'rgba(247,242,228,0.5)',
    marginBottom: 6,
  },
  rootName: {
    fontFamily: SERIF,
    fontWeight: 200,
    fontStyle: 'italic',
    fontSize: 34,
    lineHeight: 1.05,
    letterSpacing: '-0.01em',
    color: '#f7f2e4',
    overflowWrap: 'anywhere',
  },
  here: {
    marginTop: 10,
    fontFamily: SANS,
    fontWeight: 200,
    fontSize: 13,
    color: 'rgba(247,242,228,0.6)',
  },
  hereName: { fontWeight: 800, color: 'rgba(247,242,228,0.85)' },
  segment: {
    display: 'flex',
    border: '1px solid rgba(247,242,228,0.25)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  segBtn: {
    flex: 1,
    padding: '9px 6px',
    background: 'transparent',
    border: 0,
    cursor: 'pointer',
    fontFamily: SANS,
    fontWeight: 800,
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'rgba(247,242,228,0.55)',
  },
  segOn: { background: '#f7f2e4', color: '#1b1a18' },
  actions: { display: 'flex', flexDirection: 'column', gap: 8 },
  action: {
    textAlign: 'left',
    padding: '10px 12px',
    background: 'rgba(247,242,228,0.06)',
    border: '1px solid rgba(247,242,228,0.16)',
    borderRadius: 4,
    cursor: 'pointer',
    fontFamily: SANS,
    fontWeight: 800,
    fontSize: 10,
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    color: 'rgba(247,242,228,0.85)',
  },
  archive: {
    position: 'relative',
    padding: '14px 14px 12px',
    background: `${GRAIN}, #f4d35e`,
    color: PENCIL,
    transform: 'rotate(1.2deg)',
    boxShadow: '0 12px 22px -12px rgba(0,0,0,0.7)',
    borderRadius: 2,
  },
  archiveTitle: { fontFamily: HAND, fontWeight: 700, fontSize: 24, lineHeight: '26px', marginBottom: 6 },
  archiveEmpty: { fontFamily: HAND, fontSize: 19, color: PENCIL_SOFT },
  archiveList: { listStyle: 'none', margin: 0, padding: 0, maxHeight: 260, overflowY: 'auto', scrollbarWidth: 'thin' },
  archiveItem: { display: 'flex', alignItems: 'baseline', gap: 8, padding: '2px 0' },
  archiveCell: { flex: 1, minWidth: 0, overflowWrap: 'anywhere' },
  archiveText: {
    fontFamily: HAND,
    fontSize: 19,
    lineHeight: '24px',
    color: PENCIL_SOFT,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: '0 60%',
    backgroundSize: '100% 100%',
    WebkitBoxDecorationBreak: 'clone',
    boxDecorationBreak: 'clone',
  },
  archiveBtn: {
    flex: '0 0 auto',
    background: 'transparent',
    border: 0,
    padding: 0,
    cursor: 'pointer',
    fontFamily: SANS,
    fontWeight: 800,
    fontSize: 9,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: 'rgba(44,44,52,0.7)',
    textDecoration: 'underline',
    textUnderlineOffset: 2,
  },
  status: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontFamily: MONO,
    fontWeight: 200,
    fontSize: 11,
    letterSpacing: '0.02em',
  },
  statusDot: { width: 6, height: 6, borderRadius: '50%', flex: '0 0 auto' },
  keys: { margin: 0, display: 'grid', gap: 5 },
  keyRow: { display: 'flex', alignItems: 'baseline', gap: 10 },
  kbd: {
    flex: '0 0 62px',
    margin: 0,
    fontFamily: MONO,
    fontWeight: 800,
    fontSize: 11,
    color: 'rgba(247,242,228,0.75)',
    whiteSpace: 'pre',
  },
  keyDesc: {
    margin: 0,
    fontFamily: SANS,
    fontWeight: 200,
    fontSize: 12,
    color: 'rgba(247,242,228,0.55)',
  },
  toast: {
    position: 'absolute',
    left: '50%',
    bottom: 58,
    zIndex: 6,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '10px 14px 10px 18px',
    background: `${GRAIN}, #f4d35e`,
    boxShadow: '0 14px 26px -12px rgba(0,0,0,0.65)',
    fontFamily: HAND,
    fontSize: 23,
    color: PENCIL,
    whiteSpace: 'nowrap',
    animation: 'nb-toast 220ms ease-out both',
    borderRadius: 2,
  },
  toastBtn: {
    background: 'transparent',
    border: `1.5px solid ${PENCIL}`,
    borderRadius: 3,
    padding: '4px 9px',
    cursor: 'pointer',
    fontFamily: SANS,
    fontWeight: 800,
    fontSize: 10,
    letterSpacing: '0.14em',
    textTransform: 'uppercase',
    color: PENCIL,
  },
  toastX: {
    background: 'transparent',
    border: 0,
    padding: 0,
    cursor: 'pointer',
    fontFamily: HAND,
    fontSize: 24,
    lineHeight: 1,
    color: 'rgba(44,44,52,0.55)',
  },
}
