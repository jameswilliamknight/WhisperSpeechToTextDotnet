export function timestamp(seconds?: number): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '—'
  const value = Math.max(0, Math.floor(seconds))
  const hours = Math.floor(value / 3600)
  const minutes = Math.floor(value / 60) % 60
  const remainder = String(value % 60).padStart(2, '0')
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}` : `${minutes}:${remainder}`
}

export function bytesLabel(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '—'
  return bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(2)} GiB` : `${(bytes / 1024 ** 2).toFixed(1)} MiB`
}

export function secondsLabel(seconds?: number): string {
  return seconds === undefined || !Number.isFinite(seconds) ? '—' : `${seconds.toFixed(1)} s`
}
