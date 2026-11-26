// ── Duvardaki defter tile'ı ───────────────────────────────────────────────────
// Kitaplıktaki bir defterin (ShelfBook, 'lib:<id>') kendisi duvarda: kitaplıktaki defter ekranı
// (NotebookView) metin tile boyutunda (4 × 5 birim) çizilir. Yazma, araç çubukları, menüler, çizim,
// ekler — hepsi kitaplıktaki defterle aynı; kopya yok, aynı sayfalara yazılır. İlaveten tile'ın iki
// yanında sayfayı sola / sağa çeviren düğmeler durur (duvarda ok tuşları oyunda yürür).
//
// Tile içeriği yalnızca referanstır: { "notebook": "lib:<id>" } (bkz. notebook/defterTile.js).
// - drei Html ayrı bir React kökü açar: router bağlamı gelmez → NotebookView MemoryRouter içinde.
// - Defterin menüleri (TornPaperMenu, PageSidebar, ImageViewer) PortalBoxContext ile ekrana değil
//   tile'ın içine açılır; kutu transform'lu olduğu için position:fixed katmanlar da tile'a sığar.
// - Tıklamalar kökte durur: drei PointerLockControls document'e gelen her tıklamada imleci kilitler.
// - Aynı defter oyunda tam ekran açılıp kapanınca tile yeniden kurulur, yazılanlar tazelenir.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'

import { PortalBoxContext } from '../pages/library/portalRoot.js'
import { PageTurnButton } from '../pages/library/notebook/PageTurnButton.jsx'
import { storageGet, storageSet } from '../pages/library/state.js'
import { colors } from '../pages/library/theme.js'
import { useStore } from '../store/useStore'
import { MD_PX_PER_UNIT } from '../utils/markdownRender'
import { ensureLibrary, libKey, useLibrary } from './notebook/libraryShelf'

const FONT_UI = "'DM Sans', system-ui, sans-serif"
const FONT_DISPLAY = "'Fraunces', Georgia, serif"
const TURN_SIZE = 44
const TURN_GAP = 18

// Defter ekranı ayrı chunk (oyundaki tam ekran defterle aynı); duvarda ilk defter tile'ı çizilince iner
const NotebookView = lazy(() => import('../pages/library/NotebookScreen.jsx').then((m) => ({ default: m.NotebookView })))

const pageStoreKey = (mediaId) => `focusroom.defterTile.${mediaId}.page`

export function LibraryNotebookTile({ id, notebookId, width, height }) {
  const pxWidth = Math.round(width * MD_PX_PER_UNIT)
  const pxHeight = Math.round(height * MD_PX_PER_UNIT)
  const key = libKey(notebookId)

  const book = useLibrary((s) => s.byId[notebookId])
  const libState = useLibrary((s) => s.state)
  useEffect(() => { ensureLibrary() }, [])
  // Liste yüklendi ama defter yok: kitaplıktan silinmiş
  const deleted = libState === 'ready' && !book

  // Aynı defter oyunda tam ekran açılıp kapandı → tile yeniden kurulur (yazılanlar tazelenir)
  const [generation, setGeneration] = useState(0)
  useEffect(
    () =>
      useStore.subscribe((st, prev) => {
        if (prev.notebookOpen && !st.notebookOpen && prev.heldNotebook === key) setGeneration((g) => g + 1)
      }),
    [key],
  )

  // Her tile kendi kaldığı sayfayı hatırlar (kitaplığın "son sayfa"sını değiştirmez)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- yeniden kurulunca son sayfadan açılsın
  const pageKey = useMemo(() => storageGet(pageStoreKey(id)) ?? undefined, [id, generation])
  const onPageChange = useCallback((k) => storageSet(pageStoreKey(id), k), [id])

  const control = useRef(null)
  const [turn, setTurn] = useState({ canPrev: false, canNext: false })
  const onTurnState = useCallback((next) => {
    setTurn((prev) => (prev.canPrev === next.canPrev && prev.canNext === next.canNext ? prev : next))
  }, [])

  // Defterin menüleri bu kutunun içine açılır
  const [portalEl, setPortalEl] = useState(null)
  const box = useMemo(() => (portalEl ? { el: portalEl, width: pxWidth, height: pxHeight } : null), [portalEl, pxWidth, pxHeight])

  const stop = (e) => e.stopPropagation()
  const showTurn = !deleted && notebookId !== null

  return (
    <div
      style={{ position: 'relative', width: `${pxWidth}px`, height: `${pxHeight}px`, pointerEvents: 'none' }}
      onClick={stop}
      onContextMenu={stop}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          // position:fixed katmanlar (menü, kenar çubuğu, resim) bu kutuya göre yerleşsin
          transform: 'translateZ(0)',
          overflow: 'hidden',
          borderRadius: 6,
          background: '#1d1a16',
          boxShadow: '0 18px 40px -16px rgba(0,0,0,0.7)',
          pointerEvents: 'auto',
          cursor: 'auto',
        }}
      >
        {deleted ? (
          <div style={styles.deleted}>
            <span style={{ font: `italic 200 40px ${FONT_DISPLAY}`, color: colors.onInk }}>silinmiş defter</span>
            <span style={{ font: `200 18px ${FONT_UI}`, color: 'rgba(244,239,230,0.6)', textAlign: 'center' }}>
              Bu defter kitaplıktan kaldırılmış. Tile'ı silebilir ya da yerine başka bir defter koyabilirsin.
            </span>
          </div>
        ) : (
          <PortalBoxContext.Provider value={box}>
            <MemoryRouter>
              <Suspense fallback={<div style={styles.loading}>defter açılıyor…</div>}>
                <NotebookView
                  key={generation}
                  notebookId={notebookId}
                  pageKey={pageKey}
                  tile
                  controlRef={control}
                  onPageChange={onPageChange}
                  onTurnState={onTurnState}
                />
              </Suspense>
            </MemoryRouter>
          </PortalBoxContext.Provider>
        )}
        {/* Menülerin portal hedefi: konumsuz (fixed katmanlar transform'lu kutuya göre durur) */}
        <div ref={setPortalEl} />
      </div>

      {showTurn && (
        <>
          {/* Tile'ın dışında, kenarların ortasında */}
          <PageTurnButton side="left" size={TURN_SIZE} style={styles.turn('left')} disabled={!turn.canPrev} onPress={() => control.current?.turn(-1)} />
          <PageTurnButton side="right" size={TURN_SIZE} style={styles.turn('right')} disabled={!turn.canNext} onPress={() => control.current?.turn(1)} />
        </>
      )}
    </div>
  )
}

const styles = {
  turn: (side) => ({
    position: 'absolute',
    top: '50%',
    [side]: -(TURN_SIZE + 4 + TURN_GAP + 8),
    transform: 'translateY(-50%)',
  }),
  loading: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'rgba(247,242,228,0.7)',
    fontFamily: "'Caveat', cursive",
    fontSize: 34,
  },
  deleted: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    padding: '0 48px',
  },
}
