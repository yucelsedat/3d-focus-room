import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'

import './library.css'
import { createNotebook, getCategories, getNotebook, updateNotebook } from './api.js'
import { BookCover } from './BookCover.jsx'
import { coverTitleStyle } from './coverStyle.js'
import { CategoryManager } from './CategoryManager.jsx'
import { FIRST_YEAR, LAST_YEAR, layoutOf } from './notebookLayout.js'
import { Icon } from './icons.jsx'
import {
  DEFAULT_DOCUMENT_PAPER,
  DOCUMENT_PAPERS,
  FIRST_PAGE_COUNT,
  GENERAL_CATEGORY_ID,
  KIND_DEFAULTS,
  MAX_TITLE,
} from './model.js'
import { bookColorOf, bookColors, colors, DEFAULT_BOOK_COLOR, fonts, notebook, shelf, type } from './theme.js'

const HABITS = [
  { value: 'none', name: 'Yok', caption: 'Alışkanlık sayfası eklenmez' },
  { value: 'month', name: 'Aylık', caption: 'Her ayın başında, ayın bütün günleri tek sayfada' },
  { value: 'week', name: 'Haftalık', caption: 'Her haftanın başında, yedi gün tek sayfada' },
]

// Not defterinin kâğıtları
const PAPERS = [
  { value: 'ruled', name: 'Çizgili' },
  { value: 'oxford', name: 'Oxford' },
  { value: 'plain', name: 'Düz' },
  { value: 'grid', name: 'Kareli' },
  { value: 'dot', name: 'Noktalı' },
]

// Oluşturma ekranının adımları: defterin türü, kapağı (cilt, ad, renk) ve sayfaları
const STEP_NAMES = { kind: 'Tür', cover: 'Kapak', pages: 'Sayfalar' }

const KINDS = [
  { value: 'agenda', name: 'Ajanda', caption: 'Lastikli; günlere, haftalara ve aylara bölünmüş, tek yıllık', sample: 'Ajanda' },
  { value: 'notes', name: 'Not defteri', caption: 'Telli; numaralı sayfalar, takvimden bağımsız', sample: 'Notlar' },
  { value: 'pdf', name: 'PDF', caption: 'Dosya; A4 sayfalar, basılı yazı, biçimli metin yapıştırma', sample: 'Belge' },
]

function defaultSettings() {
  return {
    title: '',
    color: DEFAULT_BOOK_COLOR,
    kind: 'pdf',
    ...KIND_DEFAULTS.pdf,
    paper: DEFAULT_DOCUMENT_PAPER,
    year: new Date().getFullYear(),
    weekly_pages: 1,
    month_goals: 1,
    month_review: 1,
    habits: 'none',
    category_id: GENERAL_CATEGORY_ID,
  }
}

function useGoBackToLibrary() {
  const navigate = useNavigate()
  return () => {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/kitaplik', { replace: true })
  }
}

// Formun içindeki alanın eni (uygulama sütunu en çok 560 px)
function useWidth(ref) {
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return width
}

// /new-notebook?category= — kitaplıktan açılınca o an seçili kategori önceden seçili gelir
export function NewNotebookPage() {
  const [params] = useSearchParams()
  return <NewNotebookForm categoryId={Number(params.get('category')) || GENERAL_CATEGORY_ID} />
}

// Oluşturma formu: rota ve oyundaki form overlay'i aynısını kullanır; onDone(yeni defterin id'si)
export function NewNotebookForm({ categoryId = GENERAL_CATEGORY_ID, title = '', onDone, onCancel }) {
  return (
    <NotebookForm
      mode="create"
      initial={{ ...defaultSettings(), category_id: categoryId, title }}
      onSubmit={(settings) => createNotebook(settings)}
      onDone={onDone}
      onCancel={onCancel}
    />
  )
}

// /edit-notebook/:id — defterin adını, kapağını, kategorisini ve kâğıdını değiştirme; form, defter
// okunduktan sonra eski haliyle açılır
export function EditNotebookPage() {
  const { id } = useParams()
  return <EditNotebookForm id={Number(id)} />
}

