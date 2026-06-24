import React, { Suspense, Component, useState, useEffect, useRef } from 'react'
import CanvasMesh from './CanvasMesh'
import HeaderMesh from './HeaderMesh'
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

function SlideMesh({ url, width, height }) {
  const w = parseFloat(width)
  const h = parseFloat(height)
  const pxWidth = 1920
  const pxHeight = Math.round(1920 * (h / w))
  const scaleFactor = w * 40 / pxWidth
  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial transparent opacity={0.1} color="#60a5fa" depthWrite={false} side={THREE.DoubleSide} />
      <Html key={`slide-${w}-${h}`} transform position={[0, 0, 0.01]} scale={scaleFactor} style={{ pointerEvents: 'none' }}>
        <iframe
          src={url}
          frameBorder="0"
          allowFullScreen
          style={{
            width: `${pxWidth}px`,
            height: `${pxHeight}px`,
            border: 'none',
            display: 'block',
            pointerEvents: 'auto',
            borderRadius: '8px',
            boxShadow: '0 8px 24px rgba(96, 165, 250, 0.3)'
          }}
        />
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

const SESSION_PX_PER_UNIT = 200

function SessionMessageBubble({ msg }) {
  const base = { fontSize: '26px', lineHeight: '1.5', maxWidth: '90%', wordBreak: 'break-word' }
  const [copied, setCopied] = useState(false)

  const copyMarkdown = (e) => {
    e.stopPropagation()
    navigator.clipboard.writeText(msg.content || '')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (msg.role === 'user') return (
    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
      <div style={{ ...base, background: '#1e3a6e', border: '1px solid #2a5a9e', borderRadius: '12px 12px 2px 12px', padding: '8px 12px', color: '#e0e8ff' }}>
        {msg.content}
      </div>
    </div>
  )

  if (msg.role === 'ai') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
      <div style={{ ...base, background: '#111', border: '1px solid #1e3a2e', borderRadius: '12px 12px 12px 2px', padding: '8px 12px', color: '#d0f0d0' }}>
        <div className="session-markdown" style={{ fontSize: '26px' }} dangerouslySetInnerHTML={{ __html: marked(msg.content) }} />
      </div>
      <button
        onClick={copyMarkdown}
        onPointerDown={e => e.stopPropagation()}
        title="Markdown'ı panoya kopyala"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', marginTop: '2px', marginLeft: '2px', color: copied ? '#4ade80' : '#6b7280', fontSize: '22px', pointerEvents: 'auto' }}
      >
        {copied ? '✓ kopyalandı' : '⧉'}
      </button>
    </div>
  )

  if (msg.role === 'tool_call') return (
    <div style={{ ...base, background: '#0a0a0a', border: '1px solid #1a2a1a', borderRadius: '4px', padding: '6px 10px', color: '#4ade80', fontFamily: 'monospace', fontSize: '24px' }}>
      <span style={{ color: '#60a5fa', marginRight: '6px' }}>{msg.toolName || 'Tool'}</span>
      <span style={{ color: '#fbbf24' }}>$</span>{' '}{msg.content}
    </div>
  )

  if (msg.role === 'tool_result') return (
    <div style={{ ...base, background: '#050505', border: '1px solid #1a2a1a', borderRadius: '4px', padding: '6px 10px', color: '#6b7280', fontFamily: 'monospace', fontSize: '22px', maxHeight: '200px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
      {msg.content || '(çıktı yok)'}
    </div>
  )

  if (msg.role === 'error') return (
    <div style={{ ...base, background: '#1a0505', border: '1px solid #3a1515', borderRadius: '4px', padding: '6px 10px', color: '#f87171', fontSize: '24px' }}>
      ⚠ {msg.content}
    </div>
  )

  return null
}

// "ask" modunda CLI bir tool kullanmak istediğinde gösterilen onay kartı.
// req = { toolUseId, toolName, toolInput }
function PermissionPrompt({ req, onAllow, onDeny }) {
  const t = req.toolName || 'Tool'
  const inp = req.toolInput || {}

  // Tool tipine göre özet
  let preview = null
  if ((t === 'Edit' || t === 'Write') && inp.file_path) {
    preview = (
      <>
        <div style={{ color: '#fbbf24', fontFamily: 'monospace', fontSize: '22px', marginBottom: '4px' }}>{inp.file_path}</div>
        <pre style={{ margin: 0, maxHeight: '160px', overflow: 'auto', color: '#9ca3af', fontFamily: 'monospace', fontSize: '20px', whiteSpace: 'pre-wrap' }}>
          {t === 'Edit' ? `- ${inp.old_string ?? ''}\n+ ${inp.new_string ?? ''}` : String(inp.content ?? '').slice(0, 1200)}
        </pre>
      </>
    )
  } else if (t === 'Bash') {
    preview = (
      <pre style={{ margin: 0, maxHeight: '160px', overflow: 'auto', color: '#4ade80', fontFamily: 'monospace', fontSize: '22px', whiteSpace: 'pre-wrap' }}>
        $ {inp.command || ''}
      </pre>
    )
  } else {
    preview = (
      <pre style={{ margin: 0, maxHeight: '160px', overflow: 'auto', color: '#9ca3af', fontFamily: 'monospace', fontSize: '20px', whiteSpace: 'pre-wrap' }}>
        {JSON.stringify(inp, null, 2).slice(0, 1200)}
      </pre>
    )
  }

  return (
    <div style={{ background: '#1a1405', border: '1px solid #5a4a15', borderRadius: '8px', padding: '10px 12px', margin: '0 10px 8px', pointerEvents: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        <span style={{ fontSize: '24px' }}>🙋</span>
        <span style={{ color: '#fbbf24', fontWeight: 600, fontSize: '24px' }}>İzin isteği</span>
        <span style={{ color: '#a08020', fontSize: '22px' }}>· {t}</span>
      </div>
      <div style={{ background: '#0d0a02', border: '1px solid #3a2e10', borderRadius: '5px', padding: '6px 8px', marginBottom: '8px' }}>
        {preview}
      </div>
      <div style={{ display: 'flex', gap: '8px' }}>
        <button
          onClick={e => { e.stopPropagation(); onAllow() }}
          onPointerDown={e => e.stopPropagation()}
          style={{ flex: 1, background: 'linear-gradient(135deg,#15803d,#22c55e)', border: 'none', borderRadius: '5px', color: '#fff', padding: '8px', fontSize: '24px', cursor: 'pointer', pointerEvents: 'auto' }}
        >✓ İzin ver</button>
        <button
          onClick={e => { e.stopPropagation(); onDeny() }}
          onPointerDown={e => e.stopPropagation()}
          style={{ flex: 1, background: '#3a1515', border: '1px solid #5a2525', borderRadius: '5px', color: '#f87171', padding: '8px', fontSize: '24px', cursor: 'pointer', pointerEvents: 'auto' }}
        >✗ Reddet</button>
      </div>
    </div>
  )
}

function SessionMesh({ id, width, height, apiBase = '/api/ai-session', icon = '🤖', label = 'Claude' }) {
  const w = parseFloat(width)
  const h = parseFloat(height)
  const pxWidth  = Math.round(w * SESSION_PX_PER_UNIT)
  const pxHeight = Math.round(h * SESSION_PX_PER_UNIT)
  const scaleFactor = w * 40 / pxWidth

  const MODELS = [
    { value: 'claude-fable-5',           label: 'Fable 5' },
    { value: 'claude-opus-4-8',          label: 'Opus 4.8' },
    { value: 'claude-sonnet-4-6',        label: 'Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001',label: 'Haiku 4.5' },
  ]

  const [messages, setMessages]       = useState([])
  const [streaming, setStreaming]     = useState(false)
  const [thinking, setThinking]       = useState(false)
  const [connected, setConnected]     = useState(false)
  const [error, setError]             = useState(null)
  const [model, setModel]             = useState('claude-fable-5')
  const [effort, setEffort]           = useState('normal')
  const [permMode, setPermMode]       = useState('bypassPermissions')
  const [contextTokens, setContextTokens] = useState(null)
  const [pendingPerms, setPendingPerms] = useState([])  // bekleyen izin istekleri
  const msgListRef  = useRef(null)
  const inputRef    = useRef(null)
  const activeAiRef = useRef(null)

  const decidePermission = (toolUseId, decision) => {
    setPendingPerms(prev => prev.filter(p => p.toolUseId !== toolUseId))
    fetch('/api/permission/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolUseId, decision }),
    }).catch(() => {})
  }

  // Scroll to bottom on new messages
  useEffect(() => {
    const el = msgListRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
    return () => cancelAnimationFrame(raf)
  }, [messages, thinking])

  // Persist settings change to DB
  const saveSetting = (key, value) => {
    fetch(`${apiBase}/${id}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {})
  }

  // Load this tile's persistent session history + settings on mount
  useEffect(() => {
    let cancelled = false
    fetch(`${apiBase}/${id}/history`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.error) { setError(data.error); return }
        setConnected(true)
        if (data.model)  setModel(data.model)
        if (data.effort) setEffort(data.effort)
        if (data.permissionMode) setPermMode(data.permissionMode)
        setMessages((data.messages || []).map(m => ({
          id: m.id, role: m.role === 'assistant' ? 'ai' : m.role,
          content: m.text, toolName: m.toolName
        })))
      })
      .catch(() => { if (!cancelled) setError('Geçmiş yüklenemedi') })
    return () => { cancelled = true }
  }, [id])

  const submit = async () => {
    const msg = inputRef.current?.value?.trim() ?? ''
    if (!msg || streaming) return
    if (inputRef.current) inputRef.current.value = ''

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: msg }])
    setStreaming(true)
    setThinking(false)
    activeAiRef.current = null
    const streamSeenIds = new Set()

    try {
      const resp = await fetch(`${apiBase}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: id, message: msg }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'error', content: err.error || `HTTP ${resp.status}` }])
        return
      }

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const ev = JSON.parse(raw)
            if (ev.type === 'done') break

            if (ev.type === 'permission_request') {
              setPendingPerms(prev =>
                prev.some(p => p.toolUseId === ev.toolUseId) ? prev
                  : [...prev, { toolUseId: ev.toolUseId, toolName: ev.toolName, toolInput: ev.toolInput }]
              )
            }

            if (ev.type === 'system' && ev.subtype === 'thinking_tokens') setThinking(true)

            if (ev.type === 'assistant') {
              const msgId  = ev.message?.id
              const blocks = ev.message?.content ?? []
              const hasText  = blocks.some(b => b.type === 'text' && b.text)
              const hasThink = blocks.some(b => b.type === 'thinking')

              if (hasThink && !hasText) setThinking(true)

              if (hasText) {
                setThinking(false)
                const text = blocks.find(b => b.type === 'text').text
                if (!streamSeenIds.has(msgId)) {
                  streamSeenIds.add(msgId)
                  const newId = `stream-${msgId}`
                  activeAiRef.current = { id: newId, msgId }
                  // Only add if not already in messages (from JSONL watcher)
                  setMessages(prev =>
                    prev.some(m => m.id === newId) ? prev
                      : [...prev, { id: newId, role: 'ai', content: text }]
                  )
                } else if (activeAiRef.current?.msgId === msgId) {
                  const eid = activeAiRef.current.id
                  setMessages(prev => prev.map(m => m.id === eid ? { ...m, content: text } : m))
                }
              }

              for (const b of blocks.filter(b => b.type === 'tool_use')) {
                const tid = `stream-tc-${b.id}`
                const cmd = b.input?.command || b.input?.description || b.name
                setMessages(prev =>
                  prev.some(m => m.id === tid) ? prev
                    : [...prev, { id: tid, role: 'tool_call', content: cmd, toolName: b.name }]
                )
              }
            }

            if (ev.type === 'tool') {
              const tid = `stream-tr-${ev.tool_use_id}`
              const out = ev.content?.[0]?.text ?? ''
              setMessages(prev =>
                prev.some(m => m.id === tid) ? prev
                  : [...prev, { id: tid, role: 'tool_result', content: out }]
              )
            }

            if (ev.type === 'result' && ev.usage) {
              const used = (ev.usage.input_tokens || 0) + (ev.usage.cache_read_input_tokens || 0) + (ev.usage.cache_creation_input_tokens || 0)
              setContextTokens({ used, window: 200000 })
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'error', content: err.message }])
    } finally {
      setStreaming(false)
      setThinking(false)
      activeAiRef.current = null
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const onKeyDown = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  const px = { pointerEvents: 'auto' }

  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      <Html transform position={[0, 0, 0.01]} scale={scaleFactor} style={{ pointerEvents: 'none' }}>
        <style>{`
          @keyframes sBar{0%{left:-40%}100%{left:110%}}
          @keyframes sDot{0%,80%,100%{opacity:0.2}40%{opacity:1}}

          .session-markdown h1, .session-markdown h2, .session-markdown h3 { margin: 12px 0 6px 0; font-weight: bold; }
          .session-markdown h1 { font-size: 1.4em; }
          .session-markdown h2 { font-size: 1.2em; }
          .session-markdown h3 { font-size: 1.1em; }
          .session-markdown strong { color: #60a5fa; font-weight: bold; }
          .session-markdown em { color: #a0d8a0; font-style: italic; }
          .session-markdown code { background: #0a0a0a; border: 1px solid #1e3a2e; padding: 2px 4px; border-radius: 3px; color: #4ade80; font-family: monospace; }
          .session-markdown pre { background: #0a0a0a; border: 1px solid #1e3a2e; border-radius: 4px; padding: 8px 10px; overflow-x: auto; margin: 8px 0; }
          .session-markdown pre code { background: none; border: none; padding: 0; color: #4ade80; }
          .session-markdown ul, .session-markdown ol { margin: 6px 0; padding-left: 20px; }
          .session-markdown li { margin: 3px 0; }
          .session-markdown blockquote { border-left: 3px solid #2a5a8a; padding-left: 10px; margin: 6px 0; color: #a0a0a0; }
          .session-markdown a { color: #60a5fa; text-decoration: underline; }
          .session-markdown a:hover { color: #93c5fd; }
          .session-markdown p { margin: 4px 0; }
        `}</style>
        <div
          style={{
            width: `${pxWidth}px`, height: `${pxHeight}px`,
            backgroundColor: '#0d0d0d', borderRadius: '8px',
            border: `1px solid ${connected ? '#1e3a5f' : '#2a1a1a'}`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            fontFamily: 'system-ui, sans-serif', pointerEvents: 'auto',
          }}
          onClick={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '6px 10px', background: 'linear-gradient(135deg,#1a2a3a,#0d1f2d)', borderBottom: '1px solid #1e3a5f', display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, flexWrap: 'wrap', ...px }}>
            <span style={{ fontSize: '26px' }}>{icon}</span>
            <span style={{ color: '#60a5fa', fontWeight: 600, fontSize: '22px' }}>{label}</span>
            <span style={{ color: '#1e3a5f', fontSize: '20px' }}>#{ String(id).slice(-4) }</span>

            {/* Model selector */}
            <select
              value={model}
              onChange={e => { setModel(e.target.value); saveSetting('model', e.target.value) }}
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
              style={{ background: '#0d1f2d', border: '1px solid #2a5a8a', color: '#60a5fa', borderRadius: '4px', fontSize: '20px', padding: '2px 6px', cursor: 'pointer', pointerEvents: 'auto', outline: 'none' }}
            >
              {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>

            {/* Effort selector */}
            <div style={{ display: 'flex', gap: '3px', ...px }}>
              {[['low','↓'],['normal','→'],['high','↑']].map(([val, icon]) => (
                <button
                  key={val}
                  onClick={e => { e.stopPropagation(); setEffort(val); saveSetting('effort', val) }}
                  onPointerDown={e => e.stopPropagation()}
                  title={val === 'low' ? 'Düşük effort' : val === 'normal' ? 'Normal effort' : 'Yüksek effort'}
                  style={{
                    padding: '2px 6px', borderRadius: '4px', fontSize: '20px', cursor: 'pointer',
                    border: effort === val ? '1px solid #60a5fa' : '1px solid #1e3a5f',
                    background: effort === val ? 'rgba(96,165,250,0.2)' : 'transparent',
                    color: effort === val ? '#60a5fa' : '#4a6a8a', pointerEvents: 'auto',
                  }}
                >{icon} {val}</button>
              ))}
            </div>

            {/* Permission mode selector */}
            <select
              value={permMode}
              onChange={e => { setPermMode(e.target.value); saveSetting('permissionMode', e.target.value) }}
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
              title="İzin modu"
              style={{ background: '#0d1f2d', border: '1px solid #2a5a8a', color: '#60a5fa', borderRadius: '4px', fontSize: '20px', padding: '2px 6px', cursor: 'pointer', pointerEvents: 'auto', outline: 'none' }}
            >
              <option value="bypassPermissions">🔓 bypass</option>
              <option value="acceptEdits">✎ accept edits</option>
              <option value="ask">🙋 ask</option>
              <option value="plan">📋 plan</option>
            </select>

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: connected ? '#4ade80' : '#ef4444', display: 'inline-block' }} />
              <span style={{ color: connected ? '#4ade80' : '#ef4444', fontSize: '18px' }}>
                {connected ? 'hazır' : 'yükleniyor...'}
              </span>
            </div>
          </div>

          {/* Loading bar */}
          {streaming && (
            <div style={{ position: 'relative', height: '3px', background: '#1e3a5f', flexShrink: 0, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, height: '100%', width: '40%', background: 'linear-gradient(90deg,transparent,#60a5fa,transparent)', animation: 'sBar 1.4s linear infinite' }} />
            </div>
          )}

          {/* Context used bar */}
          {contextTokens && (() => {
            const pct = Math.min(contextTokens.used / contextTokens.window, 1)
            const pctRound = Math.round(pct * 100)
            const barColor = pct < 0.6 ? '#4ade80' : pct < 0.85 ? '#fbbf24' : '#f87171'
            const kStr = contextTokens.used >= 1000 ? `${(contextTokens.used / 1000).toFixed(1)}k` : String(contextTokens.used)
            return (
              <div style={{ padding: '4px 10px 5px', background: '#0a0f1a', borderBottom: '1px solid #1e3a5f', flexShrink: 0, ...px }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <span style={{ color: '#4a6a8a', fontSize: '18px' }}>context</span>
                  <span style={{ color: barColor, fontSize: '18px', fontVariantNumeric: 'tabular-nums' }}>{kStr} / 200k &nbsp;{pctRound}%</span>
                </div>
                <div style={{ height: '4px', background: '#1e3a5f', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, background: barColor, borderRadius: '2px', transition: 'width 0.4s ease, background 0.4s ease' }} />
                </div>
              </div>
            )
          })()}

          {/* Messages */}
          <div ref={msgListRef} style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', ...px }}>
            {messages.length === 0 && !streaming && (
              <div style={{ color: error ? '#f87171' : '#2a4a6a', fontSize: '22px', textAlign: 'center', marginTop: '16px' }}>
                {error || (connected ? 'Yeni session — ilk mesajını yazabilirsin.' : 'Yükleniyor...')}
              </div>
            )}
            {messages.map(m => <SessionMessageBubble key={m.id} msg={m} />)}
            {thinking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', background: '#0a1520', border: '1px solid #1e3a5f', borderRadius: '10px 10px 10px 2px', width: 'fit-content' }}>
                <span style={{ color: '#60a5fa', fontSize: '22px' }}>🧠</span>
                {[0, 150, 300].map(delay => (
                  <span key={delay} style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#60a5fa', display: 'inline-block', animation: `sDot 1.2s ${delay}ms ease-in-out infinite` }} />
                ))}
              </div>
            )}
            {streaming && !thinking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', background: '#0a1520', border: '1px solid #1e3a5f', borderRadius: '10px 10px 10px 2px', width: 'fit-content' }}>
                <span style={{ color: '#4a6a8a', fontSize: '22px' }}>⏳ Yanıt bekleniyor...</span>
              </div>
            )}
          </div>

          {/* Bekleyen izin istekleri (ask modu) */}
          {pendingPerms.length > 0 && (
            <div style={{ flexShrink: 0, paddingTop: '8px', ...px }}>
              {pendingPerms.map(p => (
                <PermissionPrompt
                  key={p.toolUseId}
                  req={p}
                  onAllow={() => decidePermission(p.toolUseId, 'allow')}
                  onDeny={() => decidePermission(p.toolUseId, 'deny')}
                />
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '8px 10px', borderTop: '1px solid #1e3a5f', display: 'flex', gap: '6px', alignItems: 'flex-end', flexShrink: 0, background: '#0a0f1a', ...px }}>
            <textarea
              ref={inputRef}
              onKeyDown={onKeyDown}
              onClick={e => e.stopPropagation()}
              placeholder={streaming ? 'Yanıt bekleniyor...' : 'Mesaj yaz... (Enter: gönder)'}
              disabled={streaming || !connected}
              style={{
                flex: 1, background: '#0d1f2d',
                border: `1px solid ${streaming ? '#1e3a5f' : '#2a5a8a'}`,
                borderRadius: '5px', color: streaming ? '#4a6a8a' : '#e0e0e0', fontSize: '24px',
                padding: '7px 9px', resize: 'none', outline: 'none',
                fontFamily: 'system-ui, sans-serif', lineHeight: '1.4', height: '52px',
                boxSizing: 'border-box', pointerEvents: 'auto',
              }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); submit() }}
              disabled={streaming || !connected}
              style={{
                background: (streaming || !connected) ? '#1e3a5f' : 'linear-gradient(135deg,#2563eb,#60a5fa)',
                border: 'none', borderRadius: '5px', color: '#fff', padding: '0 14px',
                cursor: (streaming || !connected) ? 'not-allowed' : 'pointer',
                fontSize: '32px', height: '52px', flexShrink: 0, pointerEvents: 'auto',
              }}
            >
              {streaming ? '⏳' : '→'}
            </button>
          </div>
        </div>
      </Html>
    </mesh>
  )
}

