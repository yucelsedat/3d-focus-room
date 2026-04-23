import React, { Suspense, Component, useState, useEffect, useRef } from 'react'
import { useTexture, useVideoTexture, Html } from '@react-three/drei'
import * as THREE from 'three'
import { marked } from 'marked'
import { useStore } from '../store/useStore'
import { useSpeechToText } from '../hooks/useSpeechToText'

class TextureErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false } }
  static getDerivedStateFromError() { return { hasError: true } }
  componentDidCatch(err) { console.warn('[MediaOverlay] Texture load failed:', err.message) }
  render() {
    if (this.state.hasError) {
      const { width, height } = this.props
      return (
        <mesh position={[0, 0, 0.02]}>
          <planeGeometry args={[width, height]} />
          <meshBasicMaterial color="#3d0000" side={THREE.DoubleSide} />
        </mesh>
      )
    }
    return this.props.children
  }
}

function ImageMesh({ url, width, height }) {
  const texture = useTexture(url)
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} transparent side={THREE.DoubleSide} />
    </mesh>
  )
}

function VideoMesh({ url, width, height }) {
  const texture = useVideoTexture(url, { muted: true, loop: true, start: true })
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} />
    </mesh>
  )
}

function YoutubeMesh({ url, width, height }) {
  const w = parseFloat(width)
  const h = parseFloat(height)
  const pxWidth = 1920
  const pxHeight = Math.round(1920 * (h / w))
  const scaleFactor = w * 40 / pxWidth
  const cleanUrl = url.replace(/[?&]autoplay=1/g, '')
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial transparent opacity={0.1} color="red" depthWrite={false} side={THREE.DoubleSide} />
      <Html key={`yt-${w}-${h}`} transform position={[0, 0, 0.01]} scale={scaleFactor} style={{ pointerEvents: 'none' }}>
        <div style={{ width: `${pxWidth}px`, height: `${pxHeight}px`, backgroundColor: '#000' }}>
          <iframe src={cleanUrl} frameBorder="0" allowFullScreen
            style={{ width: '100%', height: '100%', border: 'none', display: 'block', pointerEvents: 'auto' }} />
        </div>
      </Html>
    </mesh>
  )
}

function EmbedMesh({ url, width, height }) {
  const w = parseFloat(width)
  const h = parseFloat(height)
  const pxWidth = 1920
  const pxHeight = Math.round(1920 * (h / w))
  const scaleFactor = w * 40 / pxWidth
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial transparent opacity={0.1} color="blue" depthWrite={false} side={THREE.DoubleSide} />
      <Html key={`embed-${w}-${h}`} transform position={[0, 0, 0.01]} scale={scaleFactor} style={{ pointerEvents: 'none' }}>
        <div style={{ width: `${pxWidth}px`, height: `${pxHeight}px`, backgroundColor: '#111' }}>
          <iframe src={url} allowFullScreen
            style={{ width: '100%', height: '100%', border: 'none', display: 'block', pointerEvents: 'auto' }} />
        </div>
      </Html>
    </mesh>
  )
}

const MD_PX_PER_UNIT = 200
const MD_COL_PX_W    = 600

function measureEditCols(content, pxHeight) {
  const probe = document.createElement('div')
  probe.style.cssText = [
    'position:fixed;left:-9999px;top:0',
    `width:${MD_COL_PX_W}px;height:auto`,
    'font-family:system-ui,sans-serif;font-size:16px;line-height:1.6',
    'padding:44px 24px 24px;box-sizing:border-box',
    'visibility:hidden;pointer-events:none;white-space:pre-wrap',
  ].join(';')
  probe.innerText = content
  document.body.appendChild(probe)
  const h = probe.scrollHeight
  document.body.removeChild(probe)
  return Math.max(1, Math.ceil(h / pxHeight))
}

function getCaretOffset(el) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return 0
  const r = sel.getRangeAt(0)
  const pre = r.cloneRange()
  pre.selectNodeContents(el)
  pre.setEnd(r.startContainer, r.startOffset)
  return pre.toString().length
}

function rangeFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y)
  if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(x, y)
    if (!pos) return null
    const r = document.createRange()
    r.setStart(pos.offsetNode, pos.offset)
    r.collapse(true)
    return r
  }
  return null
}

