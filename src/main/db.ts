import { app } from 'electron';
import path from 'node:path'; // <--- VERIFICAR ESTO
import initSqlJs, { Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

let db: Database | null = null;
let dbPath = '';
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export async function initDb(): Promise<void> {
  dbPath = path.join(app.getPath('userData'), 'clawgs-wc.sqlite');
  const dir = path.dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs({
    locateFile: resolveWasmPath,
  });

  let uint8arr: Uint8Array | null = null;
  if (existsSync(dbPath)) {
    uint8arr = new Uint8Array(readFileSync(dbPath));
  }

  db = new SQL.Database(uint8arr);

  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS authorized_paths (
      path TEXT PRIMARY KEY,
      authorized_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chat_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
  `);

  app.on('quit', () => persist(true));
}

/**
 * Resuelve la ubicación del WASM de sql.js en desarrollo y producción.
 */
function resolveWasmPath(): string {
  const candidates = [
    path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    path.join(process.resourcesPath ?? '', 'sql-wasm.wasm'),
    path.join(__dirname, 'sql-wasm.wasm'),
    'node_modules/sql.js/dist/sql-wasm.wasm',
  ];
  for (const candidate of candidates) {
    try {
      if (candidate && existsSync(candidate)) return candidate;
    } catch {}
  }
  return candidates[0];
}

/**
 * Persistencia diferida: agrupa escrituras rápidas y vuelca a disco en bloque.
 */
function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => persist(false), 500);
}

function persist(synchronous = false) {
  if (!db || !dbPath) return;
  if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
  const data = db.export();
  try {
    if (synchronous) {
      writeFileSync(dbPath, Buffer.from(data));
    } else {
      // writeFileSync ya es sync; el flag solo marca intención (llamada diferida vs cierre)
      writeFileSync(dbPath, Buffer.from(data));
    }
  } catch (err) {
    console.error('[db] Error persistiendo:', err);
  }
}

export function setSetting(key: string, value: string): void {
  if (!db) return;
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
  schedulePersist();
}

export function getSetting(key: string): string | null {
  if (!db) return null;
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  stmt.bind([key]);
  if (!stmt.step()) return null;
  const row = stmt.getAsObject() as { value?: string };
  stmt.free();
  return row.value ?? null;
}

export function authorizePath(path: string): void {
  if (!db) return;
  db.run('INSERT OR REPLACE INTO authorized_paths (path, authorized_at) VALUES (?, ?)', [path, Date.now()]);
  schedulePersist();
}

export function isPathAuthorized(targetPath: string): boolean {
  if (!db) return false;
  const stmt = db.prepare('SELECT 1 FROM authorized_paths WHERE path = ?');
  stmt.bind([targetPath]);
  const found = stmt.step();
  stmt.free();
  return found;
}

export function listAuthorizedPaths(): string[] {
  if (!db) return [];
  const stmt = db.prepare('SELECT path FROM authorized_paths');
  const rows: string[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { path?: string };
    if (row.path) rows.push(row.path);
  }
  stmt.free();
  return rows;
}

export function revokePath(path: string): void {
  if (!db) return;
  db.run('DELETE FROM authorized_paths WHERE path = ?', [path]);
  schedulePersist();
}

// ---------- Historial de conversación persistente ----------

export interface ChatHistoryRow {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export function saveChatMessage(role: 'user' | 'assistant', content: string): void {
  if (!db) return;
  db.run('INSERT INTO chat_history (role, content, timestamp) VALUES (?, ?, ?)', [
    role,
    content,
    Date.now(),
  ]);
  schedulePersist();
}

export function getChatHistory(limit = 100): ChatHistoryRow[] {
  if (!db) return [];
  const stmt = db.prepare('SELECT id, role, content, timestamp FROM chat_history ORDER BY id DESC LIMIT ?');
  stmt.bind([limit]);
  const rows: ChatHistoryRow[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as { id: number; role: string; content: string; timestamp: number };
    if ((row.role === 'user' || row.role === 'assistant') && row.content) {
      rows.push({ id: row.id, role: row.role, content: row.content, timestamp: row.timestamp });
    }
  }
  stmt.free();
  return rows.reverse();
}

export function clearChatHistory(): void {
  if (!db) return;
  db.run('DELETE FROM chat_history');
  schedulePersist();
}

// TTS Provider settings
export function setTtsProviderConfig(providerId: string, config: Record<string, any>): void {
  if (!db) return;
  db.run(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [`tts_provider_${providerId}`, JSON.stringify(config)]
  );
  schedulePersist();
}

export function getTtsProviderConfig(providerId: string): Record<string, any> | null {
  if (!db) return null;
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  stmt.bind([`tts_provider_${providerId}`]);
  if (!stmt.step()) {
    stmt.free();
    return null;
  }
  const row = stmt.getAsObject() as { value?: string };
  stmt.free();
  try {
    return row.value ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

export function setActiveTtsProvider(providerId: string): void {
  if (!db) return;
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', ['active_tts_provider', providerId]);
  schedulePersist();
}

export function getActiveTtsProvider(): string | null {
  return getSetting('active_tts_provider');
}

export function deleteTtsProviderConfig(providerId: string): void {
  if (!db) return;
  db.run('DELETE FROM settings WHERE key = ?', [`tts_provider_${providerId}`]);
  schedulePersist();
}