// ── Canvas öğe kartları ──────────────────────────────────────────────────────
// Canvas tile ve Timeline aynı kartları render eder. Modül seviyesinde: inline
// tanım her parent render'da yeni komponent tipi üretip remount'a (ve state
// kaybına) yol açar.
import { useState, useEffect, useRef } from 'react'
import { parseMd } from '../../utils/markdownRender'
import { formatRange, formatRangeShort, statusOf } from '../../utils/timelineModel'
import { stopEvt, parseInstaTitle, formatBytes, audioPool, getPoolAudio, togglePoolAudio, releasePoolAudio } from './canvasUtils'
import { useStore } from '../../store/useStore'
import { useShelf, ensureShelf, clothOf } from '../notebook/shelfStore'
import { withAuthUser } from '../../utils/googleAccount'

// Canvas'a özgü stiller (ortak .cvmd markdown stilleri utils/markdownRender'da)
if (typeof document !== 'undefined' && !document.getElementById('cv-styles')) {
  const s = document.createElement('style')
  s.id = 'cv-styles'
  s.textContent = `
    /* Metin kutusu: kutunun kendisi wheel/scroll alır, içerik tıklanabilir değil */
    .cv-textbox * { pointer-events: none; }
    @keyframes cvMusicMarquee { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }
  `
  document.head.appendChild(s)
}

// ── Image item — yüklenemeyen görsel şeffaf blok yerine gri placeholder gösterir ──
export const ImageItem = ({ item }) => {
  const [ok, setOk] = useState(true)
  return ok ? (
    <img src={item.url} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setOk(false)}
      style={{ width: '100%', height: '100%', objectFit: 'fill', borderRadius: 4, display: 'block', pointerEvents: 'none' }} />
  ) : (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#3a3f47', borderRadius: 4, pointerEvents: 'none' }}>
      <span style={{ fontSize: 64, opacity: 0.35 }}>🖼️</span>
    </div>
  )
}

