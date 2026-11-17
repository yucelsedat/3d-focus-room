# all-books — Focus Room ana sayfası = Seyir Defteri kitaplığı

Kaynak: `~/projects/MOBİL/seyir defteri` (Expo SDK 58 / RN 0.88, TypeScript, yerel SQLite).
Hedef: focus-room'un `/` sayfası, seyir defterinin **Kitaplık** bölümünün web kopyası olur.
Defter oluşturma dahil her şey taşınır; ilk etapta yalnız **PDF** türü uçtan uca, mobildekiyle
bire bir aynı çalışır. Ajanda ve not defteri türleri formda görünür ama "yakında" kilitlidir.

## Mimari kararlar

- **Rotalar:** `/` → `LibraryPage` (kitaplık). Eski dünya seçimi `/worlds`'e taşınır; "Odalara dön"
  düğmeleri oraya gider. Yeni rotalar: `/new-notebook?category=`, `/edit-notebook/:id`,
  `/notebook?id=`.
- **Veri:** mobilde cihazdaki SQLite; burada Express + Prisma + SQLite (focus-room'un geri kalanı
  gibi). Var olan `Category`/`Notebook` modelleriyle çakışmasın diye yeni tablolar `Shelf*` önekli:
  `ShelfCategory`, `ShelfBook`, `ShelfNote` (mobildeki `sheet_notes`), `ShelfPageTitle`. Sonraki
  fazlarda `ShelfDrawing`, `ShelfFavorite`.
- **API alan adları** mobil tiplerle aynı (snake_case: `category_id`, `page_count`, ...) — taşınan
  istemci kodu mobildeki sorgu fonksiyonlarının birebir karşılığını çağırır (`src/pages/library/api.js`).
- **Sunucu kodu** `server.js` monolitine değil `server/library.js` modülüne; `registerLibraryRoutes(app, prisma)`.
- **Görsel dil** mobildeki tema tokenlarıyla aynı (`src/pages/library/theme.js`): lacivert mürekkep,
  ceviz duvar, ahşap raf, Caveat el yazısı menüler, Fraunces başlık, DM Sans gövde. Fontlar
  `index.html`'de zaten yüklü.
- **Duyarlı düzen:** telefonda mobil düzenin aynısı (tek raf, 3 defter). Veri modeli "rafta 3 defter"
  olduğu için geniş ekranda rafta daha çok defter yerine raflar yan yana **bölmelere** dizilir
  (≥760 px 2, ≥1140 px 3, ≥1520 px 4 bölme); sürükleme bu 2B ızgarada çalışır. Alt gezinme ve
  formlar ortalanır, tür kartları genişte üçü yan yana.
- **RN → web eşlemeleri:** `Pressable` → `button`, Reanimated/gesture-handler → pointer events +
  CSS transform/transition, `react-native-svg` → inline SVG, `Modal` → fixed overlay, `TextInput` →
  `input`/`textarea`, uzun basma → sağ tık + 500 ms basılı tutma.

## Fazlar

### Faz 0 — Altyapı ✅ (bu oturum)
- [x] `all-books` branch'i
- [x] Prisma modelleri + `20261116000000_add_shelf_library` migration'ı
- [x] `server/library.js`: kategoriler (liste/sayım/ekle/yeniden adlandır/sırala/sil → defterler
      Genel'e), defterler (liste/oku/oluştur → ilk boş raf, güncelle, kategori değiştir, raf düzeni,
      sayfa sayısı, sil), sayfa blokları (liste/ekle/güncelle/sırala/sil/sondaki boşları sil),
      sayfa başlıkları, sayfa ekle/çıkar (numara kaydırma)
- [x] Rotalar: `/` kitaplık, `/worlds` dünya seçimi

