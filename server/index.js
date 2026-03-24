const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');

const JWT_SECRET = process.env.JWT_SECRET || 'videogen-dev-secret-change-in-production';
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

const app = express();
app.use(cors());
app.use(express.json());

// ─── Directories ─────────────────────────────────────────────────────────────
const DATA_ROOT = path.join(__dirname, 'data');
const OUTPUT_DIR = path.join(DATA_ROOT, 'outputs');
const BATCHES_DIR = path.join(DATA_ROOT, 'batches');
const ASSETS_DIR = path.join(DATA_ROOT, 'assets');
const OVERLAYS_DIR = path.join(DATA_ROOT, 'overlays');
const FONTS_DIR    = path.join(DATA_ROOT, 'fonts');
const PRESET_LOGOS_DIR = path.join(DATA_ROOT, 'preset_logos');

[DATA_ROOT, OUTPUT_DIR, BATCHES_DIR, ASSETS_DIR, OVERLAYS_DIR, FONTS_DIR, PRESET_LOGOS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

app.use('/outputs', express.static(OUTPUT_DIR));
app.use('/assets', express.static(ASSETS_DIR));
app.use('/overlays', express.static(OVERLAYS_DIR));
app.use('/batches-media', express.static(BATCHES_DIR));

// ─── Supported Resolutions ───────────────────────────────────────────────────
const RESOLUTIONS = {
  '1920x1080': { w: 1920, h: 1080, label: '1920×1080 — 16:9 Landscape (YouTube / TV)' },
  '1080x1080': { w: 1080, h: 1080, label: '1080×1080 — 1:1 Square (Instagram Feed)' },
  '1080x1920': { w: 1080, h: 1920, label: '1080×1920 — 9:16 Portrait (Reels / TikTok / Shorts)' },
  '3840x2160': { w: 3840, h: 2160, label: '3840×2160 — 4K Landscape' },
  '2160x3840': { w: 2160, h: 3840, label: '2160×3840 — 4K Portrait' },
};

app.get('/api/resolutions', (req, res) => {
  res.json(Object.entries(RESOLUTIONS).map(([key, val]) => ({ key, ...val })));
});

// ─── Fonts ────────────────────────────────────────────────────────────────────
const AVAILABLE_FONTS = [
  { id: 'default',          name: 'Default',          file: null,                    category: 'system'      },
  { id: 'roboto',           name: 'Roboto',            file: 'Roboto.ttf',            category: 'sans-serif'  },
  { id: 'open-sans',        name: 'Open Sans',         file: 'Open-Sans.ttf',         category: 'sans-serif'  },
  { id: 'lato',             name: 'Lato',              file: 'Lato.ttf',              category: 'sans-serif'  },
  { id: 'montserrat',       name: 'Montserrat',        file: 'Montserrat.ttf',        category: 'sans-serif'  },
  { id: 'oswald',           name: 'Oswald',            file: 'Oswald.ttf',            category: 'sans-serif'  },
  { id: 'raleway',          name: 'Raleway',           file: 'Raleway.ttf',           category: 'sans-serif'  },
  { id: 'poppins',          name: 'Poppins',           file: 'Poppins.ttf',           category: 'sans-serif'  },
  { id: 'nunito',           name: 'Nunito',            file: 'Nunito.ttf',            category: 'sans-serif'  },
  { id: 'inter',            name: 'Inter',             file: 'Inter.ttf',             category: 'sans-serif'  },
  { id: 'ubuntu',           name: 'Ubuntu',            file: 'Ubuntu.ttf',            category: 'sans-serif'  },
  { id: 'playfair-display', name: 'Playfair Display',  file: 'Playfair-Display.ttf',  category: 'serif'       },
  { id: 'merriweather',     name: 'Merriweather',      file: 'Merriweather.ttf',      category: 'serif'       },
  { id: 'bebas-neue',       name: 'Bebas Neue',        file: 'Bebas-Neue.ttf',        category: 'display'     },
  { id: 'anton',            name: 'Anton',             file: 'Anton.ttf',             category: 'display'     },
  { id: 'pacifico',         name: 'Pacifico',          file: 'Pacifico.ttf',          category: 'script'      },
  { id: 'dancing-script',   name: 'Dancing Script',    file: 'Dancing-Script.ttf',    category: 'script'      },
  { id: 'lobster',          name: 'Lobster',           file: 'Lobster.ttf',           category: 'script'      },
  { id: 'righteous',        name: 'Righteous',         file: 'Righteous.ttf',         category: 'display'     },
  { id: 'orbitron',         name: 'Orbitron',          file: 'Orbitron.ttf',          category: 'display'     },
  { id: 'russo-one',        name: 'Russo One',         file: 'Russo-One.ttf',         category: 'display'     },
  { id: 'permanent-marker', name: 'Permanent Marker',  file: 'Permanent-Marker.ttf',  category: 'handwriting' },
  { id: 'special-elite',    name: 'Special Elite',     file: 'Special-Elite.ttf',     category: 'monospace'   },
];

function getFontFile(fontId) {
  if (!fontId || fontId === 'default') return null;
  const font = AVAILABLE_FONTS.find(f => f.id === fontId);
  if (!font?.file) return null;
  const fp = path.join(FONTS_DIR, font.file);
  return fs.existsSync(fp) ? fp : null;
}

app.get('/api/fonts', (req, res) => {
  res.json(AVAILABLE_FONTS.map(f => ({
    id:        f.id,
    name:      f.name,
    category:  f.category,
    available: !f.file || fs.existsSync(path.join(FONTS_DIR, f.file)),
  })));
});

// ─── MongoDB ──────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/videogen';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(e => console.error('MongoDB error:', e));

const JobSchema = new mongoose.Schema({
  id:          { type: String, default: uuidv4 },
  batchName:   String,
  status:      { type: String, enum: ['queued','running','done','error','cancelled'], default: 'queued' },
  progress:    { type: Number, default: 0 },
  log:         [String],
  outputFile:  String,
  outputFiles:  [String],   // array of output file paths for multi-video jobs
  outputFolder: String,     // folder name when multiple videos are generated
  type:         { type: String, default: 'video' }, // 'video' | 'post'
  videoQuotes:  [{ file: String, quote: String }],  // quote used for each output file
  videoMetadata: { type: mongoose.Schema.Types.Mixed, default: null }, // per-file generated metadata
  duration:    Number,
  videoFiles:  [String],
  imageFiles:  [String],
  logoText:    String,
  logoSubtext: String,
  resolution:  String,
  clips: [{ id: String, clipType: String, src: String, startTime: Number, clipDuration: Number, trimIn: Number, trimOut: Number, order: Number }],
  annotations: [{ id: String, text: String, startTime: Number, endTime: Number, x: Number, y: Number }],
  userId:          { type: String, default: null },
  presetId:        { type: String, default: null },
  presetName:      { type: String, default: null },
  generationParams: { type: mongoose.Schema.Types.Mixed, default: null },
  createdAt:   { type: Date, default: Date.now }
});
const Job = mongoose.model('Job', JobSchema);

// ─── User Schema ──────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  id:        { type: String, default: uuidv4 },
  name:      { type: String, required: true },
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String },  // null for Google-only accounts
  googleId:  { type: String },
  avatar:    { type: String },
  createdAt: { type: Date, default: Date.now },
});
const User = mongoose.model('User', UserSchema);

// ─── Auth helpers ─────────────────────────────────────────────────────────────
const signToken = (user) => jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

const requireAuth = async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const payload = jwt.verify(header.slice(7), JWT_SECRET);
    const user = await User.findOne({ id: payload.id });
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    req.user = user;
    next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};

// ─── Auth Routes ──────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: 'Email already in use' });
    const hash = await bcrypt.hash(password, 12);
    const user = await User.create({ name: name.trim(), email: email.toLowerCase().trim(), password: hash });
    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !user.password) return res.status(400).json({ error: 'Invalid email or password' });
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ error: 'Invalid email or password' });
    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/auth/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) return res.status(400).json({ error: 'Google credential required' });
    if (!GOOGLE_CLIENT_ID) return res.status(500).json({ error: 'Google OAuth not configured on server' });
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    let user = await User.findOne({ googleId: payload.sub });
    if (!user) {
      user = await User.findOne({ email: payload.email });
      if (user) {
        user.googleId = payload.sub;
        user.avatar = user.avatar || payload.picture;
        await user.save();
      } else {
        user = await User.create({
          name: payload.name,
          email: payload.email,
          googleId: payload.sub,
          avatar: payload.picture,
        });
      }
    }
    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const u = req.user;
  res.json({ id: u.id, name: u.name, email: u.email, avatar: u.avatar });
});

