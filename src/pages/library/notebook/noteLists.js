// Seyir defteri: lib/noteLists.ts — TypeScript'ten tipleri soyularak birebir taşındı.
import { parseContent } from './noteContent.js';
// Yapılacaklar ve numaralı liste satırları düz metnin içinde, satır başındaki işaretle tutulur:
//   "☐ süt al"  /  "☑ süt al"  /  "1. ilk madde"
export const BOX = '☐';
export const BOX_DONE = '☑';
const CHECK_PREFIX = /^[☐☑] ?/;
const NUMBER_PREFIX = /^(\d+)\. /;
function lineStart(text, at) {
    return text.lastIndexOf('\n', at - 1) + 1;
}
function lineEnd(text, at) {
    const end = text.indexOf('\n', at);
    return end === -1 ? text.length : end;
}
function numberOf(line) {
    const match = NUMBER_PREFIX.exec(line);
    return match ? Number(match[1]) : null;
}
// İmlecin olduğu satırın başındaki işareti değiştirir; imleç yazıyla birlikte kayar
function replacePrefix(text, cursor, nextPrefix) {
    const start = lineStart(text, cursor);
    const line = text.slice(start, lineEnd(text, cursor));
    const current = (CHECK_PREFIX.exec(line) ?? NUMBER_PREFIX.exec(line))?.[0] ?? '';
    const prefix = nextPrefix(line, start);
    const offset = Math.max(cursor - start - current.length, 0);
    return {
        text: text.slice(0, start) + prefix + text.slice(start + current.length),
        cursor: start + prefix.length + offset,
    };
}
// Satırı yapılacak yapar; zaten öyleyse işareti kaldırır
export function toggleCheckLine(text, cursor) {
    return replacePrefix(text, cursor, (line) => (CHECK_PREFIX.test(line) ? '' : `${BOX} `));
}
// Satırı numaralı yapar (bir üstteki numaradan devam eder); zaten öyleyse numarayı kaldırır
export function toggleNumberLine(text, cursor) {
    return replacePrefix(text, cursor, (line, start) => {
        if (NUMBER_PREFIX.test(line))
            return '';
        const above = start > 0 ? numberOf(text.slice(lineStart(text, start - 1), start - 1)) : null;
        return `${(above ?? 0) + 1}. `;
    });
}
// Kutunun işaretini değiştirir; o yerde kutu yoksa metne dokunmaz
export function toggleBox(text, offset) {
    if (text[offset] !== BOX && text[offset] !== BOX_DONE)
        return text;
    const next = text[offset] === BOX ? BOX_DONE : BOX;
    return text.slice(0, offset) + next + text.slice(offset + 1);
}
// Satır başındaki kutuların metindeki yerleri
export function boxOffsets(text) {
    const offsets = [];
    for (let i = 0; i < text.length; i++) {
        if ((text[i] === BOX || text[i] === BOX_DONE) && (i === 0 || text[i - 1] === '\n'))
            offsets.push(i);
    }
    return offsets;
}
export function isBox(char) {
    return char === BOX || char === BOX_DONE;
}
// Tek bir satır sonu eklendiyse yeri; imlecin bilinen yerleri önce denenir
function insertedNewline(prev, next, hints) {
    if (next.length !== prev.length + 1)
        return null;
    const fits = (p) => p >= 0 &&
        p <= prev.length &&
        next[p] === '\n' &&
        next.startsWith(prev.slice(0, p)) &&
        next.endsWith(prev.slice(p));
    const hinted = hints.find(fits);
    if (hinted !== undefined)
        return hinted;
    let p = 0;
    while (p < prev.length && prev[p] === next[p])
        p++;
    if (!fits(p))
        return null;
    // Art arda satır sonlarının içinde nereye eklendiği belli değil; yazılı satırın sonu sayılır
    while (p > 0 && prev[p - 1] === '\n')
        p--;
    return p;
}
// Liste satırında Enter'a basılınca alttaki satır da aynı işaretle (bir sonraki numarayla) başlar.
// Boş bir maddede basılırsa işaret silinir ve liste biter.
export function continueList(prev, next, cursor) {
    const p = insertedNewline(prev, next, [cursor, cursor - 1]);
    if (p === null)
        return null;
    const start = lineStart(next, p);
    const line = next.slice(start, p);
    const check = CHECK_PREFIX.exec(line)?.[0];
    const number = numberOf(line);
    const prefix = check ?? (number !== null ? `${number}. ` : null);
    if (prefix === null)
        return null;
    if (line.length === prefix.length) {
        return { text: next.slice(0, start) + next.slice(p + 1), cursor: start };
    }
    const nextPrefix = check !== undefined ? `${BOX} ` : `${number + 1}. `;
    return {
        text: next.slice(0, p + 1) + nextPrefix + next.slice(p + 1),
        cursor: p + 1 + nextPrefix.length,
    };
}
export function enterAction(prev, next, cursor) {
    const p = insertedNewline(prev, next, [cursor, cursor - 1]);
    if (p === null)
        return null;
    const start = lineStart(next, p);
    const line = next.slice(start, p);
    const check = CHECK_PREFIX.exec(line)?.[0];
    const number = numberOf(line);
    const prefix = check ?? (number !== null ? `${number}. ` : null);
    if (prefix !== null && line.length === prefix.length) {
        return { kind: 'edit', edit: { text: next.slice(0, start) + next.slice(p + 1), cursor: start } };
    }
    const nextPrefix = check !== undefined ? `${BOX} ` : number !== null ? `${number + 1}. ` : '';
    return { kind: 'split', at: p, prefix: nextPrefix };
}
// Notun yazısı tek satırda; ekler ve yapılacak kutuları atlanır
export function plainText(content) {
    return parseContent(content)
        .flatMap((segment) => (segment.type === 'text' ? [segment.text] : []))
        .join(' ')
        .replaceAll(BOX, '')
        .replaceAll(BOX_DONE, '')
        .replace(/\s+/g, ' ')
        .trim();
}
// Satırların sırası: from'daki satır çıkarılıp kalanların arasında to'ncu sıraya konur
export function lineOrder(count, from, to) {
    const order = Array.from({ length: count }, (_, i) => i).filter((i) => i !== from);
    order.splice(to, 0, from);
    return order;
}
// Yazının from'ncu satırı (satır sonundan satır sonuna) yukarı ya da aşağı taşınır, to'ncu
// sıraya geçer
export function moveLine(text, from, to) {
    const lines = text.split('\n');
    return lineOrder(lines.length, from, to)
        .map((i) => lines[i])
        .join('\n');
}
