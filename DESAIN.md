# Desain App Pencatatan Hasil Usaha
Versi: Draft 2.1 - 22 Oktober 2026 (hasil diskusi, tambahan aturan Catatan)
Platform: Cloudflare Workers + D1, PWA Ready
Status: Masih diskusi, belum build

## Keputusan yang Sudah Dikunci Hades
1. Pembagian TIDAK perlu konversi Rupiah. Satuan satu-satunya: gram.
2. Sisa pembagian dilabeli: Pendapatan Usaha.
3. Pembagian dicatat PER KELOMPOK saja. Contoh: hari ini kelompok Operator ada 6 orang, yang diinput angka 6. Nama per orang tidak dicatat.
4. Di awal dibuat 2 team: Team 1 dan Team 2. Team bisa ditambah Admin kapan saja tanpa ubah kode.
5. Kolom Catatan / Keterangan WAJIB ada di paling bawah form input, di bawah semua inputan (tanggal, hasil, pembagian), sebelum ringkasan dan tombol Simpan. Catatan itu tersimpan per hari dan WAJIB ikut tampil di PDF, bukan hanya tersimpan di aplikasi.

## 1. Ringkasan Sistem
- 1 catatan per team per tanggal.
- Staff hanya bisa akses team-nya. Admin full akses semua team.
- Input harian: Tanggal, Hasil Emas (gr), baris Pembagian fleksibel, Catatan.
- Rumus per baris: Total Kelompok = Hasil x Persentase. Per Orang = Total Kelompok / Jumlah Orang di kelompok itu.
- Total persen semua baris maksimal 100%. Selisihnya otomatis menjadi Pendapatan Usaha.
  Contoh: Hasil 100 gr, Operator 6% untuk 6 orang = total 6 gr, per orang 1 gr. Helper 4% untuk 5 orang = total 4 gr, per orang 0.8 gr. Total terpakai 10%, Pendapatan Usaha = 90% = 90 gr.
- Laporan PDF: Harian, Bulanan, Rentang Waktu, Tahunan. Per staff (team sendiri) dan per admin (semua team / per team).

## 2. UI/UX yang Direkomendasikan

### Prinsip: Dua rasa dalam satu sistem
Pengguna dan tempat pakainya berbeda jauh, jadi tampilannya dibedakan tanpa memecah aplikasi:

A. Mode Staff - Dipakai di lapangan, di HP, sering di bawah matahari
- Mobile-first, 1 kolom, semua serba besar.
- Navigasi bawah (bottom navigation) maksimal 4 menu: Dashboard, Input, Riwayat, Laporan. Jempol mudah menjangkau.
- Target sentuh minimal 48px dengan jarak antar tombol minimal 8px.
- Input Hasil Emas memakai angka paling besar di layar (28-32px, font mono tabular) supaya tidak salah baca 12.5 vs 125.
- Jumlah orang memakai tombol minus / plus besar (stepper), tidak perlu mengetik.
- Persentase ada tombol cepat (chip): 2%, 3%, 4%, 5%, 6%, 10%, plus bisa ketik manual untuk angka lain seperti 2.5%.
- Tombol Simpan selalu menempel di bawah layar (sticky), lebar penuh.
- Bar progres persen selalu terlihat saat input: hijau untuk yang sudah terbagi, emas untuk Pendapatan Usaha. Jika total lewat 100%, bar berubah merah dan Simpan terkunci.
- Mode terang sebagai default. Di lapangan, layar gelap sulit dibaca di bawah sinar matahari. Kontras teks minimal 4.5:1.

B. Mode Admin - Dipakai di kantor / rumah, kebanyakan di layar besar
- Dashboard padat data (data-dense): kartu KPI, tabel, dan grafik dalam grid rapat.
- Navigasi samping (sidebar) di desktop, berubah jadi navigasi bawah di HP.
- Grafik yang dipakai: grafik garis untuk tren hasil dari waktu ke waktu, grafik batang untuk membandingkan Team 1 vs Team 2. Hanya dua jenis itu agar konsisten dan mudah dibaca.
- Tabel laporan bisa difilter per team, per tanggal, per rentang waktu, lalu diunduh sebagai PDF A4.

