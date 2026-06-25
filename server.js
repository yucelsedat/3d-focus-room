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

// ─── MCP bütçesi: spawn edilen her claude turunda tüm MCP tool şemaları sistem
// prompt'una girer. Global config'de 5 sunucu var (github ~60 tool, exa, tavily,
// web-clone, context7) → ~30K token/tur, üstelik cache soğuyunca her turda tekrar.
// Bir oda asistanının bunlara ihtiyacı yok; yalnızca context7'yi (2 tool, küçük,
// context7-mcp skill'inin arka ucu) bırakıp gerisini --strict-mcp-config ile keseriz.
// API key repoya girmesin diye context7 ayarını global ~/.claude.json'dan okuyup
// minimal config'i os.tmpdir() altına yazarız; sadece o dosyanın yolunu kullanırız.
const MIN_MCP_PATH = path.join(os.tmpdir(), 'focus-room-min-mcp.json')
const MCP_ARGS = (() => {
  try {
    const globalCfg = path.join(os.homedir(), '.claude.json')
    const cfg = JSON.parse(fs.readFileSync(globalCfg, 'utf8'))
    const ctx7 = cfg.mcpServers?.context7
    if (ctx7) {
      fs.writeFileSync(MIN_MCP_PATH, JSON.stringify({ mcpServers: { context7: ctx7 } }))
      return ['--strict-mcp-config', '--mcp-config', MIN_MCP_PATH]
    }
  } catch (err) {
    console.error('[mcp] minimal config yazılamadı, tüm MCP kapatılıyor:', err.message)
  }
  // context7 bulunamazsa: hiç MCP yükleme (yine de büyük tasarruf)
  return ['--strict-mcp-config']
})()
// Spawn arg dizilerine eklenir; skilleri etkilemez, sadece MCP kapsamını daraltır.
function mcpArgs() { return MCP_ARGS }

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
        data: { roomId: 'default', texture: 'zemin.png' },
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
  const rooms = await prisma.room.findMany({
    orderBy: { createdAt: 'asc' },
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
  const room = await prisma.room.findUnique({ where: { id }, include: roomInclude });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

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

app.delete('/api/rooms/:id', async (req, res) => {
  const { id } = req.params;
  const cascade = req.query.cascade === 'true';
  if (id === 'default') return res.status(400).json({ error: 'Varsayılan oda silinemez' });

  const room = await prisma.room.findUnique({ where: { id } });
  if (!room) return res.status(404).json({ error: 'Oda bulunamadı' });

  if (cascade) {
    const allIds = await collectDescendants(id);
    for (const roomId of allIds) {
      const mediaItems = await prisma.media.findMany({ where: { roomId } });
      for (const m of mediaItems) {
        if (m.url && m.url.startsWith('/uploads/')) {
          const fp = path.join(__dirname, 'public', m.url);
          if (fs.existsSync(fp)) fs.unlinkSync(fp);
        }
      }
    }
    await prisma.room.deleteMany({ where: { id: { in: allIds } } });
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

  // onDelete: Cascade removes media/doors/floor automatically
  await prisma.room.delete({ where: { id } });

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
    floor = await prisma.floor.create({ data: { roomId: activeRoomId, texture: 'zemin.png' } });
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
    .filter(f => /\.(png|jpg|jpeg|webp)$/i.test(f) && f !== 'duvar.png');
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
  ])
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
const PERSIST_IDLE_MS = 60 * 60 * 1000   // boşta 60 dk sonra process'i kapat (RAM)
const PERSIST_MAX = 4                      // eşzamanlı kalıcı process tavanı (LRU tahliye)

// stream-json girdi zarfı (spike'ta doğrulanan şema)
function userLine(text) {
  return JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } }) + '\n'
}

class PersistentSession {
  constructor(key, { settings, cwd, sys }) {
    this.key = key
    this.settings = { ...settings }          // { sessionId, model, effort, permissionMode }
    this.cwd = cwd || process.cwd()
    this.sys = sys || null                   // sabit append-system-prompt (variant'lar için)
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
  }