// ── Generic link card (Open Graph görsel + başlık; görsel yoksa gri) ──────────
export const LinkCard = ({ item, clickable = false }) => {
  const [imgOk, setImgOk] = useState(true)
  const hasImg = !!item.thumbUrl && imgOk
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 4, overflow: 'hidden', background: '#3a3f47', cursor: clickable ? 'pointer' : 'inherit', boxSizing: 'border-box' }}
      {...(clickable ? { onMouseDown: stopEvt, onClick: (e) => { stopEvt(e); navigator.clipboard?.writeText(withAuthUser(item.url, item.googleEmail)).catch(() => {}) } } : {})}>
      {hasImg ? (
        <img src={item.thumbUrl} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setImgOk(false)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
          <span style={{ fontSize: 64, opacity: 0.35 }}>🔗</span>
        </div>
      )}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: hasImg ? 'linear-gradient(transparent, rgba(0,0,0,0.88))' : 'rgba(0,0,0,0.25)', padding: '28px 14px 12px', color: '#fff', pointerEvents: 'none' }}>
        {/* başlık yoksa URL'nin kendisi — kart asla "boş" görünmesin */}
        <div style={{ fontSize: 28, lineHeight: 1.35, fontWeight: 600, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>
          {item.title || item.url}
        </div>
        {item.siteName && (
          <div style={{ fontSize: 20, marginTop: 6, opacity: 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.siteName}</div>
        )}
        {/* linkin eklendiği tarayıcının Google hesabı */}
        {item.googleEmail && (
          <div title="Bu linkin eklendiği Google hesabı" style={{ fontSize: 18, marginTop: 4, opacity: 0.6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>✉ {item.googleEmail}</div>
        )}
      </div>
    </div>
  )
}

// ── Instagram dikey (mobil) kart — og görsel + başlık; tıklayınca link kopyalanır ────
const IG_GRADIENT = 'linear-gradient(45deg,#f09433 0%,#e6683c 25%,#dc2743 50%,#cc2366 75%,#bc1888 100%)'
// Instagram kamera logosu (stroke SVG)
const InstaGlyph = ({ size = 32, color = '#fff' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="2" width="20" height="20" rx="5.5" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="17.5" cy="6.5" r="1.1" fill={color} stroke="none" />
  </svg>
)
const IgIcon = ({ d, fill = 'none' }) => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill={fill} stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
export const InstaCard = ({ item, clickable = false }) => {
  const [imgOk, setImgOk] = useState(true)
  const hasImg = !!item.thumbUrl && imgOk
  const { user, caption } = parseInstaTitle(item.title)
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 22, overflow: 'hidden', background: '#0b0b0b', display: 'flex', flexDirection: 'column', cursor: clickable ? 'pointer' : 'inherit', boxSizing: 'border-box', boxShadow: 'inset 0 0 0 2px rgba(255,255,255,0.06)' }}
      {...(clickable ? { onMouseDown: stopEvt, onClick: (e) => { stopEvt(e); navigator.clipboard?.writeText(item.url).catch(() => {}) } } : {})}>
      {/* Header: gradient avatar halkası + kullanıcı adı + ⋯ */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', flexShrink: 0, pointerEvents: 'none' }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: IG_GRADIENT, padding: 2.5, boxSizing: 'border-box', flexShrink: 0 }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: '#2a2a2a', border: '2px solid #0b0b0b', boxSizing: 'border-box' }} />
        </div>
        <div style={{ flex: 1, minWidth: 0, color: '#fff', fontSize: 24, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user}</div>
        <div style={{ color: '#fff', fontSize: 30, fontWeight: 800, letterSpacing: 2, lineHeight: 0.4 }}>⋯</div>
      </div>
      {/* Media: og:image — TAMAMI görünsün (contain), arkada bulanık dolgu (IG tarzı) */}
      <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#000', overflow: 'hidden' }}>
        {hasImg ? (
          <>
            <img src={item.thumbUrl} alt="" aria-hidden="true" draggable={false} referrerPolicy="no-referrer"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(24px) brightness(0.5)', transform: 'scale(1.15)', pointerEvents: 'none' }} />
            <img src={item.thumbUrl} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setImgOk(false)}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', display: 'block', pointerEvents: 'none' }} />
          </>
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: IG_GRADIENT, pointerEvents: 'none' }}>
            <InstaGlyph size={96} />
          </div>
        )}
        {/* Instagram logo filigranı (üst-sağ) */}
        <div style={{ position: 'absolute', top: 12, right: 12, pointerEvents: 'none', filter: 'drop-shadow(0 1px 3px rgba(0,0,0,.65))' }}>
          <InstaGlyph size={34} />
        </div>
      </div>
      {/* Aksiyon ikonları + caption */}
      <div style={{ flexShrink: 0, padding: '10px 14px 16px', color: '#fff', pointerEvents: 'none' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 8 }}>
          <IgIcon d={<path d="M12 21s-7.5-4.6-9.6-9C1 9.3 2.6 5.5 6.2 5.5c2 0 3.2 1.1 3.8 2.2h4c.6-1.1 1.8-2.2 3.8-2.2 3.6 0 5.2 3.8 3.8 6.5C19.5 16.4 12 21 12 21z" />} />
          <IgIcon d={<path d="M21 11.5a8.4 8.4 0 0 1-12.5 7.3L3 21l2.2-5.4A8.4 8.4 0 1 1 21 11.5z" />} />
          <IgIcon d={<><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></>} />
          <span style={{ marginLeft: 'auto' }}><IgIcon d={<path d="M6 3h12v18l-6-4-6 4V3z" />} /></span>
        </div>
        <div style={{ fontSize: 22, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word' }}>
          <b style={{ fontWeight: 700 }}>{user}</b>{caption ? ' ' + caption : ''}
        </div>
      </div>
    </div>
  )
}

// ── Müzik kartı — kapak + kayan başlık + play/pause ───────────────────────────
// Ses elementi canvasUtils'teki havuzda yaşar (bkz. audioPool notu).
export const MusicCard = ({ item, clickable = false }) => {
  const [coverOk, setCoverOk] = useState(true)
  // remount'ta (mod geçişi) havuzda çalan ses varsa ikon doğru başlasın
  const [playing, setPlaying] = useState(() => { const a = audioPool.get(item.id); return a ? !a.paused : false })
  const [marquee, setMarquee] = useState(false)
  const titleRef = useRef(null)
  const hasCover = !!item.coverUrl && coverOk

  useEffect(() => {
    const el = titleRef.current
    if (el) setMarquee(el.scrollWidth > el.clientWidth + 2)
  }, [item.title, item.w])

  // Havuzdaki ses elementine bağlan: mevcut çalma durumunu yansıt ve buton ikonunu
  // play/pause/ended olaylarıyla senkronla. Mod değişiminde remount olsak da havuzdaki
  // element aynı kalır → çalma kesilmez, ikon anında doğru duruma oturur.
  useEffect(() => {
    const a = getPoolAudio(item.id, item.url)
    if (a.src !== new URL(item.url, location.href).href) a.src = item.url  // cross-canvas kopyada url değişebilir
    // Başlangıç ikonu lazy useState init'inden geldi; burada yalnızca olay dinleyicileri bağla.
    const onPlay  = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onEnded = () => { setPlaying(false); releasePoolAudio(a) }
    a.addEventListener('play', onPlay)
    a.addEventListener('pause', onPause)
    a.addEventListener('ended', onEnded)
    return () => {
      a.removeEventListener('play', onPlay)
      a.removeEventListener('pause', onPause)
      a.removeEventListener('ended', onEnded)
    }
  }, [item.id, item.url])

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 18, overflow: 'hidden',
      background: 'linear-gradient(160deg,#1f2937,#0b0f16)', display: 'flex', flexDirection: 'column',
      padding: 16, boxSizing: 'border-box', cursor: clickable ? 'default' : 'inherit',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}
      {...(clickable ? { onMouseDown: stopEvt } : {})}>
      {/* Kapak — üstte, kare */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', borderRadius: 12, overflow: 'hidden', flexShrink: 0, background: '#3a3f47' }}>
        {hasCover ? (
          <img src={item.coverUrl} alt="" draggable={false} onError={() => setCoverOk(false)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
        ) : (
          <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg,#6d28d9,#db2777)', pointerEvents: 'none' }}>
            <span style={{ fontSize: 72, opacity: 0.85 }}>🎵</span>
          </div>
        )}
      </div>
      {/* Şarkı adı (uzunsa kayar) */}
      <div ref={titleRef} style={{ overflow: 'hidden', whiteSpace: 'nowrap', color: '#fff', fontSize: 26, fontWeight: 700,
        textAlign: 'center', marginTop: 16, flexShrink: 0 }}>
        <span style={{ display: 'inline-block', paddingRight: marquee ? 40 : 0,
          ...(marquee ? { animation: 'cvMusicMarquee 9s linear infinite' } : {}) }}>
          {item.title}{marquee ? '        ' + item.title : ''}
        </span>
      </div>
      {/* Sanatçı adı */}
      <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 20, fontWeight: 400, textAlign: 'center',
        marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0 }}>
        {item.artist || '—'}
      </div>
      {/* Play / pause — en altta ortada */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 0 }}>
        <button onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); togglePoolAudio(item.id, item.url) }}
          style={{ width: 60, height: 60, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.14)',
            color: '#fff', fontSize: 26, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {playing ? '⏸' : '▶'}
        </button>
      </div>
    </div>
  )
}

