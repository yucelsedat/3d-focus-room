// Seyir defteri: app/calendar.tsx + components/NavBar.tsx — Takvim: yılın on iki ayı bir ızgarada,
// her ayın içinde haftaları ve günleri. Haftalar ISO kuralıyla aylara dağıtılır, böylece her gün
// yılda bir kez görünür; ayın başına ya da sonuna taşan günler ince yazılır. Bir haftanın günleri
// aynı tonu paylaşır. Güne tıklamak ajandayı o günün sayfasından, hafta numarasına tıklamak
// haftanın hedefler sayfasından açar. Dar ekranda aylar alt alta, geniş ekranda yan yana dizilir.
import { memo, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import './library.css'
import { BottomNav } from './chrome.jsx'
import { Icon } from './icons.jsx'
import { addDays, dayOfMonth, formatDate, formatWeekRange, MONTH_NAMES, monthWeekMondays, parseISODate, todayISO, weekOf } from './isoWeeks.js'
import { DAY_NAMES } from './model.js'
import { FIRST_YEAR, LAST_YEAR } from './notebookLayout.js'
import { getLastNotebook } from './state.js'
import { colors, fonts, monthColors, type, weekTint } from './theme.js'

// Bir ay kartının en dar hali: yedi gün rahat tıklanacak genişlikte kalsın
const MIN_CARD_WIDTH = 340
const GAP = 12
const SHORT_DAY_NAMES = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']

export default function CalendarScreen() {
  const navigate = useNavigate()
  const today = todayISO()
  const todayWeek = weekOf(today)
  const [year, setYear] = useState(todayWeek.year)
  const scrollRef = useRef(null)
  const [width, setWidth] = useState(0)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const columns = Math.max(1, Math.floor((width - GAP) / (MIN_CARD_WIDTH + GAP)))
  const cardWidth = (width - GAP * 2 - GAP * (columns - 1)) / columns

  // Bu yıl açılınca bugünün ayı görünür olsun; yıl değişince kaydırma baştan başlar
  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll || width === 0) return
    const card = year === todayWeek.year ? scroll.querySelector(`[data-month="${todayWeek.month}"]`) : null
    scroll.scrollTop = card ? Math.max(0, card.offsetTop - GAP) : 0
  }, [year, width, todayWeek.year, todayWeek.month])

  // Gün en son açılan ajandada (yoksa raftaki ilk ajandada) açılır; ajanda yoksa oluşturma ekranı
  async function openDay(date) {
    const notebook = await getLastNotebook('agenda').catch(() => null)
    if (notebook) navigate(`/notebook?id=${notebook.id}&date=${encodeURIComponent(date)}`)
    else navigate('/new-notebook')
  }

  const openWeek = (monday) => openDay(`${monday}:goals`)

  return (
    <div className="lib-root">
      <div className="lib-app" style={styles.safe}>
        <header style={styles.bar}>
          <div style={styles.side} />
          <div style={styles.center}>
            <NavButton icon="chevron-back" label="Önceki yıl" disabled={year <= FIRST_YEAR} onPress={() => setYear(year - 1)} />
            <div style={styles.titleWrap}>
              <div style={styles.subtitle}>Takvim</div>
              <div style={styles.titleRow}>
                {year === todayWeek.year && <span style={styles.activeDot} aria-label="Bugün" />}
                <h1 style={styles.title}>{year}</h1>
              </div>
            </div>
            <NavButton icon="chevron-forward" label="Sonraki yıl" disabled={year >= LAST_YEAR} onPress={() => setYear(year + 1)} />
          </div>
          <div style={styles.side} />
        </header>

        <div ref={scrollRef} className="lib-scroll-y" style={styles.scroll}>
          <div style={styles.grid}>
            {width > 0 &&
              MONTH_NAMES.map((_, i) => {
                const month = i + 1
                const current = year === todayWeek.year && month === todayWeek.month
                return (
                  <MonthCard
                    key={`${year}-${month}`}
                    year={year}
                    month={month}
                    width={cardWidth}
                    today={current ? today : null}
                    onOpenDay={openDay}
                    onOpenWeek={openWeek}
                  />
                )
              })}
          </div>
        </div>

        <BottomNav
          active="calendar"
          onReselect={() => {
            if (year === todayWeek.year) scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
            else setYear(todayWeek.year)
          }}
        />
      </div>
    </div>
  )
}

function NavButton({ icon, label, disabled, onPress }) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="lib-press"
      style={{ ...styles.iconButton, ...(disabled ? styles.iconDisabled : null) }}
    >
      <Icon name={icon} size={24} color={colors.onInk} />
    </button>
  )
}

