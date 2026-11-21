// ── Duvardaki metin (markdown) tile'ı ─────────────────────────────────────────
// PDF defterinin yazma deneyimi duvarda: yazı hep biçimli görünür; başlığa, paragrafa ya da
// maddeye tıklayınca yalnızca o satır yerinde Markdown olur (LiveDocText). Tile odaktayken altında
// defterin biçim çubuğu (DocumentBar) açılır: biçimli yapıştır, başlık, kalın, italik, liste, görev,
// kod bloğu, sesle yazma, görsel ekle ve ham Markdown'a geçiş. Görsel linkleri defterdeki gibi tek
// görsel ya da art arda geliyorsa yana kayan şerit (carousel) olarak çizilir.
//
// Tile'ın yüksekliği sabit; yazı kolonlara akar, sığmazsa sağa doğru kolon kolon genişler.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import '../pages/library/notebook/notebook.css'
import { LiveDocText, RawDocText } from '../pages/library/notebook/DocText.jsx'
import { DocumentBar } from '../pages/library/notebook/DocumentBar.jsx'
import { insertCodeBlock, toggleInline, toggleLines } from '../pages/library/notebook/richText/markdownEdit.js'
import { parseMarkdown } from '../pages/library/notebook/richText/markdownUnits.js'
import { clipboardToMarkdown, looksLikeHtml, padForInsertion } from '../pages/library/notebook/richText/htmlToMarkdown.js'
import { useDictation } from '../pages/library/notebook/useDictation.js'
import { docPage } from '../pages/library/theme.js'
import { useStore } from '../store/useStore'
import { fitMdCols, MD_COL_PX_W, MD_PX_PER_UNIT } from '../utils/markdownRender'

// Enter'la açılan boş paragrafın yer tutucusu: Markdown'da boş paragraf olmadığından görünmez bir
// karakter taşır. Kaydedilirken ve tile odaktan çıkınca silinir.
const BLANK = '\u200B'
const stripBlank = (text) => text.replace(/\u200B/g, '')

const SAVE_DELAY = 700
const PAD = 24
const NOTICE_MS = 2600

// Tile'da görseller: https, http ve sunucudaki yüklemeler (/uploads/...)
const tileImageOk = (uri) => /^(https?:\/\/|\/(?!\/))/i.test(uri ?? '')
const IMAGE_URL = /\.(png|jpe?g|gif|webp|avif|svg|bmp)(\?|#|$)/i

function lineStartOf(text, at) {
  return text.lastIndexOf('\n', at - 1) + 1
}
function lineEndOf(text, at) {
  const end = text.indexOf('\n', at)
  return end === -1 ? text.length : end
}

// Panodaki HTML ve düz metin Markdown'a çevrilir (defterin "Biçimli yapıştır"ı ile aynı)
async function readClipboardMarkdown() {
  let html = ''
  let plain = ''
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      if (!html && item.types.includes('text/html')) html = await (await item.getType('text/html')).text()
      if (!plain && item.types.includes('text/plain')) plain = await (await item.getType('text/plain')).text()
    }
  } catch {
    plain = (await navigator.clipboard?.readText?.().catch(() => '')) ?? ''
  }
  if (!html && !plain) return null
  return clipboardToMarkdown({ html: looksLikeHtml(html) ? html : null, plain: plain || html })
}

async function uploadImage(id, file) {
  const fd = new FormData()
  fd.append('file', file)
  const r = await fetch(`/api/canvas/mdtile-${encodeURIComponent(id)}/upload`, { method: 'POST', body: fd })
  if (!r.ok) throw new Error('upload failed')
  return (await r.json()).url
}

