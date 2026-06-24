# Graph Report - focus-room-main  (2026-06-24)

## Corpus Check
- 29 files · ~467,922 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 171 nodes · 196 edges · 11 communities detected
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `PersistentSession` - 14 edges
2. `SessionPool` - 6 edges
3. `SceneErrorBoundary` - 5 edges
4. `encodeWallId()` - 5 edges
5. `decodeWallId()` - 5 edges
6. `TextureErrorBoundary` - 5 edges
7. `roomBlueprintDir()` - 4 edges
8. `getDoorInstanceIds()` - 4 edges
9. `permissionArgs()` - 3 edges
10. `sseLine()` - 3 edges

## Surprising Connections (you probably didn't know these)
- `bootMigrate()` --calls--> `migrate()`  [INFERRED]
  server.js → prisma/migrate.js
- `serializeSpecialDoor()` --calls--> `getDoorInstanceIds()`  [INFERRED]
  server.js → src/utils/roomConfig.js
- `encodeWallId()` --calls--> `canPassThrough()`  [INFERRED]
  src/utils/roomConfig.js → src/components/Player.jsx
- `encodeWallId()` --calls--> `canPassThroughOuter()`  [INFERRED]
  src/utils/roomConfig.js → src/components/Player.jsx
- `decodeWallId()` --calls--> `applyInstanceTransform()`  [INFERRED]
  src/utils/roomConfig.js → src/components/Walls.jsx

## Hyperedges (group relationships)
- **Room Self-Referential Tree (parent/children)** — schema_room [EXTRACTED 1.00]
- **Room Categorization System** — schema_room, schema_category, schema_roomcategory [EXTRACTED 1.00]
- **Room Navigation via Doors and SpecialDoors** — schema_room, schema_door, schema_specialdoor [INFERRED 0.85]
- **Room Content and Media Placement** — schema_room, schema_media, schema_floor [INFERRED 0.80]

## Communities

### Community 0 - "Community 0"
Cohesion: 0.08
Nodes (17): blueprintSkill(), buildSpawnEnv(), cliModel(), mcpArgs(), permissionArgs(), permSettingsJson(), readBlueprintSpec(), roomBlueprintDir() (+9 more)

### Community 1 - "Community 1"
Cohesion: 0.08
Nodes (1): TextureErrorBoundary

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (11): doorWorldPos(), canPassThrough(), canPassThroughOuter(), decodeWallId(), encodeWallId(), getDoorInstanceIds(), getReturnAnchorId(), wallTileCount() (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.26
Nodes (3): PersistentSession, sseLine(), userLine()

### Community 4 - "Community 4"
Cohesion: 0.29
Nodes (2): ContextCard(), hashIndex()

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (1): SceneErrorBoundary

### Community 6 - "Community 6"
Cohesion: 0.6
Nodes (1): SessionPool

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (3): EditModal(), MarkdownMesh(), useSpeechToText()

### Community 8 - "Community 8"
Cohesion: 0.5
Nodes (2): CanvasMesh(), getBounds()

### Community 9 - "Community 9"
Cohesion: 0.5
Nodes (2): getAncestors(), RoomNavHUD()

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (3): migrate(), readJson(), bootMigrate()

## Knowledge Gaps
- **Thin community `Community 1`** (25 nodes): `BluprintMesh()`, `EmbedMesh()`, `getCaretOffset()`, `GifMesh()`, `ImageMesh()`, `insertAtCursor()`, `LoadingMesh()`, `measureEditCols()`, `MediaOverlay()`, `PermissionPrompt()`, `rangeFromPoint()`, `RoomChatMesh()`, `RoomSessionMesh()`, `SessionMesh()`, `SessionMessageBubble()`, `SkillChatMesh()`, `SlideMesh()`, `TextureErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `VideoMesh()`, `YoutubeMesh()`, `MediaOverlay.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 4`** (8 nodes): `WorldSelect.jsx`, `CardMenu()`, `ContextCard()`, `ContextModal()`, `DeleteConfirmModal()`, `hashIndex()`, `MenuItem()`, `WorldSelect()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 5`** (7 nodes): `App()`, `SceneErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 6`** (6 nodes): `SessionPool`, `.constructor()`, `.ensure()`, `.evict()`, `._evictIfFull()`, `.get()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (5 nodes): `CanvasMesh()`, `getBounds()`, `getImageNaturalSize()`, `parseMd()`, `CanvasMesh.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (5 nodes): `getAncestors()`, `HistoryLink()`, `NavLink()`, `RoomNavHUD()`, `RoomNavHUD.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `serializeSpecialDoor()` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.081) - this node is a cross-community bridge._
- **Why does `PersistentSession` connect `Community 3` to `Community 0`?**
  _High betweenness centrality (0.049) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `encodeWallId()` (e.g. with `canPassThrough()` and `canPassThroughOuter()`) actually correct?**
  _`encodeWallId()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `decodeWallId()` (e.g. with `applyInstanceTransform()` and `doorWorldPos()`) actually correct?**
  _`decodeWallId()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._