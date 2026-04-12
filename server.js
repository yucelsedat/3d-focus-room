import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename).replace('/src/server', '');

const app = express();
const port = 5001;

app.use(cors());
app.use(express.json());

// Ensure directories exist
const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};
ensureDir('public/uploads/images');
ensureDir('public/uploads/videos');
ensureDir('public/data');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const type = file.mimetype.startsWith('video/') ? 'videos' : 'images';
    cb(null, `public/uploads/${type}/`);
  },
  filename: (req, file, cb) => {
    cb(null, `${Date.now()}-${file.originalname}`);
  }
});

const upload = multer({ storage });

const DATA_PATH = 'public/data/media.json';

app.get('/api/media', (req, res) => {
  if (!fs.existsSync(DATA_PATH)) {
    fs.writeFileSync(DATA_PATH, '[]');
  }
  const data = fs.readFileSync(DATA_PATH, 'utf8');
  res.json(JSON.parse(data));
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  const { tileId, type, width, height, position, rotation, url } = req.body;
  
  let mediaUrl = url;
  if (req.file) {
    const folder = req.file.mimetype.startsWith('video/') ? 'videos' : 'images';
    mediaUrl = `/uploads/${folder}/${req.file.filename}`;
  }

  const newItem = {
    id: Date.now(),
    tileId,
    type,
    url: mediaUrl,
    width: parseFloat(width) || 1,
    height: parseFloat(height) || 1,
    position: JSON.parse(position),
    rotation: JSON.parse(rotation)
  };

  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '[]');
  data.push(newItem);
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2));

  res.json(newItem);
});

// Proxy-download: fetches an external URL server-side and saves it locally.
// This bypasses browser CORS restrictions completely.
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

    // Determine file extension: prefer URL path extension, fallback to content-type
    let ext = 'jpg';
    try {
      const urlExt = path.extname(new URL(url).pathname).replace('.', '');
      if (urlExt) {
        ext = urlExt.toLowerCase().split('?')[0]; // strip any query params
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

app.put('/api/media/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const { width, height } = req.body
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '[]')
  const itemIndex = data.findIndex(m => m.id === id)
  
  if (itemIndex === -1) return res.status(404).json({ error: 'Not found' })
  
  if (width !== undefined) data[itemIndex].width = parseFloat(width) || data[itemIndex].width;
  if (height !== undefined) data[itemIndex].height = parseFloat(height) || data[itemIndex].height;
  
  fs.writeFileSync(DATA_PATH, JSON.stringify(data, null, 2))
  res.json(data[itemIndex])
})

app.delete('/api/media/:id', (req, res) => {
  const id = parseInt(req.params.id)
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8') || '[]')
  const item = data.find((m) => m.id === id)

  if (!item) return res.status(404).json({ error: 'Not found' })

  // Delete the file from disk if it's a local upload
  if (item.url && item.url.startsWith('/uploads/')) {
    const filePath = path.join(__dirname, 'public', item.url)
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
  }

  const updated = data.filter((m) => m.id !== id)
  fs.writeFileSync(DATA_PATH, JSON.stringify(updated, null, 2))
  res.json({ success: true })
})

app.listen(port, () => {
  console.log(`Backend server running at http://localhost:${port}`);
});
