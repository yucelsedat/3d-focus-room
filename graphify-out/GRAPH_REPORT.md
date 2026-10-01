# Graph Report - focus-room-main  (2026-10-01)

## Corpus Check
- 48 files · ~114,271 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 489 nodes · 756 edges · 25 communities detected
- Extraction: 92% EXTRACTED · 8% INFERRED · 0% AMBIGUOUS · INFERRED: 61 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]

## God Nodes (most connected - your core abstractions)
1. `PersistentSession` - 22 edges
2. `indexOf()` - 15 edges
3. `test()` - 14 edges
4. `normalizeDepths()` - 13 edges
5. `LoopRunner` - 11 edges
6. `sanitizeNotebook()` - 10 edges
7. `SessionPool` - 9 edges
8. `htmlBodyToMarkdown()` - 9 edges
9. `subtreeEnd()` - 9 edges
10. `FAZ 2 — Cache-Prefix Sabitleme` - 9 edges

## Surprising Connections (you probably didn't know these)
- `PersistentSession` --references--> `Senaryo: roomchat-3turn (3 turluk sohbet)`  [INFERRED]
  server.js → bench/scenarios.md
- `LoopRunner` --references--> `Senaryo: roomsession-crud (LoopFlow)`  [INFERRED]
  server.js → bench/scenarios.md
- `PersistentSession` --references--> `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)`  [INFERRED]
  server.js → bench/FAZ3.md
- `cliArgValue()` --calls--> `indexOf()`  [INFERRED]
  server.js → src/utils/notebookModel.js
- `test()` --calls--> `isInstaUrl()`  [INFERRED]
  scripts/verify-notebook-model.mjs → src/components/CanvasMesh.jsx

