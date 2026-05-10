/**
 * SQLite database implementation using better-sqlite3
 * Provides persistent storage for sessions, messages, and other data
 */

import Database from 'better-sqlite3';
import { app } from 'electron';
import { join } from 'path';
import { existsSync, mkdirSync, statSync, renameSync, openSync, readSync, closeSync } from 'fs';
import { log, logError, logWarn } from '../utils/logger';

export interface DatabaseInstance {
  // Raw database access (for advanced queries)
  raw: Database.Database;
  
  // Session operations
  sessions: {
    create: (session: SessionRow) => void;
    update: (id: string, updates: Partial<SessionRow>) => void;
    get: (id: string) => SessionRow | undefined;
    getAll: () => SessionRow[];
    delete: (id: string) => void;
  };
  
  // Message operations
  messages: {
    create: (message: MessageRow) => void;
    update: (id: string, updates: Partial<Pick<MessageRow, 'execution_time_ms'>>) => void;
    getBySessionId: (sessionId: string) => MessageRow[];
    delete: (id: string) => void;
    deleteBySessionId: (sessionId: string) => void;
  };

  traceSteps: {
    create: (step: TraceStepRow) => void;
    update: (id: string, updates: Partial<TraceStepRow>) => void;
    getBySessionId: (sessionId: string) => TraceStepRow[];
    deleteBySessionId: (sessionId: string) => void;
  };

  scheduledTasks: {
    create: (task: ScheduledTaskRow) => void;
    update: (id: string, updates: Partial<ScheduledTaskRow>) => void;
    get: (id: string) => ScheduledTaskRow | undefined;
    getAll: () => ScheduledTaskRow[];
    delete: (id: string) => void;
  };

  firefliesConfig: {
    save: (config: FirefliesConfigRow) => void;
    get: () => FirefliesConfigRow | undefined;
    delete: () => void;
  };

  firefliesTranscripts: {
    create: (transcript: FirefliesTranscriptRow) => void;
    getAll: () => FirefliesTranscriptRow[];
    delete: (id: string) => void;
    deleteAll: () => void;
  };

  // For compatibility with old interface
  prepare: (sql: string) => Database.Statement;
  exec: (sql: string) => void;
  pragma: (pragma: string) => unknown;
  close: () => void;
}

export interface SessionRow {
  id: string;
  title: string;
  claude_session_id: string | null;
  openai_thread_id: string | null;
  status: string;
  cwd: string | null;
  mounted_paths: string; // JSON string
  allowed_tools: string; // JSON string
  memory_enabled: number;
  model: string | null;
  created_at: number;
  updated_at: number;
}

export interface MessageRow {
  id: string;
  session_id: string;
  role: string;
  content: string; // JSON string
  timestamp: number;
  token_usage: string | null; // JSON string
  execution_time_ms: number | null;
}

export interface TraceStepRow {
  id: string;
  session_id: string;
  type: string;
  status: string;
  title: string;
  content: string | null;
  tool_name: string | null;
  tool_input: string | null; // JSON string
  tool_output: string | null;
  is_error: number | null;
  timestamp: number;
  duration: number | null;
}

export interface ScheduledTaskRow {
  id: string;
  title: string;
  prompt: string;
  cwd: string;
  run_at: number;
  next_run_at: number | null;
  schedule_config: string | null;
  repeat_every: number | null;
  repeat_unit: string | null;
  enabled: number;
  last_run_at: number | null;
  last_run_session_id: string | null;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}

export interface FirefliesConfigRow {
  id: number;
  api_key: string;
  connected: number;
  last_synced_at: number | null;
}

export interface FirefliesTranscriptRow {
  id: string;
  title: string;
  date: string;
  duration: number;
  participants: string;
  summary: string | null;
  action_items: string | null;
  questions: string | null;
  transcript_text: string | null;
  source_url: string | null;
  imported_at: number;
}

let db: DatabaseInstance | null = null;
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'utf8');

function buildBackupPath(targetPath: string, suffix: string): string {
  return `${targetPath}.${suffix}-${Date.now()}`;
}

function moveIfExists(sourcePath: string, destinationPath: string): void {
  if (!existsSync(sourcePath)) {
    return;
  }
  renameSync(sourcePath, destinationPath);
}

