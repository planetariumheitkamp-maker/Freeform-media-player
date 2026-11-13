export interface PresentationDisplay {
  id: string | number;
  workArea: { x: number; y: number; width: number; height: number };
}

export interface PresentationBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function resolveWindowPlacement(
  input: (PresentationBounds & { displayId?: string }) | null | undefined,
  displays: PresentationDisplay[],
  currentBounds: PresentationBounds,
  minimumSize?: [number, number],
): (PresentationBounds & { displayId: string }) | null;

export function moveWindowBounds(
  bounds: PresentationBounds,
  cursorDelta: { x: number; y: number },
  scaleFactor?: number,
): PresentationBounds;

export const WINDOW_RESIZE_DIRECTIONS: Set<string>;

export function resizeWindowBounds(
  bounds: PresentationBounds,
  cursorDelta: { x: number; y: number },
  direction: string,
  minimumSize?: [number, number],
  maximumSize?: [number, number],
): PresentationBounds;
