# Graph Report - .  (2026-07-06)

## Corpus Check
- 46 files · ~77,412 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 340 nodes · 627 edges · 32 communities detected
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 23 edges (avg confidence: 0.79)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Server API & Routing|Server API & Routing]]
- [[_COMMUNITY_TokenCache Optimizasyon Fazları|Token/Cache Optimizasyon Fazları]]
- [[_COMMUNITY_Oturum & LoopRunner Yaşam Döngüsü|Oturum & LoopRunner Yaşam Döngüsü]]
- [[_COMMUNITY_3D Medya Mesh Bileşenleri|3D Medya Mesh Bileşenleri]]
- [[_COMMUNITY_Oda Geometrisi & Kapılar|Oda Geometrisi & Kapılar]]
- [[_COMMUNITY_Bench Çalıştırma Betiği|Bench Çalıştırma Betiği]]
- [[_COMMUNITY_Dünya Seçim Ekranı|Dünya Seçim Ekranı]]
- [[_COMMUNITY_Uygulama Kökü & Hata Sınırı|Uygulama Kökü & Hata Sınırı]]
- [[_COMMUNITY_README Konseptleri & Güvenlik Planı|README Konseptleri & Güvenlik Planı]]
- [[_COMMUNITY_Düzenleme Modalı & Konuşma Tanıma|Düzenleme Modalı & Konuşma Tanıma]]
- [[_COMMUNITY_Canvas Mesh Render|Canvas Mesh Render]]
- [[_COMMUNITY_Oda Navigasyon HUD|Oda Navigasyon HUD]]
- [[_COMMUNITY_Marka & Logo Varlıkları|Marka & Logo Varlıkları]]
- [[_COMMUNITY_Veri Migrasyonu|Veri Migrasyonu]]
- [[_COMMUNITY_Zemin Grid Sistemi|Zemin Grid Sistemi]]
- [[_COMMUNITY_Ana Menü|Ana Menü]]
- [[_COMMUNITY_Klavye Kontrolü|Klavye Kontrolü]]
- [[_COMMUNITY_Dış Duvarlar|Dış Duvarlar]]
- [[_COMMUNITY_Başlık Mesh|Başlık Mesh]]
- [[_COMMUNITY_Multi-Agent Tile & SSE|Multi-Agent Tile & SSE]]
- [[_COMMUNITY_İzin Hook'u|İzin Hook'u]]
- [[_COMMUNITY_Oda Yükleme|Oda Yükleme]]
- [[_COMMUNITY_Loop Göstergesi|Loop Göstergesi]]
- [[_COMMUNITY_Kare Sınırlayıcı (FPS)|Kare Sınırlayıcı (FPS)]]
- [[_COMMUNITY_Canvas Editörü|Canvas Editörü]]
- [[_COMMUNITY_Oda Modalı|Oda Modalı]]
- [[_COMMUNITY_Medya Yöneticisi|Medya Yöneticisi]]
- [[_COMMUNITY_Nişangâh|Nişangâh]]
- [[_COMMUNITY_Medya Düzenleme Konseptleri|Medya Düzenleme Konseptleri]]
- [[_COMMUNITY_Proje Kuralları (CLAUDE.md)|Proje Kuralları (CLAUDE.md)]]
- [[_COMMUNITY_Gömülü Medya Render|Gömülü Medya Render]]
- [[_COMMUNITY_Multer Sanitizasyonu|Multer Sanitizasyonu]]

## God Nodes (most connected - your core abstractions)
1. `PersistentSession` - 20 edges
2. `LoopRunner` - 13 edges
3. `SessionPool` - 10 edges
4. `MultiAgentRunner` - 9 edges
5. `api()` - 9 edges
6. `FAZ 2 — Cache-Prefix Sabitleme` - 9 edges
7. `PARİTE — VS Code / Claude Code Yetenek Kontrol Listesi (Faz 6 kapanış)` - 9 edges
8. `main()` - 8 edges
9. `removeRoomDiskArtifacts()` - 7 edges
10. `writeRecall()` - 7 edges