// ── PDF kartı — belge ikonu + dosya adı + sayfa/boyut + "Aç" ─────────────────
// Katlanmış köşeli sayfa + kırmızı "PDF" etiketi
const PdfGlyph = ({ size = 150 }) => (
  <svg width={size} height={size * 1.22} viewBox="0 0 100 122" fill="none" style={{ display: 'block', filter: 'drop-shadow(0 10px 18px rgba(0,0,0,0.45))' }}>
    <path d="M8 4h60l28 28v82a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z" fill="#f8fafc" />
    <path d="M68 4v24a4 4 0 0 0 4 4h24z" fill="#cbd5e1" />
    <rect x="18" y="46" width="52" height="4" rx="2" fill="#e2e8f0" />
    <rect x="18" y="56" width="64" height="4" rx="2" fill="#e2e8f0" />
    <rect x="18" y="104" width="40" height="4" rx="2" fill="#e2e8f0" />
    <rect x="-6" y="70" width="80" height="28" rx="5" fill="#dc2626" />
    <text x="34" y="90.5" textAnchor="middle" fill="#fff" fontSize="19" fontWeight="800" fontFamily="system-ui, sans-serif" letterSpacing="1.5">PDF</text>
  </svg>
)
export const PdfCard = ({ item, clickable = false }) => {
  const open = () => window.open(item.url, '_blank', 'noopener')
  const meta = [item.pages > 0 ? `${item.pages} sayfa` : '', formatBytes(item.size)].filter(Boolean).join(' · ')
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 18, overflow: 'hidden',
      background: 'linear-gradient(160deg,#2a1215,#0b0f16 70%)', display: 'flex', flexDirection: 'column',
      padding: 16, boxSizing: 'border-box', cursor: clickable ? 'default' : 'inherit',
      boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)' }}
      {...(clickable ? { onMouseDown: stopEvt } : {})}>
      {/* İkon alanı */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 12,
        background: 'radial-gradient(circle at 50% 40%, rgba(220,38,38,0.28), rgba(255,255,255,0.03) 70%)', pointerEvents: 'none' }}>
        <PdfGlyph />
      </div>
      {/* Dosya adı (en fazla 2 satır) */}
      <div title={item.title} style={{ color: '#fff', fontSize: 24, fontWeight: 800, lineHeight: 1.3, textAlign: 'center', marginTop: 14,
        overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', wordBreak: 'break-word', flexShrink: 0 }}>
        {item.title}
      </div>
      {/* Sayfa sayısı · boyut */}
      <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 18, fontWeight: 400, textAlign: 'center', marginTop: 6,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexShrink: 0, minHeight: 22 }}>
        {meta || 'PDF belgesi'}
      </div>
      {/* Aç — yeni sekmede tarayıcının PDF görüntüleyicisi */}
      <button onMouseDown={stopEvt} onClick={(e) => { stopEvt(e); open() }} title="PDF'i yeni sekmede aç"
        style={{ marginTop: 14, height: 52, borderRadius: 12, border: 'none', background: '#dc2626', color: '#fff',
          fontSize: 20, fontWeight: 800, cursor: 'pointer', flexShrink: 0, letterSpacing: 0.3 }}>
        Aç ↗
      </button>
    </div>
  )
}

