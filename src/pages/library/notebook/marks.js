// Seyir defteri: lib/marks.ts — TypeScript'ten tipleri soyularak birebir taşındı.
import { isBox, lineOrder } from './noteLists.js';
import { DEFAULT_HIGHLIGHTER, DEFAULT_INK } from '../theme.js';
export const DEFAULT_PEN = { ink: DEFAULT_INK, active: false, color: DEFAULT_HIGHLIGHTER };
export function parseMarks(json) {
    if (!json)
        return [];
    try {
        const list = JSON.parse(json);
        return Array.isArray(list) ? list : [];
    }
    catch {
        return [];
    }
}
export function serializeMarks(list) {
    return list.length > 0 ? JSON.stringify(list) : '';
}
// Sıraya dizer, boş kalanları atar, uç uca değen aynı renk işaretleri birleştirir
function normalize(list) {
    const sorted = list.filter((m) => m.end > m.start).sort((a, b) => a.start - b.start);
    const merged = [];
    for (const m of sorted) {
        const last = merged[merged.length - 1];
        if (last && last.color === m.color && last.end >= m.start) {
            last.end = Math.max(last.end, m.end);
        }
        else {
            merged.push({ ...m });
        }
    }
    return merged;
}
// Eski ve yeni içeriğin farkı: ortak baştan (head) sonra eski içerikte removedEnd'e kadarki kısım
// silinmiş, yerine inserted uzunluğunda yazı girmiştir; ortak son kısım aynı kalmıştır
function diff(before, after) {
    const max = Math.min(before.length, after.length);
    let head = 0;
    while (head < max && before[head] === after[head])
        head++;
    let tail = 0;
    while (tail < max - head && before[before.length - 1 - tail] === after[after.length - 1 - tail]) {
        tail++;
    }
    return {
        head,
        removedEnd: before.length - tail,
        inserted: after.length - tail - head,
        delta: after.length - before.length,
    };
}
// İçerik değişince işaretler yazıyla birlikte kayar: silinen yazının işareti de gider; işaretli
// yerin tam ortasına yazılan yazı işaretli olur, kenarına yazılan olmaz.
export function shiftMarks(list, before, after) {
    if (list.length === 0 || before === after)
        return list;
    const { head, removedEnd, inserted, delta } = diff(before, after);
    return normalize(list.map((m) => ({
        start: m.start < head ? m.start : m.start >= removedEnd ? m.start + delta : head + inserted,
        end: m.end <= head ? m.end : m.end >= removedEnd ? m.end + delta : head,
        color: m.color,
    })));
}
// Aralığı verilen renkle işaretler; renk null ise aralıktaki işaretleri siler
function setRange(list, start, end, color) {
    const rest = [];
    for (const m of list) {
        if (m.end <= start || m.start >= end) {
            rest.push(m);
            continue;
        }
        if (m.start < start)
            rest.push({ ...m, end: start });
        if (m.end > end)
            rest.push({ ...m, start: end });
    }
    return normalize(color ? [...rest, { start, end, color }] : rest);
}
// Fosforlu kalem bir aralıktan geçer: aralık zaten baştan sona bu renkse boya silinir, değilse
// aralıktaki eski boyanın üstü bu renge boyanır
export function paintHighlight(list, start, end, color) {
    if (end <= start)
        return list;
    const covered = list.some((m) => m.color === color && m.start <= start && m.end >= end);
    return setRange(list, start, end, covered ? null : color);
}
// Seçili yazıya renk seçildi: fosforlu kalemle aralığın üstü bu renge boyanır (eski boyanın da
// üstünden geçilir), yazı kalemiyle aralığın yazısı bu renk olur. Normal kalemin rengi saklanmaz.
export function setHighlight(list, start, end, color) {
    return end > start ? setRange(list, start, end, color) : list;
}
export function setInk(list, start, end, ink) {
    return end > start ? setRange(list, start, end, ink === DEFAULT_INK ? null : ink) : list;
}
// Yazının rengi: eski yazının rengi yazıyla birlikte kayar, yeni yazılan yazı elde tutulan
// kalemin renginde olur. Normal kalemin rengi saklanmaz.
export function inkText(list, before, after, ink) {
    if (before === after)
        return list;
    const { head, inserted } = diff(before, after);
    const shifted = shiftMarks(list, before, after);
    if (inserted === 0)
        return shifted;
    return setRange(shifted, head, head + inserted, ink === DEFAULT_INK ? null : ink);
}
// İçeriğin [from, to) kısmına düşen işaretler, o kısmın başına göre
export function marksIn(list, from, to) {
    return list
        .filter((m) => m.end > from && m.start < to)
        .map((m) => ({
        start: Math.max(m.start, from) - from,
        end: Math.min(m.end, to) - from,
        color: m.color,
    }));
}
// İçeriğin from noktasından başlayan yazısında bir satır taşınınca (bkz. lib/noteLists moveLine)
// işaretler satırlarıyla birlikte gider. Yazının uzunluğu değişmediği için yazının dışındaki
// işaretler yerinde kalır; satır sonlarının üstündeki işaret düşer.
export function moveLineMarks(list, at, text, from, to) {
    if (list.length === 0)
        return list;
    const lines = text.split('\n');
    const starts = [];
    lines.reduce((offset, line) => {
        starts.push(offset);
        return offset + line.length + 1;
    }, at);
    // Her satırın yeni başlangıcı
    const moved = [];
    lineOrder(lines.length, from, to).reduce((offset, line) => {
        moved[line] = offset;
        return offset + lines[line].length + 1;
    }, at);
    const end = at + text.length;
    const result = [];
    for (const m of list) {
        if (m.start < at)
            result.push({ ...m, end: Math.min(m.end, at) });
        if (m.end > end)
            result.push({ ...m, start: Math.max(m.start, end) });
        lines.forEach((line, i) => {
            const start = Math.max(m.start, starts[i]);
            const stop = Math.min(m.end, starts[i] + line.length);
            if (stop > start) {
                result.push({ start: moved[i] + start - starts[i], end: moved[i] + stop - starts[i], color: m.color });
            }
        });
    }
    return normalize(result);
}
// Şu anki saat, "SS:DD"
export function clockTime(date = new Date()) {
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
// "SS:DD" yazısını saat ve dakikaya ayırır; okunamazsa null
export function parseClockTime(time) {
    const match = time && /^(\d{1,2}):(\d{2})$/.exec(time.trim());
    if (!match)
        return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59)
        return null;
    return { hours, minutes };
}
export function formatClockTime(hours, minutes) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
// Bir bloğun içindeki kutulu satırların saatleri de işaret olarak tutulur: kutu karakterinin
// üstünde, rengi yerine saati. Yazıyla birlikte kayarlar, kutu silinince saati de gider; kutu
// işaretlenince (☐ ↔ ☑) saati değişmez. Kutu konunca saat kendiliğinden atanmaz, bloğun saatini
// yalnızca saat düğmesi koyar.
export function shiftBoxTimes(list, before, after) {
    if (before === after)
        return list;
    if (before.length === after.length) {
        let changed = -1;
        let count = 0;
        for (let i = 0; i < before.length && count < 2; i++) {
            if (before[i] !== after[i]) {
                changed = i;
                count++;
            }
        }
        if (count === 1 && isBox(before[changed]) && isBox(after[changed]))
            return list;
    }
    return shiftMarks(list, before, after);
}
