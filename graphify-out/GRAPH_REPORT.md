# Graph Report - focus-room-main  (2026-10-27)

## Corpus Check
- 70 files · ~148,846 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 684 nodes · 1128 edges · 26 communities detected
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 142 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]

## God Nodes (most connected - your core abstractions)
1. `PersistentSession` - 22 edges
2. `test()` - 18 edges
3. `indexOf()` - 16 edges
4. `normalizeDepths()` - 15 edges
5. `formatRange()` - 14 edges
6. `isValidStamp()` - 12 edges
7. `LoopRunner` - 11 edges
8. `hasTime()` - 11 edges
9. `sanitizeNote()` - 11 edges
10. `TimelineBoard()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `PersistentSession` --references--> `Senaryo: roomchat-3turn (3 turluk sohbet)`  [INFERRED]
  server.js → bench/scenarios.md
- `LoopRunner` --references--> `Senaryo: roomsession-crud (LoopFlow)`  [INFERRED]
  server.js → bench/scenarios.md
- `PersistentSession` --references--> `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)`  [INFERRED]
  server.js → bench/FAZ3.md
- `Genel İnceleme & Düzeltme Planı (genel-fix)` --semantically_similar_to--> `YÖNTEM — Deneme-yanılma Yerine Kanıtla İlerleme`  [INFERRED] [semantically similar]
  plan.md → bench/METHOD.md
- `parseNotebook()` --calls--> `sanitizeNotebook()`  [INFERRED]
  server.js → src/utils/notebookModel.js

## Hyperedges (group relationships)
- **Token/Parite Faz Pipeline (baseline → faz2 → faz3 → parite kapanışı)** — baseline_faz1_baseline, faz2_cache_prefix_sabitleme, faz3_transport_hijyeni, parite_yetenek_tablosu, method_kanitla_ilerleme [EXTRACTED 1.00]
- **A/B Bench Senaryo Takımı (deterministik önce/sonra ölçüm)** — scenarios_direct_cafe, scenarios_roomsession_crud, scenarios_roomchat_3turn, bench_scenarios, baseline_processedtotal [EXTRACTED 1.00]
- **Genel-Fix Güvenlik Bulguları (server.js girdi doğrulama açıkları)** — plan_slide_from_path_vuln, plan_fetch_url_ssrf, plan_multer_sanitization, plan_genel_fix_plani [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.03
Nodes (51): migrate(), readJson(), assignTaskIds(), blueprintSkill(), bootMigrate(), buildSpawnEnv(), cliModel(), configForLayer() (+43 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (63): pasteMsgView(), MonthGrid(), NoteChip(), chipBtn(), NoteEditor(), axisTicks(), dateToX(), dayIndex() (+55 more)

### Community 2 - "Community 2"
Cohesion: 0.04
Nodes (41): ArrowLayer(), CanvasMesh(), a4MaxH(), buildInstaItem(), buildPasteItems(), copyImageToClipboard(), copyItemAssets(), disposePoolAudio() (+33 more)

### Community 3 - "Community 3"
Cohesion: 0.08
Nodes (47): addPage(), appendRow(), archiveCompleted(), backspaceAt(), childProgressMap(), cleanBookName(), cleanClip(), cleanCover() (+39 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (17): planNotebookReconcile(), resolveRoot(), addUsage(), LoopRunner, makeTurnSink(), MultiAgentRunner, pidRssMb(), readAgentProfile() (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.07
Nodes (27): NotebookCard(), loadRoom(), parseBookKey(), clock(), NotebookOverlay(), pad2(), SaveStatus(), applyDoc() (+19 more)

### Community 6 - "Community 6"
Cohesion: 0.06
Nodes (6): EditModal(), MarkdownMesh(), relTime(), SessionMesh(), TextureErrorBoundary, useSpeechToText()

### Community 7 - "Community 7"
Cohesion: 0.12
Nodes (28): isImageFile(), looksMojibake(), clipboardToMarkdown(), convertHtml(), countLinksWithoutUrl(), detectLang(), fenceFor(), getService() (+20 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (26): BASELINE — Faz 1 Ground Truth (optimizasyon öncesi), processedTotal Metriği (input+cacheWrite+cacheRead+output), --bare Erteleme Gerekçesi: OAuth kurulumu keychain okuyamaz, FAZ 2 — Cache-Prefix Sabitleme, Cache TTL Env (FORCE_PROMPT_CACHING_5M / ENABLE_PROMPT_CACHING_1H), --exclude-dynamic-system-prompt-sections (6 spawn noktası), Rol Bazlı Tool Kısma (roomchat/review tool setleri), Idle ↔ TTL Hizalama (1H → 30 dk idle, 5M → 15 dk) (+18 more)

### Community 9 - "Community 9"
Cohesion: 0.13
Nodes (12): DoorPlane(), doorWorldPos(), applyRingCollision(), canPassThrough(), canPassThroughRing(), decodeWallId(), encodeWallId(), getDoorInstanceIds() (+4 more)

### Community 10 - "Community 10"
Cohesion: 0.22
Nodes (4): logTurnUsage(), PersistentSession, sseLine(), userLine()

### Community 11 - "Community 11"
Cohesion: 0.12
Nodes (8): flagProps(), NotebookPage(), flagSkin(), NotebookRowImpl(), flagColor(), textMetrics(), useFontsReady(), lineDataUri()

### Community 12 - "Community 12"
Cohesion: 0.16
Nodes (8): formatClock(), clampPpd(), clampZoom(), loadView(), NowPill(), storeView(), TimelinePage(), viewKey()

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (3): ContextCard(), hashIndex(), WorldSelect()

### Community 15 - "Community 15"
Cohesion: 0.29
Nodes (1): SceneErrorBoundary

### Community 16 - "Community 16"
Cohesion: 0.52
Nodes (6): clipToHtml(), clipToPlain(), esc(), itemHtml(), readNotebookClip(), writeNotebookClip()

### Community 17 - "Community 17"
Cohesion: 0.33
Nodes (3): RoomNavHUD(), getAncestors(), getRootRoom()

### Community 18 - "Community 18"
Cohesion: 0.29
Nodes (7): Bilinçli Erteleme Gerekçesi: keyfi dosya/URL okuma yerel uygulamanın amaçlanan özelliği, /api/fetch-url SSRF Açığı, /api/slide-from-path Keyfi Dosya Okuma Açığı, 3D Interactive Media Gallery Experience, First Person Navigation (WASD + Pointer Lock), Markdown Text Panels (çok kolonlu akış), Express Proxy Backend (/api/fetch-url, CORS bypass)

### Community 19 - "Community 19"
Cohesion: 0.53
Nodes (6): Focus Room Application, Hero Image - Isometric Room Layers, React JavaScript Library, React Logo SVG, Vite Logo SVG, Vite Build Tool

### Community 23 - "Community 23"
Cohesion: 0.67
Nodes (2): parseWallId(), RoomModal()

### Community 35 - "Community 35"
Cohesion: 0.67
Nodes (3): Smart Aspect Ratio Locking, Dynamic Grid & Raycasting System, In-Game Media Editor Modal (E tuşu)

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (2): Git Push/Merge Onay Kuralı, Graphify Kullanım Kuralları

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (2): Native GIF Rendering via HTML Portals, YouTube Embed Support (iframe in 3D)

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (1): SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (1): Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (1): Eşikli Regresyon-Guard Önerisi (bench --assert)

## Ambiguous Edges - Review These
- `Git Push/Merge Onay Kuralı` → `Graphify Kullanım Kuralları`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to

## Knowledge Gaps
- **25 isolated node(s):** `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`, `Hero Image - Isometric Room Layers`, `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları`, `First Person Navigation (WASD + Pointer Lock)` (+20 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 15`** (7 nodes): `App()`, `SceneErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (4 nodes): `configForLayer()`, `parseWallId()`, `RoomModal()`, `RoomModal.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (2 nodes): `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (2 nodes): `Native GIF Rendering via HTML Portals`, `YouTube Embed Support (iframe in 3D)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `Eşikli Regresyon-Guard Önerisi (bench --assert)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Git Push/Merge Onay Kuralı` and `Graphify Kullanım Kuralları`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `test()` connect `Community 7` to `Community 0`, `Community 1`, `Community 2`, `Community 3`?**
  _High betweenness centrality (0.091) - this node is a cross-community bridge._
- **Why does `PersistentSession` connect `Community 10` to `Community 0`, `Community 8`, `Community 4`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Why does `weekLayout()` connect `Community 1` to `Community 4`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `PersistentSession` (e.g. with `Senaryo: roomchat-3turn (3 turluk sohbet)` and `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)`) actually correct?**
  _`PersistentSession` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 17 inferred relationships involving `test()` (e.g. with `fetchHtmlHead()` and `cliModel()`) actually correct?**
  _`test()` has 17 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `formatRange()` (e.g. with `NoteChip()` and `NoteCardNarrow()`) actually correct?**
  _`formatRange()` has 3 INFERRED edges - model-reasoned connections that need verification._