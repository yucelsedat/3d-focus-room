import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import cors from 'cors';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from '@prisma/client';
import { ROOM_CONFIGS, getDoorInstanceIds, getReturnAnchorId, encodeWallId, decodeWallId, defaultFloorTexture } from './src/utils/roomConfig.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename).replace('/src/server', '');

// ─── Prisma ───────────────────────────────────────────────────────────────────
const DB_PATH = path.join(__dirname, 'prisma/dev.db');
const adapter = new PrismaBetterSqlite3({ url: 'file:' + DB_PATH });
const prisma = new PrismaClient({ adapter });

// Serialize media row → frontend shape (position/rotation arrays, id as number)
function serializeMedia(m) {
  return {
    id: Number(m.id),
    tileId: m.tileId,
    type: m.type,
    url: m.url ?? undefined,
    content: m.content ?? undefined,
    width: m.width,
    height: m.height,
    position: [m.posX, m.posY, m.posZ],
    rotation: [m.rotX, m.rotY, m.rotZ, m.rotOrder],
  };
}

// ─── Express setup ────────────────────────────────────────────────────────────
const app = express();
const port = Number(process.env.PORT) || 5001;

app.use(cors());
app.use(express.json());

// Yüklenen dosyaları (kapak görselleri, medya) statik olarak sun.
// Kart kodu API + coverImage ile bu URL'lere doğrudan istek atıyor;
// bu olmadan /uploads/... 404 döner ve kapak resmi siyah görünür.
app.use('/uploads', express.static(path.join(__dirname, 'public/uploads')));

// Ensure upload dirs exist
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
ensureDir('public/uploads/images');
ensureDir('public/uploads/videos');
ensureDir('public/uploads/slides');

// ─── Active room ──────────────────────────────────────────────────────────────
let activeRoomId   = 'default';
let activeRoomType = 'room';

// ─── AI Session tracking ─────────────────────────────────────────────────────
// Use standalone claude CLI (not CLAUDE_CODE_EXECPATH which is the VS Code extension's
// internal binary and doesn't work when spawned outside the VS Code context)
const CLAUDE_CLI = (() => {
  const candidates = [
    '/home/sedat/.local/bin/claude',
    process.env.CLAUDE_CODE_EXECPATH,
    'claude',
  ]
  for (const c of candidates) {
    if (c && fs.existsSync(c)) return c
  }
  return 'claude'
})()

// ─── MCP profilleri: session tipine göre izole edilmiş MCP kapsamı ────────────
// roomchat     → context7 + exa + tavily  (araştırma odaklı sohbet)
// roomsession  → context7 only            (proje/kod asistanı)
// ai-session   → context7 only            (standalone sohbet tile)
// bluprint     → --strict-mcp-config      (minimal; sadece dosya/proje analizi)
// verify       → --strict-mcp-config      (ucuz doğrulama ajanı, MCP yük istemez)
// API key repoya girmesin diye tüm ayarlar global ~/.claude.json'dan okunur.
const MIN_MCP_PATH      = path.join(os.tmpdir(), 'focus-room-min-mcp.json')
const ROOMCHAT_MCP_PATH = path.join(os.tmpdir(), 'focus-room-roomchat-mcp.json')
const _NO_MCP = ['--strict-mcp-config']
const _MCP_PROFILES = (() => {
  try {
    const globalCfg = path.join(os.homedir(), '.claude.json')
    const cfg = JSON.parse(fs.readFileSync(globalCfg, 'utf8'))
    const servers = cfg.mcpServers || {}
    const ctx7 = servers.context7
    if (!ctx7) {
      console.error('[mcp] context7 bulunamadı, tüm profiller MCP kapalı başlıyor')
      return { roomchat: _NO_MCP, default: _NO_MCP }
    }
    // context7 only → roomsession, ai-session
    fs.writeFileSync(MIN_MCP_PATH, JSON.stringify({ mcpServers: { context7: ctx7 } }))
    const defaultArgs = ['--strict-mcp-config', '--mcp-config', MIN_MCP_PATH]
    // context7 + exa + tavily → roomchat
    const roomchatServers = { context7: ctx7 }
    if (servers.exa)    roomchatServers.exa    = servers.exa
    if (servers.tavily) roomchatServers.tavily = servers.tavily
    fs.writeFileSync(ROOMCHAT_MCP_PATH, JSON.stringify({ mcpServers: roomchatServers }))
    const roomchatArgs = ['--strict-mcp-config', '--mcp-config', ROOMCHAT_MCP_PATH]
    console.error(`[mcp] profiller: roomchat=[ctx7+exa+tavily], default=[ctx7], bluprint/verify=[kapalı]`)
    return { roomchat: roomchatArgs, default: defaultArgs }
  } catch (err) {
    console.error('[mcp] MCP profilleri hazırlanamadı, tüm MCP kapatılıyor:', err.message)
    return { roomchat: _NO_MCP, default: _NO_MCP }
  }
})()
// type: 'roomchat' | 'roomsession' | 'bluprint' | 'verify' | 'ai-session'
//       | 'architect' | 'orchestrate' (multiagent tek-atış ajanları — MCP yükü istemez)
//       | 'multiagent' (worker'lar — kod yazan rolün MCP tanım/RAM yüküne ihtiyacı yok)
function mcpArgs(type) {
  if (type === 'roomchat')  return _MCP_PROFILES.roomchat
  if (type === 'bluprint')  return _NO_MCP
  if (type === 'verify')    return _NO_MCP
  if (type === 'architect' || type === 'orchestrate') return _NO_MCP
  if (type === 'multiagent') return _NO_MCP
  return _MCP_PROFILES.default   // roomsession, ai-session, bilinmeyen
}

// ─── Boot-time: auto-migrate JSON → SQLite if DB is empty ────────────────────
async function bootMigrate() {
  const count = await prisma.room.count();
  if (count === 0) {
    const ROOMS_META = path.join(__dirname, 'public/data/rooms.json');
    if (fs.existsSync(ROOMS_META)) {
      console.log('[server] DB empty, running JSON→SQLite migration...');
      const { default: migrate } = await import('./prisma/migrate.js');
      await migrate();
    } else {
      // Fresh start: create default room
      await prisma.room.create({
        data: { id: 'default', name: 'Varsayılan Oda' },
      });
      await prisma.floor.create({
        data: { roomId: 'default', texture: 'zemin.jpg' },
      });
      console.log('[server] Created default room in DB');
    }
  }
}

// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let type = 'images';
    if (file.mimetype.startsWith('video/')) {
      type = 'videos';
    }
    cb(null, `public/uploads/${type}/`);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});
const upload = multer({ storage });

const uploadCover = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/images/'),
    filename: (req, file, cb) => cb(null, `cover-${Date.now()}-${file.originalname}`),
  }),
});

const canvasUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'public/uploads/images/'),
    filename: (req, file, cb) => cb(null, `canvas-${Date.now()}-${file.originalname}`),
  }),
});

// roomsession tile'ın dosya/klasör yükleyicisi: dosyalar belleğe alınır, sonra
// odanın proje klasörüne (room-projects/<roomId>/) klasör yapısı korunarak yazılır.
const roomFileUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 }, // dosya başına 200MB
});

app.post('/api/upload-cover', uploadCover.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yüklenmedi' });
  const url = `/uploads/images/${req.file.filename}`;
  res.json({ url });
});

// ─── Special door helpers ─────────────────────────────────────────────────────

const OUTER_GRID_SIZE_SRV = 120;
const OUTER_CONFIG = { gx: OUTER_GRID_SIZE_SRV, gz: OUTER_GRID_SIZE_SRV, wh: 5 };

// ─── Rooms API ────────────────────────────────────────────────────────────────

function serializeRoom(r) {
  return {
    id: r.id,
    name: r.name,
    roomType: r.roomType ?? 'room',
    coverImage: r.coverImage ?? null,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastActiveAt: r.lastActiveAt,
    categories: (r.categories ?? []).map(rc => rc.category),
    parent: r.parent ? { id: r.parent.id, name: r.parent.name } : null,
    children: (r.children ?? []).map(c => ({ id: c.id, name: c.name })),
  };
}

const roomInclude = {
  categories: { include: { category: true } },
  parent: true,
  children: true,
};

app.get('/api/rooms', async (req, res) => {
  // Son aktif olan oda en başta: oda her aktifleştiğinde (activate) lastActiveAt
  // güncellenir, böylece liste bir "son kullanılan" kuyruğu gibi davranır.
  const rooms = await prisma.room.findMany({
    orderBy: { lastActiveAt: 'desc' },
    include: roomInclude,
  });
  res.json(rooms.map(serializeRoom));
});

app.post('/api/rooms', async (req, res) => {
  const { name, categoryNames = [], parentId = null, roomType = 'room' } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'İsim gerekli' });

  const id = `room-${Date.now()}`;
  const type = ROOM_CONFIGS[roomType] ? roomType : 'room';

  const categories = await Promise.all(
    categoryNames.map(n => prisma.category.upsert({ where: { name: n }, update: {}, create: { name: n } }))
  );

  await prisma.$transaction([
    prisma.room.create({ data: { id, name: name.trim(), parentId: parentId || null, roomType: type } }),
    prisma.floor.create({ data: { roomId: id, texture: defaultFloorTexture(type) } }),
    ...categories.map(c => prisma.roomCategory.create({ data: { roomId: id, categoryId: c.id } })),
  ]);

  const room = await prisma.room.findUnique({ where: { id }, include: roomInclude });
  res.json(serializeRoom(room));
});

app.post('/api/rooms/:id/activate', async (req, res) => {
  const { id } = req.params;
  const existing = await prisma.room.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Oda bulunamadı' });

  // lastActiveAt'i güncelle → oda ana sayfada en başa geçer (son kullanılan kuyruğu).
  const room = await prisma.room.update({
    where: { id },
    data: { lastActiveAt: new Date() },
    include: roomInclude,
  });

  activeRoomId   = id;
  activeRoomType = room.roomType ?? 'room';
  console.log(`[server] Active room → ${id} (${room.name}) type=${activeRoomType}`);
  res.json({ ok: true, room: serializeRoom(room) });
});

app.put('/api/rooms/:id/name', async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'İsim gerekli' });

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  const updated = await prisma.room.update({
    where: { id },
    data: { name: name.trim() },
  });
  res.json(updated);
});

async function collectDescendants(rootId) {
  const ids = [rootId];
  const children = await prisma.room.findMany({ where: { parentId: rootId }, select: { id: true } });
  for (const child of children) {
    ids.push(...await collectDescendants(child.id));
  }
  return ids;
}

// Bir oda silinince DB cascade'i + yüklenen medya dosyaları temizleniyor; ama
// odanın izole disk artefaktları (graf, roomsession projesi, blueprint ve bunların
// ~/.claude/projects altındaki JSONL geçmişleri) öksüz kalıyordu. Bu fonksiyon o
// klasörleri de siler. Hepsi best-effort: olmayan/erişilemeyen yol sessizce atlanır.
function removeRoomDiskArtifacts(roomId) {
  const dirs = [
    roomGraphDir(roomId),
    roomProjectDir(roomId),       // .recall checkpoint'leri de bunun altında
    roomBlueprintDir(roomId),
    roomProjectJsonlDir(roomId),  // ~/.claude/projects/<cwd-key>/ roomsession geçmişi
    roomBlueprintJsonlDir(roomId),
  ];
  for (const dir of dirs) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
  }
}

// Disk artefaktlarını silmeden ÖNCE çağrılır. Oda silinirken hâlâ çalışan otonom
// loop'lar ve havuzdaki canlı process'ler, cwd'leri (room-projects/room-blueprints)
// silinince klasörü yeniden yaratıp checkpoint yazarak temizliği boşa çıkarır —
// ayrıca havuzda ölü mediaId kayıtları sızar. Bu yüzden ilgili mediaId'ler için
// loop'u abort edip havuz oturumlarını dispose ederiz (process kill).
function stopRoomBackgroundWork(mediaIds) {
  for (const mid of mediaIds) {
    const key = String(mid);
    const loop = loopPool.get(key);
    if (loop) { try { loop.abort(); } catch {} loopPool.delete(key); }
    for (const prefix of ['roomsession', 'bluprint', 'roomchat', 'ai-session']) {
      sessionPool.evict(`${prefix}:${key}`);
    }
    sessionPool.evictPrefix(`multiagent:${key}:`);   // rol bazlı oturum ailesi
  }
}

app.delete('/api/rooms/:id', async (req, res) => {
  const { id } = req.params;
  const cascade = req.query.cascade === 'true';
  if (id === 'default') return res.status(400).json({ error: 'Varsayılan oda silinemez' });

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  if (cascade) {
    const allIds = await collectDescendants(id);
    const allMediaIds = [];
    for (const roomId of allIds) {
      const mediaItems = await prisma.media.findMany({ where: { roomId } });
      for (const m of mediaItems) {
        allMediaIds.push(m.id);
        if (m.url && m.url.startsWith('/uploads/')) {
          const fp = path.join(__dirname, 'public', m.url);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
      }
    }
    stopRoomBackgroundWork(allMediaIds);
    await prisma.room.deleteMany({ where: { id: { in: allIds } } });
    for (const roomId of allIds) removeRoomDiskArtifacts(roomId);
    if (allIds.includes(activeRoomId)) activeRoomId = 'default';
    return res.json({ ok: true, deletedIds: allIds });
  }

  // Delete uploaded files for this room's media
  const mediaItems = await prisma.media.findMany({ where: { roomId: id } });
  for (const m of mediaItems) {
    if (m.url && m.url.startsWith('/uploads/')) {
      const filePath = path.join(__dirname, 'public', m.url);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }

  stopRoomBackgroundWork(mediaItems.map(m => m.id));
  // onDelete: Cascade removes media/doors/floor automatically
  await prisma.room.delete({ where: { id } });
  removeRoomDiskArtifacts(id);

  if (activeRoomId === id) activeRoomId = 'default';
  res.json({ ok: true, deletedIds: [id] });
});

app.get('/api/rooms/:id/details', async (req, res) => {
  const room = await prisma.room.findUnique({
    where: { id: req.params.id },
    include: roomInclude,
  });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });
  res.json(serializeRoom(room));
});

// ─── helper: collect all ancestor IDs ────────────────────────────────────────
async function getAllAncestors(roomId, visited = new Set()) {
  const room = await prisma.room.findUnique({ where: { id: roomId }, select: { parentId: true } });
  if (room?.parentId && !visited.has(room.parentId)) {
    visited.add(room.parentId);
    await getAllAncestors(room.parentId, visited);
  }
  return visited;
}

app.get('/api/worlds', async (req, res) => {
  const worlds = await prisma.room.findMany({
    where: { parentId: null },
    orderBy: { createdAt: 'asc' },
    include: roomInclude,
  });
  res.json(worlds.map(serializeRoom));
});

app.put('/api/rooms/:id/cover-image', async (req, res) => {
  const { id } = req.params;
  const { coverImage } = req.body;
  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });
  const updated = await prisma.room.update({ where: { id }, data: { coverImage: coverImage || null } });
  res.json({ ok: true, coverImage: updated.coverImage });
});

app.put('/api/rooms/:id/settings', async (req, res) => {
  const { id } = req.params;
  const { name, categoryNames, parentId, coverImage } = req.body;

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  if (parentId) {
    if (parentId === id) return res.status(400).json({ error: "Oda kendisinin parent'ı olamaz" });
    const ancestors = await getAllAncestors(parentId);
    if (ancestors.has(id)) return res.status(400).json({ error: "Dairesel ilişki: bu oda zaten seçilen odanın atası" });
  }

  await prisma.$transaction(async (tx) => {
    const data = {};
    if (name && name.trim()) data.name = name.trim();
    if (parentId !== undefined) data.parentId = parentId || null;
    if (coverImage !== undefined) data.coverImage = coverImage || null;
    if (Object.keys(data).length) await tx.room.update({ where: { id }, data });

    if (Array.isArray(categoryNames)) {
      await tx.roomCategory.deleteMany({ where: { roomId: id } });
      const cats = await Promise.all(
        categoryNames.map(n => tx.category.upsert({ where: { name: n }, update: {}, create: { name: n } }))
      );
      for (const c of cats) await tx.roomCategory.create({ data: { roomId: id, categoryId: c.id } });
    }
  });

  const updated = await prisma.room.findUnique({ where: { id }, include: roomInclude });
  res.json(serializeRoom(updated));
});

// ─── Categories API ───────────────────────────────────────────────────────────

app.get('/api/categories', async (req, res) => {
  const cats = await prisma.category.findMany({ orderBy: { name: 'asc' } });
  res.json(cats);
});

app.post('/api/categories', async (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'İsim gerekli' });
  const cat = await prisma.category.upsert({
    where: { name: name.trim() },
    update: {},
    create: { name: name.trim() },
  });
  res.json(cat);
});

// ─── Floor API ────────────────────────────────────────────────────────────────

app.get('/api/floor', async (req, res) => {
  let floor = await prisma.floor.findUnique({ where: { roomId: activeRoomId } });
  if (!floor) {
    floor = await prisma.floor.create({ data: { roomId: activeRoomId, texture: 'zemin.jpg' } });
  }
  res.json({ texture: floor.texture });
});

app.post('/api/floor', async (req, res) => {
  const { texture } = req.body;
  const floor = await prisma.floor.upsert({
    where: { roomId: activeRoomId },
    update: { texture },
    create: { roomId: activeRoomId, texture },
  });
  res.json({ texture: floor.texture });
});

app.get('/api/floor-textures', (req, res) => {
  const dir = 'public/textures';
  const files = fs.readdirSync(dir)
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f) && f !== 'duvar.jpg');
  res.json(files);
});

// ─── Doors API ────────────────────────────────────────────────────────────────

app.get('/api/doors', async (req, res) => {
  const doors = await prisma.door.findMany({ where: { roomId: activeRoomId } });
  res.json(doors.map(d => ({ id: d.doorId, isOuter: d.isOuter })));
});

app.post('/api/doors', async (req, res) => {
  const { ids, isOuter = false } = req.body;
  for (const doorId of ids) {
    await prisma.door.upsert({
      where: { roomId_doorId_isOuter: { roomId: activeRoomId, doorId: parseInt(doorId), isOuter } },
      update: {},
      create: { roomId: activeRoomId, doorId: parseInt(doorId), isOuter },
    });
  }
  const doors = await prisma.door.findMany({ where: { roomId: activeRoomId } });
  res.json(doors.map(d => ({ id: d.doorId, isOuter: d.isOuter })));
});

app.delete('/api/doors', async (req, res) => {
  const { ids, isOuter = false } = req.body;
  await prisma.door.deleteMany({
    where: { roomId: activeRoomId, doorId: { in: ids.map(Number) }, isOuter },
  });
  const doors = await prisma.door.findMany({ where: { roomId: activeRoomId } });
  res.json(doors.map(d => ({ id: d.doorId, isOuter: d.isOuter })));
});

// ─── Special Doors API ───────────────────────────────────────────────────────

function serializeSpecialDoor(sd, roomConfig) {
  const config = sd.isOuter ? OUTER_CONFIG : (roomConfig ?? ROOM_CONFIGS[activeRoomType] ?? ROOM_CONFIGS.room);
  return {
    id: sd.id,
    anchorId: sd.anchorId,
    targetRoomId: sd.targetRoomId,
    targetRoomName: sd.target.name,
    isOuter: sd.isOuter,
    instanceIds: getDoorInstanceIds(sd.anchorId, config),
  };
}

app.get('/api/special-doors', async (req, res) => {
  const doors = await prisma.specialDoor.findMany({
    where: { roomId: activeRoomId },
    include: { target: { select: { id: true, name: true } } },
  });
  res.json(doors.map(sd => serializeSpecialDoor(sd)));
});

app.post('/api/special-doors', async (req, res) => {
  const { anchorId, childRoomName, isOuter = false, roomType = 'room' } = req.body;
  if (!childRoomName?.trim()) return res.status(400).json({ error: 'Oda adı gerekli' });

  const childId = `room-${Date.now()}`;
  const childType = ROOM_CONFIGS[roomType] ? roomType : 'room';
  const parentConfig = isOuter ? OUTER_CONFIG : (ROOM_CONFIGS[activeRoomType] ?? ROOM_CONFIGS.room);
  const childConfig  = ROOM_CONFIGS[childType];

  // Back door: opposite face in child's coordinate system, j clamped to child face width
  const { face: pFace, j: pJ } = decodeWallId(anchorId, parentConfig);
  const oppFace = [1, 0, 3, 2][pFace];
  const childFaceWidth = oppFace < 2 ? childConfig.gx : childConfig.gz;
  const childJ = Math.min(pJ, childFaceWidth - 2);
  const childReturnAnchorId = encodeWallId(0, oppFace, childJ, childConfig);

  await prisma.$transaction([
    prisma.room.create({ data: { id: childId, name: childRoomName.trim(), parentId: activeRoomId, roomType: childType } }),
    prisma.floor.create({ data: { roomId: childId, texture: defaultFloorTexture(childType) } }),
    prisma.specialDoor.create({ data: { roomId: activeRoomId, anchorId, targetRoomId: childId, isOuter } }),
    prisma.specialDoor.create({ data: { roomId: childId, anchorId: childReturnAnchorId, targetRoomId: activeRoomId, isOuter: false } }),
  ]);

  const child = await prisma.room.findUnique({ where: { id: childId }, include: roomInclude });
  const parentSpecialDoors = await prisma.specialDoor.findMany({
    where: { roomId: activeRoomId },
    include: { target: { select: { id: true, name: true } } },
  });
  res.json({
    childRoom: serializeRoom(child),
    specialDoors: parentSpecialDoors.map(sd => serializeSpecialDoor(sd)),
  });
});