// Düzenleme formu: rota ve oyundaki form overlay'i (LibraryFormOverlay) aynısını kullanır.
// onDone / onCancel verilirse (gömülü) kaydedince / geri dönünce onlar çağrılır.
export function EditNotebookForm({ id, onDone, onCancel }) {
  const [nb, setNb] = useState(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    getNotebook(id)
      .then((result) => {
        if (cancelled) return
        if (result) setNb(result)
        else setMissing(true)
      })
      .catch(() => !cancelled && setMissing(true))
    return () => {
      cancelled = true
    }
  }, [id])

  // Gömülüyken bulunamadı / yükleniyor ekranından Esc ile çıkılır (formun Esc'i form kurulunca)
  useEffect(() => {
    if (!onCancel || nb) return
    const onKey = (e) => e.key === 'Escape' && !e.defaultPrevented && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, nb])

  if (missing) {
    return (
      <div className="lib-root">
        <div className="lib-app" style={{ ...styles.safe, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
          <div style={{ ...fonts.handBold, fontSize: 30 }}>Defter bulunamadı</div>
          {onCancel && (
            <button type="button" onClick={onCancel} aria-label="Geri dön" className="lib-press" style={styles.back}>
              <Icon name="arrow-back" size={24} color={colors.onInk} />
            </button>
          )}
        </div>
      </div>
    )
  }
  if (!nb) return <div className="lib-root"><div className="lib-app" style={styles.safe} /></div>

  return (
    <NotebookForm mode="edit" initial={nb} onSubmit={(settings) => updateNotebook(nb.id, settings)}
      onDone={onDone} onCancel={onCancel} />
  )
}

// Defter oluşturma ve düzenleme. Oluştururken önce tür, sonra kapak (kapağın etiketine yazılan
// ad, renk ve kitaplıkta duracağı kategori), en son sayfalar seçilir. Düzenlerken tür değişmez.
// Gömülüyken (oyun, canvas, timeline) onCancel ilk adımdan geri dönünce, onDone(sonuç) kaydedince
// çağrılır; verilmezse ikisi de kitaplığa döner.
export function NotebookForm({ mode, initial, onSubmit, onDone, onCancel }) {
  const goBackToLibrary = useGoBackToLibrary()
  const bodyRef = useRef(null)
  const width = useWidth(bodyRef)
  const [settings, setSettings] = useState(() => initial ?? defaultSettings())
  const [categories, setCategories] = useState([])
  const [managing, setManaging] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    getCategories().then((list) => !cancelled && setCategories(list)).catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  function change(patch) {
    setSettings((prev) => ({ ...prev, ...patch }))
  }

  // Kâğıtta yeni kategori eklenince o seçilir; seçili kategori silinince Genel'e dönülür
  function categoriesChanged(list) {
    const added = list.filter((c) => !categories.some((old) => old.id === c.id))
    setCategories(list)
    if (added.length > 0) change({ category_id: added[added.length - 1].id })
    else if (!list.some((c) => c.id === settings.category_id)) change({ category_id: GENERAL_CATEGORY_ID })
  }

  const steps =
    mode === 'create' ? ['kind', 'cover', 'pages'] : settings.kind !== 'agenda' ? ['cover', 'pages'] : ['cover']
  const [stepIndex, setStepIndex] = useState(0)
  const step = steps[stepIndex]
  const last = stepIndex === steps.length - 1
  const [saving, setSaving] = useState(false)
  const name = settings.title.trim()
  // Ad yazılmadan kapaktan ileri geçilmez
  const canContinue = (step !== 'cover' || name !== '') && (!last || name !== '') && !saving

  function chooseKind(kind) {
    if (kind !== settings.kind) change({ kind, ...KIND_DEFAULTS[kind] })
  }

  function back() {
    if (stepIndex > 0) setStepIndex(stepIndex - 1)
    else if (onCancel) onCancel()
    else goBackToLibrary()
  }

  async function next() {
    if (!canContinue) return
    if (!last) {
      setStepIndex(stepIndex + 1)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const result = await onSubmit({
        ...settings,
        title: name,
        binding: KIND_DEFAULTS[settings.kind].binding,
        // PDF'in yılı yoktur; kapağında yıl yazmaz
        year: settings.kind === 'pdf' ? null : settings.year,
      })
      // Kitaplık açılınca defterleri yeniden okur, değişiklik rafta görünür
      if (onDone) onDone(result)
      else goBackToLibrary()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  // Escape bir önceki adıma (ilk adımda kitaplığa) döner
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !managing && !e.defaultPrevented) back()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="lib-root">
      <div className="lib-app" style={styles.safe}>
        <header style={styles.header}>
          <button
            type="button"
            onClick={back}
            aria-label={stepIndex > 0 ? 'Önceki adım' : onCancel ? 'Kapat' : 'Kitaplığa dön'}
            className="lib-press"
            style={styles.back}
          >
            <Icon name="arrow-back" size={24} color={colors.onInk} />
          </button>
          <div style={styles.headerText}>
            <h1 style={styles.title}>{mode === 'create' ? 'Yeni defter' : 'Defteri düzenle'}</h1>
            {steps.length > 1 && (
              <div style={styles.stepText}>{`${stepIndex + 1} / ${steps.length} · ${STEP_NAMES[step]}`}</div>
            )}
          </div>
          <div style={styles.back} />
        </header>

        <div style={styles.body}>
          <div ref={bodyRef} className="lib-scroll-y" style={styles.scroll}>
            <div style={styles.content}>
              {width > 0 && step === 'kind' && <KindStep width={width} settings={settings} onChoose={chooseKind} />}
              {width > 0 && step === 'cover' && (
                <CoverStep
                  width={width}
                  settings={settings}
                  categories={categories}
                  onChange={change}
                  onSubmit={next}
                  onManageCategories={() => setManaging(true)}
                />
              )}
              {width > 0 && step === 'pages' && settings.kind === 'notes' && <PaperStep width={width} settings={settings} onChange={change} />}
              {width > 0 && step === 'pages' && settings.kind === 'agenda' && <AgendaStep settings={settings} onChange={change} />}
              {width > 0 && step === 'pages' && settings.kind === 'pdf' && (
                <DocumentPaperStep width={width} settings={settings} onChange={change} />
              )}
            </div>
          </div>

          <div style={styles.footer}>
            {error && <div style={styles.error} role="alert">{error}</div>}
            {stepIndex > 0 && (
              <button type="button" onClick={back} className="lib-card" style={{ ...styles.button, ...styles.secondary }}>
                <span style={styles.buttonText}>Geri</span>
              </button>
            )}
            <button
              type="button"
              onClick={next}
              disabled={!canContinue}
              aria-disabled={!canContinue}
              className="lib-card"
              style={{ ...styles.button, ...styles.primary, ...(!canContinue ? styles.disabled : null) }}
            >
              <span style={styles.buttonText}>{last ? (mode === 'create' ? 'Oluştur' : 'Kaydet') : 'İleri'}</span>
            </button>
          </div>
        </div>
        <CategoryManager visible={managing} onClose={() => setManaging(false)} onChange={categoriesChanged} />
      </div>
    </div>
  )
}

function Section({ title, caption, children }) {
  return (
    <section style={styles.section}>
      <h2 style={styles.sectionTitle}>{title}</h2>
      {caption && <p style={styles.caption}>{caption}</p>}
      {children}
    </section>
  )
}

// 1. adım: ajanda mı, not defteri mi, PDF mi; her seçeneğin yanında o türün önerilen kapağı
function KindStep({ width, settings, onChoose }) {
  const perRow = width >= 600 ? 3 : 2
  const cardWidth = (Math.min(width, perRow === 3 ? 720 : 480) - 24 * 2 - 12 * (perRow - 1)) / perRow
  const cover = bookColorOf(settings.color)

  return (
    <Section title="Ne tür bir defter?" caption="Türü sonradan değiştirilemez">
      <div style={styles.kindRow} role="radiogroup" aria-label="Defter türü">
        {KINDS.map((kind) => {
          const selected = kind.value === settings.kind
          return (
            <button
              type="button"
              key={kind.value}
              onClick={() => !kind.soon && onChoose(kind.value)}
              disabled={kind.soon}
              role="radio"
              aria-checked={selected}
              aria-label={`${kind.name}. ${kind.caption}${kind.soon ? ' (yakında)' : ''}`}
              className="lib-card"
              style={{
                ...styles.kindCard,
                width: cardWidth,
                ...(selected ? styles.cardSelected : null),
                ...(kind.soon ? styles.cardSoon : null),
              }}
            >
              {kind.soon && <span style={styles.soonTag}>yakında</span>}
              <span style={styles.kindCover}>
                <BookCover
                  width={cardWidth * 0.56}
                  title={kind.sample}
                  color={cover.cover}
                  band={cover.band}
                  binding={KIND_DEFAULTS[kind.value].binding}
                  subtitle={kind.value === 'agenda' ? String(settings.year) : undefined}
                />
              </span>
              <span style={styles.cardName}>{kind.name}</span>
              <span style={styles.cardCaption}>{kind.caption}</span>
            </button>
          )
        })}
      </div>
    </Section>
  )
}

// 2. adım: kapağın önizlemesindeki etikete yazılan ad, altından seçilen renk ve kitaplıkta
// duracağı kategori; cilt türden gelir
function CoverStep({ width, settings, categories, onChange, onSubmit, onManageCategories }) {
  const coverWidth = Math.min(width * 0.56, 230)
  const cover = bookColorOf(settings.color)
  const binding = KIND_DEFAULTS[settings.kind].binding
  const inputRef = useRef(null)

  // Yazı uzadıkça alan satır satır büyür (RN multiline gibi)
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = '0px'
    el.style.height = `${el.scrollHeight}px`
  }, [settings.title, coverWidth])

  return (
    <div style={styles.coverStep}>
      <BookCover
        width={coverWidth}
        color={cover.cover}
        band={cover.band}
        binding={binding}
        subtitle={settings.kind === 'agenda' && settings.year ? String(settings.year) : undefined}
      >
        <textarea
          ref={inputRef}
          value={settings.title}
          onChange={(e) => onChange({ title: e.target.value.replace(/\n/g, ' ') })}
          placeholder="Defter adı"
          aria-label="Defter adı"
          autoFocus={settings.title === ''}
          rows={1}
          maxLength={MAX_TITLE}
          // Enter yeni satır açmaz, sonraki adıma geçer
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              onSubmit()
            }
          }}
          className="lib-cover-input"
          style={{ ...coverTitleStyle(coverWidth), ...styles.input }}
        />
      </BookCover>
      <div style={styles.hint}>Adı kapağın üstüne yaz</div>
      <div style={styles.swatches} role="radiogroup" aria-label="Kapak rengi">
        {Object.keys(bookColors).map((key) => (
          <button
            type="button"
            key={key}
            onClick={() => onChange({ color: key })}
            role="radio"
            aria-checked={key === settings.color}
            aria-label={bookColors[key].name}
            title={bookColors[key].name}
            className="lib-card"
            style={{ ...styles.swatchRing, ...(key === settings.color ? styles.swatchRingOn : null) }}
          >
            <span style={{ ...styles.swatch, backgroundColor: bookColors[key].cover }}>
              {binding === 'band' && <span style={{ ...styles.swatchBand, backgroundColor: bookColors[key].band }} />}
            </span>
          </button>
        ))}
      </div>
      {categories.length > 0 && (
        <div style={styles.categoryBlock}>
          <div style={styles.categoryLabel}>Kitaplıkta duracağı kategori</div>
          <div style={styles.categories} role="radiogroup" aria-label="Kategori">
            {categories.map((category) => {
              const selected = category.id === settings.category_id
              return (
                <button
                  type="button"
                  key={category.id}
                  onClick={() => onChange({ category_id: category.id })}
                  role="radio"
                  aria-checked={selected}
                  className="lib-card"
                  style={{ ...styles.chip, ...(selected ? styles.chipSelected : null) }}
                >
                  <span style={{ ...styles.chipText, ...(selected ? styles.chipTextSelected : null) }}>
                    {category.name}
                  </span>
                </button>
              )
            })}
            <button
              type="button"
              onClick={onManageCategories}
              aria-label="Yeni kategori"
              title="Kategorilerin ayarlandığı kâğıdı açar"
              className="lib-card"
              style={{ ...styles.chip, ...styles.chipAdd }}
            >
              <Icon name="add" size={16} color={colors.onInk} />
              <span style={styles.chipText}>Yeni</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// 3. adım (ajanda): yıl, sayfa düzeni ve şablonlar
function AgendaStep({ settings, onChange }) {
  const year = settings.year ?? new Date().getFullYear()
  const count = layoutOf(settings).count
  const habit = HABITS.find((h) => h.value === settings.habits)

  // Bir ayın sayfaları sırasıyla
  const order = [
    settings.month_goals && 'Ay hedefleri',
    settings.habits === 'month' && 'Alışkanlıklar',
    `4–5 hafta: ${[settings.weekly_pages && 'hedefler', settings.habits === 'week' && 'alışkanlıklar', '7 gün', settings.weekly_pages && 'değerlendirme']
      .filter(Boolean)
      .join(', ')}`,
    settings.month_review && 'Ay değerlendirmesi',
  ].filter(Boolean)

  return (
    <>
      <Section title="Yıl" caption="Ajanda bu yılın ocak ayından aralık ayına kadar sürer">
        <div style={styles.yearRow}>
          <button
            type="button"
            onClick={() => onChange({ year: year - 1 })}
            disabled={year <= FIRST_YEAR}
            aria-label="Önceki yıl"
            className="lib-card"
            style={{ ...styles.yearButton, ...(year <= FIRST_YEAR ? styles.disabled : null) }}
          >
            <Icon name="chevron-back" size={24} color={colors.onInk} />
          </button>
          <span style={styles.year}>{year}</span>
          <button
            type="button"
            onClick={() => onChange({ year: year + 1 })}
            disabled={year >= LAST_YEAR}
            aria-label="Sonraki yıl"
            className="lib-card"
            style={{ ...styles.yearButton, ...(year >= LAST_YEAR ? styles.disabled : null) }}
          >
            <Icon name="chevron-forward" size={24} color={colors.onInk} />
          </button>
        </div>
      </Section>

      <Section title="Sayfa düzeni">
        <div>
          <CheckRow label="Günlük sayfalar" caption="Her güne bir sayfa" checked disabled />
          <CheckRow
            label="Aylık hedefler"
            caption="Her ayın başında"
            checked={settings.month_goals === 1}
            onPress={() => onChange({ month_goals: settings.month_goals ? 0 : 1 })}
          />
          <CheckRow
            label="Haftalık hedefler ve değerlendirme"
            caption="Her haftanın başında ve sonunda"
            checked={settings.weekly_pages === 1}
            onPress={() => onChange({ weekly_pages: settings.weekly_pages ? 0 : 1 })}
          />
          <CheckRow
            label="Aylık değerlendirme"
            caption="Her ayın sonunda"
            checked={settings.month_review === 1}
            onPress={() => onChange({ month_review: settings.month_review ? 0 : 1 })}
          />
        </div>
      </Section>

      <Section title="Şablonlar" caption="Alışkanlık takibi">
        <div style={styles.choice} role="radiogroup" aria-label="Alışkanlık takibi">
          {HABITS.map((option) => {
            const selected = option.value === settings.habits
            return (
              <button
                type="button"
                key={option.value}
                onClick={() => onChange({ habits: option.value })}
                role="radio"
                aria-checked={selected}
                className="lib-card"
                style={{ ...styles.choiceOption, ...(selected ? styles.choiceSelected : null) }}
              >
                <span style={selected ? styles.choiceTextSelected : styles.choiceText}>{option.name}</span>
              </button>
            )
          })}
        </div>
        <p style={styles.caption}>{habit.caption}</p>
      </Section>

      <div style={styles.summary}>
        <span style={styles.summaryTitle}>{`${year} · ${count} sayfa`}</span>
        <span style={styles.summaryText}>{`Her ay: ${order.join(' → ')}`}</span>
      </div>
    </>
  )
}

function CheckRow({ label, caption, checked, disabled, onPress }) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      role="checkbox"
      aria-checked={checked}
      className="lib-card"
      style={styles.checkRow}
    >
      <Icon
        name={checked ? 'checkbox' : 'square-outline'}
        size={24}
        color={disabled ? 'rgba(244, 239, 230, 0.4)' : checked ? colors.accent : colors.onInk}
      />
      <span style={styles.checkText}>
        <span style={{ ...styles.checkLabel, ...(disabled ? styles.checkLabelFixed : null) }}>{label}</span>
        <span style={styles.caption}>{caption}</span>
      </span>
    </button>
  )
}

