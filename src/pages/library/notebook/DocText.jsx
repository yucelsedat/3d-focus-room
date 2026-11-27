// Seyir defteri: components/notebook/DocTextSegment.tsx — PDF sayfasındaki bir yazı bölümü. Yazı
// Markdown'dır. İki türlü yazılır (sayfa ayarlarındaki "Markdown'ı düzenle"):
//  - biçimli (varsayılan): yazı hep biçimli görünür; başlığa, paragrafa ya da maddeye tıklayınca
//    o parça yerinde yazılır (LiveDocText). Görsellere, tablolara tıklamak yazmayı açmaz.
//  - ham Markdown: yazıya tıklayınca bölümün bütün Markdown'ı ham hâliyle açılır (RawDocText).
//
// Ref arayüzü (sayfanın odak istekleri): focus(), blur(), setSelection(start, end) — konumlar
// bölümün bütün yazısında.
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'

import { docPage, fonts } from '../theme.js'
import { useRawMarkdown } from './documentSettings.js'
import { MarkdownView } from './MarkdownView.jsx'
import { clipboardToMarkdown } from './richText/htmlToMarkdown.js'
import { copyMarkdownSelection } from './richText/markdownCopy.js'
import { markdownEnter, toggleTask } from './richText/markdownEdit.js'
import { BLANK_BLOCK, parseMarkdown, unitAt, unitPrefix } from './richText/markdownUnits.js'

import { DOC_RENDERED_PAD } from './docLayout.js'
import { pastedLink } from './linkCards.js'

const NO_MARKS = []

export function DocText(props) {
  const rawMarkdown = useRawMarkdown()
  return rawMarkdown ? <RawDocText {...props} /> : <LiveDocText {...props} />
}

function wrapperStyle({ indent, push = 0, collapsed = false }) {
  return {
    ...(indent ? { marginLeft: indent.left, marginRight: indent.right } : null),
    ...(push > 0 ? { marginTop: push } : null),
    ...(collapsed ? { height: 0, overflow: 'hidden' } : null),
  }
}

