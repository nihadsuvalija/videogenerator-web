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
const ASSETS_DIR = path.join(DATA_ROOT, 'assets'); // logo etc.

[DATA_ROOT, OUTPUT_DIR, BATCHES_DIR, ASSETS_DIR].forEach(d => fs.mkdirSync(d, { recursive: true }));

// Serve output videos
app.use('/outputs', express.static(OUTPUT_DIR));
app.use('/assets', express.static(ASSETS_DIR));

// ─── MongoDB ──────────────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/videogen';
mongoose.connect(MONGO_URI).then(() => console.log('MongoDB connected')).catch(e => console.error('MongoDB error:', e));

const JobSchema = new mongoose.Schema({
  id: { type: String, default: uuidv4 },
  batchName: String,
  status: { type: String, enum: ['queued', 'running', 'done', 'error'], default: 'queued' },
  progress: { type: Number, default: 0 },
  log: [String],
  outputFile: String,
  videoFiles: [String],
  imageFiles: [String],
  logoText: String,
  logoSubtext: String,
  createdAt: { type: Date, default: Date.now }
});
const Job = mongoose.model('Job', JobSchema);

const BatchSchema = new mongoose.Schema({
  name: String, // e.g. BATCH_001
  createdAt: { type: Date, default: Date.now }
});
const Batch = mongoose.model('Batch', BatchSchema);

// ─── Multer ───────────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const batchName = req.params.batchName;
    const type = req.params.type; // 'videos' or 'images'
    const dir = path.join(BATCHES_DIR, batchName, type);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => cb(null, file.originalname)
});
const upload = multer({ storage });

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, ASSETS_DIR),
  filename: (req, file, cb) => cb(null, 'logo' + path.extname(file.originalname))
});
const logoUpload = multer({ storage: logoStorage });