app.delete('/api/special-doors/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  const door = await prisma.specialDoor.findUnique({
    where: { id },
    include: {
      room:   { select: { roomType: true } },
      target: { select: { roomType: true } },
    },
  });
  if (!door) return res.status(404).json({ error: 'Bulunamadı' });
  const sourceType = door.room?.roomType ?? 'room';
  const config = door.isOuter ? OUTER_CONFIG : (ROOM_CONFIGS[sourceType] ?? ROOM_CONFIGS.room);
  const targetType = door.target?.roomType ?? 'room';
  const targetConfig = ROOM_CONFIGS[targetType] ?? ROOM_CONFIGS.room;
  const { face: pFace, j: pJ } = decodeWallId(door.anchorId, config);
  const oppFace = [1, 0, 3, 2][pFace];
  const tFaceWidth = oppFace < 2 ? targetConfig.gx : targetConfig.gz;
  const tJ = Math.min(pJ, tFaceWidth - 2);
  const returnAnchorId = encodeWallId(0, oppFace, tJ, targetConfig);
  await prisma.specialDoor.deleteMany({
    where: {
      OR: [
        { id },
        { roomId: door.targetRoomId, anchorId: returnAnchorId, isOuter: false },
        { roomId: door.targetRoomId, targetRoomId: door.roomId },
      ],
    },
  });
  await prisma.room.updateMany({
    where: {
      OR: [
        { id: door.targetRoomId, parentId: door.roomId },
        { id: door.roomId,       parentId: door.targetRoomId },
      ],
    },
    data: { parentId: null },
  });
  const allRooms = await prisma.room.findMany({ include: roomInclude });
  res.json({ success: true, rooms: allRooms.map(serializeRoom) });
});

app.post('/api/special-doors/link', async (req, res) => {
  const { anchorId, targetRoomId, linkType, isOuter = false } = req.body;
  if (!targetRoomId) return res.status(400).json({ error: 'Oda seçilmedi' });

  await prisma.$transaction(async (tx) => {
    if (linkType === 'child') {
      await tx.room.update({ where: { id: targetRoomId }, data: { parentId: activeRoomId } });
    }
    await tx.specialDoor.create({ data: { roomId: activeRoomId, anchorId, targetRoomId, isOuter } });
  });

  const updatedDoors = await prisma.specialDoor.findMany({
    where: { roomId: activeRoomId },
    include: { target: { select: { id: true, name: true } } },
  });
  const allRooms = await prisma.room.findMany({ include: roomInclude });
  res.json({
    specialDoors: updatedDoors.map(sd => serializeSpecialDoor(sd)),
    rooms: allRooms.map(serializeRoom),
  });
});

// ─── Media API ────────────────────────────────────────────────────────────────

app.get('/api/media', async (req, res) => {
  const media = await prisma.media.findMany({ where: { roomId: activeRoomId } });
  res.json(media.map(serializeMedia));
});

app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const { tileId, type, width, height, position, rotation, url } = req.body;

    let mediaUrl = url;
    if (req.file) {
      const folder = req.file.mimetype.startsWith('video/') ? 'videos' : 'images';
      mediaUrl = `/uploads/${folder}/${req.file.filename}`;
    }

    const pos = JSON.parse(position);
    const rot = JSON.parse(rotation);
    const id = BigInt(Date.now());

    const media = await prisma.media.create({
      data: {
        id,
        roomId: activeRoomId,
        tileId,
        type,
        url: mediaUrl || null,
        width: parseFloat(width) || 1,
        height: parseFloat(height) || 1,
        posX: parseFloat(pos[0]) || 0,
        posY: parseFloat(pos[1]) || 0,
        posZ: parseFloat(pos[2]) || 0,
        rotX: parseFloat(rot[0]) || 0,
        rotY: parseFloat(rot[1]) || 0,
        rotZ: parseFloat(rot[2]) || 0,
        rotOrder: String(rot[3] || 'XYZ'),
      },
    });

    res.json(serializeMedia(media));
  } catch (err) {
    console.error('[upload] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Yerel diskteki bir HTML dosyasını (örn. html-slides skill çıktısı) slayt tile'a
// alır: dosyayı public/uploads/slides/ altına kopyalar ve type='slide' Media yaratır.
// Yerel tek-kullanıcılık uygulama olduğundan mutlak yol okuması kabul edilir.
app.post('/api/slide-from-path', async (req, res) => {
  try {
    const { tileId, filePath, width, height, position, rotation } = req.body;
    if (!filePath || typeof filePath !== 'string') {
      return res.status(400).json({ error: 'Dosya yolu gerekli' });
    }

    const srcPath = filePath.trim();
    if (!/\.html?$/i.test(srcPath)) {
      return res.status(400).json({ error: 'Yalnızca .html/.htm dosyaları desteklenir' });
    }
    if (!fs.existsSync(srcPath) || !fs.statSync(srcPath).isFile()) {
      return res.status(400).json({ error: 'Dosya bulunamadı: ' + srcPath });
    }

    const baseName = path.basename(srcPath);
    const fileName = `${Date.now()}-${baseName}`;
    const destPath = path.join(__dirname, 'public', 'uploads', 'slides', fileName);
    fs.copyFileSync(srcPath, destPath);

    const pos = JSON.parse(position);
    const rot = JSON.parse(rotation);
    const id = BigInt(Date.now());

    const media = await prisma.media.create({
      data: {
        id,
        roomId: activeRoomId,
        tileId,
        type: 'slide',
        url: `/uploads/slides/${fileName}`,
        width: parseFloat(width) || 1,
        height: parseFloat(height) || 1,
        posX: parseFloat(pos[0]) || 0,
        posY: parseFloat(pos[1]) || 0,
        posZ: parseFloat(pos[2]) || 0,
        rotX: parseFloat(rot[0]) || 0,
        rotY: parseFloat(rot[1]) || 0,
        rotZ: parseFloat(rot[2]) || 0,
        rotOrder: String(rot[3] || 'XYZ'),
      },
    });

    res.json(serializeMedia(media));
  } catch (err) {
    console.error('[slide-from-path] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/fetch-url', async (req, res) => {
  const { url } = req.body;
  if (!url || !url.startsWith('http')) {
    return res.status(400).json({ error: 'Geçerli bir URL girin' });
  }

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MediaFetcher/1.0)' }
    });

    if (!response.ok) {
      return res.status(502).json({ error: `Kaynak sunucu hatası: HTTP ${response.status}` });
    }

    const contentType = response.headers.get('content-type') || '';
    const isVideo = contentType.startsWith('video/');
    const folder = isVideo ? 'videos' : 'images';

    let ext = 'jpg';
    try {
      const urlExt = path.extname(new URL(url).pathname).replace('.', '');
      if (urlExt) {
        ext = urlExt.toLowerCase().split('?')[0];
      } else {
        const ctExt = contentType.split('/')[1]?.split(';')[0];
        if (ctExt) ext = ctExt === 'jpeg' ? 'jpg' : ctExt;
      }
    } catch {}

    const filename = `${Date.now()}-fetched.${ext}`;
    const destPath = path.join(__dirname, 'public', 'uploads', folder, filename);

    const buffer = Buffer.from(await response.arrayBuffer());
    fs.writeFileSync(destPath, buffer);

    res.json({
      localUrl: `/uploads/${folder}/${filename}`,
      type: isVideo ? 'video' : 'image',
    });
  } catch (err) {
    console.error('[fetch-url] error:', err.message);
    res.status(500).json({ error: `İndirme hatası: ${err.message}` });
  }
});

app.post('/api/add-text', async (req, res) => {
  const { tileId, content, width, height, position, rotation } = req.body;
  const pos = JSON.parse(position);
  const rot = JSON.parse(rotation);
  const id = BigInt(Date.now());

  const media = await prisma.media.create({
    data: {
      id,
      roomId: activeRoomId,
      tileId,
      type: 'markdown',
      content,
      width: parseFloat(width) || 1,
      height: parseFloat(height) || 1,
      posX: parseFloat(pos[0]) || 0,
      posY: parseFloat(pos[1]) || 0,
      posZ: parseFloat(pos[2]) || 0,
      rotX: parseFloat(rot[0]) || 0,
      rotY: parseFloat(rot[1]) || 0,
      rotZ: parseFloat(rot[2]) || 0,
      rotOrder: String(rot[3] || 'XYZ'),
    },
  });

  res.json(serializeMedia(media));
});

app.post('/api/canvas', async (req, res) => {
  const { tileId, width, height, position, rotation, bg = '#1a1a2e' } = req.body;
  const pos = JSON.parse(position);
  const rot = JSON.parse(rotation);
  const id = BigInt(Date.now());
  const content = JSON.stringify({ items: [], bg });

  const media = await prisma.media.create({
    data: {
      id,
      roomId: activeRoomId,
      tileId,
      type: 'canvas',
      url: null,
      content,
      width: parseFloat(width) || 8,
      height: parseFloat(height) || 4.5,
      posX: parseFloat(pos[0]) || 0,
      posY: parseFloat(pos[1]) || 0,
      posZ: parseFloat(pos[2]) || 0,
      rotX: parseFloat(rot[0]) || 0,
      rotY: parseFloat(rot[1]) || 0,
      rotZ: parseFloat(rot[2]) || 0,
      rotOrder: String(rot[3] || 'XYZ'),
    },
  });

  res.json(serializeMedia(media));
});

app.post('/api/header', async (req, res) => {
  const { tileId, width, height, position, rotation, bg = '#1a1a2e', color = '#ffffff', text = '' } = req.body;
  const pos = JSON.parse(position);
  const rot = JSON.parse(rotation);
  const id = BigInt(Date.now());
  const content = JSON.stringify({ text, bg, color });

  const media = await prisma.media.create({
    data: {
      id,
      roomId: activeRoomId,
      tileId,
      type: 'header',
      url: null,
      content,
      width: parseFloat(width) || 4,
      height: parseFloat(height) || 1,
      posX: parseFloat(pos[0]) || 0,
      posY: parseFloat(pos[1]) || 0,
      posZ: parseFloat(pos[2]) || 0,
      rotX: parseFloat(rot[0]) || 0,
      rotY: parseFloat(rot[1]) || 0,
      rotZ: parseFloat(rot[2]) || 0,
      rotOrder: String(rot[3] || 'XYZ'),
    },
  });

  res.json(serializeMedia(media));
});

// Defter tile — Claude'a bağlı OLMAYAN yerel not defteri. İçerik tamamen
// content alanında JSON olarak tutulur: { pages: [{ title, blocks: [str] }] }.
// Kaydetme/güncelleme generic PUT /api/media/:id (content) ile yapılır.
app.post('/api/defter', async (req, res) => {
  try {
    const { tileId, width, height, position, rotation } = req.body;
    const pos = JSON.parse(position);
    const rot = JSON.parse(rotation);
    const id = BigInt(Date.now());
    const content = JSON.stringify({ pages: [{ title: '', blocks: [] }] });

    const media = await prisma.media.create({
      data: {
        id,
        roomId: activeRoomId,
        tileId,
        type: 'defter',
        url: null,
        content,
        width: parseFloat(width) || 6,
        height: parseFloat(height) || 4,
        posX: parseFloat(pos[0]) || 0,
        posY: parseFloat(pos[1]) || 0,
        posZ: parseFloat(pos[2]) || 0,
        rotX: parseFloat(rot[0]) || 0,
        rotY: parseFloat(rot[1]) || 0,
        rotZ: parseFloat(rot[2]) || 0,
        rotOrder: String(rot[3] || 'XYZ'),
      },
    });

    res.json(serializeMedia(media));
  } catch (err) {
    console.error('[defter] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/canvas/:id/upload', canvasUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Dosya yok' });
  res.json({ url: `/uploads/images/${req.file.filename}` });
});

// Farklı canvas'a yapıştırırken resim dosyalarını kopyalar
app.post('/api/canvas/copy-images', (req, res) => {
  const { urls } = req.body;
  const mapping = {};
  for (const srcUrl of (urls || [])) {
    if (!srcUrl?.startsWith('/uploads/')) continue;
    const srcPath = path.join(__dirname, 'public', srcUrl);
    if (!fs.existsSync(srcPath)) continue;
    const ext = path.extname(srcUrl);
    const newFilename = `canvas-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    fs.copyFileSync(srcPath, path.join(__dirname, 'public', 'uploads', 'images', newFilename));
    mapping[srcUrl] = `/uploads/images/${newFilename}`;
  }
  res.json({ mapping });
});

app.put('/api/media/:id', async (req, res) => {
  let id;
  try { id = BigInt(req.params.id) } catch { return res.status(400).json({ error: 'Geçersiz ID' }) }
  const { width, height, content } = req.body;

  const existing = await prisma.media.findUnique({ where: { id } });
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const data = {};
  if (width !== undefined) data.width = parseFloat(width) || existing.width;
  if (height !== undefined) data.height = parseFloat(height) || existing.height;
  if (content !== undefined) data.content = content;

  const updated = await prisma.media.update({ where: { id }, data });
  // Defter içeriği tek doğruluk kaynağıdır: içerik her değiştiğinde raw/'u saved=true
  // bloklardan bildirimsel yeniden izdüşür. Deterministik ad → aynı blok tekrar
  // kaydedilse bile duplicate olmaz; silinen/düzenlenip saved'i düşen bloklar raw'dan da
  // düşer. syncRoomDefterRaw fonksiyon bildirimi olduğundan hoist edilir (aşağıda tanımlı).
  if (updated.type === 'defter' && content !== undefined) {
    try { await syncRoomDefterRaw(updated.roomId) }
    catch (e) { console.error('[defter] raw sync failed:', e.message) }
  }
  res.json(serializeMedia(updated));
});

app.post('/api/media/clone', async (req, res) => {
  const { sourceId, tileId, position, rotation } = req.body;
  let source;
  try {
    source = await prisma.media.findUnique({ where: { id: BigInt(sourceId) } });
  } catch { return res.status(400).json({ error: 'Geçersiz ID' }); }
  if (!source) return res.status(404).json({ error: 'Kaynak bulunamadı' });

  const pos = JSON.parse(position);
  const rot = JSON.parse(rotation);

  const copyUpload = (srcUrl) => {
    if (!srcUrl?.startsWith('/uploads/')) return srcUrl;
    const srcPath = path.join(__dirname, 'public', srcUrl);
    if (!fs.existsSync(srcPath)) return srcUrl;
    const ext = path.extname(srcUrl);
    const dir = path.dirname(srcUrl);
    const newFilename = `clone-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    fs.copyFileSync(srcPath, path.join(__dirname, 'public', dir, newFilename));
    return `${dir}/${newFilename}`;
  };

  const newUrl = copyUpload(source.url);

  let newContent = source.content;
  if (source.type === 'canvas' && source.content) {
    try {
      const parsed = JSON.parse(source.content);
      const items = (parsed.items || []).map(ci => ({ ...ci, url: copyUpload(ci.url) }));
      newContent = JSON.stringify({ ...parsed, items });
    } catch {}
  }

  const media = await prisma.media.create({
    data: {
      id: BigInt(Date.now()),
      roomId: activeRoomId,
      tileId,
      type: source.type,
      url: newUrl,
      content: newContent,
      width: source.width,
      height: source.height,
      posX: parseFloat(pos[0]), posY: parseFloat(pos[1]), posZ: parseFloat(pos[2]),
      rotX: parseFloat(rot[0]), rotY: parseFloat(rot[1]), rotZ: parseFloat(rot[2]),
      rotOrder: String(rot[3] || 'XYZ'),
    },
  });
  res.json(serializeMedia(media));
});

app.delete('/api/media/:id', async (req, res) => {
  let id;
  try { id = BigInt(req.params.id) } catch { return res.status(400).json({ error: 'Geçersiz ID' }) }
  const item = await prisma.media.findUnique({ where: { id } });
  if (!item) return res.status(404).json({ error: 'Not found' });

  if (item.type === 'canvas' && item.content) {
    try {
      const parsed = JSON.parse(item.content);
      (parsed.items || []).forEach(ci => {
        if (ci.url?.startsWith('/uploads/')) {
          const fp = path.join(__dirname, 'public', ci.url);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
      });
    } catch {}
  }

  if (item.url && item.url.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, 'public', item.url);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }

  if (item.type === 'session') removeSessionRecall(String(id));   // öksüz recall checkpoint'i bırakma

  // Loop'lu tile silinirken çalışan runner'ı durdur ve havuz oturumlarını kapat —
  // yoksa runner recall yazmaya (ve harcamaya) devam eder, havuzda ölü kayıt sızar.
  if (item.type === 'roomsession' || item.type === 'multiagent') {
    const key = String(id);
    const loop = loopPool.get(key);
    if (loop) { try { loop.abort(); } catch {} loopPool.delete(key); }
    sessionPool.evict(`roomsession:${key}`);
    sessionPool.evictPrefix(`multiagent:${key}:`);
  }

  await prisma.media.delete({ where: { id } });
  res.json({ success: true });
});

// YouTube oEmbed meta proxy (title + thumbnail — avoids browser CORS)
app.get('/api/youtube-meta', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url gerekli' });
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
    if (!r.ok) return res.status(r.status).json({ error: 'oEmbed hatası' });
    const d = await r.json();
    res.json({ title: d.title || '', thumbnail_url: d.thumbnail_url || '', author_name: d.author_name || '' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Live Session (works standalone — no VS Code required) ───────────────────

const CWD_KEY = process.cwd().replace(/\//g, '-') // e.g. -home-sedat-projects-...
const PROJECT_DIR = path.join(os.homedir(), '.claude', 'projects', CWD_KEY)

// Session ID pinned for this server process lifetime (set on first message if no prior session)
let pinnedSessionId = null

function getLiveSession() {
  // Strategy 1: pinned session from this server run
  if (pinnedSessionId) {
    const jsonlPath = path.join(PROJECT_DIR, `${pinnedSessionId}.jsonl`)
    if (fs.existsSync(jsonlPath)) return { sessionId: pinnedSessionId, jsonlPath }
  }

  // Strategy 2: active VS Code session (most recent subdir under /tmp/claude-1000)
  try {
    const tmpDir = path.join('/tmp/claude-1000', CWD_KEY)
    const entries = fs.readdirSync(tmpDir, { withFileTypes: true })
    const dirs = entries.filter(e => e.isDirectory()).map(e => ({
      name: e.name,
      mtime: fs.statSync(path.join(tmpDir, e.name)).mtimeMs,
    }))
    if (dirs.length) {
      dirs.sort((a, b) => b.mtime - a.mtime)
      const sessionId = dirs[0].name
      const jsonlPath = path.join(PROJECT_DIR, `${sessionId}.jsonl`)
      if (fs.existsSync(jsonlPath)) return { sessionId, jsonlPath }
    }
  } catch {}

  // Strategy 3: most recently modified JSONL in ~/.claude/projects/{CWD_KEY}/
  try {
    fs.mkdirSync(PROJECT_DIR, { recursive: true })
    const files = fs.readdirSync(PROJECT_DIR)
      .filter(f => f.endsWith('.jsonl'))
      .map(f => ({ sessionId: f.slice(0, -6), mtime: fs.statSync(path.join(PROJECT_DIR, f)).mtimeMs }))
    if (files.length) {
      files.sort((a, b) => b.mtime - a.mtime)
      const { sessionId } = files[0]
      return { sessionId, jsonlPath: path.join(PROJECT_DIR, `${sessionId}.jsonl`) }
    }
  } catch {}

  return null // no prior session — first message will create one
}

// media.content stores JSON: { sessionId?, model, effort }
// Backward compat: plain session ID string → treat as sessionId
function parseSessionContent(raw) {
  const defaults = { sessionId: null, model: 'claude-fable-5', effort: 'normal', permissionMode: 'bypassPermissions' }
  if (!raw) return defaults
  if (!raw.startsWith('{')) return { ...defaults, sessionId: raw }
  try { return { ...defaults, ...JSON.parse(raw) } } catch { return defaults }
}

function formatSessionContent(obj) {
  return JSON.stringify(obj)
}

// İnteraktif soru/onay tool'ları — HER izin modunda (bypass dahil) köprüye düşmeli:
// AskUserQuestion (çoktan seçmeli seçenek soruları) ve ExitPlanMode (plan onayı).
// Bunlar headless stream-json modunda yerel olarak yanıtlanamaz; hook ile yakalayıp
// tarayıcıdan gelen yanıtı deny+reason olarak modele geri besleriz (spike ile doğrulandı).
const INTERACTIVE_TOOLS_MATCHER = 'AskUserQuestion|ExitPlanMode'

// İzin modunu CLI bayraklarına çevirir.
// - plan/acceptEdits: doğrudan CLI modu + interaktif-tool hook'u
// - ask: default mod + her tool için PreToolUse hook (Faz 2). Hook her tool öncesi izin
//   köprüsüne sorar; kullanıcı tarayıcıdan onaylar/redder. (bkz. permission-hook.js)
// - bypass (varsayılan): --dangerously-skip-permissions + interaktif-tool hook'u
// Not: ask dışı modlarda hook yalnız AskUserQuestion|ExitPlanMode'a takılır; normal
// tool'ların izin gevşekliği/performansı değişmez.
function permissionArgs(mode) {
  if (mode === 'plan')        return ['--permission-mode', 'plan',        '--settings', permSettingsJson(INTERACTIVE_TOOLS_MATCHER)]
  if (mode === 'acceptEdits') return ['--permission-mode', 'acceptEdits', '--settings', permSettingsJson(INTERACTIVE_TOOLS_MATCHER)]
  if (mode === 'ask')         return ['--permission-mode', 'default',     '--settings', permSettingsJson('*')]
  return ['--dangerously-skip-permissions', '--settings', permSettingsJson(INTERACTIVE_TOOLS_MATCHER)]
}

// CLI'a verilecek inline settings (PreToolUse hook'u verilen matcher ile kaydeder).
function permSettingsJson(matcher) {
  const hookPath = path.join(__dirname, 'permission-hook.js')
  return JSON.stringify({
    hooks: { PreToolUse: [{ matcher, hooks: [{ type: 'command', command: `node "${hookPath}"` }] }] },
  })
}

// ── İnteraktif izin köprüsü (PreToolUse hook ↔ tarayıcı) ──────────────────────
// Hook (ayrı süreç) /api/permission/ask'a POST atıp bloklanır; biz isteği aktif
// SSE akışına "permission_request" olarak yazarız, kullanıcı kararı gelince hook'a
// yanıt döneriz. session_id ile doğru tile'a eşleriz.
const sessionStreams = new Map()      // session_id → aktif SSE res
const pendingPermissions = new Map()  // tool_use_id → { resolve }
const AUTO_ALLOW_TOOLS = new Set(['Read', 'Glob', 'Grep', 'LS', 'NotebookRead', 'TodoWrite'])
const PERM_TIMEOUT_MS = 5 * 60 * 1000

// onEvent sarmalayıcı: init'te SSE akışını session_id ile kaydeder, kapanışta siler
function withStreamRegistry(res, inner) {
  let sid = null
  res.on('close', () => { if (sid && sessionStreams.get(sid) === res) sessionStreams.delete(sid) })
  return (ev) => {
    if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id) {
      sid = ev.session_id
      sessionStreams.set(sid, res)
    }
    inner?.(ev)
  }
}

// Hook bunu çağırır ve kullanıcı karar verene (ya da zaman aşımına) kadar bloklanır
app.post('/api/permission/ask', (req, res) => {
  const { session_id, tool_name, tool_input, tool_use_id } = req.body || {}

  // İnteraktif sorular (her modda köprüye düşer) — allow/deny izin kartından farklı UI.
  const isQuestion = tool_name === 'AskUserQuestion'
  const isPlan     = tool_name === 'ExitPlanMode'

  // Salt-okunur araçları kullanıcıyı yormadan otomatik onayla ("ask for edits" mantığı).
  // İnteraktif sorular bu kısayolu atlar — her zaman kullanıcıya sorulur.
  if (!isQuestion && !isPlan && AUTO_ALLOW_TOOLS.has(tool_name)) {
    return res.json({ decision: 'allow', reason: 'salt-okunur araç otomatik onaylandı' })
  }
  if (!tool_use_id) return res.json({ decision: 'deny', reason: 'tool_use_id yok' })

  const stream = session_id && sessionStreams.get(session_id)
  if (!stream) {
    // Yanıtlayacak aktif arayüz yok: modeli takmadan güvenli varsayımla devam ettir.
    if (isQuestion) return res.json({ decision: 'deny', reason: 'Kullanıcı şu an yanıt veremiyor; en makul varsayımla devam et.' })
    if (isPlan)     return res.json({ decision: 'allow', reason: 'Aktif arayüz yok — plan otomatik onaylandı.' })
    return res.json({ decision: 'deny', reason: 'Onaylayacak aktif arayüz yok' })
  }

  // İsteği tarayıcıya tool tipine uygun olay olarak bas
  try {
    let payload
    if (isQuestion)  payload = { type: 'ask_question', toolUseId: tool_use_id, questions: tool_input?.questions || [] }
    else if (isPlan) payload = { type: 'plan_review',  toolUseId: tool_use_id, plan: tool_input?.plan || '' }
    else             payload = { type: 'permission_request', toolUseId: tool_use_id, toolName: tool_name, toolInput: tool_input }
    stream.write(`data: ${JSON.stringify(payload)}\n\n`)
  } catch {}

  const timer = setTimeout(() => {
    if (pendingPermissions.delete(tool_use_id)) res.json({ decision: 'deny', reason: 'Zaman aşımı' })
  }, PERM_TIMEOUT_MS)

  pendingPermissions.set(tool_use_id, {
    resolve: (decision, reason) => {
      clearTimeout(timer)
      res.json({ decision, reason: reason || '' })
    },
  })
})

// Tarayıcı kullanıcının kararını buraya yollar
app.post('/api/permission/decision', (req, res) => {
  const { toolUseId, decision, reason } = req.body || {}
  const pending = pendingPermissions.get(toolUseId)
  if (!pending) return res.status(404).json({ error: 'Bekleyen izin isteği yok' })
  pendingPermissions.delete(toolUseId)
  pending.resolve(decision === 'allow' ? 'allow' : 'deny', reason)
  res.json({ ok: true })
})

// Standalone claude CLI bazı UI model adlarını (ör. claude-fable-5) tanımıyor.
// --model'e geçmeden önce desteklenen bir ada normalize et. Fable 5 ≈ Opus.
function cliModel(model) {
  if (!model || /fable/i.test(model)) return 'opus'
  return model
}

function parseLiveMessages(content) {
  const messages = []
  for (const line of content.split('\n').filter(Boolean)) {
    try {
      const d = JSON.parse(line)
      if (d.isSidechain) continue
      const msg = d.message
      if (!msg) continue
      const blocks = Array.isArray(msg.content) ? msg.content : []

      if (msg.role === 'user') {
        // --print mode writes user content as a plain string, not blocks
        if (typeof msg.content === 'string' && msg.content.trim() && !msg.content.startsWith('<')) {
          messages.push({ role: 'user', text: msg.content, id: d.uuid })
        }
        for (const b of blocks) {
          if (b.type === 'text' && b.text?.trim()) {
            messages.push({ role: 'user', text: b.text, id: d.uuid })
          }
          if (b.type === 'tool_result') {
            const out = Array.isArray(b.content)
              ? b.content.filter(c => c.type === 'text').map(c => c.text).join('\n')
              : (typeof b.content === 'string' ? b.content : '')
            if (out.trim()) {
              messages.push({ role: 'tool_result', text: out, id: `tr-${b.tool_use_id}` })
            }
          }
        }
      }

      if (msg.role === 'assistant') {
        for (const b of blocks) {
          if (b.type === 'text' && b.text?.trim()) {
            messages.push({ role: 'assistant', text: b.text, id: `${d.uuid}-text` })
          }
          if (b.type === 'tool_use') {
            const cmd = b.input?.command || b.input?.description || b.name
            messages.push({ role: 'tool_call', text: cmd, toolName: b.name, id: `${d.uuid}-${b.id}` })
          }
        }
      }
    } catch {}
  }
  return messages
}

app.get('/api/session/live', (req, res) => {
  const info = getLiveSession()
  if (!info) {
    return res.status(404).json({ error: 'Aktif Claude Code session bulunamadı' })
  }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()

  // Send all existing messages as init
  try {
    const content = fs.existsSync(info.jsonlPath) ? fs.readFileSync(info.jsonlPath, 'utf8') : ''
    const messages = parseLiveMessages(content)
    res.write(`data: ${JSON.stringify({ type: 'init', messages })}\n\n`)
    var lineCount = content.split('\n').filter(Boolean).length
  } catch { var lineCount = 0 }

  // Watch for new lines
  let lastLineCount = lineCount
  let watcher = null
  try {
    watcher = fs.watch(info.jsonlPath, () => {
      try {
        const content = fs.readFileSync(info.jsonlPath, 'utf8')
        const lines = content.split('\n').filter(Boolean)
        if (lines.length > lastLineCount) {
          const newContent = lines.slice(lastLineCount).join('\n')
          lastLineCount = lines.length
          const newMessages = parseLiveMessages(newContent)
          for (const m of newMessages) {
            res.write(`data: ${JSON.stringify({ type: 'update', message: m })}\n\n`)
          }
        }
      } catch {}
    })
  } catch {}

  res.on('close', () => watcher?.close())
})

app.post('/api/session/live/message', (req, res) => {
  const { message } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'Mesaj gerekli' })

  const info = getLiveSession()
  if (!info) return res.status(404).json({ error: 'Aktif session yok' })

  streamClaudeToSSE(res, [
    '--print', '--output-format=stream-json', '--verbose',
    '--resume', info.sessionId, '--dangerously-skip-permissions',
    message.trim()
  ], { usageType: 'live-session' })
})

// ─── Ortak yardımcılar (hem tek-atış streamClaudeToSSE hem kalıcı oturum yolu) ──
// CLI stream-json çıktısında tarayıcıya ilettiğimiz event türleri.
const FORWARD_TYPES = new Set(['assistant', 'tool', 'result', 'system'])
// Spawn edilen claude'a sızdırmamamız gereken oynak env değişkenleri.
const CLAUDE_VOLATILE_ENV = ['CLAUDECODE','CLAUDE_CODE_CHILD_SESSION','CLAUDE_CODE_SESSION_ID',
  'CLAUDE_CODE_ENTRYPOINT','AI_AGENT','CLAUDE_AGENT_SDK_VERSION']

function sseLine(ev) { return `data: ${JSON.stringify(ev)}\n\n` }

function setSSEHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders()
}

function buildSpawnEnv(envOverrides) {
  const env = { ...process.env, ...(envOverrides || {}), FOCUS_ROOM_PORT: String(port) }
  for (const v of CLAUDE_VOLATILE_ENV) delete env[v]
  return env
}

// ─── Günlük token sayacı (tile tipi bazında görünürlük) ──────────────────────
// Her `result` olayının usage'ı gün → tileType kırılımıyla data/usage-daily.json'a
// işlenir. Amaç: hangi tile tipinin ne yaktığını görmek — gelecek optimizasyonlar
// (ve içerik-diyeti kararı) bu veriye dayansın. Yazım debounce'lu + atomic.
// İzole ölçüm için env ile override edilebilir: bench sunucusu ayrı dosyaya yazar,
// böylece dev sunucusuyla aynı usage-daily.json'u paylaşıp delta'yı kirletmez (faz1).
const USAGE_FILE = process.env.USAGE_FILE
  ? path.resolve(process.env.USAGE_FILE)
  : path.join(__dirname, 'data', 'usage-daily.json')
let _usageDaily = null
let _usageFlushTimer = null

function _loadUsageDaily() {
  if (_usageDaily) return _usageDaily
  try { _usageDaily = JSON.parse(fs.readFileSync(USAGE_FILE, 'utf8')) }
  catch { _usageDaily = {} }
  return _usageDaily
}

function _flushUsageDaily() {
  _usageFlushTimer = null
  try {
    fs.mkdirSync(path.dirname(USAGE_FILE), { recursive: true })
    const tmp = `${USAGE_FILE}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(_usageDaily, null, 2))
    fs.renameSync(tmp, USAGE_FILE)
  } catch (e) { console.error('[usage-daily] yazım hatası:', e.message) }
}

function recordGlobalUsage(tileType, u) {
  if (!u || !tileType) return
  const store = _loadUsageDaily()
  const day = new Date().toISOString().slice(0, 10)
  const byType = store[day] || (store[day] = {})
  const t = byType[tileType] || (byType[tileType] = { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, processedTotal: 0 })
  t.calls += 1
  t.input += u.input_tokens || 0
  t.cacheWrite += u.cache_creation_input_tokens || 0
  t.cacheRead += u.cache_read_input_tokens || 0
  t.output += u.output_tokens || 0
  // processedTotal: oturum penceresini tüketen asıl büyüklük — cacheRead dahil
  // (dolar maliyeti düşük olsa da pencereyi doldurur, faz1 İş 1.2).
  t.processedTotal = (t.processedTotal || 0) + (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0)
    + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0)
  if (!_usageFlushTimer) {
    _usageFlushTimer = setTimeout(_flushUsageDaily, 5000)
    if (_usageFlushTimer.unref) _usageFlushTimer.unref()
  }
}

// Tur-başı yapılandırılmış usage logu (faz1 İş 1.1): cacheRead'in tur tur nasıl
// biriktiği çıplak gözle okunsun — multiagent 2.46M cacheRead kök nedeni bu
// birikimdi. Tek satır, grep-dostu format.
function logTurnUsage({ tile, key, turn, model, usage }) {
  if (!usage) return
  const inTok = usage.input_tokens || 0
  const cw = usage.cache_creation_input_tokens || 0
  const cr = usage.cache_read_input_tokens || 0
  const out = usage.output_tokens || 0
  console.error(`[turn-usage] tile=${tile || '?'} key=${key || '-'} turn=${turn || 1} in=${inTok} cw=${cw} cr=${cr} out=${out} total=${inTok + cw + cr + out} model=${model || '-'}`)
}

// Spawn arg listesinden bir bayrağın değerini oku (turn-usage logunda model için).
function cliArgValue(args, flag) {
  const i = args.indexOf(flag)
  return i >= 0 && args[i + 1] ? args[i + 1] : null
}

app.get('/api/usage/daily', (req, res) => {
  const days = Math.max(1, Math.min(90, parseInt(req.query.days, 10) || 7))
  const store = _loadUsageDaily()
  const out = {}
  for (const day of Object.keys(store).sort().slice(-days)) out[day] = store[day]
  res.json(out)
})

// Spawns the claude CLI and streams its stream-json output to an SSE response.
// Handles both normal stdout mode and "background task" mode (when the CLI
// detects it's running inside an active session it writes output to a task
// file instead of stdout — we detect the path and poll the file).
// opts.onEvent(ev) is called for every forwarded event.
// NOT: Tek-atış yol — VS Code köprüsü ve graf-build gibi gerçekten kısa ömürlü
// spawn'lar için. Çok turlu sohbet tile'ları kalıcı havuzu (SessionPool) kullanır.
function streamClaudeToSSE(res, args, opts = {}) {
  setSSEHeaders(res)

  const spawnEnv = { ...process.env, ...(opts.envOverrides || {}), FOCUS_ROOM_PORT: String(port) }
  for (const v of CLAUDE_VOLATILE_ENV) {
    delete spawnEnv[v]
  }

  let finished = false
  let pollInterval = null
  let idleTimer = null
  let heartbeat = null
  let sawResult = false

  function finish() {
    if (finished) return
    finished = true
    if (pollInterval) clearInterval(pollInterval)
    if (idleTimer) clearTimeout(idleTimer)
    if (heartbeat) clearInterval(heartbeat)
    res.write('data: {"type":"done"}\n\n')
    res.end()
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer)
    // Güvenlik ağı: 'result' olayı asıl bitiş sinyalidir (aşağıda forwardLine'da
    // yakalanır). Bu sayaç yalnızca result hiç gelmezse (çökme vb.) devreye girer;
    // bu yüzden uzun tool çağrılarını/düşünme duraklamalarını kesmeyecek kadar geniş.
    idleTimer = setTimeout(finish, 120000)
  }

  // SSE bağlantısını canlı tut: boşta kapanmayı ve ara katman buffer'lamasını önler.
  heartbeat = setInterval(() => {
    if (!finished) { try { res.write(': ping\n\n') } catch {} }
  }, 15000)

  function forwardLine(line) {
    if (!line.trim()) return false
    try {
      const ev = JSON.parse(line)
      if (ev.type === 'result' && ev.usage) {
        recordGlobalUsage(opts.usageType, ev.usage)
        logTurnUsage({ tile: opts.usageType, key: opts.usageKey || opts.usageType, turn: 1, model: cliArgValue(args, '--model'), usage: ev.usage })
      }
      opts.onEvent?.(ev)
      if (FORWARD_TYPES.has(ev.type)) {
        res.write(`data: ${JSON.stringify(ev)}\n\n`)
        // 'result' bir turun kanonik bitişi — her iki modda da deterministik kapanış.
        if (ev.type === 'result') sawResult = true
        return true
      }
    } catch {}
    return false
  }

  const proc = spawn(CLAUDE_CLI, args, { cwd: opts.cwd || process.cwd(), env: spawnEnv })
  let stdoutBuf = ''
  let taskFilePath = null
  let taskOffset = 0
  let taskLineBuf = ''

  function pollTaskFile() {
    if (finished || !taskFilePath) return
    try {
      const content = fs.readFileSync(taskFilePath, 'utf8')
      if (content.length > taskOffset) {
        const newText = content.slice(taskOffset)
        taskOffset = content.length
        taskLineBuf += newText
        const lines = taskLineBuf.split('\n')
        taskLineBuf = lines.pop() ?? ''
        let gotContent = false
        for (const line of lines) {
          if (forwardLine(line)) gotContent = true
        }
        if (sawResult) return finish()
        if (gotContent) resetIdleTimer()
      }
    } catch {}
  }

  proc.stdout.on('data', chunk => {
    stdoutBuf += chunk.toString()
    // Detect background task file path (CLI is running inside an active session)
    const m = stdoutBuf.match(/Output is being written to: ([^\n]+?)\.?\n/)
    if (m && !taskFilePath) {
      taskFilePath = m[1].trim()
      taskOffset = 0
      taskLineBuf = ''
      resetIdleTimer()
      pollInterval = setInterval(pollTaskFile, 250)
      return
    }
    if (taskFilePath) return  // already in background-task mode
    const lines = stdoutBuf.split('\n')
    stdoutBuf = lines.pop() ?? ''
    for (const line of lines) forwardLine(line)
    if (sawResult) finish()
  })

  proc.stderr.on('data', chunk => {
    console.error('[claude-sse stderr]', chunk.toString().slice(0, 200))
  })

  proc.on('close', () => {
    if (!taskFilePath) {
      // Normal mode: process exited → stream is complete
      finish()
    } else {
      // Background task mode: process exited after submitting the task,
      // but the task file is still being written to. Use idle timer.
      resetIdleTimer()
    }
  })

  proc.on('error', err => {
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`)
    finish()
  })

  res.on('close', () => {
    finished = true
    if (pollInterval) clearInterval(pollInterval)
    if (idleTimer) clearTimeout(idleTimer)
    if (!proc.killed) proc.kill()
  })
}

// ─── Kalıcı sıcak oturum havuzu (Persistent warm session) ────────────────────
// Sorun: sohbet tile'ları her mesajda taze bir `claude --print --resume` process'i
// başlatıyordu → Anthropic prompt cache'i (5dk TTL) process'ler arası taşınmadığı
// ve odada gezerken turlar arası süre 5dk'yı aştığı için her tur SOĞUK (cache-miss)
// gidiyor, tüm geçmiş tam ücretle yeniden okunuyordu (VS Code'a göre 4-5x token).
//
// Çözüm: her tile için TEK, uzun-ömürlü process. CLI'ın `--input-format stream-json`
// modunda process açık kalır; her mesaj stdin'e bir NDJSON satırı olarak yazılır,
// her mesaj bir tur üretir ve `result` ile biter. Process açık kaldığı için cache
// turlar arası SICAK kalır (spike'ta doğrulandı: tur2 input 4130→395, cache_read↑).
// Idle 15 dk: prompt cache TTL'i ~5 dk; sonrasında süreci canlı tutmanın tek
// getirisi spawn gecikmesi (~1-2 sn). Boşta bekleyen ~300MB'lık claude süreci
// RAM'i boşuna tutuyor; --resume ile devam sorunsuz.
const PERSIST_IDLE_MS = 15 * 60 * 1000   // boşta 15 dk sonra process'i kapat (RAM)
const PERSIST_MAX = 4                      // eşzamanlı kalıcı process tavanı (LRU tahliye)
const PERSIST_HARD_MAX = 6                 // hepsi busy iken bile aşılamaz tavan → 429
const MEM_SOFT_MB = 1200                   // havuz RSS toplamı bunu aşarsa idle kurban evict
const MEM_FREE_MIN_MB = 400                // sistem boş RAM bunun altına inerse acil fren

// /proc/<pid>/status'tan VmRSS (MB). MCP çocuklarını saymaz — kaba görünürlük.
function pidRssMb(pid) {
  try {
    const m = fs.readFileSync(`/proc/${pid}/status`, 'utf8').match(/^VmRSS:\s+(\d+) kB/m)
    return m ? Math.round(m[1] / 1024) : 0
  } catch { return 0 }
}

// stream-json girdi zarfı (spike'ta doğrulanan şema)
function userLine(text) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n'
}

