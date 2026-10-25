import { Pause, Play, Repeat2 } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { formatTime } from '../lib/format';
import { useWorkspace } from '../store/useWorkspace';
import type { Player } from '../types';
import { useMedia } from './MediaContext';

export function TransportBar() {
  const players = useWorkspace((state) => state.players);
  const sources = useWorkspace((state) => state.sources);
  const groups = useWorkspace((state) => state.groups);
  const activeId = useWorkspace((state) => state.activeId);
  const updatePlayer = useWorkspace((state) => state.updatePlayer);
  const presentation = useWorkspace((state) => state.presentation);
  const pushToast = useWorkspace((state) => state.pushToast);
  const { controlElements, version } = useMedia();
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [paused, setPaused] = useState(true);
  const [seeking, setSeeking] = useState(false);
  const active = players.find((player) => player.id === activeId);
  const source = sources.find((candidate) => candidate.id === active?.sourceId);
  const group = groups.find((candidate) => candidate.id === active?.groupId);
  const controllable = Boolean(active && source && !source.live && (source.mediaType === 'video' || source.mediaType === 'audio'));

  const targets = useCallback((): Player[] => {
    if (!active) return [];
    return group?.mode === 'transport'
      ? players.filter((player) => player.groupId === group.id)
      : [active];
  }, [active, group, players]);

  useEffect(() => {
    const read = () => {
      if (seeking) return;
      const element = activeId ? controlElements.current.get(activeId) : undefined;
      setTime(element?.currentTime ?? 0);
      setDuration(Number.isFinite(element?.duration) ? element?.duration ?? 0 : 0);
      setPaused(element?.paused ?? true);
    };
    read();
    const interval = window.setInterval(read, 200);
    return () => window.clearInterval(interval);
  }, [activeId, controlElements, seeking, version]);

  useEffect(() => {
    const synchronize = () => {
      groups.filter((item) => item.mode === 'transport').forEach((item) => {
        const members = players.filter((player) => player.groupId === item.id);
        const leader = members[0] ? controlElements.current.get(members[0].id) : undefined;
        if (!leader || !Number.isFinite(leader.duration)) return;
        members.slice(1).forEach((player) => {
          const follower = controlElements.current.get(player.id);
          if (!follower || follower.seeking || leader.seeking) return;
          if (Math.abs(follower.currentTime - leader.currentTime) > 0.22) {
            follower.currentTime = leader.currentTime;
          }
          if (Math.abs(follower.playbackRate - leader.playbackRate) > 0.001) {
            follower.playbackRate = leader.playbackRate;
          }
        });
      });
    };
    const interval = window.setInterval(synchronize, 1000);
    return () => window.clearInterval(interval);
  }, [controlElements, groups, players]);

  const togglePlayback = useCallback(() => {
    if (!controllable || !activeId) return;
    const leader = controlElements.current.get(activeId);
    const shouldPlay = leader?.paused ?? true;
    const selectedTargets = targets();
    if (shouldPlay && selectedTargets.length > 1 && leader) {
      selectedTargets.forEach((player) => {
        const element = controlElements.current.get(player.id);
        if (element && Math.abs(element.currentTime - leader.currentTime) > 0.22) {
          element.currentTime = leader.currentTime;
        }
      });
    }
    selectedTargets.forEach((player) => {
      const element = controlElements.current.get(player.id);
      if (!element) return;
      if (shouldPlay) {
        void element.play().catch(() => pushToast({
          title: 'Playback needs an explicit gesture',
          detail: 'Press Play again or check whether the source is still available.',
          tone: 'warning',
        }));
      } else element.pause();
      updatePlayer(player.id, { autoplay: false });
    });
  }, [activeId, controlElements, controllable, pushToast, targets, updatePlayer]);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (presentation || event.code !== 'Space' || target?.matches('input, textarea, select, button, [contenteditable="true"]')) return;
      event.preventDefault();
      togglePlayback();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [presentation, togglePlayback]);

  const seek = (value: number) => {
    setTime(value);
    targets().forEach((player) => {
      const element = controlElements.current.get(player.id);
      if (element && Number.isFinite(element.duration)) element.currentTime = value;
    });
  };

  const setRate = (rate: number) => {
    targets().forEach((player) => {
      updatePlayer(player.id, { rate });
      const element = controlElements.current.get(player.id);
      if (element) element.playbackRate = rate;
    });
  };

  const label = !active
    ? 'NO ACTIVE PLAYER'
    : source?.live
      ? 'LIVE INPUT / REAL-TIME'
      : source?.mediaType === 'image'
        ? 'STILL IMAGE / NO TIMELINE'
        : source?.mediaType === 'test'
          ? 'CALIBRATION / STATIC'
          : source?.connected === false
            ? 'SOURCE DISCONNECTED'
            : group?.mode === 'transport'
              ? `${group.name.toUpperCase()} / LINKED TRANSPORT`
              : 'INDEPENDENT TRANSPORT';

  return (
    <footer className="transport-bar">
      <div className="transport-context">
        <strong>{active?.name ?? 'Transport'}</strong>
        <span className={source?.live ? 'text-cyan' : ''}>{label}</span>
      </div>
      <div className="transport-main">
        <button className="play-button" disabled={!controllable} onClick={togglePlayback} title="Play / pause (Space)">
          {paused ? <Play size={17} fill="currentColor" /> : <Pause size={17} fill="currentColor" />}
        </button>
        <span className="timecode">{formatTime(time)}</span>
        <input
          className="timeline"
          type="range"
          min={0}
          max={duration || 0}
          step={0.01}
          value={Math.min(time, duration || 0)}
          disabled={!controllable || !duration}
          onPointerDown={() => setSeeking(true)}
          onPointerUp={() => setSeeking(false)}
          onPointerCancel={() => setSeeking(false)}
          onChange={(event) => seek(Number(event.target.value))}
          style={{ '--timeline-progress': `${duration ? Math.min(100, time / duration * 100) : 0}%` } as React.CSSProperties}
        />
        <span className="timecode duration">{formatTime(duration)}</span>
      </div>
      <div className="transport-options">
        <select aria-label="Playback rate" disabled={!controllable} value={active?.rate ?? 1} onChange={(event) => setRate(Number(event.target.value))}>
          {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 4].map((rate) => <option key={rate} value={rate}>{rate}×</option>)}
        </select>
        <button
          className={`icon-button ${active?.loop ? 'is-on' : ''}`}
          disabled={!controllable}
          title="Loop playback"
          onClick={() => active && updatePlayer(active.id, { loop: !active.loop })}
        ><Repeat2 size={16} /></button>
      </div>
    </footer>
  );
}