// today yalnızca bugünün ayına verilir; diğer aylar yıl içinde yeniden çizilmez
const MonthCard = memo(function MonthCard({ year, month, width, today, onOpenDay, onOpenWeek }) {
  const name = MONTH_NAMES[month - 1]
  const color = monthColors[month - 1]
  const mondays = monthWeekMondays(year, month)

  return (
    <section data-month={month} style={{ ...styles.card, width }} aria-label={`${name} ${year}`}>
      <div style={styles.header}>
        <span style={{ ...styles.swatch, backgroundColor: color.tab }} />
        <h2 style={styles.monthName}>{name}</h2>
        <span style={styles.weekCount}>{mondays.length} hafta</span>
      </div>

      <div style={styles.row} aria-hidden="true">
        <span style={styles.weekLabelSpace} />
        <div style={styles.dayNames}>
          {SHORT_DAY_NAMES.map((short) => (
            <span key={short} style={styles.dayName}>
              {short}
            </span>
          ))}
        </div>
      </div>

      {mondays.map((monday, w) => {
        const tint = weekTint(month, w, mondays.length)
        const isCurrentWeek = today !== null && weekOf(today).monday === monday
        return (
          <div key={monday} style={styles.row}>
            <button
              type="button"
              onClick={() => onOpenWeek(monday)}
              aria-label={`${name} ${w + 1}. hafta, ${formatWeekRange(monday)}`}
              aria-current={isCurrentWeek ? 'week' : undefined}
              title="Defteri haftanın hedefler sayfasından aç"
              className="lib-cal-cell"
              style={{ ...styles.weekLabel, backgroundColor: isCurrentWeek ? colors.today : color.tab }}
            >
              <span style={{ ...styles.weekNo, color: isCurrentWeek ? colors.onInk : color.text }}>{w + 1}</span>
            </button>
            <div style={{ ...styles.week, backgroundColor: tint.fill }}>
              {DAY_NAMES.map((dayName, d) => {
                const date = addDays(monday, d)
                const inMonth = parseISODate(date).getUTCMonth() + 1 === month
                const isToday = date === today
                return (
                  <button
                    type="button"
                    key={date}
                    onClick={() => onOpenDay(date)}
                    aria-label={`${dayName}, ${formatDate(date)}${isToday ? ', bugün' : ''}`}
                    aria-current={isToday ? 'date' : undefined}
                    title="Defteri bu günün sayfasından aç"
                    className="lib-cal-cell"
                    style={{ ...styles.day, ...(isToday ? styles.today : null) }}
                  >
                    <span style={{ ...styles.dayNo, color: isToday ? colors.onInk : tint.text, ...(!inMonth ? styles.dayNoOutside : null) }}>
                      {dayOfMonth(date)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </section>
  )
})

const plain = {
  margin: 0,
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  font: 'inherit',
}

const styles = {
  safe: {
    backgroundColor: colors.ink,
  },
  bar: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    padding: '10px 8px',
    backgroundColor: colors.ink,
  },
  side: {
    width: 44,
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 520,
    margin: '0 auto',
  },
  titleWrap: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  subtitle: {
    ...fonts.bodyThin,
    fontSize: type.caption,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: colors.onInk,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  activeDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    boxSizing: 'border-box',
    backgroundColor: colors.today,
    border: `2px solid ${colors.onInk}`,
  },
  title: {
    margin: 0,
    ...fonts.displayBold,
    fontSize: type.title,
    lineHeight: 1.3,
    color: colors.onInk,
  },
  iconButton: {
    ...plain,
    width: 44,
    height: 44,
    borderRadius: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconDisabled: {
    opacity: 0.25,
    cursor: 'default',
  },
  scroll: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    backgroundColor: colors.paper,
  },
  grid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: GAP,
    padding: GAP,
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: 12,
    borderRadius: 16,
    border: `1px solid ${colors.line}`,
    backgroundColor: colors.card,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  swatch: {
    width: 6,
    height: 26,
    borderRadius: 3,
  },
  monthName: {
    flex: 1,
    margin: 0,
    ...fonts.displayBold,
    fontSize: type.title,
    color: colors.ink,
  },
  weekCount: {
    ...fonts.bodyThin,
    fontSize: type.caption,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: colors.inkSoft,
  },
  row: {
    display: 'flex',
    gap: 6,
  },
  weekLabelSpace: {
    width: 30,
    flexShrink: 0,
  },
  dayNames: {
    flex: 1,
    display: 'flex',
  },
  dayName: {
    flex: 1,
    textAlign: 'center',
    ...fonts.bodyBold,
    fontSize: type.caption,
    letterSpacing: 0.5,
    color: colors.inkSoft,
  },
  // Hafta numarası: ayın renginde küçük bir sekme
  weekLabel: {
    ...plain,
    width: 30,
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  weekNo: {
    ...fonts.bodyBold,
    fontSize: type.caption,
  },
  // Haftanın yedi günü tek bir renkli şerit
  week: {
    flex: 1,
    display: 'flex',
    padding: 2,
    borderRadius: 10,
  },
  day: {
    ...plain,
    flex: 1,
    minWidth: 0,
    height: 46,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    boxSizing: 'border-box',
  },
  today: {
    backgroundColor: colors.today,
    border: `2px solid ${colors.card}`,
  },
  dayNo: {
    ...fonts.bodyBold,
    fontSize: type.body,
  },
  // Ayın başına ya da sonuna taşan, komşu aya ait günler
  dayNoOutside: {
    ...fonts.bodyThin,
  },
}
