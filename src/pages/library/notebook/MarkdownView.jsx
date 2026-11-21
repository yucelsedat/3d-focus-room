// Seyir defteri: components/MarkdownView.tsx — GFM Markdown'ı çizer. Ayrıştırıcı aynı (marked);
// HTML basılmaz (dangerouslySetInnerHTML yok): ham HTML etiketleri yok sayılır, <br> satır sonu
// olur, blok HTML soluk düz metin olarak görünür. Linkler yalnızca http(s)/mailto, görseller
// yalnızca https.
//
// editor verilirse yazı biçimli görünürken de yazılır: yazı birimine (başlık, paragraf, madde)
// tıklayınca o birim yerinde yazma alanı olur (alanı DocText kurar).
import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import { docPage, fonts, inkOf } from '../theme.js'
import { HEADINGS, headingMetrics } from './docLayout.js'
import { HighlightLayer } from './HighlightStroke.jsx'
import { BLANK_BLOCK, blockImages, parseMarkdown } from './richText/markdownUnits.js'

const SIZE = docPage.fontSize

const NO_MARKS = []
const SAFE_LINK = /^(https?:|mailto:)/i
// Varsayılan: yalnızca https görseller. Yüzey (ör. duvardaki metin tile) kendi süzgecini verebilir.
const HTTPS_IMAGE = (uri) => /^https:\/\//i.test(uri)
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }

// marked metin token'larındaki HTML varlıklarını çözmez
function decode(text) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1))
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole
    }
    return ENTITIES[name.toLowerCase()] ?? whole
  })
}

const PLAIN = { bold: false, italic: false, strike: false, heading: null, link: null }

// Yazı parçası (ham yazıda from'dan başlayan) kalem renklerinin sınırlarından bölünür; her parça
// kendi renginde yazılır
function markedText(text, raw, from, ctx) {
  const shown = decode(text)
  if (from === undefined || ctx.inks.length === 0) return shown
  const to = from + raw.length
  const inks = ctx.inks.filter((m) => m.end > from && m.start < to)
  if (inks.length === 0) return shown
  const colorAt = (a, b) => {
    const ink = inks.find((m) => m.start <= a && m.end >= b)
    return ink ? inkOf(ink.color).color : null
  }
  if (raw !== text) {
    const color = colorAt(from, to)
    return color ? <span style={{ color }}>{shown}</span> : shown
  }
  const cuts = new Set([from, to])
  for (const m of inks) {
    cuts.add(Math.max(from, m.start))
    cuts.add(Math.min(to, m.end))
  }
  const points = [...cuts].sort((a, b) => a - b)
  const parts = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const piece = decode(text.slice(a - from, b - from))
    const color = colorAt(a, b)
    parts.push(color ? <span key={a} style={{ color }}>{piece}</span> : piece)
  }
  return parts
}

// Yazı bloğu (paragraf, başlık, tablo hücresi). Birimse ve düzenleyici açıksa tıklayınca yazılır;
// yazılan birimin yerine düzenleyicinin yazma alanı çizilir.
function BlockText({ block, tokens, inline, ctx, style, wrapperStyle, header }) {
  const unit = ctx.unitOf.get(block)
  const editor = unit ? ctx.editor : undefined
  if (unit && editor && editor.active === unit.index) {
    return editor.renderInput({
      unit,
      style,
      wrapperStyle,
      // Birimin ham yazısı parça parça, biçimiyle ({ key, text, style }); yazma alanı bunlardan kurulur
      pieces: rawSpans(unit.tokens, unit.start, unit.end, inline, ctx),
    })
  }
  const text = (
    <div
      role={header ? 'heading' : undefined}
      aria-level={header ? inline.heading : undefined}
      className={editor ? 'nb-md-unit' : undefined}
      style={style}
      onClick={
        unit && editor
          ? (e) => {
              // Link ve görev kutusu kendi işini yapar; yazı seçilirken yazma açılmaz
              if (e.target.closest('a, [data-task]')) return
              if (String(window.getSelection?.() ?? '') !== '') return
              editor.activate(unit.index)
            }
          : undefined
      }
    >
      {renderInline(tokens, inline, ctx)}
    </div>
  )
  return wrapperStyle ? <div style={wrapperStyle}>{text}</div> : text
}

