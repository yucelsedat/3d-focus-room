import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react'
import { Html } from '@react-three/drei'
import { useStore } from '../store/useStore'
import {
  STICKY_FONT, STICKY_WEIGHT, STICKY_LINE_HEIGHT, STICKY_MAX_CHARS, STICKY_COLORS,
  parseStickyContent, normalizeStickyText, stickyInk, fitStickyText,
} from './stickyNote'

const UI_FONT = "'DM Sans', system-ui, sans-serif"
const PX_W = 1200          // kartın DOM genişliği; yükseklik tile oranından türetilir
const SAVE_DEBOUNCE = 500

// Duvardaki yapışkan not: yazdıkça satır sayısı ve punto otomatik belirlenir.
export default function StickyNoteMesh({ id, content, width, height }) {
  const updateMedia = useStore(s => s.updateMedia)

  const initial = useMemo(() => parseStickyContent(content), []) // eslint-disable-line react-hooks/exhaustive-deps
  const [text, setText]   = useState(initial.text)
  const [color, setColor] = useState(initial.color)
  const [isEditing, setIsEditing] = useState(false)
  const [saveError, setSaveError] = useState(false)
  const [fontsTick, setFontsTick] = useState(0)

  const textRef    = useRef(initial.text)
  const colorRef   = useRef(initial.color)
  const extraRef   = useRef(initial)      // content'teki bilinmeyen alanlar korunur
  const editingRef = useRef(false)
  const timerRef   = useRef(null)
  const pendingRef = useRef(null)         // gönderilmemiş content (string) | null
  const inflightRef = useRef(0)
  const seqRef     = useRef(0)
  const mountedRef = useRef(true)
  const taRef      = useRef(null)

  // ── geometri ──────────────────────────────────────────────────────────────
  const w = Math.max(0.1, parseFloat(width) || 4)
  const h = Math.max(0.1, parseFloat(height) || 4)
  const pxW = PX_W
  const pxH = Math.max(60, Math.round(PX_W * (h / w)))
  const scale = (w * 40) / pxW
  const m = Math.min(pxW, pxH)
  const strip = Math.round(m * 0.11)              // üstteki yapışkan şerit (düzenlemede araç çubuğu)
  const pad   = Math.round(m * 0.075)
  const boxW  = pxW - pad * 2
  const boxH  = Math.max(1, pxH - strip - pad - Math.round(m * 0.02))
  const minSize = Math.max(14, Math.round(m * 0.03))
  const maxSize = Math.max(minSize, Math.round(m * 0.22))

  // Caveat geç yüklenirse yedek fontla yapılan ölçüm yanlış kalır → yüklenince yeniden sığdır.
  useEffect(() => {
    const fonts = document.fonts
    if (!fonts) return
    let alive = true
    const bump = () => { if (alive) setFontsTick(t => t + 1) }
    fonts.load(`${STICKY_WEIGHT} 40px Caveat`).then(bump, () => {})
    fonts.addEventListener?.('loadingdone', bump)
    return () => { alive = false; fonts.removeEventListener?.('loadingdone', bump) }
  }, [])

  const fit = useMemo(
    () => fitStickyText(text, boxW, boxH, minSize, maxSize),
    // fontsTick: font yüklenince ölçüm DOM'dan yeniden alınsın diye bilinçli bağımlılık
    [text, boxW, boxH, minSize, maxSize, fontsTick], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const ink = stickyInk(color)

  // ── kalıcılık ─────────────────────────────────────────────────────────────
  const flush = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = null
    const payload = pendingRef.current
    if (payload == null) return
    pendingRef.current = null
    const seq = ++seqRef.current
    inflightRef.current++
    fetch(`/api/media/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: payload }),
      keepalive: true,                    // sayfa/oda kapanırken de son yazı kaybolmasın
    })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = await r.json()
        // Yalnız en son isteğin yanıtı store'a yazılır (sıra dışı yanıt eski metni geri getirmesin)
        if (seq === seqRef.current) updateMedia(data)
        if (mountedRef.current && seq === seqRef.current) setSaveError(false)
      })
      .catch(err => {
        console.warn('[sticky] kaydedilemedi:', err.message)
        if (pendingRef.current == null) pendingRef.current = payload   // sonraki değişiklikte tekrar dene
        if (mountedRef.current) setSaveError(true)
      })
      .finally(() => { inflightRef.current-- })
  }, [id, updateMedia])

  const save = useCallback((immediate = false) => {
    pendingRef.current = JSON.stringify({ ...extraRef.current, text: textRef.current, color: colorRef.current })
    clearTimeout(timerRef.current)
    if (immediate) flush()
    else timerRef.current = setTimeout(flush, SAVE_DEBOUNCE)
  }, [flush])

  // Unmount (oda değişimi, tile silme): bekleyen yazıyı hemen gönder.
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false; flush() }
  }, [flush])

  // Dışarıdan gelen içerik (yapıştır/başka istemci) — düzenleme/bekleyen kayıt yokken uygula.
  useEffect(() => {
    if (editingRef.current || pendingRef.current != null || inflightRef.current > 0) return
    const p = parseStickyContent(content)
    extraRef.current = p
    if (p.text !== textRef.current) { textRef.current = p.text; setText(p.text) }
    if (p.color !== colorRef.current) { colorRef.current = p.color; setColor(p.color) }
  }, [content])

  // ── düzenleme modu ────────────────────────────────────────────────────────
  const stop = e => { e.stopPropagation(); e.nativeEvent?.stopImmediatePropagation?.() }

  const exitEdit = useCallback(() => {
    if (!editingRef.current) return                     // ESC + blur çift çağrısına karşı
    editingRef.current = false
    setIsEditing(false)
    const trimmed = textRef.current.replace(/\s+$/, '')  // sondaki boş satırlar puntoyu küçültmesin
    if (trimmed !== textRef.current) { textRef.current = trimmed; setText(trimmed) }
    save(true)
  }, [save])

  const enterEdit = e => {
    stop(e)
    if (e.button !== undefined && e.button !== 0) return
    if (document.pointerLockElement) document.exitPointerLock()
    editingRef.current = true
    setIsEditing(true)
  }

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
  }, [isEditing, exitEdit])

  // Odak + imleci metnin sonuna koy; CSS3D içinde sayfa kaymasın diye preventScroll.
  useLayoutEffect(() => {
    if (!isEditing) return
    const ta = taRef.current
    if (!ta) return
    ta.focus({ preventScroll: true })
    const end = ta.value.length
    ta.setSelectionRange(end, end)
  }, [isEditing])

  const onChange = e => {
    const v = normalizeStickyText(e.target.value)
    textRef.current = v
    setText(v)
    save()
  }

  const pickColor = (hex, e) => {
    e.preventDefault()          // textarea odağını kaybetmesin (blur → düzenleme kapanmasın)
    stop(e)
    if (hex === colorRef.current) return
    colorRef.current = hex
    setColor(hex)
    save()
  }

  // ── stiller ───────────────────────────────────────────────────────────────
  const shade = pct => `color-mix(in srgb, ${color} ${pct}%, black)`
  const textStyle = {
    fontFamily: STICKY_FONT,
    fontWeight: STICKY_WEIGHT,
    fontSize: fit.fontSize,
    lineHeight: STICKY_LINE_HEIGHT,
    letterSpacing: 0,
    color: ink,
    textAlign: 'center',
    whiteSpace: 'pre-wrap',
    overflowWrap: fit.breakWords ? 'anywhere' : 'normal',
    wordBreak: 'normal',
    width: '100%',
    margin: 0,
    padding: 0,
    boxSizing: 'border-box',
  }
  const taHeight = fit.overflow ? boxH : Math.min(boxH, Math.max(fit.contentH, fit.fontSize * STICKY_LINE_HEIGHT))
  const dot = Math.round(strip * 0.5)
  const uiSize = Math.max(12, Math.round(strip * 0.24))
  const nearLimit = text.length >= STICKY_MAX_CHARS * 0.8
  const bottomGap = pxH - strip - boxH
  const fadeH = Math.round(fit.fontSize * 1.6)

  return (
    <Html key={`sticky-${w}-${h}`} transform position={[0, 0, 0.01]} scale={scale} style={{ pointerEvents: 'none' }}>
      <div
        onMouseDown={isEditing ? e => { stop(e); if (e.target !== taRef.current) e.preventDefault() } : enterEdit}
        onClick={stop}
        onWheel={isEditing ? e => e.stopPropagation() : undefined}
        style={{
          position: 'relative', width: pxW, height: pxH, overflow: 'hidden', boxSizing: 'border-box',
          borderRadius: Math.round(m * 0.006),
          background: `linear-gradient(172deg, color-mix(in srgb, ${color} 78%, white) 0%, ${color} 34%, ${shade(92)} 100%)`,
          boxShadow: isEditing
            ? `0 0 0 ${Math.round(m * 0.006)}px rgba(96,165,250,0.6), 0 ${Math.round(m * 0.02)}px ${Math.round(m * 0.03)}px -${Math.round(m * 0.012)}px rgba(0,0,0,0.45)`
            : `0 ${Math.round(m * 0.016)}px ${Math.round(m * 0.028)}px -${Math.round(m * 0.012)}px rgba(0,0,0,0.45), 0 2px 4px rgba(0,0,0,0.16)`,
          cursor: isEditing ? 'text' : 'pointer',
          pointerEvents: 'auto',
          userSelect: isEditing ? 'text' : 'none',
        }}
      >
        {/* yapışkan şerit / düzenleme araç çubuğu */}
        <div
          onMouseDown={isEditing ? e => { e.preventDefault(); stop(e) } : undefined}
          style={{
            position: 'absolute', left: 0, right: 0, top: 0, height: strip, boxSizing: 'border-box',
            background: isEditing ? 'rgba(0,0,0,0.07)' : 'rgba(0,0,0,0.035)',
            display: 'flex', alignItems: 'center', gap: Math.round(dot * 0.32),
            padding: `0 ${pad}px`, fontFamily: UI_FONT, fontSize: uiSize, color: ink,
          }}
        >
          {isEditing && (
            <>
              {STICKY_COLORS.map(c => (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  onMouseDown={e => pickColor(c.hex, e)}
                  style={{
                    width: dot, height: dot, borderRadius: '50%', flexShrink: 0, padding: 0, cursor: 'pointer',
                    background: c.hex,
                    border: `${Math.max(2, Math.round(dot * 0.07))}px solid ${c.hex === color ? ink : 'rgba(0,0,0,0.18)'}`,
                    boxShadow: c.hex === color ? `0 0 0 ${Math.max(2, Math.round(dot * 0.06))}px ${c.hex}` : 'none',
                  }}
                />
              ))}
              <span style={{ marginLeft: 'auto', fontWeight: 800, opacity: 0.75, whiteSpace: 'nowrap' }}>
                {fit.overflow ? 'Sığmıyor · kaydır' : `${fit.lines || 1} satır · ${fit.fontSize}px`}
              </span>
              {nearLimit && (
                <span style={{ fontWeight: 200, opacity: 0.8, whiteSpace: 'nowrap' }}>
                  {text.length}/{STICKY_MAX_CHARS}
                </span>
              )}
              <span style={{ fontWeight: 200, opacity: 0.5, whiteSpace: 'nowrap' }}>ESC</span>
            </>
          )}
          {saveError && (
            <span title="Kaydedilemedi — sonraki değişiklikte tekrar denenecek"
              style={{ marginLeft: isEditing ? 0 : 'auto', fontWeight: 800, color: '#b91c1c', whiteSpace: 'nowrap' }}>
              ● kaydedilemedi
            </span>
          )}
        </div>

        {/* metin kutusu */}
        <div style={{
          position: 'absolute', top: strip, left: pad, width: boxW, height: boxH,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        }}>
          {isEditing ? (
            <textarea
              ref={taRef}
              value={text}
              maxLength={STICKY_MAX_CHARS}
              placeholder="Bir şey yaz…"
              spellCheck={false}
              onChange={onChange}
              onKeyDown={e => {
                if (e.key === 'Escape' || (e.key === 'Enter' && (e.ctrlKey || e.metaKey))) {
                  e.preventDefault(); e.stopPropagation(); exitEdit(); return
                }
                e.stopPropagation()
              }}
              onKeyUp={e => e.stopPropagation()}
              onMouseDown={stop}
              onBlur={exitEdit}
              style={{
                ...textStyle,
                display: 'block', height: taHeight, flexShrink: 0,
                background: 'transparent', border: 'none', outline: 'none', resize: 'none',
                caretColor: ink, overflowX: 'hidden', overflowY: fit.overflow ? 'auto' : 'hidden',
              }}
            />
          ) : text.trim() ? (
            <div style={{ ...textStyle, maxHeight: boxH, overflow: 'hidden', pointerEvents: 'none' }}>{text}</div>
          ) : (
            <div style={{ ...textStyle, opacity: 0.32, pointerEvents: 'none' }}>Not yaz…</div>
          )}
        </div>

        {/* sığmayan metin: alt kenarda kağıda karışan solma */}
        {fit.overflow && !isEditing && (
          <div style={{
            position: 'absolute', left: 0, right: 0, bottom: 0, height: bottomGap + fadeH, pointerEvents: 'none',
            background: `linear-gradient(to bottom, transparent 0px, ${shade(92)} ${fadeH}px)`,
          }} />
        )}

        {/* sağ alt köşe kıvrım gölgesi */}
        <div style={{
          position: 'absolute', right: 0, bottom: 0, width: Math.round(m * 0.18), height: Math.round(m * 0.18), pointerEvents: 'none',
          background: 'linear-gradient(315deg, rgba(0,0,0,0.10) 0%, rgba(0,0,0,0) 48%)',
        }} />
      </div>
    </Html>
  )
}
