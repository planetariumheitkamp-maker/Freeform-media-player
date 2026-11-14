import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { runtime } from '../lib/runtime';
import { isNativePresentationWindow } from '../lib/windowRole';

/** Moves the unlocked output without altering workspace geometry. */
export function WindowMoveSurface() {
  const activePointer = useRef<number | null>(null);
  const requests = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = (request: () => Promise<unknown>) => {
    requests.current = requests.current.then(request, request).catch(() => undefined);
  };

  const finish = () => {
    if (activePointer.current === null) return;
    activePointer.current = null;
    enqueue(() => runtime.endWindowMove());
  };

  useEffect(() => () => {
    if (activePointer.current === null) return;
    activePointer.current = null;
    enqueue(() => runtime.endWindowMove());
  }, []);

  if (isNativePresentationWindow) {
    return <div aria-hidden="true" className="window-move-surface is-native" data-window-move="surface" />;
  }

  const start = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || activePointer.current !== null) return;
    event.preventDefault();
    activePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    enqueue(() => runtime.beginWindowMove({ x: event.screenX, y: event.screenY }));
  };

  return (
    <div
      aria-hidden="true"
      className="window-move-surface"
      data-window-move="surface"
      onPointerDown={start}
      onPointerMove={(event) => {
        if (activePointer.current !== event.pointerId) return;
        event.preventDefault();
        enqueue(() => runtime.updateWindowMove({ x: event.screenX, y: event.screenY }));
      }}
      onPointerUp={finish}
      onPointerCancel={finish}
      onLostPointerCapture={finish}
    />
  );
}
