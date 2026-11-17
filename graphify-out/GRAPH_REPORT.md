# Graph Report - focus-room-main  (2026-11-17)

## Corpus Check
- 141 files · ~229,838 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1229 nodes · 2135 edges · 40 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 419 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 75|Community 75]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]

## God Nodes (most connected - your core abstractions)
1. `join()` - 60 edges
2. `call()` - 48 edges
3. `replace()` - 41 edges
4. `test()` - 39 edges
5. `indexOf()` - 24 edges
6. `PersistentSession` - 22 edges
7. `clipboardToMarkdown()` - 17 edges
8. `normalizeDepths()` - 15 edges
9. `formatRange()` - 14 edges
10. `NotebookPage()` - 13 edges

## Surprising Connections (you probably didn't know these)
- `PersistentSession` --references--> `Senaryo: roomchat-3turn (3 turluk sohbet)`  [INFERRED]
  server.js → bench/scenarios.md
- `PersistentSession` --references--> `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)`  [INFERRED]
  server.js → bench/FAZ3.md
- `LoopRunner` --references--> `Senaryo: roomsession-crud (LoopFlow)`  [INFERRED]
  server.js → bench/scenarios.md
- `cliArgValue()` --calls--> `indexOf()`  [INFERRED]
  server.js → src/utils/notebookModel.js
- `classifyIdeaScale()` --calls--> `test()`  [INFERRED]
  server.js → scripts/verify-notebook-model.mjs