const PresetSchema = new mongoose.Schema({
  id:             { type: String, default: uuidv4 },
  name:           { type: String, default: 'New Preset' },
  resolution:     { type: String, default: '1920x1080' },
  sliceDuration:  { type: Number, default: 3 },
  imageDuration:  { type: Number, default: 0.2 },
  logoText:       { type: String, default: '' },
  logoSubtext:    { type: String, default: '' },
  quotes:         { type: String, default: '' },
  textMaxChars:      { type: Number, default: 20 },
  preferredDuration: { type: Number, default: 20 },
  selectedVideos: { type: [String], default: [] },
  selectedImages: { type: [String], default: [] },
  locked:         { type: Boolean, default: false },
  videoCount:     { type: Number, default: 1 },
  fontFamily:     { type: String, default: 'default' },
  logoFile:       { type: String, default: null },
  presetType:     { type: String, enum: ['video', 'post'], default: 'video' },
  resolutionEntries: { type: Array, default: [] }, // [{ key: '1920x1080', count: 2 }, ...]
  // Layout — all positions as 0–100 percentages of frame dimensions
  layout: {
    logo: {
      x:  { type: Number, default: 50 },  // % from left (centered)
      y:  { type: Number, default: 90 },  // % from top
      w:  { type: Number, default: 18 },  // % of frame width
      enabled: { type: Boolean, default: true },
    },
    subtitles: {
      x:        { type: Number, default: 50 },  // % from left
      y:        { type: Number, default: 50 },  // % from top (center screen)
      fontSize: { type: Number, default: 52 },  // px at 1920x1080 base
      enabled:  { type: Boolean, default: true },
    },
    overlays: { type: Array, default: [] },
    // Each overlay: { id, file, x, y, w, h }  — all in %
    dimBackground: { type: Number, default: 0 }, // 0 = no dim, 1 = full black
    grain:         { type: Number, default: 0 }, // 0 = no grain, 1 = heavy grain
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Preset = mongoose.model('Preset', PresetSchema);

// ─── Preset Routes ────────────────────────────────────────────────────────────
app.get('/api/presets', async (req, res) => {
  try {
    const filter = {};
    if (req.query.type) filter.presetType = req.query.type;
    const presets = await Preset.find(filter).sort({ createdAt: -1 });
    res.json(presets);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/presets/:id', async (req, res) => {
  try {
    const preset = await Preset.findOne({ id: req.params.id });
    if (!preset) return res.status(404).json({ error: 'not found' });
    res.json(preset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/presets', async (req, res) => {
  try {
    const preset = await Preset.create({ ...req.body, updatedAt: new Date() });
    res.json(preset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/presets/:id', async (req, res) => {
  try {
    // Use $set so dot-notation keys (e.g. 'layout.subtitles.fontSize') work correctly
    const setDoc = {};
    for (const [k, v] of Object.entries(req.body)) setDoc[k] = v;
    setDoc.updatedAt = new Date();
    const preset = await Preset.findOneAndUpdate(
      { id: req.params.id },
      { $set: setDoc },
      { new: true }
    );
    if (!preset) return res.status(404).json({ error: 'not found' });
    res.json(preset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/presets/:id', async (req, res) => {
  try {
    await Preset.deleteOne({ id: req.params.id });
    // Clean up overlay images and logo for this preset
    const presetOverlayDir = path.join(DATA_ROOT, 'preset_overlays', req.params.id);
    if (fs.existsSync(presetOverlayDir)) fs.rmSync(presetOverlayDir, { recursive: true, force: true });
    const presetLogoDir = path.join(PRESET_LOGOS_DIR, req.params.id);
    if (fs.existsSync(presetLogoDir)) fs.rmSync(presetLogoDir, { recursive: true, force: true });
    res.json({ deleted: req.params.id });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload a static overlay image for a preset
const presetOverlayStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(DATA_ROOT, 'preset_overlays', req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const overlayId = uuidv4();
    req.overlayId = overlayId;
    cb(null, overlayId + path.extname(file.originalname).toLowerCase());
  }
});
const presetOverlayUpload = multer({ storage: presetOverlayStorage });

app.post('/api/presets/:id/overlays', presetOverlayUpload.single('image'), async (req, res) => {
  try {
    const { id } = req.params;
    const file = req.file.filename;
    const overlayId = path.basename(file, path.extname(file));
    const newOverlay = { id: overlayId, file, x: 10, y: 10, w: 20, h: 20 };

    const preset = await Preset.findOneAndUpdate(
      { id },
      { $push: { 'layout.overlays': newOverlay }, updatedAt: new Date() },
      { new: true }
    );
    res.json({ overlay: newOverlay, preset });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/presets/:id/overlays/:overlayId', async (req, res) => {
  try {
    const { id, overlayId } = req.params;
    const preset = await Preset.findOne({ id });
    if (!preset) return res.status(404).json({ error: 'not found' });

    // Remove file from disk
    const overlayDir = path.join(DATA_ROOT, 'preset_overlays', id);
    if (fs.existsSync(overlayDir)) {
      const files = fs.readdirSync(overlayDir).filter(f => f.startsWith(overlayId));
      files.forEach(f => fs.unlinkSync(path.join(overlayDir, f)));
    }

    await Preset.findOneAndUpdate(
      { id },
      { $pull: { 'layout.overlays': { id: overlayId } }, updatedAt: new Date() },
      { new: true }
    );
    res.json({ deleted: overlayId });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Serve preset overlay images
app.use('/preset-overlays/:presetId', (req, res, next) => {
  const dir = path.join(DATA_ROOT, 'preset_overlays', req.params.presetId);
  express.static(dir)(req, res, next);
});

// ── Per-preset logo ────────────────────────────────────────────────────────────
const presetLogoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(PRESET_LOGOS_DIR, req.params.id);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    cb(null, 'logo' + path.extname(file.originalname).toLowerCase());
  }
});
const presetLogoUpload = multer({ storage: presetLogoStorage });

app.post('/api/presets/:id/logo', presetLogoUpload.single('logo'), async (req, res) => {
  try {
    const { id } = req.params;
    const logoFile = req.file.filename;
    await Preset.findOneAndUpdate({ id }, { $set: { logoFile, updatedAt: new Date() } });
    res.json({ logoFile });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/presets/:id/logo', async (req, res) => {
  try {
    const { id } = req.params;
    const preset = await Preset.findOne({ id });
    if (preset?.logoFile) {
      const fp = path.join(PRESET_LOGOS_DIR, id, preset.logoFile);
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    await Preset.findOneAndUpdate({ id }, { $set: { logoFile: null, updatedAt: new Date() } });
    res.json({ deleted: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.use('/preset-logos/:presetId', (req, res, next) => {
  const dir = path.join(PRESET_LOGOS_DIR, req.params.presetId);
  express.static(dir)(req, res, next);
});

// ─── Multer configs ───────────────────────────────────────────────────────────
const batchStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(BATCHES_DIR, req.params.batchName, req.params.type);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});
const batchUpload = multer({ storage: batchStorage });

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ASSETS_DIR),
  filename: (req, file, cb) => cb(null, 'logo' + path.extname(file.originalname))
});
const logoUpload = multer({ storage: logoStorage });

const overlayStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, OVERLAYS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${req.params.token}${ext}`);
  }
});
const overlayUpload = multer({ storage: overlayStorage });

// ─── Batch Routes ─────────────────────────────────────────────────────────────
app.get('/api/batches', async (req, res) => {
  try {
    const dirs = fs.existsSync(BATCHES_DIR) ? fs.readdirSync(BATCHES_DIR) : [];
    const batches = dirs
      .filter(d => {
        try { return fs.statSync(path.join(BATCHES_DIR, d)).isDirectory(); } catch { return false; }
      })
      .map(name => {
        const vDir = path.join(BATCHES_DIR, name, 'videos');
        const iDir = path.join(BATCHES_DIR, name, 'images');
        const videoCount = fs.existsSync(vDir) ? fs.readdirSync(vDir).filter(isVideo).length : 0;
        const imageCount = fs.existsSync(iDir) ? fs.readdirSync(iDir).filter(isImage).length : 0;
        return { name, videoCount, imageCount };
      });
    res.json(batches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/batches', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const batchName = name.startsWith('BATCH_') ? name : `BATCH_${name}`;
    fs.mkdirSync(path.join(BATCHES_DIR, batchName, 'videos'), { recursive: true });
    fs.mkdirSync(path.join(BATCHES_DIR, batchName, 'images'), { recursive: true });
    res.json({ name: batchName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/batches/:batchName/files', (req, res) => {
  const { batchName } = req.params;
  const vDir = path.join(BATCHES_DIR, batchName, 'videos');
  const iDir = path.join(BATCHES_DIR, batchName, 'images');
  res.json({
    videos: fs.existsSync(vDir) ? fs.readdirSync(vDir).filter(isVideo) : [],
    images: fs.existsSync(iDir) ? fs.readdirSync(iDir).filter(isImage) : [],
  });
});

app.post('/api/batches/:batchName/upload/:type', batchUpload.array('files'), (req, res) => {
  res.json({ uploaded: req.files.map(f => f.originalname) });
});

app.delete('/api/batches/:batchName/:type/:filename', (req, res) => {
  const { batchName, type, filename } = req.params;
  const filePath = path.join(BATCHES_DIR, batchName, type, filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ deleted: filename });
});

// ─── Asset Routes ─────────────────────────────────────────────────────────────
app.post('/api/assets/logo', logoUpload.single('logo'), (req, res) => {
  res.json({ file: req.file.filename });
});

app.get('/api/assets/logo', (req, res) => {
  const files = fs.existsSync(ASSETS_DIR) ? fs.readdirSync(ASSETS_DIR).filter(f => /^logo\./i.test(f)) : [];
  res.json({ logo: files[0] || null });
});

// Upload SRT subtitle
app.post('/api/assets/subtitle/:token', overlayUpload.single('subtitle'), (req, res) => {
  res.json({ file: req.file.filename });
});

// Upload MP3/audio
app.post('/api/assets/audio/:token', overlayUpload.single('audio'), (req, res) => {
  res.json({ file: req.file.filename });
});

// Get current overlay files for a session token
app.get('/api/assets/overlays/:token', (req, res) => {
  const { token } = req.params;
  const files = fs.existsSync(OVERLAYS_DIR) ? fs.readdirSync(OVERLAYS_DIR) : [];
  const srt = files.find(f => f.startsWith(token) && f.endsWith('.srt')) || null;
  const audio = files.find(f => f.startsWith(token) && /\.(mp3|m4a|wav)$/.test(f)) || null;
  res.json({ srt, audio });
});

// Delete an overlay file
app.delete('/api/assets/overlays/:token/:type', (req, res) => {
  const { token, type } = req.params;
  const files = fs.existsSync(OVERLAYS_DIR) ? fs.readdirSync(OVERLAYS_DIR) : [];
  const match = files.find(f =>
    f.startsWith(token) && (type === 'srt' ? f.endsWith('.srt') : /\.(mp3|m4a|wav)$/.test(f))
  );
  if (match) fs.unlinkSync(path.join(OVERLAYS_DIR, match));
  res.json({ deleted: match || null });
});

// ─── Whisper Transcription ────────────────────────────────────────────────────
// In-memory transcription job store { [token]: { status, progress, error, srtFile } }
const transcriptionJobs = {};

app.post('/api/lyrics/transcribe/:token', async (req, res) => {
  const { token } = req.params;
  const { model = 'base' } = req.body; // tiny | base | small | medium | large

  // Find the uploaded audio for this token
  const files = fs.existsSync(OVERLAYS_DIR) ? fs.readdirSync(OVERLAYS_DIR) : [];
  const audioFile = files.find(f => f.startsWith(token) && /\.(mp3|m4a|wav)$/.test(f));
  if (!audioFile) return res.status(400).json({ error: 'No audio file found for this session. Upload an MP3 first.' });

  const audioPath = path.join(OVERLAYS_DIR, audioFile);
  transcriptionJobs[token] = { status: 'running', progress: 0, error: null, srtFile: null };
  res.json({ started: true });

  // Run whisper async
  runWhisper(token, audioPath, model).catch(e => {
    transcriptionJobs[token] = { status: 'error', progress: 0, error: e.message, srtFile: null };
  });
});

app.get('/api/lyrics/status/:token', (req, res) => {
  const job = transcriptionJobs[req.params.token];
  if (!job) return res.json({ status: 'idle' });
  res.json(job);
});

// Serve the SRT file content for preview/editing
app.get('/api/lyrics/srt/:token', (req, res) => {
  const { token } = req.params;
  const files = fs.existsSync(OVERLAYS_DIR) ? fs.readdirSync(OVERLAYS_DIR) : [];
  const srtFile = files.find(f => f.startsWith(token) && f.endsWith('.srt'));
  if (!srtFile) return res.status(404).json({ error: 'No SRT file found' });
  res.send(fs.readFileSync(path.join(OVERLAYS_DIR, srtFile), 'utf8'));
});

// Save edited SRT content back
app.put('/api/lyrics/srt/:token', express.text(), (req, res) => {
  const { token } = req.params;
  const files = fs.existsSync(OVERLAYS_DIR) ? fs.readdirSync(OVERLAYS_DIR) : [];
  const srtFile = files.find(f => f.startsWith(token) && f.endsWith('.srt'));
  const srtPath = srtFile
    ? path.join(OVERLAYS_DIR, srtFile)
    : path.join(OVERLAYS_DIR, `${token}.srt`);
  fs.writeFileSync(srtPath, req.body, 'utf8');
  res.json({ saved: true, file: path.basename(srtPath) });
});

async function runWhisper(token, audioPath, model) {
  return new Promise((resolve, reject) => {
    // Output to OVERLAYS_DIR, named by token so we can find it later
    const outputDir = OVERLAYS_DIR;
    // whisper outputs <basename>.srt — we'll rename after
    const baseName = path.basename(audioPath, path.extname(audioPath));

    const args = [
      '-m', 'whisper',
      audioPath,
      '--model', model,
      '--output_format', 'srt',
      '--output_dir', outputDir,
      '--verbose', 'False',
    ];

    console.log(`whisper transcription starting: python3 ${args.join(' ')}`);
    const proc = spawn('python3', args);
    let stderr = '';

    proc.stderr.on('data', d => {
      stderr += d.toString();
      // Try to parse rough progress from whisper output
      const match = stderr.match(/(\d+)%/g);
      if (match) {
        const pct = parseInt(match[match.length - 1]);
        transcriptionJobs[token].progress = pct;
      }
    });

    proc.on('close', code => {
      if (code !== 0) {
        const errMsg = stderr.includes('No module named whisper')
          ? 'Whisper not installed. Run: pip install openai-whisper'
          : `Whisper exited ${code}: ${stderr.slice(-300)}`;
        transcriptionJobs[token] = { status: 'error', progress: 0, error: errMsg, srtFile: null };
        return reject(new Error(errMsg));
      }

      // Rename whisper's output from <baseName>.srt to <token>.srt
      const whisperOut = path.join(outputDir, `${baseName}.srt`);
      const tokenSrt = path.join(outputDir, `${token}.srt`);
      if (fs.existsSync(whisperOut)) {
        // Convert SRT to karaoke-style ASS for centered display, save as .srt still
        // (we keep .srt format but pass karaoke style overrides via ffmpeg force_style)
        fs.renameSync(whisperOut, tokenSrt);
      }

      transcriptionJobs[token] = {
        status: 'done',
        progress: 100,
        error: null,
        srtFile: `${token}.srt`
      };
      resolve();
    });

    proc.on('error', err => {
      const msg = err.code === 'ENOENT'
        ? 'python3 not found. Make sure Python 3 is installed.'
        : err.message;
      transcriptionJobs[token] = { status: 'error', progress: 0, error: msg, srtFile: null };
      reject(new Error(msg));
    });
  });
}

// ─── Job Routes ───────────────────────────────────────────────────────────────
app.get('/api/jobs', async (req, res) => {
  const page  = Math.max(1, parseInt(req.query.page)  || 1);
  const limit = Math.min(50, parseInt(req.query.limit) || 10);
  const skip  = (page - 1) * limit;
  const total = await Job.countDocuments();
  const jobs  = await Job.find().sort({ createdAt: -1 }).skip(skip).limit(limit);
  res.json({ jobs, total, page, limit, pages: Math.ceil(total / limit) });
});

app.get('/api/jobs/:id', async (req, res) => {
  const job = await Job.findOne({ id: req.params.id });
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(job);
});

app.post('/api/generate', async (req, res) => {
  const {
    batchName, videoFiles, imageFiles,
    logoText, logoSubtext, quotes,
    textMaxChars,
    preferredDuration,
    sliceDuration, imageDuration,
    resolution,
    sessionToken,
    presetId,
    videoCount,
    fontFamily,
    fontSize,
    layout: requestLayout,
  } = req.body;

  if (!batchName) return res.status(400).json({ error: 'batchName required' });

  // Load generation config from preset if provided (preset values take authority)
  let layout = requestLayout || null;
  let presetFontFamily = 'default';
  let presetLogoFile = null;
  let resolvedSliceDuration     = Number(sliceDuration)     || 3;
  let resolvedImageDuration     = Number(imageDuration)     || 0.2;
  let resolvedPreferredDuration = Number(preferredDuration) || 0;
  if (presetId) {
    const preset = await Preset.findOne({ id: presetId });
    if (preset) {
      if (!layout && preset.layout) layout = preset.layout;
      if (preset.fontFamily) presetFontFamily = preset.fontFamily;
      if (preset.logoFile)   presetLogoFile   = preset.logoFile;
      if (preset.sliceDuration     != null) resolvedSliceDuration     = preset.sliceDuration;
      if (preset.imageDuration     != null) resolvedImageDuration     = preset.imageDuration;
      if (preset.preferredDuration != null) resolvedPreferredDuration = preset.preferredDuration;
    }
  }

  const jobId = uuidv4();
  let presetName = null;
  if (presetId) {
    const p = await Preset.findOne({ id: presetId });
    if (p) presetName = p.name;
  }
  const job = await Job.create({
    id: jobId, batchName, status: 'queued',
    videoFiles: videoFiles || [], imageFiles: imageFiles || [],
    logoText: logoText || '', logoSubtext: logoSubtext || '',
    resolution: resolution || '1920x1080',
    presetId: presetId || null,
    presetName: presetName || null,
    generationParams: {
      batchName, videoFiles, imageFiles, logoText, logoSubtext,
      quotes: quotes || '',
      textMaxChars, preferredDuration, sliceDuration, imageDuration,
      resolution, presetId, videoCount,
      fontFamily: fontFamily || 'default',
      fontSize: fontSize || null,
    },
  });

  res.json({ jobId });

  runGeneration(job, {
    batchName,
    videoFiles: videoFiles || [],
    imageFiles: imageFiles || [],
    logoText: logoText || '',
    logoSubtext: logoSubtext || '',
    quotes: quotes || '',
    textMaxChars: Number(textMaxChars) || 0,
    preferredDuration: resolvedPreferredDuration,
    sliceDuration: resolvedSliceDuration,
    imageDuration: resolvedImageDuration,
    resolution: resolution || '1920x1080',
    sessionToken: sessionToken || null,
    layout,
    presetId: presetId || null,
    videoCount: Number(videoCount) || 1,
    fontFamily: fontFamily || presetFontFamily || 'default',
    fontSize:   fontSize ? Number(fontSize) : null,
    presetLogoFile,
  }).catch(e => console.error('Generation error:', e));
});

app.post('/api/generate-posts', async (req, res) => {
  const {
    batchName, imageFiles, quotes, postCount,
    resolution, textMaxChars, layout, presetId,
    fontFamily, fontSize,
  } = req.body;

  if (!batchName) return res.status(400).json({ error: 'batchName required' });

  // Load layout + fontFamily + logoFile from preset if not explicitly provided
  let effectiveLayout = layout || null;
  let postPresetFontFamily = 'default';
  let postPresetLogoFile = null;
  if (presetId) {
    const preset = await Preset.findOne({ id: presetId });
    if (!effectiveLayout && preset?.layout) effectiveLayout = preset.layout;
    if (preset?.fontFamily) postPresetFontFamily = preset.fontFamily;
    if (preset?.logoFile) postPresetLogoFile = preset.logoFile;
  }

  let postPresetName = null;
  if (presetId) {
    const p = await Preset.findOne({ id: presetId });
    if (p) postPresetName = p.name;
  }
  const jobId = uuidv4();
  const job = await Job.create({
    id: jobId, batchName, status: 'queued',
    imageFiles: imageFiles || [],
    resolution: resolution || '1080x1080',
    type: 'post',
    presetId: presetId || null,
    presetName: postPresetName || null,
    generationParams: {
      batchName, imageFiles, quotes: quotes || '',
      postCount, resolution, textMaxChars, presetId,
      fontFamily: fontFamily || 'default',
      fontSize: fontSize || null,
      layout: layout || null,
    },
  });

  res.json({ jobId });

  runPostGeneration(job, {
    batchName,
    imageFiles: imageFiles || [],
    quotes:      quotes || '',
    postCount:   Number(postCount) || 10,
    resolution:  resolution || '1080x1080',
    textMaxChars: Number(textMaxChars) || 25,
    layout:      effectiveLayout,
    presetId:    presetId || null,
    fontFamily:  fontFamily || postPresetFontFamily || 'default',
    fontSize:    fontSize ? Number(fontSize) : null,
    presetLogoFile: postPresetLogoFile,
  }).catch(e => console.error('Post generation error:', e));
});

// ─── Video Generation ─────────────────────────────────────────────────────────
async function runGeneration(job, opts) {
  const { batchName, videoFiles, imageFiles, logoText, logoSubtext, quotes, textMaxChars, preferredDuration, sliceDuration, imageDuration, resolution, sessionToken, layout, presetId, videoCount = 1, fontFamily = 'default', fontSize = null, presetLogoFile = null, audioVolume = 1, audioStart = 0, audioEnd = 0 } = opts;
  const quoteLines = (quotes || '').split('\n').map(q => q.trim()).filter(Boolean);
  const batchDir = path.join(BATCHES_DIR, batchName);

  const abortCtrl = new AbortController();
  const signal    = abortCtrl.signal;
  activeJobControllers.set(job.id, abortCtrl);

  const addLog = async (msg) => {
    console.log(`[${job.id}] ${msg}`);
    await Job.updateOne({ id: job.id }, { $push: { log: msg } });
  };
  const setStatus = async (status, progress) => Job.updateOne({ id: job.id }, { status, progress });

  try {
    await setStatus('running', 5);
    await addLog('Starting video generation...');

    // ── Resolution ────────────────────────────────────────────────────────────
    const resConfig = RESOLUTIONS[resolution] || RESOLUTIONS['1920x1080'];
    const { w: W, h: H } = resConfig;
    await addLog(`Resolution: ${W}x${H}`);

    // ── Layout — resolve positions (% → px) ──────────────────────────────────
    const L = {
      logo:          { x: 50, y: 90, w: 18, enabled: true,  ...(layout?.logo      || {}) },
      subtitles:     { x: 50, y: 50, fontSize: 52, enabled: true, ...(layout?.subtitles || {}) },
      overlays:      layout?.overlays || [],
      dimBackground: layout?.dimBackground ?? 0,
      grain:         layout?.grain ?? 0,
    };

    // Apply explicit fontSize override if provided
    if (fontSize) L.subtitles.fontSize = fontSize;

    // Resolve font file for FFmpeg drawtext
    const fontFile = getFontFile(fontFamily);

    // Scale factors relative to 1920x1080 baseline
    const sf = W / 1920;
    const fontMain  = Math.round(L.subtitles.fontSize * sf);
    const fontSub   = Math.round(30 * sf);
    const logoW     = Math.round((L.logo.w / 100) * W);
    const padEdge   = Math.round(24 * sf);

    // Convert % positions to ffmpeg overlay expressions
    const logoXExpr = `${Math.round((L.logo.x / 100) * W)}-w/2`;
    const logoYExpr = `${Math.round((L.logo.y / 100) * H)}-h/2`;

    const subXPx     = Math.round((L.subtitles.x / 100) * W);
    const subYPx     = Math.round((L.subtitles.y / 100) * H);
    const subWidthPx = Math.round((L.subtitles.w / 100) * W);
    const textAlign  = L.subtitles.textAlign || 'center';
    let textXExpr;
    if (textAlign === 'left') {
      textXExpr = `${Math.max(0, Math.round(subXPx - subWidthPx / 2))}`;
    } else if (textAlign === 'right') {
      textXExpr = `${Math.round(subXPx + subWidthPx / 2)}-text_w`;
    } else {
      textXExpr = L.subtitles.x === 50 ? '(w-text_w)/2' : `${subXPx}-text_w/2`;
    }
    const textBold   = L.subtitles.textBold || false;
    const boldParams = textBold
      ? ':borderw=3:bordercolor=white@0.5:shadowcolor=black@0.9:shadowx=4:shadowy=4'
      : ':shadowcolor=black@0.8:shadowx=3:shadowy=3:borderw=2:bordercolor=black@0.5';
    const textYExpr = `${subYPx}`;
    const textYSub  = `${subYPx + Math.round(fontMain * 1.3)}`;

    // ── Assets ────────────────────────────────────────────────────────────────
    // Prefer per-preset logo if available, fall back to global logo
    let logoPath = null;
    if (L.logo.enabled) {
      if (presetLogoFile && presetId) {
        const presetLp = path.join(PRESET_LOGOS_DIR, presetId, presetLogoFile);
        if (fs.existsSync(presetLp)) logoPath = presetLp;
      }
      if (!logoPath) {
        const globalLogoFiles = fs.existsSync(ASSETS_DIR) ? fs.readdirSync(ASSETS_DIR).filter(f => /^logo\./i.test(f)) : [];
        if (globalLogoFiles.length > 0) logoPath = path.join(ASSETS_DIR, globalLogoFiles[0]);
      }
    }

    let srtPath = null;
    let audioPath = null;
    if (sessionToken) {
      const overlayFiles = fs.existsSync(OVERLAYS_DIR) ? fs.readdirSync(OVERLAYS_DIR) : [];
      const srtFile   = overlayFiles.find(f => f.startsWith(sessionToken) && f.endsWith('.srt'));
      const audioFile = overlayFiles.find(f => f.startsWith(sessionToken) && /\.(mp3|m4a|wav)$/.test(f));
      if (srtFile)   { srtPath   = path.join(OVERLAYS_DIR, srtFile);   await addLog(`SRT: ${srtFile}`); }
      if (audioFile) { audioPath = path.join(OVERLAYS_DIR, audioFile); await addLog(`Audio: ${audioFile}`); }
    }

    // Static overlay images from preset
    const staticOverlays = [];
    if (presetId && L.overlays.length > 0) {
      const presetOverlayDir = path.join(DATA_ROOT, 'preset_overlays', presetId);
      for (const ov of L.overlays) {
        const ovPath = fs.existsSync(presetOverlayDir)
          ? path.join(presetOverlayDir, ov.file)
          : null;
        if (ovPath && fs.existsSync(ovPath)) {
          const xPx = Math.round((ov.x / 100) * W);
          const yPx = Math.round((ov.y / 100) * H);
          const wPx = Math.round((ov.w / 100) * W);
          staticOverlays.push({ path: ovPath, xPx, yPx, wPx, id: ov.id });
        }
      }
      if (staticOverlays.length) await addLog(`Static overlays: ${staticOverlays.length}`);
    }

    const esc = (s) => (s || '').replace(/\\/g, '\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/%/g, '\\%');
    const safeText = esc(logoText);
    const safeSub  = esc(logoSubtext);

    // ── Convert SRT → ASS with layout-driven position (shared across all videos) ─
    let assPath = null;
    if (srtPath) {
      assPath = srtPath.replace(/\.srt$/i, '.ass');
      const srtContent = fs.readFileSync(srtPath, 'utf8');
      const fontNameForAss = fontFamily !== 'default' ? (AVAILABLE_FONTS.find(f => f.id === fontFamily)?.name || 'Arial') : 'Arial';
      const assContent = srtToAss(srtContent, fontMain, W, H, subXPx, subYPx, fontNameForAss);
      fs.writeFileSync(assPath, assContent, 'utf8');
      await addLog(`Converted SRT to ASS (position: ${L.subtitles.x}%, ${L.subtitles.y}%)`);
    }

    // ── Filter builder ────────────────────────────────────────────────────────
    const fontFileParam = fontFile ? `fontfile='${fontFile}':` : '';
    const buildOverlayFilters = (inputLabel, logoIdx, extraInputStart, quoteText = '') => {
      const filters = [];
      let cur = inputLabel;
      let nextIdx = extraInputStart;

      // Grain before any overlays
      if (L.grain > 0) {
        const strength = Math.round(L.grain * 60);
        filters.push(`[${cur}]noise=c0s=${strength}:c0f=t+u[bg_grain]`);
        cur = 'bg_grain';
      }

      // Dim background before overlaying elements
      if (L.dimBackground > 0) {
        const factor = parseFloat((1 - L.dimBackground).toFixed(3));
        filters.push(`[${cur}]colorchannelmixer=rr=${factor}:gg=${factor}:bb=${factor}[bg_dimmed]`);
        cur = 'bg_dimmed';
      }

      // Logo
      if (logoPath && logoIdx !== null) {
        filters.push(`[${logoIdx}:v]scale=${logoW}:-1[logo_s]`);
        filters.push(`[${cur}][logo_s]overlay=${logoXExpr}:${logoYExpr}[after_logo]`);
        cur = 'after_logo';
      }

      // Static image overlays
      for (let i = 0; i < staticOverlays.length; i++) {
        const ov = staticOverlays[i];
        const tag = `ov${i}`;
        filters.push(`[${nextIdx}:v]scale=${ov.wPx}:-1[${tag}_s]`);
        filters.push(`[${cur}][${tag}_s]overlay=${ov.xPx}:${ov.yPx}[${tag}_out]`);
        cur = `${tag}_out`;
        nextIdx++;
      }

      // Subtitles (ASS burned in final pass, plain text here)
      const activeText = quoteText || logoText || '';
      if (!assPath && activeText) {
        const escLine = (l) => l.replace(/\\/g, '\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/\[/g, '\\[').replace(/\]/g, '\\]').replace(/%/g, '\\%');
        const mainLines = wrapText(activeText, textMaxChars).map(escLine);
        const subLines  = (!quoteText && logoSubtext && safeSub) ? wrapText(logoSubtext || '', textMaxChars).map(escLine) : [];

        const lineH      = Math.round(fontMain * 1.3);
        const subLineH   = Math.round(fontSub  * 1.3);
        const totalMainH = mainLines.length * lineH;
        const blockH     = totalMainH + (subLines.length > 0 ? Math.round(fontMain * 0.5) + subLines.length * subLineH : 0);

        let dtIdx = 0;
        mainLines.forEach((line, idx) => {
          const yPx = Math.max(0, subYPx - Math.round(blockH / 2) + idx * lineH);
          const outLabel = 'dt' + (dtIdx++);
          filters.push('[' + cur + ']drawtext=' + fontFileParam + 'fontsize=' + fontMain + ':fontcolor=white:x=' + textXExpr + ':y=' + yPx + ":text='" + line + "'" + boldParams + '[' + outLabel + ']');
          cur = outLabel;
        });

        subLines.forEach((line, idx) => {
          const yPx = Math.max(0, subYPx - Math.round(blockH / 2) + totalMainH + Math.round(fontMain * 0.5) + idx * subLineH);
          const outLabel = 'dt' + (dtIdx++);
          filters.push('[' + cur + ']drawtext=' + fontFileParam + 'fontsize=' + fontSub + ':fontcolor=white@0.9:x=' + textXExpr + ':y=' + yPx + ":text='" + line + "':shadowcolor=black@0.8:shadowx=2:shadowy=2[" + outLabel + ']');
          cur = outLabel;
        });
      }

      return { filters, finalLabel: cur };
    };

    // ── Multi-video loop ──────────────────────────────────────────────────────
    const effectiveCount = Math.max(1, Math.min(20, Math.round(videoCount)));
    let outputFolder = null;
    const allOutputFiles  = [];
    const allVideoQuotes  = [];
    const allVideoMetadata = {};

    // Shuffle quotes once so each video gets a unique quote in order.
    // If there are more videos than quotes, cycle through the shuffled list.
    const shuffledQuotes = shuffle([...quoteLines]);

    // Detect best available llama model once (best-effort — metadata is optional)
    let ollamaModel = null;
    try {
      const tr = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
      if (tr.ok) {
        const { models = [] } = await tr.json();
        const names = models.map(m => m.name);
        ollamaModel = names.find(n => n.includes('llama3')) || names.find(n => n.includes('llama')) || null;
      }
    } catch {}
    if (ollamaModel) await addLog(`Metadata model: ${ollamaModel}`);

    if (effectiveCount > 1) {
      outputFolder = `${batchName.replace(/\s+/g, '_')}_${Date.now()}`;
      fs.mkdirSync(path.join(OUTPUT_DIR, outputFolder), { recursive: true });
      await addLog(`Generating ${effectiveCount} videos → folder: ${outputFolder}`);
    }

    let lastClips = [];
    let lastDuration = 0;

    for (let vidIdx = 0; vidIdx < effectiveCount; vidIdx++) {
      const fileName = effectiveCount > 1 ? `output_${vidIdx + 1}.mp4` : `output_${job.id}.mp4`;
      const outputPath = effectiveCount > 1
        ? path.join(OUTPUT_DIR, outputFolder, fileName)
        : path.join(OUTPUT_DIR, fileName);
      const storedName = effectiveCount > 1 ? `${outputFolder}/${fileName}` : fileName;

      const localTmpDir = path.join(OUTPUT_DIR, `tmp_${job.id}_${vidIdx}`);
      fs.mkdirSync(localTmpDir, { recursive: true });

      if (effectiveCount > 1) await addLog(`--- Video ${vidIdx + 1} / ${effectiveCount} ---`);

      // Pick quote by index — each video gets a unique quote; cycles if more videos than quotes
      const videoQuote = shuffledQuotes.length > 0
        ? shuffledQuotes[vidIdx % shuffledQuotes.length]
        : '';
      if (videoQuote) await addLog(`Quote: "${videoQuote.slice(0, 60)}${videoQuote.length > 60 ? '…' : ''}"`);


      // Scale progress for this video within overall job progress (5–95%)
      const pBase  = 5 + (vidIdx / effectiveCount) * 90;
      const pRange = 90 / effectiveCount;
      const localSetStatus = async (pct) => setStatus('running', Math.round(pBase + (pct / 100) * pRange));

      try {
        const parts = [];

        // ── Step 1: Video slices ──────────────────────────────────────────────
        const vDir = path.join(batchDir, 'videos');
        const selectedVideos = videoFiles.length > 0
          ? videoFiles.filter(f => fs.existsSync(path.join(vDir, f)))
          : (fs.existsSync(vDir) ? fs.readdirSync(vDir).filter(isVideo) : []);

        if (selectedVideos.length > 0) {
          let targetDur = 0;
          if (audioPath) {
            targetDur = await getVideoDuration(audioPath).catch(() => 0);
          }
          if (preferredDuration > 0) {
            targetDur = audioPath ? Math.min(targetDur, preferredDuration) : preferredDuration;
          }
          const fillToAudio = targetDur > 0;
          await addLog(`Processing videos — target: ${fillToAudio ? targetDur.toFixed(1) + 's' : 'one pass'}${preferredDuration > 0 ? ' (preferred duration)' : ''}`);

          let totalSliced = 0;
          let sliceIndex  = 0;
          let pass        = 0;

          while (true) {
            const shuffled = shuffle([...selectedVideos]);

            for (let i = 0; i < shuffled.length; i++) {
              if (fillToAudio && totalSliced >= targetDur) break;

              const src = path.join(vDir, shuffled[i]);
              const out = path.join(localTmpDir, `vslice_${sliceIndex}.mp4`);
              const srcDur = await getVideoDuration(src);

              const remaining    = fillToAudio ? targetDur - totalSliced : sliceDuration;
              const thisSliceDur = Math.min(sliceDuration, remaining, srcDur);
              if (thisSliceDur <= 0) break;

              const maxStart  = Math.max(0, srcDur - thisSliceDur);
              const startTime = Math.random() * maxStart;
              await addLog(`  Slice ${sliceIndex + 1}: ${shuffled[i]} at ${startTime.toFixed(2)}s for ${thisSliceDur.toFixed(2)}s (total so far: ${totalSliced.toFixed(1)}s)`);

              const logoInputArgs   = logoPath ? ['-i', logoPath] : [];
              const logoIdx         = logoPath ? 1 : null;
              const staticInputArgs = staticOverlays.map(ov => ['-i', ov.path]).flat();
              const extraInputStart = (logoPath ? 2 : 1);

              const scalePart = `[0:v]fps=30,trim=start=${startTime.toFixed(3)}:duration=${thisSliceDur.toFixed(3)},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[scaled]`;
              const { filters, finalLabel } = buildOverlayFilters('scaled', logoIdx, extraInputStart, videoQuote);
              const filterComplex = [scalePart, ...filters].join(';');

              let sliceOk = false;
              try {
                await ffmpegRun([
                  '-i', src,
                  ...logoInputArgs,
                  ...staticInputArgs,
                  '-filter_complex', filterComplex,
                  '-map', `[${finalLabel}]`,
                  '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
                  '-an',
                  '-y', out
                ], signal);
                const actualDur = await getVideoDuration(out).catch(() => 0);
                if (actualDur < 0.1) {
                  await addLog(`  WARNING: slice ${sliceIndex + 1} produced empty output (${actualDur.toFixed(2)}s), skipping`);
                  if (fs.existsSync(out)) fs.unlinkSync(out);
                } else {
                  sliceOk = true;
                }
              } catch (sliceErr) {
                await addLog(`  WARNING: slice ${sliceIndex + 1} failed (${sliceErr.message.slice(0, 120)}), skipping`);
                if (fs.existsSync(out)) fs.unlinkSync(out);
              }

              if (sliceOk) {
                parts.push(out);
                totalSliced += thisSliceDur;
                sliceIndex++;
              }

              const pct = fillToAudio ? Math.min(totalSliced / targetDur, 1) : (sliceIndex / selectedVideos.length);
              await localSetStatus(Math.round(pct * 55));
            }

            if (!fillToAudio || totalSliced >= targetDur) break;
            pass++;
            if (pass > 50) { await addLog('Safety limit: stopping after 50 passes'); break; }
          }

          await addLog(`Video slicing complete: ${sliceIndex} slices, ${totalSliced.toFixed(1)}s total`);
        }

        // ── Step 2: Image slideshow ───────────────────────────────────────────
        const iDir = path.join(batchDir, 'images');
        const selectedImages = imageFiles.length > 0
          ? imageFiles.filter(f => fs.existsSync(path.join(iDir, f)))
          : (fs.existsSync(iDir) ? fs.readdirSync(iDir).filter(isImage) : []);

        if (selectedImages.length > 0) {
          let imgTargetDur = 0;
          if (preferredDuration > 0) {
            imgTargetDur = Math.max(0, preferredDuration - (parts.reduce((s, p) => s, 0)));
          } else if (audioPath) {
            const audioDur = await getVideoDuration(audioPath).catch(() => 0);
            imgTargetDur = Math.max(0, audioDur);
          }

          const imgFillToTarget = imgTargetDur > 0;
          await addLog(`Processing images — target: ${imgFillToTarget ? imgTargetDur.toFixed(1) + 's' : 'one pass'}`);

          const imageSequence = [];
          if (imgFillToTarget) {
            let filled = 0;
            let pass = 0;
            while (filled < imgTargetDur && pass < 200) {
              const shuffled = shuffle([...selectedImages]);
              for (const img of shuffled) {
                const remaining = imgTargetDur - filled;
                const thisDur = Math.min(imageDuration, remaining);
                if (thisDur <= 0.05) break;
                imageSequence.push({ img, dur: thisDur });
                filled += thisDur;
                if (filled >= imgTargetDur) break;
              }
              pass++;
            }
          } else {
            shuffle([...selectedImages]).forEach(img => imageSequence.push({ img, dur: imageDuration }));
          }

          await addLog(`  Image sequence: ${imageSequence.length} frames totalling ${imageSequence.reduce((s,x) => s+x.dur, 0).toFixed(1)}s`);

          const logoInputArgs = logoPath ? ['-i', logoPath] : [];
          const logoIdx = logoPath ? imageSequence.length : null;
          const staticInputArgs = staticOverlays.map(ov => ['-i', ov.path]).flat();
          const extraInputStart = imageSequence.length + (logoPath ? 1 : 0);

          const imgInputArgs = [];
          imageSequence.forEach(({ img, dur }) => {
            imgInputArgs.push('-loop', '1', '-t', dur.toFixed(3), '-i', path.join(iDir, img));
          });

          let filterParts = [];
          for (let i = 0; i < imageSequence.length; i++) {
            filterParts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30[v${i}]`);
          }
          const concatInputs = imageSequence.map((_, i) => `[v${i}]`).join('');
          filterParts.push(`${concatInputs}concat=n=${imageSequence.length}:v=1:a=0[slide]`);

          const { filters, finalLabel } = buildOverlayFilters('slide', logoIdx, extraInputStart, videoQuote);
          filterParts = [...filterParts, ...filters];

          const slideshowOut = path.join(localTmpDir, 'slideshow.mp4');
          await ffmpegRun([
            ...imgInputArgs,
            ...logoInputArgs,
            ...staticInputArgs,
            '-filter_complex', filterParts.join(';'),
            '-map', `[${finalLabel}]`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-an',
            '-y', slideshowOut
          ], signal);
          parts.push(slideshowOut);
          await localSetStatus(75);
          await addLog('Slideshow segment created.');
        }

        if (parts.length === 0) throw new Error('No video or image files to process.');

        // ── Step 3: Concatenate ───────────────────────────────────────────────
        await addLog('Concatenating all segments...');
        await localSetStatus(82);

        const silentOut = path.join(localTmpDir, 'silent_output.mp4');
        if (parts.length === 1) {
          fs.copyFileSync(parts[0], silentOut);
        } else {
          const listFile = path.join(localTmpDir, 'concat_list.txt');
          fs.writeFileSync(listFile, parts.map(p => `file '${p}'`).join('\n'));
          await ffmpegRun(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-y', silentOut], signal);
        }

        // ── Step 4: Mix audio ─────────────────────────────────────────────────
        const preSubsPath = assPath
          ? path.join(localTmpDir, 'pre_subs.mp4')
          : outputPath;

        if (audioPath) {
          await addLog('Mixing audio...');
          await localSetStatus(88);
          const muxTarget = assPath ? path.join(localTmpDir, 'pre_subs.mp4') : preSubsPath;
          const limitArgs = preferredDuration > 0
            ? ['-t', String(preferredDuration)]
            : ['-shortest'];
          const audioFilters = [];
          if (audioStart > 0 || audioEnd > 0) {
            const trimFilter = audioEnd > 0
              ? `atrim=start=${audioStart}:end=${audioEnd}`
              : `atrim=start=${audioStart}`;
            audioFilters.push(trimFilter, 'asetpts=PTS-STARTPTS');
          }
          if (audioVolume !== 1) audioFilters.push(`volume=${audioVolume}`);

          await ffmpegRun([
            '-i', silentOut,
            '-i', audioPath,
            '-map', '0:v',
            '-map', '1:a',
            '-c:v', assPath ? 'copy' : 'libx264',
            ...(assPath ? [] : ['-preset', 'fast', '-crf', '23']),
            '-c:a', 'aac', '-b:a', '192k',
            ...(audioFilters.length > 0 ? ['-af', audioFilters.join(',')] : []),
            ...limitArgs,
            '-y', muxTarget
          ], signal);
        } else {
          const trimArgs = preferredDuration > 0 ? ['-t', String(preferredDuration)] : [];
          if (trimArgs.length > 0) {
            await ffmpegRun(['-i', silentOut, ...trimArgs, '-c', 'copy', '-y', preSubsPath], signal);
          } else {
            fs.copyFileSync(silentOut, preSubsPath);
          }
          if (!assPath) {
            if (trimArgs.length > 0) {
              await ffmpegRun(['-i', silentOut, ...trimArgs, '-c', 'copy', '-y', outputPath], signal);
            } else {
              fs.copyFileSync(silentOut, outputPath);
            }
          }
        }

        // ── Step 5: Burn ASS subtitles ────────────────────────────────────────
        if (assPath) {
          await addLog('Burning karaoke subtitles onto final video...');
          await localSetStatus(95);
          const safeAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
          await ffmpegRun([
            '-i', preSubsPath,
            '-vf', `ass='${safeAss}'`,
            '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
            '-c:a', 'copy',
            ...(preferredDuration > 0 ? ['-t', String(preferredDuration)] : []),
            '-y', outputPath
          ], signal);
        }

        // Clip metadata (for the editor — only meaningful for single-video jobs)
        const clips = [];
        let cursor = 0;
        for (let i = 0; i < parts.length; i++) {
          const dur = await getVideoDuration(parts[i]).catch(() => 3);
          const partBase = path.basename(parts[i]);
          let src = partBase;
          let clipType = 'video';
          if (partBase === 'slideshow.mp4') { clipType = 'image'; src = 'slideshow'; }
          else if (partBase.startsWith('vslice_')) { const idx = parseInt(partBase.replace('vslice_','').replace('.mp4','')); src = selectedVideos[idx] || partBase; }
          clips.push({ id: uuidv4(), clipType, src, startTime: cursor, clipDuration: dur, trimIn: 0, trimOut: dur, order: i });
          cursor += dur;
        }
        const totalDuration = await getVideoDuration(outputPath).catch(() => cursor);

        lastClips    = clips;
        lastDuration = totalDuration;
        allOutputFiles.push(storedName);
        allVideoQuotes.push({ file: storedName, quote: videoQuote });
        await addLog(`Video ${vidIdx + 1} complete: ${storedName}`);

        // ── Auto-generate metadata (best-effort, won't fail the job) ─────────
        if (ollamaModel && videoQuote) {
          try {
            await addLog(`Generating metadata for video ${vidIdx + 1}…`);
            const meta = await generateVideoMeta(videoQuote, resolution, ollamaModel);
            if (Object.keys(meta).length > 0) {
              allVideoMetadata[storedName] = meta;
              await addLog(`Metadata ready: ${Object.keys(meta).join(', ')}`);
            }
          } catch { /* metadata is optional */ }
        }

      } finally {
        fs.rmSync(localTmpDir, { recursive: true, force: true });
      }
    }

    await setStatus('done', 100);
    await Job.updateOne({ id: job.id }, { $set: {
      outputFile:    allOutputFiles[0],
      outputFiles:   allOutputFiles,
      videoQuotes:   allVideoQuotes,
      ...(Object.keys(allVideoMetadata).length > 0 ? { videoMetadata: allVideoMetadata } : {}),
      ...(outputFolder ? { outputFolder } : {}),
      duration: lastDuration,
      clips:    lastClips,
    }});
    await addLog(effectiveCount > 1
      ? `Done! ${effectiveCount} videos saved to folder: ${outputFolder}`
      : `Done! Output: ${allOutputFiles[0]}`);

  } catch (err) {
    if (signal.aborted) {
      await setStatus('cancelled', 0);
    } else {
      await addLog(`ERROR: ${err.message}`);
      await setStatus('error', 0);
    }
    // tmpDirs are cleaned up in per-video finally blocks
  } finally {
    activeJobControllers.delete(job.id);
  }
}

// ─── Post Generation ──────────────────────────────────────────────────────────
async function runPostGeneration(job, opts) {
  const { batchName, imageFiles, quotes, postCount, resolution, textMaxChars, layout, presetId, fontFamily = 'default', fontSize = null, presetLogoFile = null } = opts;

  const abortCtrl = new AbortController();
  const signal    = abortCtrl.signal;
  activeJobControllers.set(job.id, abortCtrl);

  const addLog = async (msg) => {
    console.log(`[${job.id}] ${msg}`);
    await Job.updateOne({ id: job.id }, { $push: { log: msg } });
  };
  const setStatus = async (status, progress) => Job.updateOne({ id: job.id }, { status, progress });

  try {
    await setStatus('running', 5);
    await addLog('Starting post generation...');

    // ── Resolution ────────────────────────────────────────────────────────────
    const resConfig = RESOLUTIONS[resolution] || RESOLUTIONS['1080x1080'];
    const { w: W, h: H } = resConfig;
    await addLog(`Resolution: ${W}x${H}`);

    // ── Layout ────────────────────────────────────────────────────────────────
    const L = {
      logo:          { x: 50, y: 88, w: 15, enabled: true,  ...(layout?.logo      || {}) },
      subtitles:     { x: 50, y: 50, fontSize: 64, enabled: true, ...(layout?.subtitles || {}) },
      overlays:      layout?.overlays || [],
      dimBackground: layout?.dimBackground ?? 0,
      grain:         layout?.grain ?? 0,
    };

    // Apply explicit fontSize override if provided
    if (fontSize) L.subtitles.fontSize = fontSize;

    // Resolve font file for FFmpeg drawtext
    const postFontFile = getFontFile(fontFamily);
    const postFontFileParam = postFontFile ? `fontfile='${postFontFile}':` : '';

    const sf       = W / 1920;
    const fontMain = Math.round(L.subtitles.fontSize * sf);
    const logoW    = Math.round((L.logo.w / 100) * W);

    const logoXExpr = `${Math.round((L.logo.x / 100) * W)}-w/2`;
    const logoYExpr = `${Math.round((L.logo.y / 100) * H)}-w/2`;

    const subXPx     = Math.round((L.subtitles.x / 100) * W);
    const subYPx     = Math.round((L.subtitles.y / 100) * H);
    const subWidthPx = Math.round((L.subtitles.w / 100) * W);
    const postTextAlign = L.subtitles.textAlign || 'center';
    let textXExpr;
    if (postTextAlign === 'left') {
      textXExpr = `${Math.max(0, Math.round(subXPx - subWidthPx / 2))}`;
    } else if (postTextAlign === 'right') {
      textXExpr = `${Math.round(subXPx + subWidthPx / 2)}-text_w`;
    } else {
      textXExpr = L.subtitles.x === 50 ? '(w-text_w)/2' : `${subXPx}-text_w/2`;
    }
    const postTextBold = L.subtitles.textBold || false;
    const postBoldParams = postTextBold
      ? ':borderw=3:bordercolor=white@0.5:shadowcolor=black@0.9:shadowx=4:shadowy=4'
      : ':shadowcolor=black@0.8:shadowx=3:shadowy=3:borderw=2:bordercolor=black@0.5';

    // ── Assets ────────────────────────────────────────────────────────────────
    // Prefer per-preset logo if available, fall back to global logo
    let logoPath = null;
    if (L.logo.enabled) {
      if (presetLogoFile && presetId) {
        const presetLp = path.join(PRESET_LOGOS_DIR, presetId, presetLogoFile);
        if (fs.existsSync(presetLp)) logoPath = presetLp;
      }
      if (!logoPath) {
        const globalLogoFiles = fs.existsSync(ASSETS_DIR) ? fs.readdirSync(ASSETS_DIR).filter(f => /^logo\./i.test(f)) : [];
        if (globalLogoFiles.length > 0) logoPath = path.join(ASSETS_DIR, globalLogoFiles[0]);
      }
    }

    // Static overlays from preset
    const staticOverlays = [];
    if (presetId && L.overlays.length > 0) {
      const presetOverlayDir = path.join(DATA_ROOT, 'preset_overlays', presetId);
      for (const ov of L.overlays) {
        const ovPath = fs.existsSync(presetOverlayDir) ? path.join(presetOverlayDir, ov.file) : null;
        if (ovPath && fs.existsSync(ovPath)) {
          staticOverlays.push({
            path: ovPath,
            xPx:  Math.round((ov.x / 100) * W),
            yPx:  Math.round((ov.y / 100) * H),
            wPx:  Math.round((ov.w / 100) * W),
          });
        }
      }
    }

    // ── Image pool ────────────────────────────────────────────────────────────
    const iDir = path.join(BATCHES_DIR, batchName, 'images');
    const availableImages = (imageFiles && imageFiles.length > 0)
      ? imageFiles.filter(f => fs.existsSync(path.join(iDir, f)))
      : (fs.existsSync(iDir) ? fs.readdirSync(iDir).filter(isImage) : []);

    if (availableImages.length === 0) throw new Error('No images found in selected batch.');

    // ── Quotes pool ───────────────────────────────────────────────────────────
    const quoteLines = (quotes || '').split('\n').map(q => q.trim()).filter(q => q.length > 0);

    // Effective count — stop at min(userCount, images, quotes if provided)
    let count = Math.max(1, Math.min(100, Number(postCount) || 10));
    count = Math.min(count, availableImages.length);
    if (quoteLines.length > 0) count = Math.min(count, quoteLines.length);

    await addLog(`Generating ${count} post${count !== 1 ? 's' : ''} (${availableImages.length} images, ${quoteLines.length || 'no'} quotes)`);

    // ── Output folder ─────────────────────────────────────────────────────────
    const folderName = `posts_${batchName.replace(/\s+/g, '_')}_${Date.now()}`;
    const folderPath = path.join(OUTPUT_DIR, folderName);
    fs.mkdirSync(folderPath, { recursive: true });

    const maxChars      = Number(textMaxChars) || 25;
    const outputImages  = [];
    const postQuoteLog  = []; // track quote per output file for metadata

    for (let i = 0; i < count; i++) {
      const imgPath = path.join(iDir, availableImages[i]);
      const quote   = quoteLines[i] || '';
      const outFile = `post_${String(i + 1).padStart(3, '0')}.jpg`;
      const outPath = path.join(folderPath, outFile);

      // ── Build FFmpeg filter chain ─────────────────────────────────────────
      const filterParts  = [];
      const inputArgs    = ['-i', imgPath];
      let   cur          = 'scaled';
      let   nextInputIdx = 1;

      // Scale + crop to exact resolution
      filterParts.push(`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[scaled]`);

      // Grain before any overlays
      if (L.grain > 0) {
        const strength = Math.round(L.grain * 60);
        filterParts.push(`[${cur}]noise=c0s=${strength}:c0f=t+u[bg_grain]`);
        cur = 'bg_grain';
      }

      // Background dim
      if (L.dimBackground > 0) {
        const factor = parseFloat((1 - L.dimBackground).toFixed(3));
        filterParts.push(`[${cur}]colorchannelmixer=rr=${factor}:gg=${factor}:bb=${factor}[bg_dimmed]`);
        cur = 'bg_dimmed';
      }

      // Logo overlay
      if (logoPath) {
        inputArgs.push('-i', logoPath);
        const logoIdx = nextInputIdx++;
        filterParts.push(`[${logoIdx}:v]scale=${logoW}:-1[logo_s]`);
        filterParts.push(`[${cur}][logo_s]overlay=${logoXExpr}:${logoYExpr}[after_logo]`);
        cur = 'after_logo';
      }

      // Static image overlays from preset
      for (let j = 0; j < staticOverlays.length; j++) {
        const ov  = staticOverlays[j];
        const tag = `ov${j}`;
        inputArgs.push('-i', ov.path);
        const idx = nextInputIdx++;
        filterParts.push(`[${idx}:v]scale=${ov.wPx}:-1[${tag}_s]`);
        filterParts.push(`[${cur}][${tag}_s]overlay=${ov.xPx}:${ov.yPx}[${tag}_out]`);
        cur = `${tag}_out`;
      }

      // Quote text (drawtext, multi-line via chaining)
      if (quote && L.subtitles.enabled) {
        const escLine = (l) => l
          .replace(/\\/g, '\\\\')
          .replace(/'/g, '\u2019')
          .replace(/:/g, '\\:')
          .replace(/\[/g, '\\[')
          .replace(/\]/g, '\\]')
          .replace(/%/g, '\\%');

        const lines  = wrapText(quote, maxChars).map(escLine);
        const lineH  = Math.round(fontMain * 1.4);
        const blockH = lines.length * lineH;

        lines.forEach((line, idx) => {
          const yPx      = Math.max(0, subYPx - Math.round(blockH / 2) + idx * lineH);
          const outLabel = `dtp${i}_${idx}`;
          filterParts.push(
            `[${cur}]drawtext=${postFontFileParam}fontsize=${fontMain}:fontcolor=white:x=${textXExpr}:y=${yPx}` +
            `:text='${line}'${postBoldParams}[${outLabel}]`
          );
          cur = outLabel;
        });
      }

      try {
        await ffmpegRun([
          ...inputArgs,
          '-filter_complex', filterParts.join(';'),
          '-map', `[${cur}]`,
          '-frames:v', '1',
          '-q:v', '3',
          '-y', outPath,
        ], signal);
        const storedName = `${folderName}/${outFile}`;
        outputImages.push(storedName);
        if (quote) postQuoteLog.push({ file: storedName, quote });
        const preview = quote ? ` — "${quote.slice(0, 45)}${quote.length > 45 ? '…' : ''}"` : '';
        await addLog(`Post ${i + 1}/${count}: ${availableImages[i]}${preview}`);
      } catch (err) {
        await addLog(`  WARNING: post ${i + 1} failed — ${err.message.slice(0, 100)}`);
      }

      await setStatus('running', 5 + Math.round(((i + 1) / count) * 90));
    }

    if (outputImages.length === 0) throw new Error('All posts failed to generate.');

    await setStatus('done', 100);
    await Job.updateOne({ id: job.id }, { $set: {
      outputFile:   outputImages[0],
      outputFiles:  outputImages,
      outputFolder: folderName,
      type:         'post',
      videoQuotes:  postQuoteLog,
    }});
    await addLog(`Done! ${outputImages.length} post${outputImages.length !== 1 ? 's' : ''} saved to: ${folderName}`);

  } catch (err) {
    if (signal.aborted) {
      await setStatus('cancelled', 0);
    } else {
      await addLog(`ERROR: ${err.message}`);
      await setStatus('error', 0);
    }
  } finally {
    activeJobControllers.delete(job.id);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Wrap text at maxChars per line, splitting on word boundaries
function wrapText(text, maxChars) {
  if (!maxChars || maxChars <= 0 || text.length <= maxChars) return [text];
  const words = text.split(' ');
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function isVideo(f) { return /\.(mp4|mov|avi|mkv|webm|m4v)$/i.test(f); }
function isImage(f) { return /\.(jpg|jpeg|png|webp|bmp|tiff)$/i.test(f); }
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Parse SRT timestamp "00:00:05,240" → seconds
function srtTimeToSeconds(t) {
  const [hms, ms] = t.trim().split(',');
  const [h, m, s] = hms.split(':').map(Number);
  return h * 3600 + m * 60 + s + Number(ms) / 1000;
}

// Seconds → ASS timestamp "0:00:05.24"
function secondsToAssTime(secs) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = (secs % 60).toFixed(2).padStart(5, '0');
  return `${h}:${String(m).padStart(2, '0')}:${s}`;
}

// Get the end time of the last subtitle entry in seconds
function getSrtDuration(srtContent) {
  const matches = [...srtContent.matchAll(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/g)];
  if (!matches.length) return 0;
  const last = matches[matches.length - 1];
  return srtTimeToSeconds(last[2]); // end timestamp of last cue
}

// Convert SRT content to ASS with position-aware styling
// subXPct: 0-100% from left, subYPct: 0-100% from top
function srtToAss(srtContent, fontSize, W, H, subXPx, subYPx, fontName = 'Arial') {
  // Determine ASS alignment and margins from position
  // ASS numpad alignment: 1=BL 2=BC 3=BR 4=ML 5=MC 6=MR 7=TL 8=TC 9=TR
  const xPct = subXPx != null ? (subXPx / W) * 100 : 50;
  const yPct = subYPx != null ? (subYPx / H) * 100 : 50;

  let alignment, marginL, marginR, marginV;
  if (yPct < 33) {
    alignment = 8; // top-center
    marginV = subYPx ?? Math.round(H * 0.05);
  } else if (yPct > 66) {
    alignment = 2; // bottom-center
    marginV = H - (subYPx ?? Math.round(H * 0.9));
  } else {
    alignment = 5; // middle-center
    marginV = 0;
  }
  marginL = xPct < 40 ? (subXPx ?? 10) : 10;
  marginR = xPct > 60 ? (W - (subXPx ?? W - 10)) : 10;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,${fontName},${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,${alignment},${marginL},${marginR},${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const blocks = srtContent.trim().split(/\n\n+/);
  const events = blocks.map(block => {
    const lines = block.split('\n');
    const timeLine = lines[1] || '';
    const match = timeLine.match(/(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})/);
    if (!match) return null;
    const start = secondsToAssTime(srtTimeToSeconds(match[1]));
    const end   = secondsToAssTime(srtTimeToSeconds(match[2]));
    const text  = lines.slice(2).join('\\N').replace(/<[^>]+>/g, '');
    return `Dialogue: 0,${start},${end},Karaoke,,0,0,0,,${text}`;
  }).filter(Boolean);

  return header + events.join('\n') + '\n';
}

function getVideoDuration(filePath) {
  return new Promise((resolve) => {
    const proc = spawn('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', () => resolve(isNaN(parseFloat(out)) ? 10 : parseFloat(out)));
    proc.on('error', () => resolve(10));
  });
}

// ─── Active job abort controllers ────────────────────────────────────────────
const activeJobControllers = new Map(); // jobId → AbortController

app.post('/api/jobs/:id/abort', async (req, res) => {
  const ctrl = activeJobControllers.get(req.params.id);
  if (ctrl) ctrl.abort();
  await Job.updateOne({ id: req.params.id, status: { $in: ['queued', 'running'] } }, { status: 'cancelled', progress: 0 });
  res.json({ ok: true });
});

function ffmpegRun(args, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Job cancelled'));
    console.log('ffmpeg', args.join(' '));
    const proc = spawn('ffmpeg', args);
    let errOut = '';
    const onAbort = () => { proc.kill('SIGKILL'); reject(new Error('Job cancelled')); };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    proc.stderr.on('data', d => { errOut += d.toString(); });
    proc.on('close', code => {
      if (signal) signal.removeEventListener('abort', onAbort);
      if (code !== 0 && !signal?.aborted) reject(new Error(`ffmpeg exited ${code}: ${errOut.slice(-600)}`));
      else if (!signal?.aborted) resolve();
    });
    proc.on('error', err => reject(new Error(`ffmpeg not found: ${err.message}`)));
  });
}

// ─── Metadata Generation (Ollama / Llama2) ───────────────────────────────────
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// ─── Shared metadata generation helper ───────────────────────────────────────
async function generateVideoMeta(quote, resolution, model) {
  const platformIds = ['youtube', 'instagram', 'tiktok'];
  const prompts = {
    youtube: `You are a YouTube SEO expert. Generate metadata for a video whose caption/quote is: "${quote}"
Respond ONLY with valid JSON, no other text:
{"title":"SEO-optimized title (max 70 chars)","description":"Description with keywords and CTA (250-350 chars)","tags":["t1","t2","t3","t4","t5","t6","t7","t8","t9","t10"],"hashtags":["h1","h2","h3"]}`,
    instagram: `You are an Instagram Reels expert. Generate metadata for a short video whose caption/quote is: "${quote}"
Respond ONLY with valid JSON, no other text:
{"title":"Hook caption (max 10 words)","caption":"Caption with emojis and CTA (150-220 chars)","hashtags":["h1","h2","h3","h4","h5","h6","h7","h8","h9","h10","h11","h12","h13","h14","h15"]}`,
    tiktok: `You are a TikTok strategist. Generate metadata for a short video whose caption/quote is: "${quote}"
Respond ONLY with valid JSON, no other text:
{"title":"Scroll-stopping hook (max 10 words)","caption":"Punchy TikTok caption with emojis and CTA (100-160 chars)","hashtags":["fyp","foryou","h3","h4","h5","h6","h7","h8","h9","h10"]}`,
  };
  const results = {};
  for (const pid of platformIds) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`${OLLAMA_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, prompt: prompts[pid], stream: false, options: { temperature: 0.75, top_p: 0.9 } }),
          signal: AbortSignal.timeout(60000),
        });
        if (!r.ok) continue;
        const data = await r.json();
        const m = (data.response || '').match(/\{[\s\S]*\}/);
        if (m) { results[pid] = JSON.parse(m[0]); break; }
      } catch {}
    }
  }
  return results;
}

app.get('/api/ollama/status', async (req, res) => {
  try {
    const r = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return res.json({ running: false });
    const data = await r.json();
    const models = (data.models || []).map(m => m.name);
    res.json({ running: true, models, hasLlama: models.some(m => m.includes('llama')) });
  } catch {
    res.json({ running: false, models: [], hasLlama: false });
  }
});

app.post('/api/ai/quotes', async (req, res) => {
  const { count = 1, topic = '' } = req.body;

  // Pick the best llama3 model available
  let model = 'llama3';
  try {
    const tagsRes = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (tagsRes.ok) {
      const { models = [] } = await tagsRes.json();
      const llama3 = models.find(m => m.name.includes('llama3'));
      const llama  = models.find(m => m.name.includes('llama'));
      if (llama3) model = llama3.name;
      else if (llama) model = llama.name;
    }
  } catch {}

  const topicLine = topic ? ` about the theme: "${topic}"` : '';
  const prompt =
`Generate exactly ${count} unique, powerful quotes${topicLine} suitable for social media videos.

Rules:
- Output ONLY the quotes, one per line
- No numbering, no bullet points, no quotation marks, no labels
- Each quote must be between 5 and 15 words
- Make them motivational, punchy, and impactful
- Do not repeat similar ideas

Quotes:`;

  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: { temperature: 0.85, top_p: 0.9, num_predict: count * 30 },
      }),
      signal: AbortSignal.timeout(120000),
    });
    if (!ollamaRes.ok) return res.status(500).json({ error: `Ollama error: ${await ollamaRes.text()}` });
    const data = await ollamaRes.json();

    // Strip numbering/bullets and blank lines, keep up to `count` lines
    const lines = (data.response || '')
      .split('\n')
      .map(l => l.replace(/^[\d]+[\.\)]\s*/, '').replace(/^[-•*]\s*/, '').trim())
      .filter(l => l.length > 3);

    res.json({ quotes: lines.slice(0, count), model });
  } catch (e) {
    if (e.name === 'TimeoutError') return res.status(504).json({ error: 'Ollama timed out — is it running?' });
    if (e.cause?.code === 'ECONNREFUSED' || e.message === 'fetch failed')
      return res.status(503).json({ error: 'Ollama is not running. Start it with: ollama serve' });
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/metadata/generate', async (req, res) => {
  const { platform, topic, tone, extraContext, model } = req.body;
  if (!platform || !topic) return res.status(400).json({ error: 'platform and topic required' });

  // Auto-detect best available llama3 model, fall back to any llama, then caller-supplied
  let selectedModel = model || 'llama3';
  try {
    const tagsRes = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (tagsRes.ok) {
      const { models = [] } = await tagsRes.json();
      const names = models.map(m => m.name);
      const llama3 = names.find(n => n.includes('llama3'));
      const llama  = names.find(n => n.includes('llama'));
      if (llama3) selectedModel = llama3;
      else if (llama) selectedModel = llama;
    }
  } catch {}

  const toneStr = tone || 'engaging and authentic';
  const ctx = extraContext ? `Extra context: ${extraContext}` : '';

  const platformPrompts = {
    youtube: `You are a YouTube SEO and content expert.
Generate YouTube video metadata for a video about: "${topic}"
Tone: ${toneStr}
${ctx}
Respond ONLY with valid JSON in this exact format, no other text:
{
  "title": "SEO-optimized YouTube title (max 70 chars, include keywords)",
  "description": "Full YouTube description with timestamps placeholder, keywords, and call to action (250-350 chars)",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10"],
  "hashtags": ["hashtag1","hashtag2","hashtag3"]
}`,
    instagram: `You are a social media expert specializing in Instagram Reels content.
Generate Instagram post metadata for a short vertical video about: "${topic}"
Tone: ${toneStr}
${ctx}
Respond ONLY with valid JSON in this exact format, no other text:
{
  "title": "A catchy caption hook (max 10 words, no hashtags)",
  "caption": "Full Instagram caption with emojis, engaging text, ends with a CTA (150-220 chars)",
  "hashtags": ["hashtag1","hashtag2","hashtag3","hashtag4","hashtag5","hashtag6","hashtag7","hashtag8","hashtag9","hashtag10","hashtag11","hashtag12","hashtag13","hashtag14","hashtag15"]
}`,
    tiktok: `You are a TikTok content strategist specializing in viral short-form video.
Generate TikTok post metadata for a short vertical video about: "${topic}"
Tone: ${toneStr}
${ctx}
Respond ONLY with valid JSON in this exact format, no other text:
{
  "title": "A scroll-stopping TikTok hook caption (max 10 words, punchy)",
  "caption": "TikTok caption: short, punchy, uses slang if appropriate, includes a clear CTA, emojis welcome (100-160 chars)",
  "hashtags": ["fyp","foryou","hashtag3","hashtag4","hashtag5","hashtag6","hashtag7","hashtag8","hashtag9","hashtag10"]
}`
  };

  const prompt = platformPrompts[platform];
  if (!prompt) return res.status(400).json({ error: 'unsupported platform' });
  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel, prompt, stream: false, options: { temperature: 0.75, top_p: 0.9 } }),
      signal: AbortSignal.timeout(120000)
    });
    if (!ollamaRes.ok) return res.status(500).json({ error: `Ollama error: ${await ollamaRes.text()}` });
    const data = await ollamaRes.json();
    const jsonMatch = (data.response || '').match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(500).json({ error: 'Could not parse metadata from model response' });
    res.json({ platform, metadata: JSON.parse(jsonMatch[0]), model: selectedModel });
  } catch (e) {
    if (e.name === 'TimeoutError') return res.status(504).json({ error: 'Ollama timed out.' });
    res.status(500).json({ error: e.message });
  }
});

// ─── Per-job Metadata Generation ─────────────────────────────────────────────
app.post('/api/jobs/:id/metadata/generate', async (req, res) => {
  const job = await Job.findOne({ id: req.params.id });
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const { file, tone } = req.body;
  const targetFile = file || job.outputFile;
  if (!targetFile) return res.status(400).json({ error: 'No output file specified' });

  // Find the quote that was used for this specific video file
  const videoQuoteEntry = (job.videoQuotes || []).find(v => v.file === targetFile);
  const quote = videoQuoteEntry?.quote
    || (job.generationParams?.quotes || '').split('\n').map(l => l.trim()).filter(Boolean)[0]
    || job.batchName
    || 'video content';

  const platformIds = ['youtube', 'instagram', 'tiktok'];

  // Auto-detect best llama3 model
  let model = 'llama3';
  try {
    const tagsRes = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    if (tagsRes.ok) {
      const { models = [] } = await tagsRes.json();
      const names = models.map(m => m.name);
      const l3 = names.find(n => n.includes('llama3'));
      const l  = names.find(n => n.includes('llama'));
      if (l3) model = l3; else if (l) model = l;
    }
  } catch {}

  const toneStr   = tone || 'Engaging & Casual';
  const isPost    = job.type === 'post';
  const mediaType = isPost ? 'social media image post' : 'video';
  const platformPrompts = {
    youtube: `You are a YouTube SEO and content expert.
Generate YouTube metadata for a ${mediaType} with this caption/quote: "${quote}"
Tone: ${toneStr}
Respond ONLY with valid JSON in this exact format, no other text:
{
  "title": "SEO-optimized YouTube title (max 70 chars, include keywords)",
  "description": "Full YouTube description with keywords and call to action (250-350 chars)",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10"],
  "hashtags": ["hashtag1","hashtag2","hashtag3"]
}`,
    instagram: `You are an Instagram content expert.
Generate Instagram metadata for a ${mediaType} with this caption/quote: "${quote}"
Tone: ${toneStr}
Respond ONLY with valid JSON in this exact format, no other text:
{
  "title": "A catchy hook (max 10 words, no hashtags)",
  "caption": "Instagram caption with emojis and CTA (150-220 chars)",
  "hashtags": ["hashtag1","hashtag2","hashtag3","hashtag4","hashtag5","hashtag6","hashtag7","hashtag8","hashtag9","hashtag10","hashtag11","hashtag12","hashtag13","hashtag14","hashtag15"]
}`,
    tiktok: `You are a TikTok content strategist.
Generate TikTok metadata for a ${mediaType} with this caption/quote: "${quote}"
Tone: ${toneStr}
Respond ONLY with valid JSON in this exact format, no other text:
{
  "title": "A scroll-stopping TikTok hook (max 10 words, punchy)",
  "caption": "TikTok caption: short, punchy, emojis welcome, clear CTA (100-160 chars)",
  "hashtags": ["fyp","foryou","hashtag3","hashtag4","hashtag5","hashtag6","hashtag7","hashtag8","hashtag9","hashtag10"]
}`
  };

  const results = {};
  for (const pid of platformIds) {
    try {
      const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: platformPrompts[pid], stream: false, options: { temperature: 0.75, top_p: 0.9 } }),
        signal: AbortSignal.timeout(90000)
      });
      if (!ollamaRes.ok) continue;
      const data = await ollamaRes.json();
      const jsonMatch = (data.response || '').match(/\{[\s\S]*\}/);
      if (jsonMatch) results[pid] = JSON.parse(jsonMatch[0]);
    } catch {}
  }

  // Persist results on the job
  const existing = (job.videoMetadata && typeof job.videoMetadata === 'object') ? { ...job.videoMetadata } : {};
  existing[targetFile] = results;
  await Job.updateOne({ id: job.id }, { $set: { videoMetadata: existing } });

  res.json({ file: targetFile, quote, platforms: platformIds, results, model });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

// ─── Video Editor Routes ──────────────────────────────────────────────────────

// Save updated clip order/trim to job
app.put('/api/jobs/:id/clips', async (req, res) => {
  try {
    const { clips } = req.body;
    const job = await Job.findOneAndUpdate(
      { id: req.params.id },
      { clips },
      { new: true }
    );
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json({ clips: job.clips });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Add / update / delete annotations
app.put('/api/jobs/:id/annotations', async (req, res) => {
  try {
    const { annotations } = req.body;
    const job = await Job.findOneAndUpdate(
      { id: req.params.id },
      { annotations },
      { new: true }
    );
    if (!job) return res.status(404).json({ error: 'not found' });
    res.json({ annotations: job.annotations });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Re-render with reordered/trimmed clips + annotations burned in
app.post('/api/jobs/:id/rerender', async (req, res) => {
  try {
    const sourceJob = await Job.findOne({ id: req.params.id });
    if (!sourceJob) return res.status(404).json({ error: 'source job not found' });
    if (!sourceJob.outputFile) return res.status(400).json({ error: 'no output file' });

    const { clips, annotations, trimStart, trimEnd } = req.body;
    const newJobId = uuidv4();
    const newJob = await Job.create({
      id: newJobId,
      batchName: sourceJob.batchName,
      status: 'queued',
      resolution: sourceJob.resolution,
      logoText: sourceJob.logoText,
      logoSubtext: sourceJob.logoSubtext,
    });
    res.json({ jobId: newJobId });

    // Run rerender async
    runRerender(newJob, sourceJob, { clips, annotations, trimStart, trimEnd }).catch(console.error);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

async function runRerender(newJob, sourceJob, opts) {
  const { clips, trimStart = 0, trimEnd = null, annotations = [] } = opts;
  const tmpDir = path.join(OUTPUT_DIR, `tmp_${newJob.id}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const addLog = async (msg) => {
    console.log(`[${newJob.id}] ${msg}`);
    await Job.updateOne({ id: newJob.id }, { $push: { log: msg } });
  };
  const setStatus = async (status, progress) => Job.updateOne({ id: newJob.id }, { status, progress });

  try {
    await setStatus('running', 5);
    const srcPath = path.join(OUTPUT_DIR, sourceJob.outputFile);
    if (!fs.existsSync(srcPath)) throw new Error('Source output file not found');

    const resConfig = RESOLUTIONS[sourceJob.resolution] || RESOLUTIONS['1920x1080'];
    const { w: W, h: H } = resConfig;
    const sf = W / 1920;

    // Step 1 — trim the source video
    await addLog('Applying trim...');
    const trimmedPath = path.join(tmpDir, 'trimmed.mp4');
    const srcDur = await getVideoDuration(srcPath);
    const tStart = trimStart || 0;
    const tEnd   = trimEnd   || srcDur;
    const tDur   = tEnd - tStart;

    await ffmpegRun([
      '-ss', String(tStart),
      '-i', srcPath,
      '-t', String(tDur),
      '-c', 'copy',
      '-y', trimmedPath
    ]);
    await setStatus('running', 40);

    // Step 2 — burn in text annotations as drawtext
    let currentInput = trimmedPath;
    if (annotations && annotations.length > 0) {
      await addLog(`Burning ${annotations.length} text annotation(s)...`);
      const annotatedPath = path.join(tmpDir, 'annotated.mp4');
      const fontSz = Math.round(40 * sf);

      const drawtextFilters = annotations.map(a => {
        const safeText = (a.text || '').replace(/\\/g, '\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/%/g, '\\%');
        const xPx = Math.round((a.x / 100) * W);
        const yPx = Math.round((a.y / 100) * H);
        const xExpr = a.x === 50 ? '(w-text_w)/2' : `${xPx}`;
        return `drawtext=fontsize=${fontSz}:fontcolor=white:x=${xExpr}:y=${yPx}:text='${safeText}':shadowcolor=black@0.8:shadowx=2:shadowy=2:borderw=2:bordercolor=black@0.6:enable='between(t,${a.startTime},${a.endTime})'`;
      }).join(',');

      await ffmpegRun([
        '-i', currentInput,
        '-vf', drawtextFilters,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'copy',
        '-y', annotatedPath
      ]);
      currentInput = annotatedPath;
      await setStatus('running', 80);
    }

    const outputFile = `output_${newJob.id}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFile);
    fs.copyFileSync(currentInput, outputPath);

    const totalDuration = await getVideoDuration(outputPath).catch(() => tDur);
    fs.rmSync(tmpDir, { recursive: true, force: true });
    await setStatus('done', 100);
    await Job.updateOne({ id: newJob.id }, { outputFile, duration: totalDuration, annotations });
    await addLog(`Re-render done! Output: ${outputFile}`);
  } catch (err) {
    await addLog(`ERROR: ${err.message}`);
    await setStatus('error', 0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}