### Gaya visual (Style)
- Gaya: Dashboard operasional yang bersih dan datar (flat, clean, data-dense untuk admin). Tanpa ornamen berlebihan, tanpa efek kaca / glassmorphism, fokus ke angka yang terbaca cepat.
- Ikon: SVG dari Lucide, bukan emoji.
- Font: Plus Jakarta Sans untuk teks dan judul (sama seperti RekamEdu, terasa lokal dan bersih), IBM Plex Mono untuk semua angka gram dan persen (angka tabular, digit sejajar, tidak bergeser saat berubah).

### Pilihan palet warna - untuk dipilih Hades
Pilihan A - Navy + Emas (REKOMENDASI)
- Utama: Navy #1E40AF, Aksen hasil emas: Amber #D97706, Latar: #F8FAFC, Kartu: Putih, Teks: Slate gelap.
- Alasan: paling profesional untuk data dan laporan PDF, warna team dan grafik mudah dibedakan, aksen emasnya pas untuk bisnis emas tanpa terlihat norak.

Pilihan B - Hijau Tua + Emas
- Utama: Hijau emerald tua #065F46, Aksen: Amber #D97706, Latar: #F7F8F5.
- Alasan: terasa tambang dan alam, tenang. Risiko: grafik dan status sukses sama-sama hijau, perlu disiplin warna ekstra.

Pilihan C - Arang + Emas
- Utama: Arang #1F2937, Aksen: Emas #C9980A, Latar: #F9FAFB.
- Alasan: paling tegas dan premium. Risiko: terasa lebih berat / gelap untuk staff di lapangan.

Ketiga pilihan memakai aturan yang sama: Pendapatan Usaha selalu ditampilkan dengan warna aksen emas, peringatan selalu merah, dan tidak mengandalkan warna saja (selalu ada label teks).

## 3. PWA Ready - Maksudnya dan Isinya
PWA artinya app web ini bisa di-install dari browser HP ke layar utama, ikonnya seperti aplikasi biasa, tanpa Play Store.

Yang dipasang agar disebut PWA ready:
1. manifest: nama app, ikon 192px dan 512px, warna tema, tampilan standalone (tanpa address bar browser).
2. Service Worker browser (file kecil bernama sw.js, berjalan di HP pengguna, bukan di server): menyimpan tampilan app (shell) agar app terbuka instan dan tetap bisa dibuka saat sinyal hilang.
3. Desain responsif dan aman untuk notch / safe area HP.

Batasan jujur PWA di sini:
- Data hasil tambang tersimpan terpusat di D1, jadi untuk SIMPAN data tetap butuh internet. Itu disengaja, agar Admin langsung bisa memantau.
- Usulan Tahap 2: antrean offline. Jika sinyal hilang di lokasi tambang, input disimpan dulu di HP dan terkirim otomatis saat sinyal kembali, dengan tanda status Belum Terkirim / Terkirim. Ini fitur tambahan, bukan bagian fondasi awal.

## 4. Apakah Perlu Banyak Worker di Cloudflare?
Tidak. Cukup 1 Worker saja.

Penjelasan istilah: Worker di Cloudflare adalah program server kecil kita, bukan pekerja tambang. Satu Worker bisa melayani semua hal ini sekaligus karena alamatnya satu (same-origin):
- Menyajikan tampilan PWA (HTML, CSS, JS, ikon, manifest, sw.js)
- API login dan sesi
- API input harian, dashboard, riwayat, dan laporan
- Halaman laporan khusus print untuk PDF
- Terhubung ke 1 database D1

Kenapa tidak perlu banyak Worker:
- Bebannya sangat kecil. 2 team x 1 input per hari = sekitar 60 input per bulan, plus Admin membuka dashboard. Batas gratis Cloudflare adalah 100.000 request per hari. Headroom-nya ribuan kali lipat.
- 1 Worker = 1 kali deploy, 1 alamat web, login lebih sederhana, tidak ada urusan CORS antar layanan, dan perawatan jauh lebih mudah.
- Sebagai perbandingan, dashboard Refleksi Ruang memakai 3 Worker karena kebutuhannya memang terpisah (data judul, analisa, tampilan). App tambang ini lebih sederhana dan terpusat, jadi memecahnya hanya menambah rumit tanpa manfaat.

Kapan baru perlu Worker kedua (nanti, jika dibutuhkan):
- Worker Cron terjadwal terpisah untuk backup otomatis D1 atau rekap yang dikirim berkala.
- Jika suatu hari team bertambah jadi puluhan dan laporan tahunan terasa berat, bagian laporan bisa dipecah. Untuk 2 team, ini tidak relevan.