class PersistentSession {
  constructor(key, { settings, cwd, sys, maxTurns, tools, maxBudgetUsd }) {
    this.key = key
    this.settings = { ...settings }          // { sessionId, model, effort, permissionMode }
    this.cwd = cwd || process.cwd()
    this.sys = sys || null                   // sabit append-system-prompt (variant'lar için)
    this.maxTurns = Number(maxTurns) || null // tur başına araç-tur tavanı (azgın worker sigortası)
    this.tools = tools || null               // built-in tool kısıtı (ör. 'Read,Edit,Write,Bash,Glob,Grep')
    this.maxBudgetUsd = Number(maxBudgetUsd) || null // spawn başına sert $ tavanı (kaçak koşu sigortası)
    this.proc = null
    this.alive = false
    this.sessionId = settings.sessionId || null
    this.sink = null                         // o an bağlı SSE res (yoksa null)
    this.busy = false
    this.queue = []                          // bekleyen { res, message }
    this.stdoutBuf = ''
    this.idleTimer = null
    this.heartbeat = null
    this.lastUsed = Date.now()
    this.onSessionId = null                  // ilk sessionId yakalanınca (persist için)
    this.lastResult = ''                     // son tamamlanan turun result metni (recall özeti)
    this.turnCount = 0                       // bu oturum nesnesinin tamamlanan tur sayısı (turn-usage logu)
    this.respawns = 0                        // --resume ile yeniden doğuş sayısı (faz1 İş 1.4)
  }

  _spawn() {
    const tile = this.key.split(':')[0]
    const a = [
      '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--model', cliModel(this.settings.model),
      // Faz 2 İş 2.1: dinamik system-prompt bölümlerini (cwd/env/git/memory) ilk user
      // mesajına taşı → cache prefix'i spawn'lar arası SABİT kalır, respawn sonrası
      // cacheWrite yerine cache-hit. Default prompt + --append-system-prompt ile uyumlu.
      '--exclude-dynamic-system-prompt-sections',
      ...mcpArgs(tile),
    ]
    if (this.sys) a.push('--append-system-prompt', this.sys)
    if (this.maxTurns) a.push('--max-turns', String(this.maxTurns))
    // Tool kısıtı: system prompt'a giren tool tanımı sayısını (→ her spawn'ın
    // cacheWrite'ı) düşürür; ayrıca worker'ın Task/WebSearch gibi token
    // çarpanlarına erişimini keser (plan.md P2-B).
    if (this.tools) a.push('--tools', this.tools)
    if (this.maxBudgetUsd) a.push('--max-budget-usd', String(this.maxBudgetUsd))
    a.push(...permissionArgs(this.settings.permissionMode))
    if (this.sessionId) a.push('--resume', this.sessionId)   // geçmişi koru

    const envOverrides = {}
    if (this.settings.effort && this.settings.effort !== 'normal') envOverrides.CLAUDE_EFFORT = this.settings.effort
    // Faz 2 İş 2.2 (TTL doğrulandı: result.usage.cache_creation kırılımı env'leri birebir izliyor):
    // - hot loop (roomsession/multiagent): turlar dakikalar içinde ardışık → 5m TTL yeter,
    //   cacheWrite 1.25× (1h'lik 2× yerine) — yazma %37.5 ucuz.
    // - interaktif sohbet (roomchat/ai-session/bluprint): kullanıcı arada uzun düşünür →
    //   1h TTL; geri dönünce cache-hit (5dk'da düşmüş cache'i yeniden yazmak yok).
    if (tile === 'roomsession' || tile === 'multiagent') envOverrides.FORCE_PROMPT_CACHING_5M = '1'
    else envOverrides.ENABLE_PROMPT_CACHING_1H = '1'

    // detached: claude kendi süreç grubunun lideri olur → dispose'da grup kill
    // ile MCP çocukları (context7/exa vb.) da ölür, orphan birikmez.
    // Respawn sayacı (faz1 İş 1.4): sessionId varken spawn = --resume ile yeniden
    // doğuş (idle evict / çökme / ayar değişimi). Faz 3'ün etkisi bu sayıyla ölçülür.
    if (this.sessionId) this.respawns += 1
    this.proc = spawn(CLAUDE_CLI, a, { cwd: this.cwd, env: buildSpawnEnv(envOverrides), detached: true })
    console.error(`[persist] SPAWN key=${this.key} pid=${this.proc.pid} resume=${this.sessionId || 'none'} respawns=${this.respawns}`)
    // Resume-şişkinlik göstergesi: respawn sonrası İLK turun input+cacheWrite'ı
    // loglanır ([resume-cost]) — içerik-diyeti (İş 1B) gerekli mi sorusunu bu cevaplar.
    this._logResumeCost = !!this.sessionId
    this.alive = true
    this.stdoutBuf = ''
    this.proc.stdout.on('data', (c) => this._onStdout(c))
    this.proc.stderr.on('data', (c) => console.error('[persist stderr]', c.toString().slice(0, 200)))
    this.proc.on('close', (code) => this._onClose(code))
    this.proc.on('error', (e) => this._emitError(e.message))
  }

