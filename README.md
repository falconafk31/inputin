# Inputin - App Pencatatan Hasil Tambang Emas

App pencatatan hasil tambang emas per team dan per shift, dengan pembagian hasil per kelompok, laporan harian sampai 30 hari, dan PDF teks siap cetak.

**Status saat ini: tahap diskusi dan prototype.** Semua keputusan desain sudah dikunci bersama pemilik usaha dan teruji lewat smoke test otomatis. Versi produksi (Cloudflare Workers + D1 + Vue 3) dibangun mengikuti dokumen desain di repo ini.

## Dokumen utama

- `DESAIN.md` - dokumen desain master: aturan bisnis, skema data, UI/UX, shift, laporan, desimal, zona waktu, pengaturan Admin, dan semua keputusan yang sudah dikunci.

## Prototype (buka file HTML-nya di browser)

| Folder | Isi | Hasil smoke test |
|---|---|---|
| `prototype/` | Prototype pertama (vanilla JS) | 20/20 PASS |
| `prototype-v2/` | Vue 3 + CRUD staff lengkap | 20/20 PASS |
| `prototype-v3/` | Vue 3 + 2 shift + laporan rentang + pagination + responsif tablet/PC | 29/29 PASS, uji desimal 6/6 PASS |
| `prototype-v4/` | Design ulang tabel rincian transaksi + PDF 30 hari landscape | 24/24 PASS |

Folder `smoke-test*/` berisi script pengujian otomatis (Puppeteer), screenshot hasil, dan contoh PDF.

## Aturan bisnis inti (ringkasan, detail di DESAIN.md)

- Role Admin (semua team) dan Staff (terkunci di team sendiri). Awal 2 team.
- Satuan satu-satunya gram, tanpa konversi Rupiah. Sisa pembagian berlabel Pendapatan Usaha.
- 2 shift per hari, label tetap Shift 1 / Shift 2 (bukan hitungan jam). Setiap shift berdiri sendiri: hasil, pembagian, dan catatan sendiri.
- Pembagian per kelompok (persen x jumlah orang). Total persen maksimal 100%.
- Catatan wajib tampil di PDF dan tidak boleh tampil dua kali dalam satu laporan. Kolom terakhir tabel PDF bernama Catatan.
- Desimal resmi koma, titik untuk ribuan, input toleran keduanya. Tampilan selalu format Indonesia 3 angka di belakang koma.
- Zona waktu usaha diatur Admin (WIB / WITA / WIT). Footer PDF memuat timestamp cetak sesuai zona itu.
- PDF adalah teks asli (bisa diseleksi dan dicari), bukan gambar.
- Nama perusahaan, nama pimpinan, dan nama staff untuk kop dan tanda tangan PDF bisa di-custom Admin dari database.

## Rencana stack produksi

- Cloudflare Workers (1 Worker untuk PWA + API + halaman PDF) + database D1
- Frontend Vue 3, PWA ready, login per akun dengan role
- Password hash PBKDF2, audit trail setiap edit dan hapus
