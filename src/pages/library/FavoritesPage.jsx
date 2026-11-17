// Seyir defteri: app/favorites.tsx — Ayraçlar: defterlerde ayraç konan sayfalar, en son konan başta.
// Karta tıklayınca defter o sayfadan açılır; sağdaki ayraç kaldırır.
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import './library.css'
import { getFavorites, removeFavorite } from './api.js'
import { formatDate, formatWeekRange } from './isoWeeks.js'
import { monthOfRef, sheetHeading, slotKey } from './notebookLayout.js'
import { BottomNav } from './chrome.jsx'
import { HandDrawing, HandIcon } from './notebook/HandIcon.jsx'
import { plainText } from './notebook/noteLists.js'
import { bookColorOf, colors, fonts, HAND_TAIL, notebook, notebookFills, type } from './theme.js'

// Sayfanın başlığı ve altındaki satır; sayfanın üstündekiyle aynı
function headingOf(favorite) {
  const range = () => `${favorite.monday ? formatWeekRange(favorite.monday) : ''} ${favorite.year ?? ''}`.trim()
  switch (favorite.kind) {
    case 'day':
      return { title: favorite.day_name ?? '', meta: `${favorite.date ? formatDate(favorite.date) : ''} · ${favorite.week_no}. Hafta` }
    case 'goals':
      return { title: `${favorite.week_no}. Hafta`, meta: `Hedefler · ${range()}` }
    case 'review':
      return { title: `${favorite.week_no}. Hafta Değerlendirme`, meta: range() }
    case 'month-goals':
    case 'month-review':
      return sheetHeading({ kind: favorite.kind, ...monthOfRef(favorite.page_id) })
    default: {
      // Başlık yazılmamış sayfa kartta numarasıyla anılır
      const heading = sheetHeading({ kind: 'page', number: favorite.page_id }, favorite.page_title ?? '')
      return heading.title ? heading : { title: `Sayfa ${favorite.page_id}`, meta: 'Not defteri' }
    }
  }
}

// Defterin sayfa anahtarı (bkz. notebookLayout)
function pageKeyOf(favorite) {
  switch (favorite.kind) {
    case 'day':
      return favorite.date
    case 'goals':
    case 'review':
      return slotKey({ kind: favorite.kind, monday: favorite.monday })
    case 'month-goals':
    case 'month-review':
      return slotKey({ kind: favorite.kind, ...monthOfRef(favorite.page_id) })
    default:
      return slotKey({ kind: 'page', number: favorite.page_id })
  }
}

// İlk notun yazısı tek satırda; ekler ve yapılacak kutuları atlanır
function previewOf(content) {
  return (content && plainText(content)) || null
}

export default function FavoritesPage() {
  const navigate = useNavigate()
  const scrollRef = useRef(null)
  const [favorites, setFavorites] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getFavorites()
      .then((list) => !cancelled && setFavorites(list))
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
    }
  }, [])

  function open(favorite) {
    navigate(`/notebook?id=${favorite.notebook_id}&date=${encodeURIComponent(pageKeyOf(favorite))}`)
  }

  function remove(favorite) {
    setFavorites((prev) => prev && prev.filter((f) => f.id !== favorite.id))
    removeFavorite(favorite.id).catch(() => {})
  }

  return (
    <div className="lib-root">
      <div className="lib-app" style={styles.safe}>
        <header style={styles.header}>
          <h1 style={styles.title}>Ayraçlar</h1>
        </header>
        <div style={styles.desk}>
          {error ? (
            <div style={styles.empty} role="alert">
              <div style={styles.emptyTitle}>{'Ayraçlar açılamadı' + HAND_TAIL}</div>
              <div style={styles.emptyHint}>{error}</div>
            </div>
          ) : favorites?.length === 0 ? (
            <div style={styles.empty}>
              <HandDrawing shape="bookmark" size={72} stroke={2.6} />
              <div style={styles.emptyTitle}>{'Henüz ayraç konmadı' + HAND_TAIL}</div>
              <div style={styles.emptyHint}>Defterde bir sayfanın sağ üstündeki ayraca dokununca o sayfa burada görünür.</div>
            </div>
          ) : (
            <div ref={scrollRef} className="lib-scroll-y" style={styles.scroll}>
              <div style={styles.list}>
                {favorites?.map((favorite) => (
                  <FavoriteCard key={favorite.id} favorite={favorite} onPress={() => open(favorite)} onRemove={() => remove(favorite)} />
                ))}
              </div>
            </div>
          )}
        </div>
        <BottomNav active="favorites" onReselect={() => scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })} />
      </div>
    </div>
  )
}