  _spawn() {
    const a = [
      '--print', '--input-format', 'stream-json', '--output-format', 'stream-json', '--verbose',
      '--model', cliModel(this.settings.model),
      ...mcpArgs(),
    ]
    if (this.sys) a.push('--append-system-prompt', this.sys)
    a.push(...permissionArgs(this.settings.permissionMode))
    if (this.sessionId) a.push('--resume', this.sessionId)   // geçmişi koru

    const envOverrides = {}
    if (this.settings.effort && this.settings.effort !== 'normal') envOverrides.CLAUDE_EFFORT = this.settings.effort

    this.proc = spawn(CLAUDE_CLI, a, { cwd: this.cwd, env: buildSpawnEnv(envOverrides) })
    console.error(`[persist] SPAWN key=${this.key} pid=${this.proc.pid} resume=${this.sessionId || 'none'}`)
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
    if (ev.type === 'result') this._finishTurn()   // tur sınırı
  }

  // Bir mesaj kuyruğa al; sıra gelince stdin'e yaz.
  send(res, message, { onInit } = {}) {
    setSSEHeaders(res)
    if (onInit && !this.onSessionId) this.onSessionId = onInit
    this.queue.push({ res, message })
    this._next()
  }

  _next() {
    if (this.busy) return
    const job = this.queue.shift()
    if (!job) return
    this.busy = true
    this.lastUsed = Date.now()
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null }
    if (!this.alive || !this.proc) this._spawn()   // ilk tur ya da idle/çökme sonrası --resume ile yeniden doğ

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
    this._armIdle()
    this._next()   // kuyrukta bekleyen varsa işle
  }

  _detachSink() {
    if (this.heartbeat) { clearInterval(this.heartbeat); this.heartbeat = null }
    if (this.sessionId && sessionStreams.get(this.sessionId) === this.sink) sessionStreams.delete(this.sessionId)
    this.sink = null
  }

  _armIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(async () => {
      if (this.sessionId) {
        try {
          await trimSessionJsonl(this.sessionId)
        } catch (e) {
          console.error('[session-trim-idle] hata:', e.message)
        }
      }
      sessionPool.evict(this.key)
    }, PERSIST_IDLE_MS)
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
      try { this.proc.kill() } catch {}
    }
    this.proc = null
    this.alive = false
    this.busy = false
  }
}

class SessionPool {
  constructor() { this.map = new Map() }

