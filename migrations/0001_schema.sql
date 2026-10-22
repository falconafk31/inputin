-- Inputin - skema awal database D1 (inputin-db)
-- Dijalankan Pax lewat Cloudflare API. Perubahan skema berikutnya = file migrasi baru.

CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nama TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin','staff')),
  team_id INTEGER REFERENCES teams(id),
  aktif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shift_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  tanggal TEXT NOT NULL,
  shift INTEGER NOT NULL CHECK (shift IN (1,2)),
  hasil_gram REAL NOT NULL DEFAULT 0,
  tanpa_hasil INTEGER NOT NULL DEFAULT 0,
  catatan TEXT NOT NULL DEFAULT '',
  created_by INTEGER REFERENCES users(id),
  updated_by INTEGER REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  UNIQUE (team_id, tanggal, shift)
);

CREATE TABLE IF NOT EXISTS distribution_rows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER NOT NULL REFERENCES shift_results(id),
  nama TEXT NOT NULL,
  persentase REAL NOT NULL,
  jumlah_orang INTEGER NOT NULL,
  total_gram REAL NOT NULL,
  per_orang_gram REAL NOT NULL,
  urutan INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS distribution_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  team_id INTEGER NOT NULL REFERENCES teams(id),
  nama TEXT NOT NULL,
  persentase REAL NOT NULL,
  jumlah_orang INTEGER NOT NULL,
  urutan INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  result_id INTEGER,
  team_id INTEGER,
  user_id INTEGER,
  aksi TEXT NOT NULL,
  detail TEXT,
  waktu TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_results_team_tanggal ON shift_results (team_id, tanggal);
CREATE INDEX IF NOT EXISTS idx_rows_result ON distribution_rows (result_id);
CREATE INDEX IF NOT EXISTS idx_audit_result ON audit_log (result_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