// ── YouTube kartı — küçük resim + oynat simgesi + başlık; tıklayınca link kopyalanır ──
export const YoutubeCard = ({ item, clickable = false }) => (
  <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 4, overflow: 'hidden', cursor: clickable ? 'pointer' : 'inherit' }}
    {...(clickable ? { onMouseDown: stopEvt, onClick: (e) => { stopEvt(e); navigator.clipboard?.writeText(item.url).catch(() => {}) } } : {})}>
    <img src={item.thumbUrl} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
      <svg width="64" height="44" viewBox="0 0 68 48">
        <path d="M66.52 7.74c-.78-2.93-2.49-5.41-5.42-6.19C55.79.13 34 0 34 0S12.21.13 6.9 1.55c-2.93.78-4.63 3.26-5.42 6.19C.06 13.05 0 24 0 24s.06 10.95 1.48 16.26c.78 2.93 2.49 5.41 5.42 6.19C12.21 47.87 34 48 34 48s21.79-.13 27.1-1.55c2.93-.78 4.64-3.26 5.42-6.19C67.94 34.95 68 24 68 24s-.06-10.95-1.48-16.26z" fill="#f00"/>
        <path d="M45 24L27 14v20" fill="#fff"/>
      </svg>
    </div>
    {item.title && (
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', padding: '28px 12px 10px', color: '#fff', fontSize: 28, lineHeight: 1.35, fontWeight: 600, pointerEvents: 'none' }}>
        {item.title}
      </div>
    )}
  </div>
)

// ── Oda çipi ─────────────────────────────────────────────────────────────────
export const RoomChip = ({ item }) => (
  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '0 18px', background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.35)', borderRadius: 8, cursor: 'inherit', boxSizing: 'border-box', pointerEvents: 'none' }}>
    <span style={{ fontSize: 30 }}>🏠</span>
    <span style={{ color: '#93c5fd', fontSize: 28, textDecoration: 'underline', textUnderlineOffset: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.roomName}</span>
  </div>
)