## Surprising Connections (you probably didn't know these)
- `Senaryo: roomsession-crud (LoopFlow)` --references--> `LoopRunner`  [INFERRED]
  bench/scenarios.md → /home/sedat/projects/games/focus-room-main/server.js
- `Senaryo: roomchat-3turn (3 turluk sohbet)` --references--> `PersistentSession`  [INFERRED]
  bench/scenarios.md → /home/sedat/projects/games/focus-room-main/server.js
- `PARİTE — VS Code / Claude Code Yetenek Kontrol Listesi (Faz 6 kapanış)` --references--> `recordGlobalUsage()`  [EXTRACTED]
  bench/PARITE.md → /home/sedat/projects/games/focus-room-main/server.js
- `--exclude-dynamic-system-prompt-sections (6 spawn noktası)` --references--> `PersistentSession`  [EXTRACTED]
  bench/FAZ2.md → /home/sedat/projects/games/focus-room-main/server.js
- `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)` --references--> `PersistentSession`  [INFERRED]
  bench/FAZ3.md → /home/sedat/projects/games/focus-room-main/server.js

## Hyperedges (group relationships)
- **Token/Parite Faz Pipeline (baseline → faz2 → faz3 → parite kapanışı)** — baseline_faz1_baseline, faz2_cache_prefix_sabitleme, faz3_transport_hijyeni, parite_yetenek_tablosu, method_kanitla_ilerleme [EXTRACTED 1.00]
- **A/B Bench Senaryo Takımı (deterministik önce/sonra ölçüm)** — scenarios_direct_cafe, scenarios_roomsession_crud, scenarios_roomchat_3turn, bench_scenarios, baseline_processedtotal [EXTRACTED 1.00]
- **Genel-Fix Güvenlik Bulguları (server.js girdi doğrulama açıkları)** — plan_slide_from_path_vuln, plan_fetch_url_ssrf, plan_multer_sanitization, plan_genel_fix_plani [EXTRACTED 1.00]

## Communities

### Community 0 - "Server API & Routing"
Cohesion: 0.07
Nodes (61): Faz 5 Fork B — Routing Varsayılanı (direct vs team), Senaryo: direct-cafe (multiagent direct routing), activeLoopCount(), assignTaskIds(), blueprintSkill(), blueprintSkillsMeta(), buildSpawnEnv(), classifyIdeaScale() (+53 more)

### Community 1 - "Token/Cache Optimizasyon Fazları"
Cohesion: 0.08
Nodes (31): BASELINE — Faz 1 Ground Truth (optimizasyon öncesi), processedTotal Metriği (input+cacheWrite+cacheRead+output), SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği), --bare Erteleme Gerekçesi: OAuth kurulumu keychain okuyamaz, FAZ 2 — Cache-Prefix Sabitleme, Cache TTL Env (FORCE_PROMPT_CACHING_5M / ENABLE_PROMPT_CACHING_1H), --exclude-dynamic-system-prompt-sections (6 spawn noktası), Rol Bazlı Tool Kısma (roomchat/review tool setleri) (+23 more)

### Community 2 - "Oturum & LoopRunner Yaşam Döngüsü"
Cohesion: 0.11
Nodes (13): addUsage(), ensureSessionOr429(), LoopRunner, makeTurnSink(), MultiAgentRunner, pidRssMb(), readAgentProfile(), readRecall() (+5 more)

### Community 3 - "3D Medya Mesh Bileşenleri"
Cohesion: 0.11
Nodes (27): BluprintMesh(), DefterBlock(), DefterMesh(), EmbedMesh(), getCaretOffset(), GifMesh(), ImageMesh(), insertAtCursor() (+19 more)

### Community 4 - "Oda Geometrisi & Kapılar"
Cohesion: 0.14
Nodes (16): BlueDoors(), doorWorldPos(), canPassThrough(), canPassThroughOuter(), isTyping(), Player(), decodeWallId(), defaultFloorTexture() (+8 more)

