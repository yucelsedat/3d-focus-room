# Graph Report - .  (2026-11-28)

## Corpus Check
- 177 files · ~246,778 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1414 nodes · 2477 edges · 38 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 506 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Backend Sunucu ve Session Çekirdeği|Backend Sunucu ve Session Çekirdeği]]
- [[_COMMUNITY_HTMLZengin Metin → Markdown|HTML/Zengin Metin → Markdown]]
- [[_COMMUNITY_Kitaplık ve Defter Planı|Kitaplık ve Defter Planı]]
- [[_COMMUNITY_Zaman Çizelgesi ve Takvim Notları|Zaman Çizelgesi ve Takvim Notları]]
- [[_COMMUNITY_Defter Ekranı ve Haftalık Düzen|Defter Ekranı ve Haftalık Düzen]]
- [[_COMMUNITY_Not Blokları ve Pano Kartları|Not Blokları ve Pano Kartları]]
- [[_COMMUNITY_Canvas ve Ok Katmanı|Canvas ve Ok Katmanı]]
- [[_COMMUNITY_Kota Ölçümü (Aşama 1)|Kota Ölçümü (Aşama 1)]]
- [[_COMMUNITY_Kitaplık İstemci API'si|Kitaplık İstemci API'si]]
- [[_COMMUNITY_Bench, Ajan Koruma ve Model Kararları|Bench, Ajan Koruma ve Model Kararları]]
- [[_COMMUNITY_Spawn Profilleri ve Diyeti (Aşama 2-3)|Spawn Profilleri ve Diyeti (Aşama 2-3)]]
- [[_COMMUNITY_Görsel Ekler ve Pano|Görsel Ekler ve Pano]]
- [[_COMMUNITY_Defter Teması ve Alt Çubuk|Defter Teması ve Alt Çubuk]]
- [[_COMMUNITY_Markdown Görünümü ve Metin Birimleri|Markdown Görünümü ve Metin Birimleri]]
- [[_COMMUNITY_Not Görselleri ve Yerleşim|Not Görselleri ve Yerleşim]]
- [[_COMMUNITY_Kitaplık Rafı ve Kapaklar|Kitaplık Rafı ve Kapaklar]]
- [[_COMMUNITY_Medya Overlay Tile'ları|Medya Overlay Tile'ları]]
- [[_COMMUNITY_Kapılar ve Oyuncu Çarpışması|Kapılar ve Oyuncu Çarpışması]]
- [[_COMMUNITY_Çizim Modu ve Kontur|Çizim Modu ve Kontur]]
- [[_COMMUNITY_README ve Genel Plan|README ve Genel Plan]]
- [[_COMMUNITY_Düzenleme Modalı ve Sesli Not|Düzenleme Modalı ve Sesli Not]]
- [[_COMMUNITY_Markdown Kopyalama|Markdown Kopyalama]]
- [[_COMMUNITY_Markdown Düzenleme (EnterKod)|Markdown Düzenleme (Enter/Kod)]]
- [[_COMMUNITY_Dünya Seçimi Ekranı|Dünya Seçimi Ekranı]]
- [[_COMMUNITY_Oda Doku Çıkarma (Python)|Oda Doku Çıkarma (Python)]]
- [[_COMMUNITY_Google Hesap Yardımcıları|Google Hesap Yardımcıları]]
- [[_COMMUNITY_Uygulama Kökü ve Hata Sınırı|Uygulama Kökü ve Hata Sınırı]]
- [[_COMMUNITY_Oda Navigasyon HUD|Oda Navigasyon HUD]]
- [[_COMMUNITY_Pano Izgarası|Pano Izgarası]]
- [[_COMMUNITY_Vurgulama Katmanı|Vurgulama Katmanı]]
- [[_COMMUNITY_Blok Seçim Çubuğu|Blok Seçim Çubuğu]]
- [[_COMMUNITY_Kota Satırı Arayüzü (Aşama 8)|Kota Satırı Arayüzü (Aşama 8)]]
- [[_COMMUNITY_Uygulama Görselleri ve Logolar|Uygulama Görselleri ve Logolar]]
- [[_COMMUNITY_GIF Kare Worker'ı|GIF Kare Worker'ı]]
- [[_COMMUNITY_Oda Ayarları Modalı|Oda Ayarları Modalı]]
- [[_COMMUNITY_highlightPaths (3)|highlightPaths (3)]]
- [[_COMMUNITY_geometry (3)|geometry (3)]]
- [[_COMMUNITY_plan (1)|plan (1)]]

