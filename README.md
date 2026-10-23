# Inputin - App Pencatatan Hasil Usaha

Aplikasi web (PWA) untuk mencatat hasil usaha harian per team dan per shift, lengkap dengan pembagian hasil per kelompok, laporan tabel dan grafik, serta PDF teks yang siap dicetak. Dibangun untuk dipakai dari HP di lapangan: cepat, bisa offline, dan angkanya selalu konsisten.

**Demo yang berjalan:** https://inputin.hadesxyz.workers.dev (Cloudflare Workers + D1 + Vue 3)

## Fitur

- **Input hasil per team dan shift** - 2 shift per hari, satuan gram dengan format desimal Indonesia (koma desimal, titik ribuan, selalu 3 angka di belakang koma).
- **Pembagian per kelompok** - tiap kelompok diatur persen dan jumlah orangnya; aplikasi menghitung total terbagi dan jatah per orang. Sisa pembagian tercatat sebagai **Pendapatan Usaha**. Total persen di atas 100% ditolak.
- **Mode Tanpa Hasil** - hari/shift tanpa hasil tetap tercatat dengan alasan wajib di catatan.
- **Mode Edit aman** - mengubah data yang sudah tersimpan memunculkan konfirmasi berisi daftar perubahan; menghapus baris kelompok juga berkonfirmasi. Semua buat/edit/hapus tercatat di **riwayat perubahan (audit trail)**.
- **Riwayat** - daftar per hari dengan filter team, tanggal, dan kata kunci, plus rincian per shift.
- **Laporan** - dua tab:
  - **Grafik (dashboard)**: KPI, grafik hasil harian (batang bertumpuk per shift + garis Pendapatan Usaha), grafik bulanan, donat komposisi per kelompok, dan Analisa Singkat otomatis (hari terbaik, hari paling produktif, pekerja, jatah per orang, tren, konsistensi). Periode 30 hari, 12 bulan, atau tahun berjalan.
  - **Tabel & PDF**: tabel gabungan per hari dengan subtotal mingguan, total per kelompok, rekap per team, dan unduh **PDF Harian** serta **PDF Rentang** (teks asli yang bisa diseleksi/dicari, bukan gambar). Struktur resmi PDF didokumentasikan di [RINCIAN-PDF.md](RINCIAN-PDF.md).
- **Multi-team dan peran** - Admin melihat dan mengelola semua team; Staff terkunci di team-nya sendiri (dijaga di server). Admin mengelola team, akun pengguna, template pembagian, dan pengaturan usaha (nama perusahaan, nama pimpinan, zona waktu WIB/WITA/WIT).
- **PWA offline** - bisa di-install ke layar utama HP. Input saat tidak ada sinyal masuk antrian lokal dan terkirim otomatis saat kembali online (aman dari duplikat).
- **Backup dan Reset (Admin)** - unduh backup seluruh data transaksi sebagai JSON. Reset Data Transaksi menghapus semua data hasil dan pembagian dengan tiga pengaman: backup diunduh dulu, mengetik kata RESET, dan verifikasi ulang password Admin. Team, akun, pengaturan, dan audit trail tidak ikut terhapus.

Aturan bisnis lengkap ada di [DESAIN.md](DESAIN.md).

## Teknologi

- **Cloudflare Workers** - satu Worker melayani PWA, API, dan data PDF.
- **Cloudflare D1** (SQLite) - penyimpanan data.
- **Vue 3** - frontend satu file hasil rakitan `scripts/build.mjs` (tanpa CDN, semua aset lokal agar tetap jalan offline).
- **jsPDF** - PDF dibuat di perangkat pengguna dari data laporan.
- Password di-hash PBKDF2 (100.000 iterasi), sesi berbasis token hash, validasi dan perhitungan persen dilakukan di server.

## Struktur repo

```
app/            Sumber frontend Vue (template.html, app.js, fonts.css, vendor/, fonts-pdf/, icons/)
src/worker.js   Worker: API + penyaji frontend (file lain di src/ adalah hasil build, tidak di-commit)
migrations/     Skema database D1 (0001_schema.sql)
scripts/
  build.mjs     Merakit frontend ke public/index.html + src/frontend.js dan aset PDF/ikon
  seed.py       Membuat skema + data awal (2 team, akun admin/staff) di D1 lewat API Cloudflare
wrangler.toml   Konfigurasi Worker + binding D1
DESAIN.md       Dokumen desain master: aturan bisnis, skema data, UI/UX, keputusan yang dikunci
RINCIAN-PDF.md  Spesifikasi resmi isi PDF Harian dan PDF Rentang
TUTORIAL-SQL-D1.md  Tutorial mengelola database D1 langsung dengan SQL
```

## Memasang di Cloudflare Anda sendiri

Prasyarat: akun Cloudflare, Node.js, dan Wrangler (`npm i -g wrangler`) atau Bun.

1. **Buat database D1** baru (dashboard Cloudflare atau `wrangler d1 create inputin-db`), lalu salin UUID-nya ke `wrangler.toml`: ganti `database_id` pada binding produksi (dan binding preview bila dipakai).
2. **Isi data awal** dengan seed (membuat skema, 2 team, settings, dan akun admin + 2 staff dengan password acak yang ditulis ke `credentials-awal.txt`):
   ```sh
   CF_ACCOUNT_ID=<id-akun> CF_API_TOKEN=<token-izin-d1-edit> INPUTIN_DB_ID=<uuid-d1> python3 scripts/seed.py
   ```
   Alternatif: jalankan `migrations/0001_schema.sql` sendiri lewat `wrangler d1 execute`, lalu buat akun admin pertama secara manual (format hash: `saltHex:hashHex` PBKDF2-SHA256 100.000 iterasi).
3. **Deploy**:
   - Cara otomatis: hubungkan repo ini ke **Cloudflare Workers Builds** - build command `npm run build`, deploy command `npx wrangler deploy`. Setiap push ke `main` ter-deploy otomatis.
   - Cara manual: `node scripts/build.mjs` lalu `npx wrangler deploy`.
4. **Login pertama** memakai akun dari `credentials-awal.txt`, lalu ganti password semua akun dari menu Profil/Admin.
5. **Preview (opsional)**: aktifkan Worker Previews dengan perintah `npx wrangler versions upload`. Arahkan binding preview di `wrangler.toml` ke database D1 terpisah agar pengujian tidak menyentuh data produksi.

Catatan: `database_id` di `wrangler.toml` bukan rahasia (hanya penunjuk database), sedangkan token API tidak pernah disimpan di repo.

## Pengembangan lokal

```sh
node scripts/build.mjs   # menghasilkan public/index.html dan aset di src/
```

File hasil build (`public/`, `src/frontend.js`, `src/pdfassets.js`, `src/iconassets.js`) sengaja tidak di-commit; semuanya dibuat ulang oleh `build.mjs` dari sumber di `app/` setiap kali deploy.

Untuk mengelola database langsung dengan SQL (inspeksi data, pemulihan entri terhapus, audit trail, backup dan reset manual), lihat [TUTORIAL-SQL-D1.md](TUTORIAL-SQL-D1.md).