## Hyperedges (group relationships)
- **Token/Parite Faz Pipeline (baseline → faz2 → faz3 → parite kapanışı)** — baseline_faz1_baseline, faz2_cache_prefix_sabitleme, faz3_transport_hijyeni, parite_yetenek_tablosu, method_kanitla_ilerleme [EXTRACTED 1.00]
- **A/B Bench Senaryo Takımı (deterministik önce/sonra ölçüm)** — scenarios_direct_cafe, scenarios_roomsession_crud, scenarios_roomchat_3turn, bench_scenarios, baseline_processedtotal [EXTRACTED 1.00]
- **Genel-Fix Güvenlik Bulguları (server.js girdi doğrulama açıkları)** — plan_slide_from_path_vuln, plan_fetch_url_ssrf, plan_multer_sanitization, plan_genel_fix_plani [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (83): frameDelayMs(), getGifFrames(), planGif(), pump(), status(), LibraryPage(), migrate(), readJson() (+75 more)

### Community 1 - "Community 1"
Cohesion: 0.04
Nodes (67): CalendarPage(), CalendarScreen(), CategoryManager(), FavoriteCard(), headingOf(), pageKeyOf(), previewOf(), DayCell() (+59 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (66): cardShell(), NoteCard(), NoteCardNarrow(), MonthGrid(), NoteChip(), chipBtn(), NoteEditor(), parseTimeline() (+58 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (69): saveImageItem(), richPaste(), looksMojibake(), cellAlign(), cleanup(), clipboardToMarkdown(), closestTag(), codeEditorText() (+61 more)

### Community 4 - "Community 4"
Cohesion: 0.05
Nodes (40): duplicateAttachmentFile(), attachmentNames(), withCopiedFiles(), BoardCard(), boardNotePreview(), matchesBoardNote(), normalize(), headingMetrics() (+32 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (56): call(), clearHabits(), createBoardNote(), createCategory(), createHabit(), createNote(), createNotebook(), deleteBoardNote() (+48 more)

### Community 6 - "Community 6"
Cohesion: 0.05
Nodes (38): ArrowLayer(), CanvasMesh(), a4MaxH(), buildInstaItem(), buildPasteItems(), copyImageToClipboard(), copyItemAssets(), disposePoolAudio() (+30 more)

### Community 7 - "Community 7"
Cohesion: 0.04
Nodes (31): BookCover(), BottomBar(), Column(), initialValue(), pad(), TimeMenu(), coverTitleStyle(), DocumentBar() (+23 more)

### Community 8 - "Community 8"
Cohesion: 0.08
Nodes (46): addPage(), appendRow(), archiveCompleted(), backspaceAt(), childProgressMap(), cleanBookName(), cleanClip(), cleanCover() (+38 more)

### Community 9 - "Community 9"
Cohesion: 0.07
Nodes (32): attachmentUrl(), chooseFile(), clipboardHasImage(), cropAttachmentImage(), fileAttachment(), imageAttachment(), imageSize(), openAttachment() (+24 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (21): deleteAttachmentFile(), blocksText(), clearClipboard(), deleteBlockFiles(), deleteContentFiles(), putOnClipboard(), replaceClipboard(), takeFromClipboard() (+13 more)

### Community 11 - "Community 11"
Cohesion: 0.06
Nodes (7): EditModal(), MarkdownMesh(), relTime(), SessionMesh(), TextureErrorBoundary, YoutubeMesh(), useSpeechToText()

### Community 12 - "Community 12"
Cohesion: 0.08
Nodes (25): loadRoom(), parseBookKey(), clock(), NotebookOverlay(), pad2(), SaveStatus(), applyDoc(), applyRows() (+17 more)

### Community 13 - "Community 13"
Cohesion: 0.1
Nodes (14): insideFence(), lineEnd(), linePrefixFor(), lineStart(), markdownEnter(), toggleLines(), toggleTask(), clipToHtml() (+6 more)

### Community 14 - "Community 14"
Cohesion: 0.1
Nodes (17): DocText(), LiveDocText(), pointAt(), RawDocText(), signature(), UnitInput(), wrapperStyle(), writeSelection() (+9 more)

### Community 15 - "Community 15"
Cohesion: 0.1
Nodes (25): BASELINE — Faz 1 Ground Truth (optimizasyon öncesi), processedTotal Metriği (input+cacheWrite+cacheRead+output), --bare Erteleme Gerekçesi: OAuth kurulumu keychain okuyamaz, FAZ 2 — Cache-Prefix Sabitleme, Cache TTL Env (FORCE_PROMPT_CACHING_5M / ENABLE_PROMPT_CACHING_1H), --exclude-dynamic-system-prompt-sections (6 spawn noktası), Rol Bazlı Tool Kısma (roomchat/review tool setleri), Idle ↔ TTL Hizalama (1H → 30 dk idle, 5M → 15 dk) (+17 more)

### Community 16 - "Community 16"
Cohesion: 0.11
Nodes (10): drawColorOf(), drawWidthOf(), segmentDistance2(), strokeHit(), strokesBottom(), strokesBounds(), DrawingActions(), DrawingBar() (+2 more)

### Community 17 - "Community 17"
Cohesion: 0.13
Nodes (12): DoorPlane(), doorWorldPos(), applyRingCollision(), canPassThrough(), canPassThroughRing(), decodeWallId(), encodeWallId(), getDoorInstanceIds() (+4 more)

### Community 18 - "Community 18"
Cohesion: 0.16
Nodes (8): formatClock(), clampPpd(), clampZoom(), loadView(), NowPill(), storeView(), TimelinePage(), viewKey()

### Community 19 - "Community 19"
Cohesion: 0.22
Nodes (6): frameSize(), imageFrame(), imageLeft(), imageRect(), layoutBlockImages(), NoteImage()

### Community 20 - "Community 20"
Cohesion: 0.22
Nodes (3): ContextCard(), hashIndex(), WorldSelect()

### Community 21 - "Community 21"
Cohesion: 0.33
Nodes (8): bayLeft(), Bookshelf(), contentHeight(), measure(), previewSlot(), ShelfBook(), slotLeft(), slotTop()

### Community 22 - "Community 22"
Cohesion: 0.43
Nodes (7): askGoogleEmail(), ensureGoogleEmail(), getGoogleEmail(), isEmail(), isGoogleHost(), setGoogleEmail(), withAuthUser()

### Community 23 - "Community 23"
Cohesion: 0.29
Nodes (1): SceneErrorBoundary

### Community 24 - "Community 24"
Cohesion: 0.33
Nodes (3): RoomNavHUD(), getAncestors(), getRootRoom()

### Community 25 - "Community 25"
Cohesion: 0.29
Nodes (7): Bilinçli Erteleme Gerekçesi: keyfi dosya/URL okuma yerel uygulamanın amaçlanan özelliği, /api/fetch-url SSRF Açığı, /api/slide-from-path Keyfi Dosya Okuma Açığı, 3D Interactive Media Gallery Experience, First Person Navigation (WASD + Pointer Lock), Markdown Text Panels (çok kolonlu akış), Express Proxy Backend (/api/fetch-url, CORS bypass)

### Community 26 - "Community 26"
Cohesion: 0.47
Nodes (3): paperShape(), seeded(), tornEdge()

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

### Community 36 - "Community 36"
Cohesion: 0.5
Nodes (2): seeded(), stripShape()

### Community 41 - "Community 41"
Cohesion: 0.67
Nodes (2): parseWallId(), RoomModal()

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (2): seeded(), strokePaths()

### Community 57 - "Community 57"
Cohesion: 0.67
Nodes (3): Smart Aspect Ratio Locking, Dynamic Grid & Raycasting System, In-Game Media Editor Modal (E tuşu)

### Community 70 - "Community 70"
Cohesion: 1.0
Nodes (2): Git Push/Merge Onay Kuralı, Graphify Kullanım Kuralları

### Community 71 - "Community 71"
Cohesion: 1.0
Nodes (2): Native GIF Rendering via HTML Portals, YouTube Embed Support (iframe in 3D)

### Community 75 - "Community 75"
Cohesion: 1.0
Nodes (1): SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)

### Community 78 - "Community 78"
Cohesion: 1.0
Nodes (1): Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)

### Community 79 - "Community 79"
Cohesion: 1.0
Nodes (1): Eşikli Regresyon-Guard Önerisi (bench --assert)

## Ambiguous Edges - Review These
- `Git Push/Merge Onay Kuralı` → `Graphify Kullanım Kuralları`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to

## Knowledge Gaps
- **25 isolated node(s):** `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`, `Hero Image - Isometric Room Layers`, `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları`, `First Person Navigation (WASD + Pointer Lock)` (+20 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 23`** (7 nodes): `App()`, `SceneErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (6 nodes): `BoardGrid()`, `clamp()`, `measure()`, `slotLeft()`, `slotTop()`, `BoardGrid.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (6 nodes): `byLine()`, `HighlightLayer()`, `HighlightStroke()`, `rangeRects()`, `textPoint()`, `HighlightStroke.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (5 nodes): `decodeRole()`, `downscale()`, `encodeRole()`, `frameName()`, `gifFramesWorker.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (5 nodes): `PageSidebar()`, `seeded()`, `SidebarRow()`, `stripShape()`, `PageSidebar.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (4 nodes): `configForLayer()`, `parseWallId()`, `RoomModal()`, `RoomModal.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (3 nodes): `seeded()`, `strokePaths()`, `highlightPaths.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 70`** (2 nodes): `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 71`** (2 nodes): `Native GIF Rendering via HTML Portals`, `YouTube Embed Support (iframe in 3D)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 75`** (1 nodes): `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 78`** (1 nodes): `Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 79`** (1 nodes): `Eşikli Regresyon-Guard Önerisi (bench --assert)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Git Push/Merge Onay Kuralı` and `Graphify Kullanım Kuralları`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `join()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 4`, `Community 36`, `Community 6`, `Community 7`, `Community 9`, `Community 10`, `Community 13`, `Community 14`?**
  _High betweenness centrality (0.216) - this node is a cross-community bridge._
- **Why does `replace()` connect `Community 3` to `Community 0`, `Community 1`, `Community 4`, `Community 6`, `Community 8`, `Community 9`, `Community 11`, `Community 13`, `Community 16`?**
  _High betweenness centrality (0.142) - this node is a cross-community bridge._
- **Why does `test()` connect `Community 3` to `Community 0`, `Community 1`, `Community 2`, `Community 6`, `Community 8`, `Community 9`, `Community 13`, `Community 14`, `Community 22`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Are the 59 inferred relationships involving `join()` (e.g. with `unlinkUploads()` and `copyUpload()`) actually correct?**
  _`join()` has 59 INFERRED edges - model-reasoned connections that need verification._
- **Are the 37 inferred relationships involving `replace()` (e.g. with `diskName()` and `decodeHtmlEntities()`) actually correct?**
  _`replace()` has 37 INFERRED edges - model-reasoned connections that need verification._
- **Are the 38 inferred relationships involving `test()` (e.g. with `fetchHtmlHead()` and `cliModel()`) actually correct?**
  _`test()` has 38 INFERRED edges - model-reasoned connections that need verification._