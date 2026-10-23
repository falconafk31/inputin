const { createApp, ref, reactive, computed, watch, onMounted, nextTick } = Vue;

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: { "content-type": "application/json" }, ...opts });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.ok === false) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}
function fmt(n) { return (Number(n) || 0).toLocaleString("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 }); }
function fmtPct(n) { return (Number(n) || 0).toLocaleString("id-ID", { maximumFractionDigits: 2 }); }
function parseID(v) {
  v = String(v ?? "").trim().replace(/\s/g, ""); if (!v) return 0;
  const hasDot = v.includes("."), hasComma = v.includes(",");
  if (hasDot && hasComma) v = v.replace(/\./g, "").replace(",", ".");
  else if (hasComma) v = v.replace(",", ".");
  else if (hasDot) {
    const parts = v.split(".");
    if (parts.length > 2) v = v.replace(/\./g, "");
    else if (parts[1].length === 3 && parts[0] !== "0" && parts[0] !== "") v = v.replace(".", "");
  }
  const n = parseFloat(v); return isNaN(n) ? 0 : n;
}
const BULAN = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const BULAN_P = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des","Des"];
function tglPanjang(t) { if (!t) return "-"; const [y, m, d] = t.split("-").map(Number); return d + " " + BULAN[m - 1] + " " + y; }
function tglSingkat(t) { if (!t) return "-"; const [y, m, d] = t.split("-").map(Number); return d + " " + BULAN_P[m - 1] + " " + y; }
function addDays(t, n) { const [y, m, d] = t.split("-").map(Number); const dt = new Date(y, m - 1, d + n); const p = (x) => String(x).padStart(2, "0"); return dt.getFullYear() + "-" + p(dt.getMonth() + 1) + "-" + p(dt.getDate()); }
const ZONA_LABEL = { "Asia/Jakarta": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" };

createApp({
  setup() {
    const user = ref(null);
    const busy = ref(false);
    const flash = ref(null);
    const view = ref("input");
    const loginForm = reactive({ username: "", password: "" });
    const loginError = ref("");
    const settings = reactive({ nama_perusahaan: "", nama_pimpinan: "", zona_waktu: "Asia/Jakarta", zona_label: "WIB" });
    const teams = ref([]);
    const today = ref("");
    const SVG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">';
    const ICONS = {
      input: SVG_OPEN + '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>',
      riwayat: SVG_OPEN + '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>',
      laporan: SVG_OPEN + '<line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
      admin: SVG_OPEN + '<line x1="21" y1="4" x2="14" y2="4"/><line x1="10" y1="4" x2="3" y2="4"/><line x1="21" y1="12" x2="12" y2="12"/><line x1="8" y1="12" x2="3" y2="12"/><line x1="21" y1="20" x2="16" y2="20"/><line x1="12" y1="20" x2="3" y2="20"/><line x1="14" y1="2" x2="14" y2="6"/><line x1="8" y1="10" x2="8" y2="14"/><line x1="16" y1="18" x2="16" y2="22"/></svg>',
    };
    const tabs = computed(() => {
      const t = [{ id: "input", label: "Input", icon: ICONS.input }, { id: "riwayat", label: "Riwayat", icon: ICONS.riwayat }, { id: "laporan", label: "Laporan", icon: ICONS.laporan }];
      if (user.value && user.value.role === "admin") t.push({ id: "admin", label: "Admin", icon: ICONS.admin });
      return t;
    });
    function setFlash(text, type = "ok") { flash.value = { text, type }; setTimeout(() => { if (flash.value && flash.value.text === text) flash.value = null; }, 4500); }

    // ===== Form Input =====
    const chipCatatan = ["Hujan", "Alat rusak", "BBM habis", "Pekerja izin"];
    let uidBarisCounter = 0;
    function barisBaru(nama, persenStr, orangStr) { return { uid: ++uidBarisCounter, nama: nama || "", persenStr: persenStr || "", orangStr: orangStr || "" }; }
    const form = reactive({ team_id: null, tanggal: "", shift: 1, tanpa_hasil: false, hasilStr: "", catatan: "", rows: [barisBaru("Operator", "6", "6"), barisBaru("Helper", "4", "5")] });
    const modeEdit = ref(false);
    const editingId = ref(null);
    const asliEdit = ref(null); // Salinan data tersimpan saat Mode Edit dimuat - pembanding untuk daftar perubahan sebelum submit.
    const pernahSimpan = ref(false);
    const prefillInfo = ref("");
    const acc = reactive({ matriks: false, kelompok: false, perteam: false, pengaturan: false, team: false, user: false, template: false });
    const teamLabelAktif = computed(() => {
      const t = teams.value.find((x) => x.id === form.team_id);
      return user.value && user.value.role === "staff" ? (user.value.team_nama || "") : (t ? t.nama : "");
    });
    function rowCalc(d) { const hasil = form.tanpa_hasil ? 0 : parseID(form.hasilStr); const persen = parseID(d.persenStr); const orang = parseInt(d.orangStr) || 0; const total = Math.round(hasil * persen / 100 * 1000) / 1000; return { total, perOrang: orang > 0 ? Math.round(total / orang * 1000) / 1000 : 0 }; }
    const totalHasilForm = computed(() => form.tanpa_hasil ? 0 : parseID(form.hasilStr));
    const totalPersenForm = computed(() => form.rows.reduce((a, d) => a + parseID(d.persenStr), 0));
    const sisaGram = computed(() => Math.round((totalHasilForm.value - form.rows.reduce((a, d) => a + rowCalc(d).total, 0)) * 1000) / 1000);
    const sisaPersen = computed(() => 100 - totalPersenForm.value);
    const peringatanForm = computed(() => {
      const w = [];
      if (!form.tanpa_hasil && form.hasilStr.trim() !== "" && parseID(form.hasilStr) === 0) w.push("Hasil terisi 0 gram tetapi Mode Tanpa Hasil mati. Kalau memang tidak ada hasil, aktifkan Mode Tanpa Hasil dan isi alasannya di catatan.");
      for (const r of form.rows) { if (r.nama && parseID(r.persenStr) > 0 && !(parseInt(r.orangStr) > 0)) w.push("Kelompok " + r.nama + ": persentase terisi tetapi jumlah orang masih 0."); }
      if (pernahSimpan.value && !form.catatan.trim()) w.push("Catatan masih kosong - catatan wajib diisi.");
      return w;
    });
    function tambahChip(c) { form.catatan = form.catatan ? (form.catatan.replace(/[.\s]+$/, "") + ". " + c + ".") : (c + "."); }
    async function cekModeEdit() {
      if (!form.team_id || !form.tanggal) return;
      try {
        const d = await api(`/api/entries/one?team_id=${form.team_id}&tanggal=${form.tanggal}&shift=${form.shift}`);
        if (d.entry) {
          prefillInfo.value = "";
          modeEdit.value = true; editingId.value = d.entry.id;
          form.tanpa_hasil = !!d.entry.tanpa_hasil;
          form.hasilStr = d.entry.tanpa_hasil ? "" : String(d.entry.hasil_gram).replace(".", ",");
          form.catatan = d.entry.catatan || "";
          form.rows = d.entry.rows.length ? d.entry.rows.map((r) => barisBaru(r.nama, String(r.persentase).replace(".", ","), String(r.jumlah_orang))) : [barisBaru("", "", "")];
          asliEdit.value = { tanpa_hasil: !!d.entry.tanpa_hasil, hasil_gram: d.entry.hasil_gram || 0, catatan: d.entry.catatan || "", rows: (d.entry.rows || []).map((r) => ({ nama: r.nama, persentase: r.persentase, jumlah_orang: r.jumlah_orang })) };
        } else {
          // Slot kosong: bila form sebelumnya memuat entri (Mode Edit), bersihkan hasil + catatan + mode tanpa hasil
          // agar angka entri lama tidak terbawa ke slot baru. Isian segar yang belum tersimpan (bukan Mode Edit) dibiarkan.
          if (modeEdit.value) { form.tanpa_hasil = false; form.hasilStr = ""; form.catatan = ""; }
          modeEdit.value = false; editingId.value = null; asliEdit.value = null; await prefillTerakhir();
        }
      } catch (e) { /* abaikan */ }
    }
    async function prefillTerakhir() {
      prefillInfo.value = "";
      try {
        const d = await api(`/api/entries/copy-source?team_id=${form.team_id}&tanggal=${form.tanggal}&shift=${form.shift}`);
        if (d.rows && d.rows.length) {
          form.rows = d.rows.map((r) => barisBaru(r.nama, String(r.persentase).replace(".", ","), String(r.jumlah_orang)));
          prefillInfo.value = "Pembagian terisi otomatis dari " + tglPanjang(d.dari_tanggal) + " - periksa dulu sebelum menyimpan.";
        }
      } catch (e) { /* abaikan */ }
    }
    async function pakaiSumber(jenis) {
      prefillInfo.value = "";
      try {
        if (jenis === "kemarin") {
          const d = await api(`/api/entries/copy-source?team_id=${form.team_id}&tanggal=${form.tanggal}&shift=${form.shift}`);
          if (!d.rows.length) return setFlash("Belum ada data pembagian sebelumnya untuk disalin.", "err");
          form.rows = d.rows.map((r) => barisBaru(r.nama, String(r.persentase).replace(".", ","), String(r.jumlah_orang)));
          setFlash("Pembagian disalin dari " + tglPanjang(d.dari_tanggal) + ".");
        } else {
          const d = await api(`/api/templates?team_id=${form.team_id}`);
          if (!d.rows.length) return setFlash("Template team masih kosong. Template diatur Admin di halaman Admin.", "err");
          form.rows = d.rows.map((r) => barisBaru(r.nama, String(r.persentase).replace(".", ","), String(r.jumlah_orang)));
          setFlash("Template team dipakai.");
        }
      } catch (e) { setFlash(e.message, "err"); }
    }
    // ===== Template pembagian (dikelola Admin) =====
    const tplAdmin = reactive({ team_id: null, rows: [], loading: false });
    async function muatTplAdmin() {
      if (!tplAdmin.team_id) return;
      tplAdmin.loading = true;
      try {
        const d = await api(`/api/templates?team_id=${tplAdmin.team_id}`);
        tplAdmin.rows = d.rows.length ? d.rows.map((r) => barisBaru(r.nama, String(r.persentase).replace(".", ","), String(r.jumlah_orang))) : [barisBaru("", "", "")];
      } catch (e) { setFlash(e.message, "err"); }
      tplAdmin.loading = false;
    }
    async function simpanTplAdmin() {
      try {
        await api("/api/templates", { method: "PUT", body: JSON.stringify({ team_id: tplAdmin.team_id, rows: tplAdmin.rows.filter((r) => r.nama).map((r) => ({ nama: r.nama, persentase: parseID(r.persenStr), jumlah_orang: parseInt(r.orangStr) || 0 })) }) });
        setFlash("Template pembagian tersimpan untuk team ini.");
      } catch (e) { setFlash(e.message, "err"); }
    }
    // ===== Antrian simpan offline (tersimpan di HP, terkirim otomatis saat ada sinyal) =====
    const ANTRI_KEY = "inputin-antrian-v1";
    const antrian = ref([]);
    const antrianTampil = computed(() => user.value ? antrian.value.filter((a) => a.pemilik === user.value.username) : []);
    function kunciAntrian(a) { const p = a.payload || {}; return a.pemilik + "|" + p.team_id + "|" + p.tanggal + "|" + p.shift; }
    function muatAntrian() {
      try { antrian.value = JSON.parse(localStorage.getItem(ANTRI_KEY) || "[]"); } catch (e) { antrian.value = []; }
      // Rapatkan antrian lama yang menumpuk: satu kunci (pemilik+team+tanggal+shift) cukup satu item, yang berlaku yang terakhir disimpan.
      const terakhir = new Map();
      for (const a of antrian.value) terakhir.set(kunciAntrian(a), a);
      const bersih = antrian.value.filter((a) => terakhir.get(kunciAntrian(a)) === a);
      if (bersih.length !== antrian.value.length) { antrian.value = bersih; simpanAntrianLS(); }
    }
    function simpanAntrianLS() { try { localStorage.setItem(ANTRI_KEY, JSON.stringify(antrian.value)); } catch (e) {} }
    function tambahAntrian(payload) {
      const pemilik = user.value ? user.value.username : "";
      const kunci = pemilik + "|" + payload.team_id + "|" + payload.tanggal + "|" + payload.shift;
      const lama = antrian.value.find((a) => kunciAntrian(a) === kunci);
      if (lama) { lama.payload = payload; lama.dibuat = new Date().toISOString(); lama.status = "menunggu"; lama.pesan = ""; }
      else antrian.value.push({ id: Date.now() + "-" + Math.random().toString(36).slice(2, 8), pemilik, payload, dibuat: new Date().toISOString(), status: "menunggu", pesan: "" });
      simpanAntrianLS();
    }
    let sedangKirim = false;
    async function kirimAntrian() {
      if (sedangKirim || !user.value) return;
      const mine = antrian.value.filter((a) => a.pemilik === user.value.username && a.status !== "gagal");
      if (!mine.length) return;
      sedangKirim = true;
      let terkirim = 0;
      for (const item of [...mine]) {
        try {
          await api("/api/entries", { method: "POST", body: JSON.stringify(item.payload) });
          antrian.value = antrian.value.filter((a) => a.id !== item.id);
          simpanAntrianLS(); terkirim++;
        } catch (e) {
          if (e instanceof TypeError) break;
          item.status = "gagal"; item.pesan = e.message; simpanAntrianLS();
        }
      }
      sedangKirim = false;
      if (terkirim) { setFlash(terkirim + " input dari antrian berhasil terkirim."); await muatRiwayat(true); await muatAdminStatus(); await cekModeEdit(); }
    }
    function buangAntrian(id) { antrian.value = antrian.value.filter((a) => a.id !== id); simpanAntrianLS(); }
    function cobaLagiAntrian(id) { const it = antrian.value.find((a) => a.id === id); if (it) { it.status = "menunggu"; it.pesan = ""; simpanAntrianLS(); kirimAntrian(); } }

    // ===== Konfirmasi sebelum submit bila data tersimpan diubah (Mode Edit) =====
    const ubahTarget = ref(null);
    function hitungPerubahan() {
      const a = asliEdit.value; if (!a) return [];
      const out = [];
      const hasilNow = form.tanpa_hasil ? 0 : (parseID(form.hasilStr) || 0);
      if (!!a.tanpa_hasil !== !!form.tanpa_hasil) out.push("Mode Tanpa Hasil: " + (a.tanpa_hasil ? "Ya" : "Tidak") + " menjadi " + (form.tanpa_hasil ? "Ya" : "Tidak"));
      else if (!form.tanpa_hasil && Math.abs((a.hasil_gram || 0) - hasilNow) > 1e-9) out.push("Hasil: " + fmt(a.hasil_gram) + " gr menjadi " + fmt(hasilNow) + " gr");
      const rowsNow = form.rows.filter((r) => r.nama).map((r) => ({ nama: r.nama, persentase: parseID(r.persenStr) || 0, jumlah_orang: parseInt(r.orangStr) || 0 }));
      const mapA = Object.fromEntries(a.rows.map((r) => [r.nama, r]));
      const mapN = Object.fromEntries(rowsNow.map((r) => [r.nama, r]));
      for (const n of Object.keys(mapN)) {
        if (!(n in mapA)) out.push("Kelompok baru: " + n + " (" + fmtPct(mapN[n].persentase) + "%, " + mapN[n].jumlah_orang + " orang)");
        else {
          if (mapA[n].persentase !== mapN[n].persentase) out.push(n + ": persen " + fmtPct(mapA[n].persentase) + "% menjadi " + fmtPct(mapN[n].persentase) + "%");
          if (mapA[n].jumlah_orang !== mapN[n].jumlah_orang) out.push(n + ": jumlah orang " + mapA[n].jumlah_orang + " menjadi " + mapN[n].jumlah_orang);
        }
      }
      for (const n of Object.keys(mapA)) if (!(n in mapN)) out.push("Kelompok dihapus: " + n);
      if ((a.catatan || "") !== (form.catatan || "")) out.push("Catatan diubah");
      return out;
    }
    function simpan() {
      // Data baru (bukan Mode Edit) langsung disimpan seperti biasa. Mode Edit: tampilkan daftar perubahan dulu.
      // Kasus Tanpa Hasil tanpa catatan dilewatkan langsung agar pesan penolakan server tampil seperti sebelumnya.
      if (modeEdit.value && asliEdit.value && !(form.tanpa_hasil && !form.catatan.trim())) {
        const perubahan = hitungPerubahan();
        if (perubahan.length) { ubahTarget.value = { label: tglPanjang(form.tanggal) + " - Shift " + form.shift, perubahan }; return; }
      }
      lakukanSimpan();
    }
    function konfirmasiUbah() { ubahTarget.value = null; lakukanSimpan(); }
    async function lakukanSimpan() {
      pernahSimpan.value = true;
      busy.value = true;
      const payload = { team_id: form.team_id, tanggal: form.tanggal, shift: form.shift, tanpa_hasil: form.tanpa_hasil, hasil_gram: parseID(form.hasilStr), catatan: form.catatan, rows: form.rows.filter((r) => r.nama).map((r) => ({ nama: r.nama, persentase: parseID(r.persenStr), jumlah_orang: parseInt(r.orangStr) || 0 })) };
      try {
        await api("/api/entries", { method: "POST", body: JSON.stringify(payload) });
        // Simpan langsung berhasil: item antrian dengan kunci yang sama sudah kedaluwarsa, buang agar tidak menimpa data terbaru saat antrian terkirim nanti.
        const kunci = (user.value ? user.value.username : "") + "|" + payload.team_id + "|" + payload.tanggal + "|" + payload.shift;
        const sisaAntrian = antrian.value.filter((a) => kunciAntrian(a) !== kunci);
        if (sisaAntrian.length !== antrian.value.length) { antrian.value = sisaAntrian; simpanAntrianLS(); }
        setFlash((modeEdit.value ? "Perubahan tersimpan: " : "Tersimpan: ") + tglPanjang(form.tanggal) + " - Shift " + form.shift + ".");
        modeEdit.value = true;
        asliEdit.value = { tanpa_hasil: payload.tanpa_hasil, hasil_gram: payload.hasil_gram || 0, catatan: payload.catatan || "", rows: payload.rows.map((r) => ({ nama: r.nama, persentase: r.persentase, jumlah_orang: r.jumlah_orang })) };
        await muatRiwayat(true); await muatAdminStatus();
        kirimAntrian();
      } catch (e) {
        if (e instanceof TypeError || !navigator.onLine) {
          tambahAntrian(payload);
          setFlash("Tidak ada sinyal. Input tersimpan aman di HP (" + antrianTampil.value.length + " menunggu) dan akan terkirim otomatis saat sinyal kembali.", "err");
        } else setFlash(e.message, "err");
      }
      busy.value = false;
    }

    // ===== Riwayat =====
    const presets = [{ id: "1", label: "1 Hari" }, { id: "7", label: "7 Hari" }, { id: "30", label: "30 Hari" }, { id: "bulan", label: "Bulan Ini" }];
    const presetAktif = reactive({ riw: "1", lap: "1" });
    function setPreset(target, id) {
      presetAktif[target] = id;
      const o = target === "riw" ? riw : lap; const t = today.value;
      if (id === "1") { o.from = t; o.to = t; }
      else if (id === "7") { o.from = addDays(t, -6); o.to = t; }
      else if (id === "30") { o.from = addDays(t, -29); o.to = t; }
      else if (id === "bulan") { o.from = t.slice(0, 8) + "01"; o.to = t; }
    }
    const riw = reactive({ team_id: null, from: "", to: "", shift: "", q: "", per: 10, page: 1, days: [], total_hari: 0, total_page: 1, loading: false });
    const riwFilter = ref(false);
    const expanded = reactive({});
    const toggleExpand = (id) => { expanded[id] = !expanded[id]; };
    const halamanList = computed(() => { const out = []; const max = riw.total_page; for (let i = 1; i <= max; i++) { if (max <= 7 || i === 1 || i === max || Math.abs(i - riw.page) <= 1) out.push(i); } return out; });
    async function muatRiwayat(resetPage = false) {
      if (!riw.team_id || !riw.from || !riw.to) return;
      if (resetPage) riw.page = 1;
      riw.loading = true;
      try {
        const d = await api(`/api/entries?team_id=${riw.team_id}&from=${riw.from}&to=${riw.to}&shift=${riw.shift}&q=${encodeURIComponent(riw.q)}&per=${riw.per}&page=${riw.page}`);
        riw.days = d.days; riw.total_hari = d.total_hari; riw.total_page = d.total_page; riw.page = d.page;
      } catch (e) { setFlash(e.message, "err"); }
      riw.loading = false;
    }
    function formatWaktu(iso) {
      if (!iso) return "-";
      const parts = {};
      new Intl.DateTimeFormat("id-ID", { timeZone: settings.zona_waktu, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date(iso)).forEach((p) => { parts[p.type] = p.value; });
      return `${parts.day} ${parts.month} ${parts.year} - ${parts.hour}.${parts.minute} ${settings.zona_label}`;
    }
    function editEntry(s, tanggal) {
      form.team_id = s.team_id; form.tanggal = tanggal; form.shift = s.shift;
      view.value = "input"; cekModeEdit();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    const hapusTarget = ref(null);
    function mintaHapus(s, tanggal) { hapusTarget.value = { id: s.id, label: tglPanjang(tanggal) + " - Shift " + s.shift + " (" + fmt(s.hasil_gram) + " gr)" }; }
    async function konfirmasiHapus() {
      try { await api(`/api/entries/${hapusTarget.value.id}`, { method: "DELETE" }); setFlash("Data terhapus dan tercatat di riwayat perubahan."); hapusTarget.value = null; await muatRiwayat(); }
      catch (e) { setFlash(e.message, "err"); }
    }
    // ===== Konfirmasi hapus baris kelompok di form (tombol X) =====
    const hapusBarisTarget = ref(null);
    function mintaHapusBaris(i) {
      const d = form.rows[i]; if (!d) return;
      const terisi = (d.nama && d.nama.trim()) || (d.persenStr && d.persenStr.trim()) || (d.orangStr && d.orangStr.trim());
      if (!terisi) { form.rows.splice(i, 1); return; } // Baris yang masih kosong polos langsung terhapus, tidak perlu konfirmasi.
      hapusBarisTarget.value = { idx: i, nama: (d.nama || "").trim() || ("Kelompok " + (i + 1)) };
    }
    function konfirmasiHapusBaris() { if (hapusBarisTarget.value) form.rows.splice(hapusBarisTarget.value.idx, 1); hapusBarisTarget.value = null; }
    const auditFor = ref(null); const auditList = ref([]);
    async function lihatAudit(id) {
      if (auditFor.value === id) { auditFor.value = null; return; }
      try { const d = await api(`/api/entries/${id}/audit`); auditList.value = d.audit; auditFor.value = id; }
      catch (e) { setFlash(e.message, "err"); }
    }

    const APP_VERSION = "3.4.5";
    // ===== Muat malas bundle PDF (aset berhash, hanya saat pertama unduh) =====
    const pdfState = ref("idle");
    function muatScript(url, integrity) {
      return new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = url; if (integrity) { s.integrity = integrity; s.crossOrigin = "anonymous"; }
        const timer = setTimeout(() => { s.remove(); reject(new Error("timeout")); }, 20000);
        s.onload = () => { clearTimeout(timer); resolve(); };
        s.onerror = () => { clearTimeout(timer); s.remove(); reject(new Error("gagal memuat " + url)); };
        document.head.appendChild(s);
      });
    }
    async function pastikanPDF() {
      if (window.jspdf && window.__PDF_FONTS__ && window.__PDF_REPORT_SIAP__) return;
      if (!window.__PDF_CFG__) throw new Error("Konfigurasi PDF tidak ada.");
      pdfState.value = "loading";
      try {
        await muatScript(window.__PDF_CFG__.vendor, window.__PDF_CFG__.vi);
        await muatScript(window.__PDF_CFG__.fonts, window.__PDF_CFG__.fi);
        const kunci = ["pjs-400.ttf", "pjs-700.ttf", "fira-400.ttf", "fira-600.ttf"];
        if (!window.jspdf || !kunci.every((k) => window.__PDF_FONTS__ && window.__PDF_FONTS__[k])) throw new Error("Bundle PDF tidak lengkap.");
        window.__PDF_REPORT_SIAP__ = true;
        pdfState.value = "ready";
      } catch (e) { pdfState.value = "error"; throw e; }
    }
    function jadwalPrefetchPDF() {
      const c = navigator.connection || {};
      if (c.saveData || (c.effectiveType && c.effectiveType !== "4g")) return;
      setTimeout(() => { pastikanPDF().catch(() => { pdfState.value = "idle"; }); }, 6000);
    }

    // ===== Laporan + cetak =====
    const lap = reactive({ team_id: null, from: "", to: "", report: null, loading: false, kolomKelompok: [] });
    async function muatLaporan() {
      if (!lap.team_id || !lap.from || !lap.to) return;
      lap.loading = true;
      try { const d = await api(`/api/report?team_id=${lap.team_id}&from=${lap.from}&to=${lap.to}`); lap.report = d; lap.kolomKelompok = d.kelompok_kolom || []; }
      catch (e) { setFlash(e.message, "err"); }
      lap.loading = false;
    }
    function totalKolom(nama) {
      if (!lap.report) return 0;
      if (nama === "Lainnya") { const utama = (lap.kolomKelompok || []).slice(0, 5); return Math.round(lap.report.per_kelompok.filter((g) => !utama.includes(g.nama)).reduce((a, g) => a + g.total, 0) * 1000) / 1000; }
      return Math.round(lap.report.days.reduce((a, d) => a + ((d.kelompok && d.kelompok[nama]) || 0), 0) * 1000) / 1000;
    }
    const kolomTampil = computed(() => { const k = lap.kolomKelompok || []; if (k.length <= 6) return k; return [...k.slice(0, 5), "Lainnya"]; });
    function nilaiKolom(d, nama) {
      if (!d.kelompok) return 0;
      if (nama !== "Lainnya") return d.kelompok[nama] || 0;
      const utama = (lap.kolomKelompok || []).slice(0, 5);
      return Math.round(Object.entries(d.kelompok).filter(([n]) => !utama.includes(n)).reduce((a, [, v]) => a + v, 0) * 1000) / 1000;
    }
    const lapDetail = reactive({});
    function toggleLapDetail(tanggal) { lapDetail[tanggal] = !lapDetail[tanggal]; }
    const lapDays = computed(() => {
      if (!lap.report) return [];
      const ada = new Map(lap.report.days.map((d) => [d.tanggal, d]));
      const out = []; let cur = lap.from; let no = 0;
      while (cur <= lap.to) { no++; out.push(ada.get(cur) || { tanggal: cur, s1: null, s2: null, total: 0, terbagi: 0, sisa: 0, catatan: [] }); out[out.length - 1].no = no; cur = addDays(cur, 1); }
      return out;
    });
    const blokLaporan = computed(() => {
      const days = lapDays.value; if (!days.length) return [];
      if (days.length <= 7) return [{ rows: days, subtotal: null }];
      const blok = [];
      for (let i = 0; i < days.length; i += 7) {
        const rows = days.slice(i, i + 7);
        const st = rows.reduce((a, d) => ({ total: a.total + d.total, terbagi: a.terbagi + d.terbagi, sisa: a.sisa + d.sisa }), { total: 0, terbagi: 0, sisa: 0 });
        blok.push({ rows, subtotal: st, dari: rows[0].no, ke: rows[rows.length - 1].no, label: tglSingkat(rows[0].tanggal) + " - " + tglSingkat(rows[rows.length - 1].tanggal) });
      }
      return blok;
    });
    const rataHari = computed(() => { if (!lap.report) return 0; const jumlahHari = lapDays.value.length || 1; return Math.round(lap.report.totals.hasil / jumlahHari * 1000) / 1000; });
    const lapKosong = computed(() => !!lap.report && lap.report.totals.shift_tercatat === 0);
    function catatanGabung(d) { if (!d.catatan || !d.catatan.length) return ""; return d.catatan.map((c) => (lap.team_id === "all" && c.team_nama ? c.team_nama + " " : "") + "S" + c.shift + ": " + c.teks).join(" | "); }
    const timestampCetak = computed(() => {
      const parts = {};
      new Intl.DateTimeFormat("id-ID", { timeZone: settings.zona_waktu, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
      return parts.day + " " + parts.month + " " + parts.year + " - pukul " + parts.hour + "." + parts.minute + "." + parts.second + " " + settings.zona_label;
    });

    // ===== Unduh PDF langsung (generator otomatis jsPDF) =====
    function pdfDocBaru(orientasi) {
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation: orientasi, unit: "mm", format: "a4" });
      const F = window.__PDF_FONTS__ || {};
      const reg = (file, fam, style) => { if (F[file]) { doc.addFileToVFS(file, F[file]); doc.addFont(file, fam, style); } };
      reg("pjs-400.ttf", "pjs", "normal"); reg("pjs-700.ttf", "pjs", "bold");
      reg("fira-400.ttf", "fira", "normal"); reg("fira-600.ttf", "fira", "bold");
      doc.setFont("pjs", "normal");
      return doc;
    }
    function pdfKepala(doc, judul, subjudul) {
      const W = doc.internal.pageSize.getWidth();
      doc.setFont("pjs", "bold"); doc.setFontSize(13); doc.setTextColor(15, 23, 42);
      doc.text((settings.nama_perusahaan || "Pencatatan Usaha").toUpperCase(), W / 2, 14, { align: "center" });
      doc.setFontSize(15.5); doc.text(judul, W / 2, 21.5, { align: "center" });
      doc.setFont("pjs", "normal"); doc.setFontSize(9.5); doc.setTextColor(90, 90, 90);
      doc.text(subjudul, W / 2, 27, { align: "center" });
      doc.setTextColor(0, 0, 0); doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.7);
      doc.line(12, 30, W - 12, 30); doc.setLineWidth(0.25); doc.line(12, 31.1, W - 12, 31.1);
      return 36;
    }
    function pdfKakiDanTtd(doc, staffNama, yTtd) {
      const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
      if (yTtd > H - 45) { doc.addPage(); yTtd = 18; }
      doc.setFont("pjs", "normal"); doc.setFontSize(9.5); doc.setTextColor(15, 23, 42);
      doc.text("Diinput oleh,", 22, yTtd); doc.text("Mengetahui,", W - 66, yTtd);
      doc.setDrawColor(15, 23, 42); doc.setLineWidth(0.3);
      doc.line(22, yTtd + 17, 64, yTtd + 17); doc.line(W - 66, yTtd + 17, W - 24, yTtd + 17);
      doc.setFont("pjs", "bold");
      doc.text(staffNama || "-", 22, yTtd + 21.5); doc.text(settings.nama_pimpinan || "Pimpinan", W - 66, yTtd + 21.5);
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i); doc.setFont("pjs", "normal"); doc.setFontSize(8); doc.setTextColor(120, 120, 120);
        doc.text("Dicetak pada " + timestampCetak.value, 12, H - 8);
        doc.text("Inputin - Pencatatan Hasil Usaha", W / 2, H - 8, { align: "center" });
        doc.text("Halaman " + i + " dari " + pages, W - 12, H - 8, { align: "right" });
      }
      doc.setTextColor(0, 0, 0);
    }
    const pdfTabelStyle = { font: "pjs", fontSize: 9, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.2, textColor: [15, 23, 42] };
    const pdfHeadStyle = { fillColor: [30, 58, 138], textColor: [255, 255, 255], font: "pjs", fontStyle: "bold", fontSize: 9 };
    async function unduhPDF(harian) {
      if (!lap.report) return;
      try { await pastikanPDF(); }
      catch (e) { setFlash("Gagal menyiapkan PDF (komponen sekitar " + (window.__PDF_CFG__ ? window.__PDF_CFG__.kb : "?") + " KB, hanya diunduh sekali). Periksa koneksi lalu tekan Unduh lagi.", "err"); return; }
      const teamNama = lap.team_id === "all" ? "Semua Team - Satu Perusahaan" : ((teams.value.find((t) => t.id === lap.team_id) || {}).nama || "");
      const staffNama = user.value.nama;
      let doc, namaFile;
      if (harian) {
        const det = await api(`/api/entries?team_id=${lap.team_id}&from=${lap.from}&to=${lap.to}&per=1&page=1`);
        const shifts = det.days.length ? det.days[0].shifts : [];
        doc = pdfDocBaru("portrait");
        const W = doc.internal.pageSize.getWidth(); const H = doc.internal.pageSize.getHeight();
        let y = pdfKepala(doc, "Laporan Hasil Harian", teamNama + " - " + tglPanjang(lap.from) + " - Shift 1 dan Shift 2");
        if (!shifts.length) { doc.setFontSize(10); doc.text("Tidak ada data pada tanggal ini.", 12, y + 4); y += 10; }
        for (const e of shifts) {
          if (y > H - 70) { doc.addPage(); y = 16; }
          doc.setFont("pjs", "bold"); doc.setFontSize(11.5);
          doc.text("Shift " + e.shift + (e.tanpa_hasil ? " - Tanpa Hasil" : ""), 12, y);
          doc.setFont("pjs", "normal"); doc.setFontSize(10);
          doc.text("Hasil shift: " + fmt(e.hasil_gram) + " gr", 12, y + 5.5); y += 8.5;
          if (e.rows && e.rows.length) {
            doc.autoTable({ startY: y, margin: { left: 12, right: 12 }, head: [["Kelompok", "%", "Orang", "Total (gr)", "Per Orang (gr)"]], body: e.rows.map((r) => [r.nama, fmtPct(r.persentase), String(r.jumlah_orang), fmt(r.total_gram), fmt(r.per_orang_gram)]), styles: pdfTabelStyle, headStyles: pdfHeadStyle, columnStyles: { 1: { font: "fira", halign: "right" }, 2: { font: "fira", halign: "right" }, 3: { font: "fira", halign: "right" }, 4: { font: "fira", halign: "right" } } });
            y = doc.lastAutoTable.finalY + 3.5;
          }
          doc.setFont("pjs", "bold"); doc.setFontSize(10);
          doc.text("Total terbagi: " + fmt(e.total_terbagi) + " gr    |    Pendapatan Usaha: " + fmt(e.sisa) + " gr", 12, y); y += 6;
          if (e.catatan) {
            doc.setFont("pjs", "normal"); doc.setFontSize(9.5);
            const lines = doc.splitTextToSize("Catatan: " + e.catatan, W - 24);
            doc.text(lines, 12, y); y += lines.length * 4.4 + 2;
          }
          y += 5;
        }
        pdfKakiDanTtd(doc, staffNama, y + 4);
        namaFile = "laporan-harian-" + lap.from + ".pdf";
      } else {
        const t = lap.report.totals;
        const rentangLabel = lap.from === lap.to ? tglPanjang(lap.from) : tglPanjang(lap.from) + " sampai " + tglPanjang(lap.to);
        doc = pdfDocBaru("landscape");
        const W = doc.internal.pageSize.getWidth();
        let y = pdfKepala(doc, "Laporan Hasil " + lapDays.value.length + " Hari", teamNama + " - " + rentangLabel + " - Shift 1 dan Shift 2");
        const kpis = [["Total Hasil", fmt(t.hasil) + " gr"], ["Pendapatan Usaha", fmt(t.sisa) + " gr"], ["Rata-Rata Per Hari", fmt(rataHari.value) + " gr"], ["Hari Aktif / Shift", t.hari_aktif + " hari / " + t.shift_tercatat + " shift"]];
        const bw = (W - 24 - 9) / 4;
        kpis.forEach((k, i) => {
          const x = 12 + i * (bw + 3);
          doc.setDrawColor(203, 213, 225); doc.setFillColor(248, 250, 252); doc.roundedRect(x, y, bw, 13, 1.5, 1.5, "FD");
          doc.setFont("pjs", "normal"); doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
          doc.text(k[0].toUpperCase(), x + 3, y + 4.6);
          doc.setFont("fira", "bold"); doc.setFontSize(10.5); doc.setTextColor(15, 23, 42);
          doc.text(k[1], x + 3, y + 10);
        });
        doc.setTextColor(0, 0, 0); y += 17;
        const bedaMap = new Map(lapDays.value.map((d) => {
          const sr = d.shift_rows || {}; const a = sr["1"], b = sr["2"];
          if (!a || !b) return [d.tanggal, new Set()];
          const m1 = {}, m2 = {};
          a.forEach((r) => { m1[r.nama] = r.persentase; }); b.forEach((r) => { m2[r.nama] = r.persentase; });
          const out = new Set();
          for (const n of new Set([...Object.keys(m1), ...Object.keys(m2)])) { if ((n in m1 ? m1[n] : null) !== (n in m2 ? m2[n] : null)) out.add(n); }
          return [d.tanggal, out];
        }));
        const gabung = (lap.kolomKelompok || []).length > 0;
        // Baris kecil di sel Hasil Bagi: jumlah orang + jatah per orang (@), per shift bila dua shift terisi.
        const subOrang = (d, k) => {
          const sr = d.shift_rows || {};
          const ambil = (sh) => {
            const rs = (sr[sh] || []).filter((r) => r.nama === k);
            if (!rs.length) return null;
            const o = rs.reduce((a, r) => a + (r.jumlah_orang || 0), 0);
            const g = rs.reduce((a, r) => a + (r.total_gram || 0), 0);
            return { orang: o, per: o > 0 ? Math.round((g / o) * 1000) / 1000 : 0 };
          };
          const a = ambil("1"), b = ambil("2");
          const perTeks = (x) => x.orang > 0 ? fmt(x.per) : "-";
          if (a && b) return ["S1: " + a.orang + " orang @ " + perTeks(a), "S2: " + b.orang + " orang @ " + perTeks(b)];
          const x = a || b;
          return x ? [x.orang + " orang · @ " + perTeks(x)] : [];
        };
        const gst = { fillColor: [219, 234, 254], fontStyle: "bold" };
        let headUtama, colStyles, body = [];
        if (gabung) {
          const KG = [...lap.kolomKelompok];
          const persenEf = (gram, basis) => basis > 0 ? Math.round((gram / basis) * 100 * 1000) / 1000 : 0;
          headUtama = [
            [{ content: "No", rowSpan: 2 }, { content: "Tanggal", rowSpan: 2 }, { content: "Shift 1", rowSpan: 2 }, { content: "Shift 2", rowSpan: 2 }, { content: "Total Pendapatan", rowSpan: 2 }, ...KG.map((k) => ({ content: k, colSpan: 2 })), { content: "Terbagi", rowSpan: 2 }, { content: "Pendapatan Usaha", rowSpan: 2 }, { content: "Catatan", rowSpan: 2 }],
            [...KG.flatMap(() => ["%", "Hasil Bagi"])],
          ];
          for (const blok of blokLaporan.value) {
            for (const d of blok.rows) {
              body.push([String(d.no), tglSingkat(d.tanggal), d.s1 ? fmt(d.s1.hasil) : "-", d.s2 ? fmt(d.s2.hasil) : "-", fmt(d.total),
                ...KG.flatMap((k) => { const g = (d.kelompok && d.kelompok[k]) || 0; if (!g) return ["-", "-"]; const subs = subOrang(d, k); return [fmtPct(persenEf(g, d.total)) + "%" + (bedaMap.get(d.tanggal).has(k) ? "*" : ""), subs.length ? { content: fmt(g), _subs: subs, styles: { cellPadding: { top: 1.8, bottom: 2.2 + subs.length * 3.2, left: 1.8, right: 1.8 } } } : fmt(g)]; }),
                fmt(d.terbagi), fmt(d.sisa), catatanGabung(d) || "-"]);
            }
            if (blok.subtotal) {
              const st = { fillColor: [254, 243, 199], fontStyle: "bold" };
              const sumK = (k) => blok.rows.reduce((a, d) => a + ((d.kelompok && d.kelompok[k]) || 0), 0);
              body.push([{ content: "Subtotal Hari " + blok.dari + "-" + blok.ke + " (" + blok.label + ")", colSpan: 5, styles: st },
                ...KG.flatMap((k) => { const g = sumK(k); return [{ content: fmtPct(persenEf(g, blok.subtotal.total)) + "%", styles: st }, { content: fmt(g), styles: st }]; }),
                { content: fmt(blok.subtotal.terbagi), styles: st }, { content: fmt(blok.subtotal.sisa), styles: st }, { content: "", styles: st }]);
            }
          }
          const rataMap = Object.fromEntries(lap.report.per_kelompok.map((g) => [g.nama, g]));
          body.push([{ content: "TOTAL (" + lap.from + " s/d " + lap.to + ")", colSpan: 5, styles: gst },
            ...KG.flatMap((k) => [{ content: fmtPct(rataMap[k] ? rataMap[k].persen_rata : 0) + "%", styles: gst }, { content: fmt(rataMap[k] ? rataMap[k].total : 0), styles: gst }]),
            { content: fmt(t.terbagi), styles: gst }, { content: fmt(t.sisa), styles: gst }, { content: "", styles: gst }]);
          colStyles = { 0: { font: "fira", cellWidth: 8 }, 1: { cellWidth: 23 } };
          for (let i = 2; i < 5 + KG.length * 2 + 2; i++) colStyles[i] = { font: "fira", halign: "right" };
        } else {
          for (const blok of blokLaporan.value) {
            for (const d of blok.rows) {
              body.push([String(d.no), tglSingkat(d.tanggal), d.s1 ? fmt(d.s1.hasil) : "-", d.s2 ? fmt(d.s2.hasil) : "-", fmt(d.total), fmt(d.terbagi), fmt(d.sisa), catatanGabung(d) || "-"]);
            }
            if (blok.subtotal) {
              const st = { fillColor: [254, 243, 199], fontStyle: "bold" };
              body.push([{ content: "Subtotal Hari " + blok.dari + "-" + blok.ke + " (" + blok.label + ")", colSpan: 4, styles: st }, { content: fmt(blok.subtotal.total), styles: st }, { content: fmt(blok.subtotal.terbagi), styles: st }, { content: fmt(blok.subtotal.sisa), styles: st }, { content: "", styles: st }]);
            }
          }
          body.push([{ content: "TOTAL (" + lap.from + " s/d " + lap.to + ")", colSpan: 4, styles: gst }, { content: fmt(t.hasil), styles: gst }, { content: fmt(t.terbagi), styles: gst }, { content: fmt(t.sisa), styles: gst }, { content: "", styles: gst }]);
          headUtama = [["No", "Tanggal", "Shift 1", "Shift 2", "Total Hari", "Terbagi", "Pendapatan Usaha", "Catatan"]];
          colStyles = { 0: { font: "fira" }, 2: { font: "fira", halign: "right" }, 3: { font: "fira", halign: "right" }, 4: { font: "fira", halign: "right" }, 5: { font: "fira", halign: "right" }, 6: { font: "fira", halign: "right" } };
        }
        const sempit = gabung && lap.kolomKelompok.length > 4;
        doc.autoTable({ startY: y, margin: { left: 12, right: 12 }, head: headUtama, body, styles: sempit ? { ...pdfTabelStyle, fontSize: 7.5 } : pdfTabelStyle, headStyles: sempit ? { ...pdfHeadStyle, fontSize: 7.5 } : pdfHeadStyle, columnStyles: colStyles, didDrawCell: (data) => {
          const raw = data.cell.raw;
          if (data.section !== "body" || !raw || typeof raw !== "object" || !raw._subs || !raw._subs.length) return;
          doc.saveGraphicsState();
          doc.setFont("pjs", "normal"); doc.setTextColor(100, 116, 139);
          const avail = data.cell.width - 3.6;
          raw._subs.forEach((txt, i) => {
            let fs = sempit ? 5.6 : 6.3;
            doc.setFontSize(fs);
            while (doc.getTextWidth(txt) > avail && fs > 4.4) { fs -= 0.3; doc.setFontSize(fs); }
            doc.text(txt, data.cell.x + data.cell.width - 1.8, data.cell.y + data.cell.height - 1.7 - (raw._subs.length - 1 - i) * 3.2, { align: "right" });
          });
          doc.restoreGraphicsState();
        } });
        y = doc.lastAutoTable.finalY + 4;
        if (gabung) {
          doc.setFont("pjs", "normal"); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
          doc.text("Baris kecil di bawah Hasil Bagi: jumlah orang dan jatah per orang (@) pada hari itu, per shift bila dua shift terisi.", 12, y);
          doc.setTextColor(15, 23, 42); y += 5;
        }
        if (gabung && [...bedaMap.values()].some((s) => s.size)) {
          doc.setFont("pjs", "normal"); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
          doc.text("* Persen setelan kelompok berbeda antara Shift 1 dan Shift 2 pada hari itu - rincian per shift ada di Lampiran.", 12, y);
          doc.setTextColor(15, 23, 42); y += 5;
        }
        y += 3;
        const kolomM = [...(lap.kolomKelompok || [])];
        if (kolomM.length && !gabung) {
          if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 16; }
          doc.setFont("pjs", "bold"); doc.setFontSize(10.5); doc.text("Terbagi Per Hari Per Kelompok", 12, y); y += 2;
          const selM = (d, k) => {
            const g = (d.kelompok && d.kelompok[k]) || 0;
            if (!g) return "-";
            const p = d.total > 0 ? Math.round((g / d.total) * 100 * 1000) / 1000 : 0;
            return fmt(g) + "\n(" + fmtPct(p) + "%" + (bedaMap.get(d.tanggal).has(k) ? "*" : "") + ")";
          };
          const mHead = ["Tanggal", ...kolomM, "Total Terbagi", "Sisa"];
          const mBody = lapDays.value.map((d) => [tglSingkat(d.tanggal), ...kolomM.map((k) => selM(d, k)), fmt(d.terbagi), fmt(d.sisa)]);
          const fst = { fillColor: [219, 234, 254], fontStyle: "bold" };
          mBody.push([{ content: "Total", styles: fst }, ...kolomM.map((k) => ({ content: fmt(totalKolom(k)), styles: fst })), { content: fmt(t.terbagi), styles: fst }, { content: fmt(t.sisa), styles: fst }]);
          const mStyles = { 0: { cellWidth: 26 } };
          kolomM.forEach((k, i) => { mStyles[i + 1] = { font: "fira", halign: "right" }; });
          mStyles[kolomM.length + 1] = { font: "fira", halign: "right", cellWidth: 26 };
          mStyles[kolomM.length + 2] = { font: "fira", halign: "right", cellWidth: 26 };
          doc.autoTable({ startY: y, margin: { left: 12, right: 12 }, head: [mHead], body: mBody, styles: { ...pdfTabelStyle, fontSize: 8.5 }, headStyles: pdfHeadStyle, columnStyles: mStyles });
          y = doc.lastAutoTable.finalY + 4;
          if ([...bedaMap.values()].some((s) => s.size)) {
            doc.setFont("pjs", "normal"); doc.setFontSize(8.5); doc.setTextColor(100, 116, 139);
            doc.text("* Persen setelan kelompok berbeda antara Shift 1 dan Shift 2 pada hari itu - rincian per shift ada di Lampiran.", 12, y);
            doc.setTextColor(15, 23, 42); y += 5;
          }
          y += 2;
        }
        doc.setFont("pjs", "bold"); doc.setFontSize(10.5); doc.text("Total Per Kelompok - Periode Ini", 12, y); y += 2;
        const kelBody = [];
        for (const k of lap.report.per_kelompok) {
          const hs = { fontStyle: "bold", fillColor: [241, 245, 249] };
          kelBody.push([{ content: k.nama + " (rata-rata tertimbang)", styles: hs }, { content: fmtPct(k.persen_rata) + "%", styles: hs }, { content: fmt(k.total) + " gr", styles: hs }]);
          for (const r of k.rincian) kelBody.push(["   dengan persen", fmtPct(r.persentase) + "%", fmt(r.total) + " gr"]);
        }
        kelBody.push([{ content: "Pendapatan Usaha (sisa)", styles: { fontStyle: "bold" } }, { content: "-", styles: { fontStyle: "bold" } }, { content: fmt(t.sisa) + " gr", styles: { fontStyle: "bold" } }]);
        doc.autoTable({ startY: y, margin: { left: 12, right: 12 }, head: [["Kelompok", "Persen", "Total Terbagi"]], body: kelBody, styles: pdfTabelStyle, headStyles: pdfHeadStyle, columnStyles: { 0: { cellWidth: 85 }, 1: { font: "fira", halign: "right", cellWidth: 25 }, 2: { font: "fira", halign: "right", cellWidth: 40 } }, tableWidth: 150 });
        y = doc.lastAutoTable.finalY + 7;
        if (lap.report.per_team && lap.report.per_team.length) {
          doc.setFont("pjs", "bold"); doc.setFontSize(10.5); doc.text("Rekap Per Team - Satu Perusahaan", 12, y); y += 2;
          const ptBody = lap.report.per_team.map((x) => [x.team_nama, fmt(x.hasil), fmt(x.terbagi), fmt(x.sisa), String(x.hari_aktif), String(x.shift_tercatat)]);
          const ptSt = { fontStyle: "bold", fillColor: [219, 234, 254] };
          ptBody.push([{ content: "Total Perusahaan", styles: ptSt }, { content: fmt(t.hasil), styles: ptSt }, { content: fmt(t.terbagi), styles: ptSt }, { content: fmt(t.sisa), styles: ptSt }, { content: "", styles: ptSt }, { content: "", styles: ptSt }]);
          doc.autoTable({ startY: y, margin: { left: 12, right: 12 }, head: [["Team", "Total Hasil", "Terbagi", "Pendapatan Usaha", "Hari Aktif", "Shift"]], body: ptBody, styles: pdfTabelStyle, headStyles: pdfHeadStyle, columnStyles: { 1: { font: "fira", halign: "right" }, 2: { font: "fira", halign: "right" }, 3: { font: "fira", halign: "right" }, 4: { font: "fira", halign: "right" }, 5: { font: "fira", halign: "right" } } });
          y = doc.lastAutoTable.finalY + 7;
        }
        const hariBeda = lapDays.value.filter((d) => bedaMap.get(d.tanggal) && bedaMap.get(d.tanggal).size);
        if (hariBeda.length) {
          if (y > doc.internal.pageSize.getHeight() - 60) { doc.addPage(); y = 16; }
          doc.setFont("pjs", "bold"); doc.setFontSize(10.5); doc.text("Lampiran - Rincian Per Shift untuk Persen Berbeda", 12, y); y += 5;
          doc.setFont("pjs", "normal"); doc.setFontSize(9); doc.setTextColor(100, 116, 139);
          doc.text("Hari-hari berikut memiliki persen setelan kelompok yang berbeda antara Shift 1 dan Shift 2.", 12, y);
          doc.setTextColor(15, 23, 42); y += 3;
          for (const d of hariBeda) {
            const sr = d.shift_rows || {};
            const barisDari = (sh) => { const m = {}; (sr[sh] || []).forEach((r) => { m[r.nama] = r; }); return m; };
            const m1 = barisDari("1"), m2 = barisDari("2");
            const selL = (m, n) => (n in m ? fmtPct(m[n].persentase) + "% - " + fmt(m[n].total_gram) + " gr (" + (m[n].jumlah_orang || 0) + " orang · @ " + (m[n].jumlah_orang > 0 ? fmt(m[n].per_orang_gram) : "-") + ")" : "-");
            const lBody = [...bedaMap.get(d.tanggal)].map((n) => [n, selL(m1, n), selL(m2, n)]);
            if (y > doc.internal.pageSize.getHeight() - 45) { doc.addPage(); y = 16; }
            doc.setFont("pjs", "bold"); doc.setFontSize(9.5);
            doc.text(tglPanjang(d.tanggal) + " - Shift 1: " + fmt(d.s1 ? d.s1.hasil : 0) + " gr, Shift 2: " + fmt(d.s2 ? d.s2.hasil : 0) + " gr", 12, y + 4);
            doc.autoTable({ startY: y + 6, margin: { left: 12, right: 12 }, head: [["Kelompok", "Shift 1 (persen - gram - orang · @)", "Shift 2 (persen - gram - orang · @)"]], body: lBody, styles: { ...pdfTabelStyle, fontSize: 8.5 }, headStyles: pdfHeadStyle, columnStyles: { 1: { font: "fira", halign: "right" }, 2: { font: "fira", halign: "right" } }, tableWidth: 190 });
            y = doc.lastAutoTable.finalY + 7;
          }
        }
        pdfKakiDanTtd(doc, staffNama, y + 2);
        namaFile = "laporan-" + lap.from + "-sd-" + lap.to + ".pdf";
      }
      if (window.__PDF_TEST__) return doc;
      doc.save(namaFile);
      setFlash("PDF terunduh: " + namaFile);
    }
    window.__unduhPDF = unduhPDF;

    // ===== Admin =====
    const adminStatus = ref([]); const teamsAll = ref([]); const users = ref([]);
    const settingsForm = reactive({ nama_perusahaan: "", nama_pimpinan: "", zona_waktu: "Asia/Jakarta" });
    const teamBaru = ref(""); const userBaru = reactive({ nama: "", username: "", password: "", role: "staff", team_id: null }); const lihatPassUser = ref(false);
    async function muatAdminStatus() { if (!user.value || user.value.role !== "admin") return; try { const d = await api("/api/admin/status"); adminStatus.value = d.status; } catch (e) {} }
    const WARNA_TEAM = [{ bg: "#DBEAFE", fg: "#1D4ED8" }, { bg: "#FEF3C7", fg: "#B45309" }, { bg: "#DCFCE7", fg: "#15803D" }, { bg: "#FCE7F3", fg: "#BE185D" }, { bg: "#E0E7FF", fg: "#4338CA" }, { bg: "#FFEDD5", fg: "#C2410C" }];
    function warnaTeam(id) { return WARNA_TEAM[Math.abs((Number(id) || 1) - 1) % WARNA_TEAM.length]; }
    function inisialTeam(nama) { const w = String(nama || "").trim().split(/\s+/).filter(Boolean); if (w.length > 1) return (w[0][0] + w[1][0]).toUpperCase(); return (w[0] || "?").slice(0, 2).toUpperCase(); }
    const langkahSelesai = computed(() => { const s1 = form.tanpa_hasil || totalHasilForm.value > 0; const s2 = s1 && (form.tanpa_hasil || (totalPersenForm.value > 0 && totalPersenForm.value <= 100)); return { 1: s1, 2: s2 }; });
    const langkahAktif = computed(() => !langkahSelesai.value[1] ? 1 : !langkahSelesai.value[2] ? 2 : 3);
    const statusRingkasan = computed(() => {
      const st = adminStatus.value; if (!st.length) return { teks: "", persen: 0 };
      const selesai = st.filter((s) => s.s1 && s.s2).length;
      const slot = st.length * 2, terisi = st.reduce((a, s) => a + (s.s1 ? 1 : 0) + (s.s2 ? 1 : 0), 0);
      return { teks: selesai + " dari " + st.length + " team selesai - " + terisi + " dari " + slot + " shift terisi", persen: slot ? Math.round(terisi / slot * 100) : 0 };
    });
    async function muatAdmin() {
      if (!user.value || user.value.role !== "admin") return;
      try {
        const [t, u, s] = await Promise.all([api("/api/admin/teams"), api("/api/admin/users"), api("/api/admin/settings")]);
        teamsAll.value = t.teams; users.value = u.users;
        settingsForm.nama_perusahaan = s.settings.nama_perusahaan; settingsForm.nama_pimpinan = s.settings.nama_pimpinan; settingsForm.zona_waktu = s.settings.zona_waktu;
        if (!tplAdmin.team_id && teamsAll.value.length) { tplAdmin.team_id = teamsAll.value[0].id; await muatTplAdmin(); }
        await muatAdminStatus();
      } catch (e) { setFlash(e.message, "err"); }
    }
    async function simpanSettings() {
      try { await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(settingsForm) }); Object.assign(settings, settingsForm); settings.zona_label = ZONA_LABEL[settings.zona_waktu] || "WIB"; setFlash("Pengaturan tersimpan dan langsung berlaku ke PDF."); muatBootstrap(false); }
      catch (e) { setFlash(e.message, "err"); }
    }
    async function tambahTeam() { if (!teamBaru.value.trim()) return; try { await api("/api/admin/teams", { method: "POST", body: JSON.stringify({ nama: teamBaru.value.trim() }) }); teamBaru.value = ""; setFlash("Team baru ditambahkan."); await muatBootstrap(true); await muatAdmin(); } catch (e) { setFlash(e.message, "err"); } }
    async function toggleTeam(t) { try { await api(`/api/admin/teams/${t.id}`, { method: "PUT", body: JSON.stringify({ nama: t.nama, aktif: !t.aktif }) }); await muatAdmin(); await muatBootstrap(true); } catch (e) { setFlash(e.message, "err"); } }
    async function tambahUser() { try { await api("/api/admin/users", { method: "POST", body: JSON.stringify(userBaru) }); setFlash("User baru ditambahkan."); Object.assign(userBaru, { nama: "", username: "", password: "", role: "staff", team_id: teams.value[0] ? teams.value[0].id : null }); await muatAdmin(); } catch (e) { setFlash(e.message, "err"); } }
    async function toggleUser(u) { try { await api(`/api/admin/users/${u.id}`, { method: "PUT", body: JSON.stringify({ nama: u.nama, role: u.role, team_id: u.team_id, aktif: !u.aktif }) }); await muatAdmin(); } catch (e) { setFlash(e.message, "err"); } }

    // ===== Auth & bootstrap =====
    const showPw = ref(false); const pwForm = reactive({ old: "", new: "" }); const pwError = ref("");
    async function gantiPassword() {
      pwError.value = "";
      try { await api("/api/change-password", { method: "POST", body: JSON.stringify({ old_password: pwForm.old, new_password: pwForm.new }) }); showPw.value = false; pwForm.old = ""; pwForm.new = ""; setFlash("Password berhasil diganti."); }
      catch (e) { pwError.value = e.message; }
    }
    async function doLogin() {
      busy.value = true; loginError.value = "";
      try { const d = await api("/api/login", { method: "POST", body: JSON.stringify(loginForm) }); user.value = d.user; await muatBootstrap(true); }
      catch (e) { loginError.value = e.message; }
      busy.value = false;
    }
    async function doLogout() { try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) {} user.value = null; location.replace("/"); }
    // ===== Sheet profil =====
    const sheetOpen = ref(false); const konfirmasiKeluar = ref(false);
    const inisial = computed(() => { const n = (user.value && user.value.nama ? user.value.nama : "?").trim().split(/\s+/); return ((n[0] || "?")[0] + (n.length > 1 ? n[1][0] : "")).toUpperCase(); });
    function bukaSheet() { konfirmasiKeluar.value = false; sheetOpen.value = true; try { history.pushState({ profilSheet: 1 }, ""); } catch (e) {} }
    function tutupSheet(dariBack) {
      if (!sheetOpen.value) return;
      sheetOpen.value = false; konfirmasiKeluar.value = false;
      if (!dariBack) { try { if (history.state && history.state.profilSheet) history.back(); } catch (e) {} }
    }
    window.addEventListener("popstate", () => { if (sheetOpen.value) tutupSheet(true); });
    async function daringTersedia() {
      if (!navigator.onLine) return false;
      try {
        const c = new AbortController(); const t = setTimeout(() => c.abort(), 3500);
        const r = await fetch("/icon.svg?cek=" + Date.now(), { signal: c.signal, cache: "no-store" });
        clearTimeout(t); return r.ok;
      } catch (e) { return false; }
    }
    async function clearCache() {
      // Guard antrian offline: membersihkan penyimpanan akan menghapus input yang belum terkirim.
      let antriMentah = [];
      try { antriMentah = JSON.parse(localStorage.getItem(ANTRI_KEY) || "[]"); } catch (e) {}
      if (antriMentah.length) {
        const pesan = "Ada " + antriMentah.length + " input yang belum terkirim dari HP ini. Kirim dulu saat ada sinyal sebelum memperbaiki aplikasi, supaya input itu tidak hilang.";
        if (user.value) setFlash(pesan, "err"); else loginError.value = pesan;
        return;
      }
      // Guard offline (keputusan diskusi 9router): cache dibersihkan saat offline = aplikasi tidak bisa dimuat ulang.
      if (!(await daringTersedia())) {
        const pesan = "Tidak bisa memperbaiki aplikasi saat offline. Sambungkan internet dulu, karena setelah dibersihkan aplikasi harus dimuat ulang dari server. Data tersimpan tidak akan hilang.";
        if (user.value) setFlash(pesan, "err"); else loginError.value = pesan;
        return;
      }
      // Jalan keluar darurat: akhiri sesi semampunya, cabut service worker, hapus semua cache dan penyimpanan lokal, lalu muat ulang bersih.
      try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) {}
      try {
        if ("serviceWorker" in navigator) { const regs = await navigator.serviceWorker.getRegistrations(); await Promise.all(regs.map((r) => r.unregister())); }
        if ("caches" in window) { const keys = await caches.keys(); await Promise.all(keys.map((k) => caches.delete(k))); }
        localStorage.clear(); sessionStorage.clear();
      } catch (e) {}
      location.replace("/?v=" + Date.now());
    }
    async function muatBootstrap(resetTanggal = true) {
      const b = await api("/api/bootstrap");
      Object.assign(settings, b.settings);
      teams.value = b.teams; today.value = b.today;
      const defaultTeam = user.value.role === "staff" ? user.value.team_id : (teams.value[0] ? teams.value[0].id : null);
      if (!form.team_id) form.team_id = defaultTeam;
      if (!riw.team_id) riw.team_id = user.value.role === "admin" ? "all" : defaultTeam;
      if (!lap.team_id) lap.team_id = user.value.role === "admin" ? "all" : defaultTeam;
      if (!userBaru.team_id) userBaru.team_id = defaultTeam;
      if (resetTanggal) {
        form.tanggal = b.today;
        form.shift = new Date().getHours() >= 15 ? 2 : 1;
        riw.from = addDays(b.today, -29); riw.to = b.today;
        lap.from = b.today; lap.to = b.today;
      }
      await cekModeEdit(); await muatRiwayat(true); await muatLaporan(); await muatAdmin();
      muatAntrian(); kirimAntrian();
      if (user.value && user.value.role === "admin") jadwalPrefetchPDF();
    }
    onMounted(async () => {
      const fieldSel = "input, textarea, select";
      document.addEventListener("focusin", (e) => { if (e.target.closest && e.target.closest(fieldSel)) document.body.classList.add("kb"); });
      document.addEventListener("focusout", () => { setTimeout(() => { const a = document.activeElement; if (!a || !a.closest || !a.closest(fieldSel)) document.body.classList.remove("kb"); }, 60); });
      window.addEventListener("online", () => { kirimAntrian(); });
      try { const d = await api("/api/me"); user.value = d.user; await muatBootstrap(true); }
      catch (e) { user.value = null; }
    });
    watch(view, (v) => { if (v === "riwayat") muatRiwayat(); if (v === "laporan") muatLaporan(); if (v === "admin") muatAdmin(); });

    return { user, busy, flash, view, tabs, loginForm, loginError, doLogin, doLogout, clearCache, settings, teams, today,
      APP_VERSION, pdfState, sheetOpen, konfirmasiKeluar, bukaSheet, tutupSheet, inisial,
      form, modeEdit, prefillInfo, acc, peringatanForm, antrianTampil, kirimAntrian, buangAntrian, cobaLagiAntrian, chipCatatan, tambahChip, rowCalc, totalHasilForm, totalPersenForm, sisaGram, sisaPersen, cekModeEdit, pakaiSumber, tplAdmin, muatTplAdmin, simpanTplAdmin, simpan, teamLabelAktif,
      presets, setPreset, presetAktif, barisBaru, lapKosong, lihatPassUser, riw, riwFilter, muatRiwayat, expanded, toggleExpand, halamanList, formatWaktu, editEntry, hapusTarget, mintaHapus, konfirmasiHapus, hapusBarisTarget, mintaHapusBaris, konfirmasiHapusBaris, ubahTarget, konfirmasiUbah, auditFor, auditList, lihatAudit,
      lap, muatLaporan, totalKolom, kolomTampil, nilaiKolom, lapDetail, toggleLapDetail, lapDays, blokLaporan, rataHari, catatanGabung, unduhPDF,
      adminStatus, statusRingkasan, warnaTeam, inisialTeam, langkahSelesai, langkahAktif, teamsAll, users, settingsForm, teamBaru, userBaru, simpanSettings, tambahTeam, toggleTeam, tambahUser, toggleUser,
      showPw, pwForm, pwError, gantiPassword, fmt, fmtPct, parseID, tglPanjang, tglSingkat };
  }
}).mount("#app");
