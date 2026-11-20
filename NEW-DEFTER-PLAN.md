# new-defter-system — oyundaki defter = kitaplık defteri

Hedef: oyunda canvas'a eklenen defter kartı ve **B** ile açılan defter artık eski oda defteri
sistemi (`components/notebook`, `Notebook`/`RoomNotebook` tabloları) değil, ana sayfadaki
**kitaplığın** defterleri (`ShelfBook`, `src/pages/library`) olur. Odada kitaplıktaki defterin
kendisi açılır: aynı sayfa çevirme, aynı yazma birimi, aynı ekler — ayrı bir kopya yok.

## Mimari kararlar

- **Anahtar:** kitaplık defteri `lib:<ShelfBook.id>`. Eski anahtarlar (`book:<id>` eski `Notebook`
  tablosu, `room:<kökId>` oda defteri) taşıma fazına kadar çalışmaya devam eder; id'ler farklı
  tablolardan geldiği için `book:` yeniden kullanılmaz (çakışır).
- **Tek kapı `notebookOpen`:** oyunun bütün tuş/tekerlek/yapıştırma dinleyicileri (Player,
  KeyHandler, RoomNavHUD, CanvasMesh `noteOverlayRef`, TimelinePage) zaten bu bayrağa bakıyor.
  Yeni defter de aynı bayrakla açılır; hangi defterin açılacağına `NotebookHost` karar verir
  (`heldNotebook` `lib:` ise kitaplık defteri, değilse eski overlay).
- **Kitaplık ekranı gömülür, kopyalanmaz:** `NotebookScreen` → `NotebookView({ notebookId,
  pageKey, onClose })`. Rota (`/notebook?id=`) aynı bileşeni parametreyle çağırır; oyun, /canvas
  ve /timeline overlay olarak çağırır. Kitaplıkta yapılan her geliştirme oyuna da yansır.
- **Kart:** canvas öğesi yine `type: 'notebook'`, `src: 'lib:<id>'`; kapak kitaplıktaki
  `BookCover` (renk, bağlama, başlık canlı `useLibrary` listesinden). Karttaki `name/color/
  binding/kind` yalnızca yedek (liste yüklenemezse).
- **Sunucu değişmez (Faz 1–3):** canvas öğesi yalnız referans; `itemAssetUrls`/`copyCanvasAssets`
  bu öğe için dosya taşımaz.

## Her fazda yeniden kontrol edilecek kenar durumları

| # | Durum | Beklenen |
|---|-------|----------|
| K1 | drei `PointerLockControls` `document`'e gelen her tıklamada `lock()` çağırır (`enabled`'dan bağımsız, node_modules'ta doğrulandı) | Overlay kökünde `click` yayılımı durur; body'ye portal edilen menüler (TornPaperMenu, ImageViewer, PageSidebar) React ağacından köke kabarcıklanır, onlar da kapsanır |
| K2 | B ile (kilitliyken) açılıp kapatma | Yalnız tıklamayla kapatınca yeniden kilit (`notebookRelock`); Esc kilitlemez |
| K3 | Karttan (canvas düzenleme modunda) açma | Kapanınca kilit YOK (kilit canvas düzenlemeyi kapatır) |
| K4 | Defter tuşları (`window` keydown: ok tuşları, seçim Ctrl+C/X, Esc) | Kökte keydown DURDURULMAZ; oyun dinleyicileri `notebookOpen` ile susar |
| K5 | Esc | İç katman açıksa (`aria-modal`, dizin, filtre, seçim/çizim `locked`, silinen yaprak) yalnız o kapanır; yazarken önce odak bırakılır; ancak sonra defter kapanır. Karar `window` capture fazında, olay öncesi durumla verilir |
| K6 | Kitaplıktan silinmiş defter | Kart sönük "silinmiş defter", tıklanmaz; elde ise açılınca "bulunamadı" + `heldNotebook` temizlenir; kitaplıkta silerken de temizlenir |
| K7 | Kitaplık API'si hata / tablo yok | Menü "yüklenemedi"; kart yedek kopyadan çizilir |
| K8 | Aynı defter birden çok kartta / odada / timeline'da | Hepsi aynı `useLibrary` satırını okur |
| K9 | Tile Kopyala / Kes / Sync-Kopyala, /canvas, /timeline paritesi | Kart yalnız referans; üç yüzey aynı menü + aynı `NotebookHost` |
| K10 | Kapatırken yolda olan yazmalar | `api.js` yazmaları kapanıştan bağımsız tamamlanır; overlay sökülse de istek düşmez |
| K11 | StrictMode çift kurulum, lazy chunk inmeden açma | Fallback "defter açılıyor…", çift istek zararsız |
| K12 | Kart boyu (kapak oranı 1.45) köşe tutamacıyla bozulursa | Kapak kutuya sığdırılır, ortalanır |
| K13 | Kitaplıkta başlık/renk değişti, oyun açık | `ensureLibrary` bayatlık süresi + menü açılışı + overlay kapanışı listeyi tazeler |
| K14 | Defterin body'ye portal edilen katmanları (menü, resim, kenar çubuğu; z-index 1000–1100) | Overlay açıkken `#lib-portal-root`'a (overlay içi) çizilir; overlay nişangahla aynı en üst z-index'te, DOM'da sonra |
| K15 | B'ye basıldı, elde defter yok / elindeki silinmiş | Hiçbir defter açılmaz (oda defteri de); HUD uyarısı; silinmişse el boşalır |
| K16 | Defter yüklenirken ya da "bulunamadı" ekranında Esc | Kapatır (açık defterin Esc kuralları henüz kurulmadı) |
| K17 | Form vazgeçilir / sayfadan çıkılır / StrictMode kur–sök–kur | Söz null'la çözülür; söküm temizliği bir tur ertelenir ve yalnız kendi isteğini (token) kapatır |
| K18 | Oluşturduktan hemen sonra liste | `reloadLibrary` yoldaki eski isteği bekleyip yeniden çeker; kart yeni defterle eklenir |
| K19 | Silinmiş defteri düzenleme | Form "Defter bulunamadı" + geri / Esc |

