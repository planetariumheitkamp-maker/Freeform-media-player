import {
  GripHorizontal,
  Library,
  Lock,
  Minimize2,
  Monitor,
  MoveDiagonal2,
  Pin,
  PinOff,
  RotateCcw,
  SlidersHorizontal,
  Sparkles,
  Unlock,
  Users,
  X,
} from 'lucide-react';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { runtime } from '../lib/runtime';
import { useWorkspace } from '../store/useWorkspace';
import { SourceRail } from './SourceRail';

const HIDE_DELAY = 4200;
const DEFAULT_POSITION = { x: 16, y: 16 };
const MIN_PANEL_WIDTH = 304;
const MAX_PANEL_WIDTH = 720;
const MIN_PANEL_HEIGHT = 220;
type PresentTab = 'present' | 'players' | 'media';
type PanelSize = { width: number; height: number | null };
const DEFAULT_SIZE: PanelSize = { width: 384, height: null };

export function PresentControls({ onExit }: { onExit: () => void }) {
  const settings = useWorkspace((state) => state.presentSettings);
  const setPresentSettings = useWorkspace((state) => state.setPresentSettings);
  const lockPresentLayout = useWorkspace((state) => state.lockPresentLayout);
  const pushToast = useWorkspace((state) => state.pushToast);
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [activeTab, setActiveTab] = useState<PresentTab>('present');
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const [size, setSize] = useState<PanelSize>(DEFAULT_SIZE);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const hideTimer = useRef(0);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originWidth: number;
    originHeight: number;
  } | null>(null);

  const scheduleHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const focusInside = Boolean(panelRef.current?.contains(document.activeElement));
      const dialogOpen = Boolean(document.querySelector('.dialog-backdrop'));
      const panelHovered = Boolean(panelRef.current?.matches(':hover'));
      if (!pinned && !dragRef.current && !resizeRef.current && !focusInside && !dialogOpen && !panelHovered) setOpen(false);
    }, HIDE_DELAY);
  }, [pinned]);

  useEffect(() => () => window.clearTimeout(hideTimer.current), []);

  useEffect(() => {
    if (!open) return;
    scheduleHide();
    const handlePointerMove = () => scheduleHide();
    window.addEventListener('pointermove', handlePointerMove);
    return () => {
      window.clearTimeout(hideTimer.current);
      window.removeEventListener('pointermove', handlePointerMove);
    };
  }, [open, scheduleHide]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key.toLowerCase() !== 'h' || event.ctrlKey || event.metaKey || event.altKey
        || target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      event.preventDefault();
      setOpen((value) => !value);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  const clampPosition = useCallback((x: number, y: number) => {
    const bounds = rootRef.current?.getBoundingClientRect();
    const width = bounds?.width ?? 384;
    const height = bounds?.height ?? 600;
    return {
      x: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    };
  }, []);

  const getMaxPanelHeight = useCallback(
    () => Math.max(MIN_PANEL_HEIGHT, window.innerHeight - position.y - 44),
    [position.y],
  );

  const clampSize = useCallback((width: number, height: number): PanelSize => ({
    width: Math.round(Math.max(MIN_PANEL_WIDTH, Math.min(
      width,
      MAX_PANEL_WIDTH,
      window.innerWidth - position.x - 8,
    ))),
    height: Math.round(Math.max(MIN_PANEL_HEIGHT, Math.min(height, getMaxPanelHeight()))),
  }), [getMaxPanelHeight, position.x]);

  useEffect(() => {
    const handleViewportResize = () => setPosition((current) => clampPosition(current.x, current.y));
    window.addEventListener('resize', handleViewportResize);
    return () => window.removeEventListener('resize', handleViewportResize);
  }, [clampPosition]);

  const handleDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('button, input, select, textarea')) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setPosition(clampPosition(
      drag.originX + event.clientX - drag.startX,
      drag.originY + event.clientY - drag.startY,
    ));
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    scheduleHide();
  };

  const handleResizeStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const bounds = panelRef.current?.getBoundingClientRect();
    if (event.button !== 0 || !bounds) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    resizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originWidth: bounds.width,
      originHeight: bounds.height,
    };
    setSize({ width: bounds.width, height: bounds.height });
  };

  const handleResizeMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const resize = resizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    event.preventDefault();
    setSize(clampSize(
      resize.originWidth + event.clientX - resize.startX,
      resize.originHeight + event.clientY - resize.startY,
    ));
  };

  const handleResizeEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (resizeRef.current?.pointerId !== event.pointerId) return;
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    scheduleHide();
  };

  const handleResizeKey = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Home') {
      event.preventDefault();
      event.stopPropagation();
      setSize(DEFAULT_SIZE);
      return;
    }
    const directions: Record<string, { x: number; y: number }> = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    };
    const direction = directions[event.key];
    const bounds = panelRef.current?.getBoundingClientRect();
    if (!direction || !bounds) return;
    event.preventDefault();
    event.stopPropagation();
    const step = event.shiftKey ? 32 : 16;
    setSize(clampSize(bounds.width + direction.x * step, bounds.height + direction.y * step));
  };

  const toggleLock = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (settings.layoutLocked) {
        setPresentSettings({ layoutLocked: false });
        await runtime.setWindowLocked(false);
      } else {
        const placement = runtime.isDesktop ? await runtime.getWindowPlacement() : null;
        lockPresentLayout(placement);
        await runtime.setWindowLocked(true);
      }
    } catch (error) {
      setPresentSettings({ layoutLocked: false });
      pushToast({
        title: 'Window lock is unavailable',
        detail: error instanceof Error ? error.message : 'The player layout was left unlocked.',
        tone: 'warning',
      });
    } finally {
      setBusy(false);
      scheduleHide();
    }
  };

  const toggleTransparency = async () => {
    if (!runtime.isDesktop || busy) return;
    const next = !settings.transparency;
    setBusy(true);
    try {
      await runtime.setTransparency(next);
      setPresentSettings({ transparency: next });
    } catch (error) {
      pushToast({
        title: 'Transparency could not be changed',
        detail: error instanceof Error ? error.message : 'Use the Freeform Windows desktop app.',
        tone: 'error',
      });
    } finally {
      setBusy(false);
      scheduleHide();
    }
  };

  const selectTab = (tab: PresentTab) => {
    setActiveTab(tab);
    scheduleHide();
  };

  return (
    <div
      ref={rootRef}
      className={`present-controls${open ? ' is-open' : ''}${pinned ? ' is-pinned' : ''}`}
      style={{ left: position.x, top: position.y, width: size.width }}
      data-active-tab={activeTab}
    >
      <button
        className="present-controls-reveal"
        aria-label="Present controls"
        aria-expanded={open}
        aria-controls="present-control-panel"
        title="Present controls (H)"
        onClick={() => setOpen((value) => !value)}
      >
        <SlidersHorizontal size={14} />
        <span>Present controls</span>
        <kbd>H</kbd>
      </button>

      {open && (
        <section
          ref={panelRef}
          id="present-control-panel"
          className={`present-control-panel${size.height === null ? '' : ' is-custom-sized'}`}
          style={{ height: size.height ?? 'auto', maxHeight: getMaxPanelHeight() }}
          aria-label="Present mode controls"
          onPointerMove={scheduleHide}
          onPointerLeave={scheduleHide}
          onFocus={scheduleHide}
        >
          <div
            className="present-control-heading"
            title="Drag to move the floating Present window"
            onPointerDown={handleDragStart}
            onPointerMove={handleDragMove}
            onPointerUp={handleDragEnd}
            onPointerCancel={handleDragEnd}
          >
            <span><GripHorizontal size={13} /><i />PRESENT / LIVE</span>
            <div className="present-window-actions">
              <button
                className="icon-button"
                aria-label="Keep Present controls open"
                aria-pressed={pinned}
                title={pinned ? 'Allow Present controls to auto-hide' : 'Keep Present controls open'}
                onClick={() => setPinned((value) => !value)}
              >{pinned ? <PinOff size={14} /> : <Pin size={14} />}</button>
              <button
                className="icon-button"
                aria-label="Reset Present panel position"
                title="Return the floating window to the left side"
                onClick={() => setPosition(DEFAULT_POSITION)}
              ><RotateCcw size={13} /></button>
              <button className="icon-button" aria-label="Hide Present controls" title="Hide controls (H)" onClick={() => setOpen(false)}><X size={14} /></button>
            </div>
          </div>

          <div className="present-panel-tabs" role="group" aria-label="Present panel sections">
            <button className={activeTab === 'present' ? 'is-active' : ''} aria-pressed={activeTab === 'present'} onClick={() => selectTab('present')}><SlidersHorizontal size={13} />Present</button>
            <button className={activeTab === 'players' ? 'is-active' : ''} aria-pressed={activeTab === 'players'} onClick={() => selectTab('players')}><Users size={13} />Players</button>
            <button className={activeTab === 'media' ? 'is-active' : ''} aria-pressed={activeTab === 'media'} onClick={() => selectTab('media')}><Library size={13} />Media</button>
          </div>

          {activeTab === 'present' ? (
            <div className="present-settings-view">
              <div className="present-primary-controls">
                <button
                  className={`present-toggle${settings.layoutLocked ? ' is-active' : ''}`}
                  aria-pressed={settings.layoutLocked}
                  disabled={busy}
                  title="Save this geometry and app window, restore them on entry, and prevent Present dragging"
                  onClick={() => void toggleLock()}
                >
                  {settings.layoutLocked ? <Lock size={15} /> : <Unlock size={15} />}
                  <span>Layout + window<small>{settings.layoutLocked ? 'Locked' : 'Unlocked'}</small></span>
                </button>

                <button
                  className={`present-toggle${settings.transparency ? ' is-active' : ''}`}
                  aria-pressed={settings.transparency}
                  disabled={!runtime.isDesktop || busy}
                  title={runtime.isDesktop ? 'Reveal the actual desktop and windows behind Freeform' : 'True transparency is available in the Windows desktop app'}
                  onClick={() => void toggleTransparency()}
                >
                  <Monitor size={15} />
                  <span>Transparent background<small>{runtime.isDesktop ? (settings.transparency ? 'Desktop visible' : 'Opaque') : 'Desktop app only'}</small></span>
                </button>

                <button
                  className={`present-toggle${settings.ambient.enabled ? ' is-active' : ''}`}
                  aria-pressed={settings.ambient.enabled}
                  onClick={() => {
                    setPresentSettings({ ambient: { enabled: !settings.ambient.enabled } });
                    scheduleHide();
                  }}
                >
                  <Sparkles size={15} />
                  <span>Ambient lighting<small>{settings.ambient.enabled ? 'Enabled' : 'Disabled'}</small></span>
                </button>

                <button className="present-exit" onClick={onExit}><Minimize2 size={15} /><span>Exit</span><kbd>ESC</kbd></button>
              </div>

              {settings.ambient.enabled && (
                <div className="ambient-controls">
                  <div className="ambient-style" role="group" aria-label="Ambient color mode">
                    <button aria-pressed={settings.ambient.style === 'edge'} className={settings.ambient.style === 'edge' ? 'is-active' : ''} onClick={() => setPresentSettings({ ambient: { style: 'edge' } })}>Edge matched</button>
                    <button aria-pressed={settings.ambient.style === 'average'} className={settings.ambient.style === 'average' ? 'is-active' : ''} onClick={() => setPresentSettings({ ambient: { style: 'average' } })}>Average color</button>
                  </div>
                  <label className="ambient-range">
                    <span>Intensity <output>{Math.round(settings.ambient.intensity * 100)}%</output></span>
                    <input aria-label="Ambient intensity" type="range" min="0" max="2" step="0.05" value={settings.ambient.intensity} onChange={(event) => setPresentSettings({ ambient: { intensity: Number(event.target.value) } })} />
                  </label>
                  <label className="ambient-range">
                    <span>Spread <output>{Math.round(settings.ambient.spread)} px</output></span>
                    <input aria-label="Ambient spread" type="range" min="0" max="160" step="1" value={settings.ambient.spread} onChange={(event) => setPresentSettings({ ambient: { spread: Number(event.target.value) } })} />
                  </label>
                  <label className="ambient-range">
                    <span>Smoothing <output>{Math.round(settings.ambient.smoothing * 100)}%</output></span>
                    <input aria-label="Ambient smoothing" type="range" min="0" max="0.95" step="0.01" value={settings.ambient.smoothing} onChange={(event) => setPresentSettings({ ambient: { smoothing: Number(event.target.value) } })} />
                  </label>
                </div>
              )}
              <div className="present-control-status" aria-live="polite">
                {settings.layoutLocked
                  ? 'Saved geometry and window restore each time Present starts. Media changes remain available.'
                  : 'Drag players to position them. Lock to keep this arrangement.'}
              </div>
            </div>
          ) : (
            <div className={`present-source-browser is-${activeTab}`} data-library-view={activeTab}>
              <SourceRail onMinimize={() => setOpen(false)} />
            </div>
          )}

          <button
            type="button"
            className="present-resize-handle"
            aria-label="Resize Present controls"
            aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home"
            title="Drag to resize · Arrow keys adjust · Double-click or Home restores default size"
            onPointerDown={handleResizeStart}
            onPointerMove={handleResizeMove}
            onPointerUp={handleResizeEnd}
            onPointerCancel={handleResizeEnd}
            onKeyDown={handleResizeKey}
            onDoubleClick={() => setSize(DEFAULT_SIZE)}
          ><MoveDiagonal2 size={12} strokeWidth={1.6} /></button>
        </section>
      )}
    </div>
  );
}
