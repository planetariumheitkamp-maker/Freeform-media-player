import { ChevronsLeft, ChevronsRight, Maximize2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Inspector } from './components/Inspector';
import { useMedia } from './components/MediaContext';
import { MediaLayer } from './components/MediaLayer';
import { PresentControls } from './components/PresentControls';
import { SourceRail } from './components/SourceRail';
import { Toasts } from './components/Toasts';
import { TopBar } from './components/TopBar';
import { TransportBar } from './components/TransportBar';
import { WarpWorkspace } from './components/WarpWorkspace';
import { WindowResizeHandles } from './components/WindowResizeHandles';
import { WorkspaceToolbar } from './components/WorkspaceToolbar';
import { GUIDE_TARGETS, useGuideTarget } from './lib/guideActions';
import { parseProject, reauthorizeProjectBackground, reauthorizeProjectFiles, serializePresentationProject, serializeProject } from './lib/project';
import { presentationTimeNeedsSync } from './lib/presentationMedia';
import { readRecoveryGenerations, recordDiagnostic, writeRecoveryGeneration } from './lib/recovery';
import { runtime } from './lib/runtime';
import { isPresentationWindow } from './lib/windowRole';
import { useWorkspace } from './store/useWorkspace';
import type { PresentationMediaState } from './types';

