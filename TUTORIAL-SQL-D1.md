# Tutorial SQL untuk Database D1 Inputin

Panduan mengelola langsung database Inputin dengan SQL. Database ini memakai **Cloudflare D1** (SQLite), jadi semua contoh di bawah adalah SQL dialek SQLite. Tutorial ini berguna untuk keadaan darurat, pemeriksaan data, dan administrasi yang belum tersedia di aplikasi.

> Cara normal memasukkan dan mengubah data adalah lewat aplikasi. SQL langsung melewati semua validasi aplikasi (misalnya total persen maksimal 100% dan perhitungan pembagian), jadi berhati-hatilah: selalu jalankan `SELECT` dulu untuk memastikan baris yang akan diubah, dan selalu pakai klausa `WHERE`.

## Peta tabel

Skema lengkap ada di `migrations/0001_schema.sql`. Ringkasnya:

| Tabel | Isi |
|---|---|
| `teams` | Daftar team. `aktif = 0` berarti nonaktif. |
| `users` | Akun login. `role` berisi `admin` atau `staff`; staff terikat ke satu `team_id`, admin `team_id`-nya NULL. `password_hash` formatnya `saltHex:hashHex` (PBKDF2-SHA256, 100.000 iterasi). |
| `sessions` | Sesi login aktif; `token_hash` adalah kunci utama, `expires_at` waktu kedaluwarsa (UTC). |
| `shift_results` | Satu baris per team per tanggal per shift (unik). `hasil_gram` dalam gram, `tanpa_hasil = 1` untuk mode tanpa hasil, `catatan` teks bebas. Baris yang dihapus dari aplikasi tidak hilang: `deleted_at` terisi waktu penghapusan (soft delete). |
| `distribution_rows` | Baris pembagian milik satu `shift_results` (lewat `result_id`). `total_gram` dan `per_orang_gram` adalah hasil hitungan server saat data disimpan. |
| `distribution_templates` | Template pembagian bawaan per team (diatur dari menu Admin aplikasi). |
| `audit_log` | Riwayat perubahan: `aksi` (`buat`, `ubah`, `hapus`, `pulih`, `reset`), `detail` berisi JSON, `waktu` dalam UTC. Tidak ikut terhapus saat reset data. |
| `settings` | Pasangan kunci-nilai: `nama_perusahaan`, `nama_pimpinan`, `zona_waktu`, `session_secret`. |

Waktu selalu disimpan sebagai teks ISO dalam UTC (misalnya `2026-10-23T04:32:08.169Z`), tanggal sebagai `YYYY-MM-DD`.

## Tiga cara menjalankan SQL

### 1. Console di dashboard Cloudflare (paling mudah)

Buka dashboard Cloudflare, pilih **Workers & Pages > D1**, pilih database-nya, lalu tab **Console**. Tulis SQL, klik Execute. Pastikan nama database yang dipilih benar: database produksi dan preview itu **berbeda** (lihat binding di `wrangler.toml`).

### 2. Wrangler CLI

Dari folder repo (nama database mengikuti `database_name` di `wrangler.toml`):

```sh
# Satu perintah
npx wrangler d1 execute inputin-db --remote --command "SELECT COUNT(*) FROM shift_results;"

# Dari file .sql
npx wrangler d1 execute inputin-db --remote --file cadangan.sql
```

Tanpa `--remote`, perintah berjalan ke database lokal untuk pengembangan, bukan ke server.

### 3. HTTP API Cloudflare

```sh
curl -s https://api.cloudflare.com/client/v4/accounts/$CF_ACCOUNT_ID/d1/database/$INPUTIN_DB_ID/query \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sql": "SELECT * FROM teams ORDER BY id;"}'
```

`$INPUTIN_DB_ID` adalah UUID database dari `wrangler.toml`. Token API tidak pernah ditulis ke repo.

## Inspeksi database

```sql
-- Daftar semua tabel
SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name;

-- Struktur kolom satu tabel
PRAGMA table_info(shift_results);

-- Isi ringkas tiap tabel
SELECT (SELECT COUNT(*) FROM teams) AS team,
       (SELECT COUNT(*) FROM users) AS pengguna,
       (SELECT COUNT(*) FROM shift_results) AS entri,
       (SELECT COUNT(*) FROM audit_log) AS audit;
```

## Team dan pengguna

