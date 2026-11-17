// Seyir defteri: lib/isoWeeks.ts — TypeScript'ten tipleri soyularak birebir taşındı.
// ISO 8601 kuralı: haftalar pazartesi başlar ve perşembesinin düştüğü aya aittir.
// Böylece her ay 4 ya da 5 tam haftadan oluşur, haftalar aydan aya kaymadan arka arkaya dizilir.
// Tarihler saat dilimi kaymasın diye UTC gece yarısı olarak hesaplanır ve "YYYY-AA-GG" olarak saklanır.
const DAY_MS = 24 * 60 * 60 * 1000;
function utc(year, month, day) {
    return new Date(Date.UTC(year, month - 1, day));
}
// 0 = pazartesi ... 6 = pazar
function weekday(date) {
    return (date.getUTCDay() + 6) % 7;
}
export function toISODate(date) {
    return date.toISOString().slice(0, 10);
}
export function parseISODate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return utc(y, m, d);
}
export function addDays(iso, days) {
    return toISODate(new Date(parseISODate(iso).getTime() + days * DAY_MS));
}
// İki tarih arasındaki gün sayısı (b, a'dan sonraysa pozitif)
export function daysBetween(a, b) {
    return Math.round((parseISODate(b).getTime() - parseISODate(a).getTime()) / DAY_MS);
}
// Ayın haftalarının pazartesileri (ilki önceki aydan başlayabilir)
export function monthWeekMondays(year, month) {
    const first = utc(year, month, 1);
    const firstThursday = 1 + ((3 - weekday(first) + 7) % 7);
    const daysInMonth = utc(year, month + 1, 0).getUTCDate();
    const mondays = [];
    for (let thursday = firstThursday; thursday <= daysInMonth; thursday += 7) {
        mondays.push(toISODate(utc(year, month, thursday - 3)));
    }
    return mondays;
}
// Bir tarihin hangi ayın kaçıncı haftasına düştüğü
export function weekOf(iso) {
    const date = parseISODate(iso);
    const thursday = new Date(date.getTime() + (3 - weekday(date)) * DAY_MS);
    return {
        year: thursday.getUTCFullYear(),
        month: thursday.getUTCMonth() + 1,
        weekNo: Math.floor((thursday.getUTCDate() - 1) / 7) + 1,
        monday: addDays(iso, -weekday(date)),
    };
}
// Telefonun yerel saatine göre bugünün tarihi
export function todayISO() {
    const now = new Date();
    return toISODate(utc(now.getFullYear(), now.getMonth() + 1, now.getDate()));
}
export const MONTH_NAMES = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık',
];
// "28 Ekim 2026"
export function formatDate(iso) {
    const d = parseISODate(iso);
    return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
// Ayın kaçıncı günü
export function dayOfMonth(iso) {
    return parseISODate(iso).getUTCDate();
}
// Hafta aralığı: "5 – 11 Ekim" ya da ay değişiyorsa "28 Eyl – 4 Eki"
export function formatWeekRange(monday) {
    const start = parseISODate(monday);
    const end = parseISODate(addDays(monday, 6));
    if (start.getUTCMonth() === end.getUTCMonth()) {
        return `${start.getUTCDate()} – ${end.getUTCDate()} ${MONTH_NAMES[end.getUTCMonth()]}`;
    }
    const short = (d) => `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)}`;
    return `${short(start)} – ${short(end)}`;
}