// 3. adım (not defteri): sayfaların kâğıdı
function PaperStep({ width, settings, onChange }) {
  const tileWidth = (Math.min(width, 480) - 24 * 2 - 12 * 2) / 3

  return (
    <Section title="Sayfa yapısı" caption={`Defter ${FIRST_PAGE_COUNT} sayfayla başlar; son sayfayı çevirdikçe yeni sayfa eklenir.`}>
      <div style={styles.paperGrid} role="radiogroup" aria-label="Sayfa yapısı">
        {PAPERS.map((paper) => {
          const selected = paper.value === settings.paper
          return (
            <button
              type="button"
              key={paper.value}
              onClick={() => onChange({ paper: paper.value })}
              role="radio"
              aria-checked={selected}
              aria-label={paper.name}
              className="lib-card"
              style={{ ...styles.paperTile, width: tileWidth, ...(selected ? styles.cardSelected : null) }}
            >
              <PaperSample paper={paper.value} width={tileWidth - 16} />
              <span style={styles.paperName}>{paper.name}</span>
            </button>
          )
        })}
      </div>
    </Section>
  )
}

// Kâğıdın küçük örneği: defter sayfasıyla aynı renkler, ölçeği küçültülmüş
function PaperSample({ paper, width }) {
  const height = width * 1.3
  const line = width / 7
  const step = line / 2
  const margin = width * 0.2
  const rows = Math.floor(height / line)
  const cols = Math.floor(width / step)
  const gridRows = Math.floor(height / step)
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block' }}>
      <rect width={width} height={height} rx={3} fill={notebook.paper} />
      {(paper === 'ruled' || paper === 'oxford') &&
        Array.from({ length: rows }, (_, i) => (
          <line key={i} x1={0} x2={width} y1={(i + 1) * line} y2={(i + 1) * line} stroke={notebook.rule} strokeWidth={0.8} />
        ))}
      {paper === 'oxford' && (
        <>
          <line x1={margin} x2={margin} y1={0} y2={height} stroke={notebook.margin} strokeWidth={1} />
          <line x1={margin + 2.5} x2={margin + 2.5} y1={0} y2={height} stroke={notebook.margin} strokeWidth={0.6} />
        </>
      )}
      {paper === 'grid' && (
        <>
          {Array.from({ length: gridRows }, (_, i) => (
            <line key={`r${i}`} x1={0} x2={width} y1={(i + 1) * step} y2={(i + 1) * step} stroke={notebook.rule} strokeWidth={0.6} />
          ))}
          {Array.from({ length: cols }, (_, i) => (
            <line key={`c${i}`} x1={(i + 1) * step} x2={(i + 1) * step} y1={0} y2={height} stroke={notebook.rule} strokeWidth={0.6} />
          ))}
        </>
      )}
      {paper === 'dot' &&
        Array.from({ length: gridRows * cols }, (_, i) => (
          <circle key={i} cx={((i % cols) + 1) * step} cy={(Math.floor(i / cols) + 1) * step} r={0.9} fill={notebook.rule} />
        ))}
    </svg>
  )
}

