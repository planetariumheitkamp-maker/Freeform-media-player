import { useEffect, useRef } from 'react';
import type { PointerEvent } from 'react';
import { runtime } from '../lib/runtime';

const directions = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as const;

/** Keeps editing-window sizing available on Windows without re-creating media. */
export function WindowResizeHandles() {
  const activePointer = useRef<number | null>(null);
  const requests = useRef<Promise<unknown>>(Promise.resolve());
  const enqueue = (request: () => Promise<unknown>) => {
    requests.current = requests.current.then(request, request).catch(() => undefined);
  };

  const finish = () => {
    if (activePointer.current === null) return;
    activePointer.current = null;
    enqueue(() => runtime.endWindowResize());
  };

  useEffect(() => () => {
    if (activePointer.current === null) return;
    activePointer.current = null;
    enqueue(() => runtime.endWindowResize());
  }, []);

  const start = (event: PointerEvent<HTMLDivElement>, direction: string) => {
    if (event.button !== 0 || activePointer.current !== null) return;
    event.preventDefault();
    event.stopPropagation();
    activePointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    enqueue(() => runtime.beginWindowResize(direction, { x: event.screenX, y: event.screenY }));
  };

  return (
    <>
      {directions.map((direction) => (
        <div
          key={direction}
          aria-hidden="true"
          className={`window-resize-handle window-resize-${direction}`}
          data-window-resize={direction}
          onPointerDown={(event) => start(event, direction)}
          onPointerMove={(event) => {
            if (activePointer.current !== event.pointerId) return;
            event.preventDefault();
            enqueue(() => runtime.updateWindowResize({ x: event.screenX, y: event.screenY }));
          }}
          onPointerUp={finish}
          onPointerCancel={finish}
          onLostPointerCapture={finish}
        />
      ))}
    </>
  );
}
