export function formatTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds < 0) return '--:--';
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remainder = whole % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

export function sourceTypeLabel(kind: string): string {
  switch (kind) {
    case 'desktop': return 'LIVE CAPTURE';
    case 'provider': return 'PROVIDER CAPTURE';
    case 'device': return 'DEVICE';
    case 'stream': return 'NETWORK';
    case 'catalog': return 'CATALOG';
    case 'file': return 'LOCAL FILE';
    default: return 'TEST PATTERN';
  }
}