// ── Defter kartı ─────────────────────────────────────────────────────────────
// Kitaplıktaki bir defterin kapağı (item.src = 'book:<id>' | 'room:<kökId>'). Ad ve
// kapak kitaplıktan canlı okunur — aynı deftere bakan bütün kartlar birlikte değişir;
// kartın kendi kopyası (name, cover) ilk çizim ve kitaplık yüklenemezse içindir.
// Ölçüler kart genişliğine göre: köşe tutamacıyla büyütünce yazı da büyür.
export const NotebookCard = ({ item, width, clickable = false, onOpen }) => {
  useEffect(() => { ensureShelf() }, [])
  const live = useShelf(st => st.byKey[item.src])
  const shelfReady = useShelf(st => st.state === 'ready')
  const held = useStore(st => st.heldNotebook === item.src)
  const [imgFail, setImgFail] = useState(null)
  const name = live?.name || item.name || 'Defter'
  const cover = live ? live.cover : item.cover
  const hasImg = !!cover && imgFail !== cover
  // Bağımsız defter kitaplıkta yoksa silinmiştir; oda defteri satırsız da olabilir
  const missing = shelfReady && !live && item.src?.startsWith('book:')
  const isRoom = item.src?.startsWith('room:')
  const u = (width ?? item.w ?? 300) / 300
  const spine = 22 * u
  const open = clickable && !missing && onOpen

  return (
    <div title={missing ? 'Bu defter kitaplıktan silinmiş' : open ? `${name} — elime al` : name}
      style={{ position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', pointerEvents: open ? 'auto' : 'none', cursor: open ? 'pointer' : 'inherit',
        borderRadius: `${4 * u}px ${12 * u}px ${12 * u}px ${4 * u}px`, overflow: 'hidden',
        background: missing ? '#2a2d33' : clothOf(item.src), opacity: missing ? 0.6 : 1,
        boxShadow: `0 ${14 * u}px ${28 * u}px -${12 * u}px rgba(0,0,0,0.75), inset 0 0 0 ${1 * u}px rgba(255,255,255,0.08)` }}
      {...(open ? { onMouseDown: stopEvt, onClick: (e) => { stopEvt(e); onOpen() } } : {})}>
      {hasImg && (
        <img src={cover} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setImgFail(cover)}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
      )}
      {/* sırt: koyu şerit + dikiş */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: spine, pointerEvents: 'none',
        background: 'linear-gradient(90deg, rgba(0,0,0,0.55), rgba(0,0,0,0.25) 70%, rgba(255,255,255,0.08))' }}>
        <div style={{ position: 'absolute', top: 10 * u, bottom: 10 * u, right: 5 * u, borderRight: `${1.5 * u}px dashed rgba(247,242,228,0.35)` }} />
      </div>
      {/* etiket: ad + tür */}
      <div style={{ position: 'absolute', left: spine + 16 * u, right: 16 * u, bottom: 18 * u, pointerEvents: 'none',
        padding: `${12 * u}px ${14 * u}px`, borderRadius: 3 * u, background: 'rgba(247,242,228,0.94)', color: '#1d1c1a',
        boxShadow: `0 ${6 * u}px ${14 * u}px -${8 * u}px rgba(0,0,0,0.6)` }}>
        <div style={{ font: `800 ${10 * u}px ${FONT_UI}`, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(29,28,26,0.55)', marginBottom: 4 * u }}>
          {missing ? 'silinmiş defter' : isRoom ? 'oda defteri' : 'defter'}
        </div>
        <div style={{ font: `italic 200 ${30 * u}px/1.08 ${FONT_DISPLAY}`, letterSpacing: '-0.01em', overflowWrap: 'anywhere',
          display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {name}
        </div>
      </div>
      {held && !missing && (
        <div style={{ position: 'absolute', top: 14 * u, right: 0, pointerEvents: 'none', padding: `${5 * u}px ${12 * u}px ${5 * u}px ${10 * u}px`,
          background: '#f4d35e', color: '#1d1c1a', font: `800 ${10 * u}px ${FONT_UI}`, letterSpacing: '0.18em', textTransform: 'uppercase',
          borderRadius: `${3 * u}px 0 0 ${3 * u}px`, boxShadow: `0 ${4 * u}px ${10 * u}px -${6 * u}px rgba(0,0,0,0.7)` }}>
          elinde
        </div>
      )}
    </div>
  )
}

// ── Not balonu ───────────────────────────────────────────────────────────────
// Timeline'ın asıl öğesi; canvas tile'da da aynı öğe. Bütün ölçüler item.fontSize'a
// göre em cinsinden → 1920 px'lik canvas'ta da gerçek ölçekli timeline'da da
// orantılı görünür, köşe tutamacıyla büyütünce yazı da büyür.
// onOpenImages(images, index) / onOpenLink(link) verilirse ilgili alanlar tıklanır.
const FONT_UI = "'DM Sans', system-ui, sans-serif"
const FONT_DISPLAY = "'Fraunces', Georgia, serif"
const FONT_MONO = "'JetBrains Mono', ui-monospace, monospace"

const NoteCover = ({ images, onOpen, height = '42%', minHeight = '4em' }) => {
  const [ok, setOk] = useState(true)
  return (
    <div style={{ position: 'relative', height, minHeight, flexShrink: 0, background: '#1d1d27', overflow: 'hidden' }}>
      {ok ? (
        <img src={images[0]} alt="" draggable={false} referrerPolicy="no-referrer" onError={() => setOk(false)}
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', pointerEvents: 'none' }} />
      ) : (
        <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.4em', opacity: 0.3, pointerEvents: 'none' }}>🖼️</div>
      )}
      {(images.length > 1 || onOpen) && (
        <button type="button" title="Resimleri tam ekran gör"
          {...(onOpen ? { onMouseDown: stopEvt, onClick: (e) => { stopEvt(e); onOpen(0) } } : {})}
          style={{ position: 'absolute', right: '0.6em', bottom: '0.6em', display: 'flex', alignItems: 'center', gap: '0.35em',
            padding: '0.3em 0.65em', borderRadius: 999, border: 'none', background: 'rgba(8,8,14,0.72)', backdropFilter: 'blur(6px)',
            color: '#fff', font: `800 0.72em ${FONT_MONO}`, cursor: onOpen ? 'zoom-in' : 'inherit', pointerEvents: onOpen ? 'auto' : 'none' }}>
          ⛶{images.length > 1 ? ` ${images.length}` : ''}
        </button>
      )}
    </div>
  )
}

const cardShell = (fs) => ({
  position: 'relative', width: '100%', height: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column',
  fontSize: fs, fontFamily: FONT_UI, color: '#ece9f4', background: '#13131b', overflow: 'hidden',
  boxShadow: `inset 0 0 0 1px rgba(255,255,255,0.07), 0 0.9em 2.2em -1em rgba(0,0,0,0.7)`, userSelect: 'none',
})

// Timeline kartı zaman aralığına sığdırınca daralır; genişliğin yazı boyuna oranı
// (em) azaldıkça sadeleşir: < 13 em saat + başlık + gövde, < 4.5 em yalnız başlık.
// Tam içerik ipucunda ve çift tıkla açılan editörde.
const NoteCardNarrow = ({ item, st, em, images, onOpenImages }) => {
  const mini = em < 4.5
  const short = formatRangeShort(item.start, item.end)
  return (
    <div title={`${item.title || 'Başlıksız not'} · ${formatRange(item.start, item.end)}`}
      style={{ ...cardShell(item.fontSize || 15), borderRadius: mini ? '0.35em' : '0.6em' }}>
      <div style={{ height: '0.32em', flexShrink: 0, background: st.color }} />
      {!mini && em >= 8 && images.length > 0 && (
        <NoteCover images={images} height="26%" minHeight="2.4em" onOpen={onOpenImages ? (i) => onOpenImages(images, i) : null} />
      )}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: mini ? '0.2em' : '0.35em',
        padding: mini ? '0.35em 0.3em' : '0.55em 0.6em', overflow: 'hidden' }}>
        {!mini && short && (
          <span style={{ font: `200 0.7em ${FONT_MONO}`, color: st.color, whiteSpace: 'nowrap', overflow: 'hidden', flexShrink: 0 }}>{short}</span>
        )}
        <div style={{ font: `800 ${mini ? '0.78em' : '1em'}/1.15 ${FONT_DISPLAY}`, overflowWrap: 'anywhere', flexShrink: 0,
          color: item.title ? '#fbfaff' : 'rgba(236,233,244,0.35)' }}>
          {item.title || (mini ? '·' : 'Başlıksız')}
        </div>
        {!mini && item.body && (
          <div className="cvmd cv-textbox" data-cv-scroll="1"
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', fontSize: '0.78em', fontWeight: 300, lineHeight: 1.4,
              color: 'rgba(236,233,244,0.78)', overflowWrap: 'anywhere' }}
            dangerouslySetInnerHTML={{ __html: parseMd(item.body) }} />
        )}
      </div>
    </div>
  )
}

