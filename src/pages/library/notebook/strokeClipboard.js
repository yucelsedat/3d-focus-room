// Seyir defteri: lib/strokeClipboard.ts — TypeScript'ten tipleri soyularak birebir taşındı.
import { useSyncExternalStore } from 'react';
// Çizimin panosu: kopyalanan ya da kesilen çizgiler. Defterler ve sayfalar arasında ortaktır;
// yapıştırılınca çizgiler sayfaya geçer, pano boşalır (bkz. blok panosu).
let clipboard = [];
const listeners = new Set();
function subscribe(listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
function replace(next) {
    const old = clipboard;
    clipboard = next;
    listeners.forEach((listener) => listener());
    return old;
}
export function putStrokesOnClipboard(list) {
    replace(list.map((s) => ({ ...s, p: s.p.slice() })));
}
// Panodaki çizgiler yapıştırılmak üzere alınır; pano boşalır
export function takeStrokesFromClipboard() {
    return replace([]);
}
export function clearStrokeClipboard() {
    replace([]);
}
// Panoda kaç çizgi var; değişince bileşen yeniden çizilir
export function useClipboardStrokes() {
    return useSyncExternalStore(subscribe, () => clipboard.length);
}
