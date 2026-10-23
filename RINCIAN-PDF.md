# Rincian PDF Laporan - Inputin (Pencatatan Hasil Usaha)

Dokumen ini merinci isi PDF yang dihasilkan halaman Laporan. Ada dua jenis PDF, keduanya dibuat langsung di perangkat pengguna (bukan di server) dari data laporan yang sedang tampil.

## Perbedaan Admin dan Staff

Format dan susunan PDF sama persis untuk semua role. Yang berbeda hanya cakupan datanya:

| Aspek | Admin | Staff |
|---|---|---|
| Pilihan team | Team mana pun, atau Semua Team (Satu Perusahaan) | Hanya team sendiri |
| Bagian Rekap Per Team | Muncul pada mode Semua Team | Tidak pernah muncul |
| Nama "Diinput oleh" | Nama akun admin yang login | Nama akun staff yang login |

## PDF Rentang (tombol "Unduh PDF Rentang Ini")

Kertas A4 landscape. Susunan dari atas ke bawah:

| No | Bagian | Isi |
|---|---|---|
| 1 | Kop | Nama perusahaan (dari Admin - Pengaturan; bila kosong: "Pencatatan Usaha"), judul "Laporan Hasil N Hari", subjudul team + rentang tanggal + "Shift 1 dan Shift 2" |
| 2 | KPI | 4 kotak: Total Hasil, Pendapatan Usaha, Rata-Rata Per Hari, Hari Aktif / Shift |
| 3 | Tabel utama (gabung) | Satu baris per hari, rincian kelompok menyatu di tabel ini - dirinci di bagian berikutnya |
| 4 | Catatan kaki bintang | Muncul hanya bila ada hari bertanda * (persen setelan beda antar shift) |
| 5 | Total Per Kelompok - Periode Ini | Per kelompok: persen rata-rata tertimbang + total terbagi; sub-baris "dengan persen X%" untuk tiap persen setelan yang pernah dipakai; ditutup baris Pendapatan Usaha (sisa) |
| 6 | Rekap Per Team - Satu Perusahaan | Team, Total Hasil, Terbagi, Pendapatan Usaha, Hari Aktif, Shift - hanya mode Semua Team |
| 7 | Lampiran - Rincian Per Shift untuk Persen Berbeda | Hanya hari bertanda * - dirinci di bagian berikutnya |
| 8 | Tanda tangan | "Diinput oleh" (nama akun yang login) dan "Mengetahui" (nama pimpinan dari Admin - Pengaturan) |
| 9 | Kaki halaman | "Dicetak pada <tanggal, jam, zona waktu usaha>", nama aplikasi, "Halaman X dari Y" |

### Tabel Utama (Gabung)

| Kolom | Isi | Keterangan |
|---|---|---|
| No | Nomor urut hari | |
| Tanggal | Tanggal hari itu | Format singkat, mis. 16 Okt 2026 |
| Shift 1 | Hasil Shift 1 (gram) | "-" bila shift tidak tercatat |
| Shift 2 | Hasil Shift 2 (gram) | "-" bila shift tidak tercatat |
| Total Pendapatan | Total hasil hari itu (Shift 1 + Shift 2) | |
| Per kelompok: % | Persen efektif kelompok hari itu | Total kelompok hari itu dibagi total hasil hari itu; ada tanda * bila persen setelan beda antar shift |
| Per kelompok: Hasil Bagi | Jumlah gram kelompok hari itu | Di bawah angka ada baris kecil abu-abu: jumlah orang dan jatah per orang (@) hari itu. Satu shift terisi: "4 orang · @ 0,420". Dua shift terisi: dua baris "S1: 5 orang @ 0,240" dan "S2: 6 orang @ 0,160" (jatah per orang memang per shift, tidak dirata-rata). Mode Semua Team: orang digabung lintas team, @ = total gram dibagi total orang. Baris Subtotal dan TOTAL tidak diberi baris kecil ini. Aturan disahkan Hades 23 Okt 2026 (v3.4.4) |
| Terbagi | Total gram terbagi ke semua kelompok hari itu | |
| Pendapatan Usaha | Sisa hari itu (Total Pendapatan - Terbagi) | |
| Catatan | Gabungan catatan Shift 1 dan Shift 2 hari itu | Diawali label team pada mode Semua Team |

Aturan baris:

- Kolom kelompok dinamis mengikuti data periode itu, diurutkan dari total terbagi terbesar. Kelompok yang tidak ada pada suatu hari tampil "-".
- Setiap 7 hari ada baris **Subtotal** (kuning): persen kelompok = persen efektif gabungan 7 hari itu, Hasil Bagi = jumlah gram 7 hari itu.
- Baris terakhir **TOTAL** (biru): persen kelompok = rata-rata tertimbang satu periode (sama dengan angka di bagian Total Per Kelompok), Hasil Bagi = total gram satu periode.
- Kelompok lebih dari 4: ukuran huruf tabel otomatis mengecil supaya semua kolom muat.

### Lampiran Persen Berbeda

Untuk tiap hari bertanda *, lampiran memuat satu blok: judul tanggal + hasil Shift 1 dan Shift 2 hari itu, lalu tabel kelompok yang persennya berbeda saja:

| Kolom | Isi |
|---|---|
| Kelompok | Nama kelompok yang persen setelannya berbeda |
| Shift 1 (persen - gram - orang · @) | Persen setelan Shift 1, gram yang diterima kelompok, lalu jumlah orang dan jatah per orang dalam kurung: "6% - 1,680 gr (4 orang · @ 0,420)" |
| Shift 2 (persen - gram - orang · @) | Sama untuk Shift 2 |

## PDF Harian (tombol "PDF Harian (Rincian Per Shift)")

Muncul bila rentang laporan tepat 1 hari. Kertas A4 portrait.

| No | Bagian | Isi |
|---|---|---|
| 1 | Kop | Sama seperti PDF rentang; judul "Laporan Hasil Harian", subjudul team + tanggal |
| 2 | Blok Shift 1 | Label shift (ada label "Tanpa Hasil" bila berlaku), hasil shift, tabel kelompok: Kelompok, %, Orang, Total (gr), Per Orang (gr); lalu Total terbagi + Pendapatan Usaha + Catatan shift itu |
| 3 | Blok Shift 2 | Sama seperti blok Shift 1 |
| 4 | Tanda tangan + kaki halaman | Sama seperti PDF rentang |

## Aturan Persen (berlaku di semua bagian)

- **Persen setelan**: persen yang diisi saat input, dipakai menghitung gram tiap kelompok per shift.
- **Persen efektif**: total gram kelompok dibagi total hasil pada cakupan yang sama (per hari, per subtotal, atau tertimbang satu periode). Angka ini yang tampil di kolom % tabel utama.
- **Rata-rata tertimbang**: total gram kelompok satu periode dibagi total hasil shift-shift yang memuat kelompok itu - bukan rata-rata biasa dari persen harian.