## God Nodes (most connected - your core abstractions)
1. `join()` - 63 edges
2. `test()` - 51 edges
3. `replace()` - 50 edges
4. `call()` - 47 edges
5. `PersistentSession` - 28 edges
6. `clipboardToMarkdown()` - 18 edges
7. `LoopRunner` - 17 edges
8. `all-books: Home = Seyir Defteri Library` - 17 edges
9. `registerLibraryRoutes()` - 14 edges
10. `formatRange()` - 14 edges

## Surprising Connections (you probably didn't know these)
- `checkTodoApiPlus()` --semantically_similar_to--> `Deterministic oracle (oracle.js / oracle.json)`  [INFERRED] [semantically similar]
  /home/sedat/projects/GAMES/focus-room-main/scripts/bench.mjs → SESSION-YOL-HARITASI.md
- `FOCUS_ROOM_LOOP_EPOCH switch` --references--> `LoopRunner`  [INFERRED]
  bench/ASAMA5.md → /home/sedat/projects/GAMES/focus-room-main/server.js
- `HabitPage()` --shares_data_with--> `ShelfHabit`  [INFERRED]
  /home/sedat/projects/games/focus-room-main/src/pages/library/notebook/HabitPage.jsx → ALL-BOOKS-PLAN.md
- `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)` --references--> `PersistentSession`  [INFERRED]
  bench/FAZ3.md → /home/sedat/projects/GAMES/focus-room-main/server.js
- `--exclude-dynamic-system-prompt-sections (6 spawn noktası)` --references--> `PersistentSession`  [EXTRACTED]
  bench/FAZ2.md → /home/sedat/projects/GAMES/focus-room-main/server.js

## Hyperedges (group relationships)
- **Genel-Fix Güvenlik Bulguları (server.js girdi doğrulama açıkları)** — plan_slide_from_path_vuln, plan_fetch_url_ssrf, plan_multer_sanitization, plan_genel_fix_plani [EXTRACTED 1.00]
- **Token/Parite Faz Pipeline (baseline → faz2 → faz3 → parite kapanışı)** — baseline_faz1_baseline, faz2_cache_prefix_sabitleme, faz3_transport_hijyeni, parite_yetenek_tablosu, method_kanitla_ilerleme [EXTRACTED 1.00]
- **Quota measurement pipeline (turn record -> ledger -> API -> tile)** — quotaledger_turnrecord, quotaledger_accumulate, quotaledger_quotapoints, server_api_usage_daily, session_yol_haritasi_asama8 [INFERRED 0.80]
- **Library notebook opened in-game via single gate** — keyhandler_openheldnotebook, new_defter_plan_notebookopen_gate, notebookhost_notebookhost, librarynotebookoverlay_librarynotebookoverlay, notebookscreen_notebookview [EXTRACTED 0.90]
- **Roadmap items refuted by measurement** — asama3_json_schema_rejected, asama5_fresh_rejected, asama5_oracle_not_shipped, asama3_short_reply_deferred, session_yol_haritasi_status_table [EXTRACTED 0.85]

## Communities

### Community 0 - "Backend Sunucu ve Session Çekirdeği"
Cohesion: 0.02
Nodes (86): frameDelayMs(), getGifFrames(), planGif(), pump(), status(), migrate(), readJson(), Faz 5 Fork B — Routing Varsayılanı (direct vs team) (+78 more)

### Community 1 - "HTML/Zengin Metin → Markdown"
Cohesion: 0.04
Nodes (92): attachmentUrl(), openAttachment(), blockRanges(), blocksFromMarkdown(), counted(), finish(), isHeadingBlock(), isSeparator() (+84 more)

### Community 2 - "Kitaplık ve Defter Planı"
Cohesion: 0.03
Nodes (63): Date-based ref (YYYYMMDD) for agenda, all-books: Home = Seyir Defteri Library, Drawing Mode (pen/eraser/select), Pano corkboard tab (/pano), Responsive shelf bays (2D grid), RN to Web Component Mapping, Routes: / library, /worlds, /notebook?id=, Rationale: library server code in module, not server.js monolith (+55 more)

### Community 3 - "Zaman Çizelgesi ve Takvim Notları"
Cohesion: 0.05
Nodes (68): MonthGrid(), NoteChip(), chipBtn(), NoteEditor(), axisTicks(), dateToX(), dayIndex(), dayLabel() (+60 more)

### Community 4 - "Defter Ekranı ve Haftalık Düzen"
Cohesion: 0.04
Nodes (66): Per-phase verification: lint, build, isolated DB smoke, CalendarPage(), CalendarScreen(), FavoriteCard(), headingOf(), pageKeyOf(), previewOf(), DayCell() (+58 more)

