// Seyir defteri: components/notebook/PageIndex.tsx — defterin sayfa listesi: görünen sayfanın üstüne
// soldan kapanan bir yaprak. Sayfa numaraları kâğıda elle yazılmış, yazılı sayfalar fosforlu kalemle
// boyanmış; numaraya tıklayınca o sayfa açılır. Üstteki satıra yazılan, sayfaların notlarında aranır.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import { getPageTexts, getPageTitles } from '../api.js'
import { colors, fonts, HAND_TAIL, highlighters, notebook } from '../theme.js'
import { HandDrawing, HandIcon } from './HandIcon.jsx'
import { HighlightStroke } from './HighlightStroke.jsx'
import { plainText } from './noteLists.js'
import { Paper } from './Paper.jsx'

const LEFT = notebook.marginX + 8
const RIGHT = 14
const COLUMNS = 5
const ROW = 50
// Bulunan yerin iki yanında gösterilen yazı
const CONTEXT = 28

function lower(text) {
  return text.toLocaleLowerCase('tr')
}

export function PageIndex({ notebookId, pages, current, onClose, onOpenPage }) {
  const boxRef = useRef(null)
  const [width, setWidth] = useState(0)
  // Sayfa numarası → sayfadaki notların yazısı / sayfaya yazılan başlık
  const [texts, setTexts] = useState(null)
  const [titles, setTitles] = useState(new Map())
  const [query, setQuery] = useState('')
  const cellWidth = (width - LEFT - RIGHT) / COLUMNS

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    getPageTitles(notebookId).then((map) => !cancelled && setTitles(map)).catch(() => {})
    getPageTexts(notebookId)
      .then((rows) => {
        if (cancelled) return
        const map = new Map()
        for (const row of rows) {
          const text = plainText(row.content)
          map.set(row.ref, map.has(row.ref) ? `${map.get(row.ref)} ${text}` : text)
        }
        setTexts(map)
      })
      .catch(() => !cancelled && setTexts(new Map()))
    return () => {
      cancelled = true
    }
  }, [notebookId])

  const search = query.trim()
  const matches =
    search && texts
      ? [...new Set([...texts.keys(), ...titles.keys()])]
          .sort((a, b) => a - b)
          .map((number) => {
            const text = texts.get(number) ?? ''
            const title = titles.get(number) ?? ''
            return { number, title, text, at: lower(text).indexOf(lower(search)), inTitle: lower(title).includes(lower(search)) }
          })
          .filter((m) => m.at !== -1 || m.inTitle)
      : null

  const numbers = Array.from({ length: pages }, (_, i) => i + 1)
  const rows = []
  for (let i = 0; i < numbers.length; i += COLUMNS) rows.push(numbers.slice(i, i + COLUMNS))

  return (
    <Paper seed={7_100_000}>
      <div ref={boxRef} style={styles.box}>
        <div style={styles.top}>
          <HandIcon shape="back" label="Sayfaya dön" size={28} onPress={onClose} />
        </div>

        <div style={styles.header}>
          <div style={styles.title}>{'Sayfalar' + HAND_TAIL}</div>
          <div style={styles.meta}>{`${pages} sayfa · ${texts?.size ?? 0} yazılı · numaraya dokun` + HAND_TAIL}</div>
        </div>

        <div style={styles.searchRow}>
          <HandDrawing shape="search" size={26} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Sayfalarda ara"
            aria-label="Sayfalarda ara"
            className="lib-hand-input"
            style={styles.searchInput}
            autoFocus
          />
          {query !== '' && <HandIcon shape="close" label="Aramayı temizle" size={22} onPress={() => setQuery('')} />}
        </div>

        <div className="nb-scroll" style={styles.list}>
          {matches ? (
            matches.length === 0 ? (
              <div style={styles.empty}>{'Hiçbir sayfada bulunamadı' + HAND_TAIL}</div>
            ) : (
              matches.map((m) => (
                <SearchResult
                  key={m.number}
                  number={m.number}
                  title={m.title}
                  text={m.text}
                  at={m.at}
                  length={search.length}
                  onPress={() => onOpenPage(m.number)}
                />
              ))
            )
          ) : (
            width > 0 &&
            rows.map((row, r) => (
              <div key={row[0]} style={styles.row}>
                {row.map((number) => (
                  <PageNumber
                    key={number}
                    number={number}
                    width={cellWidth}
                    written={texts?.has(number) ?? false}
                    // Her on sayfa başka renk kalemle boyanır
                    color={highlighters[Math.floor(r / 2) % highlighters.length].color}
                    current={number === current}
                    onPress={() => onOpenPage(number)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </Paper>
  )
}

function PageNumber({ number, width, written, color, current, onPress }) {
  return (
    <button
      type="button"
      onClick={onPress}
      aria-label={`Sayfa ${number}${written ? ', yazılı' : ', boş'}${current ? ', açık olan' : ''}`}
      className="lib-paper-icon"
      style={{ ...styles.number, width }}
    >
      {written && (
        <HighlightStroke width={width - 12} height={30} color={color} strength={0.45} seed={number * 31} style={{ top: 12, left: 6 }} />
      )}
      {current && (
        <span style={styles.ring}>
          <HandDrawing shape="ring" size={44} color={colors.today} />
        </span>
      )}
      <span style={{ ...styles.numberText, ...(!written ? styles.numberEmpty : null), ...(current ? { color: colors.today } : null) }}>
        {number + HAND_TAIL}
      </span>
    </button>
  )
}

// Bulunan sayfa: numarası, başlığı ve aranan yerin çevresindeki yazı, bulunan kısım kalın
function SearchResult({ number, title, text, at, length, onPress }) {
  const found = at !== -1
  const start = found ? Math.max(0, at - CONTEXT) : 0
  const end = found ? Math.min(text.length, at + length + CONTEXT) : Math.min(text.length, CONTEXT * 2)
  return (
    <button type="button" onClick={onPress} className="lib-paper-icon" style={styles.result}>
      <span style={styles.resultTitle}>{(title ? `Sayfa ${number} · ${title}` : `Sayfa ${number}`) + HAND_TAIL}</span>
      {text !== '' && (
        <span style={styles.snippet}>
          {start > 0 ? '…' : ''}
          {found ? (
            <>
              {text.slice(start, at)}
              <b style={styles.snippetMatch}>{text.slice(at, at + length)}</b>
              {text.slice(at + length, end)}
            </>
          ) : (
            text.slice(start, end)
          )}
          {end < text.length ? '…' : ''}
        </span>
      )}
    </button>
  )
}

const styles = {
  box: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  top: {
    display: 'flex',
    padding: '4px 10px 0',
  },
  header: {
    padding: `0 20px 6px ${notebook.marginX + 12}px`,
  },
  title: {
    ...fonts.handBold,
    fontSize: 46,
    lineHeight: '62px',
    margin: '-6px 0',
    color: 'rgba(56, 56, 61, 0.9)',
  },
  meta: {
    ...fonts.hand,
    fontSize: 19,
    color: 'rgba(56, 56, 61, 0.6)',
  },
  searchRow: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginLeft: notebook.marginX + 6,
    marginRight: 20,
    borderBottom: `1px solid ${notebook.rule}`,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    height: notebook.lineHeight + 8,
    margin: 0,
    padding: 0,
    border: 0,
    outline: 'none',
    background: 'transparent',
    ...fonts.handBold,
    fontSize: 24,
    color: notebook.graphite,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '10px 0 24px',
  },
  row: {
    display: 'flex',
    flexDirection: 'row',
    marginLeft: LEFT,
  },
  number: {
    position: 'relative',
    height: ROW,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: 0,
    padding: 0,
    border: 0,
    borderRadius: 8,
    background: 'transparent',
    cursor: 'pointer',
  },
  ring: {
    position: 'absolute',
    pointerEvents: 'none',
  },
  numberText: {
    position: 'relative',
    ...fonts.handBold,
    fontSize: 26,
    color: notebook.graphite,
  },
  numberEmpty: {
    ...fonts.hand,
    color: 'rgba(56, 56, 61, 0.5)',
  },
  empty: {
    paddingLeft: notebook.marginX + 12,
    ...fonts.hand,
    fontSize: 21,
    color: 'rgba(56, 56, 61, 0.5)',
  },
  result: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    margin: 0,
    padding: `6px 20px 6px ${notebook.marginX + 12}px`,
    border: 0,
    borderBottom: `1px solid ${notebook.rule}`,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
  },
  resultTitle: {
    ...fonts.handBold,
    fontSize: 26,
    color: notebook.graphite,
  },
  snippet: {
    ...fonts.hand,
    fontSize: 20,
    lineHeight: '24px',
    color: 'rgba(56, 56, 61, 0.75)',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  },
  snippetMatch: {
    ...fonts.handBold,
    color: notebook.graphite,
  },
}
