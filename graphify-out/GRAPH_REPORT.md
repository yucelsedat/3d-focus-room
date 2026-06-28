# Graph Report - focus-room-main  (2026-06-28)

## Corpus Check
- 30 files · ~479,425 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 203 nodes · 263 edges · 12 communities detected
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 9 edges (avg confidence: 0.8)
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

## God Nodes (most connected - your core abstractions)
1. `PersistentSession` - 15 edges
2. `LoopRunner` - 9 edges
3. `SessionPool` - 6 edges
4. `verifyGoal()` - 6 edges
5. `sessionRecallPath()` - 5 edges
6. `SceneErrorBoundary` - 5 edges
7. `encodeWallId()` - 5 edges
8. `decodeWallId()` - 5 edges
9. `TextureErrorBoundary` - 5 edges
10. `sseLine()` - 4 edges

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
Cohesion: 0.06
Nodes (25): blueprintSkill(), buildSpawnEnv(), cliModel(), findSessionJsonl(), mcpArgs(), parseVerdict(), permissionArgs(), permSettingsJson() (+17 more)

### Community 1 - "Community 1"
Cohesion: 0.07
Nodes (3): relTime(), SessionMesh(), TextureErrorBoundary

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (11): doorWorldPos(), canPassThrough(), canPassThroughOuter(), decodeWallId(), encodeWallId(), getDoorInstanceIds(), getReturnAnchorId(), wallTileCount() (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.21
Nodes (4): LoopRunner, makeTurnSink(), readRecall(), SessionPool

### Community 4 - "Community 4"
Cohesion: 0.26
Nodes (3): PersistentSession, sseLine(), userLine()

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (2): ContextCard(), hashIndex()

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (1): SceneErrorBoundary

### Community 7 - "Community 7"
Cohesion: 0.33
Nodes (3): EditModal(), MarkdownMesh(), useSpeechToText()

### Community 8 - "Community 8"
Cohesion: 0.5
Nodes (5): recallDir(), recallPath(), roomProjectDir(), roomProjectJsonlDir(), writeRecall()

### Community 9 - "Community 9"
Cohesion: 0.5
Nodes (2): CanvasMesh(), getBounds()

### Community 10 - "Community 10"
Cohesion: 0.5
Nodes (2): getAncestors(), RoomNavHUD()

### Community 11 - "Community 11"
Cohesion: 0.67
Nodes (3): migrate(), readJson(), bootMigrate()

## Knowledge Gaps
- **Thin community `Community 5`** (8 nodes): `WorldSelect.jsx`, `CardMenu()`, `ContextCard()`, `ContextModal()`, `DeleteConfirmModal()`, `hashIndex()`, `MenuItem()`, `WorldSelect()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 6`** (7 nodes): `App()`, `SceneErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (5 nodes): `CanvasMesh()`, `getBounds()`, `getImageNaturalSize()`, `parseMd()`, `CanvasMesh.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 10`** (5 nodes): `getAncestors()`, `HistoryLink()`, `NavLink()`, `RoomNavHUD()`, `RoomNavHUD.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `serializeSpecialDoor()` connect `Community 2` to `Community 0`?**
  _High betweenness centrality (0.082) - this node is a cross-community bridge._
- **Why does `PersistentSession` connect `Community 4` to `Community 0`?**
  _High betweenness centrality (0.047) - this node is a cross-community bridge._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.07 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._