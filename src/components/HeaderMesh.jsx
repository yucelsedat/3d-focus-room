import { useState, useEffect, useRef, useCallback } from 'react'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useStore } from '../store/useStore'

const FONT_FAMILY = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif'
const PAD = 48  // px, her iki yanda

// Canvas 2D ile DOM'a dokunmadan font boyutu hesapla (drei Html içinde güvenilir)
function calcFontSize(text, maxW, maxH) {
  const lines = text.split('\n').filter(l => l.trim())
  if (!lines.length) return Math.round(maxH * 0.55)

  const cv  = document.createElement('canvas')
  const ctx = cv.getContext('2d')

  let lo = 8, hi = maxH * 3
  while (lo < hi - 1) {
    const mid  = Math.floor((lo + hi) / 2)
    ctx.font   = `800 ${mid}px ${FONT_FAMILY}`
    const wMax = Math.max(...lines.map(l => ctx.measureText(l).width))
    const hAll = mid * 1.15 * lines.length
    if (wMax <= maxW && hAll <= maxH) lo = mid; else hi = mid
  }
  return lo
}

export default function HeaderMesh({ id, content, width, height }) {
  const updateMedia = useStore(s => s.updateMedia)

  const initial = (() => { try { return JSON.parse(content) } catch { return {} } })()

  const [text, setText]     = useState(initial.text  ?? '')
  const [bg,   setBg]       = useState(initial.bg    ?? '#1a1a2e')
  const [color, setColor]   = useState(initial.color ?? '#ffffff')
  const [isEditing, setIsEditing] = useState(false)
  const [fontSize, setFontSize]   = useState(100)

  const saveTimerRef = useRef(null)
  const textRef      = useRef(text)
  const bgRef        = useRef(bg)
  const colorRef     = useRef(color)


  const w    = parseFloat(width),  h = parseFloat(height)
  const pxW  = 1920,               pxH = Math.round(1920 * (h / w))
  const scale = w * 40 / pxW

  // ── auto-fit ──────────────────────────────────────────────────────────────
  useEffect(() => {
    setFontSize(calcFontSize(text, pxW - PAD * 2, pxH - PAD * 0.5))
  }, [text, pxW, pxH])

  // ── persistence ───────────────────────────────────────────────────────────
  const save = useCallback((t, b, c) => {
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/media/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: JSON.stringify({ text: t, bg: b, color: c }) }),
        })
        if (r.ok) updateMedia(await r.json())
      } catch {}
    }, 500)
  }, [id, updateMedia])

  // ── ESC / pointer-lock ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isEditing) return
    const onKey  = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); exitEdit() } }
    const onLock = () => { if (document.pointerLockElement) exitEdit() }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('pointerlockchange', onLock)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('pointerlockchange', onLock)
    }
  }, [isEditing]) // eslint-disable-line

  const stop = e => { e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation() }

  const enterEdit = e => {
    stop(e)
    if (document.pointerLockElement) document.exitPointerLock()
    setIsEditing(true)
  }

  const exitEdit = () => {
    setIsEditing(false)
    save(textRef.current, bgRef.current, colorRef.current)
  }

  const baseTextStyle = {
    fontSize,
    fontWeight: 800,
    fontFamily: FONT_FAMILY,
    color,
    lineHeight: 1.15,
    textAlign: 'center',
    whiteSpace: 'pre',
    letterSpacing: '-0.02em',
  }

  return (
    <Html key={`hdr-${w}-${h}`} transform position={[0, 0, 0.01]} scale={scale} style={{ pointerEvents: 'none' }}>

      {/* ══ RENDER MODE ══════════════════════════════════════════════════════ */}
      {!isEditing && (
        <div
          style={{ width: pxW, height: pxH, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderRadius: 4, cursor: 'pointer', pointerEvents: 'auto', userSelect: 'none', padding: `0 ${PAD}px`, boxSizing: 'border-box' }}
          onMouseDown={enterEdit} onClick={stop}
        >
          {text.trim()
            ? <span style={{ ...baseTextStyle, pointerEvents: 'none' }}>{text}</span>
            : <span style={{ ...baseTextStyle, opacity: 0.2, fontSize: Math.min(fontSize, Math.round(pxH * 0.35)), pointerEvents: 'none' }}>Başlık…</span>
          }
        </div>
      )}

      {/* ══ EDIT MODE ════════════════════════════════════════════════════════ */}
      {isEditing && (
        <div
          style={{ width: pxW, height: pxH, background: bg, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 4, pointerEvents: 'auto', userSelect: 'none', boxShadow: '0 0 0 3px rgba(96,165,250,0.5)' }}
          onClick={stop}
        >
          {/* toolbar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '10px 22px', background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', flexShrink: 0 }}
            onMouseDown={stop}>
            <span style={{ color: 'rgba(148,163,184,0.7)', fontSize: 22, flexShrink: 0 }}>Arka plan</span>
            <input type="color" value={bg} onMouseDown={stop}
              onChange={e => { setBg(e.target.value); bgRef.current = e.target.value; save(textRef.current, e.target.value, colorRef.current) }}
              style={{ width: 40, height: 34, border: 'none', background: 'none', cursor: 'pointer', padding: 0, borderRadius: 4, flexShrink: 0 }} />
            <span style={{ color: 'rgba(148,163,184,0.7)', fontSize: 22, flexShrink: 0, marginLeft: 10 }}>Yazı rengi</span>
            <input type="color" value={color} onMouseDown={stop}
              onChange={e => { setColor(e.target.value); colorRef.current = e.target.value; save(textRef.current, bgRef.current, e.target.value) }}
              style={{ width: 40, height: 34, border: 'none', background: 'none', cursor: 'pointer', padding: 0, borderRadius: 4, flexShrink: 0 }} />
            <span style={{ marginLeft: 'auto', color: 'rgba(148,163,184,0.35)', fontSize: 20, flexShrink: 0 }}>ESC</span>
          </div>

          {/* text input */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: `0 ${PAD}px`, boxSizing: 'border-box' }}>
            <textarea
              autoFocus
              value={text}
              onChange={e => { setText(e.target.value); textRef.current = e.target.value }}
              onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); exitEdit(); return } e.stopPropagation() }}
              onMouseDown={stop}
              onBlur={exitEdit}
              placeholder="Başlık yazın…"
              style={{
                width: '100%',
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                color,
                fontSize,
                fontWeight: 800,
                fontFamily: FONT_FAMILY,
                lineHeight: 1.15,
                textAlign: 'center',
                letterSpacing: '-0.02em',
                caretColor: color,
                overflow: 'hidden',
                padding: 0,
                boxSizing: 'border-box',
                whiteSpace: 'pre',
              }}
              rows={1}
            />
          </div>
        </div>
      )}
    </Html>
  )
}