// roomsession tile — SessionMesh ile aynı arayüz, ama odaya özel proje klasöründe
// çalışan /api/roomsession endpoint'lerine bağlanır.
function RoomSessionMesh({ id, width, height }) {
  return <SessionMesh id={id} width={width} height={height} apiBase="/api/roomsession" icon="🏗" label="Proje" />
}

// roomchat ve bluprint tile'ları aynı sohbet/üret iskeletini paylaşır; tek fark
// besledikleri skill (graphify ↔ reconstruct) ve durum/etiket metinleridir.
// Farklar bir variant nesnesinde toplanır.
const ROOMCHAT_VARIANT = {
  apiBase: '/api/roomchat',
  statusField: 'graph',
  icon: '🧠',
  title: 'Oda Sohbeti',
  rebuildIdle: 'Güncelle',
  rebuildBusy: 'Kuruluyor…',
  rebuildTitle: 'Odanın metinlerinden bilgi grafını yeniden oluştur',
  rebuildStartLog: 'Oda metinleri toplanıyor…',
  rebuildingPlaceholder: 'Graf kuruluyor...',
  inputPlaceholder: 'Oda hakkında soru sor... (Enter: gönder)',
  statusLabel: (s, fmt) => s.exists
    ? `graf: ${s.nodeCount} düğüm${fmt(s.builtAt) ? ' · ' + fmt(s.builtAt) : ''}`
    : 'graf yok — Güncelle ile kur',
  emptyReady: 'Bu odanın içeriği hakkında soru sor.',
  emptyHint:  'Önce ⟳ Güncelle ile odanın grafını kur, sonra sohbet et.',
}
const BLUPRINT_VARIANT = {
  apiBase: '/api/bluprint',
  statusField: 'blueprint',
  icon: '📐',
  title: 'Blueprint',
  rebuildIdle: 'Üret',
  rebuildBusy: 'Üretiliyor…',
  rebuildTitle: 'Oda proje klasörünü seçili skill ile yeniden-kurulabilir kurulum kitine çevir',
  hasSkillControls: true,
  rebuildStartLog: 'Proje klasörü analiz ediliyor…',
  rebuildingPlaceholder: 'Blueprint üretiliyor...',
  inputPlaceholder: 'Blueprint hakkında soru sor / kur-prompt iste... (Enter: gönder)',
  statusLabel: (s, fmt) => s.exists
    ? `blueprint: ${s.featureCount} feature${fmt(s.builtAt) ? ' · ' + fmt(s.builtAt) : ''}`
    : 'blueprint yok — Üret ile oluştur',
  emptyReady: 'Bu projeyi başka bir projede nasıl kuracağını sor (kur-prompt isteyebilirsin).',
  emptyHint:  'Önce ⟳ Üret ile proje klasörünü reconstruct et, sonra sohbet et.',
}