### Community 5 - "Bench Çalıştırma Betiği"
Cohesion: 0.38
Nodes (15): api(), arg(), cleanBenchProjectDir(), driveSSE(), ensureBenchRoom(), main(), pollLoopUntilDone(), runDirectCafe() (+7 more)

### Community 6 - "Dünya Seçim Ekranı"
Cohesion: 0.42
Nodes (7): CardMenu(), ContextCard(), ContextModal(), DeleteConfirmModal(), hashIndex(), MenuItem(), WorldSelect()

### Community 7 - "Uygulama Kökü & Hata Sınırı"
Cohesion: 0.29
Nodes (2): App(), SceneErrorBoundary

### Community 8 - "README Konseptleri & Güvenlik Planı"
Cohesion: 0.25
Nodes (8): HTML Entry Point (#root + src/main.jsx), Bilinçli Erteleme Gerekçesi: keyfi dosya/URL okuma yerel uygulamanın amaçlanan özelliği, /api/fetch-url SSRF Açığı, /api/slide-from-path Keyfi Dosya Okuma Açığı, 3D Interactive Media Gallery Experience, First Person Navigation (WASD + Pointer Lock), Markdown Text Panels (çok kolonlu akış), Express Proxy Backend (/api/fetch-url, CORS bypass)

### Community 9 - "Düzenleme Modalı & Konuşma Tanıma"
Cohesion: 0.33
Nodes (3): EditModal(), MicButton(), useSpeechToText()

### Community 10 - "Canvas Mesh Render"
Cohesion: 0.6
Nodes (4): CanvasMesh(), getBounds(), getImageNaturalSize(), parseMd()

### Community 11 - "Oda Navigasyon HUD"
Cohesion: 0.6
Nodes (4): getAncestors(), HistoryLink(), NavLink(), RoomNavHUD()

### Community 12 - "Marka & Logo Varlıkları"
Cohesion: 0.53
Nodes (6): Focus Room Application, Hero Image - Isometric Room Layers, React JavaScript Library, React Logo SVG, Vite Logo SVG, Vite Build Tool

### Community 13 - "Veri Migrasyonu"
Cohesion: 0.6
Nodes (3): migrate(), readJson(), bootMigrate()

### Community 14 - "Zemin Grid Sistemi"
Cohesion: 0.6
Nodes (3): Grid(), GridInner(), OutdoorFloor()

### Community 15 - "Ana Menü"
Cohesion: 0.6
Nodes (3): MainMenu(), ParentPicker(), PillInput()

### Community 16 - "Klavye Kontrolü"
Cohesion: 0.67
Nodes (2): isTyping(), KeyHandler()

### Community 17 - "Dış Duvarlar"
Cohesion: 0.67
Nodes (2): applyOuterInstanceTransform(), OuterWalls()

### Community 18 - "Başlık Mesh"
Cohesion: 0.67
Nodes (2): calcFontSize(), HeaderMesh()

### Community 19 - "Multi-Agent Tile & SSE"
Cohesion: 0.67
Nodes (2): MultiAgentTile(), readSSE()

### Community 20 - "İzin Hook'u"
Cohesion: 0.67
Nodes (1): emit()

### Community 21 - "Oda Yükleme"
Cohesion: 0.67
Nodes (1): loadRoom()

### Community 22 - "Loop Göstergesi"
Cohesion: 0.67
Nodes (1): LoopIndicator()

### Community 23 - "Kare Sınırlayıcı (FPS)"
Cohesion: 0.67
Nodes (1): FrameLimiter()

### Community 24 - "Canvas Editörü"
Cohesion: 0.67
Nodes (1): CanvasEditor()

### Community 25 - "Oda Modalı"
Cohesion: 0.67
Nodes (1): RoomModal()

### Community 26 - "Medya Yöneticisi"
Cohesion: 0.67
Nodes (1): MediaManager()

### Community 27 - "Nişangâh"
Cohesion: 0.67
Nodes (1): Crosshair()

### Community 28 - "Medya Düzenleme Konseptleri"
Cohesion: 0.67
Nodes (3): Smart Aspect Ratio Locking, Dynamic Grid & Raycasting System, In-Game Media Editor Modal (E tuşu)

### Community 29 - "Proje Kuralları (CLAUDE.md)"
Cohesion: 1.0
Nodes (2): Git Push/Merge Onay Kuralı, Graphify Kullanım Kuralları

### Community 30 - "Gömülü Medya Render"
Cohesion: 1.0
Nodes (2): Native GIF Rendering via HTML Portals, YouTube Embed Support (iframe in 3D)

### Community 39 - "Multer Sanitizasyonu"
Cohesion: 1.0
Nodes (1): Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)