  _onStdout(chunk) {
    this.stdoutBuf += chunk.toString()
    const lines = this.stdoutBuf.split('\n')
    this.stdoutBuf = lines.pop() ?? ''
    for (const line of lines) this._onLine(line)
  }

  _onLine(line) {
    if (!line.trim()) return
    let ev
    try { ev = JSON.parse(line) } catch { return }
    // Her tur başında bir init gelir (aynı session_id) — idempotent ele al.
    if (ev.type === 'system' && ev.subtype === 'init' && ev.session_id) {
      if (!this.sessionId) {
        this.sessionId = ev.session_id
        if (this.onSessionId) { try { this.onSessionId(ev.session_id) } catch {} }
      }
      if (this.sink) sessionStreams.set(this.sessionId, this.sink)  // izin köprüsü
    }
    if (this.sink && FORWARD_TYPES.has(ev.type)) {
      try { this.sink.write(sseLine(ev)) } catch {}
    }
    if (ev.type === 'result') {
      if (ev.usage) {
        this.turnCount += 1
        recordGlobalUsage(this.key.split(':')[0], ev.usage)
        logTurnUsage({ tile: this.key.split(':')[0], key: this.key, turn: this.turnCount, model: this.settings.model, usage: ev.usage })
        if (this._logResumeCost) {
          this._logResumeCost = false
          const input = ev.usage.input_tokens || 0
          const cacheWrite = ev.usage.cache_creation_input_tokens || 0
          console.error(`[resume-cost] key=${this.key} respawn#${this.respawns} firstTurn=${Math.round((input + cacheWrite) / 1000)}k (input=${input} cacheWrite=${cacheWrite})`)
        }
      }
      if (typeof ev.result === 'string') this.lastResult = ev.result   // recall özeti için son yanıt
      this._finishTurn()   // tur sınırı
    }
  }

  // Bir mesaj kuyruğa al; sıra gelince stdin'e yaz.
  send(res, message, { onInit } = {}) {
    setSSEHeaders(res)
    if (onInit && !this.onSessionId) this.onSessionId = onInit
    this.queue.push({ res, message })
    this._next()
  }

  async _next() {
    if (this.busy) return
    const job = this.queue.shift()
    if (!job) return
    this.busy = true
    this.lastUsed = Date.now()
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
    if (!this.alive || !this.proc) {
      this._spawn()   // ilk tur ya da idle/çökme sonrası --resume ile yeniden doğ
    }

    this.sink = job.res
    if (this.sessionId) sessionStreams.set(this.sessionId, this.sink)
    // Kullanıcı sekmeyi kapatırsa turu bırak ama process'i yaşat.
    job.res.on('close', () => { if (this.sink === job.res) this._detachSink() })

    this.heartbeat = setInterval(() => {
      if (this.sink) { try { this.sink.write(': ping\n\n') } catch {} }
    }, 15000)

    try {
      this.proc.stdin.write(userLine(job.message))
    } catch (e) {
      this._emitError(e.message)
      this.busy = false
      this._next()
    }
  }

  _finishTurn() {
    if (this.sink) { try { this.sink.write('data: {"type":"done"}\n\n'); this.sink.end() } catch {} }
    this._detachSink()
    this.busy = false
    this._writeStandaloneRecall()   // standalone ai-session için "kaldığın yer" checkpoint'i
    this._armIdle()
    this._next()   // kuyrukta bekleyen varsa işle
  }

  // Yalnızca standalone ai-session tile'ları için hafif recall checkpoint'i yaz.
  // roomsession/loop hariç — onların kendi (.recall room-projects altı) mekanizması var.
  _writeStandaloneRecall() {
    if (!this.key.startsWith('ai-session:')) return
    const mediaId = this.key.split(':')[1]
    if (!mediaId || !this.sessionId) return
    try {
      // Kümülatif tur sayısı: diskteki önceki checkpoint üzerine ekle. Örnek (instance)
      // sayacı evict/respawn'da sıfırlanırdı; disk evict'te kalıp clear/delete'te silindiği
      // için sayım konuşma boyu doğru, temizlikte 1'e döner.
      const prev = readSessionRecall(mediaId)
      writeSessionRecall(mediaId, {
        mediaId,
        sessionId: this.sessionId,
        model: this.settings.model,
        effort: this.settings.effort,
        turnCount: (prev?.turnCount || 0) + 1,
        lastSummary: (this.lastResult || '').slice(0, 280),
        lastTurnAt: new Date().toISOString(),
      })
    } catch (e) {
      console.error('[session-recall] hata:', e.message)
    }
  }

  _detachSink() {
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null }
    if (this.sessionId && sessionStreams.get(this.sessionId) === this.sink) sessionStreams.delete(this.sessionId)
    this.sink = null
  }

  _armIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => sessionPool.evict(this.key), PERSIST_IDLE_MS)
  }

  _emitError(msg) {
    if (this.sink) { try { this.sink.write(sseLine({ type: 'error', message: msg })); this.sink.end() } catch {} }
  }

  _onClose(code) {
    console.error(`[persist] CLOSE key=${this.key} code=${code} busy=${this.busy}`)
    this.alive = false
    this.proc = null
    if (this.busy && this.sink) this._emitError(`oturum süreci kapandı (kod ${code})`)
    this._detachSink()
    this.busy = false
    if (this.queue.length) this._next()   // beklenen kapanış değilse --resume ile yeniden doğ
  }

  // model/effort/izin değişti: ayarları güncelle ve process'i kapat.
  // Sonraki mesaj --resume + yeni ayarlarla yeniden doğar (geçmiş korunur).
  applySettings(patch) {
    this.settings = { ...this.settings, ...patch }
    this.dispose()
  }

  dispose() {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
    this._detachSink()
    if (this.proc) {
      try { this.proc.stdin.end() } catch {}
      // Süreç GRUBUNU öldür (negatif pid) → MCP çocukları da temizlenir.
      // Grup kill başarısız olursa tekil kill'e düş.
      try { process.kill(-this.proc.pid, 'SIGTERM') }
      catch { try { this.proc.kill() } catch {} }
    }
    this.proc = null
    this.alive = false
    this.busy = false
  }
}

class SessionPool {
  constructor() {
    this.map = new Map()
    // Bellek bekçisi: 60 sn'de bir havuz RSS'i + sistem boş RAM'i kontrol et.
    this.watchdog = setInterval(() => this._memWatch(), 60000)
    if (this.watchdog.unref) this.watchdog.unref()
  }

  ensure(key, opts) {
    let s = this.map.get(key)
    if (!s) {
      this._evictIfFull()
      // Busy-starvation koruması: kurban bulunamadıysa havuz PERSIST_MAX'ı
      // aşabilir; hard cap'te yeni oturum açmayı reddet (çağıran 429 döndürür).
      if (this.map.size >= PERSIST_HARD_MAX) {
        const err = new Error('Tüm oturumlar meşgul, lütfen biraz sonra tekrar dene')
        err.code = 'POOL_BUSY'
        throw err
      }
      s = new PersistentSession(key, opts)
      this.map.set(key, s)
    }
    return s
  }

  get(key) { return this.map.get(key) }

  evict(key) {
    const s = this.map.get(key)
    if (s) { s.dispose(); this.map.delete(key) }
  }

  // Verilen önekle başlayan TÜM oturumları tahliye et. multiagent tile'ın rol bazlı
  // çok parçalı anahtar ailesi (multiagent:<mediaId>:<rol>) için gerekir — sabit
  // "prefix:mediaId" tam-anahtar tahliyesi bunları yakalayamaz.
  evictPrefix(prefix) {
    for (const key of [...this.map.keys()]) {
      if (key.startsWith(prefix)) this.evict(key)
    }
  }

  // Tavan dolduysa, meşgul olmayan en eski oturumu tahliye et.
  _evictIfFull() {
    if (this.map.size < PERSIST_MAX) return
    const victim = this._idleVictim()
    if (victim) this.evict(victim.key)
  }

  // Meşgul olmayan en eski (LRU) oturum; yoksa null.
  _idleVictim() {
    let victim = null
    for (const s of this.map.values()) {
      if (s.busy) continue
      if (!victim || s.lastUsed < victim.lastUsed) victim = s
    }
    return victim
  }

  // Bellek bekçisi: havuz RSS toplamını ve sistem boş RAM'i ölç, eşik aşımında
  // idle oturumları tahliye et. Busy süreç asla öldürülmez (turu bozar).
  _memWatch() {
    if (this.map.size === 0) return
    let poolRss = 0
    const parts = []
    for (const s of this.map.values()) {
      const mb = s.proc ? pidRssMb(s.proc.pid) : 0
      poolRss += mb
      parts.push(`${s.key}=${mb}MB${s.busy ? '(busy)' : ''}`)
    }
    const freeMb = Math.round(os.freemem() / (1024 * 1024))
    console.error(`[pool-mem] toplam=${poolRss}MB boşRAM=${freeMb}MB oturum=${this.map.size} [${parts.join(', ')}]`)

    if (freeMb < MEM_FREE_MIN_MB) {
      // Acil fren: busy olmayan TÜM oturumları bırak.
      const idle = [...this.map.values()].filter((s) => !s.busy)
      if (!idle.length) { console.error('[pool-mem] UYARI: boş RAM kritik ama tüm oturumlar meşgul — evict yok'); return }
      console.error(`[pool-mem] ACİL: boş RAM ${freeMb}MB < ${MEM_FREE_MIN_MB}MB → ${idle.length} idle oturum evict`)
      for (const s of idle) this.evict(s.key)
      return
    }
    if (poolRss > MEM_SOFT_MB) {
      const victim = this._idleVictim()
      if (!victim) { console.error(`[pool-mem] UYARI: havuz RSS ${poolRss}MB > ${MEM_SOFT_MB}MB ama tüm oturumlar meşgul — evict yok`); return }
      console.error(`[pool-mem] havuz RSS ${poolRss}MB > ${MEM_SOFT_MB}MB → evict ${victim.key}`)
      this.evict(victim.key)
    }
  }
}

const sessionPool = new SessionPool()

// HTTP uçları için ensure sarmalayıcı: hard cap (POOL_BUSY) 429 olarak döner.
// SSE header'ları henüz yazılmadığı için düz JSON yanıt güvenli.
function ensureSessionOr429(res, key, opts) {
  try { return sessionPool.ensure(key, opts) }
  catch (e) {
    if (e.code === 'POOL_BUSY') { res.status(429).json({ error: e.message }); return null }
    throw e
  }
}

// ─── Sohbeti temizle: canlı oturumu kapat + sessionId'yi sıfırla ─────────────
// Geçmiş .jsonl dosyasına dokunmaz; sessionId null'lanınca history boş döner ve
// sonraki mesaj --resume'suz taze bir oturum açar. (Export'lar zaten raw/'da kalır.)
function makeClearHandler(typeName, poolPrefix, notFoundMsg) {
  return async (req, res) => {
    try {
      const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
      if (!media || media.type !== typeName) return res.status(404).json({ error: notFoundMsg })
      sessionPool.evict(`${poolPrefix}:${req.params.mediaId}`)   // canlı process'i kapat
      if (poolPrefix === 'ai-session') removeSessionRecall(req.params.mediaId)   // "kaldığın yer" checkpoint'i de sıfırla
      const current = parseSessionContent(media.content)
      await prisma.media.update({
        where: { id: BigInt(req.params.mediaId) },
        data: { content: formatSessionContent({ ...current, sessionId: null }) },
      })
      res.json({ ok: true })
    } catch (err) {
      res.status(500).json({ error: err.message })
    }
  }
}

app.post('/api/ai-session/:mediaId/clear',  makeClearHandler('session',     'ai-session',  'Session bulunamadı'))
app.post('/api/roomchat/:mediaId/clear',    makeClearHandler('roomchat',    'roomchat',    'Oda sohbeti bulunamadı'))
app.post('/api/roomsession/:mediaId/clear', makeClearHandler('roomsession', 'roomsession', 'Oda projesi bulunamadı'))
app.post('/api/bluprint/:mediaId/clear',    makeClearHandler('bluprint',    'bluprint',    'Blueprint bulunamadı'))

// NOT: Eski trimSessionJsonl kaldırıldı — geçmiş diyeti CLI'ın kendi
// microcompact/auto-compact'ine bırakıldı (idle>60dk sonrası resume'da eski
// tool_result içerikleri CLI tarafından zaten temizlenerek gönderilir).

// ─── Room Session (her oda için izole proje klasörü) ─────────────────────────
// roomsession tile, session tile'a benzer ama Claude CLI odaya özel bir proje
// klasöründe (cwd) çalışır: room-projects/<roomId>/. Böylece her oda kendi web
// projesini bu izole klasörde geliştirir. Session geçmişi (JSONL), CLI'ın
// çalıştığı cwd'ye göre ~/.claude/projects/<cwd-key>/ altına yazılır.

function roomProjectDir(roomId) {
  return path.join(__dirname, 'room-projects', String(roomId))
}