export default function App() {
  const presentation = useWorkspace((state) => state.presentation);
  const presentSettings = useWorkspace((state) => state.presentSettings);
  const selectedIds = useWorkspace((state) => state.selectedIds);
  const copyPlayers = useWorkspace((state) => state.copyPlayers);
  const pastePlayers = useWorkspace((state) => state.pastePlayers);
  const removePlayers = useWorkspace((state) => state.removePlayers);
  const setPresentation = useWorkspace((state) => state.setPresentation);
  const setTool = useWorkspace((state) => state.setTool);
  const showMesh = useWorkspace((state) => state.showMesh);
  const setShowMesh = useWorkspace((state) => state.setShowMesh);
  const loadProject = useWorkspace((state) => state.loadProject);
  const updateSource = useWorkspace((state) => state.updateSource);
  const setBackground = useWorkspace((state) => state.setBackground);
  const pushToast = useWorkspace((state) => state.pushToast);
  const { controlElements, setRemoteOutputActive } = useMedia();
  const [leftPanelMinimized, setLeftPanelMinimized] = useState(false);
  const [rightPanelMinimized, setRightPanelMinimized] = useState(false);
  const [controlsMinimized, setControlsMinimized] = useState(false);
  const [presentWindowOpen, setPresentWindowOpen] = useState(false);

  useGuideTarget(GUIDE_TARGETS, () => {
    setLeftPanelMinimized(false);
    setRightPanelMinimized(false);
    setControlsMinimized(false);
  });

  useEffect(() => {
    if (isPresentationWindow) return;
    const generations = readRecoveryGenerations(localStorage);
    let rejected = 0;
    for (const generation of generations) {
      try {
        const project = parseProject(generation.content);
        loadProject(project);
        void reauthorizeProjectFiles(project.sources, (paths) => runtime.authorizeMedia(paths)).then((updates) => {
          updates.forEach((patch, id) => updateSource(id, patch));
        });
        void reauthorizeProjectBackground(project.background, (paths) => runtime.authorizeMedia(paths)).then((background) => {
          setBackground(background, false);
        }).catch(() => {
          pushToast({ title: 'Grid image could not be restored', detail: 'Use Grid to import the image again.', tone: 'warning' });
        });
        if (rejected) pushToast({
          title: 'Recovered an earlier workspace snapshot',
          detail: `${rejected} newer ${rejected === 1 ? 'generation was' : 'generations were'} invalid. Generation ${generation.generation || 'legacy'} was restored.`,
          tone: 'warning',
        });
        return;
      } catch (error) {
        rejected += 1;
        recordDiagnostic(localStorage, 'warning', 'Recovery generation rejected', error instanceof Error ? error.message : undefined);
      }
    }
    if (generations.length) pushToast({ title: 'No valid recovery snapshot was found', detail: 'A fresh workspace was opened instead.', tone: 'warning' });
  }, [loadProject, pushToast, setBackground, updateSource]);

  useEffect(() => {
    if (!isPresentationWindow) return;
    let cancelled = false;
    let receivedUpdate = false;
    const applyProject = (content: string, initial = false) => {
      if (cancelled) return;
      try {
        const project = parseProject(content);
        useWorkspace.getState().loadProject(project, { preserveRuntime: true, presentation: true });
        if (initial) useWorkspace.getState().setPresentation(true);
      } catch (error) {
        recordDiagnostic(localStorage, 'error', 'Present workspace sync rejected', error instanceof Error ? error.message : undefined);
      }
    };
    const unsubscribe = runtime.onPresentationProject((content) => {
      receivedUpdate = true;
      applyProject(content);
    });
    void runtime.getPresentationProject().then((content) => {
      if (content && !receivedUpdate) applyProject(content, true);
      else if (content) useWorkspace.getState().setPresentation(true);
    }).catch((error) => {
      recordDiagnostic(localStorage, 'error', 'Present workspace could not be opened', error instanceof Error ? error.message : undefined);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (isPresentationWindow) return;
    let timer = 0;
    const unsubscribe = useWorkspace.subscribe((state, previous) => {
      if (state.players === previous.players && state.sources === previous.sources
        && state.groups === previous.groups && state.projectName === previous.projectName
        && state.background === previous.background && state.backgroundColor === previous.backgroundColor
        && state.gridGeometry === previous.gridGeometry
        && state.gridSnapping === previous.gridSnapping
        && state.outputSize === previous.outputSize && state.outputOpacity === previous.outputOpacity
        && state.renderQuality === previous.renderQuality
        && state.traceSettings === previous.traceSettings
        && state.planetariumSettings === previous.planetariumSettings
        && state.presentSettings === previous.presentSettings) return;
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        try {
          writeRecoveryGeneration(localStorage, serializeProject(useWorkspace.getState()));
        } catch (error) {
          recordDiagnostic(localStorage, 'warning', 'Autosave could not be written', error instanceof Error ? error.message : undefined);
        }
      }, 700);
    });
    return () => {
      window.clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isPresentationWindow || !runtime.isDesktop) return;
    return runtime.onPresentationMedia((states) => {
      states.forEach((state) => {
        const element = controlElements.current.get(state.playerId);
        if (!element) return;
        if (Math.abs(element.playbackRate - state.rate) > 0.001) element.playbackRate = state.rate;
        if (element.readyState >= HTMLMediaElement.HAVE_METADATA
          && Number.isFinite(element.duration)
          && presentationTimeNeedsSync(element.currentTime, state.currentTime, state.paused)) {
          element.currentTime = Math.max(0, Math.min(state.currentTime, element.duration || state.currentTime));
        }
        if (state.paused) element.pause();
        else void element.play().catch(() => undefined);
      });
    });
  }, [controlElements]);

  useEffect(() => {
    setRemoteOutputActive(presentWindowOpen);
    return () => setRemoteOutputActive(false);
  }, [presentWindowOpen, setRemoteOutputActive]);

  useEffect(() => {
    if (!presentWindowOpen || isPresentationWindow) return;
    let projectFrame = 0;
    let mediaFrame = 0;
    let lastMediaSync = 0;
    const unsubscribe = useWorkspace.subscribe(() => {
      if (projectFrame) return;
      projectFrame = requestAnimationFrame(() => {
        projectFrame = 0;
        void runtime.syncPresentation(serializePresentationProject(useWorkspace.getState())).catch(() => undefined);
      });
    });
    void runtime.syncPresentation(serializePresentationProject(useWorkspace.getState())).catch(() => undefined);
    const syncMedia = (now: number) => {
      if (now - lastMediaSync >= 150) {
        lastMediaSync = now;
        const states: PresentationMediaState[] = [];
        controlElements.current.forEach((element, playerId) => {
          states.push({
            playerId,
            currentTime: element.currentTime,
            paused: element.paused,
            rate: element.playbackRate,
          });
        });
        void runtime.syncPresentationMedia(states).catch(() => undefined);
      }
      mediaFrame = requestAnimationFrame(syncMedia);
    };
    mediaFrame = requestAnimationFrame(syncMedia);
    return () => {
      unsubscribe();
      cancelAnimationFrame(projectFrame);
      cancelAnimationFrame(mediaFrame);
    };
  }, [controlElements, presentWindowOpen]);

  useEffect(() => {
    const handleError = (event: ErrorEvent) => recordDiagnostic(localStorage, 'error', event.message, event.error?.stack);
    const handleRejection = (event: PromiseRejectionEvent) => recordDiagnostic(
      localStorage, 'error', 'Unhandled promise rejection',
      event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason),
    );
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const exitPresentation = useCallback(() => {
    if (isPresentationWindow) {
      void runtime.closePresentation().catch(() => undefined);
      return;
    }
    if (runtime.isDesktop) {
      setPresentWindowOpen(false);
      void runtime.closePresentation().catch(() => undefined);
      return;
    }
    setPresentation(false);
    void runtime.setFullscreen(false).catch(() => undefined);
  }, [setPresentation]);

  useEffect(() => {
    if (isPresentationWindow || !runtime.isDesktop) return;
    return runtime.onPresentationClosed(() => setPresentWindowOpen(false));
  }, []);

  const enterPresentation = useCallback(() => {
    if (isPresentationWindow) return;
    void (async () => {
      const settings = useWorkspace.getState().presentSettings;
      let nativeWarning: string | undefined;
      if (runtime.isDesktop) {
        if (presentWindowOpen) return;
        if (settings.layoutLocked) {
          // Restore the saved geometry in the editor before synchronizing the
          // separate output, without switching this window into Present mode.
          setPresentation(true);
          setPresentation(false);
        }
        try {
          await runtime.openPresentation(serializePresentationProject(useWorkspace.getState()));
          setPresentWindowOpen(true);
          setLeftPanelMinimized(false);
          setRightPanelMinimized(false);
          setControlsMinimized(false);
        } catch (error) {
          pushToast({
            title: 'Present window could not be opened',
            detail: error instanceof Error ? error.message : 'The output window is unavailable.',
            tone: 'error',
          });
          return;
        }
        if (settings.windowPlacement) {
          try {
            await runtime.setWindowPlacement(settings.windowPlacement);
          } catch (error) {
            nativeWarning = error instanceof Error ? error.message : 'The saved output position could not be restored.';
          }
        }
        try {
          await runtime.setWindowLocked(settings.layoutLocked);
          await runtime.setTransparency(settings.transparency);
        } catch (error) {
          nativeWarning = error instanceof Error ? error.message : 'Some native Present settings are unavailable.';
        }
      } else {
        setPresentation(true);
      }
      try {
        await runtime.setFullscreen(true);
      } catch {
        pushToast({ title: 'Presentation is windowed', detail: 'The operating system did not grant fullscreen.', tone: 'info' });
      }
      if (nativeWarning) pushToast({ title: 'Present restored with a window fallback', detail: nativeWarning, tone: 'warning' });
    })();
  }, [presentWindowOpen, pushToast, setPresentation]);

  useEffect(() => {
    const transparent = isPresentationWindow && presentation && presentSettings.transparency;
    document.documentElement.classList.toggle('present-transparent-native', transparent);
    return () => document.documentElement.classList.remove('present-transparent-native');
  }, [presentation, presentSettings.transparency]);

  useEffect(() => {
    if (runtime.isDesktop) return;
    const handleFullscreen = () => {
      if (!document.fullscreenElement && useWorkspace.getState().presentation) exitPresentation();
    };
    document.addEventListener('fullscreenchange', handleFullscreen);
    return () => document.removeEventListener('fullscreenchange', handleFullscreen);
  }, [exitPresentation]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const editing = target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === 'Escape') {
        if (document.querySelector('.dialog-backdrop')) return;
        setTool('select');
        setControlsMinimized(false);
        if (isPresentationWindow || presentWindowOpen || useWorkspace.getState().presentation) exitPresentation();
        return;
      }
      if (isPresentationWindow || editing) return;
      const key = event.key.toLowerCase();
      if (event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && key === 'f') {
        event.preventDefault();
        setControlsMinimized((value) => !value);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        if (key === 'z' || key === 'y') {
          event.preventDefault();
          if (key === 'y' || event.shiftKey) useWorkspace.getState().redo();
          else useWorkspace.getState().undo();
          return;
        }
        if (key === 'c') {
          event.preventDefault();
          const count = copyPlayers(selectedIds);
          pushToast(count > 0 ? {
            title: `${count} ${count === 1 ? 'player' : 'players'} copied`,
            detail: 'Press Ctrl+V to paste.',
            tone: 'success',
          } : {
            title: 'No players selected',
            detail: 'Select one or more players to copy.',
            tone: 'warning',
          });
          return;
        }
        if (key === 'v') {
          event.preventDefault();
          const count = pastePlayers();
          pushToast(count > 0 ? {
            title: `${count} ${count === 1 ? 'player' : 'players'} pasted`,
            detail: 'The pasted players are now selected.',
            tone: 'success',
          } : {
            title: 'Clipboard is empty',
            detail: 'Copy one or more players first.',
            tone: 'info',
          });
          return;
        }
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedIds.length) {
        event.preventDefault();
        removePlayers(selectedIds);
      } else if (key === 'm') {
        setShowMesh(!showMesh);
      } else if (key === 'v') {
        setTool('select');
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [copyPlayers, exitPresentation, pastePlayers, presentWindowOpen, pushToast, removePlayers, selectedIds, setShowMesh, setTool, showMesh]);

  const presenting = presentation || isPresentationWindow;
  const panelsHidden = presenting || controlsMinimized;
  return (
    <div className={`app-shell${presenting ? ' is-presenting' : ''}${isPresentationWindow && presentSettings.transparency ? ' is-present-transparent' : ''}${controlsMinimized ? ' is-focus-mode' : ''}`} data-window-role={isPresentationWindow ? 'present' : 'editor'}>
      <MediaLayer />
      {!panelsHidden && <TopBar onMinimizeAll={() => setControlsMinimized(true)} onPresent={enterPresentation} />}
      <div className={`app-body${leftPanelMinimized ? ' left-panel-minimized' : ''}${rightPanelMinimized ? ' right-panel-minimized' : ''}${controlsMinimized ? ' controls-minimized' : ''}`}>
        {!panelsHidden && !leftPanelMinimized && <SourceRail onMinimize={() => setLeftPanelMinimized(true)} />}
        {!panelsHidden && leftPanelMinimized && (
          <button className="panel-restore panel-restore-left" title="Restore sources and players panel" aria-label="Restore sources and players panel" onClick={() => setLeftPanelMinimized(false)}><ChevronsRight size={16} /></button>
        )}
        <main className="workspace-column">
          {!panelsHidden && <WorkspaceToolbar />}
          <WarpWorkspace />
          {!panelsHidden && <TransportBar />}
        </main>
        {!panelsHidden && !rightPanelMinimized && <Inspector onMinimize={() => setRightPanelMinimized(true)} />}
        {!panelsHidden && rightPanelMinimized && (
          <button className="panel-restore panel-restore-right" title="Restore inspector panel" aria-label="Restore inspector panel" onClick={() => setRightPanelMinimized(false)}><ChevronsLeft size={16} /></button>
        )}
      </div>
      {controlsMinimized && !presenting && <button className="restore-controls button" aria-label="Show control panels" title="Show control panels (Shift+F or Esc)" onClick={() => setControlsMinimized(false)}><Maximize2 size={14} />Show control panels <kbd>Shift+F</kbd></button>}
      {!isPresentationWindow && (presentWindowOpen || presentation) && <PresentControls onExit={exitPresentation} />}
      {isPresentationWindow && runtime.isDesktop && runtime.platform === 'win32' && <WindowResizeHandles />}
      <Toasts />
    </div>
  );
}
