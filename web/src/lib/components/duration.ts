/** 8 s → "8s", 72 s → "1m 12s", 3,780 s → "1h 3m": the way Claude and Codex show working time. */
export function duration(ms: number) {
  const seconds = Math.floor(ms / 1_000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
