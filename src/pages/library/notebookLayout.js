// Seyir defteri: lib/notebookLayout.ts — TypeScript'ten tipleri soyularak birebir taşındı.
import { MONTH_NAMES, monthWeekMondays, parseISODate, todayISO, toISODate, weekOf, } from './isoWeeks.js';
const DAY_MS = 24 * 60 * 60 * 1000;
// Yılı seçilmemiş (ilk) ajandaların sayfaları 2000'in ilk haftasından 2099'un sonuna kadar
export const FIRST_YEAR = 2000;
export const LAST_YEAR = 2099;
export function filterKindOf(kind) {
    return kind === 'month-habits' || kind === 'week-habits' ? 'habits' : kind;
}
// "2026-01"
export function monthKey(year, month) {
    return `${year}-${String(month).padStart(2, '0')}`;
}
// Ayın sayfalarının veritabanındaki kimliği: yıl × 100 + ay
export function monthRef(year, month) {
    return year * 100 + month;
}
export function monthOfRef(ref) {
    return { year: Math.floor(ref / 100), month: ref % 100 };
}
// Kalınan sayfa, ayraç ve takvimden açılan sayfa bu anahtarla bulunur: gün için tarih, haftanın
// sayfaları için "pazartesi:tür", ayın sayfaları için "YYYY-AA:tür", not defterinde "page:numara"
export function slotKey(slot) {
    switch (slot.kind) {
        case 'day':
            return slot.date;
        case 'goals':
        case 'review':
        case 'week-habits':
            return `${slot.monday}:${slot.kind}`;
        case 'month-goals':
        case 'month-review':
        case 'month-habits':
            return `${monthKey(slot.year, slot.month)}:${slot.kind}`;
        case 'page':
            return `page:${slot.number}`;
    }
}
// Yazılı sayfanın anahtarı
export function writtenKey(page) {
    switch (page.kind) {
        case 'day':
            return page.at;
        case 'goals':
        case 'review':
            return `${page.at}:${page.kind}`;
        case 'month-goals':
        case 'month-review': {
            const { year, month } = monthOfRef(page.ref);
            return `${monthKey(year, month)}:${page.kind}`;
        }
        case 'page':
            return `page:${page.ref}`;
        case 'habits':
            // Aylık sayfanın dönemi "YYYY-AA", haftalığınki pazartesinin tarihi
            return `${page.at}:${page.at.length === 7 ? 'month-habits' : 'week-habits'}`;
    }
}
const notesLayout = {
    count: Number.MAX_SAFE_INTEGER,
    slotAt: (index) => ({ kind: 'page', number: index + 1 }),
    find: (key) => {
        const match = /^page:(\d+)$/.exec(key);
        return match ? Number(match[1]) - 1 : -1;
    },
    nearest: (key) => Math.max(0, notesLayout.find(key)),
    start: () => 0,
    kinds: ['page'],
};
const agendaLayouts = new Map();
// Not defteri ve PDF takvimden bağımsız, numaralı sayfalardan oluşur; son sayfa çevrildikçe uzar
export function hasNumberedPages(kind) {
    return kind !== 'agenda';
}
export function layoutOf(notebook) {
    if (hasNumberedPages(notebook.kind))
        return notesLayout;
    const id = [
        notebook.year,
        notebook.weekly_pages,
        notebook.month_goals,
        notebook.month_review,
        notebook.habits,
    ].join('|');
    let layout = agendaLayouts.get(id);
    if (!layout) {
        layout = agendaLayout(notebook);
        agendaLayouts.set(id, layout);
    }
    return layout;
}
// Ajandanın sayfaları ay ay dizilir: ayın hedefleri ve alışkanlıkları, ardından haftalar (her
// hafta hedefler, alışkanlıklar, pazartesi … pazar, değerlendirme), en sonda ayın değerlendirmesi.
// Haftalar ISO kuralıyla aylara dağıtılır (bkz. lib/isoWeeks).
function yearSlots(settings, year) {
    const slots = [];
    for (let month = 1; month <= 12; month++) {
        if (settings.month_goals)
            slots.push({ kind: 'month-goals', year, month });
        if (settings.habits === 'month')
            slots.push({ kind: 'month-habits', year, month });
        for (const monday of monthWeekMondays(year, month)) {
            if (settings.weekly_pages)
                slots.push({ kind: 'goals', monday });
            if (settings.habits === 'week')
                slots.push({ kind: 'week-habits', monday });
            const start = parseISODate(monday).getTime();
            for (let d = 0; d < 7; d++) {
                slots.push({ kind: 'day', date: toISODate(new Date(start + d * DAY_MS)) });
            }
            if (settings.weekly_pages)
                slots.push({ kind: 'review', monday });
        }
        if (settings.month_review)
            slots.push({ kind: 'month-review', year, month });
    }
    return slots;
}
// Yılın sayfa sayısı, sayfaları dizmeden
function yearPageCount(settings, year) {
    const perWeek = 7 + (settings.weekly_pages ? 2 : 0) + (settings.habits === 'week' ? 1 : 0);
    const perMonth = settings.month_goals + settings.month_review + (settings.habits === 'month' ? 1 : 0);
    let count = 0;
    for (let month = 1; month <= 12; month++) {
        count += perMonth + monthWeekMondays(year, month).length * perWeek;
    }
    return count;
}
// Anahtardaki tarih ("YYYY-AA" ayın ilk günü sayılır); tarih yoksa (ör. not defterinin sayfası) null
function dateOfKey(key) {
    const date = key.split(':')[0];
    if (/^\d{4}-\d{2}$/.test(date))
        return `${date}-01`;
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}
// Anahtarın ajandadaki yılı: ayın sayfaları adındaki yıla, gün ve haftalar perşembesinin düştüğü
// ayın yılına aittir (31 Aralık 2025, 2026'nın ilk haftasındadır)
function yearOfKey(key) {
    const date = key.split(':')[0];
    if (/^\d{4}-\d{2}$/.test(date))
        return Number(date.slice(0, 4));
    return /^\d{4}-\d{2}-\d{2}$/.test(date) ? weekOf(date).year : null;
}
// Yılsız ajandada 100 yılın sayfaları bir anda dizilmez: her yılın yalnızca sayfa sayısı
// hesaplanır, sayfaları o yıldan bir sayfa ilk istendiğinde dizilir.
function agendaLayout(settings) {
    const first = settings.year ?? FIRST_YEAR;
    const last = settings.year ?? LAST_YEAR;
    // Her yılın ilk sayfasının numarası
    const offsets = [];
    let count = 0;
    for (let year = first; year <= last; year++) {
        offsets.push(count);
        count += yearPageCount(settings, year);
    }
    const years = new Map();
    function pagesOf(year) {
        let pages = years.get(year);
        if (!pages) {
            const offset = offsets[year - first];
            const slots = yearSlots(settings, year);
            const indices = new Map();
            const days = [];
            slots.forEach((slot, i) => {
                indices.set(slotKey(slot), offset + i);
                if (slot.kind === 'day')
                    days.push({ date: slot.date, index: offset + i });
            });
            pages = { slots, indices, days };
            years.set(year, pages);
        }
        return pages;
    }
    function slotAt(index) {
        let lo = 0;
        let hi = offsets.length - 1;
        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            if (offsets[mid] <= index)
                lo = mid;
            else
                hi = mid - 1;
        }
        return pagesOf(first + lo).slots[index - offsets[lo]];
    }
    function find(key) {
        const year = yearOfKey(key);
        if (year === null || year < first || year > last)
            return -1;
        return pagesOf(year).indices.get(key) ?? -1;
    }
    function nearest(key) {
        const exact = find(key);
        if (exact !== -1)
            return exact;
        const date = dateOfKey(key);
        const year = yearOfKey(key);
        if (date === null || year === null || year < first)
            return pagesOf(first).days[0].index;
        if (year > last)
            return pagesOf(last).days.at(-1).index;
        const { days } = pagesOf(year);
        let lo = 0;
        let hi = days.length - 1;
        while (lo < hi) {
            const mid = (lo + hi) >> 1;
            if (days[mid].date < date)
                lo = mid + 1;
            else
                hi = mid;
        }
        return days[lo].index;
    }
    const kinds = [
        ...(settings.month_goals ? ['month-goals'] : []),
        ...(settings.weekly_pages ? ['goals'] : []),
        'day',
        ...(settings.weekly_pages ? ['review'] : []),
        ...(settings.month_review ? ['month-review'] : []),
        ...(settings.habits !== 'none' ? ['habits'] : []),
    ];
    return {
        count,
        slotAt,
        find,
        nearest,
        start: () => nearest(todayISO()),
        kinds,
    };
}
// Ayın sayfalarının ve not defterinin sayfasının başlığı; "now", sayfa bu aya aitse. Not
// defterinin sayfasında başlık, sayfaya yazılan başlıktır (yazılmamışsa boş); numarası alt satırda
export function sheetHeading(slot, pageTitle = '') {
    if (slot.kind === 'page') {
        return { title: pageTitle, meta: `Sayfa ${slot.number} · Not defteri`, now: null };
    }
    const name = MONTH_NAMES[slot.month - 1];
    const today = weekOf(todayISO());
    const now = today.year === slot.year && today.month === slot.month ? 'bu ay' : null;
    return slot.kind === 'month-goals'
        ? { title: `${name} Hedefleri`, meta: `Aylık hedefler · ${slot.year}`, now }
        : { title: `${name} Değerlendirme`, meta: `Aylık değerlendirme · ${slot.year}`, now };
}
