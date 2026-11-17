// Seyir defteri: lib/drawing.ts — TypeScript'ten tipleri soyularak birebir taşındı.
import { inks, notebook } from '../theme.js';
// Çizim kalemleri: yazı kalemleri ve iki renk daha. Veritabanında anahtar saklanır; bilinmeyen
// anahtar normal kaleme düşer.
export const DRAW_COLORS = [
    ...inks.map((ink) => ({ key: ink.key, name: ink.name, color: ink.color })),
    { key: 'orange', name: 'Turuncu kalem', color: '#D9742B' },
    { key: 'purple', name: 'Mor kalem', color: '#6B48A8' },
];
export const DEFAULT_DRAW_COLOR = 'graphite';
export function drawColorOf(key) {
    return (DRAW_COLORS.find((c) => c.key === key) ?? DRAW_COLORS[0]).color;
}
// Kalemin sayfadaki kalınlıkları (içerik birimi). Çizgi, zoom ne olursa olsun sayfada bu
// kalınlıkta çıkar: büyütülmüş sayfada çizilen çizgi de küçültülünce ötekilerle aynı kalınlıktadır.
export const DRAW_SIZES = [
    { key: 'fine', name: 'İnce', width: 1.6 },
    { key: 'medium', name: 'Orta', width: 3 },
    { key: 'bold', name: 'Kalın', width: 6 },
];
export const DEFAULT_DRAW_SIZE = 'medium';
export function drawWidthOf(key) {
    return (DRAW_SIZES.find((s) => s.key === key) ?? DRAW_SIZES[1]).width;
}
export const DEFAULT_DRAW_PEN = { color: DEFAULT_DRAW_COLOR, size: DEFAULT_DRAW_SIZE };
export function parseStrokes(json) {
    if (!json)
        return [];
    try {
        const list = JSON.parse(json);
        return Array.isArray(list)
            ? list.filter((s) => s && Array.isArray(s.p) && s.p.length >= 2)
            : [];
    }
    catch {
        return [];
    }
}
export function serializeStrokes(list) {
    return list.length > 0 ? JSON.stringify(list) : '';
}
// Çizginin yolu: noktalar aralarındaki orta noktalardan geçen eğrilerle birleşir, el titremesi
// yumuşar. Tek noktalık çizgi yuvarlak uçlu kısa bir çizgiyle nokta olur.
export function strokePath(p) {
    'worklet';
    const n = p.length / 2;
    if (n === 0)
        return '';
    const f = (v) => Math.round(v * 10) / 10;
    if (n === 1)
        return `M${f(p[0])} ${f(p[1])}l0.01 0`;
    let d = `M${f(p[0])} ${f(p[1])}`;
    for (let i = 1; i < n - 1; i++) {
        const x = p[i * 2];
        const y = p[i * 2 + 1];
        const mx = (x + p[i * 2 + 2]) / 2;
        const my = (y + p[i * 2 + 3]) / 2;
        d += `Q${f(x)} ${f(y)} ${f(mx)} ${f(my)}`;
    }
    d += `L${f(p[n * 2 - 2])} ${f(p[n * 2 - 1])}`;
    return d;
}
// Noktanın (x, y) doğru parçasına [a, b] uzaklığının karesi
function segmentDistance2(x, y, ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len));
    const px = ax + t * dx - x;
    const py = ay + t * dy - y;
    return px * px + py * py;
}
// Silgi (x, y) çevresinde r yarıçapında bir yere değdi: değdiği çizgiler bütünüyle kalkar
export function strokeHit(stroke, x, y, r) {
    const reach = r + stroke.w / 2;
    const reach2 = reach * reach;
    const p = stroke.p;
    if (p.length === 2)
        return segmentDistance2(x, y, p[0], p[1], p[0], p[1]) <= reach2;
    for (let i = 0; i + 3 < p.length; i += 2) {
        if (segmentDistance2(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= reach2)
            return true;
    }
    return false;
}
// Çizimin en alt noktası; sayfa en az bu kadar uzar ki çizim kaydırılınca kesilmesin
export function strokesBottom(list) {
    let bottom = 0;
    for (const s of list) {
        for (let i = 1; i < s.p.length; i += 2)
            bottom = Math.max(bottom, s.p[i] + s.w);
    }
    return bottom > 0 ? bottom + notebook.lineHeight : 0;
}
// Çizgilerin hepsini içine alan dikdörtgen (kalınlıkları dahil); çizgi yoksa null
export function strokesBounds(list) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const s of list) {
        const r = s.w / 2;
        for (let i = 0; i + 1 < s.p.length; i += 2) {
            x0 = Math.min(x0, s.p[i] - r);
            y0 = Math.min(y0, s.p[i + 1] - r);
            x1 = Math.max(x1, s.p[i] + r);
            y1 = Math.max(y1, s.p[i + 1] + r);
        }
    }
    return x0 === Infinity ? null : { x0, y0, x1, y1 };
}
// Çizginin bir noktası dikdörtgenin içindeyse çizgi seçilmiş sayılır
export function strokeInRect(stroke, rect) {
    const p = stroke.p;
    for (let i = 0; i + 1 < p.length; i += 2) {
        if (p[i] >= rect.x0 && p[i] <= rect.x1 && p[i + 1] >= rect.y0 && p[i + 1] <= rect.y1) {
            return true;
        }
    }
    return false;
}
// Çizgilerin (dx, dy) kadar kaymış kopyaları
export function moveStrokes(list, dx, dy) {
    return list.map((s) => ({
        ...s,
        p: s.p.map((v, i) => Math.round((v + (i % 2 === 0 ? dx : dy)) * 10) / 10),
    }));
}
