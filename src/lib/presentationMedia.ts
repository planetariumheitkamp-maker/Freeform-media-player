export function presentationTimeNeedsSync(currentTime: number, targetTime: number, paused: boolean): boolean {
  if (!Number.isFinite(currentTime) || !Number.isFinite(targetTime)) return false;
  // Playing copies need drift tolerance; paused copies must follow precise timeline seeks.
  return Math.abs(currentTime - targetTime) > (paused ? 0.02 : 0.35);
}