Struktur akhir yang diusulkan:
- 1 Worker: tambang-emas (nama bisa diganti)
- 1 Database D1: tambang-emas-db (tabel users, teams, daily_results, distribution_rows, distribution_templates, settings)
- 0 layanan berbayar tambahan. Biaya berjalan: Rp 0 di batas gratis.

## 5. Skema Data Final (tanpa Rupiah)
- users: id, nama, username, password_hash, role, team_id, aktif
- teams: id, nama, aktif. Awal: Team 1, Team 2.
- daily_results: id, team_id, diinput_oleh, tanggal, hasil_gram, catatan. Unik: team_id + tanggal.
- distribution_rows: id, daily_result_id, nama_custom, persentase, jumlah_orang, total_gram, per_orang_gram, urutan
- distribution_templates: id, team_id, nama_custom, persentase, jumlah_orang_default, urutan
- settings: kunci, nilai (nama usaha, label sisa = Pendapatan Usaha, logo PDF)

## 6. Posisi dan Peran Catatan / Keterangan - Dikunci

Urutan form Input Harian dari atas ke bawah:
1. Tanggal
2. Hasil Emas (gr)
3. Baris Pembagian (nama kelompok, persen, jumlah orang) - bisa tambah / hapus baris
4. Bar progres total persen dan Pendapatan Usaha
5. Catatan / Keterangan - kotak teks besar (textarea, minimal 3 baris, bisa membesar) di paling bawah form
6. Ringkasan hitungan hari itu
7. Tombol Simpan (menempel di bawah layar)

Detail kolom Catatan:
- Labelnya jelas: Catatan / Keterangan.
- Contoh isi (ditampilkan sebagai petunjuk di dalam kotak): Kendala alat, cuaca, lokasi galian, pergantian pekerja, kejadian khusus hari itu.
- Sifatnya tidak wajib diisi, tapi selalu ditawarkan. Jika kosong, di PDF tertulis strip atau keterangan Catatan kosong, agar jelas memang tidak ada catatan, bukan hilang.
- Catatan tersimpan di daily_results.catatan, terikat pada tanggal dan team tersebut, dan ikut terambil di setiap query laporan.

Catatan di PDF:
- Prinsip anti duplikat (keputusan Hades 22 Okt 2026 malam): dalam satu laporan, catatan TIDAK BOLEH tampil dua kali. Jika tabel utama sudah punya kolom Catatan, catatan tidak ditulis ulang dalam daftar terpisah di bawahnya.
- PDF Harian: Catatan tampil utuh dalam kotak khusus berjudul Catatan / Keterangan, di bawah tabel pembagian, teks penuh tidak dipotong.
- PDF 30 Hari (landscape, design v4): kolom terakhir tabel utama bernama Catatan (bukan Keterangan), isinya catatan per shift pada baris tanggal itu (format S1: ... | S2: ...). TIDAK ada seksi daftar catatan terpisah di bawah tabel, karena sudah terwakili di kolom itu. Di bawah tabel hanya ada Total Per Kelompok dan tanda tangan.
- PDF Bulanan dan Rentang Waktu format ringkas (yang tabel utamanya tidak punya kolom catatan): catatan tampil sebagai bagian Daftar Catatan Harian per tanggal di bawah tabel utama.
- PDF Tahunan: rekap utama per bulan tetap ringkas. Catatan harian masuk sebagai lampiran di akhir, dikelompokkan per bulan.
- Di Riwayat aplikasi, ikon / cuplikan catatan terlihat di daftar hari, dan catatan penuh terlihat saat data hari itu dibuka. Admin juga melihat catatan dari semua team.

## 7. Optimasi Hasil Audit dan Smoke Test (22 Okt 2026, prototype 20/20 lolos)
Wajib fondasi: desimal koma Indonesia + 3 desimal (pembulatan masuk Pendapatan Usaha), tombol Pakai Pembagian Kemarin, mode Hari Tanpa Hasil (status khusus di Admin, alasan di Catatan), chip cepat Catatan, ringkasan sebelum simpan, status input per team di Admin.
Penting versi pertama: riwayat perubahan per tanggal (siapa, kapan, nilai lama ke baru), kolom tanda tangan + waktu cetak di PDF, total per kelompok di laporan periode, ekspor CSV/Excel, pengaturan nama usaha dan logo kop PDF.
Tahap berikutnya: antrean offline, cadangan D1 otomatis, pengingat team belum input, mode gelap khusus Admin.
Detail dan bukti uji: your_files/optimasi-dan-smoke-test-tambang-emas.md dan folder app-tambang-emas/smoke-test/ (screenshot staff, admin, laporan, PDF contoh, hasil 20/20).