```sql
-- Daftar team beserta jumlah penggunanya
SELECT t.id, t.nama, t.aktif, COUNT(u.id) AS jumlah_user
FROM teams t LEFT JOIN users u ON u.team_id = t.id
GROUP BY t.id ORDER BY t.id;

-- Tambah team baru
INSERT INTO teams (nama, aktif, created_at)
VALUES ('Team 3', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Nonaktifkan pengguna (ia tidak bisa login, datanya tetap ada)
UPDATE users SET aktif = 0 WHERE username = 'staff1';
```

Soal password: **jangan menebak atau menulis hash sendiri**. Buat dan ganti password lewat aplikasi (Admin > Pengguna, atau Profil > Ganti Password) atau buat akun awal dengan `scripts/seed.py`. Mengganti `password_hash` dengan teks biasa akan membuat akun itu tidak bisa login selamanya.

## Pengaturan usaha

```sql
-- Lihat semua pengaturan
SELECT * FROM settings;

-- Ubah nama perusahaan / pimpinan / zona waktu (nilai zona: Asia/Jakarta, Asia/Makassar, Asia/Jayapura)
INSERT INTO settings (key, value) VALUES ('nama_perusahaan', 'PT Contoh')
ON CONFLICT(key) DO UPDATE SET value = excluded.value;
```

## Membaca data hasil dan laporan

```sql
-- Semua entri satu team dalam rentang tanggal (yang tidak terhapus)
SELECT tanggal, shift, hasil_gram, tanpa_hasil, catatan
FROM shift_results
WHERE team_id = 1 AND tanggal BETWEEN '2026-10-01' AND '2026-10-31' AND deleted_at IS NULL
ORDER BY tanggal, shift;

-- Rincian pembagian satu entri
SELECT nama, persentase, jumlah_orang, total_gram, per_orang_gram
FROM distribution_rows WHERE result_id = 12 ORDER BY urutan;

-- Total hasil, total terbagi, dan Pendapatan Usaha per team dalam rentang
SELECT t.nama,
       SUM(s.hasil_gram) AS total_hasil,
       COALESCE(SUM((SELECT SUM(d.total_gram) FROM distribution_rows d WHERE d.result_id = s.id)), 0) AS total_terbagi,
       SUM(s.hasil_gram) - COALESCE(SUM((SELECT SUM(d.total_gram) FROM distribution_rows d WHERE d.result_id = s.id)), 0) AS pendapatan_usaha
FROM shift_results s JOIN teams t ON t.id = s.team_id
WHERE s.tanggal BETWEEN '2026-10-01' AND '2026-10-31' AND s.deleted_at IS NULL
GROUP BY t.id ORDER BY t.id;

-- Rekap per kelompok: berapa gram diterima tiap kelompok bulan ini
SELECT d.nama, COUNT(*) AS jumlah_entri, SUM(d.total_gram) AS total_gram
FROM distribution_rows d JOIN shift_results s ON s.id = d.result_id
WHERE s.tanggal BETWEEN '2026-10-01' AND '2026-10-31' AND s.deleted_at IS NULL
GROUP BY d.nama ORDER BY total_gram DESC;

-- Hari tanpa hasil beserta alasannya
SELECT t.nama, s.tanggal, s.shift, s.catatan
FROM shift_results s JOIN teams t ON t.id = s.team_id
WHERE s.tanpa_hasil = 1 AND s.deleted_at IS NULL
ORDER BY s.tanggal DESC;
```

## Memasukkan data secara manual (darurat)

Aplikasi menghitung sendiri `total_gram = persentase / 100 * hasil_gram` dan `per_orang_gram = total_gram / jumlah_orang`. Kalau terpaksa memasukkan lewat SQL, hitung dengan rumus yang sama dan jaga total persentase tidak lebih dari 100.

```sql
-- Contoh: Team 1, 23 Okt 2026, Shift 1, hasil 12,5 gram
INSERT INTO shift_results (team_id, tanggal, shift, hasil_gram, tanpa_hasil, catatan, created_by, updated_by, created_at, updated_at)
VALUES (1, '2026-10-23', 1, 12.5, 0, 'input manual darurat', 1, 1,
        strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

-- Baris pembagiannya; angka 123 di bawah adalah contoh result_id, ganti dengan id asli dari SELECT setelahnya
INSERT INTO distribution_rows (result_id, nama, persentase, jumlah_orang, total_gram, per_orang_gram, urutan)
VALUES (123, 'Operator', 6, 4, 0.75, 0.1875, 0);
```