function insertAtCursor(text) {
  const sel = window.getSelection()
  if (!sel || !sel.rangeCount) return
  const range = sel.getRangeAt(0)
  range.deleteContents()
  const node = document.createTextNode(text)
  range.insertNode(node)
  range.setStartAfter(node)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}


function MarkdownMesh({ id, content, width, height }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editNCols, setEditNCols] = useState(1)
  const editRef          = useRef(null)
  const clickPosRef      = useRef(null)
  const pendingCursorRef = useRef(null)
  const cursorPlacedRef  = useRef(false)
  const afterCursorRef   = useRef('')
  const speech           = useSpeechToText()
  const updateMedia      = useStore(s => s.updateMedia)

  const w           = parseFloat(width)
  const h           = parseFloat(height)
  const pxWidth     = Math.round(w * MD_PX_PER_UNIT)
  const pxHeight    = Math.round(h * MD_PX_PER_UNIT)
  const nCols       = Math.max(1, Math.round(pxWidth / MD_COL_PX_W))
  const scaleFactor = w * 40 / pxWidth

  const html = marked(content || '').replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')

  // Faz 1: edit moda gir → textContent yaz (corruption yok) + sütun say
  useEffect(() => {
    if (!isEditing || !editRef.current) return
    editRef.current.textContent = content   // textContent: \n → text node, <br> yok
    editRef.current.focus()
    const needed = measureEditCols(content, pxHeight)
    cursorPlacedRef.current = false
    pendingCursorRef.current = clickPosRef.current
    clickPosRef.current = null
    setEditNCols(needed)
  }, [isEditing])

  // Faz 2: editNCols DOM'a yansıdı → cursor koy
  useEffect(() => {
    if (!isEditing || cursorPlacedRef.current || !pendingCursorRef.current) return
    const pos = pendingCursorRef.current
    cursorPlacedRef.current = true
    requestAnimationFrame(() => {
      if (!editRef.current) return
      const range = rangeFromPoint(pos.x, pos.y)
      if (range) {
        const sel = window.getSelection()
        if (sel) { sel.removeAllRanges(); sel.addRange(range) }
      }
    })
  }, [editNCols, isEditing])

  const handleSave = async () => {
    if (!editRef.current) return
    const current = editRef.current.textContent.trim()  // textContent: mükemmel round-trip
    if (current === content.trim()) return
    try {
      const r = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: current }),
      })
      if (r.ok) updateMedia(await r.json())
    } catch (e) {
      console.error('[MarkdownMesh] save failed', e)
    }
  }

  const handleBlur = (e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setIsEditing(false)
    if (speech.listening) speech.stop()
    handleSave()
  }

  const handleMicToggle = () => {
    if (speech.listening) { speech.stop(); return }
    const currentText = editRef.current?.textContent ?? content
    const cursor = isEditing && editRef.current ? getCaretOffset(editRef.current) : currentText.length
    const before = currentText.slice(0, cursor)
    afterCursorRef.current = currentText.slice(cursor)
    if (!isEditing) setIsEditing(true)
    speech.start(before, (txt) => {
      if (!editRef.current) return
      editRef.current.textContent = txt + afterCursorRef.current
      // Cursor'ı konuşulan kısmın sonuna taşı
      const textNode = editRef.current.firstChild
      if (textNode?.nodeType === Node.TEXT_NODE) {
        const range = document.createRange()
        range.setStart(textNode, Math.min(txt.length, textNode.length))
        range.collapse(true)
        const sel = window.getSelection()
        if (sel) { sel.removeAllRanges(); sel.addRange(range) }
      }
    })
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      e.stopPropagation()
      insertAtCursor('\n')  // <br>/<div> değil, saf \n text node
      return
    }
    if (e.key === 'f' || e.key === 'F') {
      e.preventDefault()
      e.stopPropagation()
      handleMicToggle()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      setIsEditing(false)
      if (speech.listening) speech.stop()
      handleSave()
    }
  }

  const baseStyle = {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: '8px',
    boxSizing: 'border-box',
    overflow: 'hidden',
    fontFamily: 'system-ui, sans-serif',
    fontSize: '16px',
    lineHeight: '1.6',
    color: '#1a1a1a',
    columnCount: nCols,
    columnGap: '0px',
    columnFill: 'auto',
    padding: '44px 24px 24px',
    pointerEvents: 'auto',
    cursor: 'text',
  }

  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      <Html transform position={[0, 0, 0.01]} scale={scaleFactor} style={{ pointerEvents: 'none' }}>
        <style>{`@keyframes micPulse{0%,100%{opacity:1}50%{opacity:0.35}}`}</style>
        <div
          style={{ position: 'relative', width: `${pxWidth}px`, height: `${pxHeight}px` }}
          onBlur={handleBlur}
          onClick={e => e.stopPropagation()}
        >
          {/* Mikrofon butonu */}
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
            onClick={handleMicToggle}
            title={speech.listening ? 'Kaydı durdur (F)' : 'Sesle yaz (F)'}
            style={{
              position: 'absolute', top: '8px', left: '8px', zIndex: 10,
              background: speech.listening ? 'rgba(239,68,68,0.85)' : 'rgba(0,0,0,0.5)',
              border: `1px solid ${speech.listening ? '#ef4444' : 'rgba(255,255,255,0.2)'}`,
              borderRadius: '6px', padding: '4px 10px',
              cursor: 'pointer', fontSize: '14px',
              color: speech.listening ? '#fff' : 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(4px)',
              animation: speech.listening ? 'micPulse 1.2s ease-in-out infinite' : 'none',
              pointerEvents: 'auto',
            }}
          >🎤</button>

          {/* VIEW: çok sütunlu rendered markdown */}
          <div
            style={{ ...baseStyle, display: isEditing ? 'none' : 'block', border: '2px solid transparent' }}
            onClick={(e) => {
              if (e.target.closest('a')) return
              e.stopPropagation()
              clickPosRef.current = { x: e.clientX, y: e.clientY }
              setIsEditing(true)
            }}
            dangerouslySetInnerHTML={{ __html: html }}
          />

          {/* EDIT: çok sütunlu contentEditable, textContent round-trip, pre-wrap \n */}
          <div
            ref={editRef}
            contentEditable
            suppressContentEditableWarning
            onKeyDown={handleKeyDown}
            onPaste={(e) => {
              e.preventDefault()
              e.stopPropagation()
              insertAtCursor(e.clipboardData.getData('text/plain'))
            }}
            style={{
              ...baseStyle,
              columnCount: editNCols,
              display: isEditing ? 'block' : 'none',
              outline: 'none',
              whiteSpace: 'pre-wrap',
              border: `2px solid ${speech.listening ? '#ef4444' : '#60a5fa'}`,
            }}
          />
        </div>
      </Html>
    </mesh>
  )
}

