import { Maximize2, Minus, Plus } from 'lucide-react';
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

type DragState =
  | { type: 'move'; playerId: string; last: Vec2 }
  | { type: 'corner'; playerId: string; index: number }
  | { type: 'node'; playerId: string; nodeId: string }
  | { type: 'pan'; last: Vec2 };

interface PlayerEntry {
  group: THREE.Group;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  wire: THREE.LineSegments;
  border: THREE.Line;
  texture: THREE.Texture | null;
  textureElement: TextureSource | null;
  quickCorners: Player['quickCorners'] | null;
  nodes: Player['nodes'] | null;
  borderIds: Player['border'] | null;
  mode: Player['mode'] | null;
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

function borderGeometry(player: Player): THREE.BufferGeometry {
  const polygon = shapePolygon(player);
  const points = polygon.map((point) => new THREE.Vector3(point.x, point.y, 1));
  if (points.length) points.push(points[0].clone());
  return new THREE.BufferGeometry().setFromPoints(points);
}

function makeTexture(element: TextureSource, renderer: THREE.WebGLRenderer): THREE.Texture {
  const texture = element instanceof HTMLVideoElement
    ? new THREE.VideoTexture(element)
    : element instanceof HTMLCanvasElement
      ? new THREE.CanvasTexture(element)
      : new THREE.Texture(element);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  texture.needsUpdate = true;
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
  const viewRef = useRef<ViewState>(initialView);
  const [view, setView] = useState<ViewState>(initialView);
  const players = useWorkspace((state) => state.players);
  const selectedIds = useWorkspace((state) => state.selectedIds);
  const activeId = useWorkspace((state) => state.activeId);
  const tool = useWorkspace((state) => state.tool);
  const showMesh = useWorkspace((state) => state.showMesh);
  const presentation = useWorkspace((state) => state.presentation);
  const selectPlayer = useWorkspace((state) => state.selectPlayer);
  const clearSelection = useWorkspace((state) => state.clearSelection);
  const movePlayer = useWorkspace((state) => state.movePlayer);
  const updateQuickCorner = useWorkspace((state) => state.updateQuickCorner);
  const moveNode = useWorkspace((state) => state.moveNode);
  const addNode = useWorkspace((state) => state.addNode);
  const deleteNode = useWorkspace((state) => state.deleteNode);
  const addPlayer = useWorkspace((state) => state.addPlayer);
  const { textureSources } = useMedia();

  playersRef.current = players;
  selectedRef.current = selectedIds;
  activeRef.current = activeId;
  showMeshRef.current = showMesh;
  presentationRef.current = presentation;
  viewRef.current = view;

  useEffect(() => {
    const host = hostRef.current;
    const container = containerRef.current;
    if (!host || !container) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setClearColor('#141615');
    renderer.domElement.className = 'warp-canvas';
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#141615');
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
    camera.position.z = 500;

    const grid = new THREE.GridHelper(4000, 80, '#343936', '#272b28');
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -100;
    scene.add(grid);

    const stage = new THREE.Mesh(
      new THREE.PlaneGeometry(WORKSPACE_WIDTH, WORKSPACE_HEIGHT),
      new THREE.MeshBasicMaterial({ color: '#1a1d1b', depthTest: false }),
    );
    stage.position.z = -90;
    stage.renderOrder = -2;
    scene.add(stage);
    const stageBorder = new THREE.LineLoop(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-WORKSPACE_WIDTH / 2, -WORKSPACE_HEIGHT / 2, -80),
        new THREE.Vector3(WORKSPACE_WIDTH / 2, -WORKSPACE_HEIGHT / 2, -80),
        new THREE.Vector3(-WORKSPACE_WIDTH / 2, WORKSPACE_HEIGHT / 2, -80),
        new THREE.Vector3(-WORKSPACE_WIDTH / 2, WORKSPACE_HEIGHT / 2, -80),
      ]),
      new THREE.LineBasicMaterial({ color: '#505752', depthTest: false }),
    );
    stageBorder.renderOrder = -1;
    scene.add(stageBorder);

    const placeholder = new THREE.DataTexture(new Uint8Array([28, 31, 29, 255]), 1, 1);
    placeholder.needsUpdate = true;
    const entries = new Map<string, PlayerEntry>();
    let frame = 0;
    let disposed = false;

    const removeEntry = (id: string) => {
      const entry = entries.get(id);
      if (!entry) return;
      entry.mesh.geometry.dispose();
      entry.wire.geometry.dispose();
      entry.border.geometry.dispose();
      entry.mesh.material.dispose();
      (entry.wire.material as THREE.Material).dispose();
      (entry.border.material as THREE.Material).dispose();
      entry.texture?.dispose();
      scene.remove(entry.group);
      entries.delete(id);
    };

