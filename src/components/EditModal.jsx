import React, { useState, useEffect, useRef } from 'react'
import { marked } from 'marked'
import { useStore } from '../store/useStore'
import { useSpeechToText } from '../hooks/useSpeechToText'

const micPulseStyle = `@keyframes micPulse { 0%,100%{opacity:1} 50%{opacity:0.35} }`

function MicButton({ listening, onToggle, supported }) {
  if (!supported) return null
  return (
    <>
      <style>{micPulseStyle}</style>
      <button
        type="button"
        onClick={onToggle}
        title={listening ? 'Kaydı durdur' : 'Sesle yaz'}
        style={{
          background: listening ? 'rgba(239,68,68,0.15)' : 'rgba(255,255,255,0.06)',
          border: `1px solid ${listening ? '#ef4444' : '#333'}`,
          borderRadius: '6px',
          padding: '2px 8px',
          cursor: 'pointer',
          fontSize: '13px',
          color: listening ? '#ef4444' : '#666',
          transition: 'all 0.2s',
          animation: listening ? 'micPulse 1.2s ease-in-out infinite' : 'none',
          lineHeight: 1,
        }}
      >
        🎤
      </button>
    </>
  )
}

export function EditModal() {
  const { activeModal, selectedTile, worldMedia, closeModal, addMedia, removeMedia, modalEdit, applyLoopSpecEdit } = useStore()
  // Düzenleme modu: başlatılmamış LoopFlow tile'ının ayarlarını PATCH ile güncelle (yeni media eklemez)
  const loopEditMode = modalEdit?.type === 'roomsession-loop'
  const [activeTab, setActiveTab] = useState('image')
  const [url, setUrl] = useState('')
  const [file, setFile] = useState(null)
  const [width, setWidth] = useState(1)
  const [height, setHeight] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingStep, setLoadingStep] = useState('')
  const [naturalRatio, setNaturalRatio] = useState(null) // ratio = width / height
  const [markdownContent, setMarkdownContent] = useState('')
  const [canvasBg, setCanvasBg]       = useState('#1a1a2e')
  const [headerBg, setHeaderBg]       = useState('#1a1a2e')
  const [headerColor, setHeaderColor] = useState('#ffffff')
  const [editingId, setEditingId] = useState(null)
  const [editingContent, setEditingContent] = useState('')
  const [copiedId, setCopiedId] = useState(null)
  const [pastePreview, setPastePreview] = useState(null)
  const [clonedMedia, setClonedMedia] = useState(null) // { id, type, label, mode: 'copy' | 'cut' }
  const [sessionModel, setSessionModel]   = useState('claude-fable-5')
  const [sessionEffort, setSessionEffort] = useState('normal')
  const [sessionPermMode, setSessionPermMode] = useState('bypassPermissions')
  // LoopFlow (yalnızca roomsession tile): Trigger + Verifiable Goal + Subagent
  const [loopOn, setLoopOn] = useState(false)
  const [loopGoal, setLoopGoal] = useState('')
  const [loopSubagents, setLoopSubagents] = useState('')
  const [loopMaxIter, setLoopMaxIter] = useState(8)
  const [bluprintSkill, setBluprintSkill] = useState('reconstruct')
  const [bluprintScopeOn, setBluprintScopeOn] = useState(false)
  const [bluprintScope, setBluprintScope] = useState('')
  const [bluprintSkills, setBluprintSkills] = useState([
    { id: 'reconstruct', label: 'reconstruct — kurulabilir PRD/kit', installed: true },
    { id: 'codebase-analysis', label: 'codebase-analysis — doğrulanmış teknik doküman', installed: true },
    { id: 'repo-insight', label: 'repo-insight — neden böyle tasarlanmış (best-effort)', installed: true },
  ])
  const [slideFilePath, setSlideFilePath] = useState('')
  const mdMeasureRef   = useRef(null)
  const speech1 = useSpeechToText()
  const speech2 = useSpeechToText()

  // LoopFlow düzenleme modu: modal mevcut değerlerle önden dolu açılır
  useEffect(() => {
    if (!loopEditMode) return
    setActiveTab('roomsession')
    setLoopOn(!!modalEdit.loop)
    setLoopGoal(modalEdit.loop?.goal || '')
    setLoopSubagents(modalEdit.loop?.subagents || '')
    setLoopMaxIter(modalEdit.loop?.maxIterations || 8)
    if (modalEdit.model) setSessionModel(modalEdit.model)
    if (modalEdit.effort) setSessionEffort(modalEdit.effort)
    if (modalEdit.permissionMode) setSessionPermMode(modalEdit.permissionMode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modalEdit])

  // bluprint tab açılınca kurulu skill listesini getir
  useEffect(() => {
    if (activeTab !== 'bluprint') return
    fetch('/api/bluprint/skills')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d.skills) && d.skills.length) setBluprintSkills(d.skills) })
      .catch(() => {})
  }, [activeTab])

  // Markdown: h=5 sabit, içerik ölçülüp kaç sütun gerektiği hesaplanır → w=nCols*2
  const MD_COL_PX_W = 600   // her sütunun CSS piksel genişliği
  const MD_COL_PX_H = 1000  // her sütunun CSS piksel yüksekliği (5 birim × 200 px/birim)
  const MD_H = 5             // sabit 3D yükseklik
  const MD_COL_W = MD_COL_PX_W / (MD_COL_PX_H / MD_H) // = 600/200 = 3 birim/sütun

  useEffect(() => {
    if (activeTab !== 'markdown') return
    if (!markdownContent.trim()) {
      setHeight(MD_H)
      setWidth(MD_COL_W)
      return
    }
    const el = mdMeasureRef.current
    if (!el) return
    el.innerHTML = marked(markdownContent)
    const nCols = Math.max(1, Math.ceil(el.scrollHeight / MD_COL_PX_H))
    setHeight(MD_H)
    setWidth(Number((nCols * MD_COL_W).toFixed(2)))
  }, [markdownContent, activeTab])

  const tileMedia = selectedTile ? worldMedia.filter(
    (m) => String(m.tileId) === String(selectedTile.id)
  ) : []

  React.useEffect(() => {
    const probeAspectRatio = (sourceUrl, type) => {
      if (type === 'youtube' || type === 'embed') {
        setNaturalRatio(16/9)
        setHeight(5)
        setWidth(Number((5 * 16/9).toFixed(2)))
        return
      }
      if (!sourceUrl) return
      if (type === 'video') {
         const vid = document.createElement('video')
         vid.onloadedmetadata = () => {
           if (vid.videoWidth) {
             const ratio = vid.videoWidth / vid.videoHeight
             setNaturalRatio(ratio)
             setHeight(5)
             setWidth(Number((5 * ratio).toFixed(2)))
           }
         }
         vid.src = sourceUrl
      } else {
         const img = new Image()
         img.onload = () => {
           if (img.width) {
             const ratio = img.width / img.height
             setNaturalRatio(ratio)
             setHeight(5)
             setWidth(Number((5 * ratio).toFixed(2)))
           }
         }
         img.src = sourceUrl
      }
    }

    if (file) {
      const objectUrl = URL.createObjectURL(file)
      probeAspectRatio(objectUrl, activeTab)
      return () => URL.revokeObjectURL(objectUrl)
    } else if (activeTab === 'youtube' || activeTab === 'embed') {
      probeAspectRatio(url, activeTab)
    } else if (url && url.length > 5 && url.startsWith('http')) {
      probeAspectRatio(url, activeTab)
    } else {
      setNaturalRatio(null)
    }
  }, [file, url, activeTab])

  const handleFileChange = (e) => {
    const f = e.target.files[0] || null
    setFile(f)
    if (f) { setUrl(''); setPastePreview(null) }
  }

  const handlePasteZone = (e) => {
    const items = Array.from(e.clipboardData?.items || [])
    const imgItem = items.find(i => i.type.startsWith('image/'))
    if (!imgItem) return
    e.preventDefault()
    const blob = imgItem.getAsFile()
    const previewUrl = URL.createObjectURL(blob)
    setFile(blob)
    setUrl('')
    setPastePreview(previewUrl)
  }

  const handleWidthChange = (val) => {
    setWidth(val)
    const w = parseFloat(val)
    if (!isNaN(w) && w > 0 && naturalRatio) {
      setHeight(Number((w / naturalRatio).toFixed(2)))
    }
  }

  const handleHeightChange = (val) => {
    setHeight(val)
    const h = parseFloat(val)
    if (!isNaN(h) && h > 0 && naturalRatio) {
      setWidth(Number((h * naturalRatio).toFixed(2)))
    }
  }

  // Kopyala/Kes butonları için medya tip etiketleri
  const mediaTypeLabel = { image: 'Resim', video: 'Video', youtube: 'YouTube', embed: 'Embed', markdown: 'Metin', canvas: 'Canvas', header: 'Başlık', session: 'AI Session', roomchat: 'Oda Sohbeti', roomsession: 'Oda Projesi', projectview: 'ProjectView', bluprint: 'Blueprint', defter: 'Defter' }

  const handlePaste = async () => {
    if (!clonedMedia || !selectedTile) return
    setLoading(true)
    setLoadingStep('saving')
    try {
      const r = await fetch('/api/media/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: clonedMedia.id,
          tileId: selectedTile.id,
          position: JSON.stringify(selectedTile.position),
          rotation: JSON.stringify(selectedTile.rotation),
        }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Yapıştırılamadı')
      addMedia(d)
      // Kes modunda: klon başarılı olunca kaynağı sil (taşıma)
      if (clonedMedia.mode === 'cut') {
        await fetch(`/api/media/${clonedMedia.id}`, { method: 'DELETE' })
        removeMedia(clonedMedia.id)
      }
      setClonedMedia(null)
      closeModal()
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
      setLoadingStep('')
    }
  }

  const handleApply = async () => {
    if (activeTab === 'header') {
      setLoading(true)
      setLoadingStep('saving')
      try {
        const r = await fetch('/api/header', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            width,
            height,
            bg: headerBg,
            color: headerColor,
            text: '',
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation),
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Başlık oluşturulamadı')
        addMedia(d)
        closeModal()
        setHeaderBg('#1a1a2e')
        setHeaderColor('#ffffff')
        setWidth(4)
        setHeight(1)
      } catch (err) {
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (activeTab === 'session') {
      setLoading(true)
      setLoadingStep('saving')
      try {
        const r = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            width,
            height,
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation),
            model: sessionModel,
            effort: sessionEffort,
            permissionMode: sessionPermMode,
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Session oluşturulamadı')
        addMedia(d)
        closeModal()
        setWidth(6)
        setHeight(4)
      } catch (err) {
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (activeTab === 'defter') {
      setLoading(true)
      setLoadingStep('saving')
      try {
        const r = await fetch('/api/defter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            width,
            height,
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation),
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Defter oluşturulamadı')
        addMedia(d)
        closeModal()
        setWidth(6)
        setHeight(4)
      } catch (err) {
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (activeTab === 'roomchat') {
      setLoading(true)
      setLoadingStep('saving')
      try {
        const r = await fetch('/api/roomchat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            width,
            height,
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation),
            model: sessionModel,
            effort: sessionEffort,
            permissionMode: sessionPermMode,
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Oda sohbeti oluşturulamadı')
        addMedia(d)
        closeModal()
        setWidth(6)
        setHeight(4)
      } catch (err) {
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (activeTab === 'roomsession' && loopEditMode) {
      // Düzenleme modu: yeni tile ekleme, mevcut tile'ın ayarlarını güncelle
      setLoading(true)
      setLoadingStep('saving')
      try {
        const loop = (loopOn && loopGoal.trim())
          ? { goal: loopGoal.trim(), trigger: 'manual', subagents: loopSubagents.trim(), maxIterations: Math.max(1, Math.min(50, parseInt(loopMaxIter, 10) || 8)) }
          : null
        const r = await fetch(`/api/roomsession/${modalEdit.mediaId}/settings`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ loop, model: sessionModel, effort: sessionEffort, permissionMode: sessionPermMode }),
        })
        if (!r.ok) {
          const d = await r.json().catch(() => ({}))
          throw new Error(d.error || 'Loop ayarları güncellenemedi')
        }
        applyLoopSpecEdit(modalEdit.mediaId, loop)
        closeModal()
      } catch (err) {
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (activeTab === 'roomsession') {
      setLoading(true)
      setLoadingStep('saving')
      try {
        const r = await fetch('/api/roomsession', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            width,
            height,
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation),
            model: sessionModel,
            effort: sessionEffort,
            permissionMode: sessionPermMode,
            loop: (loopOn && loopGoal.trim())
              ? { goal: loopGoal.trim(), trigger: 'manual', subagents: loopSubagents.trim(), maxIterations: Math.max(1, Math.min(50, parseInt(loopMaxIter, 10) || 8)) }
              : undefined,
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Oda projesi oluşturulamadı')
        addMedia(d)
        closeModal()
        setWidth(6)
        setHeight(4)
      } catch (err) {
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (activeTab === 'projectview') {
      setLoading(true)
      setLoadingStep('saving')
      try {
        const r = await fetch('/api/projectview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            width,
            height,
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation),
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'ProjectView tile oluşturulamadı')
        addMedia(d)
        closeModal()
        setWidth(3)
        setHeight(1)
      } catch (err) {
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (activeTab === 'multiagent') {
      setLoading(true)
      setLoadingStep('saving')
      try {
        const r = await fetch('/api/multiagent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            width,
            height,
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation),
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'MultiAgent tile oluşturulamadı')
        addMedia(d)
        closeModal()
        setWidth(6)
        setHeight(4)
      } catch (err) {
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (activeTab === 'bluprint') {
      setLoading(true)
      setLoadingStep('saving')
      try {
        const r = await fetch('/api/bluprint', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            width,
            height,
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation),
            model: sessionModel,
            effort: sessionEffort,
            permissionMode: sessionPermMode,
            skill: bluprintSkill,
            scope: bluprintScopeOn ? bluprintScope.trim() : '',
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Blueprint oluşturulamadı')
        addMedia(d)
        closeModal()
        setWidth(6)
        setHeight(4)
      } catch (err) {
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (activeTab === 'canvas') {
      setLoading(true)
      setLoadingStep('saving')
      try {
        const r = await fetch('/api/canvas', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            width,
            height,
            bg: canvasBg,
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation),
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Canvas oluşturulamadı')
        addMedia(d)
        closeModal()
        setCanvasBg('#1a1a2e')
        setWidth(10)
        setHeight(5)
      } catch (err) {
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (activeTab === 'markdown') {
      if (!markdownContent.trim()) {
        alert('Lütfen metin girin.')
        return
      }
      setLoading(true)
      setLoadingStep('saving')
      try {
        const r = await fetch('/api/add-text', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            content: markdownContent,
            width,
            height,
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation)
          })
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Kayıt hatası')
        addMedia(d)
        closeModal()
        setMarkdownContent('')
        setWidth(1)
        setHeight(1)
      } catch (err) {
        console.error(err)
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (activeTab === 'slide') {
      if (!slideFilePath.trim()) {
        alert('Lütfen bir HTML dosya yolu girin.')
        return
      }
      setLoading(true)
      setLoadingStep('saving')
      // YouTube tile oranı (16:9)
      const slideW = Number((5 * 16 / 9).toFixed(2)) // 8.89
      const slideH = 5
      try {
        // Yerel HTML dosyasını (html-slides skill çıktısı) public/uploads/slides/
        // altına kopyalayıp slayt tile olarak ekle.
        const r = await fetch('/api/slide-from-path', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tileId: selectedTile.id,
            filePath: slideFilePath.trim(),
            width: slideW,
            height: slideH,
            position: JSON.stringify(selectedTile.position),
            rotation: JSON.stringify(selectedTile.rotation),
          }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'Slayt dosyası alınamadı')
        addMedia(d)
        closeModal()
        setSlideFilePath('')
        setWidth(slideW)
        setHeight(slideH)
      } catch (err) {
        console.error(err)
        alert(err.message)
      } finally {
        setLoading(false)
        setLoadingStep('')
      }
      return
    }

    if (!file && !url.trim()) {
      alert('Lütfen bir dosya seçin veya URL girin.')
      return
    }

    setLoading(true)
    setLoadingStep(file ? 'saving' : 'downloading')

    try {
      let resolvedUrl = url.trim()
      let resolvedType = activeTab

      if (resolvedType === 'youtube') {
        let src = resolvedUrl;
        const iframeMatch = resolvedUrl.match(/<iframe.*?src=["'](.*?)["']/i);
        if (iframeMatch) src = iframeMatch[1];
        
        try {
          const u = new URL(src);
          if (u.hostname.includes('youtube.com') && u.searchParams.has('v')) {
            src = `https://www.youtube.com/embed/${u.searchParams.get('v')}`;
          } else if (u.hostname.includes('youtu.be')) {
            src = `https://www.youtube.com/embed/${u.pathname.slice(1)}`;
          }
        } catch (e) {}
        resolvedUrl = src;
      }

      // Download external URL server-side to avoid CORS
      if (!file && resolvedUrl && resolvedType !== 'youtube' && resolvedType !== 'embed') {
        const r = await fetch('/api/fetch-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: resolvedUrl }),
        })
        const d = await r.json()
        if (!r.ok) throw new Error(d.error || 'URL indirilemedi')
        resolvedUrl = d.localUrl
        resolvedType = d.type
        setLoadingStep('saving')
      }

      const body = new FormData()
      body.append('tileId', selectedTile.id)
      body.append('type', resolvedType)
      body.append('width', width)
      body.append('height', height)
      body.append('position', JSON.stringify(selectedTile.position))
      body.append('rotation', JSON.stringify(selectedTile.rotation))
      if (file) {
        body.append('file', file)
      } else {
        body.append('url', resolvedUrl)
      }

      const r = await fetch('/api/upload', { method: 'POST', body })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || 'Yükleme hatası')

      addMedia(d)
      closeModal()
      setUrl('')
      setFile(null)
      setWidth(1)
      setHeight(1)
    } catch (err) {
      console.error(err)
      alert(err.message)
    } finally {
      setLoading(false)
      setLoadingStep('')
    }
  }

  const handleDelete = async (id) => {
    try {
      const r = await fetch(`/api/media/${id}`, { method: 'DELETE' })
      if (!r.ok) throw new Error('Sunucu hatası')
      removeMedia(id)
    } catch (err) {
      console.error(err)
      alert('Silme hatası!')
    }
  }

  const handleSaveContent = async (id) => {
    try {
      const r = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editingContent })
      })
      if (!r.ok) throw new Error('Güncelleme başarısız')
      const updated = await r.json()
      useStore.getState().updateMedia(updated)
      setEditingId(null)
    } catch (err) {
      console.error(err)
      alert(err.message)
    }
  }

  const handleUpdateSize = async (id, newWidth, newHeight) => {
    try {
      const r = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ width: newWidth, height: newHeight })
      })
      if (!r.ok) throw new Error('Güncelleme başarısız')
      const updatedItem = await r.json()
      useStore.getState().updateMedia(updatedItem)
    } catch (err) {
      console.error(err)
      alert(err.message)
    }
  }

  const handleCopyImage = async (m) => {
    try {
      const res = await fetch(m.url)
      const blob = await res.blob()
      if (['image/png', 'image/jpeg', 'image/webp'].includes(blob.type)) {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })])
      } else {
        const img = new Image()
        const objUrl = URL.createObjectURL(blob)
        await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; img.src = objUrl })
        const canvas = document.createElement('canvas')
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight
        canvas.getContext('2d').drawImage(img, 0, 0)
        URL.revokeObjectURL(objUrl)
        const pngBlob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'))
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
      }
    } catch {
      navigator.clipboard.writeText(window.location.origin + m.url)
    }
    setCopiedId(m.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleDownload = (m) => {
    if (m.type === 'markdown') {
      const blob = new Blob([m.content || ''], { type: 'text/markdown' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `metin-${m.id}.md`
      a.click()
      URL.revokeObjectURL(a.href)
    } else if (m.url) {
      const a = document.createElement('a')
      a.href = m.url
      a.download = m.url.split('/').pop()
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    }
  }

  const loadingLabel =
    loadingStep === 'downloading' ? '⬇ İndiriliyor...' : '💾 Kaydediliyor...'

  if (!activeModal || !selectedTile) return null

  return (
    <div style={s.overlay}>
      {/* Gizli ölçüm div'i — markdown'un gerçek yüksekliğini hesaplamak için */}
      <div
        ref={mdMeasureRef}
        style={{
          position: 'fixed', visibility: 'hidden', pointerEvents: 'none',
          width: '600px', fontSize: '16px', lineHeight: '1.6',
          fontFamily: 'system-ui, sans-serif', padding: '24px',
          boxSizing: 'border-box', top: '-9999px', left: '-9999px',
        }}
      />
      <div style={s.modal}>

        {/* Header */}
        <div style={s.header}>
          <div>
            <h2 style={s.title}>{loopEditMode ? '🔁 Loop Ayarlarını Düzenle' : 'Grid Düzenle'}</h2>
            <span style={s.subtitle}>ID: {String(selectedTile.id)}</span>
          </div>
          <button style={s.closeBtn} onClick={closeModal}>✕</button>
        </div>

        {/* Paste banner — her zaman görünür, tileMedia bağımsız */}
        {!loopEditMode && clonedMedia && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', margin: '0 0 8px 0', background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.3)', borderRadius: 8 }}>
            <span style={{ fontSize: 13, color: '#93c5fd', flex: 1 }}>
              <b>{clonedMedia.label}</b> {clonedMedia.mode === 'cut' ? 'kesildi — bu duvara taşı' : 'kopyalandı — bu duvara yapıştır'}
            </span>
            <button
              style={{ padding: '5px 12px', background: '#2563eb', border: 'none', borderRadius: 6, color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
              onClick={handlePaste}
              disabled={loading}
            >
              {clonedMedia.mode === 'cut' ? 'Taşı' : 'Yapıştır'}
            </button>
            <button
              style={{ background: 'none', border: 'none', color: '#60a5fa', fontSize: 16, cursor: 'pointer', padding: '0 4px' }}
              onClick={() => setClonedMedia(null)}
            >
              ✕
            </button>
          </div>
        )}

        {/* Existing media on this tile */}
        {!loopEditMode && tileMedia.length > 0 && (
          <div style={s.existingSection}>
            <p style={s.sectionLabel}>Bu tile'daki medyalar</p>
            {tileMedia.map((m) => (
              <div key={m.id} style={{ borderBottom: '1px solid #1e1e1e' }}>
                <div style={s.mediaItem}>
                  <div style={{ flex: 1, marginRight: '10px' }}>
                    <span style={s.mediaItemLabel}>
                      {m.type === 'video' ? '🎬' : m.type === 'youtube' ? '▶️' : m.type === 'markdown' ? '📝' : m.type === 'canvas' ? '🎨' : m.type === 'session' ? '🤖' : m.type === 'roomchat' ? '🧠' : m.type === 'roomsession' ? '🏗' : m.type === 'projectview' ? '🖥' : m.type === 'bluprint' ? '📐' : m.type === 'multiagent' ? '🤝' : m.type === 'defter' ? '📒' : '🖼'}{' '}
                      {m.type === 'youtube' ? 'YouTube Video' : m.type === 'markdown' ? 'Metin' : m.type === 'canvas' ? 'Canvas' : m.type === 'session' ? 'AI Session' : m.type === 'roomchat' ? 'Oda Sohbeti' : m.type === 'roomsession' ? 'Oda Projesi' : m.type === 'projectview' ? 'ProjectView' : m.type === 'bluprint' ? 'Blueprint' : m.type === 'multiagent' ? 'MultiAgent' : m.type === 'defter' ? 'Defter' : (m.url || '').split('/').pop()}
                    </span>
                    <div style={{ display: 'flex', gap: '10px', marginTop: '6px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'flex', alignItems: 'center' }}>
                        G:
                        <input
                          type="number"
                          defaultValue={m.width}
                          step="0.1"
                          style={{ width: '45px', marginLeft: '4px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px', fontSize: '11px', padding: '3px' }}
                          onBlur={e => handleUpdateSize(m.id, e.target.value, m.height)}
                        />
                      </label>
                      <label style={{ fontSize: '11px', color: '#888', display: 'flex', alignItems: 'center' }}>
                        Y:
                        <input
                          type="number"
                          defaultValue={m.height}
                          step="0.1"
                          style={{ width: '45px', marginLeft: '4px', background: '#222', border: '1px solid #444', color: '#fff', borderRadius: '4px', fontSize: '11px', padding: '3px' }}
                          onBlur={e => handleUpdateSize(m.id, m.width, e.target.value)}
                        />
                      </label>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '6px', flexShrink: 0, alignItems: 'center' }}>
                    {m.type === 'image' && (
                      <>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: copiedId === m.id ? '#4ade80' : '#888', fontSize: '14px', flexShrink: 0 }}
                          title="Resmi panoya kopyala"
                          onClick={() => handleCopyImage(m)}
                        >
                          {copiedId === m.id ? '✓' : '⧉'}
                        </button>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: '#888', fontSize: '14px', flexShrink: 0 }}
                          title="Resmi indir"
                          onClick={() => handleDownload(m)}
                        >
                          ↓
                        </button>
                      </>
                    )}
                    {m.type === 'video' && (
                      <button
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: '#888', fontSize: '14px', flexShrink: 0 }}
                        title="Videoyu indir"
                        onClick={() => handleDownload(m)}
                      >
                        ↓
                      </button>
                    )}
                    {(m.type === 'youtube' || m.type === 'embed') && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#0d0d0d', border: '1px solid #2a2a2a', borderRadius: '6px', padding: '3px 8px', maxWidth: '200px' }}>
                        <span style={{ fontSize: '11px', color: '#666', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                          {m.url}
                        </span>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0', color: copiedId === m.id ? '#4ade80' : '#888', fontSize: '14px', flexShrink: 0 }}
                          title="Linki kopyala"
                          onClick={() => {
                            navigator.clipboard.writeText(m.url)
                            setCopiedId(m.id)
                            setTimeout(() => setCopiedId(null), 2000)
                          }}
                        >
                          {copiedId === m.id ? '✓' : '⧉'}
                        </button>
                      </div>
                    )}
                    {m.type === 'markdown' && (
                      <>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: copiedId === m.id ? '#4ade80' : '#888', fontSize: '14px', flexShrink: 0 }}
                          title="Metni panoya kopyala"
                          onClick={() => {
                            navigator.clipboard.writeText(m.content || '')
                            setCopiedId(m.id)
                            setTimeout(() => setCopiedId(null), 2000)
                          }}
                        >
                          {copiedId === m.id ? '✓' : '⧉'}
                        </button>
                        <button
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 4px', color: '#888', fontSize: '14px', flexShrink: 0 }}
                          title="Metni indir"
                          onClick={() => handleDownload(m)}
                        >
                          ↓
                        </button>
                        <button
                          style={s.editBtn}
                          onClick={() => {
                            if (editingId === m.id) {
                              setEditingId(null)
                            } else {
                              setEditingId(m.id)
                              setEditingContent(m.content || '')
                            }
                          }}
                        >
                          {editingId === m.id ? 'Kapat' : 'Düzenle'}
                        </button>
                      </>
                    )}
                    {(() => {
                      const isActiveCopy = clonedMedia?.id === m.id && (clonedMedia?.mode ?? 'copy') === 'copy'
                      const isActiveCut = clonedMedia?.id === m.id && clonedMedia?.mode === 'cut'
                      return (
                        <>
                          <button
                            style={{ ...s.deleteBtn, background: isActiveCopy ? 'rgba(96,165,250,0.15)' : 'none', border: `1px solid ${isActiveCopy ? '#60a5fa' : '#333'}`, color: isActiveCopy ? '#60a5fa' : '#888' }}
                            title="Bu medyayı başka bir duvara kopyala"
                            onClick={() => {
                              setClonedMedia(isActiveCopy ? null : { id: m.id, type: m.type, label: mediaTypeLabel[m.type] || m.type, mode: 'copy' })
                            }}
                          >
                            {isActiveCopy ? '✓ Kopyalandı' : '⧉ Kopyala'}
                          </button>
                          <button
                            style={{ ...s.deleteBtn, background: isActiveCut ? 'rgba(245,158,11,0.15)' : 'none', border: `1px solid ${isActiveCut ? '#f59e0b' : '#333'}`, color: isActiveCut ? '#f59e0b' : '#888' }}
                            title="Bu medyayı başka bir duvara taşı"
                            onClick={() => {
                              setClonedMedia(isActiveCut ? null : { id: m.id, type: m.type, label: mediaTypeLabel[m.type] || m.type, mode: 'cut' })
                            }}
                          >
                            {isActiveCut ? '✓ Kesildi' : '✂ Kes'}
                          </button>
                        </>
                      )
                    })()}
                    <button style={s.deleteBtn} onClick={() => handleDelete(m.id)}>
                      Sil
                    </button>
                  </div>
                </div>

                {/* Inline markdown editör */}
                {editingId === m.id && (
                  <div style={s.inlineEditor}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <span style={{ fontSize: '12px', color: '#555' }}>Markdown düzenle</span>
                      <MicButton
                        listening={speech2.listening}
                        supported={speech2.supported}
                        onToggle={() =>
                          speech2.listening
                            ? speech2.stop()
                            : speech2.start(editingContent, setEditingContent)
                        }
                      />
                    </div>
                    <textarea
                      style={{ ...s.inlineTextarea, borderColor: speech2.listening ? '#ef4444' : undefined }}
                      value={editingContent}
                      onChange={e => setEditingContent(e.target.value)}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                      <button style={s.cancelBtn} onClick={() => setEditingId(null)}>İptal</button>
                      <button style={s.applyBtn} onClick={() => handleSaveContent(m.id)}>Kaydet</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Tabs — loop düzenleme modunda gizli (yalnızca roomsession ayarları gösterilir) */}
        <div style={loopEditMode ? { display: 'none' } : s.tabs}>
          <button
            style={activeTab === 'image' ? s.activeTab : s.tab}
            onClick={() => setActiveTab('image')}
          >
            🖼 Resim
          </button>
          <button
            style={activeTab === 'video' ? s.activeTab : s.tab}
            onClick={() => setActiveTab('video')}
          >
            🎬 Video
          </button>
          <button
            style={activeTab === 'youtube' ? s.activeTab : s.tab}
            onClick={() => setActiveTab('youtube')}
          >
            ▶️ YouTube
          </button>
          <button
            style={activeTab === 'markdown' ? s.activeTab : s.tab}
            onClick={() => setActiveTab('markdown')}
          >
            📝 Metin
          </button>
          <button
            style={activeTab === 'embed' ? s.activeTab : s.tab}
            onClick={() => setActiveTab('embed')}
          >
            🌐 Site
          </button>
          <button
            style={activeTab === 'canvas' ? s.activeTab : s.tab}
            onClick={() => { setActiveTab('canvas'); setWidth(10); setHeight(5) }}
          >
            🎨 Canvas
          </button>
          <button
            style={activeTab === 'header' ? s.activeTab : s.tab}
            onClick={() => { setActiveTab('header'); setWidth(4); setHeight(1) }}
          >
            🔤 Başlık
          </button>
          <button
            style={activeTab === 'defter' ? s.activeTab : s.tab}
            onClick={() => { setActiveTab('defter'); setWidth(6); setHeight(4) }}
          >
            📒 Defter
          </button>
          <button
            style={activeTab === 'session' ? s.activeTab : s.tab}
            onClick={() => { setActiveTab('session'); setWidth(6); setHeight(4) }}
          >
            🤖 Session
          </button>
          <button
            style={activeTab === 'roomchat' ? s.activeTab : s.tab}
            onClick={() => { setActiveTab('roomchat'); setWidth(6); setHeight(4) }}
          >
            🧠 RoomChat
          </button>
          <button
            style={activeTab === 'roomsession' ? s.activeTab : s.tab}
            onClick={() => { setActiveTab('roomsession'); setWidth(6); setHeight(4) }}
          >
            🏗 RoomProject
          </button>
          <button
            style={activeTab === 'projectview' ? s.activeTab : s.tab}
            onClick={() => { setActiveTab('projectview'); setWidth(3); setHeight(1) }}
          >
            🖥 ProjectView
          </button>
          <button
            style={activeTab === 'bluprint' ? s.activeTab : s.tab}
            onClick={() => { setActiveTab('bluprint'); setWidth(6); setHeight(4) }}
          >
            📐 Blueprint
          </button>
          <button
            style={activeTab === 'multiagent' ? s.activeTab : s.tab}
            onClick={() => { setActiveTab('multiagent'); setWidth(6); setHeight(4) }}
          >
            🤝 MultiAgent
          </button>
          <button
            style={activeTab === 'slide' ? s.activeTab : s.tab}
            onClick={() => { setActiveTab('slide'); setWidth(8.89); setHeight(5) }}
          >
            🎯 Slayt
          </button>
        </div>

        {/* Form */}
        <div style={s.form}>

          {/* Header */}
          {activeTab === 'header' && (
            <div style={s.inputGroup}>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ ...s.label, marginBottom: 0, fontSize: 11 }}>Arka plan</label>
                  <input type="color" value={headerBg} onChange={e => setHeaderBg(e.target.value)}
                    style={{ width: 36, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0, borderRadius: 4 }} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <label style={{ ...s.label, marginBottom: 0, fontSize: 11 }}>Yazı rengi</label>
                  <input type="color" value={headerColor} onChange={e => setHeaderColor(e.target.value)}
                    style={{ width: 36, height: 28, border: 'none', background: 'none', cursor: 'pointer', padding: 0, borderRadius: 4 }} />
                </div>
              </div>
            </div>
          )}

          {/* Defter */}
          {activeTab === 'defter' && (
            <div style={s.inputGroup}>
              <p style={{ color: '#e0b050', fontSize: '13px', margin: '0 0 6px', fontWeight: 600 }}>📒 Defter</p>
              <p style={{ color: '#777', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>
                Yerel not defteri — <b>Claude'a bağlı değildir</b>. Sayfalar arası gezinir, alt alta yazı
                blokları eklersin; her bloğu kopyalayabilir, defteri kaydedebilirsin. İçerik tile'da saklanır.
              </p>
            </div>
          )}

          {/* Session */}
          {activeTab === 'session' && (
            <div style={s.inputGroup}>
              <p style={{ color: '#60a5fa', fontSize: '13px', margin: '0 0 12px', fontWeight: 600 }}>🤖 AI Session</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>Model</label>
                  <select
                    value={sessionModel}
                    onChange={e => setSessionModel(e.target.value)}
                    style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                  >
                    <option value="claude-fable-5">Claude Fable 5 (Opus 4.7)</option>
                    <option value="claude-opus-4-8">Claude Opus 4.8</option>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                    <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                  </select>
                </div>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>Effort (Düşünce derinliği)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[['low','Düşük'],['normal','Normal'],['high','Yüksek']].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setSessionEffort(val)}
                        style={{
                          flex: 1, padding: '6px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                          border: sessionEffort === val ? '1px solid #60a5fa' : '1px solid #333',
                          background: sessionEffort === val ? 'rgba(96,165,250,0.15)' : '#1a1a2e',
                          color: sessionEffort === val ? '#60a5fa' : '#888',
                        }}
                      >{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>İzin modu</label>
                  <select
                    value={sessionPermMode}
                    onChange={e => setSessionPermMode(e.target.value)}
                    style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                  >
                    <option value="bypassPermissions">Bypass — tüm izinleri atla</option>
                    <option value="acceptEdits">Accept edits — düzenlemeleri otomatik kabul</option>
                    <option value="ask">Ask — her tool için onay iste</option>
                    <option value="plan">Plan — değişiklik yapmaz, yalnızca planlar</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* RoomChat */}
          {activeTab === 'roomchat' && (
            <div style={s.inputGroup}>
              <p style={{ color: '#a78bfa', fontSize: '13px', margin: '0 0 6px', fontWeight: 600 }}>🧠 Oda Sohbeti (RoomChat)</p>
              <p style={{ color: '#777', fontSize: '11px', margin: '0 0 12px', lineHeight: 1.5 }}>
                Bu tile, bu odadaki metin ve canvas yazılarından graphify ile <b>ayrı bir bilgi grafı</b> kurar ve
                yalnızca o bağlamla sohbet eder. Tile'daki <b>⟳ Güncelle</b> butonuyla grafı yeniden oluşturursun.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>Model</label>
                  <select
                    value={sessionModel}
                    onChange={e => setSessionModel(e.target.value)}
                    style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                  >
                    <option value="claude-fable-5">Claude Fable 5 (Opus 4.7)</option>
                    <option value="claude-opus-4-8">Claude Opus 4.8</option>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                    <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                  </select>
                </div>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>Effort (Düşünce derinliği)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[['low','Düşük'],['normal','Normal'],['high','Yüksek']].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setSessionEffort(val)}
                        style={{
                          flex: 1, padding: '6px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                          border: sessionEffort === val ? '1px solid #a78bfa' : '1px solid #333',
                          background: sessionEffort === val ? 'rgba(167,139,250,0.15)' : '#1a1a2e',
                          color: sessionEffort === val ? '#a78bfa' : '#888',
                        }}
                      >{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>İzin modu</label>
                  <select
                    value={sessionPermMode}
                    onChange={e => setSessionPermMode(e.target.value)}
                    style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                  >
                    <option value="bypassPermissions">Bypass — tüm izinleri atla</option>
                    <option value="acceptEdits">Accept edits — düzenlemeleri otomatik kabul</option>
                    <option value="ask">Ask — her tool için onay iste</option>
                    <option value="plan">Plan — değişiklik yapmaz, yalnızca planlar</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* RoomProject (roomsession) */}
          {activeTab === 'roomsession' && (
            <div style={s.inputGroup}>
              <p style={{ color: '#34d399', fontSize: '13px', margin: '0 0 6px', fontWeight: 600 }}>🏗 Oda Projesi (RoomProject)</p>
              <p style={{ color: '#777', fontSize: '11px', margin: '0 0 12px', lineHeight: 1.5 }}>
                Bu tile, bu odaya özel <b>izole bir proje klasöründe</b> (room-projects/&lt;oda&gt;/) çalışır.
                Oda burada kendi web projesini (ör. Next.js) kurabilir, dosya yazıp düzenleyebilir, bağımlılık yükleyebilir.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>Model</label>
                  <select
                    value={sessionModel}
                    onChange={e => setSessionModel(e.target.value)}
                    style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                  >
                    <option value="claude-fable-5">Claude Fable 5 (Opus 4.7)</option>
                    <option value="claude-opus-4-8">Claude Opus 4.8</option>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                    <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                  </select>
                </div>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>Effort (Düşünce derinliği)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[['low','Düşük'],['normal','Normal'],['high','Yüksek']].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setSessionEffort(val)}
                        style={{
                          flex: 1, padding: '6px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                          border: sessionEffort === val ? '1px solid #34d399' : '1px solid #333',
                          background: sessionEffort === val ? 'rgba(52,211,153,0.15)' : '#1a1a2e',
                          color: sessionEffort === val ? '#34d399' : '#888',
                        }}
                      >{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>İzin modu</label>
                  <select
                    value={sessionPermMode}
                    onChange={e => setSessionPermMode(e.target.value)}
                    style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                  >
                    <option value="bypassPermissions">Bypass — tüm izinleri atla</option>
                    <option value="acceptEdits">Accept edits — düzenlemeleri otomatik kabul</option>
                    <option value="ask">Ask — her tool için onay iste</option>
                    <option value="plan">Plan — değişiklik yapmaz, yalnızca planlar</option>
                  </select>
                </div>

                {/* LoopFlow — otonom loop + Recall */}
                <div style={{ borderTop: '1px solid #2a2a3e', paddingTop: '10px', marginTop: '2px' }}>
                  <button
                    onClick={() => setLoopOn(v => !v)}
                    style={{
                      width: '100%', padding: '8px', borderRadius: '6px', fontSize: '12px', cursor: 'pointer', fontWeight: 600,
                      border: loopOn ? '1px solid #f59e0b' : '1px solid #333',
                      background: loopOn ? 'rgba(245,158,11,0.15)' : '#1a1a2e',
                      color: loopOn ? '#f59e0b' : '#888',
                    }}
                  >{loopOn ? '🔁 LoopFlow açık — hedefe kadar otonom' : '🔁 LoopFlow (otonom loop) — kapalı'}</button>
                  {loopOn && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                      <p style={{ color: '#777', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>
                        Loop, <b>doğrulanabilir hedef</b> geçene (veya max iterasyona) kadar Claude'u otonom çağırır;
                        her iterasyon diske checkpoint'lenir (<b>Recall</b>) — kesilse bile kaldığı yerden devam eder.
                      </p>
                      <div>
                        <label style={{ ...s.label, marginBottom: '4px' }}>Doğrulanabilir hedef (Goal)</label>
                        <textarea
                          value={loopGoal}
                          onChange={e => setLoopGoal(e.target.value)}
                          placeholder="ör. index.html: butona tıklayınca sayaç artar, konsol hatasız, mobilde bozulmuyor"
                          rows={3}
                          style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...s.label, marginBottom: '4px' }}>Çalışma yönergesi / alt-roller (Subagent) — opsiyonel</label>
                        <textarea
                          value={loopSubagents}
                          onChange={e => setLoopSubagents(e.target.value)}
                          placeholder="ör. önce HTML/CSS iskeleti, sonra JS davranışı, her turda küçük ve test edilebilir adım"
                          rows={2}
                          style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', boxSizing: 'border-box', resize: 'vertical' }}
                        />
                      </div>
                      <div>
                        <label style={{ ...s.label, marginBottom: '4px' }}>Max iterasyon</label>
                        <input
                          type="number" min={1} max={50}
                          value={loopMaxIter}
                          onChange={e => setLoopMaxIter(e.target.value)}
                          style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', boxSizing: 'border-box' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ProjectView */}
          {activeTab === 'projectview' && (
            <div style={s.inputGroup}>
              <p style={{ color: '#60a5fa', fontSize: '13px', margin: '0 0 6px', fontWeight: 600 }}>🖥 ProjectView (canlı önizleme)</p>
              <p style={{ color: '#777', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>
                Bu odanın proje klasörünü (room-projects/&lt;oda&gt;/) otomatik <b>algılar</b> (Vite / Next.js / statik index.html),
                gerekiyorsa bağımlılıkları kurar ve bir <b>dev server</b> başlatır. Duvara kompakt bir <b>link kartı</b> gelir:
                durum + localhost linki + <b>yeni sekmede aç</b> butonu. Önce <b>RoomProject</b> ile bu odada bir web
                projesi geliştirmiş olman gerekir. Ekstra girdi yok — tile'ı oluştur, arka planda başlar.
              </p>
            </div>
          )}

          {/* MultiAgent */}
          {activeTab === 'multiagent' && (
            <div style={s.inputGroup}>
              <p style={{ color: '#c084fc', fontSize: '13px', margin: '0 0 6px', fontWeight: 600 }}>🤝 MultiAgent (mimar + ajan ekibi)</p>
              <p style={{ color: '#777', fontSize: '11px', margin: 0, lineHeight: 1.5 }}>
                Bu tile'a bir <b>proje fikri</b> yazarsın; <b>mimar</b> (opus, tek sefer) teknoloji stack'ini ve ajan ekibini belirler.
                Başlattığında <b>orkestratör</b> her iterasyonda sıradaki görevi seçer, ilgili <b>worker ajan</b> kendi izole
                oturumunda görevi yapar, bağımsız <b>doğrulayıcı</b> hedefi denetler. Proje odanın klasöründe
                (room-projects/&lt;oda&gt;/) geliştirilir; kesilirse kaldığı yerden devam eder (Recall).
                Fikir girişi tile'ın kendi içindedir — burada sadece tile'ı oluştur.
              </p>
            </div>
          )}

          {/* Blueprint (bluprint) */}
          {activeTab === 'bluprint' && (
            <div style={s.inputGroup}>
              <p style={{ color: '#a78bfa', fontSize: '13px', margin: '0 0 6px', fontWeight: 600 }}>📐 Blueprint (reconstruct)</p>
              <p style={{ color: '#777', fontSize: '11px', margin: '0 0 12px', lineHeight: 1.5 }}>
                Bu tile, odanın <b>proje klasörünü</b> (room-projects/&lt;oda&gt;/) seçtiğin <b>analiz skill'iyle</b> tarar ve
                projeyi (veya tek bir özelliği) başka bir Claude projesinde sıfırdan kurmaya yetecek <b>tek-dosya kurulum kiti</b> üretir.
                Çıktıyı başka projeye verip tarif etmeden yeniden kurabilirsin. Önce RoomProject ile bir proje geliştir.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>Analiz skill'i</label>
                  <select
                    value={bluprintSkill}
                    onChange={e => setBluprintSkill(e.target.value)}
                    style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                  >
                    {bluprintSkills.map(sk => (
                      <option key={sk.id} value={sk.id} disabled={!sk.installed}>
                        {sk.label}{sk.installed ? '' : ' (kurulu değil)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>Kapsam</label>
                  <div style={{ display: 'flex', gap: '6px', marginBottom: bluprintScopeOn ? '8px' : 0 }}>
                    {[[false, 'Tüm proje'], [true, 'Belirli özellik']].map(([val, label]) => (
                      <button
                        key={String(val)}
                        onClick={() => setBluprintScopeOn(val)}
                        style={{
                          flex: 1, padding: '6px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                          border: bluprintScopeOn === val ? '1px solid #a78bfa' : '1px solid #333',
                          background: bluprintScopeOn === val ? 'rgba(167,139,250,0.15)' : '#1a1a2e',
                          color: bluprintScopeOn === val ? '#a78bfa' : '#888',
                        }}
                      >{label}</button>
                    ))}
                  </div>
                  {bluprintScopeOn && (
                    <input
                      value={bluprintScope}
                      onChange={e => setBluprintScope(e.target.value)}
                      placeholder="ör. login / kimlik doğrulama akışı"
                      style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px', boxSizing: 'border-box' }}
                    />
                  )}
                </div>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>Model</label>
                  <select
                    value={sessionModel}
                    onChange={e => setSessionModel(e.target.value)}
                    style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                  >
                    <option value="claude-fable-5">Claude Fable 5 (Opus 4.7)</option>
                    <option value="claude-opus-4-8">Claude Opus 4.8</option>
                    <option value="claude-sonnet-4-6">Claude Sonnet 4.6</option>
                    <option value="claude-haiku-4-5-20251001">Claude Haiku 4.5</option>
                  </select>
                </div>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>Effort (Düşünce derinliği)</label>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    {[['low','Düşük'],['normal','Normal'],['high','Yüksek']].map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => setSessionEffort(val)}
                        style={{
                          flex: 1, padding: '6px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer',
                          border: sessionEffort === val ? '1px solid #a78bfa' : '1px solid #333',
                          background: sessionEffort === val ? 'rgba(167,139,250,0.15)' : '#1a1a2e',
                          color: sessionEffort === val ? '#a78bfa' : '#888',
                        }}
                      >{label}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label style={{ ...s.label, marginBottom: '4px' }}>İzin modu</label>
                  <select
                    value={sessionPermMode}
                    onChange={e => setSessionPermMode(e.target.value)}
                    style={{ width: '100%', background: '#1a1a2e', border: '1px solid #333', color: '#e0e0e0', borderRadius: '6px', padding: '6px 10px', fontSize: '12px' }}
                  >
                    <option value="bypassPermissions">Bypass — tüm izinleri atla</option>
                    <option value="acceptEdits">Accept edits — düzenlemeleri otomatik kabul</option>
                    <option value="ask">Ask — her tool için onay iste</option>
                    <option value="plan">Plan — değişiklik yapmaz, yalnızca planlar</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Canvas */}
          {activeTab === 'canvas' && (
            <div style={s.inputGroup}>
              <label style={s.label}>Arka Plan Rengi</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  type="color"
                  value={canvasBg}
                  onChange={e => setCanvasBg(e.target.value)}
                  style={{ width: 40, height: 36, border: 'none', background: 'none', cursor: 'pointer', padding: 0, borderRadius: 4 }}
                />
                <span style={{ color: '#888', fontSize: 12 }}>{canvasBg}</span>
              </div>
              <p style={{ color: '#666', fontSize: 11, marginTop: 10 }}>
                Canvas oluşturulduktan sonra üzerine çift tıklayarak resim ve metin ekleyebilirsiniz.
              </p>
            </div>
          )}

          {/* Markdown textarea */}
          {activeTab === 'markdown' && (
            <div style={s.inputGroup}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ ...s.label, marginBottom: 0 }}>Markdown İçerik</label>
                <MicButton
                  listening={speech1.listening}
                  supported={speech1.supported}
                  onToggle={() =>
                    speech1.listening
                      ? speech1.stop()
                      : speech1.start(markdownContent, setMarkdownContent)
                  }
                />
              </div>
              <textarea
                style={{ ...s.input, height: '260px', resize: 'vertical', fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.6', borderColor: speech1.listening ? '#ef4444' : undefined }}
                value={markdownContent}
                onChange={e => setMarkdownContent(e.target.value)}
                placeholder={'# Başlık\n\nMetin buraya...\n\n**kalın**, _italik_'}
              />
            </div>
          )}

          {/* Slide tab — yalnızca HTML dosya yolu */}
          {activeTab === 'slide' && (
            <div style={s.inputGroup}>
              <label style={{ ...s.label, marginBottom: '6px' }}>Dosya yolu (HTML)</label>
              <input
                type="text"
                value={slideFilePath}
                onChange={e => setSlideFilePath(e.target.value)}
                placeholder="/ev/.../sunus.html — html-slides skill'inin paylaştığı yolu yapıştırın"
                style={{ ...s.input, fontFamily: 'monospace', fontSize: '13px' }}
              />
              <p style={s.note}>
                html-slides skill'inin ürettiği .html dosyasının mutlak yolunu yapıştırın.
                Dosya <code>public/uploads/slides/</code> altına kopyalanır ve 16:9 (8.89×5) olarak duvara eklenir.
              </p>
            </div>
          )}

          {/* URL input */}
          {activeTab !== 'markdown' && activeTab !== 'canvas' && activeTab !== 'header' && activeTab !== 'session' && activeTab !== 'roomchat' && activeTab !== 'roomsession' && activeTab !== 'projectview' && activeTab !== 'bluprint' && activeTab !== 'slide' && (
          <div style={s.inputGroup}>
            <label style={s.label}>
              {activeTab === 'image' ? 'Resim Linki' : activeTab === 'video' ? 'Video Linki' : activeTab === 'embed' ? 'Site URL' : 'YouTube Linki (veya iframe)'}
            </label>
            <input
              style={{ ...s.input, opacity: file ? 0.4 : 1 }}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={
                activeTab === 'image'
                  ? 'https://example.com/image.jpg'
                  : activeTab === 'video'
                  ? 'https://example.com/video.mp4'
                  : activeTab === 'embed'
                  ? 'https://example.com'
                  : 'https://youtube.com/watch?v=... veya <iframe...>'
              }
              disabled={!!file}
            />
            {activeTab === 'embed' && (
              <p style={s.note}>⚠ Bazı siteler iframe'e izin vermez (Google, Twitter vb.)</p>
            )}
            {file && <p style={s.note}>URL devre dışı — dosya seçildi</p>}
          </div>
          )}

          {/* File input */}
          {activeTab !== 'youtube' && activeTab !== 'markdown' && activeTab !== 'embed' && activeTab !== 'canvas' && activeTab !== 'header' && activeTab !== 'session' && activeTab !== 'roomchat' && activeTab !== 'roomsession' && activeTab !== 'projectview' && activeTab !== 'bluprint' && activeTab !== 'slide' && (
            <div style={s.inputGroup}>
              <label style={s.label}>
                {activeTab === 'image' ? 'veya Dosya Seç' : 'veya Video Dosyası Seç'}
              </label>
              <input
                style={s.fileInput}
                type="file"
                accept={activeTab === 'image' ? 'image/*' : 'video/*'}
                onChange={handleFileChange}
              />
            </div>
          )}

          {/* Paste zone — sadece resim tabında */}
          {activeTab === 'image' && (
            <div style={s.inputGroup}>
              <label style={s.label}>veya Panodan Yapıştır</label>
              <div
                style={{
                  ...s.pasteZone,
                  ...(pastePreview ? s.pasteZoneActive : {}),
                }}
                tabIndex={0}
                onPaste={handlePasteZone}
                onClick={e => e.currentTarget.focus()}
              >
                {pastePreview ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img src={pastePreview} alt="yapıştırılan resim" style={{ maxWidth: '100%', maxHeight: '160px', borderRadius: '6px', display: 'block' }} />
                    <button
                      style={{ position: 'absolute', top: '4px', right: '4px', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', padding: '2px 6px' }}
                      onClick={e => { e.stopPropagation(); setFile(null); setPastePreview(null) }}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <span style={{ fontSize: '13px', color: '#555' }}>
                    Tıkla ve <kbd style={{ background: '#222', border: '1px solid #444', borderRadius: '3px', padding: '1px 5px', fontSize: '11px', color: '#aaa' }}>Ctrl+V</kbd> ile yapıştır
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Size inputs — loop düzenleme modunda gizli (tile boyutu değişmez) */}
          <div style={loopEditMode ? { display: 'none' } : s.row}>
            <div style={{ flex: 1 }}>
              <label style={s.label}>
                Genişlik (tile) {activeTab === 'markdown' ? '⚡ otomatik' : activeTab === 'session' ? '⚡ 3' : activeTab === 'slide' ? '⚡ 8.89 (16:9)' : ''}
              </label>
              <input
                style={{ ...s.input, opacity: (activeTab === 'markdown' || activeTab === 'session' || activeTab === 'slide') ? 0.5 : 1 }}
                type="number"
                min="0.1"
                step="0.1"
                value={width}
                onChange={(e) => handleWidthChange(e.target.value)}
                readOnly={activeTab === 'markdown' || activeTab === 'session' || activeTab === 'slide'}
              />
            </div>
            <div style={{ width: 12 }} />
            <div style={{ flex: 1 }}>
              <label style={s.label}>
                Yükseklik (tile) {activeTab === 'markdown' ? '⚡ otomatik' : activeTab === 'session' ? '⚡ 5' : activeTab === 'slide' ? '⚡ 5' : naturalRatio ? '🔗' : ''}
              </label>
              <input
                style={{ ...s.input, opacity: (activeTab === 'markdown' || activeTab === 'session' || activeTab === 'slide') ? 0.5 : 1 }}
                type="number"
                min="0.1"
                step="0.1"
                value={height}
                onChange={(e) => handleHeightChange(e.target.value)}
                readOnly={activeTab === 'markdown' || activeTab === 'session' || activeTab === 'slide'}
              />
            </div>
          </div>
        </div>

        {/* Actions */}
        <div style={s.actions}>
          <button style={s.cancelBtn} onClick={closeModal}>İptal</button>
          <button style={s.applyBtn} onClick={handleApply} disabled={loading}>
            {loading ? loadingLabel : loopEditMode ? 'Kaydet' : 'Uygula'}
          </button>
        </div>

      </div>
    </div>
  )
}

const s = {
  overlay: {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2147483647,
    backdropFilter: 'blur(6px)',
  },
  modal: {
    backgroundColor: '#181818',
    color: '#fff',
    padding: '28px',
    borderRadius: '16px',
    width: '720px',
    maxHeight: '92vh',
    overflowY: 'auto',
    boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
    border: '1px solid #2a2a2a',
    fontFamily: 'Inter, system-ui, sans-serif',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '20px',
  },
  title: { margin: 0, fontSize: '20px', fontWeight: 600, color: '#fff' },
  subtitle: { fontSize: '11px', color: '#555', marginTop: '2px', display: 'block' },
  closeBtn: {
    background: 'transparent',
    border: 'none',
    color: '#555',
    fontSize: '18px',
    cursor: 'pointer',
    lineHeight: 1,
    padding: '2px 4px',
  },
  existingSection: {
    marginBottom: '18px',
    padding: '12px',
    backgroundColor: '#0d0d0d',
    borderRadius: '10px',
    border: '1px solid #222',
  },
  sectionLabel: {
    margin: '0 0 8px',
    fontSize: '11px',
    color: '#555',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
  },
  mediaItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '7px 0',
    borderBottom: '1px solid #1e1e1e',
  },
  mediaItemLabel: {
    fontSize: '13px',
    color: '#bbb',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '300px',
  },
  deleteBtn: {
    padding: '3px 10px',
    backgroundColor: 'transparent',
    border: '1px solid #7f1d1d',
    color: '#f87171',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    flexShrink: 0,
  },
  editBtn: {
    padding: '3px 10px',
    backgroundColor: 'transparent',
    border: '1px solid #2a4a6b',
    color: '#60a5fa',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    flexShrink: 0,
  },
  inlineEditor: {
    padding: '10px 0 12px',
  },
  pasteZone: {
    width: '100%',
    minHeight: '80px',
    border: '2px dashed #2a2a2a',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: '16px',
    boxSizing: 'border-box',
    outline: 'none',
    transition: 'border-color 0.15s',
  },
  pasteZoneActive: {
    border: '2px dashed #3a5a3a',
    backgroundColor: '#0a120a',
  },
  inlineTextarea: {
    width: '100%',
    height: '300px',
    padding: '10px 12px',
    backgroundColor: '#0a0a0a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '13px',
    fontFamily: 'monospace',
    lineHeight: '1.6',
    resize: 'vertical',
    outline: 'none',
    boxSizing: 'border-box',
  },
  tabs: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    marginBottom: '18px',
    backgroundColor: '#0d0d0d',
    padding: '3px',
    borderRadius: '10px',
    gap: '3px',
  },
  tab: {
    flex: '0 0 auto',
    whiteSpace: 'nowrap',
    padding: '9px',
    background: 'transparent',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    borderRadius: '8px',
    fontSize: '13px',
  },
  activeTab: {
    flex: '0 0 auto',
    whiteSpace: 'nowrap',
    padding: '9px',
    background: '#2a2a2a',
    border: 'none',
    color: '#fff',
    cursor: 'pointer',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: 600,
  },
  form: { marginBottom: '22px' },
  inputGroup: { marginBottom: '14px' },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '12px',
    color: '#888',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#0a0a0a',
    border: '1px solid #2a2a2a',
    borderRadius: '8px',
    color: '#fff',
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  fileInput: {
    width: '100%',
    color: '#888',
    fontSize: '13px',
    cursor: 'pointer',
    padding: '8px 0',
  },
  note: {
    margin: '4px 0 0',
    fontSize: '11px',
    color: '#444',
    fontStyle: 'italic',
  },
  row: { display: 'flex', alignItems: 'flex-start' },
  actions: { display: 'flex', gap: '10px' },
  cancelBtn: {
    flex: 1,
    padding: '11px',
    background: 'transparent',
    border: '1px solid #2a2a2a',
    color: '#aaa',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  applyBtn: {
    flex: 2,
    padding: '11px',
    background: 'linear-gradient(135deg, #00c6ff, #0072ff)',
    border: 'none',
    color: '#fff',
    fontWeight: 700,
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '14px',
    letterSpacing: '0.02em',
  },
}