// ─── Ham Markdown ────────────────────────────────────────────────────────────────
// Odaktayken ham hâliyle yazılır, odaktan çıkınca biçimli görünür; biçimli yazıya tıklayınca
// yeniden yazma açılır. Yazı alanı yalnızca yazarken kuruludur; odak ve imleç istekleri yazı alanı
// kurulana kadar bekletilir.
export function RawDocText({
  ref,
  value,
  readOnly = false,
  placeholder,
  onChangeText,
  onSelectionChange,
  onSelect,
  onFocus,
  onBlur,
  highlights = NO_MARKS,
  inks = NO_MARKS,
  onEnter,
  onBackspaceAtStart,
  onPasteMarkdown,
  onPasteImage,
  onPasteLink,
  imageOk,
  ...layout
}) {
  const inputRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const pending = useRef(null)
  const wantsFocus = useRef(false)
  const pendingCursor = useRef(null)
  // Boş blok yazma alanıyla durur
  const showInput = !readOnly && (editing || value === '')

  // Enter'dan sonraki imleç, yeni yazı çizildikten sonra konur
  useLayoutEffect(() => {
    const el = inputRef.current
    if (el) {
      el.style.height = '0px'
      el.style.height = `${Math.max(docPage.lineHeight, el.scrollHeight)}px`
    }
    if (pendingCursor.current && el) {
      el.setSelectionRange(pendingCursor.current.start, pendingCursor.current.end)
      pendingCursor.current = null
    }
  }, [value, showInput])

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (inputRef.current) inputRef.current.focus()
      else {
        wantsFocus.current = true
        setEditing(true)
      }
    },
    blur: () => inputRef.current?.blur(),
    setSelection: (start, end) => {
      if (inputRef.current) inputRef.current.setSelectionRange(start, end)
      else pending.current = { start, end }
    },
  }))

  // Yazı alanı kurulunca bekleyen odak verilir
  useEffect(() => {
    if (!showInput || !inputRef.current || !wantsFocus.current) return
    wantsFocus.current = false
    const el = inputRef.current
    el.focus()
    const target = pending.current ?? { start: el.value.length, end: el.value.length }
    pending.current = null
    el.setSelectionRange(target.start, target.end)
  }, [showInput])

  function startEditing(e) {
    if (readOnly || e.target.closest('a, [data-task]')) return
    if (String(window.getSelection?.() ?? '') !== '') return
    wantsFocus.current = true
    setEditing(true)
  }

  // Enter: liste sürer / biter ya da satır sonu girer; boş satırda blok bölünür
  function enter(text, start, end) {
    const result = markdownEnter(text, start, end)
    if (result.kind === 'split') {
      if (!onEnter) {
        pendingCursor.current = { start: start + 1, end: start + 1 }
        onChangeText(text.slice(0, start) + '\n' + text.slice(end))
        return
      }
      onChangeText(result.head + result.tail)
      onEnter(result.head.length, '')
      return
    }
    pendingCursor.current = { start: result.edit.start, end: result.edit.end }
    onChangeText(result.edit.text)
  }

  function report(el) {
    onSelectionChange(el.selectionEnd)
    onSelect?.(Math.min(el.selectionStart, el.selectionEnd), Math.max(el.selectionStart, el.selectionEnd))
  }

  return (
    <div style={wrapperStyle(layout)}>
      {showInput ? (
        <textarea
          ref={inputRef}
          value={value}
          rows={1}
          spellCheck
          placeholder={placeholder}
          aria-label="Blok"
          className="nb-raw-input"
          style={{ ...styles.text, ...styles.input, color: inks.length ? docPage.ink : docPage.ink }}
          onChange={(e) => {
            onChangeText(e.target.value)
            report(e.target)
          }}
          onSelect={(e) => report(e.currentTarget)}
          onPaste={(e) => richPaste(e, onPasteMarkdown, onPasteImage, onPasteLink)}
          onFocus={() => {
            setEditing(true)
            onFocus()
          }}
          onBlur={() => {
            setEditing(false)
            onBlur()
          }}
          onKeyDown={(e) => {
            const el = e.currentTarget
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              enter(el.value, el.selectionStart, el.selectionEnd)
            } else if (e.key === 'Backspace' && el.selectionStart === 0 && el.selectionEnd === 0 && onBackspaceAtStart) {
              e.preventDefault()
              onBackspaceAtStart()
            }
          }}
        />
      ) : (
        <div
          onClick={startEditing}
          className={readOnly ? undefined : 'nb-md-unit'}
          style={styles.rendered}
        >
          <MarkdownView
            value={value}
            highlights={highlights}
            inks={inks}
            imageOk={imageOk}
            onToggleTask={readOnly ? undefined : (index) => onChangeText(toggleTask(value, index))}
          />
        </div>
      )}
    </div>
  )
}

