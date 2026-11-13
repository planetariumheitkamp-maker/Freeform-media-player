import type { GuideTarget } from '../lib/guideActions';

export interface GuideAction {
  label: string;
  target: GuideTarget;
}

export interface GuideStep {
  title: string;
  detail: string;
  bullets?: readonly string[];
  action?: GuideAction;
}

export interface FeatureGuideTopic {
  id: string;
  category: string;
  title: string;
  summary: string;
  overview: readonly string[];
  note: string;
  steps: readonly GuideStep[];
}

export const FEATURE_GUIDE_TOPICS: readonly FeatureGuideTopic[] = [
  {
    id: 'sources',
    category: 'Start here',
    title: 'Sources & playback',
    summary: 'Bring in files, network media, screens, and capture devices, then assign them to players.',
    overview: [
      'A source is the media connection; a player is the rendered surface that displays it. Keeping those concepts separate lets several players show the same media with different geometry and appearance.',
      'Freeform supports local images, video and audio, direct HTTP/HTTPS media and compatible HLS streams, desktop capture, and camera or video-capture devices. Codec and DRM support still depends on the runtime and the source itself.',
    ],
    note: 'A normal workspace file stores references to local media, not the media bytes. Use Portable export when the project must travel with connected files embedded.',
    steps: [
      {
        title: 'Add a local or network source',
        detail: 'Choose Files for local media or Stream for a direct media URL. The first new source is assigned to the active player, or to a new player when none is active.',
        bullets: ['Stream URLs must use HTTP or HTTPS.', 'HLS requires a compatible stream and cross-origin playback permission.', 'DRM-protected services and unsupported codecs are not decoded by Freeform.'],
        action: { label: 'Show source controls', target: 'sources' },
      },
      {
        title: 'Connect a screen or capture device',
        detail: 'Choose Screen to select a window or display, or Device to select a camera/capture device. Grant the operating-system permission when prompted.',
        bullets: ['Desktop capture can optionally include audio.', 'Live inputs remain stopped after a project reload until you reconnect them.', 'Browser and desktop capture pickers differ; follow the picker shown on your device.'],
        action: { label: 'Show source controls', target: 'sources' },
      },
      {
        title: 'Assign media to a player',
        detail: 'Select a player, then click a source row. You can also change the Media Source select in the Inspector.',
        bullets: ['Players linked in a source-sharing group receive the assignment together.', 'The source status dot and Inspector state show whether reconnection is needed.', 'Adding a player with the plus button reuses the active source by default.'],
        action: { label: 'Show players', target: 'players' },
      },
      {
        title: 'Reconnect missing media',
        detail: 'Use the reconnect icon on an individual source, or Relink missing media to match several disconnected files by filename.',
        bullets: ['Check the result message for files that still need individual attention.', 'Replacing a file updates that source connection without rebuilding every player.', 'A missing custom grid is re-imported separately from Grid controls.'],
        action: { label: 'Show source controls', target: 'sources' },
      },
      {
        title: 'Control playback and audio',
        detail: 'Use the transport bar for play/pause, seeking, and rate. The Inspector provides per-player volume, mute, loop, and autoplay settings.',
        bullets: ['Source + transport groups synchronize play/pause, seek, and playback rate.', 'Source only groups share media while leaving transport independent.', 'Live capture has no file timeline, so seek and loop controls are limited accordingly.'],
        action: { label: 'Show player controls', target: 'players' },
      },
    ],
  },
  {
    id: 'players',
    category: 'Start here',
    title: 'Players & link groups',
    summary: 'Build a composition from independent surfaces, multi-select them, and synchronize related players.',
    overview: [
      'Each player owns its shape, position, media transform, visual settings, opacity, and source assignment. The player list is also the place to hide a surface or protect it from movement.',
      'Link groups coordinate media rather than merging geometry. Members keep separate meshes and positions, which makes linked players useful for repeated or adjacent surfaces.',
    ],
    note: 'Locked players cannot be dragged in the editor or Present mode. Hidden players are not hit-tested, so they cannot be moved accidentally.',
    steps: [
      {
        title: 'Add and select players',
        detail: 'Use Add player in the Players section. Click a row or rendered surface to make it active; Shift-click to build a multi-selection.',
        bullets: ['The Inspector edits the active player.', 'With several players selected, compatible Inspector fields are applied as a batch.', 'Click empty workspace and drag to marquee-select players in Select mode.'],
        action: { label: 'Show players', target: 'players' },
      },
      {
        title: 'Align, distribute, and resize a selection',
        detail: 'With two or more players selected, use Align / Distribute in the Inspector. Three or more are required for distribution.',
        bullets: ['Alignment uses the selection bounds.', 'Selection width and height resize the group while preserving its overall arrangement.', 'Use individual X, Y, Scale, and Rotation fields for exact numeric placement.'],
        action: { label: 'Show players', target: 'players' },
      },
      {
        title: 'Create a link group',
        detail: 'Shift-select the players and choose Link, or join an existing group from the Inspector.',
        bullets: ['Source only shares the media assignment.', 'Source + transport also synchronizes playback and rate.', 'Dissolving a group does not delete its players.'],
        action: { label: 'Show players', target: 'players' },
      },
      {
        title: 'Duplicate without rebuilding geometry',
        detail: 'Select one or more players and press Ctrl+C, then Ctrl+V. Pasted players are selected so you can move them as a group.',
        bullets: ['The copied mesh, media transform, appearance, and dome settings are retained.', 'Pasted players receive new identities and a placement offset.', 'The clipboard belongs to the current app session; it is not the operating-system text clipboard.'],
        action: { label: 'Show players', target: 'players' },
      },
      {
        title: 'Protect the finished arrangement',
        detail: 'Use the eye icon to hide a player and the lock icon to protect it from dragging and node editing. Save the workspace after the layout is approved.',
        bullets: ['Locking is especially useful before a live presentation.', 'Unlock a player before editing its nodes or dragging it in the editor or Present mode.', 'Visibility and lock state are saved with the project.'],
        action: { label: 'Show players', target: 'players' },
      },
    ],
  },
  {
    id: 'geometry',
    category: 'Shape media',
    title: 'Quick geometry & advanced mesh',
    summary: 'Choose a four-corner perspective surface or a dense, editable triangular mesh.',
    overview: [
      'Quick mode maps the source through four corners for projective perspective correction. It is the fastest option for rectangular or keystone-shaped surfaces.',
      'Advanced mode uses border and interior nodes to control a constrained triangular mesh. Border nodes define the silhouette; interior nodes control how media UVs bend through the interior.',
    ],
    note: 'Changing the player mesh is different from rotating or scaling the media. Use Mesh Editor for the surface shape and Media Appearance for the content inside that shape.',
    steps: [
      {
        title: 'Correct perspective with four corners',
        detail: 'Select a player, choose 4-corner in Mesh Editor, and drag any visible corner handle.',
        bullets: ['The media follows the quad continuously.', 'Use Select mode rather than a node-placement tool.', 'Reset shape and transform restores the default geometry when you need a clean start.'],
        action: { label: 'Show quick geometry', target: 'quick-geometry' },
      },
      {
        title: 'Switch to an advanced mesh',
        detail: 'Choose Advanced in Mesh Editor. Freeform creates an editable mesh for the player and exposes its border and interior nodes.',
        bullets: ['Mint handles are border nodes; cyan handles are interior nodes.', 'The Inspector reports total and border-node counts.', 'More nodes provide more local control but also require more careful adjustment.'],
        action: { label: 'Show advanced mesh tools', target: 'advanced-mesh' },
      },
      {
        title: 'Place individual nodes',
        detail: 'Choose Border node and click near an edge, or Interior node and click inside the mesh.',
        bullets: ['Border insertion targets the nearest suitable edge.', 'Interior placement only succeeds inside the player silhouette.', 'When circular-grid snapping is enabled, eligible newly placed and dragged nodes snap to nearby intersections.'],
        action: { label: 'Show advanced mesh tools', target: 'advanced-mesh' },
      },
      {
        title: 'Edit one node or a group',
        detail: 'Drag a node directly. Shift-drag inside an advanced mesh to marquee-select nodes, then drag the selected group together.',
        bullets: ['Select exactly one node to edit numeric X/Y coordinates in the Inspector.', 'Double-click a node to delete it when the mesh can still be maintained.', 'Use Mesh or M to hide overlays without changing the underlying geometry.'],
        action: { label: 'Show advanced mesh tools', target: 'advanced-mesh' },
      },
      {
        title: 'Inspect the result at projection size',
        detail: 'Hide editing overlays and inspect straight lines, texture density, and edge continuity before saving.',
        bullets: ['Check for folded triangles or crowded nodes around tight curves.', 'Use Undo to step back through geometry changes.', 'Present mode shows the final media without editor handles.'],
        action: { label: 'Open Present mode', target: 'present' },
      },
    ],
  },
  {
    id: 'tracing',
    category: 'Shape media',
    title: 'Trace borders & interior paths',
    summary: 'Draw a freehand silhouette and guide the placement of interior mesh nodes.',
    overview: [
      'Trace converts a drawn outline into a new advanced player with sampled border nodes. Interior trace then adds nodes along paths you draw inside that mesh.',
      'Trace settings control source mapping and sampling for newly created players. Crop to shape follows the current source region; Whole source in shape wraps the complete source around the outline instead of intentionally cropping it.',
    ],
    note: 'Concave outlines can still produce visually surprising UV flow. Add well-spaced interior nodes and inspect the media rather than judging only the silhouette.',
    steps: [
      {
        title: 'Choose the source mapping',
        detail: 'Open Trace settings before drawing. Select Crop to shape or Whole source in shape according to the content you need to preserve.',
        bullets: ['The setting applies to new traced players.', 'Existing players are not retroactively remapped.', 'Whole-source mapping is useful when every part of the rectangular source must remain in the shape.'],
        action: { label: 'Open Trace settings', target: 'trace-settings' },
      },
      {
        title: 'Tune smoothing and node spacing',
        detail: 'Border smoothing controls outline simplification; Interior node spacing controls the distance between sampled path nodes.',
        bullets: ['Smoothing accepts 0–20 workspace units in 0.5-unit steps.', 'Interior spacing accepts 8–96 whole workspace units.', 'Out-of-range numeric values are clamped when settings are applied.'],
        action: { label: 'Open Trace settings', target: 'trace-settings' },
      },
      {
        title: 'Draw the outer border',
        detail: 'Choose Trace, drag around the desired silhouette, and close the outline near its starting point before releasing.',
        bullets: ['Use a reasonably large, non-self-intersecting outline.', 'The preview shows the sampled stroke while you draw.', 'A successful trace creates an advanced player and activates Interior trace.'],
        action: { label: 'Activate border trace', target: 'trace-border' },
      },
      {
        title: 'Draw interior guide paths',
        detail: 'With the traced player active, drag paths where interior nodes should follow the media flow, then release to sample each path.',
        bullets: ['Keep paths inside the mesh and away from the border and existing nodes.', 'Draw several separate paths for different regions or directions.', 'Choose Select when you are ready to adjust the resulting nodes manually.'],
        action: { label: 'Activate interior trace', target: 'trace-interior' },
      },
      {
        title: 'Refine and validate the mesh',
        detail: 'Use advanced-node tools for local corrections, then inspect detailed media for warping artifacts.',
        bullets: ['Delete or move crowded nodes rather than stacking nearly coincident points.', 'Undo removes an unwanted trace or node edit.', 'Save a named workspace before major experimental refinements.'],
        action: { label: 'Show advanced mesh tools', target: 'advanced-mesh' },
      },
    ],
  },
  {
    id: 'output',
    category: 'Start here',
    title: 'Output size & projection quality',
    summary: 'Match the output to the projector, control its editor backdrop, and monitor rendering cost.',
    overview: [
      'Output dimensions define the projection canvas and its aspect ratio. Players retain their positions and shapes when the output changes, so review the composition after switching formats.',
      'Projection quality controls render scale, filtering, mipmaps, and anisotropy. Higher settings can improve sampling quality but cannot recreate detail absent from the source media.',
    ],
    note: 'Use the projector’s native output resolution where practical. High-resolution rendering is limited by GPU capabilities and a 67 MP safety budget; watch the measured frame rate on the actual presentation computer.',
    steps: [
      {
        title: 'Choose the output dimensions',
        detail: 'Open Output and select a preset or enter custom width and height, then Apply size.',
        bullets: ['Available presets include Default, Full HD, Square, and 4K UHD.', 'Each dimension accepts 160–7680 pixels and is rounded to whole pixels.', 'An imported grid is refitted without distortion when output dimensions change.'],
        action: { label: 'Open Output controls', target: 'output' },
      },
      {
        title: 'Review composition after resizing',
        detail: 'Confirm that every player still sits in the intended part of the new output and that the aspect ratio matches the presentation setup.',
        bullets: ['Player geometry is not automatically recomposed.', 'Fit output in the viewport controls re-centers your editing view.', 'Save a separate named version before making a large layout migration.'],
        action: { label: 'Open Output controls', target: 'output' },
      },
      {
        title: 'Adjust the editor output backdrop',
        detail: 'Use Output background opacity to make the output area more or less visible, or hide its backdrop entirely.',
        bullets: ['This changes the editor backdrop, not the opacity of media players.', 'Players and alignment guides remain visible.', 'Player opacity is controlled separately in the Inspector.'],
        action: { label: 'Open Output controls', target: 'output' },
      },
      {
        title: 'Select projection quality',
        detail: 'Choose a quality preset and inspect the Live render measurements while representative content is playing.',
        bullets: ['Higher render scales consume more GPU memory and processing time.', 'Resolution, pixel ratio, frame rate, and frame time are measured from the active canvas.', 'The displayed frame rate reflects the current rendering workload, not the source’s encoded frame rate.'],
        action: { label: 'Open Output controls', target: 'output' },
      },
      {
        title: 'Verify on the presentation hardware',
        detail: 'Test the actual source, output resolution, quality preset, and dome warp together before the event.',
        bullets: ['Use detailed, high-resolution sources for meaningful sharpness checks.', 'Reduce quality if the measured workload cannot sustain the required playback.', 'Keep a known-good saved workspace for quick recovery.'],
        action: { label: 'Open Present mode', target: 'present' },
      },
    ],
  },
  {
    id: 'grids',
    category: 'Shape media',
    title: 'Grids, backgrounds & snapping',
    summary: 'Set the workspace color, reshape built-in guides, or import a custom alignment image.',
    overview: [
      'The workspace color appears behind players in editing and Present mode. Built-in grid lines and imported guide images are editing aids and do not appear in Present mode.',
      'Cartesian grids support cell size, rotation, and skew. Circular grids provide elevation rings, azimuth spokes, outer ticks, labels, radius, rotation, and optional intersection snapping.',
    ],
    note: 'A normal project stores a custom grid’s file reference rather than its image contents. Portable export embeds the custom background for transfer to another computer.',
    steps: [
      {
        title: 'Set the workspace background color',
        detail: 'Open Grid and use the color picker, hex output, or presets under Workspace color.',
        bullets: ['Reset color restores the default charcoal.', 'The color remains visible in Present mode.', 'Grid lines and imported guide images remain editing-only.'],
        action: { label: 'Open Grid controls', target: 'grid' },
      },
      {
        title: 'Reshape the Cartesian grid',
        detail: 'Choose Cartesian grid and adjust Cell size, Rotation, Skew X, and Skew Y.',
        bullets: ['Cell size is measured in workspace units.', 'Rotation and skew reshape the guide, not the players.', 'Reset geometry restores all built-in grid defaults.'],
        action: { label: 'Open Grid controls', target: 'grid' },
      },
      {
        title: 'Configure the circular grid',
        detail: 'Choose Circular grid and set rings, spokes, radius, and rotation. Enable Snap to circular grid when intersection snapping is useful.',
        bullets: ['Radius is relative to the output’s shorter side.', 'In Planetarium mode the circular grid follows the configured dome center and field of view.', 'Snapping affects eligible quick corners and advanced nodes, not ordinary whole-player dragging.'],
        action: { label: 'Open Grid controls', target: 'grid' },
      },
      {
        title: 'Import a custom grid image',
        detail: 'Choose Import image and select a PNG, JPEG, WebP, or GIF. The image is fitted inside the output without cropping or distortion.',
        bullets: ['For precise alignment, create the guide at the output’s exact pixel dimensions.', 'Circular-grid snapping pauses while a custom image is visible.', 'Use Replace image to change it or Use default grid to remove it.'],
        action: { label: 'Open Grid controls', target: 'grid' },
      },
      {
        title: 'Restore the guide on another computer',
        detail: 'If a saved reference is unavailable, open Grid and import the image again. Use a portable project when the image must be embedded.',
        bullets: ['The dialog reports an unavailable saved image.', 'Re-importing restores the visual guide without rebuilding players.', 'Keep the original guide asset with the project for reliable long-term archiving.'],
        action: { label: 'Open Grid controls', target: 'grid' },
      },
    ],
  },
  {
    id: 'appearance',
    category: 'Shape media',
    title: 'Media transforms & color',
    summary: 'Rotate or scale content independently of its player and tune each player’s rendered appearance.',
    overview: [
      'Player Transform changes the entire surface: position, scale, rotation, and opacity. Media Appearance changes only the content’s rotation and scale inside the existing mesh.',
      'Color & Light adjusts brightness, contrast, saturation, gamma, hue, and temperature in the renderer. These are per-player visual settings and remain active in Present mode.',
    ],
    note: 'Visual adjustments do not modify the original media file. Start with small corrections and check the result on the projector, because its own color and brightness processing also affects the final image.',
    steps: [
      {
        title: 'Choose the correct transform',
        detail: 'Use Transform to move or rotate the whole player. Use Media rotation and Media scale when the player shape must remain unchanged.',
        bullets: ['Media transform preserves mesh nodes, position, and player rotation/scale.', 'Reset media transform returns media rotation to 0° and scale to 1×.', 'Reset shape and transform is a broader reset and should be used deliberately.'],
        action: { label: 'Show Media Appearance', target: 'media-appearance' },
      },
      {
        title: 'Reorient the content',
        detail: 'Enter Media rotation in degrees and Media scale as a multiplier until the content is correctly framed inside the player.',
        bullets: ['Media scale accepts 0.1–10× in the Inspector.', 'Rotation does not recreate the player or alter its source.', 'Inspect edges after scaling to check for unintended cropping by the mesh.'],
        action: { label: 'Show Media Appearance', target: 'media-appearance' },
      },
      {
        title: 'Tune brightness, contrast, and gamma',
        detail: 'Adjust these controls gradually while viewing representative dark and bright content.',
        bullets: ['Brightness and contrast default to 100%; gamma defaults to 1.00.', 'Gamma changes tonal response rather than simply adding uniform brightness.', 'Avoid crushing shadow detail or clipping bright areas needed for alignment.'],
        action: { label: 'Show Color & Light', target: 'color-light' },
      },
      {
        title: 'Tune saturation, hue, and temperature',
        detail: 'Use saturation for color intensity, hue for rotation around the color range, and temperature for warmer or cooler rendering.',
        bullets: ['Each player has independent values unless you batch-edit a selection.', 'Reset visual settings restores all six color/light controls together.', 'These changes affect the rendered player, not its mesh or source file.'],
        action: { label: 'Show Color & Light', target: 'color-light' },
      },
      {
        title: 'Check opacity and batch changes',
        detail: 'Set player Opacity under Transform for compositing, and use multi-selection only when the same appearance change is intended for several players.',
        bullets: ['Opacity is separate from the editor’s Output background opacity.', 'Batch fields use the active player’s displayed values as their starting reference.', 'Verify each player after batch editing before entering Present mode.'],
        action: { label: 'Show Color & Light', target: 'color-light' },
      },
    ],
  },
  {
    id: 'present',
    category: 'Present & dome',
    title: 'Present output, floating controls & live media',
    summary: 'Keep the native editor open while a separate output shows synchronized media, transparency, ambient light, and a calibrated layout.',
    overview: [
      'In the desktop app, Present opens a separate frameless output window. The ordinary editor remains open with its native Windows title bar, Sources, Inspector, transport, and editing tools; the output contains only final media and optional ambient effects.',
      'Workspace and playback changes flow from the editor to the output. The floating Present controls also stay in the editor, so the projection is never covered by panels. Browser previews retain the single-window Present fallback.',
    ],
    note: 'The output is read-only: edit players and media in the native editor. Editor media audio is muted while the separate output is open to prevent echo; the output follows each player’s actual mute and volume settings. Lock, transparency, and ambient preferences are autosaved. Closing the output or pressing Escape leaves the editor open.',
    steps: [
      {
        title: 'Prepare and protect the composition',
        detail: 'Check source connections, playback, output size, and visual settings. Lock any individual player that must not move during editing.',
        bullets: ['Hidden players are not rendered in either window.', 'An individually locked player is protected from editor geometry changes.', 'Save a named workspace before live operation.'],
        action: { label: 'Show players', target: 'players' },
      },
      {
        title: 'Open the separate output and floating controls',
        detail: 'Choose Present in the editor’s top bar. A frameless output opens in fullscreen while the editor stays available. Press H or select Present controls in the editor to open the floating panel at the upper left.',
        bullets: ['Drag the PRESENT / LIVE heading to move the floating panel; the reset-arrow button returns it to the upper left.', 'Drag the lower-right diagonal handle to adjust width and height. With the handle focused, use the arrow keys to resize in 16 px steps or Shift + arrow for 32 px steps. Double-click the handle or press Home to restore the default width and automatic height.', 'Use the pin button to keep controls open. Unpinned controls hide after 4.2 seconds without activity, but stay open while hovered, focused, dragged, resized, or while a media dialog is open.', 'On Windows, drag anywhere on the unlocked output to move its window. Dragging from fullscreen restores a movable normal window first and never changes player geometry. Edge and corner handles resize the output; Layout + window disables both movement and resizing. Closing the output never closes the native editor.'],
        action: { label: 'Open Present mode', target: 'present' },
      },
      {
        title: 'Switch players and manage media during Present',
        detail: 'Use the ordinary Sources and Players rails, or open the floating panel’s Players and Media views. Selection, source assignment, adding, linking, capture, recordings, and reconnection all remain in the native editor.',
        bullets: ['Changes appear in the output immediately without reopening Present.', 'Disconnected files use Reconnect or replace media. On desktop, saved paths are authorized directly; the browser asks for the file again. Relink missing media matches several files by filename.', 'Live desktop/device captures are connected independently in the output because a capture stream cannot be transferred between windows.', 'Escape closes an open media dialog first; otherwise it closes only the output.'],
        action: { label: 'Open Present mode', target: 'present' },
      },
      {
        title: 'Edit geometry and appearance with live output',
        detail: 'Move or reshape players in the editor and adjust media rotation, scale, opacity, color, and dome settings. The output follows the workspace without exposing selection handles or accepting its own player edits.',
        bullets: ['The editor remains the authoritative workspace, preventing the two windows from overwriting each other.', 'Playback position, play/pause, and rate are mirrored continuously; small timing differences are allowed and larger drift is corrected.', 'Presentation always uses the final projector-output path when Planetarium mode is active.'],
        action: { label: 'Open Present mode', target: 'present' },
      },
      {
        title: 'Lock the layout and output window',
        detail: 'Arrange the players and output window, then choose Layout + window in the editor. Freeform captures this geometry and normal output placement, restores them on subsequent Present sessions, and prevents output movement and resizing.',
        bullets: ['The snapshot includes player position, rotation, scale, mesh, dome switches, grid-facing mode and reference, and output size; it preserves current media assignments, playback, appearance, and individual player locks.', 'Only the frameless output is locked. The native editor retains its ordinary Windows minimize, maximize, resize, and close behavior.', 'Unlock to make a new arrangement, then lock again to replace the snapshot. A disconnected monitor falls back to a connected display with clamped bounds.'],
        action: { label: 'Open Present mode', target: 'present' },
      },
      {
        title: 'Reveal the actual desktop behind the output',
        detail: 'In the desktop app, enable Transparent background in the editor’s Present controls. The output’s scene, output backdrop, and native window background become transparent; the editor remains opaque and unchanged.',
        bullets: ['Only media and enabled ambient effects remain above windows behind the output.', 'This is real desktop transparency, not a picture of the desktop or a reduced-opacity player.', 'The browser preview disables this control because it cannot make the operating-system browser window transparent.'],
        action: { label: 'Open Present mode', target: 'present' },
      },
      {
        title: 'Add and tune ambient lighting',
        detail: 'Enable Ambient lighting in the editor, choose Edge matched or Average color, then adjust Intensity, Spread, and Smoothing. The output renders the effect over an opaque background or the transparent desktop.',
        bullets: ['Edge matched extends the players’ edge colors; Average color uses their overall color for a more uniform glow.', 'Intensity controls brightness, Spread controls the halo radius up to 160 pixels, and Smoothing reduces flicker as source colors change.', 'Ambient processing uses a low-resolution GPU pass below the sharp players, so the source image is not blurred.'],
        action: { label: 'Open Present mode', target: 'present' },
      },
      {
        title: 'Close the output and verify the saved arrangement',
        detail: 'Press Escape in either window or choose Exit in the editor’s Present controls. Only the frameless output closes; the editor and its native title bar remain open.',
        bullets: ['Editor audio returns after the output closes. The output is newly created on the next Present.', 'A locked layout and output placement are restored on the next entry; a disconnected monitor uses a clamped fallback.', 'Reload the project to verify autosave, and keep a file or portable backup of the calibrated arrangement.'],
        action: { label: 'Open saved workspaces', target: 'saves' },
      },
    ],
  },
  {
    id: 'planetarium',
    category: 'Present & dome',
    title: 'Planetarium setup',
    summary: 'Warp ordinary rectangular media for a single fisheye projector and a circular dome output.',
    overview: [
      'Planetarium mode maps ordinary media through a selectable fisheye projection model. The circular grid defines radius and azimuth orientation; per-player Dome warp determines which sources receive the warp.',
      'The Setup, Calibration, Installation, and Preview tabs separate optical settings, measured fitting, saved venue notes, and output inspection. Audience geometry is a geometric visualization, not a measured perceptual or brightness simulation.',
    ],
    note: 'This workflow is designed for one fisheye projector. It does not automatically infer your lens, measure the room, or blend multiple projectors. Record real installation details and verify the projected result physically.',
    steps: [
      {
        title: 'Prepare the rectangular content and output',
        detail: 'Set Output to the projector’s native resolution and assign ordinary rectangular media to the intended players.',
        bullets: ['Use a single fisheye projector configuration.', 'Start with the built-in calibration test card for geometric checks.', 'Keep Dome warp disabled until the initial lens and grid settings are chosen.'],
        action: { label: 'Open Output controls', target: 'output' },
      },
      {
        title: 'Enable Planetarium mode',
        detail: 'Open Planetarium, enable the mode on Setup, and choose a preset only if it matches your starting installation.',
        bullets: ['Hemisphere 180° is a centered equidistant starting point.', 'Full-frame fisheye fits the 180° circle to the output’s short edge.', 'Presets change model/grid settings; review every value after applying one.'],
        action: { label: 'Open Planetarium setup', target: 'planetarium-setup' },
      },
      {
        title: 'Choose the lens projection model',
        detail: 'Select Equidistant, Equisolid angle, or Stereographic according to the lens documentation or measured reference image.',
        bullets: ['Equidistant radius is proportional to angle and is the usual fulldome starting point.', 'Equisolid angle uses 2 sin(θ/2) and is common in circular fisheye lenses.', 'An incorrect model cannot always be corrected by center and tilt adjustments.'],
        action: { label: 'Open Planetarium setup', target: 'planetarium-setup' },
      },
      {
        title: 'Set field of view, tilt, center, and truncation',
        detail: 'Tune the dome field of view, optical center offsets, dome tilt, truncation, circular-grid radius, and azimuth rotation against a known pattern.',
        bullets: ['Center offsets are percentages of output dimensions.', 'At 180° FOV, 75% truncation maps a 135° cap to the fisheye rim.', 'The four-point solver later adjusts only center X/Y, tilt, and azimuth—not lens model, FOV, radius, or truncation.'],
        action: { label: 'Open Planetarium setup', target: 'planetarium-setup' },
      },
      {
        title: 'Enable Dome warp per player',
        detail: 'Close Planetarium, select each intended player, and enable Dome warp under Transform in the Inspector.',
        bullets: ['Media already prewarped bypasses a second dome warp while retaining the ordinary mesh.', 'Do not enable both an external prewarp and a second Freeform warp unintentionally.', 'The Setup panel reports how many players are actively dome-warped.'],
        action: { label: 'Open Planetarium setup', target: 'planetarium-setup' },
      },
      {
        title: 'Face players toward a grid reference',
        detail: 'In the Inspector’s Transform section, choose a grid-relative orientation and a reference point. Automatic facing keeps the media upright relative to the selected direction as you move the player.',
        bullets: ['Aim the player’s top or right side toward or away from the grid center or a named point.', 'Create and name reference points in Planetarium → Calibration; their known azimuth and elevation determine facing, not observed pixels.', 'Rotation becomes a fine offset in automatic mode. Select Manual to use Rotation alone.', 'Orientation is available only while Planetarium is enabled and this player has Dome warp enabled without a prewarp bypass.'],
        action: { label: 'Open Planetarium setup', target: 'planetarium-setup' },
      },
      {
        title: 'Record installation measurements',
        detail: 'On Installation, enter dome diameter, spring line, projector height, lens throw ratio, and venue/projector/lens notes.',
        bullets: ['These fields are saved for reproducibility.', 'Installation notes do not change the optical model.', 'They are not a substitute for measured calibration points or a lens profile.'],
        action: { label: 'Open Installation settings', target: 'planetarium-installation' },
      },
      {
        title: 'Use preview modes and test patterns',
        detail: 'On Preview, compare Projector output, Unwarped source, and Audience geometry. Select a pattern for players assigned to the built-in calibration card.',
        bullets: ['Patterns include orientation, crosshatch, starfield, convergence targets, and latitude/longitude.', 'Split before/after is available in Projector output preview.', 'Presentation always uses the final projector output.'],
        action: { label: 'Open Planetarium preview', target: 'planetarium-preview' },
      },
    ],
  },
  {
    id: 'calibration',
    category: 'Present & dome',
    title: 'Dome calibration walkthrough',
    summary: 'Fit projection center, dome tilt, and azimuth from measured sky-reference directions and observed output pixels.',
    overview: [
      'Calibration compares known sky directions—azimuth and elevation—with observed positions in the output’s centered pixel coordinate system. Hollow green points are current predictions, yellow points are observations, and connecting lines show residuals.',
      'Solve center, tilt & azimuth fits exactly four parameters: Projection center X, Projection center Y, Dome tilt, and Grid azimuth rotation. At least four distinct reference directions are required; more well-spaced measurements provide a better check of the model.',
    ],
    note: 'Freeform does not automatically detect projected markers or infer sky coordinates. Measurements come from your installation. Calibration can reduce geometric residuals, but it cannot correct an unsuitable lens model, poor focus, unsupported multi-projector blending, or incorrect source orientation by itself.',
    steps: [
      {
        title: 'Stabilize the installation before measuring',
        detail: 'Mount the single fisheye projector securely, set its native output resolution, disable competing keystone/warp processing where appropriate, and focus the image on the dome.',
        bullets: ['Do not move the projector, lens shift, zoom, or output resolution between measurement and presentation.', 'Record the physical setup on the Installation tab.', 'Keep a known-good workspace before replacing an existing calibration.'],
        action: { label: 'Open Installation settings', target: 'planetarium-installation' },
      },
      {
        title: 'Choose and verify the base optical model',
        detail: 'Select the lens model, FOV, truncation, circular-grid radius, and approximate center/tilt/azimuth before collecting final observations.',
        bullets: ['The solver does not choose the lens model or FOV for you.', 'Use Projector output with crosshatch, convergence, or latitude/longitude to establish a readable reference.', 'Check orientation first so azimuth and elevation use a consistent venue convention.'],
        action: { label: 'Open Planetarium setup', target: 'planetarium-setup' },
      },
      {
        title: 'Measure known sky references',
        detail: 'For each reference, record its azimuth and elevation in degrees and the corresponding observed output position in pixels relative to the output center.',
        bullets: ['X increases to the right; Y increases upward in the calibration data.', 'Observed X/Y fields accept output-centered pixel coordinates.', 'Use references spread across different azimuths and elevations rather than a tight cluster.', 'The app does not derive these measurements from a camera automatically.'],
        action: { label: 'Open Calibration', target: 'planetarium-calibration' },
      },
      {
        title: 'Add at least four distinct references',
        detail: 'On Calibration, enter Reference azimuth and Reference elevation, then Add reference for each direction.',
        bullets: ['Four distinct directions are the mathematical minimum for the four-parameter fit.', 'Six or more well-distributed references are a practical way to expose inconsistent measurements.', 'Rename points so each row can be matched to your measurement notes.'],
        action: { label: 'Open Calibration', target: 'planetarium-calibration' },
      },
      {
        title: 'Set every observed output position',
        detail: 'Drag each yellow observed point to its measured output pixel, or enter exact observed X/Y values in its row.',
        bullets: ['Hollow green points show where the current model predicts that sky direction.', 'Residual lines connect prediction and observation.', 'Dragging observed points is undoable; changing a reference clears the previous fit result.'],
        action: { label: 'Open Calibration', target: 'planetarium-calibration' },
      },
      {
        title: 'Solve and inspect the residuals',
        detail: 'Choose Solve center, tilt & azimuth. Review RMS, maximum residual, iteration count, and the resulting center, tilt, and azimuth values.',
        bullets: ['RMS and maximum residual are reported in output pixels.', 'A low average does not make a large individual residual acceptable.', 'If no stable improvement is found, check coordinate conventions, distinct directions, spread, and the base optical settings.'],
        action: { label: 'Open Calibration', target: 'planetarium-calibration' },
      },
      {
        title: 'Verify the real projector output',
        detail: 'Return to Preview, select Projector output, and inspect the chosen test pattern with every intended player’s Dome warp setting enabled.',
        bullets: ['Use split before/after to confirm the warp direction.', 'Check center, horizon/spring line, orientation, rim coverage, focus, and straight reference lines on the physical dome.', 'Audience geometry is only a geometric visualization; final approval must use the actual projected output.'],
        action: { label: 'Open Planetarium preview', target: 'planetarium-preview' },
      },
      {
        title: 'Make final placement adjustments and save',
        detail: 'Use Present mode for small whole-player position adjustments, then exit and save a named workspace and a portable/file backup.',
        bullets: ['Locked players cannot be dragged while presenting.', 'Recalibrate if the projector, lens, output, or venue geometry changes.', 'Retain the measured reference points and installation notes with the project for repeatability.'],
        action: { label: 'Open Present mode', target: 'present' },
      },
    ],
  },
  {
    id: 'saves',
    category: 'Project safety',
    title: 'Saves, files & recovery',
    summary: 'Use autosave, ten named internal slots, portable exports, file backups, and diagnostic recovery together.',
    overview: [
      'Freeform maintains local recovery generations as project settings change and supports up to ten named internal workspace saves. Save file and Open move a workspace through a .freeform.json project file.',
      'Portable export embeds connected local media and a custom grid for transfer. Ordinary workspace files are smaller reference-based projects and may require relinking on another computer.',
    ],
    note: 'Internal saves and recovery data are local to this app/browser profile. They are not a substitute for an exported backup stored in a separate, safe location.',
    steps: [
      {
        title: 'Create named internal checkpoints',
        detail: 'Open Saves, enter a useful name, and Save current. The dialog shows how many of the ten slots are used.',
        bullets: ['Use names that identify venue, output, and calibration stage.', 'Overwrite a slot only when its previous version is no longer needed.', 'Delete obsolete slots deliberately and keep an exported master.'],
        action: { label: 'Open saved workspaces', target: 'saves' },
      },
      {
        title: 'Restore an internal workspace',
        detail: 'Choose Load on a saved slot to restore its players, sources, groups, grids, output, appearance, and dome settings.',
        bullets: ['Current unsaved layout is replaced by the loaded workspace.', 'Local files may still need authorization or reconnection.', 'Live inputs stay stopped until explicitly reconnected.'],
        action: { label: 'Open saved workspaces', target: 'saves' },
      },
      {
        title: 'Save and open a workspace file',
        detail: 'Use Save file or Ctrl+S to export, and Open or Ctrl+O to restore a .freeform.json file.',
        bullets: ['The project name is used as the suggested filename.', 'Reference-based files do not embed local media bytes or a custom grid image.', 'After opening, review every reconnection notice before presenting.'],
        action: { label: 'Open saved workspaces', target: 'saves' },
      },
      {
        title: 'Export a portable project',
        detail: 'Choose Portable to embed connected local media and the custom grid into a transferable project file.',
        bullets: ['Preparation can take longer and produce a much larger file.', 'Use it for email/download transfer or moving to a computer without the original asset paths.', 'Verify all sources after opening the portable file on the destination computer.'],
        action: { label: 'Open saved workspaces', target: 'saves' },
      },
      {
        title: 'Use recovery and diagnostics',
        detail: 'Open the shield/recovery control to inspect recovery generations and diagnostic records or restore an available snapshot.',
        bullets: ['At startup, a corrupt newest autosave can be rejected in favor of an older valid generation.', 'Recovery messages explain when a snapshot or referenced asset could not be restored.', 'Export important work rather than relying solely on automatic recovery.'],
        action: { label: 'Open recovery tools', target: 'recovery' },
      },
      {
        title: 'Review edit history',
        detail: 'Use Undo/Redo for recent changes or open History to inspect the recorded edit sequence.',
        bullets: ['Present-mode player movement is included in history.', 'Calibration-point dragging and other project edits are tracked.', 'History complements named saves; it does not replace a durable project backup.'],
        action: { label: 'Open edit history', target: 'history' },
      },
    ],
  },
  {
    id: 'shortcuts',
    category: 'Project safety',
    title: 'Shortcuts & interface control',
    summary: 'Work faster with keyboard commands, independent panel controls, focus mode, and accessible guide navigation.',
    overview: [
      'The interface supports independent source/player and Inspector minimization, a hide-all focus mode, presentation fullscreen, and keyboard editing commands.',
      'This guide is keyboard accessible: Tab and Shift+Tab move through controls, Enter or Space activates a focused control, and Escape closes the guide. Step buttons provide a consistent alternative to reading long static documentation.',
    ],
    note: 'Shortcuts that use Ctrl also support Cmd on platforms where that is the standard modifier. Text-entry fields are protected from ordinary editing shortcuts so you can type values safely.',
    steps: [
      {
        title: 'Navigate and edit geometry',
        detail: 'Use V for Select, M to show/hide mesh overlays, Alt-drag or middle-drag to pan, and the wheel to zoom in the editor.',
        bullets: ['F zooms to the current selection when available.', 'Delete or Backspace removes selected players.', 'Double-click an advanced node to delete it when editing outside Present mode.'],
        action: { label: 'Show advanced mesh tools', target: 'advanced-mesh' },
      },
      {
        title: 'Copy, paste, undo, and redo',
        detail: 'Use Ctrl+C and Ctrl+V for players, Ctrl+Z to undo, and Ctrl+Y or Ctrl+Shift+Z to redo.',
        bullets: ['Copy/paste operates on selected players, not source-library rows.', 'Pasted players become the current selection.', 'The top-bar buttons and History dialog provide visible equivalents for undo/redo.'],
        action: { label: 'Open edit history', target: 'history' },
      },
      {
        title: 'Save and open projects',
        detail: 'Use Ctrl+S to save a workspace file and Ctrl+O to open one.',
        bullets: ['Named internal saves are available from the Saves button.', 'Portable is a separate export for embedded assets.', 'Reconnection prompts still need to be reviewed after opening.'],
        action: { label: 'Open saved workspaces', target: 'saves' },
      },
      {
        title: 'Minimize panels or hide all controls',
        detail: 'Use each side panel’s minimize button, or the top-bar Hide all control panels button. Shift+F toggles focus mode.',
        bullets: ['Side panels restore independently through their edge buttons.', 'Show control panels or Escape restores hidden controls.', 'Independent minimized states are preserved when leaving hide-all mode.', 'The native Windows title bar provides minimize, maximize/restore, and close in the editor’s upper-right corner, including focus mode.'],
        action: { label: 'Show source controls', target: 'sources' },
      },
      {
        title: 'Present and exit safely',
        detail: 'Choose Present to open the separate fullscreen output while keeping the editor open. Press Escape in either window to close only the output.',
        bullets: ['Use Present controls → Exit in the editor as an alternative to Escape.', 'Layout + window, Transparent background, and Ambient lighting affect the output; individual player locks remain independent.', 'The output is read-only. Use the editor for geometry, sources, transport, and appearance changes.'],
        action: { label: 'Open Present mode', target: 'present' },
      },
      {
        title: 'Use the feature guide with a keyboard',
        detail: 'Open Guide, Tab to the feature directory, choose a topic, then use Previous step and Next step to follow its walkthrough.',
        bullets: ['The search field filters topics by feature, concept, or instruction text.', 'Open controls buttons close the guide and reveal the real destination.', 'Escape, the close button, and the backdrop all close the guide.'],
        action: { label: 'Open Planetarium calibration', target: 'planetarium-calibration' },
      },
    ],
  },
];