## 8. Keputusan Stack dan CRUD Staff (22 Okt 2026 sore)
- Frontend DIPUTUSKAN memakai Vue 3 (bukan vanilla seperti prototype pertama). Alasan: hitungan pembagian bersifat reaktif (computed) tanpa kode hitung ulang manual, baris pembagian adalah komponen yang dipakai ulang untuk buat/edit/laporan, dan UI modern lebih mudah dijaga konsisten. Stack ini juga sama dengan RekamEdu (Vue 3) sehingga pola kerja sudah dikenal.
- Di Cloudflare tetap 1 Worker: hasil build Vue (file statis) disajikan Worker yang sama bersama API dan D1. Vue berjalan di browser pengguna, tidak menambah Worker dan tidak menambah biaya. Ukuran Vue produksi sekitar 156 KB, dimuat sekali lalu disimpan service worker PWA.
- CRUD Staff DIKUNCI lengkap untuk data team-nya sendiri:
  1. Create: input harian baru. Tanggal yang sudah ada tidak membuat duplikat, sistem masuk Mode Edit untuk data tanggal itu.
  2. Read: halaman Riwayat per team (kartu per hari: hasil, ringkasan pembagian, Pendapatan Usaha, catatan, cap terakhir diubah) + Detail yang membuka laporan/PDF hari itu.
  3. Update: Mode Edit membuka data lama apa adanya; yang bisa diubah: tanggal, hasil gram, mode tanpa hasil, NAMA kelompok, PERSEN, JUMLAH ORANG (stepper), tambah/hapus kelompok, dan catatan. Setiap simpan edit wajib menulis riwayat perubahan (nilai lama ke nilai baru) dan memberi cap Terakhir diubah.
  4. Delete: hanya lewat modal konfirmasi yang menampilkan ringkasan data yang akan dihapus. Data hilang dari daftar, tetapi jejak HAPUS tetap ada di riwayat perubahan dan di versi asli Admin bisa melihat catatan staff yang terhapus.
- Prototype v2 Vue + CRUD sudah dibangun dan lolos smoke test 20/20 (folder app-tambang-emas/prototype-v2 dan smoke-test-v2). Data prototype disimpan di localStorage browser sebagai simulasi API D1.

## 9. Shift, Laporan Rentang, Pagination, dan Responsif (22 Okt 2026 malam, prototype v3 lolos 29/29)
- SHIFT DIKUNCI: 1 hari bisa 2 catatan per team, yaitu Shift 1 dan Shift 2. Kunci unik berubah menjadi team + tanggal + shift (sebelumnya team + tanggal). Menginput tanggal dan shift yang sama masuk Mode Edit, bukan duplikat. Shift lain di tanggal yang sama tidak terpengaruh saat satu shift diedit atau dihapus.
- Setiap shift berdiri sendiri: hasil gram sendiri, baris pembagian sendiri (jumlah operator dan pekerja lain fleksibel per shift, boleh beda antar shift), mode Tanpa Hasil per shift, dan catatan per shift.
- Dashboard menampilkan total hari ini gabungan kedua shift plus status per shift (sudah / belum input beserta gramnya). Admin melihat status shift ini per team.
- LAPORAN STAFF: laporan utama staff adalah HARIAN (per hari, rincian per shift: kelompok, persen, orang, total, per orang, catatan per shift). Preset cepat yang disediakan: 1 Hari, 7 Hari, 30 Hari, Bulan Ini (bulan kalender), dan Custom (tanggal dari - sampai bebas). PDF menyesuaikan otomatis: 1 hari = rincian penuh per shift; rentang = tabel per tanggal dengan kolom Shift 1, Shift 2, Total Hari, Pendapatan Usaha, ditambah tabel total per kelompok selama rentang dan Daftar Catatan per shift. Admin memakai preset yang sama untuk semua team / per team.
- PAGINATION RIWAYAT DIKUNCI: pilihan 5 / 10 / 20 per halaman, keterangan Menampilkan X-Y dari Z catatan, tombol Sebelumnya / Berikutnya dan nomor halaman, filter Shift (Semua / 1 / 2) dan pencarian (catatan, nama kelompok, tanggal). Ganti filter mengembalikan ke halaman 1. Di versi asli pagination berjalan di server (API per halaman) supaya tetap ringan saat data sudah ribuan.
- RESPONSIF DIKUNCI 3 ukuran:
  1. HP (sampai 640px): kartu bertumpuk, navigasi bawah, tombol besar seperti sebelumnya.
  2. Tablet (641-1024px): lebar 860px, kartu riwayat grid 2 kolom, filter 3 kolom sejajar, angka hero lebih besar.
  3. PC (1025px ke atas): lebar 1180px, riwayat berubah menjadi TABEL data (tanggal, shift, hasil, pembagian, Pendapatan Usaha, catatan, aksi), form input 2 kolom dengan ringkasan menempel di kanan, navigasi menjadi bar atas.
