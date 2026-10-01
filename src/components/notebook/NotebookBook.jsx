// Spiral ciltli defter: sekmeler + sayfa yığını + sayfa çevirme.
// Çevirme: canlı sayfanın ÜSTÜNE salt-okunur bir "yaprak" katmanı konur ve sol
// kenar etrafında rotateY ile döner. perspective yalnızca bu katmanda — canlı
// sayfanın atalarında transform yok (dnd-kit koordinatları bozulmasın).
import { useEffect, useMemo, useState } from 'react'
import { NotebookPage } from './NotebookPage'
import { PageTabs } from './PageTabs'
import { gen } from './roughUtils'
import { PAPER, GRAIN, SHEET_BG, BOOK_H, BOOK_W, prefersReducedMotion } from './paperStyles'

// Cilt telleri: sayfa kenarından taşan el çizimi halkalar (sabit seed)
function Coils() {
  const paths = useMemo(() => {
    const out = []
    for (let i = 0; i < 40; i++) {
      const y = 16 + i * 32
      // Delik merkezi (sayfada x=22) svg'de x=40; tel delikten çıkıp sayfa kenarını dolanır
      out.push(...gen.toPaths(gen.arc(40, y, 66, 11, Math.PI * 0.5, Math.PI * 1.5, false, {
        seed: 900 + i, stroke: '#9aa0aa', strokeWidth: 2.6, roughness: 0.55, bowing: 0.5,
      })))
    }
    return out
  }, [])
  return (
    <svg style={s.coils} width="48" height={16 + 40 * 32} aria-hidden="true" focusable="false">
      {paths.map((p, i) => (
        <path key={i} d={p.d} stroke={p.stroke} strokeWidth={p.strokeWidth} fill="none" strokeLinecap="round" />
      ))}
    </svg>
  )
}

export function NotebookBook({
  doc, activeId, onSelectPage, filter, currentRoomId, treeById, onDragState,
  editingId, onEditStart, onEditEnd, onAddPage, onRenamePage, onDeletePage, children,
}) {
  const [turn, setTurn] = useState(null) // { from, to, dir }
  const pages = doc.pages
  const index = (id) => pages.findIndex(p => p.id === id)

  // animationend kaçarsa (sekme gizlendi vb.) çevirme yarıda kalmasın
  useEffect(() => {
    if (!turn) return
    const t = setTimeout(() => setTurn(null), 900)
    return () => clearTimeout(t)
  }, [turn])

  const goTo = (id) => {
    if (turn || id === activeId || index(id) < 0) return
    if (!prefersReducedMotion() && index(activeId) >= 0) {
      setTurn({ from: activeId, to: id, dir: index(id) > index(activeId) ? 'fwd' : 'back' })
    }
    onSelectPage(id)
  }

  // Yeni sayfa sona eklenir → ileri çevrilerek açılır (henüz props'ta olmadığı için goTo'yu atlar)
  const addAndTurn = () => {
    if (turn) return
    const id = onAddPage()
    if (!id) return
    if (!prefersReducedMotion()) setTurn({ from: activeId, to: id, dir: 'fwd' })
  }

  // İleri: alttaki yeni sayfa, eski sayfa yaprak olup sola döner.
  // Geri: alttaki eski sayfa kalır, önceki sayfa soldan dönüp üstüne kapanır.
  const underId = turn ? (turn.dir === 'fwd' ? turn.to : turn.from) : activeId
  const leafId = turn ? (turn.dir === 'fwd' ? turn.from : turn.to) : null
  const under = pages.find(p => p.id === underId) ?? pages[0]
  const leaf = leafId ? pages.find(p => p.id === leafId) : null

  return (
    <div style={s.book} className="nb-book-in">
      <PageTabs
        pages={pages}
        activeId={activeId}
        editingId={editingId}
        onSelect={goTo}
        onAdd={addAndTurn}
        onRename={onRenamePage}
        onDelete={onDeletePage}
        onEditStart={onEditStart}
        onEditEnd={onEditEnd}
      />
      <div style={s.stackShadow} aria-hidden="true" />
      <div style={s.stackEdge} aria-hidden="true" />
      <div key={under.id} className="nb-sheet-in" style={s.sheet}>
        <NotebookPage
          page={under}
          pageNumber={index(under.id) + 1}
          filter={filter}
          currentRoomId={currentRoomId}
          treeById={treeById}
          onDragState={onDragState}
        />
      </div>

      {leaf && (
        <div style={s.turnStage} aria-hidden="true">
          <div
            key={`${turn.from}-${turn.to}`}
            className={`nb-leaf ${turn.dir}`}
            onAnimationEnd={(e) => { if (e.target === e.currentTarget) setTurn(null) }}
          >
            <div className="nb-face nb-face-front" style={s.face}>
              <NotebookPage
                page={leaf}
                pageNumber={index(leaf.id) + 1}
                readOnly
                filter={filter}
                currentRoomId={currentRoomId}
                treeById={treeById}
              />
            </div>
            <div className="nb-face nb-face-back" style={s.faceBack} />
          </div>
        </div>
      )}

      <Coils />
      {children}
    </div>
  )
}

const sheetBase = {
  position: 'absolute',
  inset: 0,
  background: SHEET_BG,
  borderRadius: '3px 10px 10px 3px',
}

const s = {
  book: {
    position: 'relative',
    height: BOOK_H,
    width: BOOK_W,
    marginTop: 30,
    animation: 'nb-in 260ms cubic-bezier(.2,.8,.2,1) both',
  },
  stackShadow: {
    position: 'absolute',
    inset: 0,
    borderRadius: '3px 10px 10px 3px',
    boxShadow: '0 30px 60px -20px rgba(0,0,0,0.75), 0 12px 24px -12px rgba(0,0,0,0.55)',
  },
  // Alttaki sayfaların kenarı: sağ-altta hafif kaymış iki kağıt
  stackEdge: {
    position: 'absolute',
    inset: 0,
    transform: 'translate(5px, 5px) rotate(0.35deg)',
    background: PAPER,
    borderRadius: '3px 10px 10px 3px',
    boxShadow: '2px 3px 0 -1px #e6dfcc, 4px 6px 0 -2px #d9d1bb',
    filter: 'brightness(0.93)',
  },
  sheet: sheetBase,
  turnStage: {
    position: 'absolute',
    inset: 0,
    perspective: 2400,
    pointerEvents: 'none',
    zIndex: 2,
  },
  face: sheetBase,
  faceBack: {
    ...sheetBase,
    background: `linear-gradient(270deg, rgba(0,0,0,0.12), transparent 30%), ${GRAIN}, #efe8d6`,
  },
  coils: {
    position: 'absolute',
    left: -18,
    top: 0,
    height: '100%',
    overflow: 'hidden',
    pointerEvents: 'none',
    zIndex: 3,
  },
}
