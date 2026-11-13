import { Focus, Maximize2, Minus, Plus } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type WheelEvent as ReactWheelEvent } from 'react';
import * as THREE from 'three';
import { WORKSPACE_HEIGHT, WORKSPACE_WIDTH } from '../data/defaults';
import {
  borderPoints,
  buildPlayerMesh,
  localToWorld,
  nearestBorderSegment,
  pointInPolygon,
  worldToLocal,
} from '../lib/geometry';
import {
  domeCenter,
  domeLocalToWorld,
  domePlayerRotation,
  domeRadius,
  domeWorldToLocal,
  domeWorldToPosition,
  isDomeWarpActive,
} from '../lib/dome';
import { BUILT_IN_GRID_CELL_SIZE, snapToCircularGrid } from '../lib/grid';
import { createDomePreview } from '../lib/domePreview';
import { DEFAULT_BACKGROUND_COLOR, isDefaultPlayerVisual } from '../lib/appearance';
import { getRenderQualityPreset, resolveRenderPixelRatio, sampleRenderPerformance } from '../lib/quality';
import { createAmbientPipeline } from '../lib/ambientPipeline';
import { boundsFromPoints, playerBounds, pointInRect, smartSnap, type SmartGuide } from '../lib/workflow';
import { isPresentationWindow } from '../lib/windowRole';
import { useWorkspace } from '../store/useWorkspace';
import type { Player, Vec2 } from '../types';
import { useMedia, type TextureSource } from './MediaContext';

interface ViewState {
  width: number;
  height: number;
  fit: number;
  zoom: number;
  pan: Vec2;
}

type TraceMode = 'trace-border' | 'trace-interior';

interface TracePreview {
  mode: TraceMode;
  points: Vec2[];
}

interface MarqueeState {
  kind: 'players' | 'nodes';
  playerId?: string;
  start: Vec2;
  end: Vec2;
  additive: boolean;
}

type DragState =
  | { type: 'move'; playerId: string; playerIds: string[]; initialPlayers: Player[]; start: Vec2; last: Vec2; lastDelta: Vec2 }
  | { type: 'corner'; playerId: string; index: number }
  | { type: 'node'; playerId: string; nodeIds: string[]; lastLocal: Vec2 }
  | { type: 'pan'; last: Vec2 }
  | { type: 'marquee'; marquee: MarqueeState }
  | { type: 'trace'; mode: TraceMode; playerId?: string; points: Vec2[]; lastScreen: Vec2 };

interface PlayerEntry {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  flatMesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  wire: THREE.LineSegments;
  border: THREE.Line;
  texture: THREE.Texture | null;
  textureElement: TextureSource | null;
  quickCorners: Player['quickCorners'] | null;
  nodes: Player['nodes'] | null;
  borderIds: Player['border'] | null;
  mode: Player['mode'] | null;
  domeSignature: string | null;
  visualUniforms: ReturnType<typeof createPlayerVisualUniforms>;
}

function createPlayerVisualUniforms() {
  return {
    uVisualEnabled: { value: 0 },
    uVisualBrightness: { value: 1 },
    uVisualContrast: { value: 1 },
    uVisualSaturation: { value: 1 },
    uVisualGamma: { value: 1 },
    uVisualHue: { value: 0 },
    uVisualTemperature: { value: 0 },
  };
}

const initialView: ViewState = {
  width: 1,
  height: 1,
  fit: 1,
  zoom: 1,
  pan: { x: 0, y: 0 },
};

function scaleFor(view: ViewState): number {
  return Math.max(0.0001, view.fit * view.zoom);
}

function screenToWorld(view: ViewState, point: Vec2): Vec2 {
  const scale = scaleFor(view);
  return {
    x: view.pan.x + (point.x - view.width / 2) / scale,
    y: view.pan.y - (point.y - view.height / 2) / scale,
  };
}

function worldToScreen(view: ViewState, point: Vec2): Vec2 {
  const scale = scaleFor(view);
  return {
    x: (point.x - view.pan.x) * scale + view.width / 2,
    y: view.height / 2 - (point.y - view.pan.y) * scale,
  };
}

function shapePolygon(player: Player): Vec2[] {
  return player.mode === 'advanced' && player.nodes.length >= 3
    ? borderPoints(player.nodes, player.border)
    : player.quickCorners;
}

function borderGeometry(player: Player, transform?: (point: Vec2) => Vec2): THREE.BufferGeometry {
  const polygon = shapePolygon(player);
  const points: THREE.Vector3[] = [];
  polygon.forEach((point, index) => {
    const next = polygon[(index + 1) % polygon.length];
    const steps = transform
      ? Math.min(64, Math.max(4, Math.ceil(Math.hypot(next.x - point.x, next.y - point.y) / 16)))
      : 1;
    for (let step = 0; step < steps; step += 1) {
      const t = step / steps;
      const sample = {
        x: point.x + (next.x - point.x) * t,
        y: point.y + (next.y - point.y) * t,
      };
      const projected = transform?.(sample) ?? sample;
      points.push(new THREE.Vector3(projected.x, projected.y, 1));
    }
  });
  if (points.length) points.push(points[0].clone());
  return new THREE.BufferGeometry().setFromPoints(points);
}

interface RefineVertex extends Vec2 {
  u: number;
  v: number;
}

function refineDomeMesh(build: ReturnType<typeof buildPlayerMesh>): {
  positions: number[];
  uvs: number[];
  indices: number[];
} {
  const triangleCount = build.indices.length / 3;
  const levels = triangleCount <= 256 ? 3 : triangleCount <= 1024 ? 2 : 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const midpoint = (a: RefineVertex, b: RefineVertex): RefineVertex => ({
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    u: (a.u + b.u) / 2,
    v: (a.v + b.v) / 2,
  });
  const emit = (a: RefineVertex, b: RefineVertex, c: RefineVertex, level: number) => {
    if (level > 0) {
      const ab = midpoint(a, b);
      const bc = midpoint(b, c);
      const ca = midpoint(c, a);
      emit(a, ab, ca, level - 1);
      emit(ab, b, bc, level - 1);
      emit(ca, bc, c, level - 1);
      emit(ab, bc, ca, level - 1);
      return;
    }
    [a, b, c].forEach((vertex) => {
      positions.push(vertex.x, vertex.y, 0);
      uvs.push(vertex.u, vertex.v);
    });
  };
  for (let index = 0; index < build.indices.length; index += 3) {
    const triangle = build.indices.slice(index, index + 3).map((vertexIndex): RefineVertex => ({
      x: build.positions[vertexIndex * 3],
      y: build.positions[vertexIndex * 3 + 1],
      u: build.uvs[vertexIndex * 2],
      v: build.uvs[vertexIndex * 2 + 1],
    }));
    emit(triangle[0], triangle[1], triangle[2], levels);
  }
  return { positions, uvs, indices: [] };
}