    const createEntry = (id: string): PlayerEntry => {
      const material = new THREE.MeshBasicMaterial({
        map: placeholder,
        color: '#ffffff',
        side: THREE.DoubleSide,
        transparent: true,
        depthTest: false,
      });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), material);
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
      scene.add(group);
      const entry: PlayerEntry = {
        group,
        mesh,
        wire,
        border,
        texture: null,
        textureElement: null,
        quickCorners: null,
        nodes: null,
        borderIds: null,
        mode: null,
      };
      entries.set(id, entry);
      return entry;
    };

    const rebuildGeometry = (entry: PlayerEntry, player: Player) => {
      try {
        const build = buildPlayerMesh(player);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(build.positions, 3));
        geometry.setAttribute('uv', new THREE.Float32BufferAttribute(build.uvs, 2));
        geometry.setIndex(build.indices);
        entry.mesh.geometry.dispose();
        entry.mesh.geometry = geometry;
        entry.wire.geometry.dispose();
        entry.wire.geometry = new THREE.WireframeGeometry(geometry);
        entry.border.geometry.dispose();
        entry.border.geometry = borderGeometry(player);
        entry.quickCorners = player.quickCorners;
        entry.nodes = player.nodes;
        entry.borderIds = player.border;
        entry.mode = player.mode;
      } catch {
        entry.mesh.visible = false;
      }
    };

    const animate = () => {
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
      grid.visible = !presentationRef.current;
      stage.visible = !presentationRef.current;
      stageBorder.visible = !presentationRef.current;

      const currentIds = new Set(playersRef.current.map((player) => player.id));
      entries.forEach((_entry, id) => {
        if (!currentIds.has(id)) removeEntry(id);
      });

      playersRef.current.forEach((player, index) => {
        const entry = entries.get(player.id) ?? createEntry(player.id);
        entry.group.position.set(player.position.x, player.position.y, index * 0.01);
        entry.group.rotation.z = player.rotation;
        entry.group.scale.setScalar(player.scale);
        entry.group.visible = player.visible;
        entry.mesh.visible = player.visible;
        entry.mesh.renderOrder = index * 4;
        entry.border.renderOrder = index * 4 + 1;
        entry.wire.renderOrder = index * 4 + 2;
        entry.mesh.material.opacity = player.opacity;

        if (entry.quickCorners !== player.quickCorners || entry.nodes !== player.nodes
          || entry.borderIds !== player.border || entry.mode !== player.mode) {
          rebuildGeometry(entry, player);
        }

        const element = textureSources.current.get(player.id) ?? null;
        if (entry.textureElement !== element) {
          entry.texture?.dispose();
          entry.texture = element ? makeTexture(element, renderer) : null;
          entry.textureElement = element;
          entry.mesh.material.map = entry.texture ?? placeholder;
          entry.mesh.material.needsUpdate = true;
        }
        if (entry.textureElement instanceof HTMLCanvasElement && entry.texture) {
          entry.texture.needsUpdate = true;
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
      renderer.render(scene, camera);
    };

    const resize = () => {
      const bounds = container.getBoundingClientRect();
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      renderer.setSize(width, height, false);
      setView((current) => ({
        ...current,
        width,
        height,
        fit: Math.min(width / WORKSPACE_WIDTH, height / WORKSPACE_HEIGHT) * 0.9,
      }));
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();
    animate();

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      entries.forEach((_entry, id) => removeEntry(id));
      placeholder.dispose();
      stage.geometry.dispose();
      (stage.material as THREE.Material).dispose();
      stageBorder.geometry.dispose();
      (stageBorder.material as THREE.Material).dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [textureSources]);

  const eventPoint = (event: { clientX: number; clientY: number }): Vec2 => {
    const bounds = containerRef.current?.getBoundingClientRect();
    return bounds
      ? { x: event.clientX - bounds.left, y: event.clientY - bounds.top }
      : { x: 0, y: 0 };
  };

  const hitPlayer = (world: Vec2): Player | undefined => [...players].reverse().find((player) => {
    if (!player.visible) return false;
    const local = worldToLocal(player, world);
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
        const point = localToWorld(active, active.quickCorners[index]);
        const distance = Math.hypot(point.x - world.x, point.y - world.y);
        if (!best || distance < best.distance) best = { index, distance };
      }
      return best && best.distance * scale < 14 ? { player: active, index: best.index } : null;
    }
    let best: { index: number; nodeId: string; distance: number } | null = null;
    for (let index = 0; index < active.nodes.length; index += 1) {
      const node = active.nodes[index];
      const point = localToWorld(active, node);
      const distance = Math.hypot(point.x - world.x, point.y - world.y);
      if (!best || distance < best.distance) best = { index, nodeId: node.id, distance };
    }
    return best && best.distance * scale < 12
      ? { player: active, index: best.index, nodeId: best.nodeId }
      : null;
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (presentation || (event.button !== 0 && event.button !== 1 && event.button !== 2)) return;
    const screen = eventPoint(event);
    const world = screenToWorld(viewRef.current, screen);
    if (event.button !== 0 || event.altKey) {
      dragRef.current = { type: 'pan', last: screen };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (tool !== 'select') {
      const active = players.find((player) => player.id === activeId);
      if (!active || active.locked) return;
      const local = worldToLocal(active, world);
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
      selectPlayer(handle.player.id);
      dragRef.current = handle.nodeId
        ? { type: 'node', playerId: handle.player.id, nodeId: handle.nodeId }
        : { type: 'corner', playerId: handle.player.id, index: handle.index };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    const player = hitPlayer(world);
    if (!player) {
      if (!event.shiftKey) clearSelection();
      return;
    }
    selectPlayer(player.id, event.shiftKey);
    if (event.shiftKey || player.locked) return;
    dragRef.current = { type: 'move', playerId: player.id, last: world };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const screen = eventPoint(event);
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
    const world = screenToWorld(viewRef.current, screen);
    if (drag.type === 'move') {
      movePlayer(drag.playerId, { x: world.x - drag.last.x, y: world.y - drag.last.y });
      drag.last = world;
      return;
    }
    const player = useWorkspace.getState().players.find((candidate) => candidate.id === drag.playerId);
    if (!player) return;
    const local = worldToLocal(player, world);
    if (drag.type === 'corner') updateQuickCorner(drag.playerId, drag.index, local);
    else moveNode(drag.playerId, drag.nodeId, local);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
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
    const zoom = Math.max(0.25, Math.min(5, current.zoom * Math.exp(-event.deltaY * 0.0012)));
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
    zoom: Math.max(0.25, Math.min(5, current.zoom * factor)),
  }));
  const fitView = () => setView((current) => ({ ...current, zoom: 1, pan: { x: 0, y: 0 } }));
  const active = players.find((player) => player.id === activeId);
  const handles = active && showMesh && !active.locked && !presentation
    ? active.mode === 'quick'
      ? active.quickCorners.map((point, index) => ({ id: `corner-${index}`, point, kind: 'corner' }))
      : active.nodes.map((node) => ({ id: node.id, point: node, kind: node.kind }))
    : [];
  const activeLabel = active
    ? worldToScreen(view, localToWorld(active, {
      x: Math.min(...shapePolygon(active).map((point) => point.x)),
      y: Math.max(...shapePolygon(active).map((point) => point.y)) + 30,
    }))
    : null;
  const stageLabel = worldToScreen(view, { x: -WORKSPACE_WIDTH / 2, y: WORKSPACE_HEIGHT / 2 + 28 });

  return (
    <div
      ref={containerRef}
      className={`warp-workspace ${tool !== 'select' ? 'is-adding' : ''}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
      onContextMenu={(event) => event.preventDefault()}
      onDoubleClick={(event) => {
        if (!active || active.mode !== 'advanced' || active.locked) return;
        const hit = hitHandle(screenToWorld(viewRef.current, eventPoint(event)));
        if (hit?.nodeId) deleteNode(active.id, hit.nodeId);
      }}
    >
      <div ref={hostRef} className="canvas-host" />
      <svg className="workspace-overlay" width={view.width} height={view.height} aria-hidden="true">
        {!presentation && (
          <text x={stageLabel.x} y={stageLabel.y} className="stage-label">
            OUTPUT / {WORKSPACE_WIDTH} × {WORKSPACE_HEIGHT}
          </text>
        )}
        {active && activeLabel && !presentation && (
          <text x={activeLabel.x} y={activeLabel.y} className="player-label">
            {active.name.toUpperCase()} / {active.mode === 'quick' ? 'PERSPECTIVE' : `${active.nodes.length} NODES`}
          </text>
        )}
        {handles.map((handle) => {
          const point = worldToScreen(view, localToWorld(active as Player, handle.point));
          return (
            <g key={handle.id} transform={`translate(${point.x} ${point.y})`}>
              <circle r={handle.kind === 'corner' ? 7 : 5} className={`node-hit node-${handle.kind}`} />
              {handle.kind === 'corner' && <circle r="2" className="node-center" />}
            </g>
          );
        })}
      </svg>

      {!players.length && (
        <div className="empty-workspace">
          <span>NO SURFACES IN THIS WORKSPACE</span>
          <p>Add a player, then choose a source for it.</p>
          <button className="button primary" onClick={() => addPlayer()}>Add player</button>
        </div>
      )}

      <div className="viewport-status">
        <span>{players.length} {players.length === 1 ? 'SURFACE' : 'SURFACES'}</span>
        <span>{tool === 'select' ? 'ALT / MIDDLE DRAG TO PAN' : tool === 'add-border' ? 'CLICK AN EDGE TO INSERT A NODE' : 'CLICK INSIDE THE MESH TO ADD A NODE'}</span>
      </div>
      {!presentation && (
        <div className="viewport-zoom" onPointerDown={(event) => event.stopPropagation()}>
          <button className="icon-button" title="Zoom out" onClick={() => zoomBy(0.85)}><Minus size={14} /></button>
          <button className="zoom-value" title="Reset zoom" onClick={fitView}>{Math.round(view.zoom * 100)}%</button>
          <button className="icon-button" title="Zoom in" onClick={() => zoomBy(1.18)}><Plus size={14} /></button>
          <button className="icon-button" title="Fit output" onClick={fitView}><Maximize2 size={14} /></button>
        </div>
      )}
    </div>
  );
}