// ─── Biçimli yazma ───────────────────────────────────────────────────────────────
// Yazı hep biçimli görünür. Başlık, paragraf ya da madde ("birim") tıklanınca yerinde yazı alanı
// olur; alan birimin ham yazısını taşır, satır içi işaretleri soluk görünür. Yazılan her harf
// bölümün bütün yazısına işlenir; yazı yeniden ayrışınca birim değişmişse (ör. başına "# " yazılıp
// başlık olunca) imleç yeni birime geçer.
export function LiveDocText({
  ref,
  value,
  readOnly = false,
  placeholder,
  onChangeText,
  onSelectionChange,
  onSelect,
  onFocus,
  onBlur,
  highlights = NO_MARKS,
  inks = NO_MARKS,
  onEnter,
  onBackspaceAtStart,
  onPasteMarkdown,
  onPasteImage,
  onPasteLink,
  imageOk,
  ...layout
}) {
  const parsed = parseMarkdown(value)
  const [active, setActive] = useState(null)
  const [request, setRequest] = useState(null)
  const seq = useRef(0)
  const inputRef = useRef(null)
  // En son yazı ve yazılan birimin bu yazıdaki aralığı
  const latest = useRef(value)
  const live = useRef(null)
  const selection = useRef({ start: 0, end: 0 })
  // Değişiklikten sonra imlecin olacağı yer (bütün yazıda) ve yazı alanının o an taşıdığı yazı
  const pendingAt = useRef(null)
  const nativeText = useRef(null)
  // Uygulanan son odak isteği ve yazılan birimdeki imleç (birimin başına göre): birim yazılırken
  // yazma alanı yeniden kurulursa (ör. boş madde ilk harfle yazılı maddeye döner) imleç yerinde kalır
  const appliedRequestRef = useRef(0)
  const caretRef = useRef(null)

  // Yazı değişti: imleç, yeni ayrışmada içinde kaldığı birime geçer. Yazı alanı zaten doğru yazıyı
  // taşıyorsa (harf yazıldı, birim değişmedi) imlece dokunulmaz.
  useLayoutEffect(() => {
    latest.current = value
    const at = pendingAt.current
    pendingAt.current = null
    if (active === null) {
      live.current = null
      return
    }
    if (at === null) {
      const unit = parsed.units[active]
      live.current = unit ? { start: unit.start, end: unit.end } : null
      return
    }
    const unit = unitAt(parsed.units, at, active)
    if (!unit) {
      // Yazılan yer artık yazı birimi değil (ör. görsele dönüştü): yazma biter
      inputRef.current?.blur()
      inputRef.current = null
      live.current = null
      setActive(null)
      onBlur()
      return
    }
    live.current = { start: unit.start, end: unit.end }
    if (unit.index === active && value.slice(unit.start, unit.end) === nativeText.current) return
    seq.current += 1
    setRequest({ index: unit.index, start: at - unit.start, end: at - unit.start, seq: seq.current })
    if (unit.index !== active) setActive(unit.index)
    // Yalnızca yazı değişince
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Verilen yere (bütün yazıda) odaklan: içinde olduğu birim, yoksa ondan önceki son birim
  function focusAt(start, end = start) {
    const units = parsed.units
    const unit = unitAt(units, start, active) ?? units.filter((u) => u.start <= start).pop() ?? units[0]
    if (!unit) return
    const from = Math.min(Math.max(start, unit.start), unit.end)
    const to = Math.min(Math.max(end, from), unit.end)
    seq.current += 1
    setRequest({ index: unit.index, start: from - unit.start, end: to - unit.start, seq: seq.current })
    live.current = { start: unit.start, end: unit.end }
    setActive(unit.index)
  }

  useImperativeHandle(ref, () => ({
    focus: () => {
      if (inputRef.current) inputRef.current.focus()
      else focusAt(latest.current.length)
    },
    blur: () => inputRef.current?.blur(),
    setSelection: (start, end) => focusAt(start, end),
  }))

  function commit(text) {
    latest.current = text
    onChangeText(text)
  }

  function changeUnit(text) {
    // Aralık bilinmiyorsa (yeni kurulan bölümde odak isteği effect'lerden önce gelmiş olabilir)
    // açık birimin aralığı kullanılır
    const open = active !== null ? parsed.units[active] : null
    const range = live.current ?? (open ? { start: open.start, end: open.end } : null)
    if (!range) return
    const base = latest.current
    const old = base.slice(range.start, range.end)
    const full = base.slice(0, range.start) + text + base.slice(range.end)
    let tail = 0
    while (tail < Math.min(old.length, text.length) && old[old.length - 1 - tail] === text[text.length - 1 - tail]) {
      tail++
    }
    pendingAt.current = range.start + text.length - tail
    nativeText.current = text
    caretRef.current = { start: text.length - tail, end: text.length - tail }
    live.current = { start: range.start, end: range.start + text.length }
    commit(full)
  }

  // Enter: maddede liste sürer (boş maddede liste biter, blok orada bölünür); başlıkta ve
  // paragrafta blok imlecin yerinde bölünür
  function enter(at) {
    const base = latest.current
    const unit = unitAt(parsed.units, at, active)
    if (unit?.kind === 'item') {
      if (base.slice(unit.start, unit.end).trim() === '') {
        const lineStart = base.lastIndexOf('\n', unit.start - 1) + 1
        const newline = base.indexOf('\n', unit.start)
        const lineEnd = newline === -1 ? base.length : newline
        const head = base.slice(0, Math.max(0, lineStart - 1))
        const tail = base.slice(Math.min(base.length, lineEnd + 1))
        if (onEnter) {
          commit(head + tail)
          onEnter(head.length, '')
        } else {
          pendingAt.current = lineStart
          commit(base.slice(0, lineStart) + base.slice(lineEnd))
        }
        return
      }
      const result = markdownEnter(base, at, at)
      if (result.kind === 'edit') {
        pendingAt.current = result.edit.start
        nativeText.current = null
        commit(result.edit.text)
        return
      }
    }
    if (onEnter) {
      onEnter(at, '')
      return
    }
    pendingAt.current = at + 1
    nativeText.current = null
    commit(base.slice(0, at) + '\n' + base.slice(at))
  }

  // Birimin başında geri silme: satır önü işareti (başlık, madde, alıntı) varsa o kalkar; yoksa
  // birim bir öncekiyle birleşir. Bölümün ilk birimiyse blok bir üstteki blokla birleşir.
  function backspaceAtStart(unit) {
    const base = latest.current
    const prefix = unitPrefix(base, unit)
    nativeText.current = null
    if (prefix) {
      pendingAt.current = prefix.start
      commit(base.slice(0, prefix.start) + base.slice(prefix.end))
      return
    }
    const prev = parsed.units[unit.index - 1]
    if (!prev) {
      if (base.slice(0, unit.start).trim() === '') onBackspaceAtStart?.()
      return
    }
    const gap = base.slice(prev.end, unit.start)
    if (/\S/.test(gap)) {
      // Arada görsel, tablo gibi yazı olmayan bir şey var: imleç önceki birimin sonuna geçer
      focusAt(prev.end)
      return
    }
    const glue = /\n[ \t]*\n/.test(gap) ? '\n' : ''
    pendingAt.current = prev.end + glue.length
    commit(base.slice(0, prev.end) + glue + base.slice(unit.start))
  }

  function renderInput({ unit, style, wrapperStyle: around, pieces }) {
    return (
      // Anahtar verilmez: birim türü değişse de (paragraf → başlık) yazma alanı yerinde kalır
      <UnitInput
        unit={unit}
        style={style}
        wrapperStyle={around}
        pieces={pieces}
        request={request?.index === unit.index ? request : null}
        appliedRequestRef={appliedRequestRef}
        caretRef={caretRef}
        placeholder={unit.block === BLANK_BLOCK ? placeholder : undefined}
        onInput={(node) => {
          inputRef.current = node
        }}
        onChangeText={changeUnit}
        onSelect={(start, end) => {
          caretRef.current = { start, end }
          const base = live.current?.start ?? unit.start
          selection.current = { start: base + start, end: base + end }
          onSelectionChange(base + end)
          onSelect?.(base + Math.min(start, end), base + Math.max(start, end))
        }}
        // Enter anındaki imleç (birimin başına göre) doğrudan alandan okunur; selectionchange
        // olayı hızlı yazarken bir adım geride kalabilir
        onSubmit={(end) => enter((live.current?.start ?? unit.start) + end)}
        onPasteMarkdown={onPasteMarkdown}
        onPasteImage={onPasteImage}
        onPasteLink={onPasteLink}
        onBackspaceAtStart={() => backspaceAtStart(unit)}
        onFocus={onFocus}
        onBlur={(node) => {
          // Başka birime geçilirken eski alanın odak kaybı yok sayılır
          if (node !== inputRef.current) return
          inputRef.current = null
          setActive(null)
          onBlur()
        }}
      />
    )
  }

  // Kopyalarken seçilen yerin ham Markdown'ı panoya gider: başka bir metin alanına yapıştırınca
  // HTML'den yeniden üretilmez, aynı biçimle girer
  function onCut(e) {
    const field = inputRef.current
    const sel = window.getSelection?.()
    const inField = !readOnly && field && sel?.rangeCount && field.contains(sel.anchorNode) && field.contains(sel.focusNode)
    if (copyMarkdownSelection(e, e.currentTarget, latest.current) && inField) document.execCommand('delete')
  }

  return (
    <div
      style={{ ...wrapperStyle(layout), ...styles.rendered }}
      onCopy={(e) => copyMarkdownSelection(e, e.currentTarget, latest.current)}
      onCut={onCut}
    >
      <MarkdownView
        value={value}
        parsed={parsed}
        highlights={highlights}
        inks={inks}
        imageOk={imageOk}
        onToggleTask={readOnly ? undefined : (index) => commit(toggleTask(value, index))}
        editor={
          readOnly
            ? undefined
            : {
                active,
                activate: (index) => {
                  const unit = parsed.units[index]
                  if (unit) focusAt(unit.end)
                },
                renderInput,
              }
        }
      />
    </div>
  )
}

// ─── Birimin yazma alanı ─────────────────────────────────────────────────────────
// Birimin biçimli hâliyle aynı yazı stilinde, aynı yerde duran düzenlenebilir alan. İçeriği
// React değil bu bileşen kurar (contentEditable): her değişiklikte parçalar biçimleriyle yeniden
// dizilir, imleç aynı yere konur. Böylece "**kalın**" yazarken kalın harfler gerçekten kalın,
// işaretler soluk görünür (mobildeki biçimli TextInput gibi).
const PX_KEYS = new Set(['fontSize', 'borderRadius', 'marginTop', 'letterSpacing'])

function applyStyle(el, style) {
  for (const [key, value] of Object.entries(style ?? {})) {
    el.style[key] = typeof value === 'number' && PX_KEYS.has(key) ? `${value}px` : value
  }
}

function signature(pieces) {
  return pieces.map((p) => `${p.text}\u0001${JSON.stringify(p.style)}`).join('\u0002')
}

// Alanın içindeki imleç/seçim, yazının başına göre karakter konumu olarak
function readSelection(root) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) return null
  const offsetOf = (node, offset) => {
    const range = document.createRange()
    range.selectNodeContents(root)
    range.setEnd(node, offset)
    return range.toString().length
  }
  const a = offsetOf(sel.anchorNode, sel.anchorOffset)
  const b = offsetOf(sel.focusNode, sel.focusOffset)
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

function pointAt(root, offset) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let left = offset
  let node = walker.nextNode()
  let last = null
  while (node) {
    if (left <= node.length) return { node, offset: left }
    left -= node.length
    last = node
    node = walker.nextNode()
  }
  return last ? { node: last, offset: last.length } : { node: root, offset: 0 }
}