function configureTextureQuality(
  texture: THREE.Texture,
  renderer: THREE.WebGLRenderer,
  preset: ReturnType<typeof getRenderQualityPreset>,
) {
  texture.minFilter = preset.mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = preset.mipmaps;
  texture.anisotropy = Math.min(preset.anisotropy, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
}

function makeTexture(
  element: TextureSource,
  renderer: THREE.WebGLRenderer,
  preset: ReturnType<typeof getRenderQualityPreset>,
): THREE.Texture {
  const texture = element instanceof HTMLVideoElement
    ? new THREE.VideoTexture(element)
    : element instanceof HTMLCanvasElement
      ? new THREE.CanvasTexture(element)
      : new THREE.Texture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  configureTextureQuality(texture, renderer, preset);
  return texture;
}

export function WarpWorkspace() {
  const hostRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const playersRef = useRef<Player[]>([]);
  const selectedRef = useRef<string[]>([]);
  const activeRef = useRef<string | null>(null);
  const showMeshRef = useRef(true);
  const presentationRef = useRef(false);
  const backgroundRef = useRef(useWorkspace.getState().background);
  const backgroundColorRef = useRef(useWorkspace.getState().backgroundColor);
  const gridGeometryRef = useRef(useWorkspace.getState().gridGeometry);
  const outputSizeRef = useRef(useWorkspace.getState().outputSize);
  const outputOpacityRef = useRef(useWorkspace.getState().outputOpacity);
  const renderQualityRef = useRef(useWorkspace.getState().renderQuality);
  const planetariumRef = useRef(useWorkspace.getState().planetariumSettings);
  const presentSettingsRef = useRef(useWorkspace.getState().presentSettings);
  const viewRef = useRef<ViewState>(initialView);
  const [view, setView] = useState<ViewState>(initialView);
  const [tracePreview, setTracePreview] = useState<TracePreview | null>(null);
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [guides, setGuides] = useState<SmartGuide[]>([]);
  const [customBackgroundReady, setCustomBackgroundReady] = useState(false);
  const players = useWorkspace((state) => state.players);
  const selectedIds = useWorkspace((state) => state.selectedIds);
  const selectedNodes = useWorkspace((state) => state.selectedNodes);
  const activeId = useWorkspace((state) => state.activeId);
  const tool = useWorkspace((state) => state.tool);
  const showMesh = useWorkspace((state) => state.showMesh);
  const presentation = useWorkspace((state) => state.presentation) || isPresentationWindow;
  const background = useWorkspace((state) => state.background);
  const backgroundColor = useWorkspace((state) => state.backgroundColor);
  const gridGeometry = useWorkspace((state) => state.gridGeometry);
  const gridSnapping = useWorkspace((state) => state.gridSnapping);
  const outputSize = useWorkspace((state) => state.outputSize);
  const outputOpacity = useWorkspace((state) => state.outputOpacity);
  const renderQuality = useWorkspace((state) => state.renderQuality);
  const planetariumSettings = useWorkspace((state) => state.planetariumSettings);
  const presentSettings = useWorkspace((state) => state.presentSettings);
  const selectPlayer = useWorkspace((state) => state.selectPlayer);
  const selectPlayers = useWorkspace((state) => state.selectPlayers);
  const selectNodes = useWorkspace((state) => state.selectNodes);
  const clearSelection = useWorkspace((state) => state.clearSelection);
  const movePlayer = useWorkspace((state) => state.movePlayer);
  const movePlayers = useWorkspace((state) => state.movePlayers);
  const updateQuickCorner = useWorkspace((state) => state.updateQuickCorner);
  const moveNodes = useWorkspace((state) => state.moveNodes);
  const addNode = useWorkspace((state) => state.addNode);
  const deleteNode = useWorkspace((state) => state.deleteNode);
  const addPlayer = useWorkspace((state) => state.addPlayer);
  const tracePlayer = useWorkspace((state) => state.tracePlayer);
  const traceInterior = useWorkspace((state) => state.traceInterior);
  const setTool = useWorkspace((state) => state.setTool);
  const pushToast = useWorkspace((state) => state.pushToast);
  const { textureSources } = useMedia();

  playersRef.current = players;
  selectedRef.current = selectedIds;
  activeRef.current = activeId;
  showMeshRef.current = showMesh;
  presentationRef.current = presentation;
  backgroundRef.current = background;
  backgroundColorRef.current = backgroundColor;
  gridGeometryRef.current = gridGeometry;
  outputSizeRef.current = outputSize;
  outputOpacityRef.current = outputOpacity;
  renderQualityRef.current = renderQuality;
  planetariumRef.current = planetariumSettings;
  presentSettingsRef.current = presentSettings;
  viewRef.current = view;

  useEffect(() => {
    const drag = dragRef.current;
    if (drag?.type === 'trace' && (drag.mode !== tool || presentation)) {
      dragRef.current = null;
      setTracePreview(null);
    }
    if (presentation && presentSettings.layoutLocked && dragRef.current) {
      dragRef.current = null;
      setGuides([]);
      useWorkspace.getState().endHistory();
    }
  }, [tool, presentation, presentSettings.layoutLocked]);

  useEffect(() => {
    const host = hostRef.current;
    const container = containerRef.current;
    if (!host || !container) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor('#141615', 1);
    renderer.domElement.className = 'warp-canvas';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#141615');
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.z = 500;
    const outputCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    outputCamera.position.z = 500;
    const domePreview = createDomePreview(renderer);
    const ambientPipeline = createAmbientPipeline(renderer);

    const grid = new THREE.GridHelper(12000, 240, '#343936', '#272b28');
    grid.rotation.x = Math.PI / 2;
    grid.renderOrder = -4;
    const gridTransform = new THREE.Group();
    gridTransform.matrixAutoUpdate = false;
    gridTransform.add(grid);
    scene.add(gridTransform);
    const polarGrid = new THREE.LineSegments(
      new THREE.BufferGeometry(),
      new THREE.LineBasicMaterial({ color: '#78837b', transparent: true, opacity: 0.58, depthTest: false, depthWrite: false }),
    );
    polarGrid.position.z = -75;
    polarGrid.renderOrder = -1;
    polarGrid.visible = false;
    scene.add(polarGrid);

    const stage = new THREE.Mesh(
      new THREE.PlaneGeometry(WORKSPACE_WIDTH, WORKSPACE_HEIGHT),
      new THREE.MeshBasicMaterial({ color: '#1a1d1b', depthTest: false, depthWrite: false, transparent: true }),
    );
    stage.position.z = -90;
    stage.renderOrder = -3;
    scene.add(stage);
    const backgroundPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ color: '#ffffff', depthTest: false, depthWrite: false, transparent: true }),
    );
    backgroundPlane.position.z = -85;
    backgroundPlane.renderOrder = -2;
    backgroundPlane.visible = false;
    scene.add(backgroundPlane);
    const stageBorder = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-WORKSPACE_WIDTH / 2, -WORKSPACE_HEIGHT / 2, -80),
        new THREE.Vector3(WORKSPACE_WIDTH / 2, -WORKSPACE_HEIGHT / 2, -80),
        new THREE.Vector3(WORKSPACE_WIDTH / 2, WORKSPACE_HEIGHT / 2, -80),
        new THREE.Vector3(-WORKSPACE_WIDTH / 2, WORKSPACE_HEIGHT / 2, -80),
      ]),
      new THREE.LineBasicMaterial({ color: '#505752', depthTest: false }),
    );
    stageBorder.renderOrder = -1;
    scene.add(stageBorder);

    const placeholder = new THREE.DataTexture(new Uint8Array([28, 31, 29, 255]), 1, 1);
    placeholder.needsUpdate = true;
    const entries = new Map<string, PlayerEntry>();
    const backgroundLoader = new THREE.TextureLoader();
    let backgroundTexture: THREE.Texture | null = null;
    let backgroundRequest = 0;
    let activeBackground: typeof background | undefined;
    let activeBackgroundColor: typeof backgroundColor | undefined;
    let activeGridGeometry: typeof gridGeometry | undefined;
    let activeOutputSize: typeof outputSize | undefined;
    let activeRenderQuality: typeof renderQuality | undefined;
    let activePlanetarium: typeof planetariumSettings | undefined;
    let frame = 0;
    let statsStartedAt = 0;
    let statsFrames = 0;
    let disposed = false;

    const fitBackground = (texture: THREE.Texture, size: typeof outputSize) => {
      const image = texture.image as HTMLImageElement;
      const width = image.naturalWidth || image.width;
      const height = image.naturalHeight || image.height;
      if (!width || !height) return;
      const fit = Math.min(size.width / width, size.height / height);
      backgroundPlane.geometry.dispose();
      backgroundPlane.geometry = new THREE.PlaneGeometry(width * fit, height * fit);
    };

    const updateCircularGrid = (geometry: typeof gridGeometry) => {
      const positions: number[] = [];
      const size = outputSizeRef.current;
      const radius = domeRadius(size, geometry);
      const gridCenter = planetariumRef.current.enabled ? domeCenter(size, planetariumRef.current) : { x: 0, y: 0 };
      polarGrid.position.set(gridCenter.x, gridCenter.y, -75);
      const rotation = THREE.MathUtils.degToRad(geometry.rotation);
      const segment = (x1: number, y1: number, x2: number, y2: number) => {
        positions.push(x1, y1, 0, x2, y2, 0);
      };
      for (let ring = 1; ring <= geometry.rings; ring += 1) {
        const ringRadius = radius * ring / geometry.rings;
        for (let step = 0; step < 128; step += 1) {
          const first = step / 128 * Math.PI * 2;
          const second = (step + 1) / 128 * Math.PI * 2;
          segment(
            Math.cos(first) * ringRadius, Math.sin(first) * ringRadius,
            Math.cos(second) * ringRadius, Math.sin(second) * ringRadius,
          );
        }
      }
      for (let spoke = 0; spoke < geometry.spokes; spoke += 1) {
        const angle = rotation + spoke / geometry.spokes * Math.PI * 2;
        segment(0, 0, Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      for (let tick = 0; tick < geometry.spokes * 4; tick += 1) {
        const angle = rotation + tick / (geometry.spokes * 4) * Math.PI * 2;
        const inner = radius * (tick % 4 === 0 ? 0.972 : 0.988);
        segment(Math.cos(angle) * inner, Math.sin(angle) * inner, Math.cos(angle) * radius, Math.sin(angle) * radius);
      }
      const center = Math.max(2, radius * 0.008);
      segment(-center, 0, center, 0);
      segment(0, -center, 0, center);
      polarGrid.geometry.dispose();
      polarGrid.geometry = new THREE.BufferGeometry();
      polarGrid.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    };

    const updateOutputSize = (size: typeof outputSize) => {
      stage.geometry.dispose();
      stage.geometry = new THREE.PlaneGeometry(size.width, size.height);
      stageBorder.geometry.dispose();
      stageBorder.geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-size.width / 2, -size.height / 2, -80),
        new THREE.Vector3(size.width / 2, -size.height / 2, -80),
        new THREE.Vector3(size.width / 2, size.height / 2, -80),
        new THREE.Vector3(-size.width / 2, size.height / 2, -80),
      ]);
      if (backgroundTexture) fitBackground(backgroundTexture, size);
      updateCircularGrid(gridGeometryRef.current);
      setView((current) => ({
        ...current,
        fit: Math.min(current.width / size.width, current.height / size.height) * 0.9,
      }));
    };

    const updateBuiltInGrid = (geometry: typeof gridGeometry) => {
      const spacingScale = geometry.spacing / BUILT_IN_GRID_CELL_SIZE;
      const shear = new THREE.Matrix4().set(
        1, Math.tan(THREE.MathUtils.degToRad(geometry.skewX)), 0, 0,
        Math.tan(THREE.MathUtils.degToRad(geometry.skewY)), 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
      );
      gridTransform.matrix.makeRotationZ(THREE.MathUtils.degToRad(geometry.rotation))
        .multiply(shear)
        .scale(new THREE.Vector3(spacingScale, spacingScale, 1));
      gridTransform.matrix.setPosition(0, 0, -100);
      gridTransform.matrixWorldNeedsUpdate = true;
      updateCircularGrid(geometry);
    };

    const failBackground = (request: number) => {
      if (disposed || request !== backgroundRequest) return;
      backgroundPlane.visible = false;
      setCustomBackgroundReady(false);
      pushToast({
        title: 'Grid image could not be loaded',
        detail: 'The built-in grid is still active. Try a PNG, JPEG, WebP, or GIF image.',
        tone: 'warning',
      });
    };

    const loadBackground = (uri?: string) => {
      const request = ++backgroundRequest;
      backgroundTexture?.dispose();
      backgroundTexture = null;
      backgroundPlane.material.map = null;
      backgroundPlane.material.needsUpdate = true;
      backgroundPlane.visible = false;
      setCustomBackgroundReady(false);
      if (!uri) return;
      backgroundLoader.load(uri, (texture) => {
        if (disposed || request !== backgroundRequest) {
          texture.dispose();
          return;
        }
        const image = texture.image as HTMLImageElement;
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) {
          texture.dispose();
          failBackground(request);
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        configureTextureQuality(
          texture,
          renderer,
          getRenderQualityPreset(renderQualityRef.current),
        );
        fitBackground(texture, outputSizeRef.current);
        backgroundTexture = texture;
        backgroundPlane.material.map = texture;
        backgroundPlane.material.needsUpdate = true;
        setCustomBackgroundReady(true);
      }, undefined, () => failBackground(request));
    };

    const removeEntry = (id: string) => {
      const entry = entries.get(id);
      if (!entry) return;
      entry.mesh.geometry.dispose();
      entry.flatMesh.geometry.dispose();
      entry.wire.geometry.dispose();
      entry.border.geometry.dispose();
      entry.mesh.material.dispose();
      (entry.wire.material as THREE.Material).dispose();
      (entry.border.material as THREE.Material).dispose();
      entry.texture?.dispose();
      scene.remove(entry.group, entry.flatMesh);
      entries.delete(id);
    };

    const createEntry = (id: string): PlayerEntry => {
      const visualUniforms = createPlayerVisualUniforms();
      const material = new THREE.MeshBasicMaterial({
        map: placeholder,
        color: '#ffffff',
        side: THREE.DoubleSide,
        transparent: true,
        depthTest: false,
      });
      material.onBeforeCompile = (shader) => {
        Object.assign(shader.uniforms, visualUniforms);
        shader.fragmentShader = shader.fragmentShader
          .replace('#include <common>', `
            #include <common>
            uniform float uVisualEnabled;
            uniform float uVisualBrightness;
            uniform float uVisualContrast;
            uniform float uVisualSaturation;
            uniform float uVisualGamma;
            uniform float uVisualHue;
            uniform float uVisualTemperature;
          `)
          .replace('#include <map_fragment>', `
            #include <map_fragment>
            if (uVisualEnabled > 0.5) {
              vec3 graded = diffuseColor.rgb * uVisualBrightness;
              graded = (graded - vec3(0.5)) * uVisualContrast + vec3(0.5);
              float luminance = dot(graded, vec3(0.2126, 0.7152, 0.0722));
              graded = mix(vec3(luminance), graded, uVisualSaturation);
              graded = pow(max(graded, vec3(0.0)), vec3(1.0 / uVisualGamma));
              float hueAngle = radians(uVisualHue);
              vec3 yiq = mat3(
                0.299, 0.596, 0.211,
                0.587, -0.274, -0.523,
                0.114, -0.322, 0.312
              ) * graded;
              yiq.yz = mat2(cos(hueAngle), -sin(hueAngle), sin(hueAngle), cos(hueAngle)) * yiq.yz;
              graded = mat3(
                1.0, 1.0, 1.0,
                0.956, -0.272, -1.106,
                0.621, -0.647, 1.703
              ) * yiq;
              float warmth = uVisualTemperature * 0.0015;
              graded += vec3(warmth, -abs(warmth) * 0.15, -warmth);
              diffuseColor.rgb = max(graded, vec3(0.0));
            }
          `);
      };
      material.customProgramCacheKey = () => 'freeform-player-visual-v1';
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      const flatMesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
      flatMesh.visible = false;
      const wire = new THREE.LineSegments(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: '#c5ffc3',
          transparent: true,
          opacity: 0.32,
          depthTest: false,
        }),
      );
      const border = new THREE.Line(
        new THREE.BufferGeometry(),
        new THREE.LineBasicMaterial({
          color: '#c5ffc3',
          transparent: true,
          opacity: 0.9,
          depthTest: false,
        }),
      );
      const group = new THREE.Group();
      group.add(mesh, wire, border);
      scene.add(group, flatMesh);
      const entry: PlayerEntry = {
        group,
        mesh,
        flatMesh,
        wire,
        border,
        texture: null,
        textureElement: null,
        quickCorners: null,
        nodes: null,
        borderIds: null,
        mode: null,
        domeSignature: null,
        visualUniforms,
      };
      entries.set(id, entry);
      return entry;
    };

    const domeGeometrySignature = (player: Player): string => {
      const settings = planetariumRef.current;
      if (!isDomeWarpActive(player, settings) || (settings.preview === 'unwarped' && !presentationRef.current)) return 'flat';
      const size = outputSizeRef.current;
      const grid = gridGeometryRef.current;
      return JSON.stringify([
        player.position.x, player.position.y, domePlayerRotation(player, size, grid, settings), player.scale,
        settings.model, settings.truncation, settings.fov, settings.tilt, settings.offsetX, settings.offsetY,
        size.width, size.height, grid.radius, grid.rotation,
      ]);
    };

    const rebuildGeometry = (entry: PlayerEntry, player: Player) => {
      try {
        const settings = planetariumRef.current;
        const size = outputSizeRef.current;
        const grid = gridGeometryRef.current;
        const domeWarp = isDomeWarpActive(player, settings) && (settings.preview !== 'unwarped' || presentationRef.current);
        const build = buildPlayerMesh(player);
        const source = domeWarp && player.mode === 'advanced' ? refineDomeMesh(build) : build;
        let positions = source.positions;
        if (domeWarp) {
          positions = [];
          for (let index = 0; index < source.positions.length; index += 3) {
            const point = domeLocalToWorld(player, {
              x: source.positions[index],
              y: source.positions[index + 1],
            }, size, grid, settings);
            positions.push(point.x, point.y, source.positions[index + 2]);
          }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(source.uvs, 2));
        if (source.indices.length) geometry.setIndex(source.indices);
        const flatGeometry = new THREE.BufferGeometry();
        flatGeometry.setAttribute('position', new THREE.Float32BufferAttribute(build.positions, 3));
        flatGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(build.uvs, 2));
        if (build.indices.length) flatGeometry.setIndex(build.indices);
        entry.mesh.geometry.dispose();
        entry.mesh.geometry = geometry;
        entry.flatMesh.geometry.dispose();
        entry.flatMesh.geometry = flatGeometry;
        entry.wire.geometry.dispose();
        entry.wire.geometry = new THREE.WireframeGeometry(geometry);
        entry.border.geometry.dispose();
        entry.border.geometry = borderGeometry(player, domeWarp
          ? (point) => domeLocalToWorld(player, point, size, grid, settings)
          : undefined);
        entry.quickCorners = player.quickCorners;
        entry.nodes = player.nodes;
        entry.borderIds = player.border;
        entry.mode = player.mode;
        entry.domeSignature = domeGeometrySignature(player);
      } catch {
        entry.mesh.visible = false;
      }
    };

    const renderAmbientPresentation = (deltaSeconds: number) => {
      const settings = presentSettingsRef.current.ambient;
      const transparent = presentSettingsRef.current.transparency;
      const overlays = [grid, polarGrid, stage, backgroundPlane, stageBorder];
      const details = [...entries.values()].flatMap((entry) => [entry.flatMesh, entry.wire, entry.border]);
      const objects = [...overlays, ...details];
      const visibility = objects.map((object) => object.visible);
      const groups = [...entries.values()].map((entry) => entry.group);
      const groupVisibility = groups.map((group) => group.visible);
      const previousBackground = scene.background;
      const previousClearColor = renderer.getClearColor(new THREE.Color());
      const previousClearAlpha = renderer.getClearAlpha();
      const previousAutoClear = renderer.autoClear;
      try {
        objects.forEach((object) => { object.visible = false; });
        scene.background = null;
        renderer.setClearColor(0x000000, 0);
        ambientPipeline.capture(scene, camera, settings, deltaSeconds);

        // Paint the opaque stage first, then the glow, then sharp players. This
        // ordering also works with a zero-alpha native desktop background.
        groups.forEach((group) => { group.visible = false; });
        overlays.forEach((object, index) => { object.visible = visibility[index]; });
        scene.background = transparent ? null : previousBackground;
        renderer.setClearColor(transparent ? 0x000000 : previousClearColor, transparent ? 0 : previousClearAlpha);
        renderer.setRenderTarget(null);
        renderer.autoClear = true;
        renderer.render(scene, camera);
        ambientPipeline.composite(settings);

        objects.forEach((object) => { object.visible = false; });
        groups.forEach((group, index) => { group.visible = groupVisibility[index]; });
        scene.background = null;
        renderer.autoClear = false;
        renderer.render(scene, camera);
      } finally {
        objects.forEach((object, index) => { object.visible = visibility[index]; });
        groups.forEach((group, index) => { group.visible = groupVisibility[index]; });
        scene.background = previousBackground;
        renderer.setClearColor(previousClearColor, previousClearAlpha);
        renderer.autoClear = previousAutoClear;
        renderer.setRenderTarget(null);
      }
    };

    let previousAmbientTimestamp = 0;
    const animate = (timestamp = performance.now()) => {
      if (disposed) return;
      frame = requestAnimationFrame(animate);
      const currentView = viewRef.current;
      const scale = scaleFor(currentView);
      camera.left = -currentView.width / (2 * scale);
      camera.right = currentView.width / (2 * scale);
      camera.top = currentView.height / (2 * scale);
      camera.bottom = -currentView.height / (2 * scale);
      camera.position.x = currentView.pan.x;
      camera.position.y = currentView.pan.y;
      camera.updateProjectionMatrix();
      const nextOutputSize = outputSizeRef.current;
      if (nextOutputSize !== activeOutputSize) {
        activeOutputSize = nextOutputSize;
        updateOutputSize(nextOutputSize);
      }
      const nextGridGeometry = gridGeometryRef.current;
      if (nextGridGeometry !== activeGridGeometry) {
        activeGridGeometry = nextGridGeometry;
        updateBuiltInGrid(nextGridGeometry);
      }
      const nextPlanetarium = planetariumRef.current;
      if (nextPlanetarium !== activePlanetarium) {
        activePlanetarium = nextPlanetarium;
        updateCircularGrid(gridGeometryRef.current);
      }
      const nextRenderQuality = renderQualityRef.current;
      if (nextRenderQuality !== activeRenderQuality) {
        activeRenderQuality = nextRenderQuality;
        const preset = getRenderQualityPreset(nextRenderQuality);
        entries.forEach((entry) => {
          if (entry.texture) configureTextureQuality(entry.texture, renderer, preset);
        });
        if (backgroundTexture) configureTextureQuality(backgroundTexture, renderer, preset);
        resize();
      }
      const nextBackground = backgroundRef.current;
      if (nextBackground !== activeBackground) {
        activeBackground = nextBackground;
        loadBackground(nextBackground?.uri);
      }
      const nextBackgroundColor = backgroundColorRef.current ?? DEFAULT_BACKGROUND_COLOR;
      if (nextBackgroundColor !== activeBackgroundColor) {
        activeBackgroundColor = nextBackgroundColor;
        stage.material.color.set(nextBackgroundColor);
        renderer.domElement.dataset.backgroundColor = nextBackgroundColor;
      }
      const transparentPresentation = presentationRef.current && presentSettingsRef.current.transparency;
      scene.background = transparentPresentation ? null : stage.material.color;
      renderer.setClearColor(stage.material.color, transparentPresentation ? 0 : 1);
      renderer.domElement.dataset.transparency = transparentPresentation ? 'native' : 'opaque';
      const showCustomBackground = !presentationRef.current && backgroundTexture !== null;
      const showBuiltInGrid = !presentationRef.current && !showCustomBackground;
      grid.visible = showBuiltInGrid && gridGeometryRef.current.kind === 'cartesian';
      polarGrid.visible = showBuiltInGrid && gridGeometryRef.current.kind === 'circular';
      stage.material.opacity = outputOpacityRef.current;
      stage.visible = !transparentPresentation && outputOpacityRef.current > 0;
      backgroundPlane.visible = showCustomBackground;
      stageBorder.visible = !presentationRef.current;

      const currentIds = new Set(playersRef.current.map((player) => player.id));
      entries.forEach((_entry, id) => {
        if (!currentIds.has(id)) removeEntry(id);
      });

      playersRef.current.forEach((player, index) => {
        const entry = entries.get(player.id) ?? createEntry(player.id);
        const domeWarp = isDomeWarpActive(player, planetariumRef.current)
          && (planetariumRef.current.preview !== 'unwarped' || presentationRef.current);
        entry.group.position.set(domeWarp ? 0 : player.position.x, domeWarp ? 0 : player.position.y, index * 0.01);
        entry.group.rotation.z = domeWarp ? 0 : player.rotation;
        entry.group.scale.setScalar(domeWarp ? 1 : player.scale);
        entry.group.visible = player.visible;
        entry.mesh.visible = player.visible;
        entry.flatMesh.visible = false;
        entry.mesh.renderOrder = index * 4;
        entry.flatMesh.renderOrder = index * 4;
        entry.border.renderOrder = index * 4 + 1;
        entry.wire.renderOrder = index * 4 + 2;
        entry.mesh.material.opacity = player.opacity;
        entry.visualUniforms.uVisualEnabled.value = isDefaultPlayerVisual(player.visual) ? 0 : 1;
        entry.visualUniforms.uVisualBrightness.value = player.visual?.brightness ?? 1;
        entry.visualUniforms.uVisualContrast.value = player.visual?.contrast ?? 1;
        entry.visualUniforms.uVisualSaturation.value = player.visual?.saturation ?? 1;
        entry.visualUniforms.uVisualGamma.value = player.visual?.gamma ?? 1;
        entry.visualUniforms.uVisualHue.value = player.visual?.hue ?? 0;
        entry.visualUniforms.uVisualTemperature.value = player.visual?.temperature ?? 0;

        if (entry.quickCorners !== player.quickCorners || entry.nodes !== player.nodes
          || entry.borderIds !== player.border || entry.mode !== player.mode
          || entry.domeSignature !== domeGeometrySignature(player)) {
          rebuildGeometry(entry, player);
        }

        const element = textureSources.current.get(player.id) ?? null;
        if (entry.textureElement !== element) {
          entry.texture?.dispose();
          entry.texture = element ? makeTexture(
            element,
            renderer,
            getRenderQualityPreset(renderQualityRef.current),
          ) : null;
          entry.textureElement = element;
          entry.mesh.material.map = entry.texture ?? placeholder;
          entry.mesh.material.needsUpdate = true;
        }
        if (entry.texture) {
          entry.texture.center.set(0.5, 0.5);
          entry.texture.rotation = player.mediaRotation;
          entry.texture.repeat.setScalar(1 / player.mediaScale);
          if (entry.textureElement instanceof HTMLCanvasElement) entry.texture.needsUpdate = true;
        }

        const selected = selectedRef.current.includes(player.id);
        const active = activeRef.current === player.id;
        entry.border.visible = !presentationRef.current && (selected || showMeshRef.current);
        entry.wire.visible = !presentationRef.current && showMeshRef.current && selected;
        const borderMaterial = entry.border.material as THREE.LineBasicMaterial;
        borderMaterial.color.set(active ? '#c5ffc3' : selected ? '#ebebeb' : '#69706b');
        borderMaterial.opacity = active ? 1 : selected ? 0.82 : 0.22;
        (entry.wire.material as THREE.LineBasicMaterial).color.set(active ? '#c5ffc3' : '#b1b1b1');
      });

      const preview = planetariumRef.current;
      if (preview.enabled && preview.preview === 'audience' && !presentationRef.current) {
        const overlays = [grid, polarGrid, backgroundPlane, stageBorder];
        const overlayVisibility = overlays.map((object) => object.visible);
        const playerLines = playersRef.current.map((player) => {
          const entry = entries.get(player.id) as PlayerEntry;
          const visibility = [entry.wire.visible, entry.border.visible];
          entry.wire.visible = false;
          entry.border.visible = false;
          return { entry, visibility };
        });
        overlays.forEach((object) => { object.visible = false; });
        stage.visible = true;
        stage.material.opacity = 1;
        const size = outputSizeRef.current;
        outputCamera.left = -size.width / 2;
        outputCamera.right = size.width / 2;
        outputCamera.top = size.height / 2;
        outputCamera.bottom = -size.height / 2;
        outputCamera.updateProjectionMatrix();
        domePreview.render(
          scene,
          outputCamera,
          preview,
          size,
          gridGeometryRef.current,
          currentView.width / currentView.height,
          renderQualityRef.current,
        );
        overlays.forEach((object, index) => { object.visible = overlayVisibility[index]; });
        playerLines.forEach(({ entry, visibility }) => { entry.wire.visible = visibility[0]; entry.border.visible = visibility[1]; });
        stage.visible = outputOpacityRef.current > 0;
        stage.material.opacity = outputOpacityRef.current;
      } else if (preview.enabled && preview.comparison && preview.preview === 'projector' && !presentationRef.current) {
        const changed = playersRef.current.flatMap((player, index) => isDomeWarpActive(player, preview) ? [{ player, index, entry: entries.get(player.id) as PlayerEntry }] : []);
        const lineVisibility = changed.map(({ entry }) => [entry.wire.visible, entry.border.visible]);
        changed.forEach(({ player, index, entry }) => {
          entry.mesh.visible = false;
          entry.flatMesh.position.set(player.position.x, player.position.y, index * 0.01);
          entry.flatMesh.rotation.z = player.rotation;
          entry.flatMesh.scale.setScalar(player.scale);
          entry.flatMesh.visible = player.visible;
          entry.wire.visible = false;
          entry.border.visible = false;
        });
        renderer.setScissorTest(true);
        renderer.setScissor(0, 0, currentView.width / 2, currentView.height);
        renderer.render(scene, camera);
        changed.forEach(({ player, entry }, index) => {
          entry.flatMesh.visible = false;
          entry.mesh.visible = player.visible;
          entry.wire.visible = lineVisibility[index][0];
          entry.border.visible = lineVisibility[index][1];
        });
        renderer.setScissor(currentView.width / 2, 0, currentView.width / 2, currentView.height);
        renderer.render(scene, camera);
        renderer.setScissorTest(false);
      } else {
        const ambient = presentSettingsRef.current.ambient;
        const ambientActive = presentationRef.current && ambient.enabled && ambient.intensity > 0
          && playersRef.current.some((player) => player.visible);
        renderer.domElement.dataset.ambientEnabled = String(ambientActive);
        renderer.domElement.dataset.ambientStyle = ambient.style;
        renderer.domElement.dataset.ambientIntensity = ambient.intensity.toFixed(2);
        renderer.domElement.dataset.ambientSpread = ambient.spread.toFixed(0);
        renderer.domElement.dataset.ambientSmoothing = ambient.smoothing.toFixed(2);
        if (ambientActive) {
          const deltaSeconds = previousAmbientTimestamp
            ? Math.min(0.1, Math.max(0.001, (timestamp - previousAmbientTimestamp) / 1000))
            : 1 / 60;
          previousAmbientTimestamp = timestamp;
          renderAmbientPresentation(deltaSeconds);
        } else {
          previousAmbientTimestamp = 0;
          ambientPipeline.reset();
          renderer.render(scene, camera);
        }
      }

      if (statsStartedAt === 0) {
        statsStartedAt = timestamp;
      } else {
        statsFrames += 1;
        const elapsed = timestamp - statsStartedAt;
        if (elapsed >= 1000) {
          const sample = sampleRenderPerformance(statsStartedAt, timestamp, statsFrames);
          renderer.domElement.dataset.renderFps = sample.fps.toFixed(1);
          renderer.domElement.dataset.renderFrameTime = sample.frameTime.toFixed(1);
          statsStartedAt = timestamp;
          statsFrames = 0;
        }
      }
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      const pixelRatio = resolveRenderPixelRatio(
        width,
        height,
        Math.min(window.devicePixelRatio || 1, 2),
        renderQualityRef.current,
        renderer.capabilities.maxTextureSize,
      );
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(width, height, false);
      ambientPipeline.resize(width, height);
      renderer.domElement.dataset.renderQuality = renderQualityRef.current;
      renderer.domElement.dataset.pixelRatio = String(pixelRatio);
      const output = outputSizeRef.current;
      setView((current) => ({
        ...current,
        width,
        height,
        fit: Math.min(width / output.width, height / output.height) * 0.9,
      }));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    animate();

    return () => {
      disposed = true;
      backgroundRequest += 1;
      cancelAnimationFrame(frame);
      observer.disconnect();
      entries.forEach((_entry, id) => removeEntry(id));
      backgroundTexture?.dispose();
      backgroundPlane.geometry.dispose();
      backgroundPlane.material.dispose();
      placeholder.dispose();
      stage.geometry.dispose();
      (stage.material as THREE.Material).dispose();
      stageBorder.geometry.dispose();
      (stageBorder.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      polarGrid.geometry.dispose();
      (polarGrid.material as THREE.Material).dispose();
      domePreview.dispose();
      ambientPipeline.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [textureSources, pushToast]);

  const eventPoint = (event: { clientX: number; clientY: number }): Vec2 => {
    const bounds = containerRef.current?.getBoundingClientRect();
    return bounds
      ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      : { x: 0, y: 0 };
  };

  const displayDomeWarp = (player: Player) => isDomeWarpActive(player, planetariumSettings)
    && (presentation || planetariumSettings.preview !== 'unwarped');
  const displayPoint = (player: Player, point: Vec2): Vec2 => displayDomeWarp(player)
    ? domeLocalToWorld(player, point, outputSize, gridGeometry, planetariumSettings)
    : localToWorld(player, point);

  const displayToLocal = (player: Player, point: Vec2): Vec2 => displayDomeWarp(player)
    ? domeWorldToLocal(player, point, outputSize, gridGeometry, planetariumSettings)
    : worldToLocal(player, point);

  const hitPlayer = (world: Vec2): Player | undefined => [...players].reverse().find((player) => {
    if (!player.visible) return false;
    const local = displayToLocal(player, world);
    const polygon = shapePolygon(player);
    return polygon.length >= 3 && pointInPolygon(local, polygon);
  });

  const hitHandle = (world: Vec2): { player: Player; index: number; nodeId?: string } | null => {
    const active = players.find((player) => player.id === activeId);
    if (!active || active.locked || !showMesh) return null;
    const scale = scaleFor(viewRef.current);
    if (active.mode === 'quick') {
      let best: { index: number; distance: number } | null = null;
      for (let index = 0; index < active.quickCorners.length; index += 1) {
        const point = displayPoint(active, active.quickCorners[index]);
        const distance = Math.hypot(point.x - world.x, point.y - world.y);
        if (!best || distance < best.distance) best = { index, distance };
      }
      return best && best.distance * scale < 14 ? { player: active, index: best.index } : null;
    }
    let best: { index: number; nodeId: string; distance: number } | null = null;
    for (let index = 0; index < active.nodes.length; index += 1) {
      const node = active.nodes[index];
      const point = displayPoint(active, node);
      const distance = Math.hypot(point.x - world.x, point.y - world.y);
      if (!best || distance < best.distance) best = { index, nodeId: node.id, distance };
    }
    return best && best.distance * scale < 12
      ? { player: active, index: best.index, nodeId: best.nodeId }
      : null;
  };

  const snapPoint = (point: Vec2): Vec2 => gridSnapping && !customBackgroundReady
    ? snapToCircularGrid(
      point,
      gridGeometry,
      outputSize,
      scaleFor(viewRef.current),
      undefined,
      planetariumSettings.enabled ? domeCenter(outputSize, planetariumSettings) : { x: 0, y: 0 },
    )
    : point;

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 && event.button !== 1 && event.button !== 2) return;
    const screen = eventPoint(event);
    const world = screenToWorld(viewRef.current, screen);
    if (presentation) {
      if (isPresentationWindow || event.button !== 0 || presentSettings.layoutLocked) return;
      const player = hitPlayer(world);
      if (!player || player.locked) return;
      useWorkspace.getState().beginHistory('Move player in Present mode');
      dragRef.current = {
        type: 'move', playerId: player.id, playerIds: [player.id],
        initialPlayers: players,
        start: world, last: world, lastDelta: { x: 0, y: 0 },
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    if (event.button !== 0 || event.altKey) {
      dragRef.current = { type: 'pan', last: screen };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    useWorkspace.getState().beginHistory();

    if (tool === 'trace-border' || tool === 'trace-interior') {
      let playerId: string | undefined;
      if (tool === 'trace-interior') {
        const active = players.find((player) => player.id === activeId);
        if (!active || active.locked || active.mode !== 'advanced') {
          pushToast({
            title: 'Choose an unlocked advanced player',
            detail: 'Interior trace adds nodes to the active advanced mesh.',
            tone: 'warning',
          });
          useWorkspace.getState().endHistory();
          return;
        }
        playerId = active.id;
      }
      dragRef.current = { type: 'trace', mode: tool, playerId, points: [world], lastScreen: screen };
      setTracePreview({ mode: tool, points: [world] });
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }

    if (tool !== 'select') {
      const active = players.find((player) => player.id === activeId);
      if (!active || active.locked) {
        useWorkspace.getState().endHistory();
        return;
      }
      const local = displayToLocal(active, tool === 'add-interior' ? snapPoint(world) : world);
      if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) {
        useWorkspace.getState().endHistory();
        return;
      }
      if (tool === 'add-border') {
        const nearest = nearestBorderSegment(active.nodes, active.border, local);
        if (nearest && nearest.distance * scaleFor(viewRef.current) < 24) {
          addNode(active.id, 'border', local);
        }
      } else if (pointInPolygon(local, shapePolygon(active))) {
        addNode(active.id, 'interior', local);
      }
      return;
    }

    const handle = hitHandle(world);
    if (handle) {
      if (handle.nodeId) {
        const alreadySelected = useWorkspace.getState().selectedNodes[handle.player.id]?.includes(handle.nodeId);
        if (!alreadySelected) selectNodes({ [handle.player.id]: [handle.nodeId] }, event.shiftKey);
        const nodeIds = useWorkspace.getState().selectedNodes[handle.player.id] ?? [handle.nodeId];
        dragRef.current = {
          type: 'node', playerId: handle.player.id, nodeIds,
          lastLocal: displayToLocal(handle.player, world),
        };
      } else {
        selectPlayer(handle.player.id);
        dragRef.current = { type: 'corner', playerId: handle.player.id, index: handle.index };
      }
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const player = hitPlayer(world);
    const active = players.find((candidate) => candidate.id === activeId);
    if (event.shiftKey && active?.mode === 'advanced' && player?.id === active.id) {
      const next = { kind: 'nodes' as const, playerId: active.id, start: world, end: world, additive: true };
      dragRef.current = { type: 'marquee', marquee: next };
      setMarquee(next);
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (!player) {
      const next = { kind: 'players' as const, start: world, end: world, additive: event.shiftKey };
      dragRef.current = { type: 'marquee', marquee: next };
      setMarquee(next);
      if (!event.shiftKey) clearSelection();
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (!event.shiftKey && !selectedIds.includes(player.id)) selectPlayer(player.id);
    else selectPlayer(player.id, event.shiftKey);
    if (event.shiftKey || player.locked) return;
    const playerIds = useWorkspace.getState().selectedIds.filter((id) => (
      useWorkspace.getState().players.some((candidate) => candidate.id === id && !candidate.locked)
    ));
    dragRef.current = {
      type: 'move', playerId: player.id, playerIds,
      initialPlayers: useWorkspace.getState().players,
      start: world, last: world, lastDelta: { x: 0, y: 0 },
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const appendTracePoint = (
    drag: Extract<DragState, { type: 'trace' }>,
    screen: Vec2,
    minimumDistance: number,
  ) => {
    if (Math.hypot(screen.x - drag.lastScreen.x, screen.y - drag.lastScreen.y) < minimumDistance) return;
    drag.points.push(screenToWorld(viewRef.current, screen));
    drag.lastScreen = screen;
    setTracePreview({ mode: drag.mode, points: [...drag.points] });
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const screen = eventPoint(event);
    if (drag.type === 'trace') {
      appendTracePoint(drag, screen, 3);
      return;
    }
    if (drag.type === 'pan') {
      const scale = scaleFor(viewRef.current);
      const dx = screen.x - drag.last.x;
      const dy = screen.y - drag.last.y;
      setView((current) => ({
        ...current,
        pan: {
          x: current.pan.x - dx / scale,
          y: current.pan.y + dy / scale,
        },
      }));
      drag.last = screen;
      return;
    }
    if (drag.type === 'marquee') {
      const next = { ...drag.marquee, end: screenToWorld(viewRef.current, screen) };
      drag.marquee = next;
      setMarquee(next);
      return;
    }
    const world = screenToWorld(viewRef.current, screen);
    if (drag.type === 'move') {
      const currentPlayers = useWorkspace.getState().players;
      const moving = currentPlayers.filter((candidate) => drag.playerIds.includes(candidate.id));
      if (!presentation && moving.length && moving.every((candidate) => !displayDomeWarp(candidate))) {
        const raw = { x: world.x - drag.start.x, y: world.y - drag.start.y };
        const snapped = smartSnap(drag.initialPlayers, drag.playerIds, raw, 8 / scaleFor(viewRef.current));
        movePlayers(drag.playerIds, {
          x: snapped.delta.x - drag.lastDelta.x,
          y: snapped.delta.y - drag.lastDelta.y,
        });
        drag.lastDelta = snapped.delta;
        setGuides(snapped.guides);
      } else {
        drag.playerIds.forEach((id) => {
          const player = currentPlayers.find((candidate) => candidate.id === id);
          if (!player) return;
          if (displayDomeWarp(player)) {
            const previous = domeWorldToPosition(drag.last, outputSize, gridGeometry, planetariumSettings);
            const current = domeWorldToPosition(world, outputSize, gridGeometry, planetariumSettings);
            movePlayer(id, { x: current.x - previous.x, y: current.y - previous.y });
          } else {
            movePlayer(id, { x: world.x - drag.last.x, y: world.y - drag.last.y });
          }
        });
      }
      drag.last = world;
      return;
    }
    const player = useWorkspace.getState().players.find((candidate) => candidate.id === drag.playerId);
    if (!player) return;
    const local = displayToLocal(player, snapPoint(world));
    if (!Number.isFinite(local.x) || !Number.isFinite(local.y)) return;
    if (drag.type === 'corner') {
      updateQuickCorner(drag.playerId, drag.index, local);
    } else if (drag.type === 'node') {
      const delta = { x: local.x - drag.lastLocal.x, y: local.y - drag.lastLocal.y };
      const moves = Object.fromEntries(player.nodes.filter((node) => drag.nodeIds.includes(node.id)).map((node) => [
        node.id, { x: node.x + delta.x, y: node.y + delta.y },
      ]));
      moveNodes({ [drag.playerId]: moves });
      drag.lastLocal = local;
    }
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setGuides([]);
    if (drag?.type === 'marquee') {
      setMarquee(null);
      if (drag.marquee.kind === 'players') {
        const ids = players.filter((player) => pointInRect(playerBounds(player).center, drag.marquee.start, drag.marquee.end)).map((player) => player.id);
        selectPlayers(ids, drag.marquee.additive);
      } else {
        const player = players.find((candidate) => candidate.id === drag.marquee.playerId);
        if (player) {
          const ids = player.nodes.filter((node) => pointInRect(displayPoint(player, node), drag.marquee.start, drag.marquee.end)).map((node) => node.id);
          selectNodes({ [player.id]: ids }, drag.marquee.additive);
        }
      }
    }
    if (drag?.type === 'trace') {
      appendTracePoint(drag, eventPoint(event), 1);
      setTracePreview(null);
      if (drag.mode === 'trace-border') {
        try {
          const playerId = tracePlayer(drag.points);
          const borderCount = useWorkspace.getState().players.find((player) => player.id === playerId)?.border.length ?? 0;
          setTool('trace-interior');
          pushToast({
            title: 'Traced player created',
            detail: `${borderCount} border nodes. Draw interior paths now, or choose Select to finish.`,
            tone: 'success',
          });
        } catch (error) {
          pushToast({
            title: 'Border could not be created',
            detail: error instanceof Error ? error.message : 'Draw a larger, non-overlapping outline.',
            tone: 'error',
          });
        }
      } else if (drag.points.length < 2) {
        pushToast({
          title: 'Draw an interior path',
          detail: 'Drag inside the active mesh, then release to place nodes along the path.',
          tone: 'warning',
        });
      } else {
        const player = useWorkspace.getState().players.find((candidate) => candidate.id === drag.playerId);
        const points = player ? drag.points.flatMap((point) => {
          const local = displayToLocal(player, point);
          return Number.isFinite(local.x) && Number.isFinite(local.y) ? [local] : [];
        }) : [];
        const added = player ? traceInterior(player.id, points) : 0;
        pushToast(added > 0 ? {
          title: `${added} interior ${added === 1 ? 'node' : 'nodes'} added`,
          detail: 'Draw another path, or choose Select to finish.',
          tone: 'success',
        } : {
          title: 'No interior nodes added',
          detail: 'Keep the path inside the mesh and away from its border and existing nodes.',
          tone: 'warning',
        });
      }
    }
    useWorkspace.getState().endHistory();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handlePointerCancel = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.type === 'trace') setTracePreview(null);
    dragRef.current = null;
    setMarquee(null);
    setGuides([]);
    useWorkspace.getState().endHistory();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (presentation) return;
    event.preventDefault();
    const screen = eventPoint(event);
    const current = viewRef.current;
    const world = screenToWorld(current, screen);
    const zoom = Math.max(0.25, Math.min(8, current.zoom * Math.exp(-event.deltaY * 0.0012)));
    const scale = current.fit * zoom;
    setView({
      ...current,
      zoom,
      pan: {
        x: world.x - (screen.x - current.width / 2) / scale,
        y: world.y + (screen.y - current.height / 2) / scale,
      },
    });
  };

  const zoomBy = (factor: number) => setView((current) => ({
    ...current,
    zoom: Math.max(0.25, Math.min(8, current.zoom * factor)),
  }));
  const fitView = () => setView((current) => ({ ...current, zoom: 1, pan: { x: 0, y: 0 } }));
  const zoomToSelection = () => {
    const selected = players.filter((player) => selectedIds.includes(player.id));
    if (!selected.length) return;
    const bounds = boundsFromPoints(selected.flatMap((player) => (
      shapePolygon(player).map((point) => displayPoint(player, point))
    )));
    setView((current) => {
      const scale = Math.min(
        current.width / Math.max(80, bounds.width * 1.3),
        current.height / Math.max(80, bounds.height * 1.3),
      );
      return {
        ...current,
        zoom: Math.max(0.25, Math.min(8, scale / current.fit)),
        pan: bounds.center,
      };
    });
  };
  useEffect(() => {
    const handleZoomShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (presentation || event.key.toLowerCase() !== 'f' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey
        || target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      zoomToSelection();
    };
    window.addEventListener('keydown', handleZoomShortcut);
    return () => window.removeEventListener('keydown', handleZoomShortcut);
  });
  const active = players.find((player) => player.id === activeId);
  const audiencePreview = !presentation && planetariumSettings.enabled && planetariumSettings.preview === 'audience';
  const handles = active && showMesh && !active.locked && !presentation
    ? active.mode === 'quick'
      ? active.quickCorners.map((point, index) => ({ id: `corner-${index}`, point, kind: 'corner' }))
      : active.nodes.map((node) => ({ id: node.id, point: node, kind: node.kind }))
    : [];
  const activeLabel = active
    ? worldToScreen(view, displayPoint(active, {
      x: Math.min(...shapePolygon(active).map((point) => point.x)),
      y: Math.max(...shapePolygon(active).map((point) => point.y)) + 30,
    }))
    : null;
  const stageLabel = worldToScreen(view, { x: -outputSize.width / 2, y: outputSize.height / 2 + 28 });
  const circularGridLabels: { id: string; text: string; point: Vec2; kind: 'ring' | 'spoke' }[] = [];
  if (!presentation && !customBackgroundReady && gridGeometry.kind === 'circular') {
    const radius = domeRadius(outputSize, gridGeometry);
    const gridCenter = planetariumSettings.enabled ? domeCenter(outputSize, planetariumSettings) : { x: 0, y: 0 };
    const maxElevation = planetariumSettings.enabled ? planetariumSettings.fov / 2 : 90;
    const rotation = THREE.MathUtils.degToRad(gridGeometry.rotation);
    const ringLabelAngle = rotation + Math.PI / 2;
    for (let ring = 1; ring <= gridGeometry.rings; ring += 1) {
      const ringRadius = radius * ring / gridGeometry.rings;
      circularGridLabels.push({
        id: `ring-${ring}`,
        text: `${Math.round(maxElevation * (1 - ring / gridGeometry.rings))}°`,
        kind: 'ring',
        point: worldToScreen(view, {
          x: gridCenter.x + Math.cos(ringLabelAngle) * ringRadius,
          y: gridCenter.y + Math.sin(ringLabelAngle) * ringRadius,
        }),
      });
    }
    const spokeLabelStride = Math.ceil(gridGeometry.spokes / 24);
    for (let spoke = 0; spoke < gridGeometry.spokes; spoke += spokeLabelStride) {
      const angle = rotation + spoke / gridGeometry.spokes * Math.PI * 2;
      circularGridLabels.push({
        id: `spoke-${spoke}`,
        text: `${Math.round(spoke * 360 / gridGeometry.spokes) % 360}°`,
        kind: 'spoke',
        point: worldToScreen(view, {
          x: gridCenter.x + Math.cos(angle) * radius * 1.045,
          y: gridCenter.y + Math.sin(angle) * radius * 1.045,
        }),
      });
    }
  }
  const traceScreenPoints = tracePreview?.points.map((point) => worldToScreen(view, point)) ?? [];
  const tracePointString = traceScreenPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const toolInstruction = {
    select: 'ALT / MIDDLE DRAG TO PAN',
    'add-border': 'CLICK AN EDGE TO INSERT A NODE',
    'add-interior': 'CLICK INSIDE THE MESH TO ADD A NODE',
    'trace-border': 'DRAG A CLOSED OUTLINE / RELEASE TO CREATE A PLAYER',
    'trace-interior': 'DRAW PATHS INSIDE THE ACTIVE MESH / RELEASE TO ADD NODES',
  }[tool];

  return (
    <div
      ref={containerRef}
      className={`warp-workspace ${tool !== 'select' ? 'is-adding' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onWheel={handleWheel}
      onContextMenu={(event) => event.preventDefault()}
      onDoubleClick={(event) => {
        if (presentation || tool !== 'select' || !active || active.mode !== 'advanced' || active.locked) return;
        const hit = hitHandle(screenToWorld(viewRef.current, eventPoint(event)));
        if (hit?.nodeId) deleteNode(active.id, hit.nodeId);
      }}
    >
      <div ref={hostRef} className="canvas-host" />
      <svg
        className="workspace-overlay"
        width={view.width}
        height={view.height}
        aria-hidden="true"
        style={{ visibility: audiencePreview ? 'hidden' : 'visible' }}
      >
        {!presentation && (
          <text x={stageLabel.x} y={stageLabel.y} className="stage-label">
            OUTPUT / {outputSize.width} × {outputSize.height}
          </text>
        )}
        {circularGridLabels.length > 0 && (
          <g className="circular-grid-labels">
            {circularGridLabels.map((label) => (
              <text
                key={label.id}
                x={label.point.x}
                y={label.point.y}
                className={`circular-grid-${label.kind}-label`}
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {label.text}
              </text>
            ))}
          </g>
        )}
        {active && activeLabel && !presentation && (
          <text x={activeLabel.x} y={activeLabel.y} className="player-label">
            {active.name.toUpperCase()} / {active.mode === 'quick' ? 'PERSPECTIVE' : `${active.nodes.length} NODES`}
          </text>
        )}
        {tracePreview && traceScreenPoints.length > 0 && (
          <g className={`trace-preview trace-preview-${tracePreview.mode === 'trace-border' ? 'border' : 'interior'}-mode`}>
            {tracePreview.mode === 'trace-border'
              ? <polygon points={tracePointString} className="trace-preview-border" />
              : <polyline points={tracePointString} className="trace-preview-interior" />}
            <circle
              cx={traceScreenPoints[0].x}
              cy={traceScreenPoints[0].y}
              r="4"
              className="trace-preview-point"
            />
            {traceScreenPoints.length > 1 && (
              <circle
                cx={traceScreenPoints[traceScreenPoints.length - 1].x}
                cy={traceScreenPoints[traceScreenPoints.length - 1].y}
                r="3"
                className="trace-preview-point"
              />
            )}
          </g>
        )}
        {guides.map((guide, index) => {
          const start = worldToScreen(view, guide.axis === 'x'
            ? { x: guide.value, y: guide.start }
            : { x: guide.start, y: guide.value });
          const end = worldToScreen(view, guide.axis === 'x'
            ? { x: guide.value, y: guide.end }
            : { x: guide.end, y: guide.value });
          return <line key={`${guide.axis}-${index}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} className="smart-guide" />;
        })}
        {marquee && (() => {
          const start = worldToScreen(view, marquee.start);
          const end = worldToScreen(view, marquee.end);
          return <rect
            x={Math.min(start.x, end.x)} y={Math.min(start.y, end.y)}
            width={Math.abs(end.x - start.x)} height={Math.abs(end.y - start.y)}
            className={`selection-marquee ${marquee.kind === 'nodes' ? 'node-marquee' : ''}`}
          />;
        })()}
        {handles.map((handle) => {
          const point = worldToScreen(view, displayPoint(active as Player, handle.point));
          const selected = active && selectedNodes[active.id]?.includes(handle.id);
          return (
            <g key={handle.id} transform={`translate(${point.x} ${point.y})`} className={selected ? 'selected-node' : ''}>
              <circle r={handle.kind === 'corner' ? 7 : 5} className={`node-hit node-${handle.kind}`} />
              {handle.kind === 'corner' && <circle r="2" className="node-center" />}
            </g>
          );
        })}
      </svg>
      {!presentation && planetariumSettings.enabled && planetariumSettings.comparison && planetariumSettings.preview === 'projector' && (
        <><div className="comparison-divider" /><span className="comparison-label comparison-before">BEFORE / UNWARPED</span><span className="comparison-label comparison-after">AFTER / PROJECTOR</span></>
      )}
      {!presentation && planetariumSettings.enabled && planetariumSettings.preview === 'audience' && (
        <span className="audience-preview-label">AUDIENCE GEOMETRY / VIRTUAL HEMISPHERE</span>
      )}

      {!players.length && (
        <div className="empty-workspace">
          <span>NO SURFACES IN THIS WORKSPACE</span>
          <p>Add a player, or choose Trace and draw its border.</p>
          <button className="button primary" onClick={() => addPlayer()}>Add player</button>
        </div>
      )}

      <div className={`viewport-status${presentation ? ' presentation-hint' : ''}`}>
        <span>{players.length} {players.length === 1 ? 'SURFACE' : 'SURFACES'}</span>
        <span>{presentation ? 'DRAG A PLAYER TO REPOSITION · ESC EXITS' : toolInstruction}</span>
      </div>
      {!presentation && (
        <div className="viewport-zoom" onPointerDown={(event) => event.stopPropagation()}>
          <button className="icon-button" title="Zoom out" onClick={() => zoomBy(0.85)}><Minus size={14} /></button>
          <button className="zoom-value" title="Reset zoom" onClick={fitView}>{Math.round(view.zoom * 100)}%</button>
          <button className="icon-button" title="Zoom in" onClick={() => zoomBy(1.18)}><Plus size={14} /></button>
          <button className="icon-button" title="Zoom to selection (F)" aria-label="Zoom to selection" disabled={!selectedIds.length} onClick={zoomToSelection}><Focus size={14} /></button>
          <button className="icon-button" title="Fit output" onClick={fitView}><Maximize2 size={14} /></button>
        </div>
      )}
    </div>
  );
}