function ensureDirectory(pathToEnsure: string, label: string): void {
  if (!existsSync(pathToEnsure)) {
    mkdirSync(pathToEnsure, { recursive: true });
    return;
  }

  const stats = statSync(pathToEnsure);
  if (stats.isDirectory()) {
    return;
  }

  const backupPath = buildBackupPath(pathToEnsure, 'backup');
  renameSync(pathToEnsure, backupPath);
  logWarn(`[Database] ${label} path is not a directory, moved to backup:`, backupPath);
  mkdirSync(pathToEnsure, { recursive: true });
}

function isSqliteFile(filePath: string): boolean {
  let fd: number | null = null;
  try {
    fd = openSync(filePath, 'r');
    const buffer = Buffer.alloc(SQLITE_HEADER.length);
    const bytesRead = readSync(fd, buffer, 0, SQLITE_HEADER.length, 0);
    if (bytesRead < SQLITE_HEADER.length) {
      return false;
    }
    return buffer.equals(SQLITE_HEADER);
  } catch {
    return false;
  } finally {
    if (fd !== null) {
      closeSync(fd);
    }
  }
}

function prepareDatabaseDirectory(userDataPath: string): string {
  ensureDirectory(userDataPath, 'userData');

  const dbDir = join(userDataPath, 'data');
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
    return dbDir;
  }

  const stats = statSync(dbDir);
  if (stats.isDirectory()) {
    return dbDir;
  }

  const preservedPath = buildBackupPath(dbDir, isSqliteFile(dbDir) ? 'legacy-db' : 'conflict');
  renameSync(dbDir, preservedPath);
  mkdirSync(dbDir, { recursive: true });

  if (isSqliteFile(preservedPath)) {
    const recoveredDbPath = join(dbDir, 'cowork.db');
    renameSync(preservedPath, recoveredDbPath);
    moveIfExists(`${dbDir}-wal`, `${recoveredDbPath}-wal`);
    moveIfExists(`${dbDir}-shm`, `${recoveredDbPath}-shm`);
    logWarn('[Database] Recovered legacy SQLite file into:', recoveredDbPath);
  } else {
    logWarn('[Database] Database directory path was occupied by a file, moved to backup:', preservedPath);
  }

  return dbDir;
}

/**
 * Get the database file path
 */
function getDatabasePath(): string {
  // Use electron's userData path for persistent storage
  const userDataPath = app.getPath('userData');
  const dbDir = prepareDatabaseDirectory(userDataPath);
  const dbPath = join(dbDir, 'cowork.db');

  if (existsSync(dbPath) && statSync(dbPath).isDirectory()) {
    const backupPath = buildBackupPath(dbPath, 'dir-backup');
    renameSync(dbPath, backupPath);
    logWarn('[Database] Database file path is a directory, moved to backup:', backupPath);
  }

  return dbPath;
}

/**
 * Initialize the database schema
 */