// roomsession geçmişinin (JSONL) bulunduğu ~/.claude/projects/<cwd-key>/ dizini.
// cwd-key, proje klasörünün mutlak yolunun '/' → '-' ile kodlanmış hâlidir
// (bkz. CWD_KEY türetimi).
function roomProjectJsonlDir(roomId) {
  const key = roomProjectDir(roomId).replace(/\//g, '-')
  return path.join(os.homedir(), '.claude', 'projects', key)
}

// ─── AI Session ──────────────────────────────────────────────────────────────

app.post('/api/session', async (req, res) => {
  const { tileId, width, height, position, rotation, model, effort, permissionMode } = req.body;
  const id = BigInt(Date.now());
  try {
    const pos = JSON.parse(position);
    const rot = JSON.parse(rotation);
    const media = await prisma.media.create({
      data: {
        id,
        roomId: activeRoomId,
        tileId: String(tileId),
        type: 'session',
        width: parseFloat(width) || 6,
        height: parseFloat(height) || 4,
        posX: parseFloat(pos[0]) || 0,
        posY: parseFloat(pos[1]) || 0,
        posZ: parseFloat(pos[2]) || 0,
        rotX: parseFloat(rot[0]) || 0,
        rotY: parseFloat(rot[1]) || 0,
        rotZ: parseFloat(rot[2]) || 0,
        rotOrder: String(rot[3] || 'XYZ'),
        content: formatSessionContent({ model: model || 'claude-fable-5', effort: effort || 'normal', permissionMode: permissionMode || 'bypassPermissions' }),
      },
    });
    res.json(serializeMedia(media));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Returns session history + current settings for this tile
app.get('/api/ai-session/:mediaId/history', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'session') {
      return res.status(404).json({ error: 'Session bulunamadı' })
    }
    const { sessionId, model, effort, permissionMode } = parseSessionContent(media.content)
    if (!sessionId) return res.json({ sessionId: null, messages: [], model, effort, permissionMode })

    const jsonlPath = path.join(PROJECT_DIR, `${sessionId}.jsonl`)
    if (!fs.existsSync(jsonlPath)) return res.json({ sessionId, messages: [], model, effort, permissionMode })

    const content = fs.readFileSync(jsonlPath, 'utf8')
    res.json({ sessionId, messages: parseLiveMessages(content), model, effort, permissionMode })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Standalone session "kaldığın yer" recall checkpoint'i (varsa) döndürür.
app.get('/api/ai-session/:mediaId/recall', async (req, res) => {
  try {
    res.json({ recall: readSessionRecall(req.params.mediaId) || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Update model/effort settings without touching the session
app.patch('/api/ai-session/:mediaId/settings', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'session') return res.status(404).json({ error: 'Session bulunamadı' })
    const current = parseSessionContent(media.content)
    const updated = { ...current, ...req.body }
    await prisma.media.update({
      where: { id: BigInt(req.params.mediaId) },
      data: { content: formatSessionContent(updated) },
    })
    // Canlı kalıcı oturum varsa: yeni ayarlarla yeniden başlat (geçmiş --resume ile korunur).
    sessionPool.get(`ai-session:${req.params.mediaId}`)?.applySettings(req.body)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/ai-session/message', async (req, res) => {
  const { mediaId, message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Mesaj gerekli' });

  let settings = { sessionId: null, model: 'claude-fable-5', effort: 'normal', permissionMode: 'bypassPermissions' }
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(mediaId) } })
    if (media) settings = parseSessionContent(media.content)
  } catch {}

  // Kalıcı sıcak oturum: ilk mesajda process doğar, sonraki mesajlar aynı sıcak
  // process'e stdin'den akar → prompt cache turlar arası korunur (token tasarrufu).
  // İlk init'te yakalanan sessionId media.content'e bir kez kaydedilir (eviction/
  // çökme sonrası --resume ile geçmiş korunsun diye).
  const sess = ensureSessionOr429(res, `ai-session:${mediaId}`, { settings, cwd: process.cwd() })
  if (!sess) return
  sess.send(res, message.trim(), {
    onInit: (sessionId) => {
      prisma.media.update({
        where: { id: BigInt(mediaId) },
        data: { content: formatSessionContent({ ...settings, sessionId }) },
      }).catch(err => console.error('[ai-session] kayıt hatası:', err.message))
    },
  })
});

// ─── Room Chat (her oda için ayrı graphify grafı) ────────────────────────────
// roomchat tile, session tile'a benzer ama sohbet o odanın metin/canvas
// içeriğinden graphify ile üretilen ayrı bir bilgi grafıyla beslenir.
// Her odanın grafı izole bir klasörde tutulur: room-graphs/<roomId>/

function roomGraphDir(roomId) {
  return path.join(__dirname, 'room-graphs', String(roomId))
}

// Bir odadaki metin/canvas/başlık medyalarından düz metin çıkarır
async function extractRoomTexts(roomId) {
  const media = await prisma.media.findMany({ where: { roomId: String(roomId) } })
  const docs = []
  for (const m of media) {
    if (m.type === 'markdown' && m.content?.trim()) {
      docs.push({ id: String(m.id), tileId: m.tileId, kind: 'metin', text: m.content.trim() })
    } else if (m.type === 'header' && m.content) {
      try {
        const h = JSON.parse(m.content)
        if (h.text?.trim()) docs.push({ id: String(m.id), tileId: m.tileId, kind: 'baslik', text: h.text.trim() })
      } catch {}
    } else if (m.type === 'canvas' && m.content) {
      try {
        const c = JSON.parse(m.content)
        const texts = (c.items || [])
          .filter(it => it.type === 'text' && it.content?.trim())
          .map(it => it.content.trim())
        if (texts.length) docs.push({ id: String(m.id), tileId: m.tileId, kind: 'canvas', text: texts.join('\n\n') })
      } catch {}
    }
  }
  return docs
}

// Çıkarılan metinleri room-graphs/<roomId>/raw/ altına .md dosyaları olarak yazar.
// chat-*.md export dosyaları korunur (sohbet mesajları da grafa beslensin); yalnızca
// tile kaynaklı dosyalar tazelenir — silinen tile'ların düğümleri böylece grafdan düşer.
function writeRoomRaw(roomId, docs) {
  const rawDir = path.join(roomGraphDir(roomId), 'raw')
  fs.mkdirSync(rawDir, { recursive: true })
  for (const f of fs.readdirSync(rawDir)) {
    // chat-* (roomchat export) ve defter-* (defter export) dosyaları korunur; yalnızca
    // tile kaynaklı dosyalar tazelenir.
    if (!f.startsWith('chat-') && !f.startsWith('defter-')) fs.rmSync(path.join(rawDir, f), { force: true })
  }
  for (const d of docs) {
    fs.writeFileSync(path.join(rawDir, `${d.kind}-${d.id}.md`), d.text + '\n')
  }
  return rawDir
}

// Defter blok metninden dosya adı slug'ı üretir — \w unicode'suz olduğu için
// Türkçe karakterler düşer; dosya adı güvenli kalır.
function defterSlug(text) {
  return (text || '').slice(0, 30).toLowerCase().replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 25) || 'not'
}

// Defter tile'larının kaydedilmiş (saved=true) bloklarını raw/ ile bildirimsel eşitler.
// Tek doğruluk kaynağı tile içeriğidir: önce odadaki TÜM defter-*.md silinir (eski
// isimlendirme şemaları dahil), sonra her defter media'nın saved blokları yeniden
// yazılır. Böylece tile'da silinen/değiştirilen bir not, bir sonraki Güncelle'de
// grafdan da düşer; düzenlenip yeniden kaydedilen not çift düğüm bırakmaz.
async function syncRoomDefterRaw(roomId) {
  const rawDir = path.join(roomGraphDir(roomId), 'raw')
  fs.mkdirSync(rawDir, { recursive: true })
  for (const f of fs.readdirSync(rawDir)) {
    if (f.startsWith('defter-')) fs.rmSync(path.join(rawDir, f), { force: true })
  }
  const defters = await prisma.media.findMany({ where: { roomId: String(roomId), type: 'defter' } })
  for (const m of defters) {
    let data
    try { data = JSON.parse(m.content || '') } catch { continue }
    const pages = Array.isArray(data?.pages) ? data.pages : []
    pages.forEach((p, pi) => {
      const blocks = Array.isArray(p?.blocks) ? p.blocks : []
      const saved = Array.isArray(p?.saved) ? p.saved : []
      blocks.forEach((b, bi) => {
        if (saved[bi] !== true || typeof b !== 'string' || !b.trim()) return
        const filename = `defter-${m.id}-${pi}-${bi}_${defterSlug(b)}.md`
        fs.writeFileSync(path.join(rawDir, filename), b, 'utf8')
      })
    })
  }
}

// Sohbet için odadaki ham metinleri (bütçeli) tek bir bağlam metnine birleştirir
function roomCorpusText(docs, budgetChars = 24000) {
  let out = ''
  for (const d of docs) {
    const block = `\n\n## ${d.kind} (tile ${d.tileId})\n${d.text}`
    if (out.length + block.length > budgetChars) { out += '\n\n…(kısaltıldı)'; break }
    out += block
  }
  return out.trim()
}

// Odanın grafının disk durumunu okur
function roomGraphStatus(roomId, builtAt = null) {
  const graphPath = path.join(roomGraphDir(roomId), 'graphify-out', 'graph.json')
  const status = { exists: false, nodeCount: 0, builtAt }
  if (fs.existsSync(graphPath)) {
    try {
      const g = JSON.parse(fs.readFileSync(graphPath, 'utf8'))
      status.exists = true
      status.nodeCount = (g.nodes || []).length
    } catch {}
  }
  return status
}

// roomchat tile oluştur (session tile ile aynı şema, type='roomchat')
app.post('/api/roomchat', async (req, res) => {
  const { tileId, width, height, position, rotation, model, effort, permissionMode } = req.body
  const id = BigInt(Date.now())
  try {
    const pos = JSON.parse(position)
    const rot = JSON.parse(rotation)
    const media = await prisma.media.create({
      data: {
        id,
        roomId: activeRoomId,
        tileId: String(tileId),
        type: 'roomchat',
        width: parseFloat(width) || 6,
        height: parseFloat(height) || 4,
        posX: parseFloat(pos[0]) || 0,
        posY: parseFloat(pos[1]) || 0,
        posZ: parseFloat(pos[2]) || 0,
        rotX: parseFloat(rot[0]) || 0,
        rotY: parseFloat(rot[1]) || 0,
        rotZ: parseFloat(rot[2]) || 0,
        rotOrder: String(rot[3] || 'XYZ'),
        content: formatSessionContent({ model: model || 'claude-fable-5', effort: effort || 'normal', permissionMode: permissionMode || 'bypassPermissions' }),
      },
    })
    res.json(serializeMedia(media))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// roomchat geçmişi + ayarları + graf durumu
app.get('/api/roomchat/:mediaId/history', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'roomchat') {
      return res.status(404).json({ error: 'Oda sohbeti bulunamadı' })
    }
    const settings = parseSessionContent(media.content)
    const { sessionId, model, effort, permissionMode } = settings
    const graph = roomGraphStatus(media.roomId, settings.graphBuiltAt || null)

    let messages = []
    if (sessionId) {
      const jsonlPath = path.join(PROJECT_DIR, `${sessionId}.jsonl`)
      if (fs.existsSync(jsonlPath)) {
        messages = parseLiveMessages(fs.readFileSync(jsonlPath, 'utf8'))
      }
    }
    res.json({ sessionId, messages, model, effort, permissionMode, graph })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// model/effort ayarlarını güncelle (sohbeti bozmadan)
app.patch('/api/roomchat/:mediaId/settings', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'roomchat') return res.status(404).json({ error: 'Oda sohbeti bulunamadı' })
    const current = parseSessionContent(media.content)
    const updated = { ...current, ...req.body }
    await prisma.media.update({
      where: { id: BigInt(req.params.mediaId) },
      data: { content: formatSessionContent(updated) },
    })
    sessionPool.get(`roomchat:${req.params.mediaId}`)?.applySettings(req.body)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// "Güncelle" butonu — odanın metinlerini topla, raw/'a yaz, graphify ile graf kur
app.post('/api/roomchat/:mediaId/rebuild', async (req, res) => {
  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } }) } catch {}
  if (!media || media.type !== 'roomchat') return res.status(404).json({ error: 'Oda sohbeti bulunamadı' })

  const roomId = media.roomId
  const docs = await extractRoomTexts(roomId)

  const dir = roomGraphDir(roomId)
  fs.mkdirSync(dir, { recursive: true })
  // Tile metinlerini yaz (chat-*/defter-* korunur), ardından defter raw'ını saved
  // bloklardan bildirimsel olarak tazele (silinen/değişen notlar grafdan düşsün).
  writeRoomRaw(roomId, docs)
  await syncRoomDefterRaw(roomId)

  // Graflanacak içerik kararını tazelenmiş raw klasörünün gerçek hali verir: tile
  // metinleri + chat export + güncel defter export. Hepsi boşsa graphify'ı koşturma.
  const rawDir = path.join(dir, 'raw')
  let rawCount = 0
  try { rawCount = fs.readdirSync(rawDir).filter(f => f.endsWith('.md')).length } catch {}

  if (!rawCount) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Bu odada graflanacak içerik yok. Önce metin/canvas ekleyin veya bir defter bloğunu kaydedin.' })}\n\n`)
    res.write('data: {"type":"done"}\n\n')
    return res.end()
  }

  // Graf zaten varsa artımlı (--update) modda çalış: yalnızca yeni/değişen
  // metinleri yeniden işle, silinenleri grafdan çıkar. İlk kurulumda full build.
  const hasGraph = fs.existsSync(path.join(dir, 'graphify-out', 'graph.json'))
  const { model } = parseSessionContent(media.content)
  const prompt = hasGraph
    ? `graphify skill'ini (Skill tool, skill adı "graphify") --update (artımlı) modunda geçerli çalışma dizinindeki ./raw klasörü üzerinde çalıştır. Yalnızca yeni eklenen veya içeriği değişen dosyaları yeniden işle, silinen dosyaların düğümlerini mevcut grafdan çıkar ve sonucu mevcut graphify-out/graph.json ile birleştir; ardından clustering ve GRAPH_REPORT.md'yi tazele. Bana hiçbir şey sorma, onay bekleme — doğrudan yap. Bittiğinde tek satırla kaç node ve kaç community olduğunu söyle.`
    : `graphify skill'ini (Skill tool, skill adı "graphify") geçerli çalışma dizinindeki ./raw klasörü üzerinde çalıştır ve bilgi grafını kur. Tam pipeline'ı uygula: detect → extract → cluster → report → graph.json + GRAPH_REPORT.md üret. Çıktılar graphify-out/ altına yazılmalı. Bana hiçbir şey sorma, onay bekleme — doğrudan kur. Bittiğinde tek satırla kaç node ve kaç community oluştuğunu söyle.`

  streamClaudeToSSE(res, [
    '--print', '--output-format=stream-json', '--verbose',
    '--model', cliModel(model),
    '--exclude-dynamic-system-prompt-sections',   // Faz 2 İş 2.1
    ...mcpArgs('roomchat'),
    '--dangerously-skip-permissions',
    prompt,
  ], {
    cwd: dir,
    usageType: 'roomchat-graph',
    onEvent: (ev) => {
      if (ev.type === 'result') {
        const cur = parseSessionContent(media.content)
        const status = roomGraphStatus(roomId)
        prisma.media.update({
          where: { id: media.id },
          data: { content: formatSessionContent({ ...cur, graphBuiltAt: new Date().toISOString(), nodeCount: status.nodeCount }) },
        }).catch(err => console.error('[roomchat] graf kaydı hatası:', err.message))
        // Graf tazelendi → kalıcı oturumu düşür ki sonraki mesaj yeni sys'i kursun.
        sessionPool.evict(`roomchat:${media.id}`)
      }
    },
  })
})

// roomchat mesajı — odanın grafı + ham metni system prompt'a enjekte edilir
app.post('/api/roomchat/message', async (req, res) => {
  const { mediaId, message } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'Mesaj gerekli' })

  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(mediaId) } }) } catch {}
  if (!media || media.type !== 'roomchat') return res.status(404).json({ error: 'Oda sohbeti bulunamadı' })

  const settings = parseSessionContent(media.content)
  const roomId = media.roomId
  const key = `roomchat:${mediaId}`

  // Dinamik sys (oda grafı + korpus) yalnızca havuzda canlı oturum yokken kurulur;
  // spawn anında sabitlenir. Oda içeriği değişince rebuild endpoint'i evict eder →
  // sonraki mesaj sys'i tazeler. Sıcak oturumda gereksiz DB/dosya okuması yapılmaz.
  let sys
  if (!sessionPool.get(key)) {
    const dir = roomGraphDir(roomId)
    sys = `Sen bu sanal odanın asistanısın. Yalnızca bu odadaki metin ve canvas yazılarından oluşturulan bilgiyle konuş. Genel bilgini yalnızca odanın içeriğinde cevap yoksa kullan ve bunu açıkça belirt. Cevaplarını Türkçe ver, kısa ve net ol.`
    const reportPath = path.join(dir, 'graphify-out', 'GRAPH_REPORT.md')
    if (fs.existsSync(reportPath)) {
      try {
        let report = fs.readFileSync(reportPath, 'utf8')
        // Sistem prompt'u token tasarrufu için ilk 1K char'la sınırla (oda grafı)
        if (report.length > 1000) report = report.slice(0, 1000) + '\n…'
        sys += `\n\n# Oda Grafı\n${report}`
      } catch {}
    }
    const docs = await extractRoomTexts(roomId)
    // Oda içeriğini 8K char'la sınırla (cache warm için)
    if (docs.length) sys += `\n\n# Oda İçeriği\n${roomCorpusText(docs, 8000)}`
    const graphJson = path.join(dir, 'graphify-out', 'graph.json')
    if (fs.existsSync(graphJson)) {
      sys += `\n\nDaha derin ilişkiler için odanın grafı: ${graphJson} — gerekirse \`graphify query "<soru>"\` çalıştırabilirsin.`
    }
  }

  // Token estimate: sistem prompt uzunluğu (rough: 1 token ≈ 4 char)
  const sysTokenEstimate = Math.ceil((sys?.length || 0) / 4)
  console.log(`[roomchat] spawn: sys≈${sysTokenEstimate}tok`)

  // Faz 2 İş 2.4: roomchat kod yazmaz — oda içeriği üzerine sohbet + graphify query
  // (Bash). Yazma tool'larının tanım yükü her cacheWrite'ta ödeniyordu; kes.
  const sess = ensureSessionOr429(res, key, { settings, cwd: process.cwd(), sys, tools: 'Read,Glob,Grep,Bash' })
  if (!sess) return
  sess.send(res, message.trim(), {
    onInit: (sessionId) => {
      prisma.media.update({
        where: { id: BigInt(mediaId) },
        data: { content: formatSessionContent({ ...settings, sessionId }) },
      }).catch(err => console.error('[roomchat] kayıt hatası:', err.message))
    },
  })
})

// roomchat mesajını raw/ klasöre kaydet
app.post('/api/roomchat/export', async (req, res) => {
  const { mediaId, content, slug, role } = req.body
  if (!content?.trim()) return res.status(400).json({ error: 'İçerik gerekli' })

  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(mediaId) } }) } catch {}
  if (!media || media.type !== 'roomchat') return res.status(404).json({ error: 'Oda sohbeti bulunamadı' })

  try {
    const roomId = media.roomId
    const dir = roomGraphDir(roomId)
    // graphify ./raw üzerinde çalışır; export'lar da grafa dahil olsun diye buraya
    // yazılır. chat- prefix'i writeRoomRaw'ın tile tazelemesinde bu dosyaları korur.
    const rawDir = path.join(dir, 'raw')
    fs.mkdirSync(rawDir, { recursive: true })

    const now = new Date()
    const timestamp = now.toISOString().slice(0, 19).replace(/[-:]/g, '').slice(2, 8) + '_' + String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0')
    const filename = `chat-${slug}_${timestamp}.md`
    const filepath = path.join(rawDir, filename)

    const header = `# ${role} — ${slug}\n\n`
    const fullContent = header + content
    fs.writeFileSync(filepath, fullContent, 'utf8')

    res.json({ success: true, filename })
  } catch (err) {
    console.error('[roomchat export] hatası:', err.message)
    res.status(500).json({ error: 'Kayıt hatası' })
  }
})

// Not: Eski /api/defter/export (timestamp'li tek dosya yazan) kaldırıldı. Defter
// bloklarının raw/ izdüşümü artık tamamen bildirimseldir: bir blok "Kaydet"lenince
// istemci saved=true'yu PUT /api/media/:id ile içeriğe yazar, server de içerikteki
// saved bloklardan raw/'u deterministik olarak yeniden izdüşürür (syncRoomDefterRaw).
// Böylece tek yazım yolu vardır → duplicate ve saved-kaybı yarışları ortadan kalkar.

// ─── Room Session endpoints (izole proje klasöründe çalışan AI session) ──────

app.post('/api/roomsession', async (req, res) => {
  const { tileId, width, height, position, rotation, model, effort, permissionMode, loop } = req.body;
  const id = BigInt(Date.now());
  try {
    const pos = JSON.parse(position);
    const rot = JSON.parse(rotation);
    const media = await prisma.media.create({
      data: {
        id,
        roomId: activeRoomId,
        tileId: String(tileId),
        type: 'roomsession',
        width: parseFloat(width) || 6,
        height: parseFloat(height) || 4,
        posX: parseFloat(pos[0]) || 0,
        posY: parseFloat(pos[1]) || 0,
        posZ: parseFloat(pos[2]) || 0,
        rotX: parseFloat(rot[0]) || 0,
        rotY: parseFloat(rot[1]) || 0,
        rotZ: parseFloat(rot[2]) || 0,
        rotOrder: String(rot[3] || 'XYZ'),
        content: formatSessionContent({ model: model || 'claude-fable-5', effort: effort || 'normal', permissionMode: permissionMode || 'bypassPermissions', ...(loop && loop.goal ? { loop } : {}) }),
      },
    });
    // Odanın izole proje klasörünü oluştur
    try { fs.mkdirSync(roomProjectDir(activeRoomId), { recursive: true }) } catch {}
    res.json(serializeMedia(media));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// roomsession geçmişi + ayarları (JSONL proje klasörünün cwd-key'i altından okunur)
app.get('/api/roomsession/:mediaId/history', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'roomsession') {
      return res.status(404).json({ error: 'Oda projesi bulunamadı' })
    }
    const { sessionId, model, effort, permissionMode, loop } = parseSessionContent(media.content)
    if (!sessionId) return res.json({ sessionId: null, messages: [], model, effort, permissionMode, loop: loop || null })

    const jsonlPath = path.join(roomProjectJsonlDir(media.roomId), `${sessionId}.jsonl`)
    if (!fs.existsSync(jsonlPath)) return res.json({ sessionId, messages: [], model, effort, permissionMode, loop: loop || null })

    const content = fs.readFileSync(jsonlPath, 'utf8')
    res.json({ sessionId, messages: parseLiveMessages(content), model, effort, permissionMode, loop: loop || null })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// model/effort/izin ayarlarını güncelle (sohbeti bozmadan)
app.patch('/api/roomsession/:mediaId/settings', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'roomsession') return res.status(404).json({ error: 'Oda projesi bulunamadı' })
    const current = parseSessionContent(media.content)
    const updated = { ...current, ...req.body }
    await prisma.media.update({
      where: { id: BigInt(req.params.mediaId) },
      data: { content: formatSessionContent(updated) },
    })
    sessionPool.get(`roomsession:${req.params.mediaId}`)?.applySettings(req.body)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/roomsession/message', async (req, res) => {
  const { mediaId, message } = req.body;
  if (!message?.trim()) return res.status(400).json({ error: 'Mesaj gerekli' });

  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(mediaId) } }) } catch {}
  if (!media || media.type !== 'roomsession') return res.status(404).json({ error: 'Oda projesi bulunamadı' })

  const settings = parseSessionContent(media.content)
  const dir = roomProjectDir(media.roomId)
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  const key = `roomsession:${mediaId}`

  // sys statik (yalnızca çalışma klasörü yönergesi) — ilk spawn'da sabitlenir.
  let sys
  if (!sessionPool.get(key)) {
    sys = `Sen bu sanal odanın proje geliştiricisisin. Çalışma alanın geçerli klasör (${dir}). Tüm dosyaları bu klasör içinde oluştur ve düzenle; bu klasörün dışına çıkma. Web projeleri (ör. Next.js) burada kurulabilir ve geliştirilebilir.`
  }

  const sess = ensureSessionOr429(res, key, { settings, cwd: dir, sys })
  if (!sess) return
  sess.send(res, message.trim(), {
    onInit: (sessionId) => {
      prisma.media.update({
        where: { id: BigInt(mediaId) },
        data: { content: formatSessionContent({ ...settings, sessionId }) },
      }).catch(err => console.error('[roomsession] kayıt hatası:', err.message))
    },
  })
});

// Odanın proje klasörüne dosya/klasör yükle. Dosyalar 'files' alanında gelir;
// 'paths' alanı (JSON dizisi) her dosyanın göreli yolunu taşır (klasör yüklemede
// webkitRelativePath korunur). 'subdir' opsiyonel hedef alt klasördür.
app.post('/api/roomsession/:mediaId/upload', roomFileUpload.array('files'), async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'roomsession') return res.status(404).json({ error: 'Oda projesi bulunamadı' })

    const files = req.files || []
    if (!files.length) return res.status(400).json({ error: 'Dosya seçilmedi' })

    let relPaths = []
    try { relPaths = JSON.parse(req.body.paths || '[]') } catch {}

    const baseDir = roomProjectDir(media.roomId)
    try { fs.mkdirSync(baseDir, { recursive: true }) } catch {}
    const baseResolved = path.resolve(baseDir)

    // Hedef alt klasör (path traversal'a karşı temizle)
    const cleanSeg = (s) => String(s || '').replace(/\\/g, '/').split('/')
      .filter(seg => seg && seg !== '..' && seg !== '.').join('/')
    const subdir = cleanSeg(req.body.subdir)

    const written = []
    for (let i = 0; i < files.length; i++) {
      const f = files[i]
      const rel = cleanSeg(relPaths[i] || f.originalname)
      if (!rel) continue
      const dest = path.resolve(baseResolved, subdir, rel)
      // baseDir dışına yazmayı engelle
      if (dest !== baseResolved && !dest.startsWith(baseResolved + path.sep)) continue
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.writeFileSync(dest, f.buffer)
      written.push(path.relative(baseResolved, dest))
    }

    res.json({ ok: true, count: written.length, files: written })
  } catch (err) {
    console.error('[roomsession/upload] error:', err.message)
    res.status(500).json({ error: err.message })
  }
});

// ─── LoopFlow + Recall (roomsession tile için otonom loop motoru) ────────────
// LoopFlow: bir görevi Trigger + Verifiable Goal + Subagent ile çerçeveler ve
// hedef doğrulanana (veya max iterasyona) kadar Claude'u otonom çağırır.
// Recall: her iterasyondan sonra ilerlemeyi diske checkpoint'ler; loop kesilse
// (internet/Claude/tarayıcı kapansa) yeni başlatmada kaldığı yerden devam eder.
// Hem yapısal checkpoint dosyası (.recall/) hem mevcut --resume konuşma geçmişi.

function recallDir(roomId) { return path.join(roomProjectDir(roomId), '.recall') }
function recallPath(roomId, mediaId) { return path.join(recallDir(roomId), `${mediaId}.json`) }

function readRecall(roomId, mediaId) {
  try { return JSON.parse(fs.readFileSync(recallPath(roomId, mediaId), 'utf8')) } catch { return null }
}

// Atomik yaz (temp + rename) → loop çökse bile yarım/bozuk checkpoint kalmaz.
function writeRecall(roomId, mediaId, data) {
  try { fs.mkdirSync(recallDir(roomId), { recursive: true }) } catch {}
  const p = recallPath(roomId, mediaId)
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2))
  fs.renameSync(tmp, p)
}

// ─── Standalone ai-session recall (hafif "kaldığın yer" checkpoint'i) ─────────
// Loop'tan bağımsız, normal session tile'ları için. roomsession'ın room-projects
// altındaki recall'ından ayrı: cwd'nin .recall klasörüne mediaId bazlı yazılır.
function sessionRecallDir() { return path.join(PROJECT_DIR, '.recall') }
function sessionRecallPath(mediaId) { return path.join(sessionRecallDir(), `${mediaId}.json`) }

function readSessionRecall(mediaId) {
  try { return JSON.parse(fs.readFileSync(sessionRecallPath(mediaId), 'utf8')) } catch { return null }
}