## Ambiguous Edges - Review These
- `Git Push/Merge Onay Kuralı` → `Graphify Kullanım Kuralları`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to

## Knowledge Gaps
- **23 isolated node(s):** `Hero Image - Isometric Room Layers`, `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları`, `First Person Navigation (WASD + Pointer Lock)`, `Dynamic Grid & Raycasting System` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Uygulama Kökü & Hata Sınırı`** (8 nodes): `App()`, `SceneErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `App.jsx`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Klavye Kontrolü`** (4 nodes): `KeyHandler.jsx`, `isTyping()`, `KeyHandler()`, `KeyHandler.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Dış Duvarlar`** (4 nodes): `OuterWalls.jsx`, `applyOuterInstanceTransform()`, `OuterWalls()`, `OuterWalls.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Başlık Mesh`** (4 nodes): `calcFontSize()`, `HeaderMesh()`, `HeaderMesh.jsx`, `HeaderMesh.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Multi-Agent Tile & SSE`** (4 nodes): `MultiAgentTile.jsx`, `MultiAgentTile()`, `readSSE()`, `MultiAgentTile.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `İzin Hook'u`** (3 nodes): `permission-hook.js`, `emit()`, `permission-hook.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Oda Yükleme`** (3 nodes): `loadRoom.js`, `loadRoom()`, `loadRoom.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Loop Göstergesi`** (3 nodes): `LoopIndicator.jsx`, `LoopIndicator()`, `LoopIndicator.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Kare Sınırlayıcı (FPS)`** (3 nodes): `FrameLimiter()`, `FrameLimiter.jsx`, `FrameLimiter.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Canvas Editörü`** (3 nodes): `CanvasEditor()`, `CanvasEditor.jsx`, `CanvasEditor.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Oda Modalı`** (3 nodes): `RoomModal.jsx`, `RoomModal()`, `RoomModal.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Medya Yöneticisi`** (3 nodes): `MediaManager.jsx`, `MediaManager()`, `MediaManager.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Nişangâh`** (3 nodes): `Crosshair()`, `Crosshair.jsx`, `Crosshair.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Proje Kuralları (CLAUDE.md)`** (2 nodes): `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Gömülü Medya Render`** (2 nodes): `Native GIF Rendering via HTML Portals`, `YouTube Embed Support (iframe in 3D)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Multer Sanitizasyonu`** (1 nodes): `Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Git Push/Merge Onay Kuralı` and `Graphify Kullanım Kuralları`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `serializeSpecialDoor()` connect `Oda Geometrisi & Kapılar` to `Server API & Routing`?**
  _High betweenness centrality (0.060) - this node is a cross-community bridge._
- **Why does `PersistentSession` connect `Token/Cache Optimizasyon Fazları` to `Server API & Routing`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `PersistentSession` (e.g. with `Senaryo: roomchat-3turn (3 turluk sohbet)` and `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)`) actually correct?**
  _`PersistentSession` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Hero Image - Isometric Room Layers`, `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Server API & Routing` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Token/Cache Optimizasyon Fazları` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._