## Fazlar

### Faz 0 — Branch + plan ✅
- [x] `new-defter-system` branch'i, bu plan

### Faz 1 — Kitaplık defteri canvas'ta: kart + odada okuma/yazma ✅
- [x] 1.1 `libraryShelf.js`: `lib:` anahtarı, `useLibrary` (defterler + kategoriler), `ensureLibrary`
- [x] 1.2 `NotebookScreen` → gömülebilir `NotebookView` (`onClose`, Esc kuralları K5, bulunamadı durumu)
- [x] 1.3 `NotebookHost`: `lib:` → `LibraryNotebookOverlay` (lazy; K1, K2, K3, "yere bırak")
- [x] 1.4 Kart: `NotebookCard` `lib:` dalı → `BookCover` (K6, K12)
- [x] 1.5 Kitaplık menüsü: kitaplık defterleri kategorilere göre; eski defterler menüden kalkar
      (var olan eski kartlar çalışmaya devam eder)
- [x] 1.6 `lib:` kartında "Ad / kapak" ayar penceresi açılmaz (canvas + timeline)
- [x] 1.7 Kitaplıkta defter silinince `heldNotebook` temizlenir (K6)
- [x] 1.8 Doğrulama: lint, build, izole e2e — /canvas'ta 19/20 (kalan: main'de de olan araç çubuğu
      `border`/`borderColor` uyarısı), /game'de B → elimdeki ajanda açıldı, Esc kapattı
- [x] 1.9 (testte bulundu) Defter menüleri body'ye z-index 1000–1100 ile portal ediliyordu → overlay'in
      altında kalırdı. `portalRoot.js`: overlay içindeki köke portal; overlay nişangahın z-index'inde

### Faz 2 — B tuşu ✅
Karar (kullanıcı, 2026-11-19): elde defter yokken B hiçbir defter açmaz, **"Elinde bir defter yok"** uyarısı verir.
- [x] 2.1 `KeyHandler` `openHeldNotebook`: elde `lib:` → açar; elde yok → uyarı; elindeki defter
      kitaplıktan silinmişse (liste yüklüyse) elden bırakır + "kitaplıktan silinmiş" uyarısı; eski
      `book:`/`room:` anahtarı elde → Faz 4'e kadar eski overlay
- [x] 2.2 `HudNotice` (store `hudNotice` / `showHudNotice`): imleç kilitliyken de görünür, tıklanmaz,
      2,6 sn sonra solar; aynı uyarı yeniden gelirse süre baştan