Untuk mendapatkan id entri yang baru dibuat:

```sql
SELECT id FROM shift_results WHERE team_id = 1 AND tanggal = '2026-10-23' AND shift = 1;
```

Kombinasi (team, tanggal, shift) itu unik: memasukkan kombinasi yang sudah ada akan ditolak database. Di aplikasi, kombinasi yang sama berarti mode edit.

## Entri terhapus (soft delete) dan pemulihannya

Menghapus dari aplikasi hanya mengisi `deleted_at`; barisnya tetap ada dan disembunyikan dari semua tampilan. Ini yang membuat pemulihan mungkin:

```sql
-- Lihat entri yang sedang terhapus
SELECT id, team_id, tanggal, shift, hasil_gram, deleted_at
FROM shift_results WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC;

-- Pulihkan satu entri (tampil lagi di aplikasi)
UPDATE shift_results SET deleted_at = NULL WHERE id = 12;

-- Catat pemulihannya di audit (pola yang dipakai aplikasi)
INSERT INTO audit_log (result_id, team_id, user_id, aksi, detail, waktu)
VALUES (12, 1, 1, 'pulih', '{"lewat":"sql-manual"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
```

## Riwayat perubahan (audit trail)

```sql
-- 50 perubahan terakhir beserta nama penggunanya
SELECT a.waktu, u.nama AS pengguna, t.nama AS team, a.aksi, a.result_id, a.detail
FROM audit_log a
LEFT JOIN users u ON u.id = a.user_id
LEFT JOIN teams t ON t.id = a.team_id
ORDER BY a.id DESC LIMIT 50;

-- Riwayat khusus satu entri
SELECT * FROM audit_log WHERE result_id = 12 ORDER BY id;
```

## Template pembagian

```sql
-- Template bawaan per team
SELECT * FROM distribution_templates ORDER BY team_id, urutan;

-- Ubah persen template satu kelompok
UPDATE distribution_templates SET persentase = 7 WHERE team_id = 1 AND nama = 'Operator';
```

Template hanya memengaruhi isian awal form; data yang sudah tersimpan tidak berubah.

## Sesi login

```sql
-- Sesi yang masih berlaku
SELECT s.user_id, u.username, s.expires_at
FROM sessions s JOIN users u ON u.id = s.user_id
WHERE s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now');

-- Paksa semua pengguna logout (sesi dihapus, data lain aman)
DELETE FROM sessions;
```

## Backup dan reset manual

Backup paling lengkap adalah ekspor seluruh database:

```sh
npx wrangler d1 export inputin-db --remote --output backup-inputin.sql
```

Mengembalikan backup: jalankan file hasil ekspor ke database tujuan dengan `wrangler d1 execute ... --file backup-inputin.sql`. Aplikasi juga menyediakan backup JSON khusus data transaksi dari menu Admin (Backup dan Reset).

Reset manual meniru persis perilaku aplikasi (menu Admin > Reset Data Transaksi). **Permanen dan tidak bisa dibatalkan - ekspor dulu.**

```sql
-- Urutan penting: baris pembagian dulu (anak), baru entri (induk)
DELETE FROM distribution_rows;
DELETE FROM shift_results;

-- Catat kejadiannya di audit (audit memang tidak ikut dihapus)
INSERT INTO audit_log (result_id, team_id, user_id, aksi, detail, waktu)
VALUES (NULL, NULL, 1, 'reset', '{"lewat":"sql-manual"}', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
```

Yang tidak disentuh reset: `teams`, `users`, `settings`, `distribution_templates`, `sessions`, dan `audit_log`.

## Praktik baik

- **Kenali databasenya sebelum menjalankan apa pun.** Produksi dan preview terpisah; UUID masing-masing ada di `wrangler.toml`. Kesalahan paling berbahaya adalah menjalankan SQL uji di database produksi.
- **SELECT dulu, baru UPDATE atau DELETE**, dengan `WHERE` yang sama, dan periksa jumlah baris yang akan kena.
- **Backup sebelum operasi besar** (ekspor di atas hanya butuh beberapa detik).
- **Satuan selalu gram** tanpa konversi apa pun; angka desimal memakai titik di SQL (`12.5`), bukan koma seperti tampilan aplikasi.
- Perubahan struktur tabel tidak dilakukan dengan mengubah file migrasi lama; buat file migrasi baru di folder `migrations/` (lihat aturan di [DESAIN.md](DESAIN.md)).