// Yazılan birimin ham yazısı, biçimiyle: yazma alanının içeriği tam olarak ham yazının
// [from, to) aralığıdır. Token'ların arasında kalan işaretler ("**", "`", "[", "](adres)") soluk,
// yazının kendisi biçimiyle (kalın, italik, kod, link) ve kalem rengiyle yazılır.
function rawSpans(tokens, from, to, inline, ctx) {
  const out = []
  const faint = { ...leafStyle(inline), color: docPage.faint }
  const piece = (a, b, style, ink = true) => {
    if (b <= a) return
    const text = ctx.source.slice(a, b)
    const color = ink ? ctx.inks.find((m) => m.start <= a && m.end >= b)?.color : undefined
    if (!ink || ctx.inks.every((m) => m.end <= a || m.start >= b) || color) {
      out.push({ key: `${a}-${b}`, from: a, text, style: color ? { ...style, color: inkOf(color).color } : style })
      return
    }
    // Kalem rengi parçanın ortasında başlıyor ya da bitiyor: sınırlarından bölünür
    const cuts = new Set([a, b])
    for (const m of ctx.inks) {
      if (m.start > a && m.start < b) cuts.add(m.start)
      if (m.end > a && m.end < b) cuts.add(m.end)
    }
    const points = [...cuts].sort((x, y) => x - y)
    for (let i = 0; i < points.length - 1; i++) piece(points[i], points[i + 1], style)
  }
  const marker = (a, b) => piece(a, Math.min(b, to), faint, false)
  const leaf = (a, b, style) => piece(a, Math.min(b, to), style)

  let cursor = from
  for (const token of tokens) {
    const at = ctx.offsets.get(token)
    if (at === undefined || at < cursor) continue
    if (at >= to) break
    const end = Math.min(at + token.raw.length, to)
    marker(cursor, at)
    switch (token.type) {
      case 'strong':
      case 'em':
      case 'del':
      case 'link': {
        const next =
          token.type === 'strong'
            ? { ...inline, bold: true }
            : token.type === 'em'
              ? { ...inline, italic: true }
              : token.type === 'del'
                ? { ...inline, strike: true }
                : { ...inline, link: token.href }
        out.push(...rawSpans(token.tokens ?? [], at, end, next, ctx))
        break
      }
      case 'codespan': {
        const inner = token.raw.indexOf(token.text)
        const a = inner < 0 ? at : at + inner
        const b = inner < 0 ? end : a + token.text.length
        marker(at, a)
        leaf(a, b, { ...styles.codespan, backgroundColor: docPage.inlineCodeBg })
        marker(b, end)
        break
      }
      case 'text':
      case 'escape': {
        if (token.tokens && token.tokens.length > 0) out.push(...rawSpans(token.tokens, at, end, inline, ctx))
        else leaf(at, end, leafStyle(inline))
        break
      }
      default:
        // Görsel, HTML, satır sonu: ham hâliyle, soluk
        marker(at, end)
    }
    cursor = Math.max(cursor, end)
  }
  marker(cursor, to)
  return out
}

// Görev maddeleri yazıdaki sırayla numaralanır: token ağacında derinlemesine, madde maddeden önce
function indexTasks(tokens, map = new Map()) {
  for (const token of tokens) {
    if (token.type === 'list') {
      for (const item of token.items) {
        if (item.task) map.set(item, map.size)
        indexTasks(item.tokens, map)
      }
    } else if (token.type === 'blockquote') {
      indexTasks(token.tokens, map)
    }
  }
  return map
}

// Yazı parçasının ham yazıdaki yeri (fosforlu kalem katmanı bunlardan ölçer, bkz. HighlightLayer)
function rawAttrs(from, length, exact) {
  if (from === undefined) return null
  return { 'data-raw': from, 'data-len': length, 'data-exact': exact ? '1' : '0' }
}

function leafStyle(inline) {
  const font =
    inline.heading !== null
      ? HEADINGS[inline.heading].font
      : inline.bold && inline.italic
        ? fonts.docBoldItalic
        : inline.bold
          ? fonts.bodyBold
          : inline.italic
            ? fonts.docItalic
            : fonts.docBody
  const decoration = [inline.link && 'underline', inline.strike && 'line-through'].filter(Boolean).join(' ')
  return {
    ...font,
    ...(inline.link ? { color: docPage.link } : null),
    ...(decoration ? { textDecorationLine: decoration } : null),
  }
}

