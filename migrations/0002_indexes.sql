-- 0002: indeks parsial untuk query aktif (deleted_at IS NULL).
-- Dipakai jalur ringan 5000+ baris: mode team memakai (team_id, tanggal),
-- mode Semua Team memakai (tanggal). Query harus menulis deleted_at IS NULL
-- persis agar planner memakai indeks parsial ini.
-- Diterapkan via Cloudflare API (bukan deploy otomatis), sama seperti 0001.
CREATE INDEX IF NOT EXISTS idx_results_team_tanggal_aktif ON shift_results (team_id, tanggal) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_results_tanggal_aktif ON shift_results (tanggal) WHERE deleted_at IS NULL;
