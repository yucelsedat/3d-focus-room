# Graph Report - focus-room-main  (2026-07-04)

## Corpus Check
- 119 files · ~12,296,516 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 411 nodes · 446 edges · 23 communities detected
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 15 edges (avg confidence: 0.8)
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
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 33|Community 33]]

## God Nodes (most connected - your core abstractions)
1. `PersistentSession` - 15 edges
2. `LoopRunner` - 10 edges
3. `SessionPool` - 9 edges
4. `MultiAgentRunner` - 8 edges
5. `removeRoomDiskArtifacts()` - 6 edges
6. `writeRecall()` - 6 edges
7. `verifyGoal()` - 6 edges
8. `stopRoomBackgroundWork()` - 5 edges
9. `roomGraphDir()` - 5 edges
10. `readRecall()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `bootMigrate()` --calls--> `migrate()`  [INFERRED]
  server.js → prisma/migrate.js
- `serializeSpecialDoor()` --calls--> `getDoorInstanceIds()`  [INFERRED]
  server.js → src/utils/roomConfig.js
- `App()` --calls--> `useLockSync()`  [EXTRACTED]
  src/App.jsx → room-projects/room-1782917633465/src/App.jsx
- `encodeWallId()` --calls--> `canPassThrough()`  [INFERRED]
  src/utils/roomConfig.js → src/components/Player.jsx
- `encodeWallId()` --calls--> `canPassThroughOuter()`  [INFERRED]
  src/utils/roomConfig.js → src/components/Player.jsx

## Hyperedges (group relationships)
- **Room Self-Referential Tree (parent/children)** — schema_room [EXTRACTED 1.00]
- **Room Categorization System** — schema_room, schema_category, schema_roomcategory [EXTRACTED 1.00]
- **Room Navigation via Doors and SpecialDoors** — schema_room, schema_door, schema_specialdoor [INFERRED 0.85]
- **Room Content and Media Placement** — schema_room, schema_media, schema_floor [INFERRED 0.80]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (26): assignTaskIds(), blueprintSkill(), directManifest(), _loadUsageDaily(), parseManifest(), permissionArgs(), permSettingsJson(), readBlueprintSpec() (+18 more)

### Community 1 - "Community 1"
Cohesion: 0.06
Nodes (6): EditModal(), MarkdownMesh(), relTime(), SessionMesh(), TextureErrorBoundary, useSpeechToText()

### Community 2 - "Community 2"
Cohesion: 0.11
Nodes (13): QuoteForm(), ensureSessionOr429(), LoopRunner, makeTurnSink(), MultiAgentRunner, pidRssMb(), readAgentProfile(), readRecall() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.12
Nodes (13): doorWorldPos(), canPassThrough(), canPassThroughOuter(), isTyping(), Player(), decodeWallId(), encodeWallId(), getDoorInstanceIds() (+5 more)

### Community 4 - "Community 4"
Cohesion: 0.26
Nodes (3): PersistentSession, sseLine(), userLine()

### Community 5 - "Community 5"
Cohesion: 0.23
Nodes (6): Cursor(), HeroCanvas(), useMediaQuery(), usePointerFine(), useReducedMotion(), useWebglReady()

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (7): addUsage(), buildSpawnEnv(), cliModel(), mcpArgs(), parseVerdict(), runClaudeCapture(), verifyGoal()

### Community 7 - "Community 7"
Cohesion: 0.25
Nodes (3): App(), SceneErrorBoundary, useLockSync()

### Community 8 - "Community 8"
Cohesion: 0.29
Nodes (2): ContextCard(), hashIndex()

### Community 9 - "Community 9"
Cohesion: 0.33
Nodes (1): onScroll()

### Community 12 - "Community 12"
Cohesion: 0.4
Nodes (2): generateMetadata(), getProject()

### Community 15 - "Community 15"
Cohesion: 0.5
Nodes (2): CanvasMesh(), getBounds()

### Community 16 - "Community 16"
Cohesion: 0.5
Nodes (2): getAncestors(), RoomNavHUD()

### Community 17 - "Community 17"
Cohesion: 0.67
Nodes (3): migrate(), readJson(), bootMigrate()

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (2): clampPosition(), inDoorwaySpan()

### Community 24 - "Community 24"
Cohesion: 0.67
Nodes (1): FrameLimiter()

### Community 25 - "Community 25"
Cohesion: 0.67
Nodes (1): Crosshair()

### Community 26 - "Community 26"
Cohesion: 0.67
Nodes (1): sitemap()

### Community 27 - "Community 27"
Cohesion: 0.67
Nodes (1): RootLayout()

### Community 28 - "Community 28"
Cohesion: 0.67
Nodes (1): NotFound()

### Community 29 - "Community 29"
Cohesion: 0.67
Nodes (1): robots()

### Community 31 - "Community 31"
Cohesion: 0.67
Nodes (1): Reveal()

### Community 33 - "Community 33"
Cohesion: 0.67
Nodes (1): Footer()

## Knowledge Gaps
- **Thin community `Community 8`** (8 nodes): `WorldSelect.jsx`, `CardMenu()`, `ContextCard()`, `ContextModal()`, `DeleteConfirmModal()`, `hashIndex()`, `MenuItem()`, `WorldSelect()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (6 nodes): `closeLightbox()`, `ease()`, `onScroll()`, `openLightbox()`, `main.js`, `main.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (5 nodes): `generateMetadata()`, `generateStaticParams()`, `getProject()`, `page.tsx`, `projects.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 15`** (5 nodes): `CanvasMesh()`, `getBounds()`, `getImageNaturalSize()`, `parseMd()`, `CanvasMesh.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 16`** (5 nodes): `getAncestors()`, `HistoryLink()`, `NavLink()`, `RoomNavHUD()`, `RoomNavHUD.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 18`** (4 nodes): `clampFlyY()`, `clampPosition()`, `inDoorwaySpan()`, `collision.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (3 nodes): `FrameLimiter()`, `FrameLimiter.jsx`, `FrameLimiter.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (3 nodes): `Crosshair()`, `Crosshair.jsx`, `Crosshair.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (3 nodes): `sitemap.ts`, `sitemap.ts`, `sitemap()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (3 nodes): `RootLayout()`, `layout.tsx`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (3 nodes): `NotFound()`, `not-found.tsx`, `not-found.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (3 nodes): `robots()`, `robots.ts`, `robots.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (3 nodes): `Reveal()`, `Reveal.tsx`, `Reveal.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (3 nodes): `Footer()`, `Footer.tsx`, `Footer.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `serializeSpecialDoor()` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Why does `PersistentSession` connect `Community 4` to `Community 0`, `Community 6`?**
  _High betweenness centrality (0.015) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.11 - nodes in this community are weakly interconnected._
- **Should `Community 3` be split into smaller, more focused modules?**
  _Cohesion score 0.12 - nodes in this community are weakly interconnected._