## Hyperedges (group relationships)
- **Token/Parite Faz Pipeline (baseline → faz2 → faz3 → parite kapanışı)** — baseline_faz1_baseline, faz2_cache_prefix_sabitleme, faz3_transport_hijyeni, parite_yetenek_tablosu, method_kanitla_ilerleme [EXTRACTED 1.00]
- **A/B Bench Senaryo Takımı (deterministik önce/sonra ölçüm)** — scenarios_direct_cafe, scenarios_roomsession_crud, scenarios_roomchat_3turn, bench_scenarios, baseline_processedtotal [EXTRACTED 1.00]
- **Genel-Fix Güvenlik Bulguları (server.js girdi doğrulama açıkları)** — plan_slide_from_path_vuln, plan_fetch_url_ssrf, plan_multer_sanitization, plan_genel_fix_plani [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (41): assignTaskIds(), blueprintSkill(), buildSpawnEnv(), cliArgValue(), cliModel(), decodeHtmlEntities(), detectKindWithHaiku(), detectProject() (+33 more)

### Community 1 - "Community 1"
Cohesion: 0.1
Nodes (40): addPage(), appendRow(), archiveCompleted(), backspaceAt(), childProgressMap(), cleanTitle(), createEmptyDoc(), deleteRow() (+32 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (6): EditModal(), MarkdownMesh(), relTime(), SessionMesh(), TextureErrorBoundary, useSpeechToText()

### Community 3 - "Community 3"
Cohesion: 0.09
Nodes (20): disposePoolAudio(), getPoolAudio(), loadRoom(), planNotebookReconcile(), resolveRoot(), applyDoc(), applyRows(), closeNotebookOverlay() (+12 more)

### Community 4 - "Community 4"
Cohesion: 0.13
Nodes (26): looksMojibake(), clipboardToMarkdown(), convertHtml(), countLinksWithoutUrl(), detectLang(), fenceFor(), getService(), hasFormatting() (+18 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (11): addUsage(), LoopRunner, makeTurnSink(), MultiAgentRunner, readAgentProfile(), readRecall(), recallDir(), recallPath() (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.1
Nodes (26): BASELINE — Faz 1 Ground Truth (optimizasyon öncesi), processedTotal Metriği (input+cacheWrite+cacheRead+output), --bare Erteleme Gerekçesi: OAuth kurulumu keychain okuyamaz, FAZ 2 — Cache-Prefix Sabitleme, Cache TTL Env (FORCE_PROMPT_CACHING_5M / ENABLE_PROMPT_CACHING_1H), --exclude-dynamic-system-prompt-sections (6 spawn noktası), Rol Bazlı Tool Kısma (roomchat/review tool setleri), Idle ↔ TTL Hizalama (1H → 30 dk idle, 5M → 15 dk) (+18 more)

### Community 7 - "Community 7"
Cohesion: 0.1
Nodes (12): CanvasMesh(), formatBytes(), getBounds(), imageName(), ImageViewer(), InstaCard(), isInstaUrl(), measureTextItemH() (+4 more)

### Community 8 - "Community 8"
Cohesion: 0.12
Nodes (15): DoorPlane(), doorWorldPos(), applyRingCollision(), canPassThrough(), canPassThroughRing(), decodeWallId(), encodeWallId(), getDoorInstanceIds() (+7 more)

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (4): logTurnUsage(), PersistentSession, sseLine(), userLine()

### Community 10 - "Community 10"
Cohesion: 0.13
Nodes (8): flagProps(), NotebookPage(), flagSkin(), NotebookRowImpl(), flagColor(), textMetrics(), useFontsReady(), lineDataUri()

### Community 11 - "Community 11"
Cohesion: 0.22
Nodes (3): ContextCard(), hashIndex(), WorldSelect()

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (1): SceneErrorBoundary

### Community 14 - "Community 14"
Cohesion: 0.33
Nodes (3): RoomNavHUD(), getAncestors(), getRootRoom()

### Community 15 - "Community 15"
Cohesion: 0.29
Nodes (7): Bilinçli Erteleme Gerekçesi: keyfi dosya/URL okuma yerel uygulamanın amaçlanan özelliği, /api/fetch-url SSRF Açığı, /api/slide-from-path Keyfi Dosya Okuma Açığı, 3D Interactive Media Gallery Experience, First Person Navigation (WASD + Pointer Lock), Markdown Text Panels (çok kolonlu akış), Express Proxy Backend (/api/fetch-url, CORS bypass)

### Community 16 - "Community 16"
Cohesion: 0.47
Nodes (3): clock(), pad2(), SaveStatus()

### Community 17 - "Community 17"
Cohesion: 0.53
Nodes (6): Focus Room Application, Hero Image - Isometric Room Layers, React JavaScript Library, React Logo SVG, Vite Logo SVG, Vite Build Tool

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (3): migrate(), readJson(), bootMigrate()

### Community 21 - "Community 21"
Cohesion: 0.67
Nodes (2): parseWallId(), RoomModal()

### Community 28 - "Community 28"
Cohesion: 0.67
Nodes (3): Smart Aspect Ratio Locking, Dynamic Grid & Raycasting System, In-Game Media Editor Modal (E tuşu)

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (2): Git Push/Merge Onay Kuralı, Graphify Kullanım Kuralları

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (2): Native GIF Rendering via HTML Portals, YouTube Embed Support (iframe in 3D)

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (1): SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (1): Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (1): Eşikli Regresyon-Guard Önerisi (bench --assert)

## Ambiguous Edges - Review These
- `Git Push/Merge Onay Kuralı` → `Graphify Kullanım Kuralları`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to

## Knowledge Gaps
- **25 isolated node(s):** `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`, `Hero Image - Isometric Room Layers`, `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları`, `First Person Navigation (WASD + Pointer Lock)` (+20 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 13`** (9 nodes): `App()`, `loadNotebookOverlay()`, `NotebookFallback()`, `SceneErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (4 nodes): `configForLayer()`, `parseWallId()`, `RoomModal()`, `RoomModal.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `Native GIF Rendering via HTML Portals`, `YouTube Embed Support (iframe in 3D)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (1 nodes): `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `Eşikli Regresyon-Guard Önerisi (bench --assert)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Git Push/Merge Onay Kuralı` and `Graphify Kullanım Kuralları`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `test()` connect `Community 4` to `Community 0`, `Community 1`, `Community 3`, `Community 7`?**
  _High betweenness centrality (0.096) - this node is a cross-community bridge._
- **Why does `PersistentSession` connect `Community 9` to `Community 0`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.084) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `PersistentSession` (e.g. with `Senaryo: roomchat-3turn (3 turluk sohbet)` and `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)`) actually correct?**
  _`PersistentSession` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `test()` (e.g. with `fetchHtmlHead()` and `cliModel()`) actually correct?**
  _`test()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **What connects `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`, `Hero Image - Isometric Room Layers`, `Git Push/Merge Onay Kuralı` to the rest of the system?**
  _25 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._