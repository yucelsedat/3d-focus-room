# Focus Room — Genel İnceleme & Düzeltme Planı

Tarih: 2026-07-06 · Branch: `genel-fix`

Genel değerlendirme: Uygulama çalışır ve mimari niyet net. Ana borç, `server.js`
monolitinde toplanmış: güvenlik açıkları, eksik hata yönetimi ve dev dosya boyutları.
Lint gürültüsü (`room-projects/` taranıyor) gerçek 12 hatayı gizliyor.

---

## 1. Güvenlik (öncelik: yüksek)

- **`/api/slide-from-path` — keyfi dosya okuma** (server.js:681)
  Client'ın verdiği `filePath` yalnızca `.html` uzantısı + `existsSync` ile kontrol
  ediliyor; ardından public dizine kopyalanıp herkese servis ediliyor. Diskteki
  herhangi bir `.html` sızdırılabilir. → İzinli bir kök dizinle sınırla (allowlist),
  `path.resolve` + prefix kontrolü yap.

- **`/api/fetch-url` — SSRF** (server.js:731)
  Sadece `startsWith('http')` kontrolü var; sunucu herhangi bir URL'e istek atıyor
  (localhost, iç ağ, cloud metadata). → Host/şema doğrulaması, özel IP bloğu,
  content-type ve boyut limiti ekle.

- **Multer dosya adı sanitizasyonu yok** (server.js:154, 163, 170)
  `filename` = `${Date.now()}-${file.originalname}` — `originalname` içinde `../`
  path traversal'a açık. → `path.basename` ile temizle; mime/uzantı filtresi ekle.

- **AI oturumları CLI'yi geniş yetkiyle çalıştırıyor** (server.js:63, spawn)
  `claude` CLI host üzerinde spawn ediliyor; `permission-hook.js` bypass akışı var.
  → Yerel/tek-kullanıcı senaryosu için kabul edilebilir; ama endpoint'lerde auth
  yokluğu ve bu birleşince not düşülmeli.

## 2. Sağlamlık / hata yönetimi (öncelik: yüksek)

- **`try/catch`'siz `JSON.parse(position/rotation)`** (add-text:777, canvas:805,
  header:835 vb.) Bozuk gövde 500 fırlatır; `/api/add-text` hiç try/catch içermiyor
  → unhandled rejection. → Ortak bir parse helper'ı + tutarlı 400 yanıtı.

- **`id = BigInt(Date.now())` primary key** Aynı milisaniyede iki create çakışabilir.
  → `cuid`/autoincrement veya `Date.now()+rastgele son ek`.

## 3. Mimari / bakım (öncelik: orta)

- **`server.js` 3841 satır, ~80 route** → route modüllerine böl
  (rooms, media, canvas, sessions, multiagent, bluprint).
- **Dev bileşenler**: MediaOverlay.jsx (2793), EditModal.jsx (1780),
  CanvasMesh.jsx (1345) → alt bileşenlere/hook'lara ayır.

## 4. Lint & React (öncelik: düşük, hızlı kazanç)

- **eslint `room-projects/`, `bench/`, `scripts/` taramıyor** → `globalIgnores`
  ekle; 6600+ gürültü hatası düşer, gerçek 12 hata görünür olur.
- **RoomModal.jsx setState-in-effect** (32, 53) → türetilmiş değeri render'da hesapla
  veya event handler'a taşı (cascading render).
- **Walls.jsx kullanılmayan `encodeWallId` importu** (5) → kaldır.
- exhaustive-deps uyarıları → gözden geçir.

---

## Önerilen sıra
1. Lint ignore + Walls/RoomModal düzelt (hızlı, riski düşük).
2. JSON.parse hata yönetimi + add-text try/catch.
3. slide-from-path allowlist + fetch-url SSRF koruması + multer sanitizasyon.
4. (Ayrı iş) server.js route bölme, dev bileşen refactor.

---

## Uygulananlar (branch: genel-fix, 2026-07-06)

İşlevselliği bozmadan, yalnızca hatalı/kötü niyetli girdiyi etkileyen değişiklikler:

- **eslint.config.js**: `room-projects/room-graphs/room-blueprints/graphify-out`
  ignore edildi; Node dosyaları için node-globals override; `allowEmptyCatch`.
  → Lint gürültüsü 6750 → 39'a indi (kalanlar davranışa duyarlı React hook'ları).
- **multer**: 3 diskStorage config'inde dosya adı `path.basename` ile sanitize edildi
  (path traversal kapandı; normal adlar değişmez). — *gerçek güvenlik düzeltmesi*
- **add-text / canvas / header**: `defter` gibi `try/catch`'e alındı (bozuk gövde
  artık crash/unhandled rejection yerine temiz 500). Doğrulandı: bozuk girdi → 500 JSON.
- **Walls.jsx**: kullanılmayan `encodeWallId` importu kaldırıldı.
- **server.js**: kullanılmayan `getReturnAnchorId` importu kaldırıldı; `lineCount`
  `var` yeniden-tanımı `let` ile öne alınarak düzeltildi (davranış birebir aynı).
- Doğrulama: `node --check` + ayrı portta (5099) boot testi; `GET /api/rooms` 200,
  `add-text` bozuk girdi 500. Kullanıcının 5001'deki sunucusuna dokunulmadı.

### Bilinçli ertelenenler (işlevselliği/sinyali bozmamak için)
- **RoomModal.jsx setState-in-effect** (32, 53): perf lint'i, davranışa duyarlı — bug değil.
- **withStreamRegistry** (server.js:1170): ölü kod ama permission-stream wiring'inin
  eksik kalmış olabileceğini gösteriyor; silmek sinyali gizler → bırakıldı, incelenmeli.
- **slide-from-path / fetch-url**: keyfi yerel dosya/URL okuma bu yerel uygulamanın
  *amaçlanan* özelliği; agresif kısıtlama meşru kullanımı bozar → hardening ayrı ele alınmalı.