  ensure(key, opts) {
    let s = this.map.get(key)
    if (!s) {
      this._evictIfFull()
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

  // Tavan dolduysa, meşgul olmayan en eski oturumu tahliye et.
  _evictIfFull() {
    if (this.map.size < PERSIST_MAX) return
    let victim = null
    for (const s of this.map.values()) {
      if (s.busy) continue
      if (!victim || s.lastUsed < victim.lastUsed) victim = s
    }
    if (victim) this.evict(victim.key)
  }
}

const sessionPool = new SessionPool()

// ─── Sohbeti temizle: canlı oturumu kapat + sessionId'yi sıfırla ─────────────
// Geçmiş .jsonl dosyasına dokunmaz; sessionId null'lanınca history boş döner ve
// sonraki mesaj --resume'suz taze bir oturum açar. (Export'lar zaten raw/'da kalır.)
function makeClearHandler(typeName, poolPrefix, notFoundMsg) {
  return async (req, res) => {
    try {
      const media = await prisma.media.findUnique({ where: { id: BigInt(req.params.mediaId) } })
      if (!media || media.type !== typeName) return res.status(404).json({ error: notFoundMsg })
      sessionPool.evict(`${poolPrefix}:${req.params.mediaId}`)   // canlı process'i kapat
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

// ─── Session JSONL Optimization ────────────────────────────────────────────
// Resume sırasında geçmiş JSONL'ı gönderilir. Çok sayıda tur varsa, token overhead.
// trimSessionJsonl: son N tur tut, öncesini sil (token tasarrufu).
// Cache expire (5 dk sonra) yeniden gönderilince token tasarrufu için
// son 5 tur'a sınırladık (geçmiş overhead ~15K → ~7K)
const TRIM_MAX_TURNS = 5

async function findSessionJsonl(sessionId) {
  const projectsDir = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(projectsDir)) return null
  for (const projDir of fs.readdirSync(projectsDir)) {
    const sessionFile = path.join(projectsDir, projDir, 'sessions', `${sessionId}.jsonl`)
    if (fs.existsSync(sessionFile)) return sessionFile
  }
  return null
}

async function trimSessionJsonl(sessionId) {
  const jsonlPath = await findSessionJsonl(sessionId)
  if (!jsonlPath) return

  try {
    const content = await fs.promises.readFile(jsonlPath, 'utf8')
    const lines = content.trim().split('\n').filter(l => l.trim())

    if (lines.length <= TRIM_MAX_TURNS) return

    const trimmed = lines.slice(-TRIM_MAX_TURNS)
    const oldCount = lines.length - trimmed.length

    await fs.promises.writeFile(jsonlPath, trimmed.join('\n') + '\n')
    console.error(`[session-trim] ${path.basename(jsonlPath)}: ${lines.length}→${trimmed.length} tur (${oldCount} silindi)`)
  } catch (e) {
    console.error('[session-trim] hata:', e.message)
  }
}

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
  const sess = sessionPool.ensure(`ai-session:${mediaId}`, { settings, cwd: process.cwd() })
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
    if (!f.startsWith('chat-')) fs.rmSync(path.join(rawDir, f), { force: true })
  }
  for (const d of docs) {
    fs.writeFileSync(path.join(rawDir, `${d.kind}-${d.id}.md`), d.text + '\n')
  }
  return rawDir
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

  if (!docs.length) {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders()
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Bu odada metin/canvas yazısı yok. Önce metin veya canvas ekleyin.' })}\n\n`)
    res.write('data: {"type":"done"}\n\n')
    return res.end()
  }

  const dir = roomGraphDir(roomId)
  fs.mkdirSync(dir, { recursive: true })
  writeRoomRaw(roomId, docs)

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
    ...mcpArgs(),
    '--dangerously-skip-permissions',
    prompt,
  ], {
    cwd: dir,
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

  const sess = sessionPool.ensure(key, { settings, cwd: process.cwd(), sys })
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

// ─── Room Session endpoints (izole proje klasöründe çalışan AI session) ──────

app.post('/api/roomsession', async (req, res) => {
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
        content: formatSessionContent({ model: model || 'claude-fable-5', effort: effort || 'normal', permissionMode: permissionMode || 'bypassPermissions' }),
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
    const { sessionId, model, effort, permissionMode } = parseSessionContent(media.content)
    if (!sessionId) return res.json({ sessionId: null, messages: [], model, effort, permissionMode })

    const jsonlPath = path.join(roomProjectJsonlDir(media.roomId), `${sessionId}.jsonl`)
    if (!fs.existsSync(jsonlPath)) return res.json({ sessionId, messages: [], model, effort, permissionMode })

    const content = fs.readFileSync(jsonlPath, 'utf8')
    res.json({ sessionId, messages: parseLiveMessages(content), model, effort, permissionMode })
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

  const sess = sessionPool.ensure(key, { settings, cwd: dir, sys })
  sess.send(res, message.trim(), {
    onInit: (sessionId) => {
      prisma.media.update({
        where: { id: BigInt(mediaId) },
        data: { content: formatSessionContent({ ...settings, sessionId }) },
      }).catch(err => console.error('[roomsession] kayıt hatası:', err.message))
    },
  })
});

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
    ...mcpArgs(),
    '--dangerously-skip-permissions',
    prompt,
  ], {
    cwd: out,
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

  const sess = sessionPool.ensure(key, { settings, cwd: dir, sys })
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
