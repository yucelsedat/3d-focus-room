# Graph Report - focus-room-main  (2026-07-10)

## Corpus Check
- 33 files · ~83,149 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 314 nodes · 444 edges · 20 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.79)
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
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]

## God Nodes (most connected - your core abstractions)
1. `PersistentSession` - 22 edges
2. `LoopRunner` - 11 edges
3. `SessionPool` - 9 edges
4. `FAZ 2 — Cache-Prefix Sabitleme` - 9 edges
5. `MultiAgentRunner` - 8 edges
6. `removeRoomDiskArtifacts()` - 7 edges
7. `FAZ 3 — Transport Hijyeni` - 7 edges
8. `cliModel()` - 6 edges
9. `writeRecall()` - 6 edges
10. `verifyGoal()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `PersistentSession` --references--> `Senaryo: roomchat-3turn (3 turluk sohbet)`  [INFERRED]
  server.js → bench/scenarios.md
- `LoopRunner` --references--> `Senaryo: roomsession-crud (LoopFlow)`  [INFERRED]
  server.js → bench/scenarios.md
- `PersistentSession` --references--> `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)`  [INFERRED]
  server.js → bench/FAZ3.md
- `Genel İnceleme & Düzeltme Planı (genel-fix)` --semantically_similar_to--> `YÖNTEM — Deneme-yanılma Yerine Kanıtla İlerleme`  [INFERRED] [semantically similar]
  plan.md → bench/METHOD.md
- `bootMigrate()` --calls--> `migrate()`  [INFERRED]
  server.js → prisma/migrate.js

## Hyperedges (group relationships)
- **Token/Parite Faz Pipeline (baseline → faz2 → faz3 → parite kapanışı)** — baseline_faz1_baseline, faz2_cache_prefix_sabitleme, faz3_transport_hijyeni, parite_yetenek_tablosu, method_kanitla_ilerleme [EXTRACTED 1.00]
- **A/B Bench Senaryo Takımı (deterministik önce/sonra ölçüm)** — scenarios_direct_cafe, scenarios_roomsession_crud, scenarios_roomchat_3turn, bench_scenarios, baseline_processedtotal [EXTRACTED 1.00]
- **Genel-Fix Güvenlik Bulguları (server.js girdi doğrulama açıkları)** — plan_slide_from_path_vuln, plan_fetch_url_ssrf, plan_multer_sanitization, plan_genel_fix_plani [EXTRACTED 1.00]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.04
Nodes (31): assignTaskIds(), blueprintSkill(), decodeHtmlEntities(), directManifest(), _loadUsageDaily(), parseLinkMeta(), parseManifest(), permissionArgs() (+23 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (6): EditModal(), MarkdownMesh(), relTime(), SessionMesh(), TextureErrorBoundary, useSpeechToText()

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (14): addUsage(), ensureSessionOr429(), fetchHtmlHead(), LoopRunner, makeTurnSink(), MultiAgentRunner, pidRssMb(), readAgentProfile() (+6 more)

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (26): BASELINE — Faz 1 Ground Truth (optimizasyon öncesi), processedTotal Metriği (input+cacheWrite+cacheRead+output), --bare Erteleme Gerekçesi: OAuth kurulumu keychain okuyamaz, FAZ 2 — Cache-Prefix Sabitleme, Cache TTL Env (FORCE_PROMPT_CACHING_5M / ENABLE_PROMPT_CACHING_1H), --exclude-dynamic-system-prompt-sections (6 spawn noktası), Rol Bazlı Tool Kısma (roomchat/review tool setleri), Idle ↔ TTL Hizalama (1H → 30 dk idle, 5M → 15 dk) (+18 more)

### Community 4 - "Community 4"
Cohesion: 0.2
Nodes (4): logTurnUsage(), PersistentSession, sseLine(), userLine()

### Community 5 - "Community 5"
Cohesion: 0.13
Nodes (11): doorWorldPos(), canPassThrough(), canPassThroughOuter(), decodeWallId(), encodeWallId(), getDoorInstanceIds(), getReturnAnchorId(), wallTileCount() (+3 more)

### Community 6 - "Community 6"
Cohesion: 0.24
Nodes (9): buildSpawnEnv(), cliModel(), detectKindWithHaiku(), detectProject(), mcpArgs(), parseVerdict(), runClaudeCapture(), runSpecForKind() (+1 more)

### Community 7 - "Community 7"
Cohesion: 0.29
Nodes (2): ContextCard(), hashIndex()

### Community 8 - "Community 8"
Cohesion: 0.29
Nodes (2): CanvasMesh(), getBounds()

### Community 9 - "Community 9"
Cohesion: 0.29
Nodes (1): SceneErrorBoundary

### Community 10 - "Community 10"
Cohesion: 0.29
Nodes (7): Bilinçli Erteleme Gerekçesi: keyfi dosya/URL okuma yerel uygulamanın amaçlanan özelliği, /api/fetch-url SSRF Açığı, /api/slide-from-path Keyfi Dosya Okuma Açığı, 3D Interactive Media Gallery Experience, First Person Navigation (WASD + Pointer Lock), Markdown Text Panels (çok kolonlu akış), Express Proxy Backend (/api/fetch-url, CORS bypass)

### Community 11 - "Community 11"
Cohesion: 0.53
Nodes (6): Focus Room Application, Hero Image - Isometric Room Layers, React JavaScript Library, React Logo SVG, Vite Logo SVG, Vite Build Tool

### Community 12 - "Community 12"
Cohesion: 0.5
Nodes (2): getAncestors(), RoomNavHUD()

### Community 13 - "Community 13"
Cohesion: 0.67
Nodes (3): migrate(), readJson(), bootMigrate()

### Community 20 - "Community 20"
Cohesion: 0.67
Nodes (3): Smart Aspect Ratio Locking, Dynamic Grid & Raycasting System, In-Game Media Editor Modal (E tuşu)

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (2): Git Push/Merge Onay Kuralı, Graphify Kullanım Kuralları

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (2): Native GIF Rendering via HTML Portals, YouTube Embed Support (iframe in 3D)

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (1): SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (1): Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (1): Eşikli Regresyon-Guard Önerisi (bench --assert)

## Ambiguous Edges - Review These
- `Git Push/Merge Onay Kuralı` → `Graphify Kullanım Kuralları`  [AMBIGUOUS]
  CLAUDE.md · relation: conceptually_related_to

## Knowledge Gaps
- **25 isolated node(s):** `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`, `Hero Image - Isometric Room Layers`, `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları`, `First Person Navigation (WASD + Pointer Lock)` (+20 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Community 7`** (8 nodes): `WorldSelect.jsx`, `CardMenu()`, `ContextCard()`, `ContextModal()`, `DeleteConfirmModal()`, `hashIndex()`, `MenuItem()`, `WorldSelect()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (8 nodes): `CanvasMesh()`, `getBounds()`, `getImageNaturalSize()`, `ImageItem()`, `LinkCard()`, `parseMd()`, `stopEvt()`, `CanvasMesh.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (7 nodes): `App()`, `SceneErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (5 nodes): `getAncestors()`, `HistoryLink()`, `NavLink()`, `RoomNavHUD()`, `RoomNavHUD.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `Git Push/Merge Onay Kuralı`, `Graphify Kullanım Kuralları`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `Native GIF Rendering via HTML Portals`, `YouTube Embed Support (iframe in 3D)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (1 nodes): `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (1 nodes): `Multer Dosya Adı Sanitizasyonu (path traversal düzeltmesi)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (1 nodes): `Eşikli Regresyon-Guard Önerisi (bench --assert)`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Git Push/Merge Onay Kuralı` and `Graphify Kullanım Kuralları`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `PersistentSession` connect `Community 4` to `Community 0`, `Community 3`, `Community 6`?**
  _High betweenness centrality (0.108) - this node is a cross-community bridge._
- **Why does `serializeSpecialDoor()` connect `Community 5` to `Community 0`?**
  _High betweenness centrality (0.064) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `PersistentSession` (e.g. with `Senaryo: roomchat-3turn (3 turluk sohbet)` and `Kill → Resume Canlı Testi (PAPATYA-42, ilk-tur cacheWrite 554)`) actually correct?**
  _`PersistentSession` has 2 INFERRED edges - model-reasoned connections that need verification._
- **What connects `SCENARIOS sabiti (scripts/bench.mjs A/B bench düzeneği)`, `Hero Image - Isometric Room Layers`, `Git Push/Merge Onay Kuralı` to the rest of the system?**
  _25 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.04 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._