### Community 5 - "Not Blokları ve Pano Kartları"
Cohesion: 0.05
Nodes (47): deleteAttachmentFile(), duplicateAttachmentFile(), attachmentNames(), blocksText(), clearClipboard(), deleteBlockFiles(), deleteContentFiles(), putOnClipboard() (+39 more)

### Community 6 - "Canvas ve Ok Katmanı"
Cohesion: 0.04
Nodes (42): ArrowLayer(), CanvasMesh(), a4MaxH(), buildInstaItem(), buildPasteItems(), copyImageToClipboard(), disposePoolAudio(), fetchImageBlob() (+34 more)

### Community 7 - "Kota Ölçümü (Aşama 1)"
Cohesion: 0.05
Nodes (62): Asama 1 baseline (3 scenarios), CLI contract: usage per turn, modelUsage cumulative, ASAMA 1 Report: Quota measurement, Limits: third-party weights, Haiku unmeasured, Cold-turn detector fix (iterations = last request), Quota weights: haiku vs haiku5 split, multiagent TTL deferred, roomsession-crud -42%/-47% quota (+54 more)

### Community 8 - "Kitaplık İstemci API'si"
Cohesion: 0.07
Nodes (58): call(), clearHabits(), createBoardNote(), createCategory(), createHabit(), createNote(), createNotebook(), deleteBoardNote() (+50 more)

### Community 9 - "Bench, Ajan Koruma ve Model Kararları"
Cohesion: 0.06
Nodes (53): Agent pkill killed bench backend, --json-schema rejected (more output/turns), Limit: tasks too easy to separate models, Decision: default stays Opus (user), Sonnet -60%/-48% quota, same quality, ASAMA 6 Report: Opus 5.5 vs Sonnet 5.5, checkBashCommand(), api() (+45 more)

### Community 10 - "Spawn Profilleri ve Diyeti (Aşama 2-3)"
Cohesion: 0.06
Nodes (43): Side finding: 2nd turn writes ~11.3K cache, ASAMA 2a Report: Spawn profiles, Rationale: split 2a/2b; move classes with Loop v2, Item 0: skill list is main per-process cache write source, Effort via --effort flag (not CLAUDE_EFFORT env), --fallback-model added, Isolation rules per profile (--setting-sources, --disable-slash-commands), ASAMA 3 Report: Spawn diet (+35 more)

### Community 11 - "Görsel Ekler ve Pano"
Cohesion: 0.07
Nodes (25): chooseFile(), clipboardHasImage(), cropAttachmentImage(), fileAttachment(), imageAttachment(), imageSize(), pasteImageFromClipboard(), pickFile() (+17 more)

### Community 12 - "Defter Teması ve Alt Çubuk"
Cohesion: 0.07
Nodes (26): Seyir Defteri mobile app (Expo/RN source), BottomBar(), Column(), initialValue(), pad(), TimeMenu(), DocumentBar(), boxTilt() (+18 more)

### Community 13 - "Markdown Görünümü ve Metin Birimleri"
Cohesion: 0.07
Nodes (26): LiveDocText(), pointAt(), RawDocText(), signature(), UnitInput(), wrapperStyle(), writeSelection(), Raw Markdown Mode (documentSettings) (+18 more)

### Community 14 - "Not Görselleri ve Yerleşim"
Cohesion: 0.08
Nodes (21): /api/library/attachments, imageName(), frameSize(), imageFrame(), imageLeft(), imageRect(), layoutBlockImages(), ImageViewer() (+13 more)

### Community 15 - "Kitaplık Rafı ve Kapaklar"
Cohesion: 0.08
Nodes (20): bayLeft(), Bookshelf(), contentHeight(), measure(), previewSlot(), rowTop(), ShelfBook(), slotLeft() (+12 more)

### Community 16 - "Medya Overlay Tile'ları"
Cohesion: 0.06
Nodes (6): parseDefterTile(), DefterTileMesh(), relTime(), SessionMesh(), TextureErrorBoundary, YoutubeMesh()

### Community 17 - "Kapılar ve Oyuncu Çarpışması"
Cohesion: 0.13
Nodes (12): DoorPlane(), doorWorldPos(), applyRingCollision(), canPassThrough(), canPassThroughRing(), decodeWallId(), encodeWallId(), getDoorInstanceIds() (+4 more)

### Community 18 - "Çizim Modu ve Kontur"
Cohesion: 0.12
Nodes (9): drawColorOf(), drawWidthOf(), segmentDistance2(), strokeHit(), strokesBounds(), DrawingActions(), DrawingBar(), DrawingSurface() (+1 more)

