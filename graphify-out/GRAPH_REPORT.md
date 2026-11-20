# Graph Report - focus-room-main  (2026-11-19)

## Corpus Check
- 138 files · ~216,046 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1137 nodes · 1925 edges · 39 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 387 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 76|Community 76]]

## God Nodes (most connected - your core abstractions)
1. `join()` - 57 edges
2. `call()` - 47 edges
3. `test()` - 42 edges
4. `replace()` - 38 edges
5. `PersistentSession` - 22 edges
6. `clipboardToMarkdown()` - 17 edges
7. `formatRange()` - 14 edges
8. `weekOf()` - 12 edges
9. `isValidStamp()` - 12 edges
10. `LoopRunner` - 11 edges

## Surprising Connections (you probably didn't know these)
- `PersistentSession` --references--> `Senaryo: roomchat-3turn (3 turluk sohbet)`  [INFERRED]
  server.js → bench/scenarios.md
- `LoopRunner` --references--> `Senaryo: roomsession-crud (LoopFlow)`  [INFERRED]
  server.js → bench/scenarios.md
- `PersistentSession` --references--> `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)`  [INFERRED]
  server.js → bench/FAZ3.md
- `classifyIdeaScale()` --calls--> `test()`  [INFERRED]
  server.js → scripts/verify-timeline-model.mjs
- `dateOfKey()` --calls--> `test()`  [INFERRED]
  src/pages/library/notebookLayout.js → scripts/verify-timeline-model.mjs