// 3. adım (PDF): sayfanın boyutu. Kâğıt beyaz ve çizgisizdir; boyut yalnızca oranını belirler.
function DocumentPaperStep({ width, settings, onChange }) {
  const tileWidth = (Math.min(width, 480) - 24 * 2 - 12) / 2

  return (
    <Section
      title="Sayfa boyutu"
      caption={`Sayfalar beyaz kâğıt; yazı basılı harflerle. Defter ${FIRST_PAGE_COUNT} sayfayla başlar, son sayfayı çevirdikçe yeni sayfa eklenir.`}
    >
      <div style={styles.paperGrid} role="radiogroup" aria-label="Sayfa boyutu">
        {Object.keys(DOCUMENT_PAPERS).map((key) => {
          const paper = DOCUMENT_PAPERS[key]
          const selected = key === settings.paper
          return (
            <button
              type="button"
              key={key}
              onClick={() => onChange({ paper: key })}
              role="radio"
              aria-checked={selected}
              aria-label={`${paper.name}, ${paper.caption}`}
              className="lib-card"
              style={{ ...styles.paperTile, width: tileWidth, ...(selected ? styles.cardSelected : null) }}
            >
              <DocumentSample ratio={paper.ratio} width={tileWidth * 0.5} />
              <span style={styles.paperName}>{paper.name}</span>
              <span style={styles.cardCaption}>{paper.caption}</span>
            </button>
          )
        })}
      </div>
    </Section>
  )
}