function writeSessionRecall(mediaId, data) {
  try { fs.mkdirSync(sessionRecallDir(), { recursive: true }) } catch {}
  const p = sessionRecallPath(mediaId)
  const tmp = `${p}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }, null, 2))
  fs.renameSync(tmp, p)
}

// Standalone recall checkpoint'ini sil (sohbet temizlenince / tile silinince).
function removeSessionRecall(mediaId) {
  try { fs.unlinkSync(sessionRecallPath(mediaId)) } catch {}
}

// Tek-atış Claude çağrısı; SSE'ye yazmaz, sonucu Promise ile döndürür:
// { text, failed, usage }. `failed` = API-düzeyi hata mesajı (limit/auth/çökme).
// '<synthetic>' modelli assistant, CLI'ın API hatasını metin olarak basmasıdır
// (ör. "You've hit your session limit") — gerçek model yanıtı DEĞİLDİR; bunu
// normal çıktı sanmak loop'un hata üstüne iterasyon yakmasına yol açar.
function runClaudeCapture(args, { cwd, usageType, envOverrides } = {}) {
  return new Promise((resolve) => {
    let buf = '', text = '', failed = null, usage = null
    let proc
    try { proc = spawn(CLAUDE_CLI, args, { cwd: cwd || process.cwd(), env: buildSpawnEnv(envOverrides || {}) }) }
    catch (e) { return resolve({ text: '', failed: e.message, usage: null }) }
    proc.stdout.on('data', (c) => {
      buf += c.toString()
      const lines = buf.split('\n'); buf = lines.pop() ?? ''
      for (const line of lines) {
        if (!line.trim()) continue
        let ev
        try { ev = JSON.parse(line) } catch { continue }
        if (ev.type === 'assistant' && ev.message?.model === '<synthetic>') {
          const t = (ev.message.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ')
          failed = t || 'API hatası (synthetic yanıt)'
        }
        if (ev.type === 'result') {
          if (typeof ev.result === 'string') text = ev.result
          if (ev.usage) usage = ev.usage
          if (ev.is_error || (ev.subtype && ev.subtype !== 'success')) {
            failed = failed || (text ? text.slice(0, 200) : `sonuç hatası (${ev.subtype || 'bilinmiyor'})`)
          }
        }
      }
    })
    proc.stderr.on('data', (c) => console.error('[loop-verify stderr]', c.toString().slice(0, 200)))
    proc.on('close', () => {
      recordGlobalUsage(usageType, usage)
      logTurnUsage({ tile: usageType, key: usageType, turn: 1, model: cliArgValue(args, '--model'), usage })
      resolve({ text, failed, usage })
    })
    proc.on('error', (e) => resolve({ text: '', failed: e.message, usage: null }))
  })
}

// Kümülatif token muhasebesi: her turun/spawn'ın usage'ını recall'a işler.
// Amaç görünürlük (UI'da tüketim) + bütçe freni (MultiAgentRunner).
function addUsage(rec, u) {
  if (!u) return
  const t = rec.usage || (rec.usage = { calls: 0, input: 0, cacheWrite: 0, cacheRead: 0, output: 0, processedTotal: 0 })
  t.calls += 1
  t.input += u.input_tokens || 0
  t.cacheWrite += u.cache_creation_input_tokens || 0
  t.cacheRead += u.cache_read_input_tokens || 0
  t.output += u.output_tokens || 0
  // İşlenen toplam: oturum penceresini tüketen asıl büyüklük (faz1 İş 1.2).
  t.processedTotal = (t.processedTotal || 0) + (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0)
    + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0)
}

// Verifier çıktısını güvenli parse et: JSON bulunamazsa met:false (güvenli taraf).
function parseVerdict(text) {
  const m = (text || '').match(/\{[\s\S]*\}/)
  if (m) {
    try {
      const j = JSON.parse(m[0])
      return { met: !!j.met, reason: String(j.reason || ''), remaining: Array.isArray(j.remaining) ? j.remaining.map(String) : [] }
    } catch {}
  }
  return { met: false, reason: (text || '').slice(0, 300) || 'doğrulama çıktısı boş', remaining: [] }
}

// Doğrulanabilir hedefi kontrol eden ayrı (ucuz) Claude ajanı.
// --max-turns tavanı: dosya okuma sarmalını sınırlar (token freni).
// Doğrulama "dosyalara bak, tek satır JSON döndür" işi — pahalı tile modeliyle
// koşturmak israf; her yerde haiku'ya sabit.
const VERIFY_MODEL = 'claude-haiku-4-5-20251001'
async function verifyGoal({ goal, dir, model }) {
  const vModel = cliModel(model || VERIFY_MODEL)
  const prompt = `Sen bir doğrulama ajanısın. Aşağıdaki hedefin ŞU AN karşılanıp karşılanmadığını değerlendir.\n\n## Hedef\n${goal}\n\n## Proje klasörü\n${dir}\nKlasördeki dosyaları oku/incele. node_modules, dist, .git gibi bağımlılık/üretim klasörlerini İNCELEME. Sadece gerçekten doğrulayabildiğini "met:true" say.\n\nSADECE tek satır JSON döndür, başka hiçbir şey yazma:\n{"met": true|false, "reason": "kısa gerekçe", "remaining": ["kalan iş", ...]}`
  const { text, failed, usage } = await runClaudeCapture([
    '--print', '--output-format=stream-json', '--verbose', '--max-turns', '12',
    // Doğrulayıcı salt-okur (+ test koşturabilsin diye Bash): tool tanım yükü ve
    // yanlışlıkla dosya değiştirme riski birlikte iner (plan.md P2-B).
    '--tools', 'Read,Glob,Grep,Bash',
    '--exclude-dynamic-system-prompt-sections',   // Faz 2 İş 2.1: prefix sabit → spawn'lar arası cache-hit
    '--model', vModel, ...mcpArgs('verify'), '--dangerously-skip-permissions', prompt,
  ], { cwd: dir, usageType: 'verify', envOverrides: { FORCE_PROMPT_CACHING_5M: '1' } })
  // API-düzeyi hata veya boş çıktı: "hedef karşılanmadı" DEĞİL, altyapı arızası.
  // error:true dönen verdict loop'u iterasyon yakmadan durdurur (matbaa vakası:
  // limit dolunca 8 iterasyon boşa dönmüştü).
  if (failed || !text.trim()) {
    return { met: false, reason: failed || 'doğrulayıcı boş yanıt verdi', remaining: [], error: true, usage }
  }
  return { ...parseVerdict(text), usage }
}

// İş turunu mevcut roomsession PersistentSession'ı üzerinden sürmek için proxy sink.
// PersistentSession'ın `res` arayüzünü taklit eder ama end()'te bağlantıyı KAPATMAZ;
// tur olaylarını loop'un canlı client sink'ine forward eder, turun bitişini Promise ile bildirir.
function makeTurnSink(getClientSink) {
  let resolveDone
  const done = new Promise((r) => { resolveDone = r })
  let summary = ''
  let failure = null   // API-düzeyi hata (limit vb.) — tur "başarılı" sayılmamalı
  let usage = null     // turun result olayındaki token kullanımı (muhasebe için)
  const sink = {
    setHeader() {}, flushHeaders() {},
    write(chunk) {
      const s = String(chunk)
      if (s.includes('"type":"done"')) return true   // tur bitiş işareti — client'a iletme
      try {
        if (s.startsWith('data: ')) {
          const ev = JSON.parse(s.slice(6))
          if (ev.type === 'assistant') {
            const t = (ev.message?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ')
            if (ev.message?.model === '<synthetic>') failure = t || 'API hatası (synthetic yanıt)'
            else if (t) summary = t
          }
          if (ev.type === 'result') {
            if (ev.usage) usage = ev.usage
            if (ev.is_error || (ev.subtype && ev.subtype !== 'success')) {
              failure = failure || String(ev.result || ev.subtype || 'bilinmeyen tur hatası').slice(0, 200)
            }
          }
        }
      } catch {}
      const cs = getClientSink()
      if (cs) { try { cs.write(chunk) } catch {} }
      return true
    },
    end() { resolveDone() },
    on() {},
  }
  return { sink, done: done.then(() => ({ summary, failure, usage })) }
}

// Tek mediaId için tekil otonom loop sürücüsü (PersistentSession desenine analog).
class LoopRunner {
  constructor({ mediaId, roomId, dir, spec, settings }) {
    this.mediaId = String(mediaId)
    this.roomId = roomId
    this.dir = dir
    this.spec = spec
    this.settings = settings
    this.clientSink = null
    this.running = false
    this.aborted = false
  }

  attach(res) {
    setSSEHeaders(res)
    this.clientSink = res
    res.on('close', () => { if (this.clientSink === res) this.clientSink = null })
    const rec = readRecall(this.roomId, this.mediaId)
    this._emit({ type: 'loop_state', recall: rec || null, running: this.running })
  }

  _emit(obj) { if (this.clientSink) { try { this.clientSink.write(sseLine(obj)) } catch {} } }
  _sessionId() { return sessionPool.get(`roomsession:${this.mediaId}`)?.sessionId || null }
  abort() { this.aborted = true }

  async start() {
    if (this.running) { this._emit({ type: 'loop_state', recall: readRecall(this.roomId, this.mediaId), running: true }); return }
    this.running = true
    this.aborted = false

    // Recall: varsa kaldığı yerden devam, yoksa sıfırdan.
    let rec = readRecall(this.roomId, this.mediaId) || {
      mediaId: this.mediaId, goal: this.spec.goal, maxIterations: this.spec.maxIterations || 8,
      iteration: 0, status: 'running', sessionId: this.settings.sessionId || null,
      done: [], remaining: [], currentStep: '', lastCheck: null, history: [],
      startedAt: new Date().toISOString(),
    }
    // Hedef değiştiyse checkpoint'i sıfırla (yeni görev → sıfırdan).
    if (rec.goal !== this.spec.goal) {
      rec = { ...rec, goal: this.spec.goal, iteration: 0, status: 'running', done: [], remaining: [], currentStep: '', lastCheck: null, history: [], startedAt: new Date().toISOString() }
    }
    // Zaten karşılanmışsa ve hedef aynıysa boş yere iterasyon harcama — sadece durumu bildir.
    if (rec.status === 'met' && rec.iteration > 0) {
      this.running = false
      this._emit({ type: 'loop_done', recall: rec })
      if (this.clientSink) { try { this.clientSink.write('data: {"type":"done"}\n\n'); this.clientSink.end() } catch {} }
      this.clientSink = null
      return
    }
    rec.status = 'running'
    rec.maxIterations = this.spec.maxIterations || 8
    writeRecall(this.roomId, this.mediaId, rec)
    this._emit({ type: 'loop_started', recall: rec })

    try {
      while (rec.iteration < rec.maxIterations && !this.aborted) {
        this._emit({ type: 'loop_working', iteration: rec.iteration + 1, maxIterations: rec.maxIterations })
        const turnText = await this._workTurn(rec)
        if (this.aborted) break

        this._emit({ type: 'loop_verifying', iteration: rec.iteration + 1 })
        const verdict = await this._verifyTurn(rec)
        // Altyapı arızası (limit/çökme): iterasyon yakmadan dur — recall korunur,
        // limit yenilenince aynı yerden devam edilir.
        if (verdict.error) throw new Error(`Doğrulayıcı çalıştırılamadı: ${verdict.reason}`)

        rec.iteration += 1
        rec.currentStep = (turnText || '').slice(0, 200)
        rec.lastCheck = verdict
        rec.remaining = verdict.remaining || []
        rec.history.push({ iter: rec.iteration, summary: (turnText || '').slice(0, 300), check: verdict })
        rec.sessionId = this._sessionId() || rec.sessionId
        if (verdict.met) rec.status = 'met'
        else if (rec.iteration >= rec.maxIterations) rec.status = 'maxed'
        writeRecall(this.roomId, this.mediaId, rec)   // her iterasyondan SONRA → çökme-dayanıklı
        this._emit({ type: 'loop_iteration', recall: rec })
        if (verdict.met) break
      }
      if (this.aborted && rec.status === 'running') { rec.status = 'stopped'; writeRecall(this.roomId, this.mediaId, rec) }
    } catch (e) {
      rec.status = 'error'; rec.lastError = e.message
      writeRecall(this.roomId, this.mediaId, rec)
      this._emit({ type: 'error', message: e.message })
    } finally {
      this.running = false
      this._emit({ type: 'loop_done', recall: rec })
      if (this.clientSink) { try { this.clientSink.write('data: {"type":"done"}\n\n'); this.clientSink.end() } catch {} }
      this.clientSink = null
    }
  }

  // Doğrulama turu — subclass, gereksiz spawn'ı atlamak için override edebilir.
  async _verifyTurn(rec) {
    const verdict = await verifyGoal({ goal: this.spec.goal, dir: this.dir, model: VERIFY_MODEL })
    addUsage(rec, verdict.usage)
    return verdict
  }

  async _workTurn(rec) {
    const key = `roomsession:${this.mediaId}`
    let sys
    if (!sessionPool.get(key)) {
      sys = `Sen bu sanal odanın proje geliştiricisisin. Çalışma alanın geçerli klasör (${this.dir}). Tüm dosyaları bu klasör içinde oluştur ve düzenle; bu klasörün dışına çıkma. Web projeleri burada kurulabilir ve geliştirilebilir.`
    }
    const sess = sessionPool.ensure(key, { settings: this.settings, cwd: this.dir, sys })
    const respawns0 = sess.respawns   // koşu-başı respawn muhasebesi (faz1 İş 1.4)
    const { sink, done } = makeTurnSink(() => this.clientSink)
    sess.send(sink, this._workPrompt(rec), {
      onInit: (sessionId) => {
        prisma.media.update({
          where: { id: BigInt(this.mediaId) },
          data: { content: formatSessionContent({ ...this.settings, sessionId, loop: this.spec }) },
        }).catch((err) => console.error('[loop] sessionId kayıt hatası:', err.message))
      },
    })
    const turn = await done
    addUsage(rec, turn.usage)
    rec.respawns = (rec.respawns || 0) + Math.max(0, sess.respawns - respawns0)
    if (turn.failure) throw new Error(`İş turu başarısız: ${turn.failure}`)
    return turn.summary
  }

  _workPrompt(rec) {
    const n = rec.iteration + 1
    let p = `# LoopFlow — otonom görev (iterasyon ${n}/${rec.maxIterations})\n\n## Doğrulanabilir hedef\n${this.spec.goal}\n`
    if (this.spec.subagents && this.spec.subagents.trim()) p += `\n## Çalışma yönergesi / alt-roller\n${this.spec.subagents}\n`
    if (rec.lastCheck) {
      p += `\n## Önceki doğrulama (iterasyon ${rec.iteration})\nKarşılandı: ${rec.lastCheck.met ? 'evet' : 'HAYIR'}\nGerekçe: ${rec.lastCheck.reason}\n`
      if (rec.lastCheck.remaining && rec.lastCheck.remaining.length) {
        p += `Kalan işler:\n${rec.lastCheck.remaining.map((r) => `- ${r}`).join('\n')}\n`
      }
    }
    p += `\nBu iterasyonda hedefe yaklaşmak için somut ve eksiksiz çalışma yap; dosyaları doğrudan oluştur/düzenle. Açıklama değil çalışan sonuç üret. Bittiğinde kısaca ne yaptığını özetle.`
    return p
  }
}

const loopPool = new Map()
const MAX_ACTIVE_LOOPS = 2   // eşzamanlı otonom loop tavanı (SessionPool çekişmesi + maliyet koruması)

function activeLoopCount() {
  let n = 0
  for (const r of loopPool.values()) if (r.running) n++
  return n
}

// Loop başlat (SSE) — Recall varsa kaldığı yerden devam eder.
app.post('/api/roomsession/:mediaId/loop/start', async (req, res) => {
  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } }) } catch {}
  if (!media || media.type !== 'roomsession') return res.status(404).json({ error: 'Oda projesi bulunamadı' })

  const settings = parseSessionContent(media.content)
  const spec = settings.loop
  if (!spec || !spec.goal || !spec.goal.trim()) {
    return res.status(400).json({ error: 'Bu tile için LoopFlow hedefi tanımlı değil.' })
  }

  // Eşzamanlı-loop koruması: kendi runner'ı zaten çalışmıyorsa ve tavan doluysa reddet
  // (Claude spawn edilmeden, SSE'den önce — frontend bunu temiz hata olarak gösterir).
  let runner = loopPool.get(String(req.params.mediaId))
  if ((!runner || !runner.running) && activeLoopCount() >= MAX_ACTIVE_LOOPS) {
    return res.status(429).json({ error: `Aynı anda en fazla ${MAX_ACTIVE_LOOPS} loop çalışabilir. Önce çalışan bir loop'u durdur.` })
  }

  const dir = roomProjectDir(media.roomId)
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}

  if (!runner) {
    runner = new LoopRunner({ mediaId: req.params.mediaId, roomId: media.roomId, dir, spec, settings })
    loopPool.set(String(req.params.mediaId), runner)
  } else {
    runner.spec = spec; runner.settings = settings
  }
  runner.attach(res)
  if (!runner.running) runner.start()   // await edilmez — sink üzerinden akar
})

// Tüm odalardaki çalışan loop'lar — global gösterge bunu poller.
app.get('/api/loops/active', (req, res) => {
  const loops = []
  for (const r of loopPool.values()) {
    if (!r.running) continue
    const rec = readRecall(r.roomId, r.mediaId) || {}
    loops.push({
      mediaId: r.mediaId,
      roomId: r.roomId,
      goal: r.spec?.goal || rec.goal || '',
      iteration: rec.iteration || 0,
      maxIterations: rec.maxIterations || r.spec?.maxIterations || 0,
      status: rec.status || 'running',
    })
  }
  res.json({ count: loops.length, max: MAX_ACTIVE_LOOPS, loops })
})

// Loop durdur — mevcut tur kibarca biter, döngü kırılır.
app.post('/api/roomsession/:mediaId/loop/stop', async (req, res) => {
  const runner = loopPool.get(String(req.params.mediaId))
  if (runner) runner.abort()
  res.json({ ok: true })
})

// Loop durumu — reconnect'te UI'yı kurmak için Recall checkpoint + running.
app.get('/api/roomsession/:mediaId/loop/status', async (req, res) => {
  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } }) } catch {}
  if (!media || media.type !== 'roomsession') return res.status(404).json({ error: 'Oda projesi bulunamadı' })
  const recall = readRecall(media.roomId, req.params.mediaId)
  const runner = loopPool.get(String(req.params.mediaId))
  res.json({ recall: recall || null, running: !!(runner && runner.running) })
})

// ─── MultiAgent tile (fikir → mimar → orkestratör + worker ekibi → otonom proje) ──
// Kullanıcı bir proje fikri yazar; Architect (opus, tek sefer) stack + ekip + görev
// manifesti üretir. Loop başlayınca her iterasyonda tek-atış Orchestrator (sonnet,
// ucuz) sıradaki görevi ve rolü seçer; ilgili worker kendi izole PersistentSession'ında
// (multiagent:<mediaId>:<rol>) görevi yapar; bağımsız verifier (haiku) hedefi denetler.
// Mevcut LoopRunner motoru (recall + SSE + verify) subclass ile genişletilir.
// Agent profilleri repo içi .claude/agents/ altından okunur; runtime'da kurulum yok —
// eksik profil loop başlamadan hata döner (güvenlik + öngörülebilirlik).

const AGENTS_DIR = path.join(__dirname, '.claude', 'agents')

// Bütçe freni: bir multiagent projesinin toplam üretim (output) token tavanı.
// Output, hem API maliyetinde hem abonelik limitinde en ağır kalemdir; maxIterations
// bu tavanı aşan tek bir azgın worker'ı durduramaz — bu sabit ikinci sigortadır.
const MA_MAX_OUTPUT_TOKENS = 200_000
// İşlenen TOPLAM token tavanı (input+cacheWrite+cacheRead+output). Kullanıcının
// derdi dolar değil oturum penceresi: cacheRead de pencereyi tüketir (plan.md).
// Referans: düzeltme öncesi basit iş 2.73M yakmıştı; sağlıklı koşu 150-250K bandında.
const MA_MAX_TOTAL_TOKENS = 1_500_000
// Worker'ların built-in tool seti: Task (alt-ajan çarpanı), WebSearch/WebFetch
// (bağlam şişirici) bilinçli olarak dışarıda (plan.md P2-B).
const MA_WORKER_TOOLS = 'Read,Edit,Write,Bash,Glob,Grep'
// Spawn başına sert $ tavanı — tek görev turu bunun çok altında kalır; aşan tur
// kaçaktır ve CLI tarafında kesilir (loop hatayı yakalar, recall korunur).
const MA_WORKER_BUDGET_USD = 1.5

// .claude/agents/<name>.md profilini oku: frontmatter'dan model, gövde system prompt.
// Ad, path traversal'a karşı [a-zA-Z0-9_-] ile sınırlanır.
function readAgentProfile(name) {
  const safe = String(name || '').replace(/[^a-zA-Z0-9_-]/g, '')
  if (!safe) return null
  let raw
  try { raw = fs.readFileSync(path.join(AGENTS_DIR, `${safe}.md`), 'utf8') } catch { return null }
  let body = raw, model = null
  const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (fm) {
    body = raw.slice(fm[0].length)
    const mm = fm[1].match(/^model:\s*(\S+)/m)
    if (mm) model = mm[1]
  }
  body = body.trim()
  return body ? { name: safe, model, body } : null
}

function listAgentProfiles() {
  try { return fs.readdirSync(AGENTS_DIR).filter(f => f.endsWith('.md')).map(f => f.slice(0, -3)) }
  catch { return [] }
}

// Manifest'te referans verilen ama diskte olmayan profiller.
function missingAgentProfiles(manifest) {
  const names = [...new Set((manifest?.team || []).map(t => t.agentProfile))]
  return names.filter(p => !readAgentProfile(p))
}

// Görevlere kararlı, okunur ID ata (ör. BE-01): eşleştirme kırılgan metin yerine ID ile
// yapılır — orkestratör görev metnini yeniden yazarsa yanlış görevin "done" işaretlenip
// iterasyon yakılmasını önler. Eski tile'larda kayıtlı düz string görevler de normalize edilir.
function assignTaskIds(team) {
  const used = new Set()
  for (const t of team) {
    const base = String(t.role || '').replace(/[^a-zA-ZğüşıöçĞÜŞİÖÇ0-9]/g, '').slice(0, 3).toUpperCase() || 'AG'
    let a = base
    for (let k = 2; used.has(a); k++) a = `${base}${k}`
    used.add(a)
    t.tasks = (Array.isArray(t.tasks) ? t.tasks : []).map((x, i) => {
      const id = `${a}-${String(i + 1).padStart(2, '0')}`
      return typeof x === 'string' ? { id, text: x } : { id: String(x?.id || id), text: String(x?.text ?? '').trim() }
    }).filter(x => x.text)
  }
  return team
}

// Architect çıktısından manifesti güvenli parse et; geçersiz/eksikse null (güvenli taraf).
function parseManifest(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/)
  if (!m) return null
  let j
  try { j = JSON.parse(m[0]) } catch { return null }
  if (!j || typeof j.goal !== 'string' || !j.goal.trim() || !Array.isArray(j.team)) return null
  const team = j.team.map(t => ({
    role: String(t?.role || '').trim(),
    agentProfile: String(t?.agentProfile || '').trim(),
    // Model kelepçesi: worker'lar yalnız sonnet/haiku olabilir — mimar yanlışlıkla
    // opus atarsa maliyet patlar (opus ≈ 5x sonnet).
    model: ['sonnet', 'haiku'].includes(String(t?.model || '').trim()) ? String(t.model).trim() : 'sonnet',
    tasks: Array.isArray(t?.tasks) ? t.tasks.map(x => String(x).trim()).filter(Boolean) : [],
  })).filter(t => t.role && t.agentProfile && t.tasks.length)
  if (!team.length) return null
  assignTaskIds(team)   // string[] → {id, text}[] (İş 3: kararlı görev ID'leri)
  // Ölü koşu freni: her görev ~1 iterasyon + review + kurtarma payı. Mimarın verdiği
  // değer bundan küçükse koşu bitiremeden 'maxed' olur ve TÜM token boşa gider.
  // Varsayılan da minIter'dir (eski sabit 8 küçük manifestleri şişiriyordu — plan.md P0-B).
  const taskCount = team.reduce((n, t) => n + t.tasks.length, 0)
  const minIter = taskCount + 3
  return {
    stack: Array.isArray(j.stack) ? j.stack.map(String) : [],
    goal: j.goal.trim(),
    maxIterations: Math.max(minIter, Math.min(20, parseInt(j.maxIterations, 10) || minIter)),
    projectBrief: String(j.projectBrief || '').trim(),
    team,
  }
}

