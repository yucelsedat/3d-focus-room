# Graph Report - focus-room-main  (2026-06-24)

## Corpus Check
- 30 files · ~467,735 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 155 nodes · 156 edges · 10 communities detected
- Extraction: 94% EXTRACTED · 6% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]

## God Nodes (most connected - your core abstractions)
1. `SceneErrorBoundary` - 5 edges
2. `encodeWallId()` - 5 edges
3. `decodeWallId()` - 5 edges
4. `TextureErrorBoundary` - 5 edges
5. `roomBlueprintDir()` - 4 edges
6. `getDoorInstanceIds()` - 4 edges
7. `markdownToHtmlSlides()` - 4 edges
8. `roomGraphDir()` - 3 edges
9. `blueprintSkill()` - 3 edges
10. `roomBlueprintStatus()` - 3 edges

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
Nodes (12): blueprintSkill(), permissionArgs(), permSettingsJson(), readBlueprintSpec(), roomBlueprintDir(), roomBlueprintJsonlDir(), roomBlueprintStatus(), roomGraphDir() (+4 more)

### Community 1 - "Community 1"
Cohesion: 0.13
Nodes (11): doorWorldPos(), canPassThrough(), canPassThroughOuter(), decodeWallId(), encodeWallId(), getDoorInstanceIds(), getReturnAnchorId(), wallTileCount() (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.29
Nodes (2): ContextCard(), hashIndex()

### Community 4 - "Community 4"
Cohesion: 0.39
Nodes (6): buildSlideHtml(), escapeHtml(), getThemeCss(), markdownToHtml(), markdownToHtmlSlides(), parseMarkdownToSlides()

### Community 5 - "Community 5"
Cohesion: 0.29
Nodes (1): SceneErrorBoundary

### Community 6 - "Community 6"
Cohesion: 0.29
Nodes (4): EditModal(), MarkdownMesh(), extractFinishedHtml(), useSpeechToText()

### Community 7 - "Community 7"
Cohesion: 0.5
Nodes (2): CanvasMesh(), getBounds()

### Community 8 - "Community 8"
Cohesion: 0.5
Nodes (2): getAncestors(), RoomNavHUD()

### Community 9 - "Community 9"
Cohesion: 0.4
Nodes (1): TextureErrorBoundary

### Community 10 - "Community 10"
Cohesion: 0.67
Nodes (3): migrate(), readJson(), bootMigrate()

## Knowledge Gaps
- **Thin community `Community 3`** (8 nodes): `WorldSelect.jsx`, `CardMenu()`, `ContextCard()`, `ContextModal()`, `DeleteConfirmModal()`, `hashIndex()`, `MenuItem()`, `WorldSelect()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 5`** (7 nodes): `App()`, `SceneErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`, `App.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 7`** (5 nodes): `CanvasMesh()`, `getBounds()`, `getImageNaturalSize()`, `parseMd()`, `CanvasMesh.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 8`** (5 nodes): `getAncestors()`, `HistoryLink()`, `NavLink()`, `RoomNavHUD()`, `RoomNavHUD.jsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 9`** (5 nodes): `TextureErrorBoundary`, `.componentDidCatch()`, `.constructor()`, `.getDerivedStateFromError()`, `.render()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `serializeSpecialDoor()` connect `Community 1` to `Community 0`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Are the 2 inferred relationships involving `encodeWallId()` (e.g. with `canPassThrough()` and `canPassThroughOuter()`) actually correct?**
  _`encodeWallId()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Are the 2 inferred relationships involving `decodeWallId()` (e.g. with `applyInstanceTransform()` and `doorWorldPos()`) actually correct?**
  _`decodeWallId()` has 2 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.08 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.1 - nodes in this community are weakly interconnected._