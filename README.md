# VideoGen Studio

A MERN stack web app that replicates and extends your Kotlin video generator — built with **MongoDB**, **Express**, **React** (shadcn/ui + Tailwind), and **Node.js**, using **FFmpeg** on the backend.

---

## Features

- 📁 **Batch management** — create `BATCH_XXX` folders, upload videos and images via drag-and-drop or file picker
- 🎬 **Video generation** — randomly slices and shuffles video clips, concatenates them
- 🖼️ **Image slideshow** — converts image pools into short video segments (default 0.2s per image)
- 🏷️ **Logo + text overlay** — upload a logo image and set title/subtitle text drawn on the slideshow
- 📊 **Real-time job progress** — polling with live log output and progress bar
- ⬇️ **Download output** — download the final generated `.mp4` directly from the UI
- 📜 **Job history** — browse all past jobs with status and download links

---

## Quick Start (Docker — Recommended)

```bash
git clone <your-repo>
cd videogen
docker-compose up --build
```

Then open **http://localhost:3000**

---

## Manual Setup (Development)

### Prerequisites
- Node.js 18+
- MongoDB running locally on port 27017
- `ffmpeg` installed and in PATH (`brew install ffmpeg` / `apt install ffmpeg`)

### Backend

```bash
cd server
npm install
node index.js
# Server runs on http://localhost:5000
```

### Frontend

```bash
cd client
npm install
npm start
# Dev server runs on http://localhost:3000 (proxies /api to :5000)
```

---

## Project Structure

```
videogen/
├── docker-compose.yml
├── server/
│   ├── Dockerfile
│   ├── index.js          # Express + FFmpeg generation logic
│   ├── package.json
│   └── data/
│       ├── batches/      # BATCH_XXX folders with videos/ and images/
│       ├── outputs/      # Generated .mp4 files (served statically)
│       └── assets/       # Logo image
└── client/
    ├── Dockerfile
    ├── nginx.conf
    ├── package.json
    ├── tailwind.config.js
    └── src/
        ├── App.jsx
        ├── index.css
        ├── lib/utils.js
        └── components/
            ├── BatchManager.jsx   # Batch creation + file upload
            ├── GeneratePanel.jsx  # Generation config + job status
            ├── JobHistory.jsx     # All past jobs
            ├── ui-button.jsx      # shadcn Button
            └── ui-primitives.jsx  # shadcn Card, Input, Progress, etc.
```

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/batches` | List all batches |
| `POST` | `/api/batches` | Create a new batch |
| `GET` | `/api/batches/:name/files` | List files in batch |
| `POST` | `/api/batches/:name/upload/:type` | Upload videos or images |
| `DELETE` | `/api/batches/:name/:type/:file` | Delete a file |
| `POST` | `/api/assets/logo` | Upload logo image |
| `POST` | `/api/generate` | Start a generation job |
| `GET` | `/api/jobs` | List all jobs |
| `GET` | `/api/jobs/:id` | Get job by ID (poll for status) |
| `GET` | `/outputs/:file` | Download generated video |

---

## Generation Logic

1. **Video slices** — each selected video gets a random `sliceDuration`-second clip cut from a random start time, scaled to 1920×1080, then shuffled
2. **Image slideshow** — each selected image is turned into a `imageDuration`-second clip at 1920×1080, all concatenated into one segment
3. **Logo + text** — the logo PNG is overlaid bottom-right; title and subtitle text are drawn bottom-center using `drawtext`
4. **Final concat** — all video slice segments + slideshow segment are concatenated via ffmpeg `concat` demuxer

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://127.0.0.1:27017/videogen` | MongoDB connection string |
| `PORT` | `5000` | Backend server port |