function renderInline(tokens, inline, ctx, key = 'i') {
  if (!tokens) return []
  return tokens.map((token, i) => {
    const k = `${key}-${i}`
    switch (token.type) {
      case 'text':
      case 'escape': {
        if (token.tokens && token.tokens.length > 0) return renderInline(token.tokens, inline, ctx, k)
        const from = ctx.offsets.get(token)
        return (
          <span key={k} style={leafStyle(inline)} {...rawAttrs(from, token.raw.length, token.raw === token.text)}>
            {markedText(token.text, token.raw, from, ctx)}
          </span>
        )
      }
      case 'strong':
        return renderInline(token.tokens, { ...inline, bold: true }, ctx, k)
      case 'em':
        return renderInline(token.tokens, { ...inline, italic: true }, ctx, k)
      case 'del':
        return renderInline(token.tokens, { ...inline, strike: true }, ctx, k)
      case 'codespan': {
        const at = ctx.offsets.get(token)
        const inner = token.raw.indexOf(token.text)
        const from = at === undefined || inner < 0 ? undefined : at + inner
        return (
          <span key={k} style={{ ...styles.codespan, backgroundColor: docPage.inlineCodeBg }} {...rawAttrs(from, token.text.length, true)}>
            {markedText(token.text, token.text, from, ctx)}
          </span>
        )
      }
      case 'br':
        return <br key={k} />
      case 'link': {
        const safe = SAFE_LINK.test(token.href)
        const children = renderInline(token.tokens, { ...inline, link: safe ? token.href : null }, ctx, k)
        return safe ? (
          <a key={k} href={token.href} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
            {children}
          </a>
        ) : (
          <span key={k}>{children}</span>
        )
      }
      case 'image':
        // Satır içinde görsel çizilmez; adı yazılır (blok görseller paragrafta ayrıca çizilir)
        return (
          <span key={k} style={{ ...leafStyle(inline), color: docPage.muted }}>
            {token.text ? `[${token.text}]` : ''}
          </span>
        )
      case 'html':
        // Ham HTML etiketleri yok sayılır; <br> satır sonudur
        return /^<br\s*\/?>$/i.test(token.text.trim()) ? <br key={k} /> : null
      case 'checkbox':
        return null
      default:
        return 'text' in token && typeof token.text === 'string' ? decode(token.text) : null
    }
  })
}

// Bloklar sırayla çizilir. Yalnızca görsellerden oluşan art arda paragraflar yana kayan bir görsel
// şeridi olur; tek görsel tam genişlikte kalır.
function renderBlocks(tokens, ctx, key = 'b') {
  const blocks = tokens.filter((t) => t.type !== 'space' && t.type !== 'def')
  const out = []
  // Boş yazı: yazmaya başlanacak tek birim. Anahtarı ilk bloğunkiyle aynı, yazı paragraf olunca
  // yazma alanı yerinde kalır
  if (blocks.length === 0 && key === 'b' && ctx.unitOf.has(BLANK_BLOCK)) {
    out.push(<BlockText key="b-0" block={BLANK_BLOCK} tokens={[]} inline={PLAIN} ctx={ctx} style={styles.paragraph} />)
  }
  for (let i = 0; i < blocks.length; i++) {
    const k = `${key}-${i}`
    const images = blockImages(blocks[i])
    if (!images) {
      out.push(renderBlock(blocks[i], ctx, k))
      continue
    }
    const run = [...images]
    let next
    while (i + 1 < blocks.length && (next = blockImages(blocks[i + 1]))) {
      run.push(...next)
      i++
    }
    out.push(
      run.length === 1 ? (
        <MdImage key={k} uri={run[0].href} alt={run[0].text} imageOk={ctx.imageOk} />
      ) : (
        <ImageCarousel key={k} images={run} imageOk={ctx.imageOk} />
      ),
    )
  }
  return out
}

