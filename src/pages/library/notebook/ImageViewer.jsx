// Seyir defteri: components/notebook/ImageViewer.tsx + ImageCropper.tsx — tam ekran resim.
// Sayfadaki resimler sırayla gezilir (← / →, kenar düğmeleri); tekerlekle büyür, sürükleyince
// kayar; resim indirilebilir ya da kırpılabilir (okurken kırpılmaz). Escape kapatır.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { fonts } from '../theme.js'
import { attachmentUrl } from './attachments.js'
import { HandIcon } from './HandIcon.jsx'
import { portalRoot } from '../portalRoot.js'

const MAX_SCALE = 6
const MIN_CROP = 0.05

// images: [{ name }]; onCrop(name, rect) → Promise (rect oranlarla)
export function ImageViewer({ images, startIndex, onClose, onCrop }) {
  const [index, setIndex] = useState(startIndex)
  const [view, setView] = useState({ k: 1, x: 0, y: 0 })
  const [cropping, setCropping] = useState(false)
  const [busy, setBusy] = useState(false)
  const image = images[index]
  const drag = useRef(null)

  function go(next) {
    if (next < 0 || next >= images.length) return
    setIndex(next)
    setView({ k: 1, x: 0, y: 0 })
    setCropping(false)
  }

  useEffect(() => {
    const onKey = (e) => {
      if (busy) return
      if (e.key === 'Escape') {
        if (cropping) setCropping(false)
        else onClose()
      } else if (!cropping && e.key === 'ArrowRight') go(index + 1)
      else if (!cropping && e.key === 'ArrowLeft') go(index - 1)
      else return
      e.preventDefault()
      e.stopPropagation()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  if (!image) return null

  return createPortal(
    <div style={styles.root} role="dialog" aria-modal="true" aria-label="Resim">
      <div
        style={styles.stage}
        onWheel={(e) => {
          if (cropping) return
          const k = Math.min(MAX_SCALE, Math.max(1, view.k * Math.exp(-e.deltaY * 0.002)))
          setView(k === 1 ? { k: 1, x: 0, y: 0 } : { ...view, k })
        }}
        onPointerDown={(e) => {
          if (cropping || view.k === 1) return
          e.currentTarget.setPointerCapture(e.pointerId)
          drag.current = { x: e.clientX - view.x, y: e.clientY - view.y }
        }}
        onPointerMove={(e) => drag.current && setView({ ...view, x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
        onPointerUp={() => {
          drag.current = null
        }}
        onDoubleClick={() => !cropping && setView(view.k > 1 ? { k: 1, x: 0, y: 0 } : { k: 2.5, x: 0, y: 0 })}
      >
        {cropping ? (
          <Cropper
            src={attachmentUrl(image.name)}
            busy={busy}
            onCancel={() => setCropping(false)}
            onApply={async (rect) => {
              setBusy(true)
              try {
                await onCrop(image.name, rect)
                onClose()
              } finally {
                setBusy(false)
              }
            }}
          />
        ) : (
          <img
            src={attachmentUrl(image.name)}
            alt=""
            draggable={false}
            style={{ ...styles.image, transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, cursor: view.k > 1 ? 'grab' : 'zoom-in' }}
          />
        )}
      </div>

      {!cropping && (
        <>
          <div style={styles.top}>
            <span style={styles.counter}>{images.length > 1 ? `${index + 1} / ${images.length}` : ''}</span>
            <span style={styles.actions}>
              <a href={attachmentUrl(image.name)} download style={styles.iconLink} aria-label="Resmi indir" title="Resmi indir">
                <HandIcon shape="download" label="Resmi indir" size={28} color="#F4EFE6" onPress={() => {}} />
              </a>
              {onCrop && <HandIcon shape="crop" label="Kırp" size={28} color="#F4EFE6" onPress={() => setCropping(true)} />}
              <HandIcon shape="close" label="Kapat" size={28} color="#F4EFE6" onPress={onClose} />
            </span>
          </div>
          {index > 0 && (
            <span style={{ ...styles.side, left: 8 }}>
              <HandIcon shape="back" label="Önceki resim" size={32} color="#F4EFE6" onPress={() => go(index - 1)} />
            </span>
          )}
          {index < images.length - 1 && (
            <span style={{ ...styles.side, right: 8 }}>
              <HandIcon shape="forward" label="Sonraki resim" size={32} color="#F4EFE6" onPress={() => go(index + 1)} />
            </span>
          )}
        </>
      )}
    </div>,
    portalRoot(),
  )
}

// Kırpma: resmin üstünde köşelerinden ya da kendisinden sürüklenen bir alan
function Cropper({ src, busy, onCancel, onApply }) {
  const imgRef = useRef(null)
  const [box, setBox] = useState(null)
  const [rect, setRect] = useState({ x: 0.1, y: 0.1, width: 0.8, height: 0.8 })
  const drag = useRef(null)

  useLayoutEffect(() => {
    const el = imgRef.current
    if (!el) return
    const measure = () => setBox({ w: el.clientWidth, h: el.clientHeight })
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  function begin(e, kind) {
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { kind, x: e.clientX, y: e.clientY, rect }
  }

  function move(e) {
    const d = drag.current
    if (!d || !box) return
    const dx = (e.clientX - d.x) / box.w
    const dy = (e.clientY - d.y) / box.h
    const r = d.rect
    let { x, y, width, height } = r
    if (d.kind === 'move') {
      x = Math.min(1 - width, Math.max(0, r.x + dx))
      y = Math.min(1 - height, Math.max(0, r.y + dy))
    } else {
      if (d.kind.includes('l')) {
        x = Math.min(r.x + r.width - MIN_CROP, Math.max(0, r.x + dx))
        width = r.x + r.width - x
      }
      if (d.kind.includes('r')) width = Math.min(1 - r.x, Math.max(MIN_CROP, r.width + dx))
      if (d.kind.includes('t')) {
        y = Math.min(r.y + r.height - MIN_CROP, Math.max(0, r.y + dy))
        height = r.y + r.height - y
      }
      if (d.kind.includes('b')) height = Math.min(1 - r.y, Math.max(MIN_CROP, r.height + dy))
    }
    setRect({ x, y, width, height })
  }

  function release() {
    drag.current = null
  }

  return (
    <div style={styles.cropWrap}>
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <img ref={imgRef} src={src} alt="" draggable={false} style={styles.cropImage} />
        {box && (
          <div
            style={{
              ...styles.cropRect,
              left: rect.x * box.w,
              top: rect.y * box.h,
              width: rect.width * box.w,
              height: rect.height * box.h,
            }}
            onPointerDown={(e) => begin(e, 'move')}
            onPointerMove={move}
            onPointerUp={release}
          >
            {['tl', 'tr', 'bl', 'br'].map((c) => (
              <span
                key={c}
                style={{
                  ...styles.cropHandle,
                  [c[0] === 't' ? 'top' : 'bottom']: -8,
                  [c[1] === 'l' ? 'left' : 'right']: -8,
                  cursor: c === 'tl' || c === 'br' ? 'nwse-resize' : 'nesw-resize',
                }}
                onPointerDown={(e) => begin(e, c)}
                onPointerMove={move}
                onPointerUp={release}
              />
            ))}
          </div>
        )}
      </div>
      <div style={styles.cropBar}>
        <button type="button" onClick={onCancel} disabled={busy} style={styles.cropButton}>
          Vazgeç
        </button>
        <button type="button" onClick={() => onApply(rect)} disabled={busy} style={{ ...styles.cropButton, ...styles.cropApply }}>
          {busy ? 'Kırpılıyor…' : 'Kırp'}
        </button>
      </div>
    </div>
  )
}

const styles = {
  root: {
    position: 'fixed',
    inset: 0,
    zIndex: 1100,
    backgroundColor: 'rgba(12, 10, 8, 0.94)',
    animation: 'lib-fade 160ms ease-out',
  },
  stage: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    touchAction: 'none',
  },
  image: {
    maxWidth: '94%',
    maxHeight: '86%',
    objectFit: 'contain',
    userSelect: 'none',
    transition: 'transform 120ms ease-out',
  },
  top: {
    position: 'absolute',
    top: 8,
    left: 12,
    right: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  counter: {
    ...fonts.bodyThin,
    fontSize: 13,
    letterSpacing: 1,
    color: '#F4EFE6',
  },
  actions: {
    display: 'flex',
    gap: 10,
  },
  iconLink: {
    display: 'flex',
  },
  side: {
    position: 'absolute',
    top: '50%',
    marginTop: -18,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  cropWrap: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 16,
    maxWidth: '94%',
    maxHeight: '90%',
  },
  cropImage: {
    display: 'block',
    maxWidth: '90vw',
    maxHeight: '74vh',
    userSelect: 'none',
  },
  cropRect: {
    position: 'absolute',
    boxSizing: 'border-box',
    border: '2px solid #F4EFE6',
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.55)',
    cursor: 'move',
    touchAction: 'none',
  },
  cropHandle: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: 3,
    backgroundColor: '#F4EFE6',
    touchAction: 'none',
  },
  cropBar: {
    display: 'flex',
    gap: 12,
  },
  cropButton: {
    height: 42,
    padding: '0 22px',
    borderRadius: 12,
    border: '1px solid rgba(244, 239, 230, 0.4)',
    background: 'transparent',
    color: '#F4EFE6',
    ...fonts.bodyBold,
    fontSize: 15,
    cursor: 'pointer',
  },
  cropApply: {
    backgroundColor: '#C8553D',
    borderColor: '#C8553D',
  },
}