### Community 19 - "README ve Genel Plan"
Cohesion: 0.12
Nodes (18): K1: drei PointerLockControls locks on every document click, Bilinçli Erteleme Gerekçesi: keyfi dosya/URL okuma yerel uygulamanın amaçlanan özelliği, /api/fetch-url SSRF Açığı, /api/slide-from-path Keyfi Dosya Okuma Açığı, 3D Interactive Media Gallery (Focus Room), Aspect Ratio Locking, Canvas Media Type (infinite 2D canvas), First-Person Navigation (WASD + PointerLock) (+10 more)

### Community 20 - "Düzenleme Modalı ve Sesli Not"
Cohesion: 0.17
Nodes (11): EditModal(), fitStickyText(), getMeasurer(), largestFit(), measurable(), normalizeStickyColor(), normalizeStickyText(), parseStickyContent() (+3 more)

### Community 21 - "Markdown Kopyalama"
Cohesion: 0.26
Nodes (13): bounds(), copyMarkdownAcross(), copyMarkdownSelection(), escapeAttr(), inlineContainers(), marks(), pointToSource(), rangeToSource() (+5 more)

### Community 22 - "Markdown Düzenleme (Enter/Kod)"
Cohesion: 0.29
Nodes (7): insideFence(), lineEnd(), linePrefixFor(), lineStart(), markdownEnter(), toggleLines(), toggleTask()

### Community 23 - "Dünya Seçimi Ekranı"
Cohesion: 0.22
Nodes (3): ContextCard(), hashIndex(), WorldSelect()

### Community 24 - "Oda Doku Çıkarma (Python)"
Cohesion: 0.22
Nodes (6): flatten(), normal_from(), Aydınlatmayı böl, tonu koru; ortalama parlaklık = target. Işık, görüntü cells=(s, Doygunluğu azalt, ortalama rengi hedefe taşı (dokudaki değişim korunur), Parlaklığı yükseklik sayıp Sobel ile OpenGL normal haritası (y yukarı), tint_to()

### Community 25 - "Google Hesap Yardımcıları"
Cohesion: 0.43
Nodes (7): askGoogleEmail(), ensureGoogleEmail(), getGoogleEmail(), isEmail(), isGoogleHost(), setGoogleEmail(), withAuthUser()

### Community 26 - "Uygulama Kökü ve Hata Sınırı"
Cohesion: 0.29
Nodes (1): SceneErrorBoundary

### Community 27 - "Oda Navigasyon HUD"
Cohesion: 0.33
Nodes (3): RoomNavHUD(), getAncestors(), getRootRoom()

### Community 28 - "Pano Izgarası"
Cohesion: 0.4
Nodes (2): BoardGrid(), measure()

### Community 29 - "Vurgulama Katmanı"
Cohesion: 0.4
Nodes (2): rangeRects(), textPoint()

### Community 31 - "Blok Seçim Çubuğu"
Cohesion: 0.33
Nodes (2): blockClipboard, BlockSelection()

### Community 32 - "Kota Satırı Arayüzü (Aşama 8)"
Cohesion: 0.33
Nodes (2): fmtQuota(), QuotaLine()

### Community 33 - "Uygulama Görselleri ve Logolar"
Cohesion: 0.53
Nodes (6): Focus Room Application, Hero Image - Isometric Room Layers, React JavaScript Library, React Logo SVG, Vite Logo SVG, Vite Build Tool

### Community 34 - "GIF Kare Worker'ı"
Cohesion: 0.5
Nodes (2): decodeRole(), downscale()

### Community 42 - "Oda Ayarları Modalı"
Cohesion: 0.67
Nodes (2): parseWallId(), RoomModal()

### Community 48 - "highlightPaths (3)"
Cohesion: 1.0
Nodes (2): seeded(), strokePaths()

### Community 52 - "geometry (3)"
Cohesion: 1.0
Nodes (2): blockAtPoint(), rowRects()

### Community 73 - "plan (1)"
Cohesion: 1.0
Nodes (1): Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)