function initializeSchema(database: Database.Database): void {
  try {
  // Enable WAL mode for better performance
  database.pragma('journal_mode = WAL');
  
  // Create sessions table
  database.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      claude_session_id TEXT,
      openai_thread_id TEXT,
      status TEXT NOT NULL DEFAULT 'idle',
      cwd TEXT,
      mounted_paths TEXT NOT NULL DEFAULT '[]',
      allowed_tools TEXT NOT NULL DEFAULT '[]',
      memory_enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  ensureColumn(database, 'sessions', 'openai_thread_id', 'openai_thread_id TEXT');
  ensureColumn(database, 'sessions', 'model', 'model TEXT');
  
  // Create messages table
  database.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      token_usage TEXT,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);

  ensureColumn(database, 'messages', 'execution_time_ms', 'execution_time_ms INTEGER');

  // Create trace steps table
  database.exec(`
    CREATE TABLE IF NOT EXISTS trace_steps (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      tool_name TEXT,
      tool_input TEXT,
      tool_output TEXT,
      is_error INTEGER,
      timestamp INTEGER NOT NULL,
      duration INTEGER,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);
  
  // Create index for faster message queries
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_session_id 
    ON messages(session_id)
  `);
  
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp 
    ON messages(session_id, timestamp)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_trace_steps_session_id
    ON trace_steps(session_id)
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_trace_steps_timestamp
    ON trace_steps(session_id, timestamp)
  `);
  
  // Create memory_entries table (for future use)
  database.exec(`
    CREATE TABLE IF NOT EXISTS memory_entries (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `);
  
  // Create skills table (for future use)
  database.exec(`
    CREATE TABLE IF NOT EXISTS skills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      cwd TEXT NOT NULL,
      run_at INTEGER NOT NULL,
      next_run_at INTEGER,
      schedule_config TEXT,
      repeat_every INTEGER,
      repeat_unit TEXT,
      enabled INTEGER NOT NULL DEFAULT 1,
      last_run_at INTEGER,
      last_run_session_id TEXT,
      last_error TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  ensureColumn(database, 'scheduled_tasks', 'schedule_config', 'schedule_config TEXT');

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_next_run
    ON scheduled_tasks(enabled, next_run_at)
  `);

  // Fireflies config table
  database.exec(`
    CREATE TABLE IF NOT EXISTS fireflies_config (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      api_key TEXT NOT NULL,
      connected INTEGER NOT NULL DEFAULT 0,
      last_synced_at INTEGER
    )
  `);

  // Fireflies transcripts table
  database.exec(`
    CREATE TABLE IF NOT EXISTS fireflies_transcripts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      duration INTEGER NOT NULL DEFAULT 0,
      participants TEXT NOT NULL DEFAULT '[]',
      summary TEXT,
      action_items TEXT,
      questions TEXT,
      transcript_text TEXT,
      source_url TEXT,
      imported_at INTEGER NOT NULL
    )
  `);

  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_fireflies_transcripts_date
    ON fireflies_transcripts(date DESC)
  `);

  log('[Database] Schema initialized');
  } catch (error) {
    logError('[Database] Schema initialization failed:', error);
    throw error;
  }
}

function validateIdentifier(name: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return name;
}

function ensureColumn(
  database: Database.Database,
  table: string,
  column: string,
  definition: string
): void {
  validateIdentifier(table);
  validateIdentifier(column);
  const rows = database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  const exists = rows.some((row) => row.name === column);
  if (exists) {
    return;
  }
  database.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
}

/**
 * Initialize the database
 */