// width: kartın gösterildiği genişlik (timeline aralığa sığdırınca); verilmezse tam kart
export const NoteCard = ({ item, width, onOpenImages, onOpenLink }) => {
  const st = statusOf(item.status)
  const images = item.images || []
  const em = width === undefined ? Infinity : width / (item.fontSize || 15)
  if (em < 13) return <NoteCardNarrow item={item} st={st} em={em} images={images} onOpenImages={onOpenImages} />
  const range = formatRange(item.start, item.end)
  const link = item.link
  return (
    <div style={{ ...cardShell(item.fontSize || 15), borderRadius: '0.85em' }}>
      <div style={{ height: '0.32em', flexShrink: 0, background: st.color }} />
      {images.length > 0 && <NoteCover images={images} onOpen={onOpenImages ? (i) => onOpenImages(images, i) : null} />}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '0.5em', padding: '0.85em 1em 0.9em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', flexShrink: 0, minWidth: 0 }}>
          <span style={{ font: `800 0.66em ${FONT_UI}`, letterSpacing: '0.08em', textTransform: 'uppercase', color: st.color,
            background: `${st.color}1f`, padding: '0.3em 0.6em', borderRadius: 999, whiteSpace: 'nowrap', flexShrink: 0 }}>{st.label}</span>
          {range && <span style={{ font: `200 0.74em ${FONT_MONO}`, color: 'rgba(236,233,244,0.7)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{range}</span>}
        </div>
        <div style={{ font: `800 1.32em/1.15 ${FONT_DISPLAY}`, letterSpacing: '-0.01em', flexShrink: 0, wordBreak: 'break-word',
          color: item.title ? '#fbfaff' : 'rgba(236,233,244,0.35)' }}>
          {item.title || 'Başlıksız not'}
        </div>
        {item.body && (
          <div className="cvmd cv-textbox" data-cv-scroll="1"
            style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', fontSize: '0.9em', fontWeight: 300, lineHeight: 1.5,
              color: 'rgba(236,233,244,0.82)', wordBreak: 'break-word' }}
            dangerouslySetInnerHTML={{ __html: parseMd(item.body) }} />
        )}
        {!item.body && <div style={{ flex: 1 }} />}
        {item.tags?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35em', flexShrink: 0, maxHeight: '3.6em', overflow: 'hidden' }}>
            {item.tags.map(t => (
              <span key={t} style={{ font: `200 0.68em ${FONT_MONO}`, color: 'rgba(236,233,244,0.75)', border: '1px solid rgba(255,255,255,0.14)',
                borderRadius: 999, padding: '0.2em 0.6em', whiteSpace: 'nowrap' }}>#{t}</span>
            ))}
          </div>
        )}
        {link && (
          <button type="button"
            {...(onOpenLink ? { onMouseDown: stopEvt, onClick: (e) => { stopEvt(e); onOpenLink(link) } } : {})}
            title={link.kind === 'room' ? 'Odaya git' : link.url}
            style={{ display: 'flex', alignItems: 'center', gap: '0.55em', flexShrink: 0, minWidth: 0, padding: '0.45em 0.6em', borderRadius: '0.55em',
              border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.04)', color: '#c7d2fe', textAlign: 'left',
              font: `800 0.76em ${FONT_UI}`, cursor: onOpenLink ? 'pointer' : 'inherit', pointerEvents: onOpenLink ? 'auto' : 'none' }}>
            {link.kind === 'url' && link.thumbUrl
              ? <img src={link.thumbUrl} alt="" referrerPolicy="no-referrer" draggable={false} style={{ width: '2.2em', height: '2.2em', objectFit: 'cover', borderRadius: '0.35em', flexShrink: 0 }} />
              : <span style={{ fontSize: '1.3em', flexShrink: 0 }}>{link.kind === 'room' ? '🏠' : '🔗'}</span>}
            <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {link.kind === 'room' ? link.roomName || 'Oda' : link.title || link.url}
              </span>
              {link.kind === 'url' && (
                <span style={{ fontWeight: 200, fontFamily: FONT_MONO, fontSize: '0.85em', opacity: 0.65, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {link.siteName || link.url}
                </span>
              )}
            </span>
          </button>
        )}
      </div>
    </div>
  )
}
