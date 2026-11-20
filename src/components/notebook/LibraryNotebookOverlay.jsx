// Oyunda (ve /canvas, /timeline'da) açılan kitaplık defteri: ana sayfadaki kitaplığın defter
// ekranının (NotebookView) kendisi, tam ekran overlay olarak. Ayrı chunk — NotebookHost lazy yükler.
//
// Katman: z-index nişangahınkiyle (Crosshair) aynı en üst değer; App'te ondan sonra geldiği için
// üstte. Defter menüleri body'ye değil overlay içindeki portal köküne çizilir (portalRoot.js).
//
// Pointer lock: drei PointerLockControls document'e gelen HER tıklamada lock() çağırır (enabled
// false olsa bile). Kökte click yayılımı durdurulur; menüler de bu kökün içinde. Klavye kökte DURDURULMAZ: defter ok tuşlarını,
// seçim kısayollarını ve Esc'i window'da dinler. Oyunun tuş dinleyicileri notebookOpen ile susar.
import { useCallback, useRef } from 'react'
import { useStore } from '../../store/useStore'
import { NotebookView } from '../../pages/library/NotebookScreen.jsx'
import { LIB_PORTAL_ID } from '../../pages/library/portalRoot.js'
import { closeNotebookOverlay } from './notebookUi'
import { libKey, refreshLibrary } from './libraryShelf'

const FONT_UI = "'DM Sans', system-ui, sans-serif"

export default function LibraryNotebookOverlay({ id }) {
  const key = libKey(id)
  const held = useStore(st => st.heldNotebook === key)
  const setHeld = useStore(st => st.setHeldNotebook)

  // Silinmiş defter elde kalmasın. Kapanırken bırakılır — açıkken bırakılsa NotebookHost
  // "bulunamadı" ekranını hemen kapatırdı.
  const missing = useRef(false)
  const onMissing = useCallback(() => { missing.current = true }, [])

  // Geri düğmesi bir tıklamadır → defter B ile (kilitliyken) açıldıysa imleç yeniden kilitlenir.
  // Esc kilitlemez (tarayıcı Esc'ten hemen sonra kilidi reddeder).
  const close = useCallback((how, { drop = false } = {}) => {
    closeNotebookOverlay({ relock: how === 'button' })
    if ((drop || missing.current) && useStore.getState().heldNotebook === key) setHeld(null)
    // Kitaplıkta başlık / renk değişmiş olabilir; kartlar tazelensin
    refreshLibrary()
  }, [key, setHeld])

  const stop = (e) => e.stopPropagation()

  return (
    <div onClick={stop} onContextMenu={stop}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483647, cursor: 'auto' }}>
      <NotebookView notebookId={id} onClose={close} onMissing={onMissing} />
      {held && (
        <button type="button" title="Defteri elinden bırak"
          onClick={() => close('button', { drop: true })}
          style={{ position: 'fixed', right: 16, bottom: 16, zIndex: 1000, display: 'flex', alignItems: 'center', gap: 8,
            padding: '7px 12px 7px 10px', borderRadius: 999, border: '1px solid rgba(244,239,230,0.18)',
            background: 'rgba(29,26,22,0.82)', backdropFilter: 'blur(6px)', color: 'rgba(244,239,230,0.85)', cursor: 'pointer',
            font: `800 10px ${FONT_UI}`, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: '#f4d35e' }} />
          elinde · yere bırak
        </button>
      )}
      {/* Defterin menüleri buraya portal edilir: overlay'in katmanında, tıklamaları da kökte durur */}
      <div id={LIB_PORTAL_ID} />
    </div>
  )
}