export function MarkdownTile({ id, content, width, height }) {
  const updateMedia = useStore((s) => s.updateMedia)
  const pxWidth = Math.round(width * MD_PX_PER_UNIT)
  const pxHeight = Math.round(height * MD_PX_PER_UNIT)
  const nCols = Math.max(1, Math.round(pxWidth / MD_COL_PX_W))

  const [draft, setDraft] = useState(content ?? '')
  const [focused, setFocused] = useState(false)
  const [raw, setRaw] = useState(false)
  const [notice, setNotice] = useState(null)
  const [imageBox, setImageBox] = useState(null) // null | yazılan görsel linki
  const [cols, setCols] = useState(nCols)
  const [focusTick, setFocusTick] = useState(0)
  const [barCol, setBarCol] = useState(0) // çubuğun altında durduğu sütun

  const wrapRef = useRef(null)
  const viewRef = useRef(null)
  const docRef = useRef(null)
  const fileRef = useRef(null)
  const draftRef = useRef(draft)
  const savedRef = useRef((content ?? '').trim())
  const saveTimer = useRef(null)
  const sel = useRef(null) // son imleç/seçim, bütün yazıda { start, end }
  const pendingSel = useRef(null) // yazı değişince konacak imleç
  const dictTarget = useRef(null)
  const widthRef = useRef(width)
  const colsRef = useRef(cols)
  useLayoutEffect(() => {
    widthRef.current = width
    colsRef.current = cols
  })

  // Dışarıdan gelen değişiklik (başka sekme, EditModal): yazılmıyorsa tile güncellenir
  useEffect(() => {
    const next = content ?? ''
    if (next.trim() === savedRef.current || focused) return
    savedRef.current = next.trim()
    draftRef.current = next
    setDraft(next)
    // yalnızca içerik değişince
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content])

  // ─── Kayıt ──────────────────────────────────────────────────────────────────
  async function persist(text, { grow = false } = {}) {
    const next = stripBlank(text).trim()
    const neededW = (colsRef.current * MD_COL_PX_W) / MD_PX_PER_UNIT
    const widen = grow && neededW > widthRef.current + 1e-6
    if (next === savedRef.current && !widen) return
    savedRef.current = next
    const body = widen ? { content: next, width: neededW } : { content: next }
    try {
      const r = await fetch(`/api/media/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) updateMedia(await r.json())
    } catch (e) {
      console.error('[MarkdownTile] save failed', e)
    }
  }

  function change(text) {
    draftRef.current = text
    setDraft(text)
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null
      persist(draftRef.current)
    }, SAVE_DELAY)
  }

  function flush() {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    persist(draftRef.current, { grow: true })
  }

  // Tile kalkarken (oda değişti) bekleyen kayıt hemen yapılır
  useEffect(
    () => () => {
      if (!saveTimer.current) return
      clearTimeout(saveTimer.current)
      persist(draftRef.current)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  // Yazı değişmeden imleci yeniden yazıya koy (ör. görsel kutusu kapandı)
  function refocus(at = currentSel()) {
    pendingSel.current = at
    setFocusTick((t) => t + 1)
  }

  // Çubuk, dokunulan / imlecin olduğu sütunun altında açılır. Tile 3D'de ölçekli durduğundan
  // ekran konumu tile genişliğine oranlanır.
  function columnAtX(clientX) {
    const view = viewRef.current
    if (!view) return
    const r = view.getBoundingClientRect()
    if (!r.width) return
    const px = ((clientX - r.left) / r.width) * view.offsetWidth
    const c = Math.max(0, Math.min(colsRef.current - 1, Math.floor(px / MD_COL_PX_W)))
    setBarCol((prev) => (prev === c ? prev : c))
  }
  function columnAtCaret() {
    const view = viewRef.current
    const s = window.getSelection?.()
    let rect = null
    if (s && s.rangeCount && view?.contains(s.anchorNode)) {
      const rects = s.getRangeAt(0).getClientRects()
      rect = rects[rects.length - 1] ?? null
    }
    // Boş satırda imlecin dikdörtgeni olmaz; ham yazıda seçim DOM'da değildir → odaktaki alan
    if (!rect || (rect.width === 0 && rect.height === 0)) {
      const el = document.activeElement
      if (!el || el === view || !view?.contains(el)) return
      rect = el.getBoundingClientRect()
    }
    columnAtX(rect.left + 1)
  }

  // ─── Kolonlar ───────────────────────────────────────────────────────────────
  // Yazı tile'a sığmıyorsa görünüm sağa doğru tam genişlikte kolon ekler (kırpılmaz)
  function refit() {
    const el = viewRef.current
    if (!el) return
    const n = fitMdCols(el, nCols)
    setCols((prev) => (prev === n ? prev : n))
  }
  useLayoutEffect(refit)
  // Görseller yüklendikçe yazı uzar
  useEffect(() => {
    const el = viewRef.current
    if (!el) return
    const onLoad = () => refit()
    el.addEventListener('load', onLoad, true)
    return () => el.removeEventListener('load', onLoad, true)
  })
  // Odakta değilken yazı tile'dan taşıyorsa (ör. görsel yüklendi) tile kalıcı olarak genişler
  useEffect(() => {
    if (!focused && cols > nCols) persist(draftRef.current, { grow: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cols, focused, nCols])

  // Toolbar/Enter düzenlemesinden sonra imleç yeni yazıda yerine konur
  useLayoutEffect(() => {
    const at = pendingSel.current
    const doc = docRef.current
    if (!at || !doc) return
    pendingSel.current = null
    doc.focus()
    doc.setSelection(at.start, at.end)
  }, [draft, raw, focusTick])

  useEffect(() => {
    if (notice === null) return
    const t = setTimeout(() => setNotice(null), NOTICE_MS)
    return () => clearTimeout(t)
  }, [notice])

  // ─── Odak ───────────────────────────────────────────────────────────────────
  function onWrapFocus() {
    if (!focused) setFocused(true)
  }
  function onWrapBlur(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return
    endEditing()
  }
  function endEditing() {
    setFocused(false)
    setImageBox(null)
    if (draftRef.current.includes(BLANK)) {
      const clean = stripBlank(draftRef.current)
      draftRef.current = clean
      setDraft(clean)
    }
    flush()
  }

  function currentSel() {
    const text = draftRef.current
    const s = sel.current
    if (s && s.end <= text.length) return s
    return { start: text.length, end: text.length }
  }

  // Biçim düğmeleri imlecin olduğu yere (seçim varsa seçime) uygulanır; imleç yazıda kalır
  function editMarkdown(apply, { focus = true } = {}) {
    const { start, end } = currentSel()
    const edit = apply(draftRef.current, start, end)
    change(edit.text)
    sel.current = { start: edit.start, end: edit.end }
    if (focus) pendingSel.current = { start: edit.start, end: edit.end }
    else document.activeElement?.blur?.()
  }

  const formatInline = (format) => editMarkdown((t, s, e) => toggleInline(t, s, e, format))
  const formatLines = (format) => editMarkdown((t, s, e) => toggleLines(t, s, e, format))

  // Kod blokları yazı birimi değildir: kod bloğu ham Markdown'da açılır, imleç çitlerin içine girer
  function addCode() {
    setRaw(true)
    editMarkdown(insertCodeBlock)
  }

  function toggleRaw() {
    pendingSel.current = currentSel()
    setRaw((r) => !r)
  }

  // Yazının dışındaki boşluğa tıklandı: son yazı birimine yazılır; hiç yazı birimi yoksa (yalnızca
  // görseller) sona yeni boş paragraf açılır
  function writeAtEnd() {
    const text = draftRef.current
    if (raw || parseMarkdown(text).units.length > 0) {
      sel.current = { start: text.length, end: text.length }
      refocus({ start: text.length, end: text.length })
      return
    }
    const head = text.replace(/\s+$/, '')
    const next = head + (head ? '\n\n' : '') + BLANK
    change(next)
    const caret = next.length - BLANK.length
    sel.current = { start: caret, end: caret }
    pendingSel.current = { start: caret, end: caret }
  }

  // ─── Enter / geri silme (biçimli yazma) ─────────────────────────────────────
  // Satırın sonunda Enter yeni boş paragraf açar; ortasında satırı ikiye böler
  function enterAt(at) {
    const text = draftRef.current
    let next
    let caret
    if (text.slice(0, at).trim() === '') {
      next = BLANK + '\n\n' + text.slice(at).replace(/^\s+/, '')
      caret = BLANK.length + 2
    } else if (text.slice(at, lineEndOf(text, at)).trim() === '') {
      const head = text.slice(0, at).replace(/[ \t]+$/, '')
      const rest = text.slice(at).replace(/^[ \t]*\n*/, '')
      next = head + '\n\n' + BLANK + (rest ? '\n\n' + rest : '')
      caret = head.length + 2
    } else {
      const head = text.slice(0, at).replace(/[ \t]+$/, '')
      const tail = text.slice(at).replace(/^[ \t]+/, '')
      next = head + '\n\n' + tail
      caret = head.length + 2
    }
    change(next)
    sel.current = { start: caret, end: caret }
    pendingSel.current = { start: caret, end: caret }
  }

  function onKeyDownCapture(e) {
    if (e.nativeEvent.isComposing) return
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      if (imageBox !== null) {
        setImageBox(null)
        refocus()
        return
      }
      document.activeElement?.blur?.()
      return
    }
    if (e.key !== 'Backspace' || raw) return
    // Boş paragrafta geri silme: paragraf kalkar, imleç bir önceki satırın sonuna geçer
    const text = draftRef.current
    const s = sel.current
    if (!s || s.start !== s.end) return
    const z = text[s.start] === BLANK ? s.start : text[s.start - 1] === BLANK ? s.start - 1 : -1
    if (z < 0) return
    const ls = lineStartOf(text, z)
    const le = lineEndOf(text, z)
    if (text.slice(ls, le) !== BLANK) return
    e.preventDefault()
    e.stopPropagation()
    const head = text.slice(0, ls).replace(/\n+$/, '')
    const tail = text.slice(le).replace(/^\n+/, '')
    const next = head + (head && tail ? '\n\n' : '') + tail
    change(next)
    sel.current = { start: head.length, end: head.length }
    pendingSel.current = { start: head.length, end: head.length }
  }

  // ─── Yapıştırma ─────────────────────────────────────────────────────────────
  function pasteMarkdown(result) {
    if (!result || result.text.trim() === '') {
      setNotice('Panoda yapıştırılacak yazı yok')
      return
    }
    editMarkdown(
      (text, start, end) => {
        const before = text.slice(0, start)
        const after = text.slice(end)
        const inserted = padForInsertion(result.text, before, after)
        const caret = start + inserted.length
        return { text: before + inserted + after, start: caret, end: caret }
      },
      { focus: !result.rich },
    )
    setNotice(
      result.missingLinks > 0
        ? `${result.missingLinks} linkin adresi kaynakta yok, düz metin olarak eklendi`
        : result.rich
          ? 'Biçimli metin olarak yapıştırıldı'
          : 'Panoda biçimli metin yok, düz metin olarak eklendi',
    )
  }

  // Görseller imlecin olduğu bloğun altına girer; art arda görseller şerit (carousel) olur
  function insertImages(urls) {
    if (urls.length === 0) return
    editMarkdown((text, start, end) => {
      const ls = lineStartOf(text, Math.min(start, end))
      let le = lineEndOf(text, Math.max(start, end))
      // İmleç bir paragrafın ortasındaysa paragrafın sonuna (boş satıra kadar) gidilir
      while (le < text.length && text.slice(le + 1, lineEndOf(text, le + 1)).trim() !== '') le = lineEndOf(text, le + 1)
      const onBlank = text.slice(ls, lineEndOf(text, ls)) === BLANK
      const head = (onBlank ? text.slice(0, ls) : text.slice(0, le)).replace(/\s+$/, '')
      const tail = text.slice(onBlank ? lineEndOf(text, ls) : le).replace(/^\s+/, '')
      const block = urls.map((u) => `![](${u})`).join('\n')
      const next = (head ? head + '\n\n' : '') + block + (tail ? '\n\n' + tail : '')
      return { text: next, start: head.length, end: head.length }
    })
  }

  function insertText(str) {
    editMarkdown((text, start, end) => {
      const caret = start + str.length
      return { text: text.slice(0, start) + str + text.slice(end), start: caret, end: caret }
    })
  }

  async function pasteImageFile(file) {
    setNotice('Görsel yükleniyor…')
    try {
      insertImages([await uploadImage(id, file)])
      setNotice(null)
    } catch {
      setNotice('Görsel yüklenemedi')
    }
  }

  async function pickFiles(files) {
    const list = [...(files ?? [])].filter((f) => f.type.startsWith('image/'))
    if (list.length === 0) return
    setImageBox(null)
    setNotice('Görsel yükleniyor…')
    try {
      const urls = []
      for (const f of list) urls.push(await uploadImage(id, f))
      insertImages(urls)
      setNotice(null)
    } catch {
      setNotice('Görsel yüklenemedi')
    }
  }

  function submitImageBox() {
    const urls = (imageBox ?? '').split(/\s+/).filter((u) => tileImageOk(u))
    setImageBox(null)
    if (urls.length === 0) {
      setNotice('Geçerli bir görsel linki yok')
      refocus()
      return
    }
    insertImages(urls)
  }

  // ─── Sesle yazma ────────────────────────────────────────────────────────────
  const dictation = useDictation({
    onTranscript: (spoken) => {
      const t = dictTarget.current
      if (!t) return
      const lead = spoken && t.before && !/\s$/.test(t.before) ? ' ' : ''
      const trail = spoken && t.after && !/^\s/.test(t.after) ? ' ' : ''
      const next = t.before + lead + spoken + trail + t.after
      draftRef.current = next
      setDraft(next)
      sel.current = { start: (t.before + lead + spoken).length, end: (t.before + lead + spoken).length }
    },
    onEnd: () => {
      dictTarget.current = null
      flush()
    },
    onError: (message) => setNotice(message),
  })

  function toggleMic() {
    if (dictation.listening) {
      dictation.stop()
      return
    }
    const { start, end } = currentSel()
    const text = draftRef.current
    dictTarget.current = { before: stripBlank(text.slice(0, start)), after: stripBlank(text.slice(end)) }
    document.activeElement?.blur?.()
    if (!dictation.start()) dictTarget.current = null
  }

  // ─── Görünüm ────────────────────────────────────────────────────────────────
  const showBar = focused || dictation.listening
  const Doc = raw ? RawDocText : LiveDocText
  const docProps = {
    ref: docRef,
    value: draft,
    placeholder: 'Yazmaya başla…',
    imageOk: tileImageOk,
    onChangeText: change,
    onSelectionChange: () => {},
    onSelect: (start, end) => {
      sel.current = { start, end }
      columnAtCaret()
    },
    onFocus: () => {},
    onBlur: () => {},
    onPasteMarkdown: pasteMarkdown,
    onPasteImage: pasteImageFile,
    onPasteLink: (url) => (IMAGE_URL.test(url) ? insertImages([url]) : insertText(url)),
    ...(raw ? null : { onEnter: enterAt }),
  }

  return (
    <div
      ref={wrapRef}
      className="mdtile-live-wrap"
      style={{ position: 'relative', width: `${pxWidth}px`, height: `${pxHeight}px` }}
      onFocus={onWrapFocus}
      onBlur={onWrapBlur}
      onKeyDownCapture={onKeyDownCapture}
      onClick={(e) => e.stopPropagation()}
    >
      <style>{TILE_CSS}</style>
      <div
        ref={viewRef}
        className="mdtile-live"
        // Tıklanınca odak alır: görsele/boşluğa tıklayınca da çubuk açılır
        tabIndex={-1}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          height: `${pxHeight}px`,
          padding: `${PAD}px`,
          columnGap: `${PAD * 2}px`,
          borderColor: dictation.listening ? '#ef4444' : focused ? '#60a5fa' : 'transparent',
        }}
        onMouseDown={(e) => columnAtX(e.clientX)}
        onClick={(e) => {
          // Boş tile ya da yazının altındaki boşluk: son satıra yazılır
          if (e.target === e.currentTarget) writeAtEnd()
        }}
      >
        <Doc {...docProps} />
      </div>

      {showBar && (
        <div className="mdtile-bar" style={{ top: `${pxHeight + 10}px`, left: `${barCol * MD_COL_PX_W}px` }}>
          {imageBox !== null && (
            <div className="mdtile-imagebox">
              <input
                autoFocus
                type="text"
                value={imageBox}
                placeholder="Görsel linki (https://…) — birden çoksa boşlukla ayır, Enter"
                onChange={(e) => setImageBox(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    e.stopPropagation()
                    submitImageBox()
                  }
                }}
              />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={submitImageBox}>
                Ekle
              </button>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()}>
                Dosyadan…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                hidden
                onChange={(e) => {
                  pickFiles(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
          )}
          <DocumentBar
            listening={dictation.listening}
            onPaste={async () => pasteMarkdown(await readClipboardMarkdown().catch(() => null))}
            onHeading={() => formatLines('heading')}
            onBold={() => formatInline('bold')}
            onItalic={() => formatInline('italic')}
            onBullet={() => formatLines('bullet')}
            onTask={() => formatLines('task')}
            onCode={addCode}
            onMicPress={toggleMic}
            onImagePress={() => setImageBox((v) => (v === null ? '' : null))}
            onRawPress={toggleRaw}
            rawActive={raw}
            notice={notice}
            style={{ borderRadius: 12, border: '1px solid rgba(36, 41, 47, 0.18)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}
          />
        </div>
      )}
      {!showBar && notice !== null && (
        <div className="mdtile-notice" style={{ top: `${pxHeight + 10}px`, left: `${barCol * MD_COL_PX_W}px` }} role="status">
          {notice}
        </div>
      )}
    </div>
  )
}

const TILE_CSS = `
  .mdtile-live {
    box-sizing: border-box;
    width: ${MD_COL_PX_W}px;
    background: rgba(255, 255, 255, 0.96);
    border: 2px solid transparent;
    border-radius: 8px;
    overflow: hidden;
    column-fill: auto;
    pointer-events: auto;
    cursor: text;
    outline: none;
    color: ${docPage.ink};
    -webkit-font-smoothing: antialiased;
  }
  /* Defterin dikey (flex) akışı kolonlara akabilsin diye blok akışa çevrilir */
  .mdtile-live [data-md-root] { display: block !important; }
  .mdtile-live [data-md-root] > * { margin-bottom: 10px; }
  .mdtile-live [data-md-root] > *:last-child { margin-bottom: 0; }
  .mdtile-live img, .mdtile-live .nb-carousel, .mdtile-live pre { break-inside: avoid; }
  .mdtile-live [role="heading"] { break-after: avoid; }
  .mdtile-live a { pointer-events: auto; }
  .mdtile-bar {
    position: absolute;
    width: max-content;
    pointer-events: auto;
    cursor: default;
  }
  .mdtile-bar .nb-tool-row { justify-content: flex-start; gap: 4px; padding: 0 10px; }
  .mdtile-imagebox {
    display: flex; gap: 6px; align-items: center;
    margin-bottom: 8px; padding: 8px;
    background: #F6F5F2; border: 1px solid rgba(36, 41, 47, 0.18); border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    font-family: 'DM Sans', system-ui, sans-serif;
  }
  .mdtile-imagebox input[type="text"] {
    flex: 1; min-width: 340px; height: 34px; padding: 0 10px;
    border: 1px solid rgba(36, 41, 47, 0.22); border-radius: 8px; outline: none;
    font: 300 14px 'DM Sans', system-ui, sans-serif; color: ${docPage.ink}; background: #fff;
  }
  .mdtile-imagebox input[type="text"]:focus { border-color: ${docPage.link}; }
  .mdtile-imagebox button {
    height: 34px; padding: 0 12px; border-radius: 8px; cursor: pointer;
    border: 1px solid rgba(36, 41, 47, 0.18); background: #fff; color: ${docPage.ink};
    font: 800 13px 'DM Sans', system-ui, sans-serif;
  }
  .mdtile-notice {
    position: absolute; left: 0; padding: 8px 14px; border-radius: 10px;
    background: rgba(36, 41, 47, 0.92); color: #fff;
    font: 300 13px 'DM Sans', system-ui, sans-serif; pointer-events: none;
  }
`
