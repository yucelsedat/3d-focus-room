// Seyir defteri: components/notebook/BottomBar.tsx + TimeMenu.tsx — not defterinin (ve ajandanın)
// alt çubuğu ve saat ayarı. Çubuk: kalem rengi, fosforlu kalem, sesle yazma, bloğa saat, saati
// ayarla, yapılacak satırı, numaralı liste, ek. Basınca yazının odağı ve seçimi gitmez.
import { useRef, useState } from 'react'

import { TornPaperMenu } from '../TornPaperMenu.jsx'
import { colors, fonts, HAND_TAIL, highlightFill, highlighterOf, inkOf, notebook } from '../theme.js'
import { BAR_HEIGHT } from './DocumentBar.jsx'
import { HandIcon } from './HandIcon.jsx'

// Üst kenarda elle çekilmiş ince çizgi
export function BarRule() {
  return (
    <svg style={styles.rule} width="100%" height={6} viewBox="0 0 400 6" preserveAspectRatio="none" aria-hidden="true">
      <path d="M6 3.2 Q120 1.8 220 3.4 T394 2.6" stroke={notebook.graphite} strokeWidth={1.4} strokeLinecap="round" fill="none" opacity={0.55} vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

// Düğmeye basınca yazının odağı yerinde kalsın
function Keep({ children }) {
  return (
    <span style={styles.keep} onMouseDown={(e) => e.preventDefault()}>
      {children}
    </span>
  )
}

export function BottomBar({ listening, pen, onSwatchPress, onHighlighterPress, onMicPress, onClockPress, onClockEditPress, onCheckPress, onNumberPress, onClipPress, notice }) {
  return (
    <div style={styles.bar}>
      <BarRule />
      {notice !== null && notice !== undefined && (
        <div style={styles.notice} role="status">
          <span style={styles.noticeText}>{notice}</span>
        </div>
      )}
      <div className="nb-tool-row" style={styles.row}>
        <Keep>
          <HandIcon shape="swatch" label="Kalem rengi" onPress={onSwatchPress} size={30} fill={pen.active ? highlighterOf(pen.color).color : inkOf(pen.ink).color} />
        </Keep>
        <Keep>
          <HandIcon
            shape="highlighter"
            label={pen.active ? 'Fosforlu kalemi bırak' : 'Fosforlu kalem'}
            onPress={onHighlighterPress}
            size={30}
            selected={pen.active}
            fill={pen.active ? highlightFill(pen.color, 0.8) : undefined}
          />
        </Keep>
        <Keep>
          {/* Mikrofon dinlerken kırmızı çizilir, arkasında halka atar */}
          <span style={styles.micWrap}>
            {listening && <span className="nb-mic-halo" style={styles.halo} />}
            <HandIcon shape="mic" label={listening ? 'Dinlemeyi durdur' : 'Sesle yaz'} onPress={onMicPress} size={30} color={listening ? colors.accent : undefined} />
          </span>
        </Keep>
        <Keep>
          <HandIcon shape="clock" label="Bloğa saat koy" onPress={onClockPress} size={30} />
        </Keep>
        <Keep>
          <HandIcon shape="clockEdit" label="Saati ayarla" onPress={onClockEditPress} size={30} />
        </Keep>
        <Keep>
          <HandIcon shape="checkbox" label="Yapılacak satırı" onPress={onCheckPress} size={30} />
        </Keep>
        <Keep>
          <HandIcon shape="numbered" label="Numaralı liste" onPress={onNumberPress} size={30} />
        </Keep>
        <Keep>
          <HandIcon shape="clip" label="Ek ekle" onPress={onClipPress} size={30} />
        </Keep>
      </div>
    </div>
  )
}

const DIGIT_SIZE = 56
// Basılı tutulunca ilk tekrar biraz bekler, sonra hızlanır
const HOLD_DELAY = 350
const HOLD_STEP = 70

function initialValue(time) {
  const match = time && /^(\d{1,2}):(\d{2})$/.exec(time.trim())
  if (match && Number(match[1]) < 24 && Number(match[2]) < 60) return { hours: Number(match[1]), minutes: Number(match[2]) }
  const now = new Date()
  return { hours: now.getHours(), minutes: now.getMinutes() }
}

const pad = (n) => String(n).padStart(2, '0')

// Saati elle ayarlamak: yırtık kâğıtta büyük el yazısıyla saat ve dakika, üstlerinde ve altlarında
// birer ok. Aşağı ok saati ileri, yukarı ok geri alır; ok basılı tutulursa sayılar akar. Rakamlara
// tıklayınca klavyeyle de yazılır. Kâğıdın dışına tıklayınca (ya da Escape) kapanır, saat yazılır.
export function TimeMenu({ visible, time, onClose }) {
  const [value, setValue] = useState(() => initialValue(time))
  const minutesRef = useRef(null)
  const [wasVisible, setWasVisible] = useState(visible)
  if (wasVisible !== visible) {
    setWasVisible(visible)
    if (visible) setValue(initialValue(time))
  }

  const step = (unit, delta) =>
    setValue((prev) => {
      const mod = unit === 'hours' ? 24 : 60
      return { ...prev, [unit]: (prev[unit] + delta + mod) % mod }
    })

  return (
    <TornPaperMenu visible={visible} title="Saati ayarla" onClose={() => onClose(`${pad(value.hours)}:${pad(value.minutes)}`)}>
      <div style={styles.clock}>
        <Column label="Saat" value={value.hours} max={23} onStep={(d) => step('hours', d)} onType={(hours) => setValue((p) => ({ ...p, hours }))} onFilled={() => minutesRef.current?.focus()} />
        <span style={styles.colon}>{':' + HAND_TAIL}</span>
        <Column
          label="Dakika"
          value={value.minutes}
          max={59}
          inputRef={minutesRef}
          onStep={(d) => step('minutes', d)}
          onType={(minutes) => setValue((p) => ({ ...p, minutes }))}
          onFilled={() => minutesRef.current?.blur()}
        />
      </div>
    </TornPaperMenu>
  )
}

function Column({ label, value, max, inputRef, onStep, onType, onFilled }) {
  const [draft, setDraft] = useState(null)
  const text = pad(value)
  function type(input) {
    const digits = input.replace(/\D/g, '').slice(0, 2)
    setDraft(digits)
    if (digits === '') return
    onType(Math.min(Number(digits), max))
    if (digits.length === 2) onFilled()
  }
  return (
    <div style={styles.column}>
      <StepButton shape="up" label={`${label} geri`} onStep={() => onStep(-1)} />
      <input
        ref={inputRef}
        value={draft ?? text}
        onChange={(e) => type(e.target.value)}
        onFocus={(e) => {
          setDraft('')
          e.currentTarget.select()
        }}
        onBlur={() => setDraft(null)}
        onKeyDown={(e) => e.key === 'Enter' && onFilled()}
        inputMode="numeric"
        maxLength={2}
        placeholder={text}
        aria-label={`${label} ${text}`}
        className="lib-hand-input"
        style={styles.digits}
      />
      <StepButton shape="down" label={`${label} ileri`} onStep={() => onStep(1)} />
    </div>
  )
}

// Bir kez basınca bir adım; basılı tutunca adımlar tekrar eder
function StepButton({ shape, label, onStep }) {
  const timer = useRef(0)
  const stop = () => clearTimeout(timer.current)
  return (
    <span
      onPointerDown={() => {
        onStep()
        const repeat = (delay) => {
          timer.current = setTimeout(() => {
            onStep()
            repeat(HOLD_STEP)
          }, delay)
        }
        repeat(HOLD_DELAY)
      }}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      <HandIcon shape={shape} label={label} size={34} onPress={() => {}} />
    </span>
  )
}

const styles = {
  bar: {
    position: 'relative',
    flexShrink: 0,
    backgroundColor: notebook.paper,
  },
  rule: {
    position: 'absolute',
    top: -3,
    left: 0,
    pointerEvents: 'none',
  },
  row: {
    height: BAR_HEIGHT,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    padding: '0 4px',
    overflowX: 'auto',
  },
  keep: {
    display: 'flex',
    flexShrink: 0,
  },
  micWrap: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    position: 'absolute',
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accent,
    pointerEvents: 'none',
  },
  notice: {
    position: 'absolute',
    bottom: BAR_HEIGHT + 8,
    left: 16,
    right: 16,
    display: 'flex',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 20,
  },
  noticeText: {
    padding: '8px 14px',
    borderRadius: 10,
    backgroundColor: 'rgba(36, 41, 47, 0.92)',
    color: '#FFFFFF',
    ...fonts.docBody,
    fontSize: 13,
    textAlign: 'center',
  },
  clock: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '0 12px 8px 42px',
  },
  colon: {
    ...fonts.handBold,
    fontSize: DIGIT_SIZE,
    color: notebook.graphite,
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  digits: {
    width: 84,
    margin: 0,
    padding: 0,
    border: 0,
    outline: 'none',
    background: 'transparent',
    textAlign: 'center',
    ...fonts.handBold,
    fontSize: DIGIT_SIZE,
    lineHeight: 1.1,
    color: notebook.graphite,
  },
}