### Faz 1 — Kitaplık ekranı ✅ (bu oturum)
- [x] Başlık ("Kitaplık", düzenle kalemi), kategori sekmeleri (+ etiket simgesi)
- [x] Yatay sayfalı kitaplıklar (her kategori bir sayfa; kaydırınca sekme seçilir)
- [x] Raflar (en az 5, düzenlerken altta +1 boş), 3 defter/raf, ekran genişse defter küçülür
- [x] `BookCover`: lastikli / telli (spiral) / PDF dosyası (kıvrık köşe + rozet), `FitText`
- [x] Boş raf tebeşir notu, sağ alt "+" düğmesi
- [x] Yırtık kâğıt menüsü: Aç / Düzenle / Kategori / Sil (onaylı)
- [x] Düzenleme modu: basılı tut-sürükle ile yer değiştirme, taşan raf alttakine iner, kenarda oto-kaydırma
- [x] Kategori yöneticisi (yırtık kâğıtta; ekle, yeniden adlandır, sırala, sil)
- [x] Alt gezinme çubuğu (Kitaplık; Pano/Takvim/Ayraçlar sonraki fazlarda, Defter = son açılan defter)

### Faz 2 — Defter oluşturma / düzenleme ✅ (bu oturum)
- [x] 3 adım: Tür → Kapak → Sayfalar; adım göstergesi, Geri/İleri/Oluştur
- [x] Tür: Ajanda / Not defteri / PDF kartları (ilk etapta yalnız PDF seçilebilir)
- [x] Kapak: kapağın etiketine ad yazma, 9 renk, kategori çipleri + "Yeni"
- [x] PDF sayfa boyutu: A4 / Letter örnekleri
- [x] Düzenleme: kapak + sayfa boyutu adımları

### Faz 3 — PDF defteri: okuyucu çekirdeği ✅
- [x] `/notebook?id=`: açılış animasyonu, son kalınan sayfa (`library.notebook.<id>.lastPage`), "Defter" sekmesi
- [x] Sayfa çevirme (`NotebookScreen.jsx` TurnSheet): sırt etrafında 3B dönüş, gölgeler; dokunmatikte her
      yerden, farede yazısız yerden sürükleme; ←/→ (PageUp/PageDown) tuşları; trackpad yatay kaydırma
- [x] Son sayfanın ardında boş sayfa; çevrilince defter uzar (`page_count`)
- [x] Beyaz A4/Letter sayfa, en az kâğıt oranı kadar boy; geniş ekranda 820 px kâğıt, iki yanda masa
- [x] Sayfa başlığı (1→2→3 satır kademesi), "Sayfa N · Not defteri", boş sayfa ipucu
- [x] Bloklar: oluştur, yaz (450 ms gecikmeli kayıt, sayfadan çıkınca/sekme kapanınca hemen), boş kâğıda
      tıklayınca yeni blok, başlıkta Enter ile ilk blok, Enter ile bölme, Backspace ile birleştirme
- [x] Markdown (`notebook/MarkdownView.jsx`): başlık, liste, görev kutusu (tıklanır), kod bloğu, tablo,
      link, alıntı, https görseller ve görsel şeridi
- [x] Biçimli yazma (varsayılan, `DocText.jsx` LiveDocText): birim yerinde yazılır, işaretler soluk; web'de
      `contentEditable` alanı parçaları biçimleriyle yeniden dizer, imleç korunur
- [x] Ham Markdown modu (`documentSettings.js`, `library.document.rawMarkdown`) — ayar düğmesi Faz 8'deki
      sayfa ayarlarında
- Not: fosforlu kalem/yazı rengi işaretleri (marks) Faz 5'te; bölme/birleştirmede şimdilik taşınmaz.

