// Seyir defteri: components/notebook/CalendarPage.tsx — defterin içindeki takvim yaprağı: aylar,
// haftalar ve günler kâğıda elle yazılmış, her ayın haftaları fosforlu kalemle boyanmış. Güne
// tıklayınca o günün, hafta numarasına tıklayınca haftanın hedefler sayfası, ay adına tıklayınca
// (ajandada ayın sayfaları varsa) ayın sayfası açılır.
import { memo, useLayoutEffect, useRef, useState } from 'react'

import { addDays, dayOfMonth, formatDate, formatWeekRange, MONTH_NAMES, monthWeekMondays, parseISODate, todayISO, weekOf } from '../isoWeeks.js'
import { DAY_NAMES } from '../model.js'
import { FIRST_YEAR, LAST_YEAR } from '../notebookLayout.js'
import { colors, fonts, HAND_TAIL, highlighters, notebook } from '../theme.js'
import { HandDrawing, HandIcon } from './HandIcon.jsx'
import { HighlightStroke } from './HighlightStroke.jsx'
import { Paper } from './Paper.jsx'

const SHORT_DAY_NAMES = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']
// Günler kırmızı kenar boşluğunun sağından başlar; hafta numarası kenar boşluğuna yazılır
const LEFT = notebook.marginX + 8
const RIGHT = 14
const ROW = 44

// date: takvim bu tarihin yılından açılır ve ayı görünür; year: ajandanın yılı (yoksa 2000–2099)
export function CalendarPage({ date, year: agendaYear, onClose, onOpenDay, onOpenWeek, onOpenMonth }) {
  const today = todayISO()
  const focus = weekOf(date)
  const firstYear = agendaYear ?? FIRST_YEAR
  const lastYear = agendaYear ?? LAST_YEAR
  const [year, setYear] = useState(Math.min(lastYear, Math.max(firstYear, focus.year)))
  const boxRef = useRef(null)
  const scrollRef = useRef(null)
  const [width, setWidth] = useState(0)
  const weekWidth = Math.max(0, width - LEFT - RIGHT)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Takvimin açıldığı ay görünür olsun; yıl değişince kaydırma baştan başlar
  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll || width === 0) return
    const month = year === focus.year ? scroll.querySelector(`[data-month="${focus.month}"]`) : null
    scroll.scrollTop = month ? Math.max(0, month.offsetTop - 8) : 0
  }, [year, width, focus.year, focus.month])

  return (
    <Paper seed={7_000_000}>
      <div ref={boxRef} style={styles.box}>
        <div style={styles.top}>
          <HandIcon shape="back" label="Sayfaya dön" size={28} onPress={onClose} />
        </div>

        <div style={styles.header}>
          <div style={styles.titleRow}>
            <div style={styles.title}>{year + HAND_TAIL}</div>
            <div style={styles.yearNav}>
              {year > firstYear ? <HandIcon shape="back" label="Önceki yıl" size={26} onPress={() => setYear(year - 1)} /> : <span style={styles.navSpace} />}
              {year < lastYear ? <HandIcon shape="forward" label="Sonraki yıl" size={26} onPress={() => setYear(year + 1)} /> : <span style={styles.navSpace} />}
            </div>
          </div>
          <div style={styles.meta}>
            {(onOpenMonth ? 'Takvim · aya, güne ya da hafta numarasına dokun' : 'Takvim · güne ya da hafta numarasına dokun') + HAND_TAIL}
          </div>
        </div>

        <div ref={scrollRef} className="nb-scroll" style={styles.scroll}>
          {weekWidth > 0 &&
            MONTH_NAMES.map((_, i) => (
              <Month
                key={`${year}-${i}`}
                year={year}
                month={i + 1}
                weekWidth={weekWidth}
                today={today}
                onOpenDay={onOpenDay}
                onOpenWeek={onOpenWeek}
                onOpenMonth={onOpenMonth}
              />
            ))}
        </div>
      </div>
    </Paper>
  )
}