- [x] 2.3 Metinler: Q menüsünde "B — Elindeki defteri aç", "yere bırak" ipucu
- [x] 2.4 (testte bulundu) Esc, defter yüklenirken ve "bulunamadı" ekranında çalışmıyordu
      (dinleyici yalnız `OpenNotebook`'taydı) → `NotebookView`'da defter yokken de Esc kapatır
- [x] 2.5 Doğrulama: /game e2e 8/8 (elde yok → uyarı, hiçbir defter açılmaz; silinmiş → uyarı + el boş;
      lib → açılır; Esc; bulunamadı ekranında Esc; eski anahtar → eski overlay); /canvas Faz 1 19/20 (aynı
      main uyarısı). Not: swiftshader'da ana iş parçacığı ~1 sn takıldığı için uyarı süresi testte
      uzun görünür (ölçüldü: 2,6 sn + takılma)

### Faz 3 — Oyunda defter oluşturma ve düzenleme ✅
Kitaplığın formu (NotebookForm) kopyalanmadı, gömüldü; defterle aynı kapıdan (`notebookOpen` +
`notebookForm`) açılır, oyunun bütün tuş kapıları kendiliğinden geçerli.
- [x] 3.1 `NotebookForm` `onDone` / `onCancel`; `NewNotebookForm`, `EditNotebookForm` (rotalar da bunları kullanır)
- [x] 3.2 `libraryForm.js`: `openLibraryForm` → söz (oluşturmada yeni id, düzenlemede true, vazgeçince
      null); `createLibraryBook`, `editLibraryBook`; her isteğe belirteç (token)
- [x] 3.3 `LibraryFormOverlay` (lazy) — defter overlay'iyle aynı kabuk (K1, K14); `NotebookHost` form
      doluyken onu çizer
- [x] 3.4 Kitaplık menüsü: "+ Yeni defter" (oluşan defter kart olur) ve her satırda ✎ düzenle — canvas
      ve timeline ortak; canvas'ta seçili kitaplık kartında "✎ Düzenle". Çift tık = defteri aç (değişmedi)
- [x] 3.5 `reloadLibrary`: yazmadan önce başlamış listeleme isteği yeni defteri içermeyebilir → onu
      bekleyip taze istek
- [x] 3.6 Doğrulama: /canvas Faz 3 e2e 13/13 (vazgeç → kayıt yok; oluştur → kitaplıkta + kart; kategori
      penceresi portal kökünde, Esc yalnız onu kapatır; düzenle → kart canlı; menü ✎; silinmiş defter
      düzenleme); /game form aç/Esc; gerileme: Faz 1 19/19, Faz 2 10/10; lint, build

### Faz 4 — Eski verinin taşınması ❌ (iptal)
Kullanıcı kararı (2026-11-19): eski defterlere gerek yok, taşınmayacak, silinecek → Faz 5.

### Faz 5 — Eski sistemin kaldırılması ✅
- [x] 5.1 Envanter (canlı DB, salt okunur): 6 oda defteri, 3 eski bağımsız defter, bunlara bakan 6 kart
      (4 canvas tile, 2 "Yol haritası" timeline'ı), yüklenmiş kapak yok
- [x] 5.2 Yedek: `~/projects/games/focus-room-backups/dev.db.before-legacy-notebook-delete-2026-11-19`
      (`VACUUM INTO`, integrity ok) — repo dışında, commit edilmez
- [x] 5.3 Silme betiği (scratchpad, kuru çalıştırma varsayılan, tek transaction, idempotent): önce DB
      kopyasında denendi (kartların yanındaki öğeler / bg / view birebir aynı kaldı), sonra canlıda:
      9 defter + 6 kart silindi; timeline rev +1 (eski içerikli açık sekme kartları geri yazamasın)
- [x] 5.4 Migration `20261120000000_drop_legacy_notebooks` (RoomNotebook, Notebook tabloları): kopyada
      `migrate diff` ile doğrulandı (yalnız main'de zaten olan Door/Floor/SpecialDoor sapması), canlıya uygulandı
- [x] 5.5 Kod: eski overlay ve modülleri (NotebookOverlay, NotebookBook, NotebookPage, NotebookRow,
      PageTabs, Rough, roughUtils, paperStyles, notebookClipboard, notebookStore, shelfStore,
      utils/notebookModel, NotebookCardDialog), `/api/notebook(s)` rotaları, `reconcileNotebooks`
      (7 çağrı yeri), kapak yükleme, `verify:notebook`, roughjs + @dnd-kit bağımlılıkları kaldırıldı.
      Kalan: `notebookUi.js` (closeNotebookOverlay, takeNotebook)
- [x] 5.6 Kenar: tarayıcıda kalmış `nb:held = room:/book:` açılışta silinir; B'de eski anahtar →
      uyarı; kitaplık anahtarı olmayan kart "silinmiş defter" (tıklanmaz, araç çubuğu yok)
- [x] 5.7 Doğrulama: e2e Faz 1 19/19, Faz 2 11/11, Faz 3 13/13; eski API 404; oda ağacı akışları
      (ebeveyn ata/kaldır, sil) hatasız; lint (yalnız main'deki borç), build
