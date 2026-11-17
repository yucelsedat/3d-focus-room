// Seyir defteri: components/notebook/NotebookPage.tsx loadHeading + paperSeed — sayfanın başlığı,
// altındaki satır, "bugün / bu hafta / bu ay" işareti ve boş sayfanın ipucu. Ajandanın gün ve
// hafta sayfaları tarihin sayısıyla gelir (bkz. model.js dateRef).
import { formatDate, formatWeekRange, monthWeekMondays, todayISO, weekOf } from '../isoWeeks.js'
import { DAY_NAMES, refDate } from '../model.js'
import { monthOfRef, sheetHeading } from '../notebookLayout.js'

// Haftanın ayı, yılı ve aydaki sırası
function weekInfo(monday) {
  const { year, month } = weekOf(monday)
  return { year, weekNo: monthWeekMondays(year, month).indexOf(monday) + 1 }
}

// page: { kind, ref }; title: not defterinin sayfasına (ya da pano notuna) yazılan başlık;
// boardNote: pano notunun kaydı (tutturulduğu gün)
export function pageHeading(page, title = '', boardNote = null) {
  switch (page.kind) {
    // Pano notu: başlığı elle yazılır, altında panoya tutturulduğu gün
    case 'board':
      return {
        title,
        meta: `Pano · ${boardNote ? formatDate(boardNote.created_at.slice(0, 10)) : ''}`,
        now: null,
        hint: 'Notunu yaz',
      }
    case 'page':
      return { ...sheetHeading({ kind: 'page', number: page.ref }, title), hint: 'Yazmaya başla' }
    case 'month-goals':
    case 'month-review':
      return {
        ...sheetHeading({ kind: page.kind, ...monthOfRef(page.ref) }),
        hint: page.kind === 'month-goals' ? 'Ayın hedeflerini yaz' : 'Ayı değerlendir',
      }
    case 'day': {
      const date = refDate(page.ref)
      const monday = weekOf(date).monday
      const index = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
      return {
        title: DAY_NAMES[index],
        meta: `${formatDate(date)} · ${weekInfo(monday).weekNo}. Hafta`,
        now: date === todayISO() ? 'bugün' : null,
        hint: 'Bugünü yaz',
      }
    }
    default: {
      // Haftanın hedefler ve değerlendirme sayfası
      const monday = refDate(page.ref)
      const { year, weekNo } = weekInfo(monday)
      const range = `${formatWeekRange(monday)} ${year}`
      const now = monday === weekOf(todayISO()).monday ? 'bu hafta' : null
      return page.kind === 'goals'
        ? { title: `${weekNo}. Hafta`, meta: `Hedefler · ${range}`, now, hint: 'Haftanın hedeflerini yaz' }
        : { title: `${weekNo}. Hafta Değerlendirme`, meta: range, now, hint: 'Haftayı değerlendir' }
    }
  }
}

// Defterde üst üste duran sayfaların kâğıt dokusu birbirinden farklı olsun
export function paperSeed(page) {
  switch (page.kind) {
    case 'board':
      return 4_000_000 + page.ref
    case 'page':
      return 2_000_000 + page.ref
    case 'day':
      return page.ref % 1_000_000
    case 'goals':
    case 'review':
      return 1_000_000 + ((page.ref % 1_000_000) * 2 + (page.kind === 'review' ? 1 : 0))
    default:
      return 3_000_000 + (page.ref % 100_000) * 2 + (page.kind === 'month-review' ? 1 : 0)
  }
}
