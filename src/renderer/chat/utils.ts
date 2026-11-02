export interface AttachedFile {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
  path?: string;
}

/** Devuelve un icono corto según el tipo MIME del archivo adjunto. */
export function getFileIcon(type: string): string {
  if (type.startsWith('image/')) return 'IMG';
  if (type === 'application/pdf') return 'PDF';
  if (type.startsWith('text/')) return 'TXT';
  if (type.startsWith('audio/')) return 'AUD';
  return 'FILE';
}

/** Formatea una cantidad de bytes en una cadena legible (B / KB / MB). */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Formatea un timestamp de milisegundos a HH:MM. */
export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
