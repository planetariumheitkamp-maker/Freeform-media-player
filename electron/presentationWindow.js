function finite(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function overlapArea(bounds, area) {
  const width = Math.max(0, Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x));
  const height = Math.max(0, Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y));
  return width * height;
}

/** Select real native bounds when Windows reports an empty restore rectangle. */
export function selectNormalWindowBounds(...candidates) {
  const bounds = candidates.find((candidate) => ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(candidate?.[key]))
    && candidate.width > 0 && candidate.height > 0);
  return bounds ? { ...bounds } : null;
}

/**
 * Resolves saved window bounds against the currently connected monitors.
 * A missing monitor falls back to the display with the greatest current overlap.
 */
export function resolveWindowPlacement(input, displays, currentBounds, minimumSize = [1080, 700]) {
  if (!Array.isArray(displays) || !displays.length) return null;
  const safeCurrent = {
    x: finite(currentBounds?.x, 0),
    y: finite(currentBounds?.y, 0),
    width: Math.max(1, finite(currentBounds?.width, 1500)),
    height: Math.max(1, finite(currentBounds?.height, 950)),
  };
  const target = displays.find((display) => String(display.id) === String(input?.displayId))
    ?? [...displays].sort((a, b) => overlapArea(safeCurrent, b.workArea) - overlapArea(safeCurrent, a.workArea))[0];
  const area = target.workArea;
  const width = Math.round(clamp(
    finite(input?.width, safeCurrent.width),
    Math.min(minimumSize[0], area.width),
    area.width,
  ));
  const height = Math.round(clamp(
    finite(input?.height, safeCurrent.height),
    Math.min(minimumSize[1], area.height),
    area.height,
  ));
  return {
    x: Math.round(clamp(finite(input?.x, safeCurrent.x), area.x, area.x + area.width - width)),
    y: Math.round(clamp(finite(input?.y, safeCurrent.y), area.y, area.y + area.height - height)),
    width,
    height,
    displayId: String(target.id),
  };
}

function alignToNativePixel(value, scaleFactor) {
  const nearest = Math.round(value);
  if (!Number.isFinite(scaleFactor) || scaleFactor <= 0) return nearest;
  const isAligned = (candidate) => Math.abs(candidate * scaleFactor - Math.round(candidate * scaleFactor)) < 0.0001;
  for (let distance = 0; distance <= 8; distance += 1) {
    const candidates = distance === 0 ? [nearest] : [nearest - distance, nearest + distance];
    const aligned = candidates.filter(isAligned).sort((a, b) => Math.abs(a - value) - Math.abs(b - value));
    if (aligned.length) return aligned[0];
  }
  return nearest;
}

/** Move only the native window origin; media geometry and output size stay fixed. */
export function moveWindowBounds(bounds, cursorDelta, scaleFactor = 1) {
  // Fractional physical-pixel origins can make transparent Windows windows grow
  // by one DIP per setPosition call. Keep both axes on the native pixel grid.
  return {
    ...bounds,
    x: alignToNativePixel(finite(bounds?.x, 0) + finite(cursorDelta?.x, 0), scaleFactor),
    y: alignToNativePixel(finite(bounds?.y, 0) + finite(cursorDelta?.y, 0), scaleFactor),
  };
}

export const WINDOW_RESIZE_DIRECTIONS = new Set(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']);

/**
 * Resize from cursor deltas while keeping the opposite window edge anchored.
 * Electron cannot enable native sizing on some Windows transparent windows;
 * these bounds support equivalent in-app edge handles without a page reload.
 */
export function resizeWindowBounds(bounds, cursorDelta, direction, minimumSize = [1080, 700], maximumSize = [0, 0]) {
  if (!WINDOW_RESIZE_DIRECTIONS.has(direction)) return { ...bounds };
  const dx = finite(cursorDelta?.x, 0);
  const dy = finite(cursorDelta?.y, 0);
  const size = (value, axis) => Math.round(clamp(
    value,
    Math.max(1, finite(minimumSize?.[axis], 1)),
    finite(maximumSize?.[axis], 0) > 0 ? maximumSize[axis] : Number.MAX_SAFE_INTEGER,
  ));
  const width = size(bounds.width + (direction.includes('e') ? dx : direction.includes('w') ? -dx : 0), 0);
  const height = size(bounds.height + (direction.includes('s') ? dy : direction.includes('n') ? -dy : 0), 1);
  return {
    x: Math.round(bounds.x + (direction.includes('w') ? bounds.width - width : 0)),
    y: Math.round(bounds.y + (direction.includes('n') ? bounds.height - height : 0)),
    width,
    height,
  };
}