function writeSelection(root, start, end) {
  const sel = window.getSelection()
  if (!sel) return
  const a = pointAt(root, start)
  const b = pointAt(root, end)
  const range = document.createRange()
  range.setStart(a.node, a.offset)
  range.setEnd(b.node, b.offset)
  sel.removeAllRanges()
  sel.addRange(range)
}

function UnitInput({
  unit,
  style,
  wrapperStyle: around,
  pieces,
  request,
  appliedRequestRef,
  caretRef,
  placeholder,
  onInput,
  onChangeText,
  onSelect,
  onSubmit,
  onBackspaceAtStart,
  onFocus,
  onBlur,
  onPasteMarkdown,
  onPasteImage,
  onPasteLink,
}) {
  const ref = useRef(null)
  const applied = useRef(null)
  const composing = useRef(false)
  const text = pieces.map((p) => p.text).join('')
  const sig = signature(pieces)

  // Parçalar değişince alan yeniden dizilir; odaktaysa imleç aynı karakter konumunda kalır
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || composing.current || applied.current === sig) return
    const focused = document.activeElement === el
    const keep = focused ? readSelection(el) : null
    el.replaceChildren(
      ...pieces.map((p) => {
        const span = document.createElement('span')
        applyStyle(span, p.style)
        // Fosforlu kalem katmanı yazarken de bu parçalardan ölçer
        span.dataset.raw = String(p.from)
        span.dataset.len = String(p.text.length)
        span.textContent = p.text
        return span
      }),
    )
    applied.current = sig
    if (focused && keep) writeSelection(el, Math.min(keep.start, text.length), Math.min(keep.end, text.length))
  })

  useEffect(() => {
    onInput(ref.current)
    // Yalnızca kurulunca
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Odak ve imleç isteği (tıklama, sayfanın isteği ya da birimin değişmesi). İstek bir kez uygulanır:
  // yazılırken yeniden kurulan alan eski isteği değil, imlecin kaldığı yeri alır.
  useLayoutEffect(() => {
    const el = ref.current
    if (!request || !el) return
    onInput(el)
    if (request.seq !== undefined && request.seq <= appliedRequestRef.current) {
      const at = caretRef.current
      if (document.activeElement === el || !at) return
      el.focus({ preventScroll: true })
      writeSelection(el, Math.min(at.start, text.length), Math.min(at.end, text.length))
      return
    }
    if (request.seq !== undefined) appliedRequestRef.current = request.seq
    el.focus({ preventScroll: false })
    writeSelection(el, Math.min(request.start, text.length), Math.min(request.end, text.length))
    // Yalnızca yeni istekte
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [request])

  // Seçim değişince (ok tuşları, fareyle seçme) birimin başına göre bildirilir
  useEffect(() => {
    const onChange = () => {
      const el = ref.current
      if (!el || document.activeElement !== el) return
      const sel = readSelection(el)
      if (sel) onSelect(sel.start, sel.end)
    }
    document.addEventListener('selectionchange', onChange)
    return () => document.removeEventListener('selectionchange', onChange)
  }, [onSelect])

  function handleInput() {
    const el = ref.current
    if (!el || composing.current) return
    // Tarayıcının araya koyduğu <br>'ler yazı sayılmaz (satır sonu yalnız Enter'la, o da bölünür)
    const next = el.textContent ?? ''
    applied.current = null
    onChangeText(next)
  }

  return (
    <div style={{ ...around, position: 'relative' }}>
      <div
        ref={ref}
        contentEditable="plaintext-only"
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={unit.kind === 'heading' ? 'Başlık' : 'Yazı'}
        data-placeholder={placeholder}
        spellCheck
        className="nb-unit-input"
        style={{ ...style, minHeight: style?.lineHeight ?? docPage.lineHeight }}
        onInput={handleInput}
        onCompositionStart={() => {
          composing.current = true
        }}
        onCompositionEnd={() => {
          composing.current = false
          handleInput()
        }}
        onFocus={onFocus}
        onBlur={() => onBlur(ref.current)}
        onPaste={(e) => {
          if (richPaste(e, onPasteMarkdown, onPasteImage, onPasteLink)) return
          // Düz yazı olduğu gibi girer (biçimler, görseller alana girmez)
          e.preventDefault()
          const plain = e.clipboardData.getData('text/plain')
          if (plain) document.execCommand('insertText', false, plain)
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return
          if (e.key === 'Enter') {
            e.preventDefault()
            const sel = readSelection(e.currentTarget)
            onSubmit(sel ? sel.end : (e.currentTarget.textContent ?? '').length)
            return
          }
          if (e.key === 'Backspace') {
            const sel = readSelection(e.currentTarget)
            if (sel && sel.start === 0 && sel.end === 0) {
              e.preventDefault()
              onBackspaceAtStart()
            }
          }
        }}
      />
    </div>
  )
}

// Yapıştırılan şey biçimli metinse (Google Docs, Word, web sayfası, ChatGPT, kod editörü) Markdown
// karşılığı imlecin yerine girer, blok hemen biçimli görünür; true döner. Düz metinse false: alan
// kendisi yapıştırır.
function richPaste(e, onPasteMarkdown, onPasteImage, onPasteLink) {
  // Panodaki resim imlecin olduğu yere fotoğraf olarak girer
  const image = [...(e.clipboardData.files ?? [])].find((f) => f.type.startsWith('image/'))
  if (image && onPasteImage) {
    e.preventDefault()
    onPasteImage(image)
    return true
  }
  // Tek başına bir link imlecin yerine kart olarak girer (canvas tile'daki link kartı gibi)
  const link = onPasteLink ? pastedLink(e.clipboardData) : null
  if (link) {
    e.preventDefault()
    onPasteLink(link)
    return true
  }
  if (!onPasteMarkdown) return false
  const html = e.clipboardData.getData('text/html')
  if (!html) return false
  const result = clipboardToMarkdown({ html, plain: e.clipboardData.getData('text/plain') })
  if (!result.rich) return false
  e.preventDefault()
  onPasteMarkdown(result)
  return true
}

const styles = {
  text: {
    ...fonts.docBody,
    fontSize: docPage.fontSize,
    lineHeight: `${docPage.lineHeight}px`,
    color: docPage.ink,
  },
  input: {
    display: 'block',
    width: '100%',
    minHeight: docPage.lineHeight,
    margin: 0,
    padding: 0,
    border: 0,
    outline: 'none',
    resize: 'none',
    overflow: 'hidden',
    background: 'transparent',
    caretColor: docPage.ink,
  },
  rendered: {
    minHeight: docPage.lineHeight,
    paddingTop: DOC_RENDERED_PAD,
    paddingBottom: DOC_RENDERED_PAD,
  },
}