// ── P0-A (plan.md): mimardan ÖNCE deterministik iş-boyutu kapısı ─────────────
// Basit/tek-artifact fikirler multiagent'a hiç girmez: Opus mimar spawn'ı atlanır,
// tek rol + tek görevlik sentetik manifest kurulur → 1 iş turu + 1 Haiku verify.
// Ölçülen gerekçe: aynı tek-sayfa iş multiagent'ta 2.73M, tek turda ~30K token.
// Kalite sıfatları ("awwwards'a layık", "şık") karmaşıklık DEĞİLDİR — routing'i etkilemez.
const IDEA_COMPLEX_RE = /backend|api\b|veri\s*taban|database|sqlite|postgres|prisma|auth|login|üyelik|oturum\s*aç|ödeme|payment|e-?ticaret|e-?commerce|sepet|dashboard|panel|crud|websocket|gerçek\s*zaman|realtime|migration|docker|deploy|çok\s*sayfa|multi-?page|mobil\s*uygulama|react|next\.?js|vue|svelte|express|server|sunucu|oyun|game|3d|three\.?js|test\s*yaz|entegrasyon/i
const IDEA_SIMPLE_RE = /tek\s*(sayfa|dosya)|single\s*page|one-?page|landing|kartvizit|portfoly|portfolio|basit|statik|static|bileşen|component|html\s*site|index\.html/i

function classifyIdeaScale(idea) {
  const t = String(idea || '')
  if (IDEA_COMPLEX_RE.test(t)) return 'team'
  if (IDEA_SIMPLE_RE.test(t)) return 'direct'
  // Sinyalsiz kısa fikir ≈ küçük iş. Yanlış sınıflamada güvenlik ağı: verify
  // "eksik" derse mevcut kurtarma akışı aynı role ek görev atayarak yükseltir.
  return t.length <= 140 ? 'direct' : 'team'
}

// Tek rollük sentetik manifest — mimar (Opus) hiç çağrılmaz. Profil yoksa null
// döner ve akış normal mimar yoluna düşer.
function directManifest(idea) {
  const profileName = ['web-frontend-expert', 'generalist-developer'].find(n => readAgentProfile(n))
  if (!profileName) return null
  const team = [{
    role: 'gelistirici',
    agentProfile: profileName,
    model: 'sonnet',
    tasks: [`Fikri tek seferde, eksiksiz ve çalışır durumda inşa et: ${idea}`],
  }]
  assignTaskIds(team)
  return {
    stack: [],
    goal: `"${idea}" fikri proje klasöründe çalışır durumda: gerekli dosya(lar) mevcut, açıldığında/çalıştırıldığında hata yok ve fikirdeki temel işlevlerin hepsi yerinde.`,
    maxIterations: 4,   // 1 görev + kurtarma payı (review direct'te atlanır)
    projectBrief: String(idea || '').trim(),
    direct: true,
    team,
  }
}

// Manifest güdümlü çok-ajanlı loop: LoopRunner'ın iş turu "orkestratör seçer →
// worker yapar" olarak değişir; verify/recall/SSE mekanikleri aynen miras alınır.
// spec = { goal, maxIterations, manifest }
class MultiAgentRunner extends LoopRunner {
  // Ortak tek oturum yok; rol oturumları rec.agentSessions'ta tutulur.
  _sessionId() { return null }

  // Manifest görev listesini rec.tasks'a tohumla (ilk çalıştırma veya manifest değişimi).
  // Görev/hedef değişince review bayrağı da sıfırlanır; rol oturumları korunur.
  _seedTasks(rec) {
    const manifest = this.spec.manifest
    const mHash = JSON.stringify([manifest.goal, manifest.team.map(t => [t.role, t.tasks.map(x => [x.id, x.text])])])
    rec.agentSessions = rec.agentSessions || {}
    if (rec.manifestHash === mHash && Array.isArray(rec.tasks)) return
    rec.manifestHash = mHash
    rec.tasks = []
    for (const m of manifest.team) for (const t of m.tasks) rec.tasks.push({ id: t.id, role: m.role, task: t.text, status: 'pending' })
    rec.reviewDone = false
    rec.review = null
    rec.activeRole = null
  }

  // Sıradaki görevi seç. TOKEN FRENİ: manifest, mimar tarafından bağımlılık
  // sırasıyla üretilir — bekleyen görev varken LLM'e sormak gereksizdir; ilk
  // bekleyeni doğrudan al (iterasyon başına bir sonnet spawn'ı ≈ 15-25k token
  // tasarrufu; Claude Code system prompt'u her spawn'da yeniden ödenir).
  // LLM orkestratör yalnız kurtarma durumunda çalışır: tüm görevler bitti ama
  // hedef karşılanmadı → verdict'teki kalan işlerden birini uygun role atar.
  async _orchestrate(rec) {
    const manifest = this.spec.manifest
    const pending = rec.tasks.filter(t => t.status === 'pending')
    if (pending.length) return { nextRole: pending[0].role, task: pending[0].task, taskId: pending[0].id }
    const remaining = rec.lastCheck && !rec.lastCheck.met ? (rec.lastCheck.remaining || []) : []
    if (!remaining.length) return null

    const doneList = rec.tasks.filter(t => t.status === 'done').map(t => `- [${t.role}] ${t.task}`).join('\n') || '- (yok)'
    const p = `Sen çok-ajanlı bir yazılım projesinin orkestratörüsün. Tüm planlı görevler bitti ama hedef doğrulanamadı; kalan işlerden TEK birini en uygun role somut görev olarak ata.\n\n## Proje\n${manifest.projectBrief || manifest.goal}\n\n## Ekip rolleri\n${manifest.team.map(m => `- ${m.role}`).join('\n')}\n\n## Tamamlanan görevler\n${doneList}\n\n## Doğrulamada kalan işler\nGerekçe: ${rec.lastCheck.reason}\n${remaining.map(r => `- ${r}`).join('\n')}\n\nSADECE tek satır JSON döndür, başka hiçbir şey yazma:\n{"nextRole": "<rol>", "task": "<somut görev>"}`
    const { text, failed, usage } = await runClaudeCapture([
      '--print', '--output-format=stream-json', '--verbose', '--max-turns', '4',
      '--exclude-dynamic-system-prompt-sections',   // Faz 2 İş 2.1
      '--model', cliModel('sonnet'), ...mcpArgs('orchestrate'), '--dangerously-skip-permissions', p,
    ], { cwd: this.dir, usageType: 'orchestrate', envOverrides: { FORCE_PROMPT_CACHING_5M: '1' } })
    addUsage(rec, usage)
    if (failed) throw new Error(`Orkestratör çalıştırılamadı: ${failed}`)
    const m = (text || '').match(/\{[\s\S]*\}/)
    if (m) {
      try {
        const j = JSON.parse(m[0])
        const role = String(j.nextRole || '').trim(), task = String(j.task || '').trim()
        if (task && manifest.team.some(x => x.role === role)) return { nextRole: role, task }
      } catch {}
    }
    // Bozuk yanıt: ilk kalan işi ilk role ata — loop takılmasın.
    return { nextRole: manifest.team[0].role, task: String(remaining[0]) }
  }

  // Worker turu — STATELESS EPOCH (plan.md P1-B): her GÖREV taze bağlamla başlar.
  // Rol geçmişini görevden göreve --resume etmek cacheRead'i kadratik büyütür
  // (ölçüm: aynı tek-sayfa iş için 2.46M cacheRead). Dosya sistemi zaten doğruluk
  // kaynağı; rolün önceki işleri kısa roleState özeti olarak prompt'a girer.
  // Tek istisna: AYNI görev yarıda kaldıysa (çökme/limit) o görevin oturumuna
  // --resume edilir — çökme dayanıklılığı korunur.
  async _workerTurn(rec, member, task, iterNo, taskId = null) {
    const manifest = this.spec.manifest
    const profile = readAgentProfile(member.agentProfile)
    if (!profile) throw new Error(`Agent profili eksik: ${member.agentProfile}`)
    const key = `multiagent:${this.mediaId}:${member.role}`

    rec.agentTaskInProgress = rec.agentTaskInProgress || {}
    const taskKey = taskId || String(task).slice(0, 80)   // kurtarma görevleri ID'siz olabilir
    const resumeSameTask = rec.agentTaskInProgress[member.role] === taskKey
    if (!resumeSameTask) {
      sessionPool.evict(key)                    // sıcak süreç varsa geçmişiyle birlikte kapat
      rec.agentSessions[member.role] = null     // yeni epoch: --resume edilmesin
      rec.agentTaskInProgress[member.role] = taskKey
      writeRecall(this.roomId, this.mediaId, rec)
    }

    let sys
    if (!sessionPool.get(key)) {
      sys = `${profile.body}\n\nProje özeti: ${manifest.projectBrief || manifest.goal}\nÇalışma klasörün: ${this.dir}. Tüm dosyaları bu klasörün içinde oluştur ve düzenle; dışına çıkma.`
    }
    const settings = {
      sessionId: rec.agentSessions[member.role] || null,
      model: member.model || profile.model || 'sonnet',
      effort: 'normal', permissionMode: 'bypassPermissions',
    }
    // maxTurns: normal işi kesmeyecek kadar cömert, patolojik döngüyü (aynı dosyayı
    // defalarca baştan yazma) durduracak mekanik tavan — yalnız multiagent worker'da.
    // tools/maxBudgetUsd: plan.md P2 — tool tanım yükü ve kaçak koşu sigortası.
    const sess = sessionPool.ensure(key, {
      settings, cwd: this.dir, sys,
      maxTurns: manifest.direct ? 20 : 30,
      // Rol bazlı tool seti (Faz 2 İş 2.4): review gibi dar roller member.tools ile
      // daha da kısılır; varsayılan worker seti MA_WORKER_TOOLS.
      tools: member.tools || MA_WORKER_TOOLS,
      maxBudgetUsd: MA_WORKER_BUDGET_USD,
    })
    const respawns0 = sess.respawns   // koşu-başı respawn muhasebesi (faz1 İş 1.4)
    const { sink, done } = makeTurnSink(() => this.clientSink)
    let p = `# Görev (iterasyon ${iterNo}/${rec.maxIterations})\nRolün: ${member.role}\nGörev: ${task}\n`
    // roleState: taze bağlama rolün tamamlanan işlerinin kısa özeti (dosyalar diskte).
    const doneByRole = rec.tasks.filter(t => t.role === member.role && t.status === 'done')
    if (doneByRole.length) {
      p += `\nBu rolün önceki görevleri (TAMAMLANDI — çıktıları çalışma klasöründe):\n${doneByRole.map(t => `- ${t.task}`).join('\n')}\nİşin, diskteki bu mevcut durumun devamıdır; önce ilgili dosyalara bak.\n`
    }
    if (rec.lastCheck && !rec.lastCheck.met && rec.lastCheck.remaining?.length) {
      p += `\nSon doğrulamada eksik bulunanlar:\n${rec.lastCheck.remaining.map(r => `- ${r}`).join('\n')}\n`
    }
    p += `\nOtonom çalış: soru sorma, onay bekleme, AskUserQuestion/ExitPlanMode kullanma. Dosyaları doğrudan oluştur/düzenle; açıklama değil çalışan sonuç üret.`
    // Token disiplini: output token en pahalı kalem (matbaa vakası: tek worker 63k
    // output — style.css iki kez baştan yazılmıştı). Tek-sahip kuralı: plan.md P1-A.
    p += `\nMaliyet disiplini: SADECE bu görevin kapsamındaki dosyalara dokun. Bir dosyayı baştan yazmayı (full-file write) en fazla BİR kez yap: dosya zaten varsa asla yeniden yazma, Edit ile hedefli değişiklik yap. Başka rolün sahibi olduğu dosyayı yeniden yazma; gerekiyorsa küçük Edit'le düzelt. Dosya içeriğini yanıtında tekrarlama. Bittiğinde ne yaptığını en fazla 2-3 cümleyle özetle.`
    sess.send(sink, p, {
      onInit: (sessionId) => {
        rec.agentSessions[member.role] = sessionId
        writeRecall(this.roomId, this.mediaId, rec)   // aynı görev çökerse --resume edilebilsin
      },
    })
    const turn = await done
    addUsage(rec, turn.usage)
    rec.respawns = (rec.respawns || 0) + Math.max(0, sess.respawns - respawns0)
    // Limit/API arızasında turu "başarılı" sayma: görev done işaretlenmez, loop
    // status=error ile durur, recall korunur → limit yenilenince devam edilir.
    if (turn.failure) throw new Error(`Worker turu başarısız (${member.role}): ${turn.failure}`)
    // Epoch kapanışı: görev bitti — süreç ve oturum geçmişi sonraki göreve taşınmaz.
    rec.agentTaskInProgress[member.role] = null
    rec.agentSessions[member.role] = null
    sessionPool.evict(key)
    return turn.summary
  }

  // Token freni: bekleyen görev veya yapılmamış review varken doğrulayıcı spawn etme —
  // bitmediğini zaten biliyoruz. Yalnız tüm işler + review bittikten sonra gerçek doğrula.
  async _verifyTurn(rec) {
    const pending = (rec.tasks || []).filter(t => t.status === 'pending')
    const reviewPending = !rec.reviewDone && !!readAgentProfile('code-reviewer')
    if (pending.length || reviewPending) {
      return { met: false, reason: pending.length ? `${pending.length} görev bekliyor` : 'inceleme bekleniyor', remaining: [], usage: null }
    }
    return super._verifyTurn(rec)
  }

  async _workTurn(rec) {
    const iterNo = rec.iteration + 1
    this._seedTasks(rec)

    // Bütçe frenleri (maxIterations'tan bağımsız sigortalar):
    // 1) kümülatif üretim (output) — en pahalı kalem;
    // 2) işlenen TOPLAM token — oturum penceresini tüketen asıl büyüklük (plan.md P2-A).
    if ((rec.usage?.output || 0) >= MA_MAX_OUTPUT_TOKENS) {
      throw new Error(`Token bütçe freni: üretim ${rec.usage.output.toLocaleString('tr')} token tavanı aştı (${MA_MAX_OUTPUT_TOKENS.toLocaleString('tr')}). Hedefi küçült veya yeni proje başlat.`)
    }
    const u = rec.usage || {}
    const totalProcessed = (u.input || 0) + (u.cacheWrite || 0) + (u.cacheRead || 0) + (u.output || 0)
    if (totalProcessed >= MA_MAX_TOTAL_TOKENS) {
      throw new Error(`Token bütçe freni: işlenen toplam ${totalProcessed.toLocaleString('tr')} token tavanı aştı (${MA_MAX_TOTAL_TOKENS.toLocaleString('tr')}). Koşu durduruldu — recall korunuyor; hedefi küçültüp devam et.`)
    }

    // Tüm manifest görevleri bittiyse son adım: code-review turu (bir kez, hard-coded).
    // Direct fast-path'te review atlanır (plan.md P0-A: 1 iş turu + 1 verify yeter).
    const pending = rec.tasks.filter(t => t.status === 'pending')
    if (!pending.length && this.spec.manifest.direct && !rec.reviewDone) rec.reviewDone = true
    if (!pending.length && !rec.reviewDone && readAgentProfile('code-reviewer')) {
      rec.reviewDone = true
      rec.activeRole = 'code-reviewer'
      writeRecall(this.roomId, this.mediaId, rec)
      this._emit({ type: 'ma_task', iteration: iterNo, role: 'code-reviewer', task: 'Projeyi hedefe göre gözden geçir, kritik hataları düzelt' })
      // Faz 2 İş 2.4: review rolü full-file Write alamaz — prompt zaten "Edit ile
      // hedefli düzelt" diyor; tool seviyesinde de kilitle (Write/Bash yok).
      const summary = await this._workerTurn(rec,
        { role: 'code-reviewer', agentProfile: 'code-reviewer', model: 'sonnet', tools: 'Read,Glob,Grep,Edit' },
        `Projeyi hedefe göre gözden geçir: "${this.spec.goal}". Bulduğun kritik hataları doğrudan ama Edit ile hedefli düzelt — dosyaları baştan yazma. Kritik olmayan iyileştirmeleri yalnız kısaca listele, uygulama.`, iterNo, 'REVIEW')
      rec.review = (summary || '').slice(0, 1500)
      rec.activeRole = null
      this._emit({ type: 'ma_task_done', iteration: iterNo, role: 'code-reviewer', task: 'review', summary: (summary || '').slice(0, 300) })
      return `[code-reviewer] ${summary}`
    }

    // 1) Orkestratör sıradaki görevi seçer.
    this._emit({ type: 'ma_orchestrating', iteration: iterNo })
    const choice = await this._orchestrate(rec)
    if (!choice || this.aborted) return choice ? '' : 'Bekleyen görev kalmadı.'
    const member = this.spec.manifest.team.find(m => m.role === choice.nextRole)
    rec.activeRole = choice.nextRole
    rec.currentStep = `[${choice.nextRole}] ${choice.task}`.slice(0, 200)
    writeRecall(this.roomId, this.mediaId, rec)   // reconnect'te aktif rol görünsün
    this._emit({ type: 'ma_task', iteration: iterNo, role: choice.nextRole, task: choice.task, taskId: choice.taskId || null })

    // 2) Worker görevi yapar (taskId → stateless epoch'ta aynı-görev-resume anahtarı).
    const summary = await this._workerTurn(rec, member, choice.task, iterNo, choice.taskId || null)

    // 3) Görevi tamamlandı işaretle: önce kararlı ID, yoksa rolün ilk bekleyeni
    //    (kurtarma görevi ID'sizdir); hiçbiri yoksa ad-hoc kayıt (RC-<iter>).
    const hit = (choice.taskId ? rec.tasks.find(t => t.status === 'pending' && t.id === choice.taskId) : null)
      || rec.tasks.find(t => t.status === 'pending' && t.role === choice.nextRole)
    if (hit) { hit.status = 'done'; hit.iter = iterNo }
    else rec.tasks.push({ id: `RC-${iterNo}`, role: choice.nextRole, task: choice.task, status: 'done', iter: iterNo, adhoc: true })
    rec.activeRole = null
    this._emit({ type: 'ma_task_done', iteration: iterNo, role: choice.nextRole, task: choice.task, summary: (summary || '').slice(0, 300) })
    return `[${choice.nextRole}] ${choice.task} — ${summary}`
  }

  // Loop kalıcı bitince (met/maxed) rol oturumlarını kapat — havuzu meşgul etmesinler.
  // 'stopped'ta kapatılmaz: kullanıcı kısa sürede devam ettirebilir (idle timer zaten var).
  async start() {
    await super.start()
    const rec = readRecall(this.roomId, this.mediaId)
    if (rec && (rec.status === 'met' || rec.status === 'maxed')) {
      sessionPool.evictPrefix(`multiagent:${this.mediaId}:`)
    }
  }
}

// MultiAgent tile oluştur — content: { model, effort, permissionMode, idea, status }
app.post('/api/multiagent', async (req, res) => {
  const { tileId, width, height, position, rotation, model, effort, permissionMode, idea } = req.body
  const id = BigInt(Date.now())
  try {
    const pos = JSON.parse(position)
    const rot = JSON.parse(rotation)
    const media = await prisma.media.create({
      data: {
        id,
        roomId: activeRoomId,
        tileId: String(tileId),
        type: 'multiagent',
        width: parseFloat(width) || 6,
        height: parseFloat(height) || 4,
        posX: parseFloat(pos[0]) || 0,
        posY: parseFloat(pos[1]) || 0,
        posZ: parseFloat(pos[2]) || 0,
        rotX: parseFloat(rot[0]) || 0,
        rotY: parseFloat(rot[1]) || 0,
        rotZ: parseFloat(rot[2]) || 0,
        rotOrder: String(rot[3] || 'XYZ'),
        content: formatSessionContent({
          model: model || 'claude-fable-5', effort: effort || 'normal',
          permissionMode: permissionMode || 'bypassPermissions',
          idea: String(idea || ''), status: 'draft',
        }),
      },
    })
    try { fs.mkdirSync(roomProjectDir(activeRoomId), { recursive: true }) } catch {}
    res.json(serializeMedia(media))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Architect fazı (SSE, tek atış): fikri analiz eder, manifest üretir, tile'a kaydeder.
// Akışta assistant olayları (mimarın düşünüşü) + sonda architect_done { manifest }.
app.post('/api/multiagent/:mediaId/architect', async (req, res) => {
  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } }) } catch {}
  if (!media || media.type !== 'multiagent') return res.status(404).json({ error: 'MultiAgent tile bulunamadı' })

  const settings = parseSessionContent(media.content)
  const idea = String(req.body?.idea || settings.idea || '').trim()
  if (!idea) return res.status(400).json({ error: 'Proje fikri gerekli' })

  // P0-A: basit iş kapısı — Opus mimar spawn'ı ve çok-rol manifesti atlanır.
  if (classifyIdeaScale(idea) === 'direct') {
    const manifest = directManifest(idea)
    if (manifest) {
      try {
        await prisma.media.update({
          where: { id: BigInt(req.params.mediaId) },
          data: { content: formatSessionContent({ ...settings, idea, status: 'planned', manifest }) },
        })
      } catch (err) { return res.status(500).json({ error: err.message }) }
      setSSEHeaders(res)
      res.write(sseLine({ type: 'assistant', message: { content: [{ type: 'text', text: 'Basit iş tespit edildi — mimar atlandı: tek rol, tek görevlik hızlı plan kuruldu (token tasarrufu).' }] } }))
      res.write(sseLine({ type: 'architect_done', manifest, missingProfiles: missingAgentProfiles(manifest), direct: true }))
      res.write('data: {"type":"done"}\n\n')
      return res.end()
    }
  }

  const profile = readAgentProfile('project-architect')
  if (!profile) return res.status(400).json({ error: 'project-architect profili eksik (.claude/agents/project-architect.md)' })

  const dir = roomProjectDir(media.roomId)
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}

  // Fikri hemen kalıcılaştır — SSE kopsa da draft korunur.
  try {
    await prisma.media.update({
      where: { id: BigInt(req.params.mediaId) },
      data: { content: formatSessionContent({ ...settings, idea, status: 'draft' }) },
    })
  } catch {}

  const workers = listAgentProfiles().filter(n => n !== 'project-architect')
  const prompt = `Proje fikri:\n${idea}\n\nKurulu agent profilleri (agentProfile alanında SADECE bunları kullan):\n${workers.map(w => `- ${w}`).join('\n')}\n\nSistem yönergendeki formatta SADECE JSON manifest üret. Bana soru sorma, onay bekleme.`

  streamClaudeToSSE(res, [
    '--print', '--output-format=stream-json', '--verbose',
    '--model', cliModel(profile.model || 'opus'),
    '--tools', 'Read',   // mimar yalnız okur + JSON üretir; tool tanım yükünü kıs
    '--exclude-dynamic-system-prompt-sections',   // Faz 2 İş 2.1
    ...mcpArgs('architect'),
    '--append-system-prompt', profile.body,
    '--dangerously-skip-permissions',
    prompt,
  ], {
    cwd: dir,
    usageType: 'architect',
    onEvent: (ev) => {
      if (ev.type !== 'result' || typeof ev.result !== 'string') return
      const manifest = parseManifest(ev.result)
      if (!manifest) {
        try { res.write(sseLine({ type: 'architect_error', message: 'Mimar geçerli bir manifest üretemedi. Fikri netleştirip tekrar dene.' })) } catch {}
        return
      }
      // onEvent, forward+kapanıştan ÖNCE çağrılır → architect_done "done" sentinel'inden önce yazılır.
      try { res.write(sseLine({ type: 'architect_done', manifest, missingProfiles: missingAgentProfiles(manifest) })) } catch {}
      prisma.media.update({
        where: { id: BigInt(req.params.mediaId) },
        data: { content: formatSessionContent({ ...settings, idea, status: 'planned', manifest }) },
      }).catch(err => console.error('[multiagent] manifest kayıt hatası:', err.message))
    },
  })
})

