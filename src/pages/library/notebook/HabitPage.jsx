// Seyir defteri: components/notebook/HabitPage.tsx — ajandanın alışkanlık takibi sayfası: her
// alışkanlık bir satır, altında ayın ya da haftanın günleri kutu kutu. Yapılan günün kutusu
// fosforlu kalemle boyanır.
import { useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from 'react'

import { clearHabits, createHabit, deleteHabit, getHabits, updateHabit } from '../api.js'
import { addDays, dayOfMonth, formatWeekRange, MONTH_NAMES, monthWeekMondays, todayISO, weekOf } from '../isoWeeks.js'
import { monthKey } from '../notebookLayout.js'
import { TornPaperMenu } from '../TornPaperMenu.jsx'
import { colors, fonts, HAND_TAIL, highlighters, notebook } from '../theme.js'
import { HandIcon } from './HandIcon.jsx'
import { PageHeading, PageTopBar } from './PageHeading.jsx'
import { PageSidebar } from './PageSidebar.jsx'
import { Paper } from './Paper.jsx'

const SHORT_DAY_NAMES = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz']
const LEFT = notebook.marginX + 12
const RIGHT = 16
// Aylık sayfada günler iki sıraya bölünür: 1–16 ve 17–31
const MONTH_COLUMNS = 16
const MAX_CELL = 40
const MAX_HABITS = 12

// Sayfanın dönemi, günleri ve kalem rengi. Aylık sayfa takvim ayının günlerini, haftalık sayfa
// haftanın yedi gününü izler. Kalem, takvimde o ayın boyandığı fosforlu kalemdir.
function periodOf(slot) {
  if (slot.kind === 'month-habits') {
    const { year, month } = slot
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate()
    const first = `${monthKey(year, month)}-01`
    const today = weekOf(todayISO())
    return {
      period: monthKey(year, month),
      dates: Array.from({ length: days }, (_, i) => addDays(first, i)),
      columns: MONTH_COLUMNS,
      color: highlighters[(month - 1) % highlighters.length].color,
      heading: {
        title: `${MONTH_NAMES[month - 1]} Alışkanlıkları`,
        meta: `Alışkanlık takibi · ${year}`,
        now: today.year === year && today.month === month ? 'bu ay' : null,
      },
    }
  }
  const week = weekOf(slot.monday)
  const weekNo = monthWeekMondays(week.year, week.month).indexOf(slot.monday) + 1
  return {
    period: slot.monday,
    dates: Array.from({ length: 7 }, (_, i) => addDays(slot.monday, i)),
    columns: 7,
    color: highlighters[(week.month - 1) % highlighters.length].color,
    heading: {
      title: `${weekNo}. Hafta Alışkanlıkları`,
      meta: `Alışkanlık takibi · ${formatWeekRange(slot.monday)} ${week.year}`,
      now: weekOf(todayISO()).monday === slot.monday ? 'bu hafta' : null,
    },
  }
}

function doneSet(habit) {
  return new Set(habit.done ? habit.done.split(',') : [])
}

export function HabitPage({ notebookId, slot, isCurrent, onBack, reading, onReadingChange, filtering, onFilterPress, onCalendarPress, folio, onReady }) {
  const boxRef = useRef(null)
  const [width, setWidth] = useState(0)
  const { period, dates, columns, color, heading } = periodOf(slot)
  const [habits, setHabits] = useState(null)
  const [focusId, setFocusId] = useState(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const today = todayISO()
  const cell = Math.min(MAX_CELL, (width - LEFT - RIGHT) / columns)

  useLayoutEffect(() => {
    const el = boxRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    let cancelled = false
    getHabits(notebookId, period)
      .then((result) => !cancelled && setHabits(result))
      .catch(() => !cancelled && setHabits([]))
    return () => {
      cancelled = true
    }
  }, [notebookId, period])

  const loaded = habits !== null
  const notifyReady = useEffectEvent(() => onReady?.())
  useEffect(() => {
    if (loaded) notifyReady()
  }, [loaded])

  // Sayfa çevrilince ayarlar kapanır, yazı bırakılır
  const [wasCurrent, setWasCurrent] = useState(isCurrent)
  if (wasCurrent !== isCurrent) {
    setWasCurrent(isCurrent)
    if (!isCurrent) {
      setSettingsOpen(false)
      setConfirmClear(false)
    }
  }

  const empty = !habits || habits.length === 0

  function save(habit) {
    setHabits((prev) => prev && prev.map((h) => (h.id === habit.id ? habit : h)))
    updateHabit(habit).catch(() => {})
  }

  async function add() {
    const habit = await createHabit(notebookId, period).catch(() => null)
    if (!habit) return
    setHabits((prev) => [...(prev ?? []), habit])
    setFocusId(habit.id)
    requestAnimationFrame(() => boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' }))
  }

  // Adı silinen alışkanlık satırıyla birlikte kalkar
  function blur(habit) {
    if (habit.name.trim() !== '') return
    setHabits((prev) => prev && prev.filter((h) => h.id !== habit.id))
    deleteHabit(habit.id).catch(() => {})
  }

  function toggle(habit, date) {
    const done = doneSet(habit)
    if (done.has(date)) done.delete(date)
    else done.add(date)
    save({ ...habit, done: [...done].sort().join(',') })
  }

  // Bu ayın (haftanın) bütün alışkanlıkları işaretleriyle birlikte silinir
  function clearPage() {
    setConfirmClear(false)
    setHabits([])
    setFocusId(null)
    clearHabits(notebookId, period).catch(() => {})
  }

  const rows = []
  for (let i = 0; i < dates.length; i += columns) rows.push(dates.slice(i, i + columns))

  return (
    <Paper seed={4_000_000 + period.length * 1000 + dayOfMonth(dates[0]) + dates.length}>
      <PageTopBar onBack={onBack}>
        <HandIcon
          shape="book"
          label={reading ? 'Okuma modunu kapat' : 'Okuma modu'}
          size={28}
          selected={reading}
          fill={reading ? 'rgba(169, 193, 218, 0.6)' : undefined}
          onPress={() => onReadingChange?.(!reading)}
        />
        {onCalendarPress && <HandIcon shape="calendar" label="Takvim" size={28} onPress={onCalendarPress} />}
        {onFilterPress && (
          <HandIcon
            shape="filter"
            label={filtering ? 'Filtreyi değiştir' : 'Sayfaları filtrele'}
            size={28}
            selected={filtering}
            fill={filtering ? 'rgba(224, 138, 138, 0.45)' : undefined}
            onPress={onFilterPress}
          />
        )}
        <HandIcon
          shape="more"
          label="Sayfa ayarları"
          size={28}
          onPress={() => {
            document.activeElement?.blur?.()
            setSettingsOpen(true)
          }}
        />
      </PageTopBar>
      <PageHeading heading={heading} document={false} />

      <div ref={boxRef} className="nb-scroll" style={styles.scroll}>
        <div style={styles.content}>
          {/* Haftalık sayfada gün adları bütün satırların üstünde bir kez yazılır */}
          {slot.kind === 'week-habits' && width > 0 && (
            <div style={styles.dayNames} aria-hidden="true">
              {SHORT_DAY_NAMES.map((name) => (
                <span key={name} style={{ ...styles.dayName, width: cell }}>
                  {name + HAND_TAIL}
                </span>
              ))}
            </div>
          )}

          {width > 0 &&
            habits?.map((habit) => {
              const done = doneSet(habit)
              const count = dates.filter((d) => done.has(d)).length
              return (
                <div key={habit.id} style={styles.habit}>
                  <div style={styles.nameRow}>
                    <input
                      value={habit.name}
                      onChange={(e) => save({ ...habit, name: e.target.value })}
                      onBlur={() => blur(habit)}
                      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                      autoFocus={habit.id === focusId}
                      readOnly={reading}
                      placeholder="Alışkanlık adı"
                      aria-label="Alışkanlık adı"
                      maxLength={40}
                      className="lib-hand-input nb-habit-name"
                      style={styles.name}
                    />
                    <span style={styles.count}>{`${count}/${dates.length}` + HAND_TAIL}</span>
                  </div>
                  {rows.map((row) => (
                    <div key={row[0]} style={styles.cells}>
                      {row.map((date) => (
                        <DayCell
                          key={date}
                          date={date}
                          size={cell}
                          done={done.has(date)}
                          today={date === today}
                          color={color}
                          habitName={habit.name}
                          disabled={reading}
                          onPress={() => toggle(habit, date)}
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )
            })}

          {habits && habits.length === 0 && (
            <div style={styles.hint}>
              {reading
                ? 'Bu sayfada alışkanlık yok' + HAND_TAIL
                : 'Takip etmek istediğin alışkanlıkları ekle; yaptığın günün kutusunu boya' + HAND_TAIL}
            </div>
          )}

          {habits && !reading && habits.length < MAX_HABITS && (
            <button type="button" onClick={add} className="lib-paper-icon" style={styles.add}>
              {'+ Alışkanlık ekle' + HAND_TAIL}
            </button>
          )}

          {folio && <div style={styles.folio}>{`sf. ${folio.number} / ${folio.total}` + HAND_TAIL}</div>}
        </div>
      </div>

      <PageSidebar
        visible={settingsOpen}
        title="Sayfa ayarları"
        subtitle={heading.meta}
        sections={[
          {
            title: 'Sayfa',
            items: [
              {
                label: 'Sayfayı temizle',
                hint: reading ? 'Okuma modunda sayfa değişmez' : empty ? 'Sayfa zaten boş' : 'Bütün alışkanlıklar silinir',
                icon: 'eraser',
                danger: true,
                disabled: reading || empty,
                onPress: () => {
                  setSettingsOpen(false)
                  setConfirmClear(true)
                },
              },
            ],
          },
        ]}
        onClose={() => setSettingsOpen(false)}
      />

      <TornPaperMenu
        visible={confirmClear}
        title="Sayfayı temizle"
        message="Bu sayfadaki bütün alışkanlıklar ve işaretlenen günler silinsin mi? Bu geri alınamaz."
        options={[
          { label: 'Temizle', danger: true, onPress: clearPage },
          { label: 'Vazgeç', onPress: () => setConfirmClear(false) },
        ]}
        onClose={() => setConfirmClear(false)}
      />
    </Paper>
  )
}

// Günün kutusu: içinde ayın günü; yapıldıysa fosforlu kalemle boyanmış
function DayCell({ date, size, done, today, color, habitName, disabled, onPress }) {
  const box = size - 4
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      role="checkbox"
      aria-checked={done}
      aria-label={`${habitName || 'Alışkanlık'}, ayın ${dayOfMonth(date)}. günü`}
      className="lib-paper-icon"
      style={{ ...styles.cell, width: size, height: size }}
    >
      <span
        style={{
          ...styles.box,
          width: box,
          height: box,
          ...(done ? { backgroundColor: color, borderColor: 'rgba(56, 56, 61, 0.35)' } : null),
          ...(today ? styles.boxToday : null),
        }}
      >
        <span
          style={{
            ...styles.dayNo,
            fontSize: Math.max(11, box * 0.48),
            ...(done ? styles.dayNoDone : null),
            ...(today ? styles.dayNoToday : null),
          }}
        >
          {dayOfMonth(date) + HAND_TAIL}
        </span>
      </span>
    </button>
  )
}

const styles = {
  scroll: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  content: {
    paddingTop: 8,
    paddingBottom: 24,
  },
  dayNames: {
    display: 'flex',
    marginLeft: LEFT,
    marginBottom: 2,
  },
  dayName: {
    textAlign: 'center',
    ...fonts.handBold,
    fontSize: 18,
    color: 'rgba(56, 56, 61, 0.6)',
  },
  habit: {
    paddingLeft: LEFT,
    paddingRight: RIGHT,
    paddingBottom: 12,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    minWidth: 0,
    height: notebook.lineHeight + 4,
    margin: 0,
    padding: 0,
    border: 0,
    borderBottom: `1px solid ${notebook.rule}`,
    outline: 'none',
    background: 'transparent',
    ...fonts.handBold,
    fontSize: 24,
    color: notebook.graphite,
  },
  count: {
    ...fonts.hand,
    fontSize: 18,
    color: 'rgba(56, 56, 61, 0.6)',
  },
  cells: {
    display: 'flex',
    marginTop: 4,
  },
  cell: {
    margin: 0,
    padding: 0,
    border: 0,
    background: 'transparent',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
  },
  box: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    borderRadius: 3,
    border: '1px solid rgba(56, 56, 61, 0.28)',
  },
  boxToday: {
    borderWidth: 2,
    borderColor: colors.today,
  },
  dayNo: {
    ...fonts.hand,
    color: 'rgba(56, 56, 61, 0.55)',
  },
  dayNoDone: {
    ...fonts.handBold,
    color: notebook.graphite,
  },
  dayNoToday: {
    color: colors.today,
  },
  hint: {
    paddingLeft: LEFT,
    paddingRight: RIGHT,
    ...fonts.hand,
    fontSize: 21,
    lineHeight: `${notebook.lineHeight}px`,
    color: 'rgba(56, 56, 61, 0.45)',
  },
  add: {
    display: 'block',
    margin: `4px 0 0 ${LEFT - 6}px`,
    padding: '0 6px',
    border: 0,
    borderRadius: 6,
    background: 'transparent',
    cursor: 'pointer',
    ...fonts.handBold,
    fontSize: 24,
    lineHeight: `${notebook.lineHeight}px`,
    color: 'rgba(56, 56, 61, 0.7)',
  },
  folio: {
    marginTop: 20,
    textAlign: 'center',
    ...fonts.hand,
    fontSize: 19,
    color: 'rgba(56, 56, 61, 0.6)',
  },
}