## Knowledge Gaps
- **58 isolated node(s):** `Aydınlatmayı böl, tonu koru; ortalama parlaklık = target. Işık, görüntü cells=(s`, `Doygunluğu azalt, ortalama rengi hedefe taşı (dokudaki değişim korunur)`, `Parlaklığı yükseklik sayıp Sobel ile OpenGL normal haritası (y yukarı)`, `/api/slide-from-path Keyfi Dosya Okuma Açığı`, `Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)` (+53 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Uygulama Kökü ve Hata Sınırı`** (7 nodes): `App()`, `SceneErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Pano Izgarası`** (6 nodes): `BoardGrid()`, `clamp()`, `measure()`, `slotLeft()`, `slotTop()`, `BoardGrid.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Vurgulama Katmanı`** (6 nodes): `byLine()`, `HighlightLayer()`, `HighlightStroke()`, `rangeRects()`, `textPoint()`, `HighlightStroke.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Blok Seçim Çubuğu`** (6 nodes): `blockClipboard`, `BarRule()`, `BlockSelection()`, `PasteButton()`, `SelectionBar()`, `BlockSelection.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Kota Satırı Arayüzü (Aşama 8)`** (6 nodes): `contextWindowOf()`, `fmtQuota()`, `fmtTokens()`, `QuotaLine()`, `QuotaLine.jsx`, `quotaFormat.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `GIF Kare Worker'ı`** (5 nodes): `decodeRole()`, `downscale()`, `encodeRole()`, `frameName()`, `gifFramesWorker.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Oda Ayarları Modalı`** (4 nodes): `configForLayer()`, `parseWallId()`, `RoomModal()`, `RoomModal.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `highlightPaths (3)`** (3 nodes): `seeded()`, `strokePaths()`, `highlightPaths.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `geometry (3)`** (3 nodes): `blockAtPoint()`, `rowRects()`, `geometry.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `plan (1)`** (1 nodes): `Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `join()` connect `Backend Sunucu ve Session Çekirdeği` to `HTML/Zengin Metin → Markdown`, `Kitaplık ve Defter Planı`, `Zaman Çizelgesi ve Takvim Notları`, `Defter Ekranı ve Haftalık Düzen`, `Not Blokları ve Pano Kartları`, `Canvas ve Ok Katmanı`, `Bench, Ajan Koruma ve Model Kararları`, `Görsel Ekler ve Pano`, `Defter Teması ve Alt Çubuk`, `Markdown Görünümü ve Metin Birimleri`, `Not Görselleri ve Yerleşim`, `Markdown Kopyalama`, `Markdown Düzenleme (Enter/Kod)`?**
  _High betweenness centrality (0.215) - this node is a cross-community bridge._
- **Why does `replace()` connect `HTML/Zengin Metin → Markdown` to `Backend Sunucu ve Session Çekirdeği`, `Kota Satırı Arayüzü (Aşama 8)`, `Kitaplık ve Defter Planı`, `Defter Ekranı ve Haftalık Düzen`, `Not Blokları ve Pano Kartları`, `Canvas ve Ok Katmanı`, `Bench, Ajan Koruma ve Model Kararları`, `Görsel Ekler ve Pano`, `Markdown Görünümü ve Metin Birimleri`, `Medya Overlay Tile'ları`, `Çizim Modu ve Kontur`, `Düzenleme Modalı ve Sesli Not`, `Markdown Kopyalama`?**
  _High betweenness centrality (0.146) - this node is a cross-community bridge._
- **Why does `test()` connect `HTML/Zengin Metin → Markdown` to `Backend Sunucu ve Session Çekirdeği`, `Kitaplık ve Defter Planı`, `Zaman Çizelgesi ve Takvim Notları`, `Defter Ekranı ve Haftalık Düzen`, `Canvas ve Ok Katmanı`, `Kota Ölçümü (Aşama 1)`, `Bench, Ajan Koruma ve Model Kararları`, `Spawn Profilleri ve Diyeti (Aşama 2-3)`, `Görsel Ekler ve Pano`, `Markdown Görünümü ve Metin Birimleri`, `Düzenleme Modalı ve Sesli Not`, `Markdown Kopyalama`, `Markdown Düzenleme (Enter/Kod)`, `Google Hesap Yardımcıları`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Are the 62 inferred relationships involving `join()` (e.g. with `unlinkUploads()` and `copyUpload()`) actually correct?**
  _`join()` has 62 INFERRED edges - model-reasoned connections that need verification._
- **Are the 49 inferred relationships involving `test()` (e.g. with `checkBashCommand()` and `stickyContent()`) actually correct?**
  _`test()` has 49 INFERRED edges - model-reasoned connections that need verification._
- **Are the 46 inferred relationships involving `replace()` (e.g. with `diskName()` and `stickyContent()`) actually correct?**
  _`replace()` has 46 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `PersistentSession` (e.g. with `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)` and `turnRecord()`) actually correct?**
  _`PersistentSession` has 3 INFERRED edges - model-reasoned connections that need verification._