// Beyaz kâğıdın küçük örneği: başlık ve birkaç satır basılı yazının izi
function DocumentSample({ ratio, width }) {
  const height = width * ratio
  const pad = width * 0.14
  const rows = [0.62, 0.9, 0.84, 0.9, 0.5, 0, 0.9, 0.76, 0.88, 0.4]
  const step = (height - pad * 2 - 10) / rows.length
  return (
    <svg width={width} height={height} aria-hidden="true" style={{ display: 'block' }}>
      <rect width={width} height={height} rx={2} fill="#FFFFFF" />
      <rect x={pad} y={pad} width={(width - pad * 2) * 0.55} height={5} rx={1} fill="#24292F" />
      {rows.map((w, i) =>
        w === 0 ? null : (
          <rect key={i} x={pad} y={pad + 12 + i * step} width={(width - pad * 2) * w} height={2} rx={1} fill="#B9BEC5" />
        ),
      )}
    </svg>
  )
}

const resetButton = {
  margin: 0,
  font: 'inherit',
  color: 'inherit',
  cursor: 'pointer',
  backgroundColor: 'transparent',
  borderStyle: 'solid',
  borderWidth: 0,
  borderColor: 'transparent',
}

const styles = {
  safe: {
    backgroundColor: colors.ink,
    color: colors.onInk,
  },
  header: {
    height: 64,
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 8px',
  },
  headerText: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  back: {
    ...resetButton,
    width: 44,
    height: 44,
    borderRadius: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    margin: 0,
    ...fonts.displayBold,
    fontSize: type.title,
    lineHeight: 1.2,
    color: colors.onInk,
  },
  stepText: {
    ...fonts.bodyThin,
    fontSize: type.caption,
    letterSpacing: 1.5,
    color: colors.onInk,
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: shelf.wall,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
  },
  // Geniş ekranda içerik okunur bir sütunda ortalanır
  content: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: 28,
    padding: 24,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  },
  sectionTitle: {
    margin: 0,
    ...fonts.displayBold,
    fontSize: type.title,
    lineHeight: 1.2,
    color: colors.onInk,
  },
  caption: {
    margin: 0,
    ...fonts.bodyThin,
    fontSize: 13,
    lineHeight: '18px',
    color: colors.onInk,
  },
  kindRow: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 6,
  },
  kindCard: {
    ...resetButton,
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
    padding: '18px 12px 12px',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'rgba(244, 239, 230, 0.12)',
    backgroundColor: 'rgba(244, 239, 230, 0.05)',
    textAlign: 'left',
  },
  kindCover: {
    display: 'flex',
    justifyContent: 'center',
    paddingBottom: 10,
  },
  cardSelected: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(200, 85, 61, 0.12)',
  },
  cardSoon: {
    opacity: 0.42,
    cursor: 'not-allowed',
  },
  soonTag: {
    position: 'absolute',
    top: 8,
    right: 10,
    ...fonts.hand,
    fontSize: 17,
    color: colors.onInk,
    zIndex: 1,
  },
  cardName: {
    ...fonts.bodyBold,
    fontSize: type.body,
    color: colors.onInk,
  },
  cardCaption: {
    ...fonts.bodyThin,
    fontSize: 13,
    lineHeight: '18px',
    color: colors.onInk,
  },
  coverStep: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 20,
  },
  input: {
    display: 'block',
    width: '100%',
    margin: 0,
    padding: 0,
    border: 0,
    background: 'transparent',
    resize: 'none',
    overflow: 'hidden',
  },
  hint: {
    ...fonts.bodyThin,
    fontSize: type.caption,
    letterSpacing: 1,
    color: colors.onInk,
  },
  swatches: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    maxWidth: 6 * 44 + 5 * 10,
  },
  swatchRing: {
    ...resetButton,
    width: 44,
    height: 44,
    padding: 0,
    borderRadius: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  swatchRingOn: {
    borderColor: colors.onInk,
  },
  swatch: {
    position: 'relative',
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    border: '1px solid rgba(244, 239, 230, 0.25)',
  },
  swatchBand: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 8,
    width: 4,
  },
  categoryBlock: {
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
  },
  categoryLabel: {
    ...fonts.bodyThin,
    fontSize: type.caption,
    letterSpacing: 1,
    color: colors.onInk,
  },
  categories: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  chip: {
    ...resetButton,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 36,
    padding: '0 14px',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(244, 239, 230, 0.3)',
  },
  chipSelected: {
    borderColor: colors.paper,
    backgroundColor: colors.paper,
  },
  chipAdd: {
    borderStyle: 'dashed',
    paddingLeft: 10,
  },
  chipText: {
    ...fonts.bodyThin,
    fontSize: 13,
    color: colors.onInk,
  },
  chipTextSelected: {
    ...fonts.bodyBold,
    color: colors.ink,
  },
  yearRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  yearButton: {
    ...resetButton,
    width: 44,
    height: 44,
    borderRadius: 22,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(244, 239, 230, 0.25)',
  },
  year: {
    minWidth: 120,
    textAlign: 'center',
    ...fonts.displayBold,
    fontSize: type.display,
    color: colors.onInk,
  },
  checkRow: {
    ...resetButton,
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    width: '100%',
    padding: '6px 0',
    textAlign: 'left',
    borderRadius: 8,
  },
  checkText: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 2,
  },
  checkLabel: {
    ...fonts.bodyBold,
    fontSize: type.body,
    color: colors.onInk,
  },
  checkLabelFixed: {
    opacity: 0.6,
  },
  choice: {
    display: 'flex',
    padding: 4,
    gap: 4,
    borderRadius: 12,
    backgroundColor: 'rgba(244, 239, 230, 0.08)',
  },
  choiceOption: {
    ...resetButton,
    flex: 1,
    height: 40,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 9,
  },
  choiceSelected: {
    backgroundColor: colors.paper,
  },
  choiceText: {
    ...fonts.bodyThin,
    fontSize: type.body,
    color: colors.onInk,
  },
  choiceTextSelected: {
    ...fonts.bodyBold,
    fontSize: type.body,
    color: colors.ink,
  },
  summary: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    padding: 14,
    borderRadius: 12,
    border: '1px dashed rgba(244, 239, 230, 0.3)',
  },
  summaryTitle: {
    ...fonts.bodyBold,
    fontSize: type.body,
    color: colors.onInk,
  },
  summaryText: {
    ...fonts.bodyThin,
    fontSize: 13,
    lineHeight: '19px',
    color: colors.onInk,
  },
  paperGrid: {
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 6,
  },
  paperTile: {
    ...resetButton,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    padding: '8px 6px 6px',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'rgba(244, 239, 230, 0.12)',
  },
  paperName: {
    ...fonts.bodyBold,
    fontSize: 13,
    color: colors.onInk,
  },
  footer: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    padding: '12px 24px 16px',
    backgroundColor: shelf.wall,
  },
  error: {
    flexBasis: '100%',
    ...fonts.hand,
    fontSize: 19,
    color: '#E08A8A',
  },
  button: {
    ...resetButton,
    height: 54,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    flex: 2,
    backgroundColor: colors.accent,
  },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(244, 239, 230, 0.35)',
  },
  disabled: {
    opacity: 0.4,
    cursor: 'default',
  },
  buttonText: {
    ...fonts.bodyBold,
    fontSize: type.body,
    letterSpacing: 1,
    color: colors.onInk,
  },
}