// ─── Batch Routes ─────────────────────────────────────────────────────────────
// List all batches
app.get('/api/batches', async (req, res) => {
  try {
    const dirs = fs.existsSync(BATCHES_DIR) ? fs.readdirSync(BATCHES_DIR) : [];
    const batches = dirs
      .filter(d => fs.statSync(path.join(BATCHES_DIR, d)).isDirectory())
      .map(name => {
        const vDir = path.join(BATCHES_DIR, name, 'videos');
        const iDir = path.join(BATCHES_DIR, name, 'images');
        const videoCount = fs.existsSync(vDir) ? fs.readdirSync(vDir).filter(f => isVideo(f)).length : 0;
        const imageCount = fs.existsSync(iDir) ? fs.readdirSync(iDir).filter(f => isImage(f)).length : 0;
        return { name, videoCount, imageCount };
      });
    res.json(batches);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Create batch
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

// Get batch files
app.get('/api/batches/:batchName/files', (req, res) => {
  const { batchName } = req.params;
  const vDir = path.join(BATCHES_DIR, batchName, 'videos');
  const iDir = path.join(BATCHES_DIR, batchName, 'images');
  const videos = fs.existsSync(vDir) ? fs.readdirSync(vDir).filter(isVideo) : [];
  const images = fs.existsSync(iDir) ? fs.readdirSync(iDir).filter(isImage) : [];
  res.json({ videos, images });
});

// Upload files to batch
app.post('/api/batches/:batchName/upload/:type', upload.array('files'), (req, res) => {
  res.json({ uploaded: req.files.map(f => f.originalname) });
});

// Delete file from batch
app.delete('/api/batches/:batchName/:type/:filename', (req, res) => {
  const { batchName, type, filename } = req.params;
  const filePath = path.join(BATCHES_DIR, batchName, type, filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  res.json({ deleted: filename });
});

// Upload logo
app.post('/api/assets/logo', logoUpload.single('logo'), (req, res) => {
  res.json({ file: req.file.filename });
});

// Get logo info
app.get('/api/assets/logo', (req, res) => {
  const files = fs.existsSync(ASSETS_DIR) ? fs.readdirSync(ASSETS_DIR).filter(f => /^logo\./i.test(f)) : [];
  res.json({ logo: files[0] || null });
});

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
    batchName,
    videoFiles,    // selected video filenames
    imageFiles,    // selected image filenames
    logoText,
    logoSubtext,
    sliceDuration, // seconds per video slice, default 3
    imageDuration, // seconds per image, default 0.2
  } = req.body;

  if (!batchName) return res.status(400).json({ error: 'batchName required' });

  const jobId = uuidv4();
  const job = await Job.create({
    id: jobId,
    batchName,
    status: 'queued',
    videoFiles: videoFiles || [],
    imageFiles: imageFiles || [],
    logoText: logoText || '',
    logoSubtext: logoSubtext || ''
  });

  res.json({ jobId });

  // Run async
  runGeneration(job, {
    batchName,
    videoFiles: videoFiles || [],
    imageFiles: imageFiles || [],
    logoText: logoText || 'VideoGen',
    logoSubtext: logoSubtext || '',
    sliceDuration: sliceDuration || 3,
    imageDuration: imageDuration || 0.2,
  }).catch(e => console.error('Generation error:', e));
});

// ─── Video Generation ─────────────────────────────────────────────────────────
async function runGeneration(job, opts) {
  const { batchName, videoFiles, imageFiles, logoText, logoSubtext, sliceDuration, imageDuration } = opts;
  const batchDir = path.join(BATCHES_DIR, batchName);
  const tmpDir = path.join(OUTPUT_DIR, `tmp_${job.id}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  const addLog = async (msg) => {
    console.log(`[${job.id}] ${msg}`);
    await Job.updateOne({ id: job.id }, { $push: { log: msg } });
  };

  const setStatus = async (status, progress) => {
    await Job.updateOne({ id: job.id }, { status, progress });
  };

  try {
    await setStatus('running', 5);
    await addLog('Starting video generation...');

    const parts = []; // final list of video segment paths

    // ── Step 1: Video slices ──────────────────────────────────────────────────
    const vDir = path.join(batchDir, 'videos');
    const selectedVideos = videoFiles.length > 0
      ? videoFiles.filter(f => fs.existsSync(path.join(vDir, f)))
      : (fs.existsSync(vDir) ? fs.readdirSync(vDir).filter(isVideo) : []);

    // Check for logo here so it's available for both video slices and slideshow
    const logoFiles = fs.existsSync(ASSETS_DIR) ? fs.readdirSync(ASSETS_DIR).filter(f => /^logo\./i.test(f)) : [];
    const logoPath = logoFiles.length > 0 ? path.join(ASSETS_DIR, logoFiles[0]) : null;

    const safeText = (logoText || '').replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
    const safeSub = (logoSubtext || '').replace(/'/g, "\\'").replace(/:/g, "\\:").replace(/\[/g, "\\[").replace(/\]/g, "\\]");

    // Build a reusable text+logo filter for any video stream labeled [scaled]
    const buildOverlayFilter = (inputLabel) => {
      let filters = [];
      let current = inputLabel;

      if (logoPath) {
        filters.push(`[logo_in]scale=180:-1[logo_scaled]`);
        filters.push(`[${current}][logo_scaled]overlay=W-w-24:H-h-24[after_logo]`);
        current = 'after_logo';
      }

      if (safeText) {
        let textF = `[${current}]drawtext=fontsize=52:fontcolor=white:x=(w-text_w)/2:y=h-110:text='${safeText}':shadowcolor=black@0.8:shadowx=3:shadowy=3:borderw=2:bordercolor=black@0.5`;
        if (safeSub) {
          textF += `,drawtext=fontsize=30:fontcolor=white@0.9:x=(w-text_w)/2:y=h-58:text='${safeSub}':shadowcolor=black@0.8:shadowx=2:shadowy=2`;
        }
        textF += `[after_text]`;
        filters.push(textF);
        current = 'after_text';
      }

      return { filters, finalLabel: current };
    };

    if (selectedVideos.length > 0) {
      await addLog(`Processing ${selectedVideos.length} video(s)...`);
      const shuffled = shuffle([...selectedVideos]);
      for (let i = 0; i < shuffled.length; i++) {
        const src = path.join(vDir, shuffled[i]);
        const out = path.join(tmpDir, `vslice_${i}.mp4`);
        const dur = await getVideoDuration(src);
        const maxStart = Math.max(0, dur - sliceDuration);
        const startTime = Math.random() * maxStart;
        await addLog(`  Slicing ${shuffled[i]} at ${startTime.toFixed(2)}s for ${sliceDuration}s`);

        const scaleFilter = `[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1[scaled]`;
        const { filters: overlayFilters, finalLabel } = buildOverlayFilter('scaled');
        const filterComplex = [scaleFilter, ...overlayFilters].join(';');

        const logoInputArgs = logoPath ? ['-i', logoPath] : [];
        // Rename logo input label in filter if logo present
        const finalFilter = logoPath
          ? filterComplex.replace('[logo_in]', `[${logoInputArgs.length > 0 ? 1 : 0}:v]`)
          : filterComplex;

        await ffmpegRun([
          '-ss', startTime.toFixed(3),
          '-i', src,
          '-t', String(sliceDuration),
          ...logoInputArgs,
          '-filter_complex', finalFilter,
          '-map', `[${finalLabel}]`,
          '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
          '-an', // mute audio
          '-y', out
        ]);
        parts.push(out);
        await setStatus('running', 5 + Math.round((i / selectedVideos.length) * 30));
      }
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
      const logoInputIdx = selectedImages.length;

      // Scale + concat all images
      let filterParts = [];
      for (let i = 0; i < selectedImages.length; i++) {
        filterParts.push(`[${i}:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`);
      }
      const concatInputs = selectedImages.map((_, i) => `[v${i}]`).join('');
      filterParts.push(`${concatInputs}concat=n=${selectedImages.length}:v=1:a=0[slide]`);

      // Logo overlay
      let current = 'slide';
      if (logoPath) {
        filterParts.push(`[${logoInputIdx}:v]scale=180:-1[logo_scaled]`);
        filterParts.push(`[${current}][logo_scaled]overlay=W-w-24:H-h-24[after_logo]`);
        current = 'after_logo';
      }

      // Text overlay
      if (safeText) {
        let textF = `[${current}]drawtext=fontsize=52:fontcolor=white:x=(w-text_w)/2:y=h-110:text='${safeText}':shadowcolor=black@0.8:shadowx=3:shadowy=3:borderw=2:bordercolor=black@0.5`;
        if (safeSub) {
          textF += `,drawtext=fontsize=30:fontcolor=white@0.9:x=(w-text_w)/2:y=h-58:text='${safeSub}':shadowcolor=black@0.8:shadowx=2:shadowy=2`;
        }
        textF += `[final]`;
        filterParts.push(textF);
        current = 'final';
      }

      const slideshowOut = path.join(tmpDir, 'slideshow.mp4');
      await ffmpegRun([
        ...imgInputArgs,
        ...logoInputArgs,
        '-filter_complex', filterParts.join(';'),
        '-map', `[${current}]`,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', '23',
        '-an',
        '-y', slideshowOut
      ]);
      parts.push(slideshowOut);
      await setStatus('running', 70);
      await addLog('Slideshow segment created.');
    }

    if (parts.length === 0) {
      throw new Error('No video or image files to process. Please add files to the batch first.');
    }

    // ── Step 3: Concatenate all parts ─────────────────────────────────────────
    await addLog('Concatenating all segments...');
    await setStatus('running', 80);

    const outputFile = `output_${job.id}.mp4`;
    const outputPath = path.join(OUTPUT_DIR, outputFile);

    if (parts.length === 1) {
      fs.copyFileSync(parts[0], outputPath);
    } else {
      // Write concat list
      const listFile = path.join(tmpDir, 'concat_list.txt');
      fs.writeFileSync(listFile, parts.map(p => `file '${p}'`).join('\n'));
      await ffmpegRun([
        '-f', 'concat', '-safe', '0',
        '-i', listFile,
        '-c', 'copy',
        '-y', outputPath
      ]);
    }

    // Cleanup tmp
    fs.rmSync(tmpDir, { recursive: true, force: true });

    await setStatus('done', 100);
    await Job.updateOne({ id: job.id }, { outputFile });
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
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }

function getVideoDuration(filePath) {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1', filePath
    ]);
    let out = '';
    proc.stdout.on('data', d => out += d);
    proc.on('close', code => {
      const dur = parseFloat(out.trim());
      resolve(isNaN(dur) ? 10 : dur);
    });
    proc.on('error', reject);
  });
}

function ffmpegRun(args) {
  return new Promise((resolve, reject) => {
    console.log('ffmpeg', args.join(' '));
    const proc = spawn('ffmpeg', args);
    let errOut = '';
    proc.stderr.on('data', d => { errOut += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) {
        reject(new Error(`ffmpeg exited ${code}: ${errOut.slice(-500)}`));
      } else {
        resolve();
      }
    });
    proc.on('error', err => reject(new Error(`ffmpeg not found: ${err.message}. Make sure ffmpeg is installed.`)));
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
