# Batchlyst — CLAUDE.md

## Project Overview

Batchlyst is a batch video/image generation tool. Users upload media batches, configure layouts and settings via presets, and generate social media content (videos, posts, quote cards) with FFmpeg processing. It includes Claude AI integration for metadata generation and quote suggestions.

## Architecture

```
videogenerator-web/
├── server/           # Express.js API server (port 5001)
│   ├── index.js      # Single-file server — all routes, models, FFmpeg logic
│   └── data/         # Runtime data (gitignored)
│       ├── batches/      # Uploaded media files, organized by batch
│       ├── outputs/      # Generated video/image outputs
│       ├── assets/       # Shared assets (overlays, logos)
│       ├── overlays/     # Overlay image files
│       ├── fonts/        # TTF font files
│       ├── preset_logos/ # Per-preset logo uploads
│       └── audio_batches/ # Audio file collections
├── client/           # React frontend (port 3000)
│   └── src/
│       ├── App.jsx           # Root layout, sidebar nav, tab routing
│       ├── index.css         # Global styles, Tailwind, custom CSS classes
│       ├── components/       # All UI panels and feature components
│       ├── context/          # AuthContext (JWT + Google OAuth)
│       └── lib/utils.js      # cn() helper (clsx + tailwind-merge)
└── docker-compose.yml
```

## Running Dev Servers

```bash
# Server (from project root or server/)
cd server && npm run dev        # nodemon, auto-restarts on change

# Client (from project root or client/)
cd client && npm start          # react-scripts dev server, proxies /api → :5001
```

Both must run simultaneously. The client proxies API calls to `http://localhost:5001` (configured in `client/package.json` via `"proxy"`).

## Key Tech Stack

- **Frontend**: React 18, Tailwind CSS v3, Radix UI primitives, Lucide icons, Vite (via react-scripts)
- **Backend**: Express.js, Mongoose/MongoDB, Multer (file uploads), FFmpeg (video/image processing), JWT + Google OAuth
- **AI**: Claude API (via `@anthropic-ai/sdk`) — metadata generation, quote suggestions
- **Fonts**: Syne (UI), Space Mono (code/mono), loaded from Google Fonts in `index.html`

## Navigation & Routing

Tab routing uses URL hash (`window.location.hash`). Valid tabs: `home`, `generate`, `posts`, `quotes`, `metadata`, `batches`, `audio`, `presets`, `history`, `profile`, `pricing`. Defined in `App.jsx:38`.

## Layout Conventions

### Generation Screens (GeneratePanel, PostsPanel)
3-column grid layout:
- **Left** (`280px`): Presets, batch picker, file pool — uses `col-scroll min-h-0` for independent scrolling
- **Center** (`1fr`): LayoutEditor only — uses `min-h-0 overflow-hidden flex flex-col`
- **Right** (`380px` video / `360px` posts): Configuration cards — uses `col-scroll min-h-0`
- **Second row** (full width): Generation log — collapsible, auto-opens on generation start

### CSS Grid + Overflow Scrolling Rule
`overflow-y: auto` only activates when the element has a constrained height. CSS Grid items default to `min-height: auto` (expands to content). Always add `min-h-0` to grid items that need scrolling via `.col-scroll`.

### Collapsible Cards Pattern
```jsx
const [open, setOpen] = useState(false);
// Header:
<CardHeader className="cursor-pointer select-none" onClick={() => setOpen(o => !o)}>
  <ChevronDown className={cn("transition-transform", open && "rotate-180")} />
</CardHeader>
// Body:
{open && <CardContent>...</CardContent>}
```
For cards with interactive elements in the header (buttons, toggles), add `e.stopPropagation()` to those elements and put a dedicated chevron button instead of making the whole header clickable.

### LayoutEditor Centering
- Outer div: `flex items-stretch flex-1 min-h-0` — fills center column, enables height containment
- Canvas column: `flex-1 min-w-0 flex flex-col gap-2 justify-center` — vertically centers canvas + button
- Sidebar: `h-full` on both outer wrapper and inner scroll div
- `sidebarDefaultOpen` prop: passed as `false` from generation panels to start collapsed

## Key Files

| File | Purpose |
|------|---------|
| `server/index.js` | All server logic: routes, MongoDB models, FFmpeg pipelines, auth |
| `client/src/App.jsx` | Root component, sidebar, tab routing, toast notifications |
| `client/src/index.css` | Design tokens (CSS vars), global styles, animation classes |
| `client/src/components/GeneratePanel.jsx` | Video generation UI (3-col layout) |
| `client/src/components/PostsPanel.jsx` | Post/image generation UI (3-col layout) |
| `client/src/components/LayoutEditor.jsx` | Canvas preview + layer sidebar, used in both generation panels |
| `client/src/components/PresetsPanel.jsx` | Preset management (video + post presets) |
| `client/src/components/BatchManager.jsx` | Batch CRUD, file upload/management |
| `client/src/components/AudioBatchesPanel.jsx` | Audio file collection management |
| `client/src/context/AuthContext.jsx` | JWT auth state, Google OAuth, login/logout |

## Data Models (MongoDB)

- **Job**: `id, batchName, status, progress, log[], outputFile, outputFiles[], type ('video'|'post'), videoQuotes[], duration, videoFiles[], imageFiles[]`
- **Preset**: video and post presets, stored with `presetType` field
- **User**: auth (email/password + Google OAuth), avatar, credits

## API Base URL

`http://localhost:5001` — hardcoded in `client/src/App.jsx:22` as `const API`.

## Design System

Colors defined as HSL CSS variables in `index.css`:
- `--primary`: `42 48% 57%` (muted gold `#C6A75C`)
- `--background`: `240 4% 5%` (obsidian black)
- `--card`: `240 5% 11%` (dark graphite)
- `--border`: `240 4% 17%`

Custom CSS utility classes in `index.css`:
- `.col-scroll` — independent column scrolling (no scrollbar)
- `.glow-orange` / `.glow-orange-sm` — gold glow shadows
- `.gradient-border` — animated gradient border on hover
- `.status-queued/running/done/error` — job status pill styles
- `.tab-enter` — tab switch animation (applied/removed via JS in App.jsx)
- `.card-in`, `.slide-up`, `.fade-in` — entry animations

## FFmpeg Processing

All FFmpeg logic is in `server/index.js`. The server spawns FFmpeg child processes for video generation, image compositing, and audio mixing. Output files are served statically from `/outputs`.

## Supported Resolutions

- `1920x1080` — 16:9 Landscape (YouTube/TV)
- `1080x1080` — 1:1 Square (Instagram Feed)
- `1080x1920` — 9:16 Portrait (Reels/TikTok/Shorts)
- `3840x2160` — 4K Landscape
- `2160x3840` — 4K Portrait

## Color Filters

Available FFmpeg filter presets: `bw`, `cinematic`, `vibrant`, `warm`, `cool`, `faded`, `sepia`, `matte`, `neon`.