- Skema data berubah: daily_results menambah kolom shift (1/2), unik team_id + tanggal + shift. Nama tabel di versi asli disarankan shift_results atau tetap daily_results dengan kolom shift.
- Prototype v3: app-tambang-emas/prototype-v3, smoke test 29/29 termasuk total gabungan shift, cegah duplikat per shift, pagination 17 catatan, laporan 1 hari 100 gr, 7 hari 607,500 gr, 30 hari 687,500 gr, bulanan dan custom September 150,000 gr, layout tablet dan PC.

## 10. Shift Terkunci, Bukan Jam (keputusan Hades 22 Okt 2026 malam)
- Label shift DIKUNCI tetap: Shift 1 dan Shift 2. BUKAN hitungan jam, tidak ada label Pagi / Malam dan tidak ada jam mulai - selesai. Admin tidak mengatur jam shift. Yang membedakan shift hanya nomornya, dan setiap shift tetap punya hasil, pembagian, dan catatan sendiri.

## 11. Design Ulang Tabel (22 Okt 2026 malam, prototype v4 lolos 17/17)
- Tabel Rincian Transaksi (tampilan PC/tablet Admin dan Staff): dikelompokkan per tanggal dengan pita navy berisi total hari dan Pendapatan Usaha hari itu; kolom angka rata kanan font mono; baris zebra; header menempel saat scroll; setiap baris shift punya tombol buka rincian yang menampilkan tabel mini per kelompok (persen, orang, total, per orang) + catatan shift + cap terakhir diubah, tanpa pindah halaman; pagination dihitung PER HARI (pilihan 5/10/30 hari) agar grup tanggal tidak terpotong di tengah.
- Tabel PDF 30 Hari: format A4 LANDSCAPE. Urutan isi: kop, strip KPI (total 30 hari, Pendapatan Usaha, rata-rata per hari, hari aktif / shift tercatat), tabel utama 30 baris (No, Tanggal, Shift 1, Shift 2, Total Hari, Terbagi, Pendapatan Usaha, Keterangan ringkas per shift), SUBTOTAL tiap 7 hari di dalam tabel (5 baris subtotal termasuk sisa 2 hari), baris TOTAL 30 HARI, lalu dua kotak sejajar: total per kelompok 30 hari dan daftar catatan penting, ditutup tanda tangan. Laporan 1 hari dan 7 hari tetap portrait/ringkas seperti sebelumnya, khusus rentang 30 hari dan tahunan yang memakai pola landscape ini bila kolomnya padat.
- TEMUAN BUG PENTING dari smoke test v4: tanggal yang dibentuk dari toISOString() bergeser mundur 1 hari di zona waktu UTC+7 (WIB), sehingga data contoh sempat tampil di tanggal yang salah. Perbaikannya: tanggal selalu dibentuk dari komponen lokal (tahun-bulan-tanggal perangkat). Aturan ini WAJIB diingat di versi asli karena semua pengguna berada di WIB: jangan pernah menurunkan tanggal dari string UTC.
- REVISI Hades (22 Okt 2026 malam, setelah v4 disetujui): kolom terakhir tabel PDF bernama Catatan (bukan Keterangan), dan daftar catatan TIDAK diulang di bawah tabel. Kotak bawah hanya Total Per Kelompok. Smoke test v4 naik menjadi 20/20 dengan pengujian catatan tampil tepat 1 kali. Prinsip anti duplikat catatan berlaku untuk semua laporan.

## 11b. Desimal, Zona Waktu, Pengaturan Custom, dan PDF Teks (dikunci 22 Okt 2026 malam)

