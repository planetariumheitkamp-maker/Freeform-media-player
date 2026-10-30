# Freeform Media Player

[![Download for Windows](https://img.shields.io/badge/Download_for_Windows-64--bit-2563eb?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/planetariumheitkamp-maker/freeform-media-player/releases/latest/download/Freeform-0.1.0-win-x64.exe)

Freeform is a cross-platform desktop media compositor. Each player is a live GPU surface whose image continuously follows its editable border and interior mesh—not a crop, mask, or CSS transform.

Use it to combine movies, audio, still images, network streams, capture devices, and externally running games or applications in one workspace. Players can remain independent or be linked in arbitrary subsets.

## Highlights

- **Multiple independent players:** move, rotate, scale, rename, hide, lock, duplicate, and delete each surface.
- **Real media warping:** Three.js renders video, audio visualizations, images, test cards, and live captures onto deformed meshes.
- **Two non-destructive editors:** switch between four-corner perspective and advanced border/interior nodes without discarding the other mode's geometry.
- **Selectable link groups:** choose exactly which players share a source and whether transport controls are also linked.
- **External games and apps:** capture a window or display without process injection, emulator integration, or game modification.
- **Portable workspaces:** `.freeform.json` projects store geometry, source references, and groups—not media content.
- **Local-first:** browser-profile autosave, explicit project import/export, and presentation mode.

## Requirements

- Node.js **22.12 or newer**
- npm
- A platform supported by Electron 45: Windows, macOS, or Linux
- OS permission for screen, camera, or microphone capture when those sources are used

## Run the desktop app

```bash
npm ci
npm run dev
```

`npm run dev` starts Vite and Electron together. For a production-style local start:

```bash
npm run build
npm start
```

## Browser development fallback

```bash
npm run dev:browser
```

Open the local URL printed by Vite. The browser fallback supports development and renderer testing, but it is not a substitute for the desktop package:

- Local files are session-only object URLs and must be re-added after reopening.
- Projects are imported/exported through browser file pickers and downloads.
- Desktop capture uses the browser/OS source picker rather than Freeform's desktop source gallery.
- Available codecs, capture audio, and permissions depend on the browser and OS.

## Basic workflow

1. **Add sources** with **Files**, **Stream**, **Screen**, or **Device** in the left rail.
2. **Assign a source** by selecting it. The active player—or every member of its group—receives it.
3. **Add players** with **Add player**. A new player initially inherits the active player's source.
4. **Link a subset** by shift-clicking player rows, then choosing **Link**. The active player is the source leader.
5. **Choose the link mode** in the inspector.
6. **Warp the surface** in Quick or Advanced mode.
7. **Present** when the layout is ready. Editor overlays and rails disappear; the GPU surfaces remain.

### Editors

**Quick / 4-corner**

- Drag any corner to define a perspective quad.
- A homography drives a subdivided 20 × 20 projective mesh.
- Use this for fast keystone, perspective, and four-sided output alignment.

**Advanced**

- Drag border and interior nodes independently.
- Use **Border node** to insert a constrained point near an edge.
- Use **Interior node** to insert a point inside the polygon.
- Double-click an advanced node to delete it when the resulting mesh remains safe.
- Constrained Delaunay triangulation retains the editable border and interior Steiner points.
- Each node carries a source UV anchor, so the picture deforms with the mesh.

The editor rejects self-intersecting polygons, unsafe border deletion, interior nodes outside the border, and nodes placed too close together. Locking a player prevents geometry edits.

### Link modes

| Mode | Shared within the group | Independent per player |
| --- | --- | --- |
| **Source only** | Source assignment | Play/pause, seek, rate, and other transport state |
| **Source + transport** | Source assignment, play/pause, seek, and playback rate | Geometry, visibility, opacity, volume, mute, and loop |

Transport groups use the first group member as the synchronization leader and correct followers when drift exceeds 220 ms. Geometry is never linked by either mode.

## Source support and limits

| Source | Behavior | Important limits |
| --- | --- | --- |
| Local video, audio, and images | Authorized desktop paths use the `freeform-media://` protocol; audio also has a visual waveform surface | Codec support follows Chromium/Electron; browser files must be re-added after restore |
| Direct HTTP/HTTPS media | Played through the media element | The server must permit CORS and range/media requests as applicable |
| HLS (`.m3u8`) | HLS.js with a locally bundled worker | CORS and codec support apply; DRM-encrypted HLS is not supported |
| Windows, displays, games, and apps | Electron `desktopCapturer` plus `getDisplayMedia` | Launch the external app separately; OS capture permission and system-audio support vary |
| Cameras and capture devices | `getUserMedia`, with optional audio | Device access and labels require permission |
| Calibration test card | Built-in orientation and geometry reference | Static source with no timeline |

Freeform does not inject code into games, run emulators, bypass DRM, or make a CORS-restricted third-party stream universally playable. Protected content may refuse capture or playback at the OS, browser, or service level.

## Workspace persistence

**Export** creates a `.freeform.json` file containing:

- Project name, players, transforms, opacity, and playback settings
- Quick corners, advanced nodes, border constraints, and UV anchors
- Source references and link groups

It does **not** embed movies, audio, images, or captured streams. Local session URLs are stripped during serialization, and live/file sources are saved disconnected. Desktop projects attempt to reauthorize saved local paths on restore; browser-session files must be re-added. Imported live captures remain stopped until explicitly reconnected.

Local autosave restores the workspace in the same application profile. Use **Export** for a portable project file.

## Controls

| Input | Action |
| --- | --- |
| Drag player body | Move the player |
| Drag corner/node | Deform the active surface |
| Shift-click player rows | Select a subset to link |
| Mouse wheel | Zoom around the pointer |
| Alt-drag or middle-drag | Pan the workspace |
| Space | Play/pause the active player or transport group |
| V | Select tool |
| M | Show/hide mesh overlays |
| Delete / Backspace | Delete selected players |
| Escape | Return to Select or exit presentation |
| Ctrl/Cmd + O | Import a workspace |
| Ctrl/Cmd + S | Export a workspace |

## Tests

```bash
npm test
npx playwright install chromium
npm run test:e2e
```

The unit suite covers homographies, constrained meshes, safe editing, groups, project validation, and portable serialization. The Playwright suite exercises perspective and advanced-node editing, subset grouping, generated-video playback across linked players, transport synchronization, project export, and browser console/page errors.

The browser suite generates its WebM fixture at runtime in Playwright's output directory. No test media is committed. To use an existing Chromium executable:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:e2e
```

## Desktop packages

```bash
npm run pack   # unpacked application directory
npm run dist   # platform installers/archives
```

Artifacts are written to `release/`. Build native packages on the target OS, or use the included GitHub Actions matrix for Windows, macOS, and Linux. Configured outputs are NSIS/ZIP for Windows, DMG/ZIP for macOS, and AppImage/ZIP for Linux. Release signing, notarization, and publishing credentials are intentionally not included.

## Architecture

- **Electron** desktop shell with context isolation, sandboxing, disabled renderer Node integration, and a narrow preload IPC bridge
- **React + TypeScript + Vite** interface and production build
- **Three.js** orthographic GPU workspace and media textures
- **Zustand** workspace state
- **cdt2d** constrained triangulation
- **HLS.js** network playback with a bundled transmux worker

The renderer also runs in a browser for development and automated verification. The Electron main process owns file dialogs, saved-path authorization, desktop capture negotiation, fullscreen, and the custom media protocol.

## License and credits

Freeform is available under the [MIT License](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for the major bundled dependencies and font credits.