function GifMesh({ url, width, height }) {
  const pxWidth  = 600
  const pxHeight = 600 * (height / width)
  const scale    = width * 40 / pxWidth
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      <Html transform occlude="blending" position={[0, 0, 0]} scale={scale}
        style={{ width: `${pxWidth}px`, height: `${pxHeight}px`, pointerEvents: 'none' }}>
        <img src={url} style={{ width: '100%', height: '100%', objectFit: 'fill' }} alt="gif" />
      </Html>
    </mesh>
  )
}

function LoadingMesh({ width, height }) {
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[width, height]} />
      <meshBasicMaterial color="#111" side={THREE.DoubleSide} />
    </mesh>
  )
}

export function MediaOverlay({ id, type, url, width, height, position, rotation, content }) {
  const isVideo    = type === 'video'
  const isYoutube  = type === 'youtube'
  const isMarkdown = type === 'markdown'
  const isEmbed    = type === 'embed'
  const isGif      = !isVideo && !isYoutube && !isMarkdown && !isEmbed
    && typeof url === 'string' && url.toLowerCase().includes('.gif')

  const offsetX = (width - 1) / 2
  const offsetY = (height - 1) / 2

  return (
    <group position={position} rotation={rotation}>
      <group position={[offsetX, offsetY, 0]}>
        {isMarkdown ? (
          <MarkdownMesh id={id} content={content} width={width} height={height} />
        ) : isYoutube ? (
          <YoutubeMesh url={url} width={width} height={height} />
        ) : isEmbed ? (
          <EmbedMesh url={url} width={width} height={height} />
        ) : (
          <TextureErrorBoundary width={width} height={height}>
            <Suspense fallback={<LoadingMesh width={width} height={height} />}>
              {isVideo ? (
                <VideoMesh url={url} width={width} height={height} />
              ) : isGif ? (
                <GifMesh url={url} width={width} height={height} />
              ) : (
                <ImageMesh url={url} width={width} height={height} />
              )}
            </Suspense>
          </TextureErrorBoundary>
        )}
      </group>
    </group>
  )
}