Desimal: resminya KOMA untuk desimal dan titik untuk pemisah ribuan (standar Indonesia), tapi input toleran: 12,5 dan 12.5 sama-sama terbaca 12,5; 1.250,5 terbaca 1250,5; 1.500 terbaca ribuan; 0,015 / 0.015 terbaca desimal karena diawali 0. Aturan sama untuk kolom persen. Di database angka disimpan sebagai angka murni tanpa format; format koma/ribuan hanya tampilan (selalu 3 angka di belakang koma: 1.250,500 gr). Uji desimal khusus 6/6 PASS, smoke v3 tetap 29/29 PASS.

Zona waktu dan timestamp: server Cloudflare berjalan UTC; semua waktu disimpan UTC dan semua tampilan dikonversi ke zona waktu usaha yang diatur Admin: Asia/Jakarta (WIB), Asia/Makassar (WITA), Asia/Jayapura (WIT), default WIB. Hari ini, batas laporan, dan riwayat perubahan mengikuti zona waktu usaha, bukan jam perangkat. Format tanggal: 22 Oktober 2026. Format jam: 19.40.26 (pemisah titik, 24 jam). Footer cetak PDF wajib: "Dicetak pada 22 Oktober 2026 - pukul 19.40.26 WIB" dengan label mengikuti zona usaha. Teruji: ganti zona ke WIT mengubah footer menjadi 21.40 WIT.

Pengaturan custom oleh Admin (tersimpan di database, bukan hardcode): nama perusahaan dan logo untuk kop PDF, nama pimpinan untuk tanda tangan kanan Mengetahui, zona waktu usaha, semuanya di tabel settings. Nama staff untuk tanda tangan kiri Diinput oleh diambil dari users.nama akun yang menginput. Mengubah pengaturan langsung mengubah PDF berikutnya. Demo pengaturan ini ada di prototype v4 dan teruji 24/24 PASS.

PDF adalah TEKS: dibuat dari HTML teks yang dicetak browser / dirender dari teks, bukan gambar atau screenshot. Isi bisa diseleksi dan dicari, tajam di segala zoom, file kecil. Bukti teruji: ekstraksi teks dari PDF contoh mengembalikan persis kop perusahaan custom, total 2.560,500 gr, nama pimpinan, dan footer timestamp sebagai teks.

## 11c. CI/CD dan Pengelolaan Database (dikunci 22 Okt 2026 malam)

CI/CD = Pilihan 2: Cloudflare Workers Builds.
- Repo GitHub falconafk31/inputin dihubungkan ke Cloudflare (dilakukan Hades sekali di dashboard Cloudflare saat Worker versi asli dibuat). Setiap push ke branch main memicu build dan deploy otomatis oleh Cloudflare. Tidak memakai GitHub Actions dan tidak ada token Cloudflare yang disimpan di GitHub.
- Kode dan database adalah dua jalur terpisah. Deploy otomatis hanya mengurus KODE (Worker + frontend). Database D1 TIDAK ikut berubah karena push.

Database dikelola Pax dari sini lewat Cloudflare API (token custom.cloudflare, izin D1 Read + Write, pola yang sama dengan D1 dashboard Refleksi Ruang):
- Pembuatan database D1 pertama kali: dari sini.
- Pembuatan dan perubahan skema (migrasi tabel): dari sini, dijalankan manual dan diverifikasi, TIDAK otomatis dari push, supaya perubahan struktur tidak pernah merusak data yang sudah masuk.
- Inject data awal (seed): dari sini - 2 team awal, akun Admin, akun staff awal, template pembagian, dan settings default (nama perusahaan, pimpinan, zona waktu WIB).
- Seterusnya Pax bisa membaca, mengecek, membackup (export), dan memperbaiki data dari sini kapan pun diminta. Data operasional harian tetap masuk lewat input staff di app, bukan lewat inject.

## 13. Status Produksi (22 Okt 2026 malam, perintah Hades: lanjut build)