// Haftalar ISO kuralıyla aylara dağıtılır; ayın başına ya da sonuna taşan günler ince yazılır.
// Ayın haftaları aynı renk kalemle boyanır: ilk hafta en açık, son hafta en koyu.
const Month = memo(function Month({ year, month, weekWidth, today, onOpenDay, onOpenWeek, onOpenMonth }) {
  const name = MONTH_NAMES[month - 1]
  const color = highlighters[(month - 1) % highlighters.length].color
  const mondays = monthWeekMondays(year, month)
  const todayMonday = weekOf(today).monday
  const nameRef = useRef(null)
  const [nameWidth, setNameWidth] = useState(0)

  useLayoutEffect(() => {
    if (nameRef.current) setNameWidth(nameRef.current.offsetWidth)
  }, [name])

  return (
    <div data-month={month} style={styles.month}>
      <div style={styles.monthHeader}>
        <button
          ref={nameRef}
          type="button"
          onClick={onOpenMonth ? () => onOpenMonth(year, month) : undefined}
          disabled={!onOpenMonth}
          title={onOpenMonth ? 'Ayın sayfasını aç' : undefined}
          className="lib-paper-icon"
          style={styles.monthNameButton}
        >
          {nameWidth > 0 && (
            <HighlightStroke width={nameWidth + 10} height={24} color={color} strength={0.45} seed={year * 13 + month} style={{ top: 20, left: -5 }} />
          )}
          <span style={styles.monthName}>{name + HAND_TAIL}</span>
        </button>
        <span style={styles.weekCount}>{`${mondays.length} hafta` + HAND_TAIL}</span>
      </div>

      <div style={{ ...styles.dayNames, width: weekWidth }} aria-hidden="true">
        {SHORT_DAY_NAMES.map((short) => (
          <span key={short} style={styles.dayName}>
            {short + HAND_TAIL}
          </span>
        ))}
      </div>

      {mondays.map((monday, w) => {
        const strength = 0.3 + (0.25 * w) / Math.max(1, mondays.length - 1)
        const isCurrentWeek = monday === todayMonday
        return (
          <div key={monday} style={styles.row}>
            <button
              type="button"
              onClick={() => onOpenWeek(monday)}
              aria-label={`${name} ${w + 1}. hafta, ${formatWeekRange(monday)}`}
              title="Haftanın hedefler sayfasını aç"
              aria-current={isCurrentWeek ? 'date' : undefined}
              className="lib-paper-icon"
              style={styles.weekLabel}
            >
              <span style={{ ...styles.weekNo, ...(isCurrentWeek ? styles.current : null) }}>{`${w + 1}.` + HAND_TAIL}</span>
            </button>
            <div style={{ ...styles.week, width: weekWidth }}>
              <HighlightStroke width={weekWidth} height={ROW} color={color} strength={strength} seed={year * 1000 + month * 10 + w} />
              {DAY_NAMES.map((dayName, d) => {
                const day = addDays(monday, d)
                const inMonth = parseISODate(day).getUTCMonth() + 1 === month
                const isToday = day === today
                return (
                  <button
                    type="button"
                    key={day}
                    onClick={() => onOpenDay(day)}
                    aria-label={`${dayName}, ${formatDate(day)}${isToday ? ', bugün' : ''}`}
                    title="Bu günün sayfasını aç"
                    className="lib-paper-icon"
                    style={styles.day}
                  >
                    {isToday && (
                      <span style={styles.ring}>
                        <HandDrawing shape="ring" size={40} color={colors.today} />
                      </span>
                    )}
                    <span style={{ ...styles.dayNo, ...(!inMonth ? styles.dayNoOutside : null), ...(isToday ? styles.current : null) }}>
                      {dayOfMonth(day) + HAND_TAIL}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
})

const plain = {
  margin: 0,
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
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
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    margin: '-6px 0',
    ...fonts.handBold,
    fontSize: 46,
    lineHeight: '62px',
    color: 'rgba(56, 56, 61, 0.9)',
  },
  yearNav: {
    display: 'flex',
    gap: 16,
  },
  navSpace: {
    width: 30,
  },
  meta: {
    ...fonts.hand,
    fontSize: 19,
    color: 'rgba(56, 56, 61, 0.6)',
  },
  scroll: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    paddingBottom: 24,
  },
  month: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    paddingTop: 18,
  },
  monthHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingLeft: LEFT,
    paddingRight: RIGHT + 6,
  },
  monthNameButton: {
    ...plain,
    position: 'relative',
    borderRadius: 8,
  },
  monthName: {
    position: 'relative',
    ...fonts.handBold,
    fontSize: 36,
    lineHeight: '46px',
    color: notebook.graphite,
  },
  weekCount: {
    ...fonts.hand,
    fontSize: 18,
    color: 'rgba(56, 56, 61, 0.6)',
  },
  dayNames: {
    display: 'flex',
    marginLeft: LEFT,
  },
  dayName: {
    flex: 1,
    textAlign: 'center',
    ...fonts.handBold,
    fontSize: 18,
    color: 'rgba(56, 56, 61, 0.6)',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
  },
  // Hafta numarası kenar boşluğuna yazılır
  weekLabel: {
    ...plain,
    width: LEFT,
    height: ROW,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  weekNo: {
    ...fonts.handBold,
    fontSize: 20,
    color: 'rgba(56, 56, 61, 0.6)',
  },
  week: {
    position: 'relative',
    display: 'flex',
    height: ROW,
  },
  day: {
    ...plain,
    position: 'relative',
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  ring: {
    position: 'absolute',
    pointerEvents: 'none',
    display: 'flex',
  },
  dayNo: {
    position: 'relative',
    ...fonts.handBold,
    fontSize: 23,
    color: notebook.graphite,
  },
  // Ayın başına ya da sonuna taşan, komşu aya ait günler
  dayNoOutside: {
    ...fonts.hand,
    color: 'rgba(56, 56, 61, 0.45)',
  },
  current: {
    color: colors.today,
  },
}