// MultiAgent loop başlat (SSE) — Recall varsa kaldığı yerden devam eder.
app.post('/api/multiagent/:mediaId/loop/start', async (req, res) => {
  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } }) } catch {}
  if (!media || media.type !== 'multiagent') return res.status(404).json({ error: 'MultiAgent tile bulunamadı' })

  const settings = parseSessionContent(media.content)
  const manifest = settings.manifest
  if (!manifest || !manifest.goal || !Array.isArray(manifest.team) || !manifest.team.length) {
    return res.status(400).json({ error: 'Önce mimar ile ekip kur (manifest yok).' })
  }
  // Runtime'da profil kurulumu YOK — eksikse temiz hata (Claude spawn edilmeden).
  const missing = missingAgentProfiles(manifest)
  if (missing.length) {
    return res.status(400).json({ error: `Eksik agent profilleri: ${missing.join(', ')} — .claude/agents/ altına ekle.` })
  }
  assignTaskIds(manifest.team)   // eski tile'larda kayıtlı string[] görevleri {id, text}'e normalize et

  let runner = loopPool.get(String(req.params.mediaId))
  if ((!runner || !runner.running) && activeLoopCount() >= MAX_ACTIVE_LOOPS) {
    return res.status(429).json({ error: `Aynı anda en fazla ${MAX_ACTIVE_LOOPS} loop çalışabilir. Önce çalışan bir loop'u durdur.` })
  }

  const dir = roomProjectDir(media.roomId)
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}

  // İş 2 tabanı kayıtlı eski manifest'lere de uygulansın: görev + review + kurtarma payı
  // yoksa koşu bitiremeden 'maxed' olur (parseManifest yalnız yeni manifest'leri düzeltir).
  // Varsayılan sabit 8 değil taskCount+3 — küçük manifestin tavanını şişirme (plan.md P0-B).
  const taskCount = manifest.team.reduce((n, t) => n + t.tasks.length, 0)
  const spec = { goal: manifest.goal, maxIterations: Math.max(taskCount + 3, manifest.maxIterations || (taskCount + 3)), manifest }
  // settings.model verifier'a gider (LoopRunner.start) — plan gereği ucuz/bağımsız: haiku.
  // Worker modelleri manifest'ten, architect modeli profilden gelir; tile ayarı kullanılmaz.
  const runSettings = { ...settings, model: 'claude-haiku-4-5-20251001' }

  if (!runner) {
    runner = new MultiAgentRunner({ mediaId: req.params.mediaId, roomId: media.roomId, dir, spec, settings: runSettings })
    loopPool.set(String(req.params.mediaId), runner)
  } else {
    runner.spec = spec; runner.settings = runSettings
  }
  runner.attach(res)
  if (!runner.running) runner.start()   // await edilmez — sink üzerinden akar
})

// MultiAgent loop durdur — mevcut tur kibarca biter, döngü kırılır.
app.post('/api/multiagent/:mediaId/loop/stop', (req, res) => {
  const runner = loopPool.get(String(req.params.mediaId))
  if (runner) runner.abort()
  res.json({ ok: true })
})

// Tile durumu — mount/reconnect tek çağrıda kurulsun: content (idea/manifest) + recall + running.
app.get('/api/multiagent/:mediaId/loop/status', async (req, res) => {
  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } }) } catch {}
  if (!media || media.type !== 'multiagent') return res.status(404).json({ error: 'MultiAgent tile bulunamadı' })
  const settings = parseSessionContent(media.content)
  const recall = readRecall(media.roomId, req.params.mediaId)
  const runner = loopPool.get(String(req.params.mediaId))
  const manifest = settings.manifest || null
  res.json({
    idea: settings.idea || '',
    status: settings.status || 'draft',
    manifest,
    missingProfiles: manifest ? missingAgentProfiles(manifest) : [],
    recall: recall || null,
    running: !!(runner && runner.running),
  })
})

// ─── Bluprint (oda projesini reconstruct PRD'sine çeviren tile) ──────────────
// bluprint tile, roomchat ile aynı kalıp ama besleyen skill graphify değil
// reconstruct: odanın roomsession proje klasörünü (room-projects/<roomId>/)
// analiz edip sıfırdan yeniden inşa edilebilir PRD takımı + tek dosyalık SPECS.md
// üretir. Çıktılar izole bir klasörde tutulur: room-blueprints/<roomId>/
// Reconstruct skill'i bu klasörde (cwd) çalıştığından session geçmişi (JSONL)
// bu klasörün cwd-key'i altına yazılır.

function roomBlueprintDir(roomId) {
  return path.join(__dirname, 'room-blueprints', String(roomId))
}

function roomBlueprintJsonlDir(roomId) {
  const key = roomBlueprintDir(roomId).replace(/\//g, '-')
  return path.join(os.homedir(), '.claude', 'projects', key)
}

// Blueprint çıktısının disk durumunu okur (SPECS.md / RECONSTRUCTION.md var mı)
// ── Blueprint skill kayıt defteri ─────────────────────────────────────────────
// Her giriş bir analiz skill'ini soyutlar. `dir` kuruluysa seçilebilir; `outputs`
// sohbet enjeksiyonu + durum tespiti için (sıralı: ilk var olan birincil çıktı);
// `prompt(repo, out, scope)` skill'i çalıştıran Türkçe yönergeyi üretir.
const SKILLS_DIR = path.join(os.homedir(), '.claude', 'skills')
const BLUEPRINT_SKILLS = {
  reconstruct: {
    label: 'reconstruct — kurulabilir PRD/kit',
    dir: path.join(SKILLS_DIR, 'reconstruct'),
    install: 'maxgfr/reconstruct',
    outputs: ['SPECS.md', 'RECONSTRUCTION.md', 'FEATURES.md', 'SUMMARY.md'],
    prompt: (repo, out, scope) => scope
      ? `reconstruct skill'ini (Skill tool, skill adı "reconstruct") şu repo üzerinde çalıştır: ${repo}. Çıktıyı bu klasöre yaz: ${out}. SADECE şu özelliğe/akışa odaklan: "${scope}". İlgili dosyaları kendin bul. Komut: \`node scripts/analyze.mjs --repo ${repo} --out ${out} --mode preserve --level light --features --specs\`. Sonra YALNIZCA "${scope}" ile ilgili feature PRD'lerini tam doldur, ilgisiz feature'ları atla/sil. Amaç: bu özelliği başka bir projede sıfırdan kurmaya yetecek tek-dosya kurulum kiti (FEATURES.md/SPECS.md). Yakınsama döngüsünü (--check / --review) yalnızca bu özellik için buildable olana kadar koş. Bana hiçbir şey sorma, onay bekleme. Bittiğinde tek satırla özet ver.`
      : `reconstruct skill'ini (Skill tool, skill adı "reconstruct") şu repo üzerinde çalıştır: ${repo}. Çıktıyı bu klasöre yaz: ${out}. mode=preserve, level=light. Tam prosedürü uygula: önce \`node scripts/analyze.mjs --repo ${repo} --out ${out} --mode preserve --level light --specs --summary\`, ardından PRD'leri zenginleştir ve yakınsama döngüsünü (--check / --review) buildable olana kadar otomatik koş. Bana hiçbir şey sorma, onay bekleme — doğrudan kur. Bittiğinde tek satırla kaç feature PRD ve kaç interface üretildiğini söyle.`,
  },
  'codebase-analysis': {
    label: 'codebase-analysis — doğrulanmış teknik doküman',
    dir: path.join(SKILLS_DIR, 'codebase-analysis'),
    install: 'Ycsyyds/codebase-analysis-skill',
    outputs: ['ANALYSIS_00-SystemOverview.md', 'ANALYSIS_01-DataStructures.md'],
    prompt: (repo, out, scope) => `codebase-analysis skill'ini (Skill tool, skill adı "codebase-analysis") çalıştır. Analiz edilecek yol: ${repo}${scope ? ` — ANCAK yalnızca "${scope}" ile ilgili kısmı analiz et.` : '.'} ÖNEMLİ: ürettiğin TÜM analiz dokümanlarını (ANALYSIS_*, ALGORITHM_*, KEY_QUESTIONS_* vb.) kaynak proje klasörüne DEĞİL, şu çıktı klasörüne yaz: ${out}. Otonom çalış, bana hiçbir şey sorma, onay bekleme. Bittiğinde tek satırla kaç doküman ürettiğini söyle.`,
  },
  'repo-insight': {
    label: 'repo-insight — neden böyle tasarlanmış (best-effort)',
    dir: path.join(SKILLS_DIR, 'repo-insight'),
    install: 'AliceLJY/repo-insight',
    outputs: ['ANALYSIS_REPORT.md'],
    bestEffort: true,
    prompt: (repo, out, scope) => `repo-insight skill'ini (Skill tool, skill adı "repo-insight") çalıştır. Hedef: ${repo}${scope ? ` — yalnızca "${scope}" ile ilgili kısma/akışa odaklan.` : '.'} INTERAKTİF OLMA: bana derinlik veya başka bir şey SORMA, "Standard" derinlikle doğrudan ilerle. Raporu (ANALYSIS_REPORT.md) şu klasöre yaz: ${out}. Bittiğinde tek satırla özet ver.`,
  },
}

function blueprintSkill(id) {
  return BLUEPRINT_SKILLS[id] || BLUEPRINT_SKILLS.reconstruct
}

function isSkillInstalled(entry) {
  try { return fs.existsSync(entry.dir) } catch { return false }
}

// UI dropdown'u için skill meta listesi (kurulu mu bilgisiyle)
function blueprintSkillsMeta() {
  return Object.entries(BLUEPRINT_SKILLS).map(([id, e]) => ({
    id, label: e.label, installed: isSkillInstalled(e), install: e.install, bestEffort: !!e.bestEffort,
  }))
}

// repo-insight gibi çıktıyı ~/repo-analyses'e yazan skiller için fallback:
// en yeni analiz klasörünün .md dosyalarını out'a kopyala
function importBestEffortOutputs(out) {
  try {
    const base = path.join(os.homedir(), 'repo-analyses')
    if (!fs.existsSync(base)) return
    const dirs = fs.readdirSync(base, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ name: d.name, t: fs.statSync(path.join(base, d.name)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
    if (!dirs.length) return
    const newest = path.join(base, dirs[0].name)
    for (const f of fs.readdirSync(newest)) {
      if (f.endsWith('.md')) {
        try { fs.copyFileSync(path.join(newest, f), path.join(out, f)) } catch {}
      }
    }
  } catch {}
}

// Seçili skill'in çıktısına göre blueprint durumu
function roomBlueprintStatus(roomId, skillId = 'reconstruct', builtAt = null) {
  const dir = roomBlueprintDir(roomId)
  const entry = blueprintSkill(skillId)
  const status = { exists: false, builtAt, featureCount: 0 }
  status.exists = entry.outputs.some(name => fs.existsSync(path.join(dir, name)))
  if (status.exists && skillId === 'reconstruct') {
    try {
      const featuresDir = path.join(dir, 'features')
      if (fs.existsSync(featuresDir)) {
        status.featureCount = fs.readdirSync(featuresDir, { withFileTypes: true })
          .filter(d => d.isDirectory()).length
      }
    } catch {}
  }
  return status
}

// Seçili skill'in birincil çıktısını sohbete enjekte etmek için okur (bütçeli)
function readBlueprintSpec(roomId, skillId = 'reconstruct', budgetChars = 8000) {
  const dir = roomBlueprintDir(roomId)
  const entry = blueprintSkill(skillId)
  for (const name of entry.outputs) {
    const p = path.join(dir, name)
    if (fs.existsSync(p)) {
      try {
        let txt = fs.readFileSync(p, 'utf8')
        if (txt.length > budgetChars) txt = txt.slice(0, budgetChars) + '\n\n…(kısaltıldı)'
        return { name, text: txt }
      } catch {}
    }
  }
  return null
}

// bluprint tile oluştur (roomsession ile aynı şema, type='bluprint')
app.post('/api/bluprint', async (req, res) => {
  const { tileId, width, height, position, rotation, model, effort, permissionMode, skill, scope } = req.body
  const id = BigInt(Date.now())
  try {
    const pos = JSON.parse(position)
    const rot = JSON.parse(rotation)
    const media = await prisma.media.create({
      data: {
        id,
        roomId: activeRoomId,
        tileId: String(tileId),
        type: 'bluprint',
        width: parseFloat(width) || 6,
        height: parseFloat(height) || 4,
        posX: parseFloat(pos[0]) || 0,
        posY: parseFloat(pos[1]) || 0,
        posZ: parseFloat(pos[2]) || 0,
        rotX: parseFloat(rot[0]) || 0,
        rotY: parseFloat(rot[1]) || 0,
        rotZ: parseFloat(rot[2]) || 0,
        rotOrder: String(rot[3] || 'XYZ'),
        content: formatSessionContent({ model: model || 'claude-fable-5', effort: effort || 'normal', permissionMode: permissionMode || 'bypassPermissions', skill: BLUEPRINT_SKILLS[skill] ? skill : 'reconstruct', scope: (scope || '').trim() }),
      },
    })
    // Odanın izole proje klasörünü garanti et (reconstruct'ın kaynağı)
    try { fs.mkdirSync(roomProjectDir(activeRoomId), { recursive: true }) } catch {}
    res.json(serializeMedia(media))
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Kullanılabilir blueprint skill'leri (kurulu mu bilgisiyle) — UI dropdown'u için
app.get('/api/bluprint/skills', (req, res) => {
  res.json({ skills: blueprintSkillsMeta() })
})

// bluprint geçmişi + ayarları + blueprint durumu
app.get('/api/bluprint/:mediaId/history', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'bluprint') {
      return res.status(404).json({ error: 'Blueprint bulunamadı' })
    }
    const settings = parseSessionContent(media.content)
    const { sessionId, model, effort, permissionMode } = settings
    const skill = BLUEPRINT_SKILLS[settings.skill] ? settings.skill : 'reconstruct'
    const scope = settings.scope || ''
    const blueprint = roomBlueprintStatus(media.roomId, skill, settings.blueprintBuiltAt || null)

    let messages = []
    if (sessionId) {
      const jsonlPath = path.join(roomBlueprintJsonlDir(media.roomId), `${sessionId}.jsonl`)
      if (fs.existsSync(jsonlPath)) {
        messages = parseLiveMessages(fs.readFileSync(jsonlPath, 'utf8'))
      }
    }
    res.json({ sessionId, messages, model, effort, permissionMode, skill, scope, blueprint, skills: blueprintSkillsMeta() })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// model/effort/izin ayarlarını güncelle (sohbeti bozmadan)
app.patch('/api/bluprint/:mediaId/settings', async (req, res) => {
  try {
    const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
    if (!media || media.type !== 'bluprint') return res.status(404).json({ error: 'Blueprint bulunamadı' })
    const current = parseSessionContent(media.content)
    const updated = { ...current, ...req.body }
    await prisma.media.update({
      where: { id: BigInt(req.params.mediaId) },
      data: { content: formatSessionContent(updated) },
    })
    sessionPool.get(`bluprint:${req.params.mediaId}`)?.applySettings(req.body)
    res.json({ ok: true })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// "Blueprint üret" butonu — oda proje klasörünü reconstruct ile PRD takımına çevir
app.post('/api/bluprint/:mediaId/rebuild', async (req, res) => {
  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } }) } catch {}
  if (!media || media.type !== 'bluprint') return res.status(404).json({ error: 'Blueprint bulunamadı' })

  const roomId = media.roomId
  const repo = roomProjectDir(roomId)
  const out = roomBlueprintDir(roomId)
  const settings = parseSessionContent(media.content)
  const skillId = BLUEPRINT_SKILLS[settings.skill] ? settings.skill : 'reconstruct'
  const entry = blueprintSkill(skillId)
  const scope = (settings.scope || '').trim()

  // SSE üzerinden tek seferlik hata döndür
  const sseError = (message) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    res.write(`data: ${JSON.stringify({ type: 'error', message })}\n\n`)
    res.write('data: {"type":"done"}\n\n')
    res.end()
  }

  // Seçili skill kurulu değilse
  if (!isSkillInstalled(entry)) {
    return sseError(`Seçili skill kurulu değil: ${skillId}. Kurmak için: npx skills add ${entry.install}`)
  }

  // Kaynak proje klasörü boş/yoksa
  const repoEmpty = !fs.existsSync(repo) || fs.readdirSync(repo).length === 0
  if (repoEmpty) {
    return sseError('Bu odanın proje klasörü boş. Önce roomSession (Oda Projesi) tile ile bir proje geliştirin.')
  }

  fs.mkdirSync(out, { recursive: true })
  const { model } = settings
  const prompt = entry.prompt(repo, out, scope)

  streamClaudeToSSE(res, [
    '--print', '--output-format=stream-json', '--verbose',
    '--model', cliModel(model),
    '--exclude-dynamic-system-prompt-sections',   // Faz 2 İş 2.1
    ...mcpArgs('bluprint'),
    '--dangerously-skip-permissions',
    prompt,
  ], {
    cwd: out,
    usageType: 'bluprint-build',
    onEvent: (ev) => {
      if (ev.type === 'result') {
        if (entry.bestEffort) importBestEffortOutputs(out)
        const cur = parseSessionContent(media.content)
        const status = roomBlueprintStatus(roomId, skillId)
        prisma.media.update({
          where: { id: media.id },
          data: { content: formatSessionContent({ ...cur, blueprintBuiltAt: new Date().toISOString(), featureCount: status.featureCount }) },
        }).catch(err => console.error('[bluprint] blueprint kaydı hatası:', err.message))
        // Spec tazelendi → kalıcı oturumu düşür ki sonraki mesaj yeni sys'i kursun.
        sessionPool.evict(`bluprint:${media.id}`)
      }
    },
  })
})

// bluprint mesajı — üretilen reconstruction spec'i system prompt'a enjekte edilir
app.post('/api/bluprint/message', async (req, res) => {
  const { mediaId, message } = req.body
  if (!message?.trim()) return res.status(400).json({ error: 'Mesaj gerekli' })

  let media
  try { media = await prisma.media.findUnique({ where: { id: BigInt(mediaId) } }) } catch {}
  if (!media || media.type !== 'bluprint') return res.status(404).json({ error: 'Blueprint bulunamadı' })

  const settings = parseSessionContent(media.content)
  const roomId = media.roomId
  const dir = roomBlueprintDir(roomId)
  try { fs.mkdirSync(dir, { recursive: true }) } catch {}
  const key = `bluprint:${mediaId}`

  // Dinamik sys (üretilen spec çıktısı) yalnızca canlı oturum yokken kurulur;
  // blueprint yeniden üretilince rebuild endpoint'i evict eder → sys tazelenir.
  let sys
  if (!sessionPool.get(key)) {
    const skillId = BLUEPRINT_SKILLS[settings.skill] ? settings.skill : 'reconstruct'
    const scope = (settings.scope || '').trim()
    sys = `Sen bu odanın projesinin reconstruction asistanısın. Kullanıcı bu projeyi başka bir Claude projesinde sıfırdan kurmak istiyor.${scope ? ` Özellikle "${scope}" özelliği/akışı üzerine odaklan.` : ''} Üretilen analiz/spec çıktısı hakkındaki soruları yanıtla, eksikleri tamamla, istenirse başka bir ajana verilebilecek tek-dosya kur-prompt'u üret. Cevaplarını Türkçe ver, kısa ve net ol.`
    const spec = readBlueprintSpec(roomId, skillId)
    if (spec) sys += `\n\n# Proje Analiz/Spec Çıktısı (${spec.name})\n${spec.text}`
  }

  const sess = ensureSessionOr429(res, key, { settings, cwd: dir, sys })
  if (!sess) return
  sess.send(res, message.trim(), {
    onInit: (sessionId) => {
      prisma.media.update({
        where: { id: BigInt(mediaId) },
        data: { content: formatSessionContent({ ...settings, sessionId }) },
      }).catch(err => console.error('[bluprint] kayıt hatası:', err.message))
    },
  })
})

// ─── Start ────────────────────────────────────────────────────────────────────
await bootMigrate();
app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
