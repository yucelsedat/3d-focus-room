// Seyir defteri: lib/imageLayout.ts — TypeScript'ten tipleri soyularak birebir taşındı.
import { notebook } from '../theme.js';
const LH = notebook.lineHeight;
// Fotoğrafın üstünde ve altında satır çizgisiyle arasında kalan pay
export const IMAGE_PAD = 10;
// Fotoğrafın beyaz kenarı
export const IMAGE_BORDER = 4;
// Resmin yanında yazı ancak bu kadar genişlik kalırsa yazılır; yoksa resim kendi satırlarını kaplar
const MIN_SIDE = 96;
// Resimle yanındaki yazı arasındaki boşluk (hafif yamuk resmin köşesi de buna sığar)
const SIDE_GAP = 12;
// Beyaz kenarlı fotoğrafın boyutu; satır genişliğine sığmazsa küçülür
export function frameSize(height, ratio, maxWidth) {
    let h = height;
    let w = (h - IMAGE_BORDER * 2) * ratio + IMAGE_BORDER * 2;
    if (maxWidth > 0 && w > maxWidth) {
        w = maxWidth;
        h = (w - IMAGE_BORDER * 2) / ratio + IMAGE_BORDER * 2;
    }
    return { w, h };
}
export function imageFrame(image, maxWidth) {
    return frameSize(image.lines * LH - IMAGE_PAD, image.width / image.height, maxWidth);
}
// Resmin sol kenarının satırın başından uzaklığı
export function imageLeft(x, frameWidth, width) {
    return x * Math.max(0, width - frameWidth);
}
export function intersects(a, b) {
    return a.top < b.bottom - 1 && b.top < a.bottom - 1 && a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1;
}
export function imageRect(image, row, x, width) {
    const frame = imageFrame(image, width);
    const x0 = imageLeft(x, frame.w, width);
    return { top: row * LH, bottom: (row + image.lines) * LH, x0, x1: x0 + frame.w };
}
// Bloğun resimleri bloğun içinde yüzer: yanında yazıya yer kalırsa yazı yanından akar, kalmazsa
// yazı altına itilir. Satırı elle ayarlanan resim bloğun o satırında, ayarlanmayan eklendiği yerde
// (anchorTop: önündeki yazının altı) durur. Resimler üst üste binmez: bir öncekine değen resim onun
// altına iner. Resimler içerikteki sırasıyla verilir; yeri henüz ölçülmeyen resim atlanır.
export function layoutBlockImages(images, width) {
    const placed = [];
    if (width <= 0)
        return placed;
    for (const { index, image, anchorTop } of images) {
        if (image.row === undefined && anchorTop === undefined)
            continue;
        let row = Math.max(0, image.row ?? Math.round((anchorTop ?? 0) / LH));
        let rect = imageRect(image, row, image.x, width);
        for (let hit = placed.find((p) => intersects(p, rect)); hit;) {
            row = hit.row + hit.image.lines;
            rect = imageRect(image, row, image.x, width);
            hit = placed.find((p) => intersects(p, rect));
        }
        const freeLeft = rect.x0 - SIDE_GAP;
        const freeRight = width - rect.x1 - SIDE_GAP;
        const clear = Math.max(freeLeft, freeRight) < MIN_SIDE;
        // Yazı resmin geniş kalan tarafına geçer
        const textRight = freeRight >= freeLeft;
        placed.push({
            index,
            image,
            row,
            ...rect,
            left: clear || !textRight ? 0 : rect.x1 + SIDE_GAP,
            right: clear || textRight ? 0 : width - rect.x0 + SIDE_GAP,
            clear,
        });
    }
    return placed;
}
// Yazı resmin satırlarından birine değiyor mu
function overlaps(exclusion, top, height) {
    return top < exclusion.bottom - 1 && top + height > exclusion.top + 1;
}
// Resimlerin yanında bir bölümün yeri: değdiği resimlerin boş bıraktığı yere çekilir (iki resmin
// arasına da düşebilir); orada yazıya yer kalmazsa resmin altına itilir. top ve height bölümün
// itilmeden önceki yeridir.
export function flowAround(exclusions, top, height, width) {
    let at = top;
    for (;;) {
        const hits = exclusions.filter((e) => overlaps(e, at, height));
        if (hits.length === 0)
            return { push: at - top, indent: undefined };
        const left = Math.max(...hits.map((e) => e.left));
        const right = Math.max(...hits.map((e) => e.right));
        if (!hits.some((e) => e.clear) && width - left - right >= MIN_SIDE) {
            return { push: at - top, indent: { left, right } };
        }
        at = Math.min(...hits.map((e) => e.bottom));
    }
}
