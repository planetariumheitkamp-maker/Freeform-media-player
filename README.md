# Freeform Media Player

[![Download for Windows](https://img.shields.io/badge/Download_for_Windows-64--bit-2563eb?style=for-the-badge&logo=windows&logoColor=white)](https://github.com/planetariumheitkamp-maker/freeform-media-player/releases/latest/download/Freeform-Live-AI-0.2.0-live-ai.0-win-x64.exe)

Freeform is a cross-platform desktop media compositor. Each player is a live GPU surface whose image continuously follows its editable border and interior mesh—not a crop, mask, or CSS transform.

Use it to combine movies, audio, still images, network streams, capture devices, and externally running games or applications in one workspace. Players can remain independent or be linked in arbitrary subsets.

## Highlights

- **Multiple independent players:** move, rotate, scale, rename, hide, lock, duplicate, copy/paste, and delete each surface. Multi-select players for alignment, distribution, batch edits, and whole-selection resizing.
- **Real media warping:** Three.js renders video, audio visualizations, images, test cards, and live captures onto deformed meshes, with independent media-only rotation and sizing.
- **Two non-destructive editors:** switch between four-corner perspective and advanced border/interior nodes without discarding the other mode's geometry.
- **Selectable link groups:** choose exactly which players share a source and whether transport controls are also linked.
- **External games and apps:** capture a window or display without process injection, emulator integration, or game modification.
- **Reference or portable projects:** `.freeform.json` files preserve the complete workspace. Save file keeps media as references; Portable embeds connected local media and the custom grid for transfer to another computer.
- **Local-first recovery:** five rotating autosave generations, 10 named internal workspace saves, manual recovery, diagnostics export, and filename-based batch relinking.
- **Dome projection:** five installation presets, three fisheye models, per-player dome-warp and prewarped-bypass controls, calibration, and projector/unwarped/audience previews.
- **Workspace history:** 100 undo/redo steps for layout and settings edits, with one step per drag.

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

- Newly added local files use session-only object URLs and must be re-added after restoring reference-only projects; Portable exports preserve them as embedded data URLs.
- Projects are imported/exported through browser file pickers and downloads.
- Desktop capture uses the browser/OS source picker rather than Freeform's desktop source gallery.
- Custom-page capture, window recording, recording-folder selection, and the recording library require the desktop app; the browser can still verify and preview direct media and sandboxed pages, and save custom providers in its own browser profile.
- Available codecs, capture audio, and permissions depend on the browser and OS.

## Basic workflow

1. **Add sources** with **Files**, **Stream**, **Screen**, **Device**, or **Custom / verify** in the left rail. Custom sources support verified direct media, HLS, and sandboxed external-player pages; **Recordings** reopens saved window captures.
2. **Assign a source** by selecting it. The active player—or every member of its group—receives it.
3. **Add players** with **Add player**. A new player initially inherits the active player's source.
4. **Link a subset** by shift-clicking player rows, then choosing **Link**. The active player is the source leader.
5. **Choose the link mode** in the inspector.
6. **Trace a custom player** with **Trace**. Drag a closed freehand outline and release to create an advanced player with border nodes. The new player inherits the active player's source and is selected automatically.
7. **Warp the surface** in Quick or Advanced mode.
8. **Expand the workspace** with the minimize buttons in the Sources and Inspector headings. Use the floating edge buttons to restore either rail independently.
9. **Customize the editing grid** with **Grid** in the workspace toolbar. Choose **Cartesian grid** to set **Cell size** (20–400 workspace units), **Rotation** (−180° to 180°), and **Skew X/Y** (−45° to 45°). Choose **Circular grid** for concentric elevation rings, azimuth spokes, outer ticks, and degree labels; adjust **Rings** (1–32), **Spokes** (4–72), **Radius** (10–100% of the output's shorter side), and **Rotation**. Enable **Snap to circular grid** to align dragged quick corners, dragged advanced border/interior nodes, and newly placed interior nodes to nearby ring/spoke intersections. Snapping follows grid rotation and output size, uses a 12-screen-pixel tolerance, and pauses while a usable custom image background is visible. Player-body movement, border-node insertion, and freehand tracing remain unsnapped. **Reset geometry** restores the Cartesian default. You can also import a PNG, JPEG, WebP, or GIF image, or restore the built-in grid. Imported images keep their own proportions and are fitted inside the current output without distortion; changing the output size refits the grid automatically. All grid geometry and images are editor-only and hidden in Present mode.
10. **Set the output size, projection quality, and backdrop** with **Output** in the workspace toolbar. Choose Default (1600 × 900), Full HD (1920 × 1080), Square (2048 × 2048), or 4K UHD (3840 × 2160), or enter custom dimensions from 160 to 7680 pixels per axis. Values are rounded to whole pixels. Players retain their positions and shapes when the output changes; **Reset size** restores 1600 × 900. **Projection quality** offers Standard (native display density), High (2× supersampling, mipmaps, up to 8× anisotropic filtering), and Ultra (3× supersampling, mipmaps, up to 16× anisotropic filtering). Higher settings increase GPU load and are capped by texture limits and a 67 MP render budget. **Live render** reports the actual canvas resolution and effective pixel ratio, with frame rate and frame time averaged over one-second samples on the current device. Match the output to the projector and use high-resolution sources; supersampling cannot restore missing source detail. Use **Opacity** or **Hide output background** to adjust or hide only the editor's output backdrop; media players and alignment guides remain visible.
11. **Configure a dome** with **Planetarium**. Start from a preset or choose a lens model, then enable **Dome warp** for each desired player in the Inspector. Use the Setup, Calibration, Installation, and Preview tabs to tune and verify the installation. Players remain unwarped by default.
12. **Save the workspace** with **Saves** for a named internal snapshot, **Save file** for a reference-only `.freeform.json` project, or **Portable** to embed connected local media and the custom grid. Use **Open** to restore either project-file variant and **Recovery & diagnostics** to inspect autosave generations.
13. **Present** when the layout is ready. Editor overlays and rails disappear; the GPU surfaces remain. Press **H** or select **Present controls** to open the left-side floating window. Drag its **PRESENT / LIVE** heading to reposition it, use the reset arrow to return it to the upper left, or pin it to prevent auto-hiding. Drag the **lower-right resize handle** to adjust its width and height within the viewport (304–720 px wide, with content scrolling in shorter panels). With the handle focused, arrow keys resize by 16 px and Shift + arrow by 32 px; double-click the handle or press **Home** to restore the default 384 px width and automatic height. Unpinned controls stay open during hover, keyboard focus, dragging, resizing, and media dialogs. The **Players** and **Media** views provide the standard player selection, adding, visibility, geometry locking, linking, source assignment, file/stream/capture/custom-source/recording, and reconnection workflows without leaving Present. Escape closes a media dialog without exiting presentation. In the **Present** view, **Layout + window** captures player geometry and the normal desktop-window bounds, restores them on later entries, and prevents live dragging and native movement/resizing while locked. **Transparent background** in the desktop app reveals the actual windows behind Freeform rather than merely fading the output. **Ambient lighting** offers Edge matched and Average color modes with Intensity, Spread, and Smoothing controls; it renders below the sharp media over either an opaque or transparent background. These preferences and the locked layout are autosaved with the project; floating-window position, size, and pin state are session-local. Transparency and ambient lighting default to off, and leaving Present restores an opaque, movable editing window. On Windows, transparent windows cannot restore ordinary native edge resizing in Electron 45, so Freeform provides in-app edge and corner handles while editing; the OS may continue to report the window as non-resizable even though these handles change its size.

### Catalog and external providers

Choose **Catalog** in the top bar to open the provider-only **Providers** panel. The **Provider** dropdown contains the five enabled built-in adapters—**Vidqueen, Vidrift, Vidbolt, Cinezo, and VidLink**—plus any verified custom providers saved in the current application profile. The former Browse view, native demo-library browser, provider directory cards, and embedded Catalog playback frame are not part of this simplified panel. Existing native catalog project metadata and bundled media helpers remain supported for previously saved workspaces.

Select **Movie** or **Series**, enter the numeric TMDB ID, and—for a series—enter the season and episode. Season `0` is accepted for specials. Vidqueen additionally offers its documented Default, ArtPlayer, Vidstack, Plyr, Video.js, Media Chrome, MC Capsule, MC Slate, and Onyx variants. Autoplay is disabled where the provider documents that option.

External media requires the authorization checkbox before **Open player window** becomes available. The URL builder accepts only positive decimal TMDB IDs and hard-coded documented routes; it does not accept arbitrary URLs. No provider request is made before submission. Changing the form clears the current playback state, and changing providers resets the form and closes the current desktop player window.

In the desktop app, submission opens a dedicated `BrowserWindow` with the Electron renderer sandbox disabled so providers that refuse an iframe sandbox can run directly. Context isolation, web security, denied permissions, and restricted same-provider navigation remain enabled; Node integration and the Freeform preload bridge are not exposed. Custom players must also stay on their verified sample page's origin. Popups remain denied except for Vidrift's exact blank 1 × 1 playback-capability probe: that child is hidden, matches the dedicated player's renderer-sandbox state as required by Electron 45, cannot navigate externally or open more windows, and is force-closed within one second. It has no Node integration or Freeform bridge. Other blank, external, and named popups are still denied. In a browser, submission opens a popup with `noopener,noreferrer`; old popups must be closed manually because Freeform intentionally has no access to them.

**Ad & tracker request blocking** is enabled by default for dedicated desktop player windows. Open **Edit blocked domains** in the provider settings to change the hostname rules or restore the defaults; one hostname per line also covers its subdomains. The toggle and rules apply immediately to new requests in the current provider window and are saved in the application profile. This is Freeform's built-in Electron request filter, **not AdGuard Home**, DNS filtering, or cosmetic element removal. It cannot block advertising served from an otherwise allowed provider or media hostname, and adding a required provider or CDN hostname can prevent playback. Browser popups are not filtered.

**Add captured window to mesh** captures the actual desktop player window into a live mesh source for geometry, visual adjustments, media transforms, and dome warp. Browser popups are preview-only and cannot be captured into a mesh. Keep the desktop player window available while its live source is in use. Third-party provider compatibility, DRM behavior, media rights, and future availability are not guaranteed. **Vidmario, VidCine, VidUp, and VSEmbed remain disabled** because equivalent official TMDB embed documentation was not found. Freeform does not scrape provider pages, resolve streams, or bypass DRM or access controls.

### Verified custom sources and player-window recordings

Choose **Sources → Custom / verify** to connect your own source. **Direct media / HLS** accepts public HTTPS video, audio, and HLS manifest URLs; **External web player** accepts a public HTTPS external player page. These are direct media and page URLs, not arbitrary JSON API-response mappings. The existing **Stream** action remains available as the quick, unverified route.

Select **Verify connection** before any preview is loaded. Freeform validates the URL, resolves and checks the destination, makes a small ranged request, follows at most three manually validated redirects, and reports the response type, final origin, and CORS header. Localhost, private-network addresses, credentials, non-HTTPS URLs, and custom ports are rejected. The browser fallback has the same URL restrictions, but a remote server must also permit browser CORS verification. Then inspect the actual media or web-player preview—without an iframe sandbox—and explicitly confirm it is the expected source before adding it.

Direct verified media becomes a native video or audio source with mesh, visual-adjustment, and dome controls. A verified embedded player is saved with **Add to provider dashboard**, which opens the Catalog provider dropdown with that entry selected. The profile holds up to 20 custom players. Saving the same final verified URL updates its existing entry instead of creating a duplicate. Custom entries are profile-local: they are not included in `.freeform.json` projects, named workspace saves, or portable exports, and clearing browser or application storage removes them. Removing an entry affects only the provider dropdown, not existing workspace players or recordings.

Before saving a web player, review its **Movie URL pattern** and optional **Episode URL pattern**. Common sample URLs such as `/movie/603` and `/tv/1399/1/2` receive editable suggestions. Movie patterns require `{tmdb}`; episode patterns require `{tmdb}`, `{season}`, and `{episode}` and enable **Series**. Both must remain on the verified sample page's public HTTPS origin. Consult the provider's documentation for its actual routes: only the sample page is technically verified, not each generated movie or episode page. Existing fixed-URL custom entries remain playable without TMDB fields.

Saved custom providers use the same TMDB form, dedicated playback window, mesh assignment, and source-audio recording controls as built-in providers. The output area reports the requested URL and window state rather than embedding remote content inside Catalog.

**Record window** starts a manual WebM recording of the visible player window; **Stop & save** finalizes it. Recording always requests audio from the same player window's `WebFrameMain`, never the computer-wide system loopback or another application's audio. This is independent of the optional mesh-audio checkbox. Local player audio is configured to remain audible while recording, and the recorder reports **Player audio connected** or warns when no audio track is available. Start playback before recording; paused, silent, unsupported, or protected sources may still produce video without audio. Closing the player window or dismissing its recording controls also stops and finalizes an active recording. **Choose folder** selects the destination for this app session. **Sources → Recordings** lists up to 200 WebM files in the selected folder, opens the folder, and adds a recording as an ordinary native local-video source in a new mesh player. No recording begins automatically, and the recording library requires the desktop app.

A technical check confirms reachability and selected response properties only. It does not verify content rights, every remote script's safety, DRM behavior, codec availability, or future availability; use sources you are authorized to access. Saved remote content can change after verification, so inspect it again before capture or recording. Protected content may refuse capture. Recording uses the available Chromium WebM codecs and a 12 Mbps video target, so actual dimensions, frame rate, and audio depend on the source and OS. An abrupt application or system termination can leave an unfinalized WebM; normal Stop, dialog unmount, and player-window closure are handled.

### Editors

**Quick / 4-corner**

- Drag any corner to define a perspective quad.
- A homography drives a subdivided 20 × 20 projective mesh.
- Use this for fast keystone, perspective, and four-sided output alignment.

**Advanced**

- Use **Trace** to draw a closed custom border. Freehand samples are simplified to at most 96 border nodes, with redundant samples around the closure removed.
- Open **Trace settings** to choose **Crop to shape** (the current default) or **Whole source in shape**, which wraps the complete source around a concave outline instead of trimming source regions. The mapping choice applies to newly traced players.
- In the same dialog, adjust **Border smoothing** from 0 to 20 workspace units in 0.5-unit steps (default 2.5) and **Interior node spacing** from 8 to 96 whole workspace units (default 24). Higher smoothing removes more border detail; larger interior spacing creates fewer nodes.
- After tracing a border, **Interior trace** activates automatically. Draw open paths inside the new player to place evenly spaced interior nodes along them; draw as many paths as needed, then choose **Select** to finish.
- **Interior trace** can also be enabled for any unlocked advanced player. Selecting it for a Quick player first preserves that shape in Advanced mode.
- Interior paths are resampled at the configured interval, up to 80 candidates per stroke. Candidates outside the border or too close to the border and existing nodes are ignored. Trace settings apply only to new strokes and never change existing players or nodes.
- Drag border and interior nodes independently.
- Use **Border node** to insert a constrained point near an edge.
- Use **Interior node** to insert a point inside the polygon.
- Double-click an advanced node to delete it when the resulting mesh remains safe.
- Constrained Delaunay triangulation retains the editable border and interior Steiner points.
- Each node carries a source UV anchor, so the picture deforms with the mesh.

The editor rejects self-intersecting polygons, unsafe border deletion, interior nodes outside the border, and nodes placed too close together. Locking a player prevents geometry edits. Escape returns to Select and discards an in-progress trace.

### Multi-player selection and navigation

Shift-click players or player rows to build a selection, or drag a marquee across empty workspace space to select player centers; hold Shift for an additive marquee. In an advanced player, Shift-drag over its nodes to select several nodes and move them together. Multi-selected players can be moved, copied, deleted, linked, or batch-edited in the Inspector.

The **Align / Distribute** controls align selection bounds on any edge or center axis and distribute three or more player centers evenly. **Selection width** and **Selection height** resize the entire unlocked selection around its center, including positions and mesh geometry, so relative gaps remain consistent. Locked players stay fixed.

The mouse wheel zooms around the pointer; Alt-drag or middle-drag pans. The viewport controls provide zoom in/out, fit output, and **Zoom to selection**; **F** also frames the current selection. Dome-aware zoom and dragging use the displayed warped geometry, or the flat geometry while Unwarped source preview is active.

### Media appearance and clipboard

**Media rotation** and **Media scale** in the inspector transform only the source texture. Media scale ranges from 0.1× to 10×; player position, rotation, scale, corners, border nodes, interior nodes, and UV anchors remain unchanged. **Reset media transform** restores unrotated, 1× media without resetting the player shape.

**Ctrl/Cmd + C** copies every selected player to Freeform's internal clipboard, and **Ctrl/Cmd + V** pastes independent clones with a 48, −36 workspace-unit offset. Successive pastes move farther to avoid exact overlap. Pasted players are unlocked, autoplay enabled, and selected. Sources, geometry, media appearance, and playback settings are preserved; copied link groups are recreated with new IDs when at least two of their members are copied. The clipboard is internal to the running app and does not replace the operating-system clipboard.

### Undo and redo

**Ctrl/Cmd + Z** undoes and **Ctrl/Cmd + Y** or **Ctrl/Cmd + Shift + Z** redoes workspace edits. The top bar also provides Undo and Redo buttons. History retains up to 100 steps and coalesces each pointer drag into one step. It covers players, geometry, media appearance, groups, project name, grids, output settings, trace settings, and planetarium settings. Playback, seek, selection, panel state, and source-connection updates are excluded; current playback values survive geometry restoration. Loading a workspace clears history.

### Planetarium projection

Planetarium mode targets ordinary rectangular content displayed through a single fisheye projector. Each opted-in player is mapped from a tangent plane onto the dome and then through the selected lens projection. Parallel-transported local axes preserve orientation around the dome; player rotation and scale apply before projection, and media-only rotation and scale remain independent. Advanced triangles are adaptively refined and border edges are sampled before projection so curved output does not collapse into straight chords. Handles, selection, dragging, interior tracing, and circular-grid snapping use the corresponding inverse mapping.

**Setup** provides Hemisphere 180°, Full-frame fisheye, Truncated dome, Tilted dome, and Off-center fisheye presets. Choose **Equidistant**, **Equisolid angle**, or **Stereographic** projection, then tune field of view (90–180°), tilt (±45°), center offsets (±50% of output dimensions), truncation (50–100%), and grid azimuth rotation. Truncation is the angular cap mapped to the fisheye rim: 75% at 180° FOV produces a 135° cap. **Dome warp** opts a player in; **Media is prewarped** bypasses a second warp and preserves its ordinary mesh.

The circular grid is an alignment guide, not a media mask. Its radius and rotation drive the projection, while center offsets also shift the guide and labels. Disabling planetarium mode leaves the chosen grid available but renders every player without dome warp.

**Calibration** accepts at least four known azimuth/elevation references and measured output positions. Drag observed points or enter their coordinates, inspect predicted-point residuals, and solve center, tilt, and azimuth with RMS and maximum-error feedback. Calibration-point drags participate in undo/redo. **Installation** stores dome diameter, spring line, projector height, lens throw ratio, and venue/projector/lens notes with the project; these metadata fields do not change the optical model or constitute a measured lens profile.

**Preview** switches among final projector output, an editor-only unwarped bypass, and a virtual-hemisphere audience geometry view. Audience view hides editor-only grid labels, player labels, mesh lines, and handles; it is a geometric visualization, not a measured perceptual or photometric simulation. Projector mode also offers split before/after comparison. Five built-in calibration-source patterns—orientation/safe frame, crosshatch, starfield, convergence targets, and latitude/longitude—support alignment. Presentation always uses final projector output.

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
| Verified custom media and HLS | Technical verification, explicit preview/confirmation, then native playback | Public HTTPS default ports only; private/local addresses, credentials, and arbitrary JSON API mappings are rejected; CORS and codec support apply |
| Verified custom web players | Saved in the Catalog provider dropdown; unrestricted-content preview, dedicated-window capture, mesh assignment, and manual WebM recording | Up to 20 profile-local entries; capture and recording are desktop only; navigation stays on the verified origin; page controls are included; protected content may refuse capture |
| Saved window recordings | Recording library reopens WebM files as native mesh-ready local-video sources | Desktop only; choose a recording folder first; newly recorded streams may not have a finite duration or reliable seeking |
| Windows, displays, games, and apps | Electron `desktopCapturer` plus `getDisplayMedia` | Launch the external app separately; OS capture permission and system-audio support vary |
| Cameras and capture devices | `getUserMedia`, with optional audio | Device access and labels require permission |
| Calibration test card | Built-in orientation and geometry reference | Static source with no timeline |

Freeform does not inject code into games, run emulators, bypass DRM, or make a CORS-restricted third-party stream universally playable. Protected content may refuse capture or playback at the OS, browser, or service level.

## Workspace persistence

All project variants use the `freeform-workspace` version 1 format and preserve:

- Project name, players, player and media transforms, opacity, and playback settings
- Quick corners, advanced nodes, border constraints, and UV anchors
- Output dimensions, projection quality, and backdrop opacity, trace settings, complete planetarium setup/calibration/installation/preview settings, per-player dome controls, source references, link groups, Cartesian/circular grid geometry, circular-grid snapping, custom grid information, and Present settings (including the locked layout snapshot and normal desktop-window placement)

**Save file** writes a reference-only `.freeform.json` project. Local file and live-source session URLs are stripped; embedded data URLs are retained. Desktop restores attempt to reauthorize saved local paths, while browser-session files and reference-only grids must be re-added. Live captures remain stopped until explicitly reconnected.

**Portable** writes the same project format with every connected local file source and the available custom grid embedded as data URLs, so they can be restored without the original paths. All local file sources must be connected before export. Live captures and network streams are not embedded. Limits are 256 MB per embedded file and 512 MB total source bytes; the resulting JSON is larger because of base64 encoding.

**Saves** opens the internal library, which holds up to **10 named, reference-only workspace snapshots** in the same application profile. **Save current** creates a new slot; each slot supports **Load**, **Overwrite**, and confirmed **Delete**. Browser/storage quota errors are reported in the dialog.

Five rotating autosave generations are kept separately from named saves. Startup restores the newest valid generation and falls back to an older valid snapshot if the newest is corrupt. **Recovery & diagnostics** lists generations for manual restoration and exports a diagnostics report containing runtime details, source connection states, recovery metadata, and recent renderer errors—but not saved media paths. Named internal saves are not included in exported project files.

**Relink missing media** in the Sources rail reconnects disconnected file sources in a batch by case-insensitive filename match, without duplicating a selected file across multiple sources. This is useful after moving a reference-only project and its media folder to another computer.

## Controls

| Input | Action |
| --- | --- |
| Drag player body | Move the player |
| Drag corner/node | Deform the active surface |
| Trace toolbar button | Draw a closed freehand border and create a new advanced player |
| Trace settings toolbar button | Choose crop or whole-source mapping and adjust smoothing and interior-node spacing for new strokes |
| Interior trace toolbar button | Draw paths that place interior nodes inside the active advanced mesh |
| Shift-click players or player rows | Build a multi-player selection for editing or linking |
| Drag empty workspace | Marquee-select player centers; hold Shift to add to the selection |
| Shift-drag over advanced nodes | Select several nodes in the active advanced player |
| Sources / Inspector minimize button | Collapse that rail and expand the workspace |
| Floating edge button | Restore the corresponding minimized rail |
| Grid toolbar button | Adjust Cartesian/circular grid geometry, or import, replace, and reset the editor-only background grid |
| Output toolbar button | Choose output dimensions and Standard/High/Ultra projection quality, inspect live resolution/pixel ratio/FPS/frame time, or adjust and hide the editor-only output backdrop |
| Planetarium toolbar button | Configure presets, projection, calibration, installation metadata, previews, and test patterns |
| Dome warp inspector checkbox | Opt the active player into dome projection while planetarium mode is enabled |
| Media appearance inspector fields | Rotate or scale only the active player's source texture |
| Saves toolbar button | Create, load, overwrite, or delete one of 10 named internal workspace saves |
| Portable toolbar button | Export a project with connected local media and the custom grid embedded |
| Recovery & diagnostics button | Restore an autosave generation or export diagnostics |
| Relink missing media button | Batch-reconnect disconnected file sources by filename |
| H or Present controls button | Reveal or hide the floating Present window; hover, focus, dialogs, or pinning keep it available |
| Drag PRESENT / LIVE heading | Move the floating Present window; the reset arrow restores its upper-left position |
| Drag lower-right Present resize handle | Adjust floating-window width and height; double-click to restore the default size |
| Present resize handle + arrow keys | Resize by 16 px, or 32 px with Shift; Home restores the default size |
| Present → Players | Select, add, hide, lock, multi-select, or link players without leaving presentation |
| Present → Media | Assign, add, reconnect, or replace sources without leaving presentation |
| Present → Layout + window | Save/restore player geometry and desktop-window placement; block live dragging and native movement/resizing while locked |
| Present → Transparent background | Reveal the real desktop behind media in the desktop app; unavailable in browser previews |
| Present → Ambient lighting | Toggle edge/average glow and tune intensity, spread, and smoothing |
| F | Zoom to the current player selection |
| Mouse wheel | Zoom around the pointer |
| Alt-drag or middle-drag | Pan the workspace |
| Space | Play/pause the active player or transport group |
| V | Select tool |
| M | Show/hide mesh overlays |
| Delete / Backspace | Delete selected players |
| Escape | Return to Select, discard an in-progress trace, or exit presentation |
| Ctrl/Cmd + Z | Undo the last workspace edit |
| Ctrl/Cmd + Y or Ctrl/Cmd + Shift + Z | Redo the last undone workspace edit |
| Ctrl/Cmd + C | Copy selected players to the internal clipboard |
| Ctrl/Cmd + V | Paste independent player clones and select them |
| Ctrl/Cmd + O | Open a workspace file |
| Ctrl/Cmd + S | Save the workspace to a file |

## Tests

```bash
npm test
npx playwright install chromium
npm run test:e2e
npm run test:custom-recording
npm run test:present
npm run build
node scripts/verify-provider-capture.mjs
node scripts/verify-vidrift-popup.mjs
```

`npm run test:present` builds and launches real Electron on Windows with an isolated profile. Run it from an **unlocked, interactive Windows desktop**, not a headless, locked, or non-interactive session: the test captures the actual desktop and uses real Windows pointer input to drag an editing-window corner. It checks normal-window placement and native movement locks, resizing while transparent, transparency with a controlled window behind Freeform, both ambient styles and all three sliders, and a second exit after restarting the app to verify locked-layout and monitor/window restoration. The OS `isResizable()` flag may remain false for the transparent window; the test verifies actual bounds instead. Desktop captures, canvas images, and a machine-readable report are written to `artifacts/present-mode/`. The test creates and closes only its own windows; no existing application window is used as the transparency reference. To prepare the isolated app and helpers without launching them, run `node scripts/verify-present-interactive.mjs --prepare-only`, then open `test-results/native-launcher.exe` in the interactive desktop.

The Vidrift verification first uses a controlled reproduction to test the exact native capability probe, hidden child security, forced cleanup, nested-popup denial, and external-popup denial. It then loads the real TMDB `1368337` player without response or script rewriting, clicks **Play or pause**, resumes if necessary, and checks active playback and the sandbox-error message's absence. The optional `--baseline` flag reproduces the original denied-popup failure. Reports and screenshots are written to `artifacts/vidrift-popup-check/`.

The unit suite covers homographies, constrained meshes, safe editing, groups, multi-player clipboard cloning and group remapping, project validation, portable serialization and filename relinking, recovery-generation fallback, diagnostics, legacy defaults, freehand tracing, trace settings, grid geometry and shifted-center snapping, output normalization, projection-quality presets and GPU/pixel-budget caps, frame-rate/frame-time sampling, media-protocol content security, internal saves, 100-step undo/redo history including quality restoration, whole-selection transforms, dome presets and validation, calibration solving, truncation and lens models, forward/inverse dome round-trips with rotation, scale, tilt, and grid rotation, custom-source URL and DNS verification, custom-provider persistence/deduplication/removal, validated TMDB URL-pattern generation including season `0` and same-origin enforcement, unsafe-input rejection, source-player-only audio capture without system loopback, recording storage, and custom-source project persistence.

The Playwright suite exercises perspective and advanced-node editing, freehand tracing, linked playback, reference and embedded portable project round-trips, batch relinking, corrupt-autosave recovery, internal saves, panel minimization, custom and built-in grids, circular snapping, output size and opacity, Standard/High/Ultra backing-resolution changes with unchanged geometry, live resolution/pixel-ratio/FPS/frame-time readouts, quality history and reload persistence, media-only transforms, clipboard shortcuts, keyboard and drag undo/redo, multi-player alignment/distribution/marquee/resize, dome presets and per-player visual changes, prewarped bypass, calibration history and solving, all preview modes, split comparison, all five test patterns, the provider-only Catalog dropdown, deferred TMDB-based movie/episode popups including season `0`, popup opener isolation, custom-source verification without an iframe sandbox, saved-provider creation and reload persistence, provider removal, recording-library browser states, workspace persistence across reloads, and browser console/page errors.

`npm run test:custom-recording` builds the app, launches real Electron with an isolated profile, and verifies the complete custom-source → saved-provider → TMDB-ID authorized-player workflow, dedicated-window security preferences, nonblank captured pixels, mesh warping and visual adjustment, manual WebM recording and finalization on player-window closure, folder persistence, and native mesh-ready recording playback. The custom player generates a 440 Hz tone internally; after reopening the saved WebM, the test decodes its audio and asserts one audio track, non-silent RMS, and a matching dominant frequency. This checks the source-player audio path rather than system loopback. Only the custom test page, its technical fetch response, and the native folder-picker destination are mocked; display capture, media streams, recording, filesystem writes, playback, and audio analysis are real. Screenshots and the machine-readable report are written to `artifacts/custom-recording/`. This isolated test is not a substitute for testing a real third-party service, its audio path, or a physical projector.

The browser suite generates its WebM fixture at runtime in Playwright's output directory. No test media is committed. To use an existing Chromium executable:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium npm run test:e2e
```

## Desktop packages

```bash
npm run pack          # unpacked application directory
npm run test:desktop  # smoke-test release/win-unpacked/Freeform.exe
npm run dist          # platform installers/archives
```

The Windows packaged smoke test launches the real executable with an isolated profile, checks the desktop preload and WebGL canvas, changes dome rendering, verifies undo/redo, confirms High projection quality increases the canvas backing resolution, checks live resolution/FPS/frame-time readouts plus quality and recovery-generation persistence across reload, captures a screenshot, and fails on renderer console or uncaught page errors. Its report is written to `test-results/desktop-packaged/desktop-verification.json`.

Artifacts are written to `release/`. Build native packages on the target OS, or use the included GitHub Actions matrix for Windows, macOS, and Linux. Configured outputs are NSIS/ZIP for Windows, DMG/ZIP for macOS, and AppImage/ZIP for Linux. Release signing and notarization credentials are intentionally not included.

After renderer, unit, browser, and packaged-desktop tests pass on `main`, the Windows package job publishes its installer and portable ZIP directly as a new `windows-build-*` release and marks it latest, without relying on temporary artifact storage. The **Download for Windows** button therefore always points to the newest successful build. macOS and Linux packages are also built; their temporary CI artifacts are retained for seven days when storage is available, and an artifact-storage outage does not block Windows releases. This uses GitHub Actions' built-in `GITHUB_TOKEN`; no separate publishing credential is required. Pull-request builds do not publish releases.

### Email-sized Windows packages

Split the existing installer and portable ZIP without rebuilding the app:

```bash
node scripts/make-email-packages.mjs release/performance/Freeform-0.1.0-win-x64.exe release/performance/Freeform-0.1.0-win-x64.zip release/email
```

The command creates `release/email/installer/` and `release/email/zip/`. Files are split into numbered parts of at most 16 MiB (about 22.4 MB after ordinary email base64 encoding). Send one part per email. Each folder includes recipient instructions, a machine-readable manifest with per-part SHA-256 hashes, and a Windows `Reassemble.cmd` launcher. Recipients place every part and helper file in one folder and run the launcher; PowerShell validates the exact parts, reconstructs the original, and verifies its final size and SHA-256.

Email providers may still block executable or archived-executable content, including multipart attachments. Splitting does not guarantee delivery and must not be used to bypass security scanning; use an approved file-sharing service if attachments are blocked.

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
