import { describe, it, expect } from 'vitest';
import { formatFileSize, formatTime, getFileIcon } from './utils';

describe('getFileIcon', () => {
  it('devuelve IMG para imágenes', () => {
    expect(getFileIcon('image/png')).toBe('IMG');
    expect(getFileIcon('image/jpeg')).toBe('IMG');
  });

  it('devuelve PDF para PDF', () => {
    expect(getFileIcon('application/pdf')).toBe('PDF');
  });

  it('devuelve TXT para textos', () => {
    expect(getFileIcon('text/plain')).toBe('TXT');
    expect(getFileIcon('text/markdown')).toBe('TXT');
  });

  it('devuelve AUD para audios', () => {
    expect(getFileIcon('audio/mpeg')).toBe('AUD');
  });

  it('devuelve FILE para cualquier otro tipo', () => {
    expect(getFileIcon('application/octet-stream')).toBe('FILE');
    expect(getFileIcon('')).toBe('FILE');
  });
});

describe('formatFileSize', () => {
  it('formatea bytes en B', () => {
    expect(formatFileSize(0)).toBe('0 B');
    expect(formatFileSize(500)).toBe('500 B');
    expect(formatFileSize(1023)).toBe('1023 B');
  });

  it('formatea en KB', () => {
    expect(formatFileSize(1024)).toBe('1.0 KB');
    expect(formatFileSize(1536)).toBe('1.5 KB');
    expect(formatFileSize(1024 * 1024 - 1)).toBe('1024.0 KB');
  });

  it('formatea en MB', () => {
    expect(formatFileSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
    expect(formatFileSize(1024 * 1024 * 1024)).toBe('1024.0 MB');
  });
});

describe('formatTime', () => {
  it('formatea timestamp incluyendo hora y minuto', () => {
    const ts = new Date('2026-11-01T14:30:00').getTime();
    const formatted = formatTime(ts);
    // toLocaleTimeString depende del locale del sistema; solo exigimos hh:mm
    expect(formatted).toMatch(/\d{1,2}:\d{2}/);
  });
});