export function initDatabase(): DatabaseInstance {
  if (db) return db;
  
  const dbPath = getDatabasePath();
  log('[Database] Opening database at:', dbPath);

  let rawDb: Database.Database;
  try {
    rawDb = new Database(dbPath);
  } catch (error) {
    logError('[Database] Failed to open database at:', dbPath, error);
    throw error;
  }

  // Enable foreign keys
  rawDb.pragma('foreign_keys = ON');
  
  // Initialize schema
  initializeSchema(rawDb);
  
  // Prepare statements for better performance
  const insertSession = rawDb.prepare(`
    INSERT OR REPLACE INTO sessions
    (id, title, claude_session_id, openai_thread_id, status, cwd, mounted_paths, allowed_tools, memory_enabled, model, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  // Note: Dynamic update queries are built in sessions.update() for flexibility
  // const updateSessionStmt = rawDb.prepare(`
  //   UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?
  // `);
  
  const getSessionStmt = rawDb.prepare(`
    SELECT * FROM sessions WHERE id = ?
  `);
  
  const getAllSessionsStmt = rawDb.prepare(`
    SELECT * FROM sessions ORDER BY updated_at DESC
  `);
  
  const deleteSessionStmt = rawDb.prepare(`
    DELETE FROM sessions WHERE id = ?
  `);
  
  const insertMessage = rawDb.prepare(`
    INSERT INTO messages (id, session_id, role, content, timestamp, token_usage, execution_time_ms)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  
  const getMessagesBySessionStmt = rawDb.prepare(`
    SELECT * FROM messages WHERE session_id = ? ORDER BY timestamp ASC
  `);
  
  const updateMessageStmt = rawDb.prepare(`
    UPDATE messages SET execution_time_ms = ? WHERE id = ?
  `);
  
  const deleteMessageStmt = rawDb.prepare(`
    DELETE FROM messages WHERE id = ?
  `);
  
  const deleteMessagesBySessionStmt = rawDb.prepare(`
    DELETE FROM messages WHERE session_id = ?
  `);

  const insertTraceStep = rawDb.prepare(`
    INSERT OR REPLACE INTO trace_steps (
      id, session_id, type, status, title, content, tool_name, tool_input, tool_output, is_error, timestamp, duration
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getTraceStepsBySessionStmt = rawDb.prepare(`
    SELECT * FROM trace_steps WHERE session_id = ? ORDER BY timestamp ASC
  `);

  const deleteTraceStepsBySessionStmt = rawDb.prepare(`
    DELETE FROM trace_steps WHERE session_id = ?
  `);

  const insertScheduledTask = rawDb.prepare(`
    INSERT OR REPLACE INTO scheduled_tasks (
      id, title, prompt, cwd, run_at, next_run_at, schedule_config, repeat_every, repeat_unit, enabled, last_run_at, last_run_session_id, last_error, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getScheduledTaskStmt = rawDb.prepare(`
    SELECT * FROM scheduled_tasks WHERE id = ?
  `);

  const getAllScheduledTasksStmt = rawDb.prepare(`
    SELECT * FROM scheduled_tasks ORDER BY created_at ASC
  `);

  const deleteScheduledTaskStmt = rawDb.prepare(`
    DELETE FROM scheduled_tasks WHERE id = ?
  `);

  const insertFirefliesConfig = rawDb.prepare(`
    INSERT OR REPLACE INTO fireflies_config (id, api_key, connected, last_synced_at)
    VALUES (?, ?, ?, ?)
  `);

  const getFirefliesConfigStmt = rawDb.prepare(`
    SELECT * FROM fireflies_config WHERE id = 1
  `);

  const deleteFirefliesConfigStmt = rawDb.prepare(`
    DELETE FROM fireflies_config WHERE id = 1
  `);

  const insertFirefliesTranscript = rawDb.prepare(`
    INSERT OR REPLACE INTO fireflies_transcripts
    (id, title, date, duration, participants, summary, action_items, questions, transcript_text, source_url, imported_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getAllFirefliesTranscriptsStmt = rawDb.prepare(`
    SELECT * FROM fireflies_transcripts ORDER BY date DESC
  `);

  const deleteFirefliesTranscriptStmt = rawDb.prepare(`
    DELETE FROM fireflies_transcripts WHERE id = ?
  `);

  const deleteAllFirefliesTranscriptsStmt = rawDb.prepare(`
    DELETE FROM fireflies_transcripts
  `);

  db = {
    raw: rawDb,
    
    sessions: {
      create: (session: SessionRow) => {
        insertSession.run(
          session.id,
          session.title,
          session.claude_session_id,
          session.openai_thread_id,
          session.status,
          session.cwd,
          session.mounted_paths,
          session.allowed_tools,
          session.memory_enabled,
          session.model,
          session.created_at,
          session.updated_at
        );
      },
      
      update: (id: string, updates: Partial<SessionRow>) => {
        // Build dynamic update query
        const setClauses: string[] = [];
        const values: unknown[] = [];

        for (const [key, value] of Object.entries(updates)) {
          if (value !== undefined) {
            validateIdentifier(key);
            setClauses.push(`${key} = ?`);
            values.push(value);
          }
        }

        if (setClauses.length === 0) return;

        // Always update updated_at
        setClauses.push('updated_at = ?');
        values.push(Date.now());
        values.push(id);

        const sql = `UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`;
        rawDb.prepare(sql).run(...values);
      },
      
      get: (id: string): SessionRow | undefined => {
        return getSessionStmt.get(id) as SessionRow | undefined;
      },
      
      getAll: (): SessionRow[] => {
        return getAllSessionsStmt.all() as SessionRow[];
      },
      
      delete: (id: string) => {
        // Messages will be deleted automatically due to ON DELETE CASCADE
        deleteSessionStmt.run(id);
      },
    },
    
    messages: {
      create: (message: MessageRow) => {
        insertMessage.run(
          message.id,
          message.session_id,
          message.role,
          message.content,
          message.timestamp,
          message.token_usage,
          message.execution_time_ms ?? null
        );
      },
      
      update: (id: string, updates: Partial<Pick<MessageRow, 'execution_time_ms'>>) => {
        if (updates.execution_time_ms !== undefined) {
          updateMessageStmt.run(updates.execution_time_ms, id);
        }
      },
      
      getBySessionId: (sessionId: string): MessageRow[] => {
        return getMessagesBySessionStmt.all(sessionId) as MessageRow[];
      },
      
      delete: (id: string) => {
        deleteMessageStmt.run(id);
      },
      
      deleteBySessionId: (sessionId: string) => {
        deleteMessagesBySessionStmt.run(sessionId);
      },
    },

    traceSteps: {
      create: (step: TraceStepRow) => {
        insertTraceStep.run(
          step.id,
          step.session_id,
          step.type,
          step.status,
          step.title,
          step.content,
          step.tool_name,
          step.tool_input,
          step.tool_output,
          step.is_error,
          step.timestamp,
          step.duration
        );
      },

      update: (id: string, updates: Partial<TraceStepRow>) => {
        const setClauses: string[] = [];
        const values: unknown[] = [];

        for (const [key, value] of Object.entries(updates)) {
          if (value !== undefined) {
            validateIdentifier(key);
            setClauses.push(`${key} = ?`);
            values.push(value);
          }
        }

        if (setClauses.length === 0) return;

        values.push(id);
        const sql = `UPDATE trace_steps SET ${setClauses.join(', ')} WHERE id = ?`;
        rawDb.prepare(sql).run(...values);
      },

      getBySessionId: (sessionId: string): TraceStepRow[] => {
        return getTraceStepsBySessionStmt.all(sessionId) as TraceStepRow[];
      },

      deleteBySessionId: (sessionId: string) => {
        deleteTraceStepsBySessionStmt.run(sessionId);
      },
    },

    scheduledTasks: {
      create: (task: ScheduledTaskRow) => {
        insertScheduledTask.run(
          task.id,
          task.title,
          task.prompt,
          task.cwd,
          task.run_at,
          task.next_run_at,
          task.schedule_config,
          task.repeat_every,
          task.repeat_unit,
          task.enabled,
          task.last_run_at,
          task.last_run_session_id,
          task.last_error,
          task.created_at,
          task.updated_at
        );
      },

      update: (id: string, updates: Partial<ScheduledTaskRow>) => {
        const setClauses: string[] = [];
        const values: unknown[] = [];

        for (const [key, value] of Object.entries(updates)) {
          if (value !== undefined) {
            validateIdentifier(key);
            setClauses.push(`${key} = ?`);
            values.push(value);
          }
        }

        if (setClauses.length === 0) return;

        setClauses.push('updated_at = ?');
        values.push(Date.now());
        values.push(id);

        const sql = `UPDATE scheduled_tasks SET ${setClauses.join(', ')} WHERE id = ?`;
        rawDb.prepare(sql).run(...values);
      },

      get: (id: string): ScheduledTaskRow | undefined => {
        return getScheduledTaskStmt.get(id) as ScheduledTaskRow | undefined;
      },

      getAll: (): ScheduledTaskRow[] => {
        return getAllScheduledTasksStmt.all() as ScheduledTaskRow[];
      },

      delete: (id: string) => {
        deleteScheduledTaskStmt.run(id);
      },
    },

    firefliesConfig: {
      create: (config: FirefliesConfigRow) => {
        insertFirefliesConfig.run(config.id, config.api_key, config.connected, config.last_synced_at);
      },

      get: (): FirefliesConfigRow | undefined => {
        return getFirefliesConfigStmt.get() as FirefliesConfigRow | undefined;
      },

      delete: () => {
        deleteFirefliesConfigStmt.run();
      },
    },

    firefliesTranscripts: {
      create: (transcript: FirefliesTranscriptRow) => {
        insertFirefliesTranscript.run(
          transcript.id,
          transcript.title,
          transcript.date,
          transcript.duration,
          transcript.participants,
          transcript.summary,
          transcript.action_items,
          transcript.questions,
          transcript.transcript_text,
          transcript.source_url,
          transcript.imported_at
        );
      },

      getAll: (): FirefliesTranscriptRow[] => {
        return getAllFirefliesTranscriptsStmt.all() as FirefliesTranscriptRow[];
      },

      delete: (id: string) => {
        deleteFirefliesTranscriptStmt.run(id);
      },

      deleteAll: () => {
        deleteAllFirefliesTranscriptsStmt.run();
      },
    },

    // Compatibility layer for old interface
    prepare: (sql: string) => rawDb.prepare(sql),
    exec: (sql: string) => rawDb.exec(sql),
    pragma: (pragma: string) => rawDb.pragma(pragma),
    close: () => {
      rawDb.close();
      db = null;
    },
  };
  
  log('[Database] SQLite database initialized successfully');
  return db!;
}

/**
 * Get the existing database instance
 */
export function getDatabase(): DatabaseInstance {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    log('[Database] Database closed');
  }
}
