// Seyir defteri temasının (src/theme/index.ts) web karşılığı. Renkler birebir aynı; RN font
// adları CSS font-family + weight çiftlerine çevrildi (fontlar index.html'de Google Fonts'tan).

export const colors = {
  ink: '#14213D',
  inkSoft: '#3A4A6B',
  paper: '#F4EFE6',
  card: '#FFFDF8',
  line: '#E2D9C8',
  accent: '#C8553D',
  onInk: '#F4EFE6',
  today: '#2E9E5B',
  todaySoft: '#EAF6EE',
}

const FRAUNCES = "'Fraunces', Georgia, serif"
const DM_SANS = "'DM Sans', system-ui, sans-serif"
const CAVEAT = "'Caveat', cursive"
const MONO = "'JetBrains Mono', ui-monospace, monospace"

// { fontFamily, fontWeight, fontStyle } — style nesnesine yayılır
export const fonts = {
  displayBold: { fontFamily: FRAUNCES, fontWeight: 800 },
  displayThin: { fontFamily: FRAUNCES, fontWeight: 200 },
  bodyBold: { fontFamily: DM_SANS, fontWeight: 800 },
  bodyThin: { fontFamily: DM_SANS, fontWeight: 200 },
  hand: { fontFamily: CAVEAT, fontWeight: 400 },
  handBold: { fontFamily: CAVEAT, fontWeight: 700 },
  // PDF defterinin yazısı: gövde ince DM Sans, kalın yerler ekstra kalın, başlıklar Fraunces
  docBody: { fontFamily: DM_SANS, fontWeight: 300 },
  docItalic: { fontFamily: DM_SANS, fontWeight: 300, fontStyle: 'italic' },
  docBoldItalic: { fontFamily: DM_SANS, fontWeight: 800, fontStyle: 'italic' },
  docHeadingSemi: { fontFamily: FRAUNCES, fontWeight: 600 },
  docHeadingBold: { fontFamily: FRAUNCES, fontWeight: 700 },
  mono: { fontFamily: MONO, fontWeight: 300 },
}

// Defter sayfası: kâğıt, mavi satır çizgileri, kırmızı kenar boşluğu, grafit kalem
export const notebook = {
  paper: '#FBF7EC',
  paperEdge: '#8A7348',
  rule: '#A9C1DA',
  margin: '#E08A8A',
  graphite: '#38383D',
  lineHeight: 34,
  marginX: 44,
}

// Yazı kalemleri: notlarda yeni yazılan yazı seçili kalemin renginde olur; notlarda key saklanır
export const inks = [
  { key: 'graphite', name: 'Normal kalem', color: '#38383D' },
  { key: 'red', name: 'Kırmızı kalem', color: '#C2322B' },
  { key: 'blue', name: 'Mavi kalem', color: '#2148A6' },
  { key: 'green', name: 'Yeşil kalem', color: '#257A45' },
]

export const DEFAULT_INK = 'graphite'

// Bilinmeyen bir anahtar normal kaleme düşer
export function inkOf(key) {
  return inks.find((i) => i.key === key) ?? inks[0]
}

// Fosforlu kalemler: notlarda yazının üstünden geçilir. Notlarda key saklanır.
export const highlighters = [
  { key: 'yellow', name: 'Sarı', color: '#FFE930' },
  { key: 'green', name: 'Yeşil', color: '#5CFF3A' },
  { key: 'pink', name: 'Pembe', color: '#FF5FB0' },
  { key: 'orange', name: 'Turuncu', color: '#FF9F2E' },
  { key: 'blue', name: 'Mavi', color: '#3CD8FF' },
  { key: 'purple', name: 'Mor', color: '#B98CFF' },
]

export const DEFAULT_HIGHLIGHTER = 'green'

// Bilinmeyen bir anahtar varsayılan kaleme düşer
export function highlighterOf(key) {
  return highlighters.find((h) => h.key === key) ?? highlighters[1]
}

