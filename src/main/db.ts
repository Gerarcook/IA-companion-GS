import { app } from 'electron';
import path from 'node:path'; // <--- VERIFICAR ESTO
import initSqlJs, { Database } from 'sql.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const dbPath = path.join(app.getPath('userData'), 'clawgs-wc.sqlite');
let db: Database | null = null;

export async function initDb(): Promise<void> {
  const dir = path.dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs({
    locateFile: () => path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
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

  setInterval(() => persist(), 2000);
  app.on('quit', persist);
}

function persist() {
  if (!db) return;
  const data = db.export();
  writeFileSync(dbPath, Buffer.from(data));
}

export function setSetting(key: string, value: string): void {
  if (!db) return;
  db.run('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)', [key, value]);
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
}

// TTS Provider settings
export function setTtsProviderConfig(providerId: string, config: Record<string, any>): void {
  if (!db) return;
  db.run(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    [`tts_provider_${providerId}`, JSON.stringify(config)]
  );
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
}

export function getActiveTtsProvider(): string | null {
  return getSetting('active_tts_provider');
}

export function deleteTtsProviderConfig(providerId: string): void {
  if (!db) return;
  db.run('DELETE FROM settings WHERE key = ?', [`tts_provider_${providerId}`]);
}