function FavoriteCard({ favorite, onPress, onRemove }) {
  const { title, meta } = headingOf(favorite)
  const preview = previewOf(favorite.preview)
  const cover = bookColorOf(favorite.notebook_color)
  return (
    <div style={styles.card}>
      {/* Kartın kenarında defterin kapak rengi ve bandı */}
      <div style={{ ...styles.spine, backgroundColor: cover.cover }}>
        <div style={{ ...styles.spineBand, backgroundColor: cover.band }} />
      </div>
      <button
        type="button"
        onClick={onPress}
        aria-label={`${favorite.notebook_title}, ${title}, ${meta}`}
        title="Defteri bu sayfadan aç"
        className="lib-favorite"
        style={styles.body}
      >
        <span style={styles.notebookTitle}>{favorite.notebook_title}</span>
        <span style={styles.pageTitle}>{title + HAND_TAIL}</span>
        <span style={styles.meta}>{meta + HAND_TAIL}</span>
        {preview && <span style={styles.preview}>{preview + HAND_TAIL}</span>}
      </button>
      <div style={styles.bookmark}>
        <HandIcon shape="bookmark" label="Ayracı kaldır" size={28} selected fill={notebookFills.bookmarkFill} onPress={onRemove} />
      </div>
    </div>
  )
}

const styles = {
  safe: {
    backgroundColor: colors.ink,
  },
  header: {
    height: 64,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    margin: 0,
    ...fonts.displayBold,
    fontSize: type.title,
    color: colors.onInk,
  },
  desk: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    backgroundColor: colors.paper,
  },
  scroll: {
    position: 'absolute',
    inset: 0,
    overflowY: 'auto',
  },
  // Geniş ekranda kartlar okunur bir sütunda
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
    padding: 16,
    maxWidth: 720,
    margin: '0 auto',
  },
  card: {
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
    borderRadius: 10,
    border: `1px solid ${colors.line}`,
    backgroundColor: notebook.paper,
    boxShadow: '0px 2px 6px rgba(20, 33, 61, 0.12)',
  },
  spine: {
    width: 14,
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'center',
  },
  spineBand: {
    width: 3,
  },
  body: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    margin: 0,
    padding: '10px 4px 10px 14px',
    border: 0,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
  },
  notebookTitle: {
    ...fonts.bodyBold,
    fontSize: type.caption,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  pageTitle: {
    maxWidth: '100%',
    ...fonts.handBold,
    fontSize: 32,
    lineHeight: '40px',
    color: 'rgba(56, 56, 61, 0.9)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  meta: {
    ...fonts.hand,
    fontSize: 17,
    color: 'rgba(56, 56, 61, 0.6)',
  },
  preview: {
    marginTop: 4,
    ...fonts.hand,
    fontSize: 20,
    lineHeight: '24px',
    color: 'rgba(56, 56, 61, 0.8)',
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
  },
  bookmark: {
    paddingTop: 12,
    paddingRight: 10,
  },
  empty: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    padding: '0 40px',
    textAlign: 'center',
  },
  emptyTitle: {
    ...fonts.handBold,
    fontSize: 30,
    color: 'rgba(56, 56, 61, 0.8)',
  },
  emptyHint: {
    ...fonts.bodyThin,
    fontSize: type.body,
    lineHeight: '22px',
    color: colors.inkSoft,
  },
}
