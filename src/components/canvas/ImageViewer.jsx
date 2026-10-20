// ── Tam ekran resim görüntüleyici (carousel) ─────────────────────────────────
// Canvas tile ve Timeline ortak. images: [{ id, url }].
// ownKeys: klavyeyi (ESC / A-D / ← → / Home-End) kendisi yönetir — window capture
// aşamasında dinlediği için alttaki yüzeylerin document dinleyicilerinden önce çalışır.
import { useState, useEffect, useRef, useEffectEvent } from 'react'
import { imageName } from './canvasUtils'

const clampZoom = (s) => Math.min(8, Math.max(1, s))

// Tek resmin sahnesi: tekerlekle imleç etrafında yakınlaştırma, yakınken sürükleyerek
// kaydırma, çift tıkla %250 ↔ sığdır. Resim değişince key ile remount → zoom sıfırlanır.
const ViewerStage = ({ item, onBackdrop, onZoomChange }) => {
  const [ok, setOk] = useState(true)
  const [z, setZ] = useState({ s: 1, x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef(null)
  const stageRef = useRef(null)

  useEffect(() => { onZoomChange?.(z.s) }, [z.s]) // eslint-disable-line

  // imlecin sahne merkezine göre konumu
  const rel = (e) => {
    const r = stageRef.current.getBoundingClientRect()
    return { cx: e.clientX - r.left - r.width / 2, cy: e.clientY - r.top - r.height / 2 }
  }
  // (cx,cy) altındaki nokta sabit kalacak şekilde yeni ölçeğe geç
  const zoomAt = (p, s, cx, cy) => {
    const ns = clampZoom(s)
    if (ns === 1) return { s: 1, x: 0, y: 0 }
    const k = ns / p.s
    return { s: ns, x: cx - (cx - p.x) * k, y: cy - (cy - p.y) * k }
  }

  const onWheel = (e) => {
    const { cx, cy } = rel(e)
    setZ(p => zoomAt(p, p.s * (e.deltaY < 0 ? 1.18 : 1 / 1.18), cx, cy))
  }
  const onDoubleClick = (e) => {
    const { cx, cy } = rel(e)
    setZ(p => (p.s > 1 ? { s: 1, x: 0, y: 0 } : zoomAt(p, 2.5, cx, cy)))
  }
  const onPointerDown = (e) => {
    if (e.button !== 0) return
    dragRef.current = { px: e.clientX, py: e.clientY, x: z.x, y: z.y, moved: false }
    if (z.s > 1) { e.currentTarget.setPointerCapture(e.pointerId); setDragging(true) }
  }
  const onPointerMove = (e) => {
    const d = dragRef.current; if (!d) return
    const dx = e.clientX - d.px, dy = e.clientY - d.py
    if (Math.abs(dx) + Math.abs(dy) > 4) d.moved = true
    if (z.s > 1) setZ(p => ({ ...p, x: d.x + dx, y: d.y + dy }))
  }
  const onPointerUp = (e) => {
    const d = dragRef.current; dragRef.current = null
    setDragging(false)
    // sığdırılmışken resim dışındaki boşluğa tek tık → kapat
    if (d && !d.moved && z.s === 1 && e.target === e.currentTarget) onBackdrop?.()
  }

  return (
    <div ref={stageRef} onWheel={onWheel} onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        cursor: z.s > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in', touchAction: 'none' }}>
      {ok ? (
        <img src={item.url} alt={imageName(item.url)} draggable={false} referrerPolicy="no-referrer" onError={() => setOk(false)}
          // kutu sahneyi doldurur, resim içine contain ile sığar (küçük resimler de ekranı doldurur);
          // yan boşluklar ok butonlarına yer bırakır
          style={{ width: 'calc(100% - 200px)', height: 'calc(100% - 32px)', objectFit: 'contain', display: 'block',
            transform: `translate(${z.x}px, ${z.y}px) scale(${z.s})`, transformOrigin: 'center',
            transition: dragging ? 'none' : 'transform 140ms ease-out', pointerEvents: 'none' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, color: 'rgba(226,232,240,0.55)', pointerEvents: 'none' }}>
          <span style={{ fontSize: 96, opacity: 0.4 }}>🖼️</span>
          <span style={{ fontSize: 20 }}>Resim yüklenemedi</span>
        </div>
      )}
    </div>
  )
}

const viewerBtn = { height: 52, minWidth: 52, padding: '0 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.16)',
  background: 'rgba(20,20,32,0.72)', color: '#e2e8f0', fontSize: 22, cursor: 'pointer', lineHeight: 1,
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexShrink: 0 }

export const ImageViewer = ({ images, index, onStep, onJump, onClose, onDownload, ownKeys = false }) => {
  const item = images[index]
  const [zoomPct, setZoomPct] = useState(100)
  const stripRef = useRef(null)
  const many = images.length > 1

  // ownKeys: canvas'ın keydown dinleyicisine bağlı olmayan kullanımlar (timeline, not galerisi)
  const onOwnKey = useEffectEvent((e) => {
    e.stopPropagation()
    if (e.ctrlKey || e.metaKey || e.altKey) return
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key
    const act = k === 'Escape' ? () => onClose()
      : (k === 'a' || k === 'ArrowLeft')  ? () => onStep(-1)
      : (k === 'd' || k === 'ArrowRight') ? () => onStep(1)
      : k === 'Home' ? () => onStep('first')
      : k === 'End'  ? () => onStep('last')
      : null
    if (act) { e.preventDefault(); if (!e.repeat || k !== 'Escape') act() }
  })
  useEffect(() => {
    if (!ownKeys) return
    const onKey = (e) => onOwnKey(e)
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [ownKeys])

  // aktif küçük resmi şeritte görünür tut
  useEffect(() => {
    stripRef.current?.querySelector(`[data-idx="${index}"]`)?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' })
  }, [index])
  // komşu resimleri önceden yükle → geçişte beklemesin
  useEffect(() => {
    if (!many) return
    for (const d of [-1, 1]) {
      const n = images[(index + d + images.length) % images.length]
      const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = n.url
    }
  }, [index, images, many])

  const block = (e) => e.stopPropagation()
  const arrow = (dir) => (
    <button onMouseDown={block} onPointerDown={block} onDoubleClick={block} onClick={(e) => { block(e); onStep(dir) }}
      title={dir < 0 ? 'Önceki (A / ←)' : 'Sonraki (D / →)'}
      style={{ ...viewerBtn, position: 'absolute', top: '50%', [dir < 0 ? 'left' : 'right']: 28, transform: 'translateY(-50%)',
        width: 72, height: 72, borderRadius: '50%', padding: 0, fontSize: 34, zIndex: 2, backdropFilter: 'blur(8px)' }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <polyline points={dir < 0 ? '15 5 8 12 15 19' : '9 5 16 12 9 19'} />
      </svg>
    </button>
  )

  return (
    <div onMouseDown={block} onMouseUp={block} onMouseMove={block} onClick={block} onDoubleClick={block} onWheel={block}
      style={{ position: 'fixed', inset: 0, zIndex: 2147483646, background: 'rgba(5,5,12,0.97)', backdropFilter: 'blur(8px)', display: 'flex', flexDirection: 'column',
        pointerEvents: 'auto', userSelect: 'none', color: '#e2e8f0' }}>
      {/* Üst çubuk: sayaç + dosya adı · kısayol ipucu · zoom / indir / kapat */}
      <div style={{ height: 84, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, padding: '0 28px', boxSizing: 'border-box' }}>
        <span style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
          {index + 1}<span style={{ fontWeight: 200, opacity: 0.55 }}> / {images.length}</span>
        </span>
        <span title={imageName(item.url)} style={{ fontSize: 18, opacity: 0.5, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {imageName(item.url)}
        </span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 16, opacity: 0.38, whiteSpace: 'nowrap', flexShrink: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {many ? 'A / D · ← / → geçiş  ·  ' : ''}tekerlek yakınlaştır · çift tık %250  ·  ESC kapat
        </span>
        {zoomPct > 100 && <span style={{ fontSize: 18, opacity: 0.7, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>{Math.round(zoomPct)}%</span>}
        <button onClick={(e) => { block(e); onDownload(item) }} title="Resmi indir" style={viewerBtn}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button onClick={(e) => { block(e); onClose() }} title="Kapat (ESC)" style={{ ...viewerBtn, fontSize: 28 }}>✕</button>
      </div>

      {/* Sahne */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        <ViewerStage key={item.id} item={item} onBackdrop={onClose} onZoomChange={(s) => setZoomPct(s * 100)} />
        {many && arrow(-1)}
        {many && arrow(1)}
      </div>

      {/* Küçük resim şeridi */}
      {many && (
        <div ref={stripRef} onWheel={(e) => { block(e); e.currentTarget.scrollLeft += e.deltaY + e.deltaX }}
          style={{ height: 112, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10, padding: '0 28px', overflowX: 'auto', overflowY: 'hidden',
            boxSizing: 'border-box', scrollbarWidth: 'thin', justifyContent: 'safe center' }}>
          {images.map((im, i) => (
            <button key={im.id} data-idx={i} onClick={(e) => { block(e); onJump(i) }} title={imageName(im.url)}
              style={{ width: 112, height: 76, flexShrink: 0, padding: 0, borderRadius: 8, overflow: 'hidden', cursor: 'pointer', background: '#1e222a',
                border: i === index ? '3px solid #60a5fa' : '3px solid transparent', opacity: i === index ? 1 : 0.5,
                transition: 'opacity 120ms, border-color 120ms', boxSizing: 'border-box' }}>
              <img src={im.url} alt="" draggable={false} referrerPolicy="no-referrer" loading="lazy"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