function RoomChatMesh(props) { return <SkillChatMesh {...props} variant={ROOMCHAT_VARIANT} /> }
function BluprintMesh(props) { return <SkillChatMesh {...props} variant={BLUPRINT_VARIANT} /> }

function SkillChatMesh({ id, width, height, variant }) {
  const w = parseFloat(width)
  const h = parseFloat(height)
  const pxWidth  = Math.round(w * SESSION_PX_PER_UNIT)
  const pxHeight = Math.round(h * SESSION_PX_PER_UNIT)
  const scaleFactor = w * 40 / pxWidth

  const MODELS = [
    { value: 'claude-fable-5',           label: 'Fable 5' },
    { value: 'claude-opus-4-8',          label: 'Opus 4.8' },
    { value: 'claude-sonnet-4-6',        label: 'Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001',label: 'Haiku 4.5' },
  ]

  const [messages, setMessages]       = useState([])
  const [streaming, setStreaming]     = useState(false)
  const [thinking, setThinking]       = useState(false)
  const [connected, setConnected]     = useState(false)
  const [error, setError]             = useState(null)
  const [model, setModel]             = useState('claude-fable-5')
  const [effort, setEffort]           = useState('normal')
  const [permMode, setPermMode]       = useState('bypassPermissions')
  const [contextTokens, setContextTokens] = useState(null)
  const [status, setStatus]           = useState({ exists: false, nodeCount: 0, featureCount: 0, builtAt: null })
  const [skill, setSkill]             = useState('reconstruct')
  const [scope, setScope]             = useState('')
  const [skillList, setSkillList]     = useState([])
  const [rebuilding, setRebuilding]   = useState(false)
  const [rebuildLog, setRebuildLog]   = useState('')
  const [pendingPerms, setPendingPerms] = useState([])  // bekleyen izin istekleri
  const msgListRef  = useRef(null)
  const inputRef    = useRef(null)
  const activeAiRef = useRef(null)

  const decidePermission = (toolUseId, decision) => {
    setPendingPerms(prev => prev.filter(p => p.toolUseId !== toolUseId))
    fetch('/api/permission/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ toolUseId, decision }),
    }).catch(() => {})
  }

  useEffect(() => {
    const el = msgListRef.current
    if (!el) return
    const raf = requestAnimationFrame(() => { el.scrollTop = el.scrollHeight })
    return () => cancelAnimationFrame(raf)
  }, [messages, thinking])

  const saveSetting = (key, value) => {
    fetch(`${variant.apiBase}/${id}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    }).catch(() => {})
  }

  const loadHistory = (signal) => {
    fetch(`${variant.apiBase}/${id}/history`, signal ? { signal } : undefined)
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        setConnected(true)
        if (data.model)  setModel(data.model)
        if (data.effort) setEffort(data.effort)
        if (data.permissionMode) setPermMode(data.permissionMode)
        if (data[variant.statusField]) setStatus(data[variant.statusField])
        if (data.skill) setSkill(data.skill)
        if (typeof data.scope === 'string') setScope(data.scope)
        if (Array.isArray(data.skills)) setSkillList(data.skills)
        setMessages((data.messages || []).map(m => ({
          id: m.id, role: m.role === 'assistant' ? 'ai' : m.role,
          content: m.text, toolName: m.toolName
        })))
      })
      .catch(() => {})
  }

  useEffect(() => {
    const ctrl = new AbortController()
    loadHistory(ctrl.signal)
    return () => ctrl.abort()
  }, [id])

  // "Üret/Güncelle" — kaynak içeriği toplayıp skill ile çıktıyı yeniden kur
  const rebuild = async () => {
    if (rebuilding || streaming) return
    setRebuilding(true)
    setRebuildLog(variant.rebuildStartLog)
    try {
      const resp = await fetch(`${variant.apiBase}/${id}/rebuild`, { method: 'POST' })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setRebuildLog('Hata: ' + (err.error || `HTTP ${resp.status}`))
        return
      }
      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const ev = JSON.parse(raw)
            if (ev.type === 'done') break
            if (ev.type === 'error') { setRebuildLog('Hata: ' + ev.message); continue }
            if (ev.type === 'assistant') {
              const blocks = ev.message?.content ?? []
              const text = blocks.find(b => b.type === 'text' && b.text)?.text
              if (text) setRebuildLog(text.slice(0, 160))
              const tool = blocks.find(b => b.type === 'tool_use')
              if (tool) setRebuildLog('⚙ ' + (tool.input?.command || tool.input?.description || tool.name || 'çalışıyor…').slice(0, 140))
            }
          } catch {}
        }
      }
    } catch (err) {
      setRebuildLog('Hata: ' + err.message)
    } finally {
      setRebuilding(false)
      loadHistory()
    }
  }

  const submit = async () => {
    const msg = inputRef.current?.value?.trim() ?? ''
    if (!msg || streaming || rebuilding) return
    if (inputRef.current) inputRef.current.value = ''

    setMessages(prev => [...prev, { id: `u-${Date.now()}`, role: 'user', content: msg }])
    setStreaming(true)
    setThinking(false)
    activeAiRef.current = null
    const streamSeenIds = new Set()

    try {
      const resp = await fetch(`${variant.apiBase}/message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaId: id, message: msg }),
      })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}))
        setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'error', content: err.error || `HTTP ${resp.status}` }])
        return
      }

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          try {
            const ev = JSON.parse(raw)
            if (ev.type === 'done') break

            if (ev.type === 'permission_request') {
              setPendingPerms(prev =>
                prev.some(p => p.toolUseId === ev.toolUseId) ? prev
                  : [...prev, { toolUseId: ev.toolUseId, toolName: ev.toolName, toolInput: ev.toolInput }]
              )
            }

            if (ev.type === 'system' && ev.subtype === 'thinking_tokens') setThinking(true)

            if (ev.type === 'assistant') {
              const msgId  = ev.message?.id
              const blocks = ev.message?.content ?? []
              const hasText  = blocks.some(b => b.type === 'text' && b.text)
              const hasThink = blocks.some(b => b.type === 'thinking')

              if (hasThink && !hasText) setThinking(true)

              if (hasText) {
                setThinking(false)
                const text = blocks.find(b => b.type === 'text').text
                if (!streamSeenIds.has(msgId)) {
                  streamSeenIds.add(msgId)
                  const newId = `stream-${msgId}`
                  activeAiRef.current = { id: newId, msgId }
                  setMessages(prev =>
                    prev.some(m => m.id === newId) ? prev
                      : [...prev, { id: newId, role: 'ai', content: text }]
                  )
                } else if (activeAiRef.current?.msgId === msgId) {
                  const eid = activeAiRef.current.id
                  setMessages(prev => prev.map(m => m.id === eid ? { ...m, content: text } : m))
                }
              }

              for (const b of blocks.filter(b => b.type === 'tool_use')) {
                const tid = `stream-tc-${b.id}`
                const cmd = b.input?.command || b.input?.description || b.name
                setMessages(prev =>
                  prev.some(m => m.id === tid) ? prev
                    : [...prev, { id: tid, role: 'tool_call', content: cmd, toolName: b.name }]
                )
              }
            }

            if (ev.type === 'tool') {
              const tid = `stream-tr-${ev.tool_use_id}`
              const out = ev.content?.[0]?.text ?? ''
              setMessages(prev =>
                prev.some(m => m.id === tid) ? prev
                  : [...prev, { id: tid, role: 'tool_result', content: out }]
              )
            }

            if (ev.type === 'result' && ev.usage) {
              const used = (ev.usage.input_tokens || 0) + (ev.usage.cache_read_input_tokens || 0) + (ev.usage.cache_creation_input_tokens || 0)
              setContextTokens({ used, window: 200000 })
            }
          } catch {}
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { id: `e-${Date.now()}`, role: 'error', content: err.message }])
    } finally {
      setStreaming(false)
      setThinking(false)
      activeAiRef.current = null
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  const onKeyDown = (e) => {
    e.stopPropagation()
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() }
  }

  const fmtBuilt = (iso) => {
    if (!iso) return null
    try {
      const d = new Date(iso)
      return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch { return null }
  }

  const px = { pointerEvents: 'auto' }
  const ACC = '#a78bfa'

  return (
    <mesh position={[0, 0, 0.02]}>
      <planeGeometry args={[w, h]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} side={THREE.DoubleSide} />
      <Html transform position={[0, 0, 0.01]} scale={scaleFactor} style={{ pointerEvents: 'none' }}>
        <style>{`
          @keyframes sBar{0%{left:-40%}100%{left:110%}}
          @keyframes sDot{0%,80%,100%{opacity:0.2}40%{opacity:1}}
          @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}

          .session-markdown h1, .session-markdown h2, .session-markdown h3 { margin: 12px 0 6px 0; font-weight: bold; }
          .session-markdown h1 { font-size: 1.4em; }
          .session-markdown h2 { font-size: 1.2em; }
          .session-markdown h3 { font-size: 1.1em; }
          .session-markdown strong { color: ${ACC}; font-weight: bold; }
          .session-markdown em { color: #c4b5fd; font-style: italic; }
          .session-markdown code { background: #0a0a0a; border: 1px solid #3a2e5e; padding: 2px 4px; border-radius: 3px; color: #c4b5fd; font-family: monospace; }
          .session-markdown pre { background: #0a0a0a; border: 1px solid #3a2e5e; border-radius: 4px; padding: 8px 10px; overflow-x: auto; margin: 8px 0; }
          .session-markdown pre code { background: none; border: none; padding: 0; color: #c4b5fd; }
          .session-markdown ul, .session-markdown ol { margin: 6px 0; padding-left: 20px; }
          .session-markdown li { margin: 3px 0; }
          .session-markdown blockquote { border-left: 3px solid #5a2a8a; padding-left: 10px; margin: 6px 0; color: #a0a0a0; }
          .session-markdown a { color: ${ACC}; text-decoration: underline; }
          .session-markdown p { margin: 4px 0; }
        `}</style>
        <div
          style={{
            width: `${pxWidth}px`, height: `${pxHeight}px`,
            backgroundColor: '#0d0a14', borderRadius: '8px',
            border: `1px solid ${connected ? '#3a2e5e' : '#2a1a1a'}`,
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            fontFamily: 'system-ui, sans-serif', pointerEvents: 'auto',
          }}
          onClick={e => e.stopPropagation()}
          onPointerDown={e => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ padding: '6px 10px', background: 'linear-gradient(135deg,#2a1a3a,#1a0d2d)', borderBottom: `1px solid #3a2e5e`, display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, flexWrap: 'wrap', ...px }}>
            <span style={{ fontSize: '26px' }}>{variant.icon}</span>
            <span style={{ color: ACC, fontWeight: 600, fontSize: '22px' }}>{variant.title}</span>
            <span style={{ color: '#3a2e5e', fontSize: '20px' }}>#{ String(id).slice(-4) }</span>

            <select
              value={model}
              onChange={e => { setModel(e.target.value); saveSetting('model', e.target.value) }}
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
              style={{ background: '#1a0d2d', border: `1px solid #5a3a8a`, color: ACC, borderRadius: '4px', fontSize: '20px', padding: '2px 6px', cursor: 'pointer', pointerEvents: 'auto', outline: 'none' }}
            >
              {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>

            <div style={{ display: 'flex', gap: '3px', ...px }}>
              {[['low','↓'],['normal','→'],['high','↑']].map(([val, icon]) => (
                <button
                  key={val}
                  onClick={e => { e.stopPropagation(); setEffort(val); saveSetting('effort', val) }}
                  onPointerDown={e => e.stopPropagation()}
                  title={val === 'low' ? 'Düşük effort' : val === 'normal' ? 'Normal effort' : 'Yüksek effort'}
                  style={{
                    padding: '2px 6px', borderRadius: '4px', fontSize: '20px', cursor: 'pointer',
                    border: effort === val ? `1px solid ${ACC}` : '1px solid #3a2e5e',
                    background: effort === val ? 'rgba(167,139,250,0.2)' : 'transparent',
                    color: effort === val ? ACC : '#6a5a8a', pointerEvents: 'auto',
                  }}
                >{icon} {val}</button>
              ))}
            </div>

            {/* Permission mode selector */}
            <select
              value={permMode}
              onChange={e => { setPermMode(e.target.value); saveSetting('permissionMode', e.target.value) }}
              onClick={e => e.stopPropagation()}
              onPointerDown={e => e.stopPropagation()}
              title="İzin modu"
              style={{ background: '#1a0d2d', border: `1px solid #5a3a8a`, color: ACC, borderRadius: '4px', fontSize: '20px', padding: '2px 6px', cursor: 'pointer', pointerEvents: 'auto', outline: 'none' }}
            >
              <option value="bypassPermissions">🔓 bypass</option>
              <option value="acceptEdits">✎ accept edits</option>
              <option value="ask">🙋 ask</option>
              <option value="plan">📋 plan</option>
            </select>

            {/* Blueprint: analiz skill'i + kapsam (yalnızca bluprint variant'ında) */}
            {variant.hasSkillControls && (
              <>
                <select
                  value={skill}
                  onChange={e => { setSkill(e.target.value); saveSetting('skill', e.target.value) }}
                  onClick={e => e.stopPropagation()}
                  onPointerDown={e => e.stopPropagation()}
                  title="Analiz skill'i"
                  style={{ background: '#1a0d2d', border: `1px solid #5a3a8a`, color: ACC, borderRadius: '4px', fontSize: '20px', padding: '2px 6px', cursor: 'pointer', pointerEvents: 'auto', outline: 'none', maxWidth: '180px' }}
                >
                  {(skillList.length ? skillList : [{ id: 'reconstruct', label: 'reconstruct', installed: true }]).map(sk => (
                    <option key={sk.id} value={sk.id} disabled={!sk.installed}>
                      {sk.id}{sk.installed ? '' : ' (yok)'}
                    </option>
                  ))}
                </select>
                <input
                  value={scope}
                  onChange={e => setScope(e.target.value)}
                  onBlur={e => saveSetting('scope', e.target.value.trim())}
                  onClick={e => e.stopPropagation()}
                  onPointerDown={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                  placeholder="kapsam: tüm proje (ör. login)"
                  title="Boş = tüm proje; özellik adı yazarsan yalnızca o özelliğe odaklanır"
                  style={{ background: '#1a0d2d', border: `1px solid #5a3a8a`, color: '#e0e0e0', borderRadius: '4px', fontSize: '20px', padding: '2px 6px', pointerEvents: 'auto', outline: 'none', width: '200px' }}
                />
              </>
            )}

            <button
              onClick={e => { e.stopPropagation(); rebuild() }}
              onPointerDown={e => e.stopPropagation()}
              disabled={rebuilding || streaming}
              title={variant.rebuildTitle}
              style={{
                marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px',
                padding: '3px 10px', borderRadius: '5px', fontSize: '20px',
                border: `1px solid ${ACC}`, cursor: (rebuilding || streaming) ? 'not-allowed' : 'pointer',
                background: rebuilding ? 'rgba(167,139,250,0.25)' : 'rgba(167,139,250,0.1)',
                color: ACC, pointerEvents: 'auto', opacity: (rebuilding || streaming) ? 0.6 : 1,
              }}
            >
              <span style={{ display: 'inline-block', animation: rebuilding ? 'spin 1s linear infinite' : 'none' }}>⟳</span>
              {rebuilding ? variant.rebuildBusy : (variant.hasSkillControls && scope.trim() ? 'Özellik kiti üret' : variant.rebuildIdle)}
            </button>
          </div>

          {/* Durum / rebuild log */}
          <div style={{ padding: '4px 10px 5px', background: '#0a0712', borderBottom: `1px solid #3a2e5e`, flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px', ...px }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: status.exists ? '#4ade80' : '#6a5a8a', display: 'inline-block', flexShrink: 0 }} />
            <span style={{ color: status.exists ? '#9a8ac0' : '#6a5a8a', fontSize: '18px', flexShrink: 0 }}>
              {variant.statusLabel(status, fmtBuilt)}
            </span>
            {rebuilding && rebuildLog && (
              <span style={{ color: ACC, fontSize: '18px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, fontFamily: 'monospace' }}>
                {rebuildLog}
              </span>
            )}
          </div>

          {/* Loading bar */}
          {(streaming || rebuilding) && (
            <div style={{ position: 'relative', height: '3px', background: '#3a2e5e', flexShrink: 0, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', top: 0, height: '100%', width: '40%', background: `linear-gradient(90deg,transparent,${ACC},transparent)`, animation: 'sBar 1.4s linear infinite' }} />
            </div>
          )}

          {/* Context used bar */}
          {contextTokens && (() => {
            const pct = Math.min(contextTokens.used / contextTokens.window, 1)
            const pctRound = Math.round(pct * 100)
            const barColor = pct < 0.6 ? '#4ade80' : pct < 0.85 ? '#fbbf24' : '#f87171'
            const kStr = contextTokens.used >= 1000 ? `${(contextTokens.used / 1000).toFixed(1)}k` : String(contextTokens.used)
            return (
              <div style={{ padding: '4px 10px 5px', background: '#0a0712', borderBottom: `1px solid #3a2e5e`, flexShrink: 0, ...px }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                  <span style={{ color: '#6a5a8a', fontSize: '18px' }}>context</span>
                  <span style={{ color: barColor, fontSize: '18px', fontVariantNumeric: 'tabular-nums' }}>{kStr} / 200k &nbsp;{pctRound}%</span>
                </div>
                <div style={{ height: '4px', background: '#3a2e5e', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct * 100}%`, background: barColor, borderRadius: '2px', transition: 'width 0.4s ease, background 0.4s ease' }} />
                </div>
              </div>
            )
          })()}

          {/* Messages */}
          <div ref={msgListRef} style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', ...px }}>
            {messages.length === 0 && !streaming && (
              <div style={{ color: error ? '#f87171' : '#5a4a7a', fontSize: '22px', textAlign: 'center', marginTop: '16px' }}>
                {error || (status.exists ? variant.emptyReady : variant.emptyHint)}
              </div>
            )}
            {messages.map(m => <SessionMessageBubble key={m.id} msg={m} />)}
            {thinking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 10px', background: '#150a20', border: `1px solid #3a2e5e`, borderRadius: '10px 10px 10px 2px', width: 'fit-content' }}>
                <span style={{ color: ACC, fontSize: '22px' }}>🧠</span>
                {[0, 150, 300].map(delay => (
                  <span key={delay} style={{ width: '5px', height: '5px', borderRadius: '50%', background: ACC, display: 'inline-block', animation: `sDot 1.2s ${delay}ms ease-in-out infinite` }} />
                ))}
              </div>
            )}
            {streaming && !thinking && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', padding: '6px 10px', background: '#150a20', border: `1px solid #3a2e5e`, borderRadius: '10px 10px 10px 2px', width: 'fit-content' }}>
                <span style={{ color: '#6a5a8a', fontSize: '22px' }}>⏳ Yanıt bekleniyor...</span>
              </div>
            )}
          </div>

          {/* Bekleyen izin istekleri (ask modu) */}
          {pendingPerms.length > 0 && (
            <div style={{ flexShrink: 0, paddingTop: '8px', ...px }}>
              {pendingPerms.map(p => (
                <PermissionPrompt
                  key={p.toolUseId}
                  req={p}
                  onAllow={() => decidePermission(p.toolUseId, 'allow')}
                  onDeny={() => decidePermission(p.toolUseId, 'deny')}
                />
              ))}
            </div>
          )}

          {/* Input */}
          <div style={{ padding: '8px 10px', borderTop: `1px solid #3a2e5e`, display: 'flex', gap: '6px', alignItems: 'flex-end', flexShrink: 0, background: '#0a0712', ...px }}>
            <textarea
              ref={inputRef}
              onKeyDown={onKeyDown}
              onClick={e => e.stopPropagation()}
              placeholder={streaming ? 'Yanıt bekleniyor...' : rebuilding ? variant.rebuildingPlaceholder : variant.inputPlaceholder}
              disabled={streaming || rebuilding || !connected}
              style={{
                flex: 1, background: '#1a0d2d',
                border: `1px solid ${(streaming || rebuilding) ? '#3a2e5e' : '#5a3a8a'}`,
                borderRadius: '5px', color: (streaming || rebuilding) ? '#6a5a8a' : '#e0e0e0', fontSize: '24px',
                padding: '7px 9px', resize: 'none', outline: 'none',
                fontFamily: 'system-ui, sans-serif', lineHeight: '1.4', height: '52px',
                boxSizing: 'border-box', pointerEvents: 'auto',
              }}
            />
            <button
              onClick={(e) => { e.stopPropagation(); submit() }}
              disabled={streaming || rebuilding || !connected}
              style={{
                background: (streaming || rebuilding || !connected) ? '#3a2e5e' : 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                border: 'none', borderRadius: '5px', color: '#fff', padding: '0 14px',
                cursor: (streaming || rebuilding || !connected) ? 'not-allowed' : 'pointer',
                fontSize: '32px', height: '52px', flexShrink: 0, pointerEvents: 'auto',
              }}
            >
              {streaming ? '⏳' : '→'}
            </button>
          </div>
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
      <Html transform pointerEvents="none" position={[0, 0, 0]} scale={scale}
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
  const isCanvas   = type === 'canvas'
  const isHeader   = type === 'header'
  const isSession  = type === 'session'
  const isRoomChat = type === 'roomchat'
  const isRoomSession = type === 'roomsession'
  const isBluprint = type === 'bluprint'
  const isSlide    = type === 'slide'
  const isGif      = !isVideo && !isYoutube && !isMarkdown && !isEmbed && !isCanvas && !isHeader && !isSession && !isRoomChat && !isRoomSession && !isBluprint && !isSlide
    && typeof url === 'string' && url.toLowerCase().includes('.gif')

  const offsetX = (width - 1) / 2
  const offsetY = (height - 1) / 2

  return (
    <group position={position} rotation={rotation}>
      <group position={[offsetX, offsetY, 0]}>
        {isHeader ? (
          <HeaderMesh id={id} content={content} width={width} height={height} />
        ) : isSession ? (
          <SessionMesh id={id} width={width} height={height} />
        ) : isRoomChat ? (
          <RoomChatMesh id={id} width={width} height={height} />
        ) : isRoomSession ? (
          <RoomSessionMesh id={id} width={width} height={height} />
        ) : isBluprint ? (
          <BluprintMesh id={id} width={width} height={height} />
        ) : isSlide ? (
          <SlideMesh url={url} width={width} height={height} />
        ) : isCanvas ? (
          <CanvasMesh id={id} content={content} width={width} height={height} />
        ) : isMarkdown ? (
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