// Yazının altına sürülen boya: kâğıt ve yazı arkadan görünsün diye yarı saydam
export function highlightFill(key, alpha = 0.5) {
  const n = parseInt(highlighterOf(key).color.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

// Defter sayfasının seçim, okuma ve ayraç boyaları
export const notebookFills = {
  bookmarkFill: '#C8553D',
  readingFill: 'rgba(169, 193, 218, 0.6)',
  filterFill: 'rgba(224, 138, 138, 0.45)',
  drawingFill: 'rgba(169, 193, 218, 0.6)',
  selectionTint: 'rgba(169, 193, 218, 0.3)',
  selectionEdge: 'rgba(79, 127, 175, 0.5)',
  selectionInk: '#3F6E9E',
  marquee: 'rgba(63, 110, 158, 0.85)',
  marqueeFill: 'rgba(169, 193, 218, 0.14)',
}

// PDF defterinin sayfası: kenardan kenara düz beyaz, üstünde basılı yazı
export const docPage = {
  sheet: '#FFFFFF',
  ink: '#24292F',
  muted: '#57606A',
  faint: 'rgba(36, 41, 47, 0.32)',
  rule: '#D0D7DE',
  link: '#0B5CAD',
  codeBg: '#1C2128',
  codeInk: '#E6EDF3',
  codeLabel: '#9DA7B3',
  inlineCodeBg: 'rgba(27, 31, 35, 0.07)',
  quoteBar: '#D0D7DE',
  check: '#2E7D4F',
  fontSize: 15.5,
  lineHeight: 24,
  gutter: 28,
  edge: 8,
}

// Kitaplık: koyu ceviz arka duvar, açık kenarlı ahşap raflar
export const shelf = {
  wall: '#2B2620',
  wood: '#7A5435',
  woodTop: '#A0714A',
  woodEdge: '#563A24',
}

// Defter kapağının renkleri: kapak bezi ve onunla uyumlu lastik bant. Veritabanında anahtar saklanır.
export const bookColors = {
  ink: { name: 'Lacivert', cover: '#14213D', band: '#C8553D' },
  bordo: { name: 'Bordo', cover: '#7A1F2B', band: '#E2B34A' },
  forest: { name: 'Orman yeşili', cover: '#1F4D3A', band: '#E8A33D' },
  olive: { name: 'Zeytin', cover: '#5B6236', band: '#F4EFE6' },
  plum: { name: 'Mor', cover: '#3D2C5C', band: '#E08A8A' },
  terracotta: { name: 'Kiremit', cover: '#B5502F', band: '#2B2620' },
  mustard: { name: 'Hardal', cover: '#C9962B', band: '#14213D' },
  sand: { name: 'Kum', cover: '#D8C7A3', band: '#7A1F2B' },
  charcoal: { name: 'Kömür', cover: '#2E2E30', band: '#C8553D' },
}

export const DEFAULT_BOOK_COLOR = 'ink'

// Bilinmeyen bir anahtar (ör. palet değiştiyse) varsayılan renge düşer
export function bookColorOf(key) {
  return bookColors[key] ?? bookColors[DEFAULT_BOOK_COLOR]
}

// Tip ölçeği: başlıklar büyük, etiketler küçük
export const type = {
  caption: 11,
  body: 15,
  title: 22,
  display: 40,
}

// El yazısı sağa yatık; web kırpmadığı için mobildeki kuyruk payına gerek yok, ama yazılar
// mobildeki gibi bölünmeyen bir boşlukla biter ki ölçüler aynı kalsın
export const HAND_TAIL = ' '

// Takvimde her ayın rengi: hafta numarasının sekmesi ve üstündeki yazı
export const monthColors = [
  { tab: '#8E2F3C', text: '#F4EFE6' },
  { tab: '#D9A73E', text: '#14213D' },
  { tab: '#8A8B4A', text: '#F4EFE6' },
  { tab: '#5E7F4E', text: '#F4EFE6' },
  { tab: '#2F5D4F', text: '#F4EFE6' },
  { tab: '#2C4A6E', text: '#F4EFE6' },
  { tab: '#7E5A82', text: '#F4EFE6' },
  { tab: '#5C5A4C', text: '#F4EFE6' },
  { tab: '#9AA08A', text: '#14213D' },
  { tab: '#C8783D', text: '#F4EFE6' },
  { tab: '#5B3F66', text: '#F4EFE6' },
  { tab: '#B5643F', text: '#F4EFE6' },
]

// Haftanın şeridi: ayın rengi kart rengine karışır, ayın ilk haftası en açık, son haftası en koyu.
// Üstündeki yazı, şeride karşı daha okunaklı olan koyu ya da açık renktir.
export function weekTint(month, weekIndex, weekCount) {
  const ratio = 0.16 + (0.42 * weekIndex) / Math.max(1, weekCount - 1)
  const fill = mixHex(colors.card, monthColors[month - 1].tab, ratio)
  const onFill = contrast(fill, colors.ink) >= contrast(fill, colors.onInk) ? colors.ink : colors.onInk
  return { fill, text: onFill }
}

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function mixHex(from, to, ratio) {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  return `#${a.map((c, i) => Math.round(c + (b[i] - c) * ratio).toString(16).padStart(2, '0')).join('')}`
}

// WCAG göreli parlaklık ve kontrast oranı
function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

// Pano: ceviz çerçeve, mantar ve taneleri
export const board = {
  frame: '#563A24',
  cork: '#B98A5B',
  corkDark: '#7E5330',
  corkLight: '#DDB582',
}

// Notları panoya tutturan raptiyelerin başları; bilinmeyen anahtar ilk renge düşer
export const pinColors = {
  red: { head: '#C8392B', rim: '#8E2118' },
  blue: { head: '#2F62B5', rim: '#1C3E78' },
  yellow: { head: '#E8B830', rim: '#A57C12' },
  green: { head: '#2E8B57', rim: '#1B5A37' },
  white: { head: '#F1ECE2', rim: '#B9B0A0' },
}

export function pinColorOf(key) {
  return pinColors[key] ?? pinColors.red
}