function renderBlock(token, ctx, k) {
  switch (token.type) {
    case 'heading': {
      const { level, fontSize, lineHeight, marginTop } = headingMetrics(token.depth)
      return (
        <BlockText
          key={k}
          block={token}
          tokens={token.tokens}
          inline={{ ...PLAIN, heading: level }}
          ctx={ctx}
          header
          wrapperStyle={{ marginTop }}
          style={{ ...styles.heading, ...HEADINGS[level].font, fontSize, lineHeight: `${lineHeight}px`, color: ctx.ink }}
        />
      )
    }
    // Paragraf da başlık gibi doğrudan BlockText'tir: yazarken biri ötekine dönünce yazma alanı yerinde kalır
    case 'paragraph':
      return <BlockText key={k} block={token} tokens={token.tokens} inline={PLAIN} ctx={ctx} style={{ ...styles.paragraph, color: ctx.ink }} />
    case 'text':
      return <BlockText key={k} block={token} tokens={token.tokens ?? [token]} inline={PLAIN} ctx={ctx} style={{ ...styles.paragraph, color: ctx.ink }} />
    case 'code':
      return <CodeBlock key={k} code={token.text} lang={token.lang} />
    case 'blockquote':
      return (
        <div key={k} style={styles.quote}>
          {renderBlocks(token.tokens, { ...ctx, ink: docPage.muted }, k)}
        </div>
      )
    case 'list':
      return <List key={k} list={token} ctx={ctx} k={k} />
    case 'table':
      return <Table key={k} table={token} ctx={ctx} />
    case 'hr':
      return <div key={k} style={styles.hr} />
    case 'html': {
      const text = token.text.trim()
      return text ? (
        <div key={k} style={styles.rawHtml}>
          {text}
        </div>
      ) : null
    }
    default:
      return 'text' in token && typeof token.text === 'string' ? (
        <div key={k} style={{ ...styles.paragraph, color: ctx.ink }}>
          {decode(token.text)}
        </div>
      ) : null
  }
}