## Hyperedges (group relationships)
- **Token/Parite Faz Pipeline (baseline → faz2 → faz3 → parite kapanışı)** — baseline_faz1_baseline, faz2_cache_prefix_sabitleme, faz3_transport_hijyeni, parite_yetenek_tablosu, method_kanitla_ilerleme [EXTRACTED 1.00]
- **A/B Bench Senaryo Takımı (deterministik önce/sonra ölçüm)** — scenarios_direct_cafe, scenarios_roomsession_crud, scenarios_roomchat_3turn, bench_scenarios, baseline_processedtotal [EXTRACTED 1.00]
- **Genel-Fix Güvenlik Bulguları (server.js girdi doğrulama açıkları)** — plan_slide_from_path_vuln, plan_fetch_url_ssrf, plan_multer_sanitization, plan_genel_fix_plani [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (79): frameDelayMs(), getGifFrames(), planGif(), pump(), status(), LibraryPage(), migrate(), readJson() (+71 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (76): cardShell(), NoteCard(), NoteCardNarrow(), mdTileWidth(), measureMdCols(), parseMd(), MonthGrid(), NoteChip() (+68 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (72): pasteMsgView(), saveImageItem(), looksMojibake(), cellAlign(), cleanup(), clipboardToMarkdown(), closestTag(), codeEditorText() (+64 more)

### Community 3 - "Community 3"
Cohesion: 0.05
Nodes (41): duplicateAttachmentFile(), attachmentNames(), withCopiedFiles(), BoardCard(), boardNotePreview(), matchesBoardNote(), normalize(), headingMetrics() (+33 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (33): ArrowLayer(), CanvasMesh(), a4MaxH(), buildInstaItem(), buildPasteItems(), copyImageToClipboard(), disposePoolAudio(), fetchImageBlob() (+25 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (49): call(), clearHabits(), createBoardNote(), createCategory(), createHabit(), createNote(), createNotebook(), deleteBoardNote() (+41 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (30): CategoryManager(), openHeldNotebook(), cleanCategoryName(), dateRef(), hasNumberedPages(), isDocumentPaper(), refDate(), monthRef() (+22 more)

### Community 7 - "Community 7"
Cohesion: 0.09
Nodes (37): CalendarPage(), CalendarScreen(), FavoriteCard(), headingOf(), pageKeyOf(), previewOf(), DayCell(), HabitPage() (+29 more)

### Community 8 - "Community 8"
Cohesion: 0.05
Nodes (24): deleteAttachmentFile(), blocksText(), clearClipboard(), deleteBlockFiles(), deleteContentFiles(), putOnClipboard(), replaceClipboard(), takeFromClipboard() (+16 more)

### Community 9 - "Community 9"
Cohesion: 0.06
Nodes (23): BookCover(), bayLeft(), Bookshelf(), contentHeight(), measure(), previewSlot(), rowTop(), ShelfBook() (+15 more)

### Community 10 - "Community 10"
Cohesion: 0.09
Nodes (29): attachmentUrl(), chooseFile(), clipboardHasImage(), cropAttachmentImage(), fileAttachment(), imageAttachment(), imageSize(), openAttachment() (+21 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (7): EditModal(), MarkdownMesh(), relTime(), SessionMesh(), TextureErrorBoundary, YoutubeMesh(), useSpeechToText()

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (20): BottomBar(), Column(), initialValue(), pad(), TimeMenu(), DocumentBar(), boxTilt(), HandText() (+12 more)

### Community 13 - "Community 13"
Cohesion: 0.1
Nodes (17): DocText(), LiveDocText(), pointAt(), RawDocText(), signature(), UnitInput(), wrapperStyle(), writeSelection() (+9 more)

### Community 14 - "Community 14"
Cohesion: 0.1
Nodes (26): BASELINE — Faz 1 Ground Truth (optimizasyon öncesi), processedTotal Metriği (input+cacheWrite+cacheRead+output), --bare Erteleme Gerekçesi: OAuth kurulumu keychain okuyamaz, FAZ 2 — Cache-Prefix Sabitleme, Cache TTL Env (FORCE_PROMPT_CACHING_5M / ENABLE_PROMPT_CACHING_1H), --exclude-dynamic-system-prompt-sections (6 spawn noktası), Rol Bazlı Tool Kısma (roomchat/review tool setleri), Idle ↔ TTL Hizalama (1H → 30 dk idle, 5M → 15 dk) (+18 more)

### Community 15 - "Community 15"
Cohesion: 0.13
Nodes (12): DoorPlane(), doorWorldPos(), applyRingCollision(), canPassThrough(), canPassThroughRing(), decodeWallId(), encodeWallId(), getDoorInstanceIds() (+4 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (11): imageName(), ImageViewer(), ViewerStage(), PageSidebar(), seeded(), stripShape(), portalRoot(), paperShape() (+3 more)

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (14): NotebookCard(), createLibraryBook(), editLibraryBook(), libraryMeta(), openLibraryForm(), settleLibraryForm(), LibraryNotebookOverlay(), ensureLibrary() (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (6): frameSize(), imageFrame(), imageLeft(), imageRect(), layoutBlockImages(), NoteImage()

### Community 19 - "Community 19"
Cohesion: 0.29
Nodes (7): insideFence(), lineEnd(), linePrefixFor(), lineStart(), markdownEnter(), toggleLines(), toggleTask()

### Community 20 - "Community 20"
Cohesion: 0.22
Nodes (3): ContextCard(), hashIndex(), WorldSelect()

### Community 21 - "Community 21"
Cohesion: 0.22
Nodes (6): flatten(), normal_from(), Aydınlatmayı böl, tonu koru; ortalama parlaklık = target. Işık, görüntü cells=(s, Doygunluğu azalt, ortalama rengi hedefe taşı (dokudaki değişim korunur), Parlaklığı yükseklik sayıp Sobel ile OpenGL normal haritası (y yukarı), tint_to()

### Community 22 - "Community 22"
Cohesion: 0.39
Nodes (7): bookOut(), cleanTitle(), int(), noteOut(), parseSettings(), registerLibraryRoutes(), stamp()

### Community 23 - "Community 23"
Cohesion: 0.43
Nodes (7): askGoogleEmail(), ensureGoogleEmail(), getGoogleEmail(), isEmail(), isGoogleHost(), setGoogleEmail(), withAuthUser()

### Community 24 - "Community 24"
Cohesion: 0.29
Nodes (1): SceneErrorBoundary

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (3): RoomNavHUD(), getAncestors(), getRootRoom()

### Community 26 - "Community 26"
Cohesion: 0.29
Nodes (7): Bilinçli Erteleme Gerekçesi: keyfi dosya/URL okuma yerel uygulamanın amaçlanan özelliği, /api/fetch-url SSRF Açığı, /api/slide-from-path Keyfi Dosya Okuma Açığı, 3D Interactive Media Gallery Experience, First Person Navigation (WASD + Pointer Lock), Markdown Text Panels (çok kolonlu akış), Express Proxy Backend (/api/fetch-url, CORS bypass)

### Community 27 - "Community 27"
Cohesion: 0.4
Nodes (2): BoardGrid(), measure()

### Community 28 - "Community 28"
Cohesion: 0.4
Nodes (2): rangeRects(), textPoint()

### Community 30 - "Community 30"
Cohesion: 0.53
Nodes (6): Focus Room Application, Hero Image - Isometric Room Layers, React JavaScript Library, React Logo SVG, Vite Logo SVG, Vite Build Tool

### Community 31 - "Community 31"
Cohesion: 0.5
Nodes (2): decodeRole(), downscale()

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (2): parseWallId(), RoomModal()

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (2): seeded(), strokePaths()

### Community 50 - "Community 50"
Cohesion: 0.67
Nodes (3): Smart Aspect Ratio Locking, Dynamic Grid & Raycasting System, In-Game Media Editor Modal (E tuşu)

### Community 67 - "Community 67"
Cohesion: 1.0
Nodes (2): Git Push/Merge Onay Kuralı, Graphify Kullanım Kuralları

### Community 68 - "Community 68"
Cohesion: 1.0
Nodes (2): Native GIF Rendering via HTML Portals, YouTube Embed Support (iframe in 3D)

### Community 72 - "Community 72"
Cohesion: 1.0
Nodes (1): SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (1): Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)

### Community 76 - "Community 76"
Cohesion: 1.0
Nodes (1): Eşikli Regresyon-Guard Önerisi (bench --assert)

## Ambiguous Edges - Review These
- `Git Push/Merge Onay Kuralı` → `Graphify Kullanım Kuralları`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to

## Knowledge Gaps
- **28 isolated node(s):** `Aydınlatmayı böl, tonu koru; ortalama parlaklık = target. Işık, görüntü cells=(s`, `Doygunluğu azalt, ortalama rengi hedefe taşı (dokudaki değişim korunur)`, `Parlaklığı yükseklik sayıp Sobel ile OpenGL normal haritası (y yukarı)`, `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`, `Hero Image - Isometric Room Layers` (+23 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 24`** (7 nodes): `App()`, `SceneErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (6 nodes): `BoardGrid()`, `clamp()`, `measure()`, `slotLeft()`, `slotTop()`, `BoardGrid.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (6 nodes): `byLine()`, `HighlightLayer()`, `HighlightStroke()`, `rangeRects()`, `textPoint()`, `HighlightStroke.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (5 nodes): `decodeRole()`, `downscale()`, `encodeRole()`, `frameName()`, `gifFramesWorker.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (4 nodes): `configForLayer()`, `parseWallId()`, `RoomModal()`, `RoomModal.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (3 nodes): `seeded()`, `strokePaths()`, `highlightPaths.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 67`** (2 nodes): `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 68`** (2 nodes): `Native GIF Rendering via HTML Portals`, `YouTube Embed Support (iframe in 3D)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 72`** (1 nodes): `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 76`** (1 nodes): `Eşikli Regresyon-Guard Önerisi (bench --assert)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Git Push/Merge Onay Kuralı` and `Graphify Kullanım Kuralları`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `join()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 7`, `Community 8`, `Community 9`, `Community 10`, `Community 12`, `Community 13`, `Community 16`, `Community 19`, `Community 22`?**
  _High betweenness centrality (0.224) - this node is a cross-community bridge._
- **Why does `replace()` connect `Community 2` to `Community 0`, `Community 1`, `Community 3`, `Community 4`, `Community 6`, `Community 8`, `Community 10`, `Community 11`, `Community 22`?**
  _High betweenness centrality (0.112) - this node is a cross-community bridge._
- **Why does `test()` connect `Community 2` to `Community 0`, `Community 1`, `Community 4`, `Community 7`, `Community 10`, `Community 13`, `Community 19`, `Community 22`, `Community 23`?**
  _High betweenness centrality (0.110) - this node is a cross-community bridge._
- **Are the 56 inferred relationships involving `join()` (e.g. with `unlinkUploads()` and `copyUpload()`) actually correct?**
  _`join()` has 56 INFERRED edges - model-reasoned connections that need verification._
- **Are the 41 inferred relationships involving `test()` (e.g. with `fetchHtmlHead()` and `cliModel()`) actually correct?**
  _`test()` has 41 INFERRED edges - model-reasoned connections that need verification._
- **Are the 34 inferred relationships involving `replace()` (e.g. with `diskName()` and `decodeHtmlEntities()`) actually correct?**
  _`replace()` has 34 INFERRED edges - model-reasoned connections that need verification._