### Faz 4 — Belge araç çubuğu ve zengin metin ✅
- [x] `DocumentBar`: biçimli yapıştır, kalem rengi, fosforlu kalem, H/B/I, madde, görev kutusu, kod bloğu,
      sesle yazma (Web Speech API, tr-TR), ek (Faz 6'ya kadar bildirim); basınca yazının odağı gitmez
- [x] `markdownEdit` (toggleInline/toggleLines/insertCodeBlock) biçim düğmelerine bağlı
- [x] Biçimli yapıştırma: `richText/htmlToMarkdown.js` (mobil dosyadan, linkedom yerine DOMParser);
      Ctrl+V'deki HTML doğrudan çevrilir, düğme `navigator.clipboard.read()` ile okur
- [x] Bildirim şeridi

### Faz 5 — Blok işlemleri ✅
- [x] Fosforlu kalem ve yazı renkleri (`marks.js`, `PenMenu`, `HighlightLayer`)
- [x] Blok tutamacıyla sürükle-sırala (280 ms basılı tut; kurşun kalem bırakma çizgisi; Alt+↑/↓)
- [x] Blok seçimi (`BlockSelection`: tıkla ya da kesik çizgili alan, kenarda oto-kaydırma), seçim çubuğu
      (kopyala / kes / çoğalt / sil — onaylı), uygulama panosu (`blockClipboard`, defterler arası ortak;
      ekler kopyalanınca dosyaları da çoğaltılır), atan yapıştır düğmesi (sağ tık: panoyu boşalt);
      klavye: Ctrl+C / Ctrl+X / Ctrl+V / Delete / Escape

### Faz 6 — Ekler ✅
- [x] Sunucu: `/api/library/attachments` yükle / çoğalt / sil (dosyalar `public/uploads/shelf/`)
- [x] Ataç menüsü: panodaki resmi yapıştır, fotoğraf çek (telefonda kamera), galeriden, dosya seç;
      yazıya Ctrl+V ile resim
- [x] Resim (`NoteImage`): blokta yüzer, yazı yanından akar (`imageLayout.js`), yan yana resimler;
      tıklayınca köşelerden büyüt/küçült (satır satır), döndür (düz açılara yapışır), sürükleyerek yana
      ve satırlar arasında taşı (başka resmin üstüne bırakılınca yer değiştirir); sağ tık: sil
- [x] Tam ekran görüntüleyici (`ImageViewer`): resimler arası gezinme, tekerlekle büyütme, indirme, kırpma
- [x] Dosya etiketi (`NoteFile`): yeni sekmede açılır; sağ tık: sil. Silinen sayfanın ek dosyaları silinir

### Faz 7 — Çizim modu ✅
- [x] Sunucu: `ShelfDrawing` tablosu + `/drawing` uçları
- [x] El / kalem / silgi / seçim araçları, kalem rengi ve kalınlığı (`DrawPenMenu`), geri al / yinele
      (Ctrl+Z, Ctrl+Shift+Z), sayfa sol üst köşesinden büyür (Ctrl+tekerlek, iki parmak; CSS `zoom`),
      çizgi seçimi: alan / tıklama, sürükleyerek taşı, kopyala / kes / çoğalt / sil, çizim panosu
- [x] Çizim ya da blok seçimi açıkken sayfa çevrilmez (`onLockChange`)

### Faz 8 — Sayfa araçları ✅
- [x] Sayfa ayarları şeridi (`PageSidebar`): ham Markdown ↔ biçimli yazma, sola/sağa sayfa ekle, sayfayı
      temizle, sayfayı sil (onaylı; silinen yaprak kalkarken altındaki sayfa görünür)
- [x] Sayfa listesi / arama (`PageIndex`, dokulu kâğıt), okuma modu (yalnız yazılı sayfalar, altta numara)
- [x] Ayraçlar (`ShelfFavorite` + `/favorite` uçları); Ayraçlar sekmesi Faz 9'da

### Faz 9 — Diğer türler ve sekmeler
- [ ] Not defteri (el yazısı, çizgili/oxford/kareli/noktalı kâğıt), ajanda (takvim düzeni, alışkanlıklar)
- [ ] Pano, Takvim, Ayraçlar sekmeleri

## Doğrulama
- Her faz sonunda: `npm run lint`, `npm run build`, API uçları için izole DB kopyasında duman testi
  (canlı `prisma/dev.db`'ye migration yalnızca yedek alındıktan sonra uygulanır).
