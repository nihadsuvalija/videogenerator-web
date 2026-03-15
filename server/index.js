const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { spawn } = require('child_process');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Directories ─────────────────────────────────────────────────────────────
const DATA_ROOT = path.join(__dirname, 'data');
const OUTPUT_DIR = path.join(DATA_ROOT, 'outputs');
const BATCHES_DIR = path.join(DATA_ROOT, 'batches');
const ASSETS_DIR = path.join(DATA_ROOT, 'assets');
const OVERLAYS_DIR = path.join(DATA_ROOT, 'overlays');

[DATA_ROOT, OUTPUT_DIR, BATCHES_DIR, ASSETS_DIR, OVERLAYS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

app.use('/outputs', express.static(OUTPUT_DIR));
app.use('/assets', express.static(ASSETS_DIR));

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

// ─── MongoDB ──────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/videogen';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(e => console.error('MongoDB error:', e));

const JobSchema = new mongoose.Schema({
  id:          { type: String, default: uuidv4 },
  batchName:   String,
  status:      { type: String, enum: ['queued','running','done','error'], default: 'queued' },
  progress:    { type: Number, default: 0 },
  log:         [String],
  outputFile:  String,
  duration:    Number,
  videoFiles:  [String],
  imageFiles:  [String],
  logoText:    String,
  logoSubtext: String,
  resolution:  String,
  clips: [{ id: String, clipType: String, src: String, startTime: Number, clipDuration: Number, trimIn: Number, trimOut: Number, order: Number }],
  annotations: [{ id: String, text: String, startTime: Number, endTime: Number, x: Number, y: Number }],
  createdAt:   { type: Date, default: Date.now }
});
const Job = mongoose.model('Job', JobSchema);

const PresetSchema = new mongoose.Schema({
  id:             { type: String, default: uuidv4 },
  name:           { type: String, default: 'New Preset' },
  resolution:     { type: String, default: '1920x1080' },
  sliceDuration:  { type: Number, default: 3 },
  imageDuration:  { type: Number, default: 0.2 },
  logoText:       { type: String, default: '' },
  logoSubtext:    { type: String, default: '' },
  selectedVideos: { type: [String], default: [] },
  selectedImages: { type: [String], default: [] },
  locked:         { type: Boolean, default: false },
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
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const Preset = mongoose.model('Preset', PresetSchema);

// ─── Preset Routes ────────────────────────────────────────────────────────────
app.get('/api/presets', async (req, res) => {
  try {
    const presets = await Preset.find().sort({ createdAt: -1 });
    res.json(presets);
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
    const preset = await Preset.findOneAndUpdate(
      { id: req.params.id },
      { ...req.body, updatedAt: new Date() },
      { new: true }
    );
    if (!preset) return res.status(404).json({ error: 'not found' });
    res.json(preset);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/presets/:id', async (req, res) => {
  try {
    await Preset.deleteOne({ id: req.params.id });
    // Clean up overlay images for this preset
    const presetOverlayDir = path.join(DATA_ROOT, 'preset_overlays', req.params.id);
    if (fs.existsSync(presetOverlayDir)) fs.rmSync(presetOverlayDir, { recursive: true, force: true });
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
  const jobs = await Job.find().sort({ createdAt: -1 }).limit(50);
  res.json(jobs);
});

app.get('/api/jobs/:id', async (req, res) => {
  const job = await Job.findOne({ id: req.params.id });
  if (!job) return res.status(404).json({ error: 'not found' });
  res.json(job);
});

app.post('/api/generate', async (req, res) => {
  const {
    batchName, videoFiles, imageFiles,
    logoText, logoSubtext,
    sliceDuration, imageDuration,
    resolution,
    sessionToken,
    presetId,       // optional — used to load layout
  } = req.body;

  if (!batchName) return res.status(400).json({ error: 'batchName required' });

  // Load layout from preset if provided
  let layout = null;
  if (presetId) {
    const preset = await Preset.findOne({ id: presetId });
    if (preset?.layout) layout = preset.layout;
  }

  const jobId = uuidv4();
  const job = await Job.create({
    id: jobId, batchName, status: 'queued',
    videoFiles: videoFiles || [], imageFiles: imageFiles || [],
    logoText: logoText || '', logoSubtext: logoSubtext || '',
    resolution: resolution || '1920x1080',
  });

  res.json({ jobId });

  runGeneration(job, {
    batchName,
    videoFiles: videoFiles || [],
    imageFiles: imageFiles || [],
    logoText: logoText || '',
    logoSubtext: logoSubtext || '',
    sliceDuration: Number(sliceDuration) || 3,
    imageDuration: Number(imageDuration) || 0.2,
    resolution: resolution || '1920x1080',
    sessionToken: sessionToken || null,
    layout,
    presetId: presetId || null,
  }).catch(e => console.error('Generation error:', e));
});

// ─── Video Generation ─────────────────────────────────────────────────────────
async function runGeneration(job, opts) {
  const { batchName, videoFiles, imageFiles, logoText, logoSubtext, sliceDuration, imageDuration, resolution, sessionToken, layout, presetId } = opts;
  const batchDir = path.join(BATCHES_DIR, batchName);
  const tmpDir = path.join(OUTPUT_DIR, `tmp_${job.id}`);
  fs.mkdirSync(tmpDir, { recursive: true });

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
      logo:      { x: 50, y: 90, w: 18, enabled: true,  ...(layout?.logo      || {}) },
      subtitles: { x: 50, y: 50, fontSize: 52, enabled: true, ...(layout?.subtitles || {}) },
      overlays:  layout?.overlays || [],
    };

    // Scale factors relative to 1920x1080 baseline
    const sf = W / 1920;
    const fontMain  = Math.round(L.subtitles.fontSize * sf);
    const fontSub   = Math.round(30 * sf);
    const logoW     = Math.round((L.logo.w / 100) * W);
    const padEdge   = Math.round(24 * sf);

    // Convert % positions to ffmpeg overlay expressions
    // Logo: x/y are center point percentages → top-left for overlay
    const logoXExpr = `${Math.round((L.logo.x / 100) * W)}-w/2`;
    const logoYExpr = `${Math.round((L.logo.y / 100) * H)}-h/2`;

    // Subtitle: x/y center % → ASS MarginL/MarginR/MarginV
    const subXPx  = Math.round((L.subtitles.x / 100) * W);
    const subYPx  = Math.round((L.subtitles.y / 100) * H);
    // drawtext position for plain text
    const textXExpr = L.subtitles.x === 50 ? '(w-text_w)/2' : `${subXPx}-text_w/2`;
    const textYExpr = `${subYPx}`;
    const textYSub  = `${subYPx + Math.round(fontMain * 1.3)}`;

    // ── Assets ────────────────────────────────────────────────────────────────
    const logoFiles = fs.existsSync(ASSETS_DIR) ? fs.readdirSync(ASSETS_DIR).filter(f => /^logo\./i.test(f)) : [];
    const logoPath = (logoFiles.length > 0 && L.logo.enabled) ? path.join(ASSETS_DIR, logoFiles[0]) : null;

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
    const staticOverlays = []; // { path, xExpr, yExpr, wPx }
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

    const safeText = (logoText || '').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    const safeSub  = (logoSubtext || '').replace(/'/g, "\\'").replace(/:/g, '\\:').replace(/\[/g, '\\[').replace(/\]/g, '\\]');

    // ── Convert SRT → ASS with layout-driven position ─────────────────────────
    let assPath = null;
    if (srtPath) {
      assPath = srtPath.replace(/\.srt$/i, '.ass');
      const srtContent = fs.readFileSync(srtPath, 'utf8');
      const assContent = srtToAss(srtContent, fontMain, W, H, subXPx, subYPx);
      fs.writeFileSync(assPath, assContent, 'utf8');
      await addLog(`Converted SRT to ASS (position: ${L.subtitles.x}%, ${L.subtitles.y}%)`);
    }

    // ── Filter builder ────────────────────────────────────────────────────────
    // logoIdx: ffmpeg input index of logo image; extraStart: next available input index
    const buildOverlayFilters = (inputLabel, logoIdx, extraInputStart) => {
      const filters = [];
      let cur = inputLabel;
      let nextIdx = extraInputStart;

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
      if (!assPath && safeText) {
        let tf = `[${cur}]drawtext=fontsize=${fontMain}:fontcolor=white:x=${textXExpr}:y=${textYExpr}:text='${safeText}':shadowcolor=black@0.8:shadowx=3:shadowy=3:borderw=2:bordercolor=black@0.5`;
        if (safeSub) {
          tf += `,drawtext=fontsize=${fontSub}:fontcolor=white@0.9:x=${textXExpr}:y=${textYSub}:text='${safeSub}':shadowcolor=black@0.8:shadowx=2:shadowy=2`;
        }
        tf += '[after_text]';
        filters.push(tf);
        cur = 'after_text';
      }

      return { filters, finalLabel: cur };
    };

    const parts = [];

    // ── Step 1: Video slices — keep slicing until total duration covers the audio ──
    const vDir = path.join(batchDir, 'videos');
    const selectedVideos = videoFiles.length > 0
      ? videoFiles.filter(f => fs.existsSync(path.join(vDir, f)))
      : (fs.existsSync(vDir) ? fs.readdirSync(vDir).filter(isVideo) : []);

    if (selectedVideos.length > 0) {
      // Get audio duration upfront so we know the target length
      let targetDur = 0;
      if (audioPath) {
        targetDur = await getVideoDuration(audioPath).catch(() => 0);
      }
      // If no audio, fall back to one pass through all videos
      const fillToAudio = targetDur > 0;
      await addLog(`Processing videos — target duration: ${fillToAudio ? targetDur.toFixed(1) + 's' : 'one pass'}`);

      let totalSliced = 0;
      let sliceIndex  = 0;
      let pass        = 0; // how many times we've cycled through all videos

      // Shuffle once per pass, cycle until we've filled the audio duration
      while (true) {
        const shuffled = shuffle([...selectedVideos]);

        for (let i = 0; i < shuffled.length; i++) {
          // Stop as soon as we've covered the full audio duration
          if (fillToAudio && totalSliced >= targetDur) break;

          const src = path.join(vDir, shuffled[i]);
          const out = path.join(tmpDir, `vslice_${sliceIndex}.mp4`);
          const srcDur = await getVideoDuration(src);

          // How much more do we need? Never cut a slice longer than sliceDuration
          const remaining   = fillToAudio ? targetDur - totalSliced : sliceDuration;
          const thisSliceDur = Math.min(sliceDuration, remaining, srcDur);
          if (thisSliceDur <= 0) break;

          const maxStart = Math.max(0, srcDur - thisSliceDur);
          const startTime = Math.random() * maxStart;
          await addLog(`  Slice ${sliceIndex + 1}: ${shuffled[i]} at ${startTime.toFixed(2)}s for ${thisSliceDur.toFixed(2)}s (total so far: ${totalSliced.toFixed(1)}s)`);

          const logoInputArgs  = logoPath ? ['-i', logoPath] : [];
          const logoIdx        = logoPath ? 1 : null;
          const staticInputArgs = staticOverlays.map(ov => ['-i', ov.path]).flat();
          const extraInputStart = (logoPath ? 2 : 1);

          // fps=30 before trim normalises VFR sources so trim timestamps align correctly
          const scalePart = `[0:v]fps=30,trim=start=${startTime.toFixed(3)}:duration=${thisSliceDur.toFixed(3)},setpts=PTS-STARTPTS,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1[scaled]`;
          const { filters, finalLabel } = buildOverlayFilters('scaled', logoIdx, extraInputStart);
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
            ]);
            // Verify the output actually has content
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
          await setStatus('running', 5 + Math.round(pct * 55));
        }

        // Exit if we've hit the target or this is a no-audio single pass
        if (!fillToAudio || totalSliced >= targetDur) break;
        pass++;
        if (pass > 50) { await addLog('Safety limit: stopping after 50 passes'); break; } // safety cap
      }

      await addLog(`Video slicing complete: ${sliceIndex} slices, ${totalSliced.toFixed(1)}s total`);
    }

    // ── Step 2: Image slideshow ───────────────────────────────────────────────
    const iDir = path.join(batchDir, 'images');
    const selectedImages = imageFiles.length > 0
      ? imageFiles.filter(f => fs.existsSync(path.join(iDir, f)))
      : (fs.existsSync(iDir) ? fs.readdirSync(iDir).filter(isImage) : []);

    if (selectedImages.length > 0) {
      await addLog(`Processing ${selectedImages.length} image(s) into slideshow...`);

      const imgInputArgs = [];
      for (const img of selectedImages) {
        imgInputArgs.push('-loop', '1', '-t', String(imageDuration), '-i', path.join(iDir, img));
      }

      const logoInputArgs = logoPath ? ['-i', logoPath] : [];
      const logoIdx = logoPath ? selectedImages.length : null;
      const staticInputArgs = staticOverlays.map(ov => ['-i', ov.path]).flat();
      const extraInputStart = selectedImages.length + (logoPath ? 1 : 0);

      let filterParts = [];
      for (let i = 0; i < selectedImages.length; i++) {
        filterParts.push(`[${i}:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,fps=30[v${i}]`);
      }
      const concatInputs = selectedImages.map((_, i) => `[v${i}]`).join('');
      filterParts.push(`${concatInputs}concat=n=${selectedImages.length}:v=1:a=0[slide]`);

      const { filters, finalLabel } = buildOverlayFilters('slide', logoIdx, extraInputStart);
      filterParts = [...filterParts, ...filters];

      const slideshowOut = path.join(tmpDir, 'slideshow.mp4');
      await ffmpegRun([
        ...imgInputArgs,
        ...logoInputArgs,
        ...staticInputArgs,
        '-filter_complex', filterParts.join(';'),
        '-map', `[${finalLabel}]`,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-an',
        '-y', slideshowOut
      ]);
      parts.push(slideshowOut);
      await setStatus('running', 75);
      await addLog('Slideshow segment created.');
    }

    if (parts.length === 0) throw new Error('No video or image files to process.');

    // ── Step 3: Concatenate ───────────────────────────────────────────────────
    await addLog('Concatenating all segments...');
    await setStatus('running', 82);

    const silentOut = path.join(tmpDir, 'silent_output.mp4');
    if (parts.length === 1) {
      fs.copyFileSync(parts[0], silentOut);
    } else {
      const listFile = path.join(tmpDir, 'concat_list.txt');
      fs.writeFileSync(listFile, parts.map(p => `file '${p}'`).join('\n'));
      await ffmpegRun(['-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', '-y', silentOut]);
    }

    // ── Step 4: Mix audio — no looping needed, slices already cover full duration ──
    const outputFile = `output_${job.id}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFile);

    const preSubsPath = assPath
      ? path.join(tmpDir, 'pre_subs.mp4')
      : outputPath;

    if (audioPath) {
      await addLog('Mixing audio...');
      await setStatus('running', 88);
      const muxTarget = assPath ? path.join(tmpDir, 'pre_subs.mp4') : preSubsPath;
      await ffmpegRun([
        '-i', silentOut,
        '-i', audioPath,
        '-map', '0:v',
        '-map', '1:a',
        '-c:v', assPath ? 'copy' : 'libx264',
        ...(assPath ? [] : ['-preset', 'fast', '-crf', '23']),
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest',
        '-y', muxTarget
      ]);
    } else {
      fs.copyFileSync(silentOut, preSubsPath);
      if (!assPath) fs.copyFileSync(silentOut, outputPath);
    }

    // ── Step 5: Burn ASS subtitles onto the final full-length video ───────────
    // Must happen AFTER looping so timestamps are continuous 0→end, matching SRT
    if (assPath) {
      await addLog('Burning karaoke subtitles onto final video...');
      await setStatus('running', 95);
      const safeAss = assPath.replace(/\\/g, '/').replace(/:/g, '\\:').replace(/'/g, "\\'");
      await ffmpegRun([
        '-i', preSubsPath,
        '-vf', `ass='${safeAss}'`,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-c:a', 'copy',
        '-y', outputPath
      ]);
    }

    // Save clip metadata for editor
    const clips = [];
    let cursor = 0;
    const partsDone = [...parts];
    for (let i = 0; i < partsDone.length; i++) {
      const dur = await getVideoDuration(partsDone[i]).catch(() => 3);
      const partBase = path.basename(partsDone[i]);
      let src = partBase;
      let clipType = 'video';
      if (partBase === 'slideshow.mp4') { clipType = 'image'; src = 'slideshow'; }
      else if (partBase.startsWith('vslice_')) { const idx = parseInt(partBase.replace('vslice_','').replace('.mp4','')); src = selectedVideos[idx] || partBase; }
      clips.push({ id: uuidv4(), clipType, src, startTime: cursor, clipDuration: dur, trimIn: 0, trimOut: dur, order: i });
      cursor += dur;
    }
    const totalDuration = await getVideoDuration(outputPath).catch(() => cursor);

    fs.rmSync(tmpDir, { recursive: true, force: true });
    await setStatus('done', 100);
    await Job.updateOne({ id: job.id }, { $set: { outputFile, duration: totalDuration, clips } });
    await addLog(`Done! Output: ${outputFile}`);
  } catch (err) {
    await addLog(`ERROR: ${err.message}`);
    await setStatus('error', 0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
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
function srtToAss(srtContent, fontSize, W, H, subXPx, subYPx) {
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
Style: Karaoke,Arial,${fontSize},&H00FFFFFF,&H000000FF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,3,2,${alignment},${marginL},${marginR},${marginV},1

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

function ffmpegRun(args) {
  return new Promise((resolve, reject) => {
    console.log('ffmpeg', args.join(' '));
    const proc = spawn('ffmpeg', args);
    let errOut = '';
    proc.stderr.on('data', d => { errOut += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) reject(new Error(`ffmpeg exited ${code}: ${errOut.slice(-600)}`));
      else resolve();
    });
    proc.on('error', err => reject(new Error(`ffmpeg not found: ${err.message}`)));
  });
}

// ─── Metadata Generation (Ollama / Llama2) ───────────────────────────────────
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

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

app.post('/api/metadata/generate', async (req, res) => {
  const { platform, topic, tone, extraContext, model } = req.body;
  if (!platform || !topic) return res.status(400).json({ error: 'platform and topic required' });
  const selectedModel = model || 'llama2';
  const platformPrompts = {
    instagram: `You are a social media expert specializing in Instagram content.
Generate Instagram post metadata for a video about: "${topic}"
Tone: ${tone || 'engaging and casual'}
${extraContext ? `Extra context: ${extraContext}` : ''}
Respond ONLY with valid JSON in this exact format, no other text:
{
  "title": "A catchy Instagram caption title (max 10 words)",
  "caption": "Full Instagram caption with emojis, engaging text (150-200 chars)",
  "hashtags": ["hashtag1","hashtag2","hashtag3","hashtag4","hashtag5","hashtag6","hashtag7","hashtag8","hashtag9","hashtag10"]
}`,
    youtube: `You are a YouTube SEO and content expert.
Generate YouTube video metadata for a video about: "${topic}"
Tone: ${tone || 'professional and informative'}
${extraContext ? `Extra context: ${extraContext}` : ''}
Respond ONLY with valid JSON in this exact format, no other text:
{
  "title": "SEO-optimized YouTube title (max 70 chars, include keywords)",
  "description": "Full YouTube description with timestamps placeholder, keywords, and call to action (250-350 chars)",
  "tags": ["tag1","tag2","tag3","tag4","tag5","tag6","tag7","tag8","tag9","tag10"],
  "hashtags": ["hashtag1","hashtag2","hashtag3"]
}`
  };
  const prompt = platformPrompts[platform];
  if (!prompt) return res.status(400).json({ error: 'unsupported platform' });
  try {
    const ollamaRes = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: selectedModel, prompt, stream: false, options: { temperature: 0.7, top_p: 0.9 } }),
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
        const safeText = (a.text || '').replace(/'/g, "\\'").replace(/:/g, '\\:');
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