- App versi asli SUDAH DIBANGUN dan LIVE di https://inputin.hadesxyz.workers.dev (Worker `inputin`, deploy awal via API oleh Pax untuk verifikasi; CI jangka panjang = Workers Builds dari GitHub, Hades menyambungkan repo ke Cloudflare).
- Database D1 `inputin-db` (7dc53776-ebab-417d-be8f-18d5f2942782) dibuat + skema (migrations/0001_schema.sql) + seed oleh Pax lewat API: 2 team, akun admin + staff1 + staff2 (password acak di credentials-awal.txt lokal, tidak di-commit), settings default zona Asia/Jakarta.
- Kode: src/worker.js (API + auth PBKDF2 + sesi cookie + audit), frontend Vue satu file dari app/template.html + app/app.js dirakit scripts/build.mjs ke public/index.html + src/frontend.js. wrangler.toml siap untuk Workers Builds (build command: npm run build; deploy command: npx wrangler deploy).
- Uji live end-to-end 19/19 PASS (scripts/e2e-live.py): login benar/salah, contoh Hades 100 gr menghasilkan Operator 6,000 dan Pendapatan Usaha 90,000, persen di atas 100 ditolak, simpan ulang = update, isolasi staff antar team, laporan, audit buat/ubah, tanpa hasil wajib alasan, soft delete, admin status, staff ditolak dari endpoint admin. Data uji dibersihkan setelah tes.
- Uji UI live 7/7 PASS (scripts/ui-live.mjs): login tampil, login staff masuk form, ringkasan 6,000/90,000 tampil, laporan + riwayat termuat, tanpa error JS. Bug nyata yang ditemukan dan diperbaiki selama uji: v-if dan v-for dalam satu elemen tr ringkasan (Vue 3 membaca v-if lebih dulu sehingga render crash) - diganti pola template pembungkus.

## 12. Keputusan Berikutnya untuk Diskusi
1. Palet warna: A (Navy + Emas, rekomendasi), B (Hijau Tua + Emas), atau C (Arang + Emas)?
2. Nama app dan alamat web yang diinginkan? Contoh: tambang.hadesxyz.workers.dev atau nama usaha sendiri.
3. Antrean offline untuk lokasi minim sinyal: masuk fondasi awal atau Tahap 2 saja?

## Keputusan Diskusi UI/PDF (22 Okt 2026 malam, via nvidia sesi inputin-ui-pdf - menunggu persetujuan final Hades)
- Menu profil: 3 tombol topbar (Bersihkan Cache, Ganti Password, Keluar) dibungkus jadi ikon avatar kanan atas; menu berisi header identitas (nama, role, team), Ganti Password, Bersihkan Cache (tetap tingkat pertama, label jelas), Keluar. Bersihkan Cache tetap juga ada di layar login sebagai jalur penyelamat utama.
- PDF ringan: bundle jsPDF + font dipisah dari file utama, dilayani Worker yang sama di rute aset khusus, dimuat malas saat tombol Unduh pertama ditekan lalu di-cache service worker. Worker proxy terpisah DITOLAK (kompleksitas tanpa manfaat); generate PDF full di server DITOLAK (latensi).
- Pagar font: teks utama min 15px, label/sekunder 14px, angka kunci 20px+, target sentuh min 44px, kontras min 4,5:1.

## Koreksi Diskusi 9router (23 Okt 2026 pagi - menguji nvidia, menjadi acuan final yang disarankan)
- Pola menu profil: BOTTOM SHEET (bukan dropdown). Back Android menutup sheet; Keluar dipisah garis + warna bahaya + konfirmasi; footer sheet menampilkan versi app.
- Bersihkan Cache: label "Perbaiki Aplikasi (Bersihkan Cache)" + subteks "Data tersimpan tidak hilang"; DIBLOKIR saat offline (guard wajib, berlaku juga di layar login).
- PDF client lazy: 3 aset terpisah bernama hash isi (vendor/font biner/template), hash di-embed app saat build, cache PDF terpisah immutable, handshake PDF_API_VERSION, tanpa skipWaiting otomatis. Fallback unduh pertama: info ukuran, progress, Batal, timeout 20 dtk + Coba Lagi, SRI. Font dilayani biner (bukan base64, hemat ~33%). Prefetch idle hanya admin/pimpinan (4G, tanpa saveData); staff on-demand.
- Server-side PDF: DITUNDA (CPU Workers Free ~10ms tidak cukup); evaluasi ulang bila berbayar, butuh dokumen resmi/tautan WhatsApp, atau freeze terukur di HP target.
- Kontras amber: teks amber di bidang terang = #B45309; teks pada tombol amber = gelap; #D97706 hanya untuk isian/ikon/garis.
- Font final: utama 15px, label 14px, angka hasil 20px Fira Code 600 (ligatur mati), angka tabel laporan 14px, baris tabel min 44px, kolom angka rata kanan.