// Liste: işaret sütunu (madde, numara ya da görev kutusu) ve maddenin blokları
function List({ list, ctx, k }) {
  const start = typeof list.start === 'number' ? list.start : 1
  return (
    <div style={{ ...styles.list, ...(list.loose ? styles.listLoose : null) }}>
      {list.items.map((item, i) => {
        let marker
        if (item.task) {
          const index = ctx.taskIndex.get(item) ?? -1
          const box = <TaskBox checked={!!item.checked} />
          marker = ctx.onToggleTask ? (
            <button
              type="button"
              data-task
              role="checkbox"
              aria-checked={!!item.checked}
              onClick={() => ctx.onToggleTask?.(index)}
              style={styles.taskButton}
            >
              {box}
            </button>
          ) : (
            box
          )
        } else {
          marker = <span style={styles.marker}>{list.ordered ? `${start + i}.` : '•'}</span>
        }
        const blocks = item.tokens.filter((t) => t.type !== 'checkbox')
        return (
          <div key={`${k}-${i}`} style={styles.item}>
            <div style={{ ...styles.markerCell, ...(list.ordered && !item.task ? styles.markerWide : null) }}>{marker}</div>
            <div style={styles.itemBody}>
              {blocks.length === 0 && ctx.unitOf.has(item) ? (
                // Boş madde: işaretinin ardına yazılır
                <BlockText block={item} tokens={[]} inline={PLAIN} ctx={ctx} style={{ ...styles.paragraph, color: ctx.ink }} />
              ) : (
                renderBlocks(blocks, ctx, `${k}-${i}`)
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function TaskBox({ checked }) {
  return (
    <svg width={16} height={16} style={styles.taskBox} aria-hidden="true">
      <rect
        x={0.75}
        y={0.75}
        width={14.5}
        height={14.5}
        rx={3}
        fill={checked ? docPage.check : 'none'}
        stroke={checked ? docPage.check : docPage.muted}
        strokeWidth={1.5}
      />
      {checked && <path d="M4 8.3 L6.8 11 L12 5.2" stroke="#FFFFFF" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

// GFM tablosu: yana kayar; sütun genişliği o sütundaki en uzun yazıya göre
function Table({ table, ctx }) {
  const rows = [table.header, ...table.rows]
  const widths = table.header.map((_, col) => {
    const longest = Math.max(...rows.map((row) => (row[col]?.text ?? '').length))
    return Math.min(260, Math.max(72, longest * 7.6 + 24))
  })
  return (
    <div style={styles.tableScroll}>
      <div style={styles.table}>
        {rows.map((row, r) => (
          <div key={r} style={{ ...styles.tableRow, ...(r > 0 ? { borderTop: `1px solid ${docPage.rule}` } : null) }}>
            {row.map((cell, c) => (
              <div
                key={c}
                style={{
                  ...styles.tableCell,
                  width: widths[c],
                  ...(c > 0 ? { borderLeft: `1px solid ${docPage.rule}` } : null),
                  ...(r === 0 ? { backgroundColor: docPage.inlineCodeBg } : null),
                }}
              >
                <BlockText
                  block={cell}
                  tokens={cell.tokens}
                  inline={{ ...PLAIN, bold: r === 0 }}
                  ctx={ctx}
                  style={{ ...styles.cellText, color: ctx.ink, textAlign: table.align[c] ?? 'left' }}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// Kod bloğu: koyu kutu, sağ üstte dil etiketi, uzun satırlar yana kayar
function CodeBlock({ code, lang }) {
  const label = (lang ?? '').split(/\s/)[0]
  return (
    <div style={styles.code}>
      {label !== '' && <span style={styles.codeLabel}>{label}</span>}
      <pre style={{ ...styles.codeText, ...(label !== '' ? styles.codeTextLabeled : null) }}>{code.replace(/\n$/, '')}</pre>
    </div>
  )
}

// Yalnızca https görseller; oran korunarak genişliğe sığar
function MdImage({ uri, alt, imageOk = HTTPS_IMAGE }) {
  const [failed, setFailed] = useState(false)
  if (!imageOk(uri) || failed) {
    return alt ? <div style={{ ...styles.paragraph, color: docPage.muted }}>{`[${decode(alt)}]`}</div> : null
  }
  return <img src={uri} alt={decode(alt)} onError={() => setFailed(true)} style={styles.image} loading="lazy" />
}

// Art arda görseller: yana kayan şerit. Kart alanın %82'si genişliğinde, sonraki kartın ucu görünür;
// bırakınca kart yerine oturur. Altta kaçıncı görselde olunduğunu gösteren noktalar.
const CARD_GAP = 10

function ImageCarousel({ images, imageOk }) {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  const [index, setIndex] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const card = Math.round(width * 0.82)
  const step = card + CARD_GAP
  return (
    <div ref={ref}>
      {width > 0 && (
        <div
          className="nb-carousel"
          style={styles.carousel}
          onScroll={(e) => {
            const next = Math.min(images.length - 1, Math.max(0, Math.round(e.currentTarget.scrollLeft / step)))
            setIndex((prev) => (prev === next ? prev : next))
          }}
        >
          {images.map((image, i) => (
            <CarouselCard key={`${i}-${image.href}`} image={image} width={card} imageOk={imageOk} label={`${i + 1}. görsel, ${images.length} görselden`} />
          ))}
        </div>
      )}
      <div style={styles.dots} aria-hidden="true">
        {images.map((image, i) => (
          <div key={`${i}-${image.href}`} style={{ ...styles.dot, backgroundColor: i === index ? docPage.ink : docPage.rule }} />
        ))}
      </div>
    </div>
  )
}

function CarouselCard({ image, width, label, imageOk = HTTPS_IMAGE }) {
  const [failed, setFailed] = useState(false)
  const shown = imageOk(image.href) && !failed
  const alt = decode(image.text)
  return (
    <div style={{ width, flexShrink: 0, scrollSnapAlign: 'start' }}>
      <div style={{ ...styles.card, height: Math.round(width * 0.66) }}>
        {shown ? (
          <img src={image.href} alt={alt ? `${alt} (${label})` : label} onError={() => setFailed(true)} style={styles.cardImage} loading="lazy" />
        ) : (
          <span style={styles.cardMissing}>{alt || 'Görsel açılamadı'}</span>
        )}
      </div>
      {alt !== '' && <div style={styles.cardCaption}>{alt}</div>}
    </div>
  )
}

export function MarkdownView({ value, onToggleTask, highlights = NO_MARKS, inks = NO_MARKS, parsed: given, editor, imageOk }) {
  const rootRef = useRef(null)
  const own = useMemo(() => (given ? null : parseMarkdown(value)), [given, value])
  const parsed = given ?? own
  const { tokens, offsets, unitOf } = parsed
  const taskIndex = useMemo(() => indexTasks(tokens), [tokens])
  const ctx = {
    ink: docPage.ink,
    onToggleTask,
    taskIndex,
    offsets,
    highlights,
    inks,
    source: value,
    unitOf,
    editor,
    imageOk,
  }
  // Fosforlu kalemin boyası yazının arkasında; yazı onun üstünde
  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      {highlights.length > 0 && <HighlightLayer rootRef={rootRef} highlights={highlights} version={value} />}
      <div data-md-root style={styles.root}>{renderBlocks(tokens, ctx)}</div>
    </div>
  )
}

const mdStyles = {
  paragraph: {
    ...fonts.docBody,
    fontSize: SIZE,
    lineHeight: `${docPage.lineHeight}px`,
    color: docPage.ink,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  },
}

const styles = {
  root: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  paragraph: mdStyles.paragraph,
  heading: {
    letterSpacing: -0.2,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
    margin: 0,
  },
  codespan: {
    ...fonts.mono,
    fontSize: SIZE * 0.88,
    borderRadius: 3,
    padding: '0 2px',
  },
  code: {
    position: 'relative',
    borderRadius: 8,
    padding: '12px 14px',
    backgroundColor: docPage.codeBg,
  },
  codeLabel: {
    position: 'absolute',
    top: 6,
    right: 10,
    ...fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: docPage.codeLabel,
  },
  codeText: {
    margin: 0,
    ...fonts.mono,
    fontSize: 13,
    lineHeight: '19px',
    color: docPage.codeInk,
    overflowX: 'auto',
    whiteSpace: 'pre',
  },
  codeTextLabeled: {
    marginTop: 10,
  },
  quote: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    borderLeft: `3px solid ${docPage.quoteBar}`,
    paddingLeft: 12,
  },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 3,
  },
  listLoose: {
    gap: 8,
  },
  item: {
    display: 'flex',
    flexDirection: 'row',
  },
  markerCell: {
    width: 20,
    flexShrink: 0,
  },
  markerWide: {
    width: 26,
  },
  marker: {
    ...fonts.docBody,
    fontSize: SIZE,
    lineHeight: `${docPage.lineHeight}px`,
    color: docPage.muted,
  },
  taskButton: {
    display: 'block',
    margin: 0,
    padding: 0,
    border: 0,
    background: 'transparent',
    cursor: 'pointer',
  },
  taskBox: {
    display: 'block',
    marginTop: (docPage.lineHeight - 16) / 2,
  },
  itemBody: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  hr: {
    height: 2,
    margin: '6px 0',
    backgroundColor: docPage.rule,
  },
  rawHtml: {
    ...fonts.mono,
    fontSize: 12,
    lineHeight: '18px',
    color: docPage.muted,
    whiteSpace: 'pre-wrap',
  },
  tableScroll: {
    overflowX: 'auto',
    maxWidth: '100%',
  },
  table: {
    display: 'inline-block',
    border: `1px solid ${docPage.rule}`,
    borderRadius: 4,
    overflow: 'hidden',
  },
  tableRow: {
    display: 'flex',
    flexDirection: 'row',
  },
  tableCell: {
    padding: '6px 10px',
    flexShrink: 0,
  },
  cellText: {
    ...fonts.docBody,
    fontSize: SIZE * 0.92,
    lineHeight: '20px',
    whiteSpace: 'pre-wrap',
  },
  image: {
    display: 'block',
    width: '100%',
    height: 'auto',
    borderRadius: 4,
  },
  carousel: {
    display: 'flex',
    gap: CARD_GAP,
    overflowX: 'auto',
    scrollSnapType: 'x mandatory',
  },
  card: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 8,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: docPage.inlineCodeBg,
  },
  cardImage: {
    position: 'absolute',
    inset: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },
  cardMissing: {
    padding: '0 16px',
    ...fonts.docBody,
    fontSize: 13,
    lineHeight: '18px',
    textAlign: 'center',
    color: docPage.muted,
  },
  cardCaption: {
    marginTop: 6,
    ...fonts.docBody,
    fontSize: 12,
    lineHeight: '16px',
    color: docPage.muted,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  dots: {
    display: 'flex',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
}
