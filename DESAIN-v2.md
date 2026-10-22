# Desain App Pencatatan Hasil Tambang Emas
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
- PDF Harian: Catatan tampil utuh dalam kotak khusus berjudul Catatan / Keterangan, di bawah tabel pembagian, teks penuh tidak dipotong.
- PDF Bulanan dan Rentang Waktu: tabel utama tetap ringkas tanpa kolom catatan yang sempit. Di bawah tabel utama ada bagian khusus Daftar Catatan Harian, isinya per tanggal: tanggal - isi catatan hari itu. Dengan cara ini catatan panjang tidak merusak tabel dan tidak ada yang terpotong.
- PDF Tahunan: rekap utama per bulan tetap ringkas. Catatan harian masuk sebagai lampiran di akhir, dikelompokkan per bulan.
- Di Riwayat aplikasi, ikon / cuplikan catatan terlihat di daftar hari, dan catatan penuh terlihat saat data hari itu dibuka. Admin juga melihat catatan dari semua team.

## 7. Keputusan Berikutnya untuk Diskusi
1. Palet warna: A (Navy + Emas, rekomendasi), B (Hijau Tua + Emas), atau C (Arang + Emas)?
2. Nama app dan alamat web yang diinginkan? Contoh: tambang.hadesxyz.workers.dev atau nama usaha sendiri.
3. Antrean offline untuk lokasi minim sinyal: masuk fondasi awal atau Tahap 2 saja?
