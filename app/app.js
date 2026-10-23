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
    const form = reactive({ team_id: null, tanggal: "", shift: 1, tanpa_hasil: false, hasilStr: "", catatan: "", rows: [{ nama: "Operator", persenStr: "6", orangStr: "6" }, { nama: "Helper", persenStr: "4", orangStr: "5" }] });
    const modeEdit = ref(false);
    const editingId = ref(null);
    const teamLabelAktif = computed(() => {
      const t = teams.value.find((x) => x.id === form.team_id);
      return user.value && user.value.role === "staff" ? (user.value.team_nama || "") : (t ? t.nama : "");
    });
    function rowCalc(d) { const hasil = form.tanpa_hasil ? 0 : parseID(form.hasilStr); const persen = parseID(d.persenStr); const orang = parseInt(d.orangStr) || 0; const total = Math.round(hasil * persen / 100 * 1000) / 1000; return { total, perOrang: orang > 0 ? Math.round(total / orang * 1000) / 1000 : 0 }; }
    const totalHasilForm = computed(() => form.tanpa_hasil ? 0 : parseID(form.hasilStr));
    const totalPersenForm = computed(() => form.rows.reduce((a, d) => a + parseID(d.persenStr), 0));
    const sisaGram = computed(() => Math.round((totalHasilForm.value - form.rows.reduce((a, d) => a + rowCalc(d).total, 0)) * 1000) / 1000);
    const sisaPersen = computed(() => 100 - totalPersenForm.value);
    function tambahChip(c) { form.catatan = form.catatan ? (form.catatan.replace(/[.\s]+$/, "") + ". " + c + ".") : (c + "."); }
    async function cekModeEdit() {
      if (!form.team_id || !form.tanggal) return;
      try {
        const d = await api(`/api/entries/one?team_id=${form.team_id}&tanggal=${form.tanggal}&shift=${form.shift}`);
        if (d.entry) {
          modeEdit.value = true; editingId.value = d.entry.id;
          form.tanpa_hasil = !!d.entry.tanpa_hasil;
          form.hasilStr = d.entry.tanpa_hasil ? "" : String(d.entry.hasil_gram).replace(".", ",");
          form.catatan = d.entry.catatan || "";
          form.rows = d.entry.rows.length ? d.entry.rows.map((r) => ({ nama: r.nama, persenStr: String(r.persentase).replace(".", ","), orangStr: String(r.jumlah_orang) })) : [{ nama: "", persenStr: "", orangStr: "" }];
        } else { modeEdit.value = false; editingId.value = null; }
      } catch (e) { /* abaikan */ }
    }
    async function pakaiSumber(jenis) {
      try {
        if (jenis === "kemarin") {
          const d = await api(`/api/entries/copy-source?team_id=${form.team_id}&tanggal=${form.tanggal}&shift=${form.shift}`);
          if (!d.rows.length) return setFlash("Belum ada data pembagian sebelumnya untuk disalin.", "err");
          form.rows = d.rows.map((r) => ({ nama: r.nama, persenStr: String(r.persentase).replace(".", ","), orangStr: String(r.jumlah_orang) }));
          setFlash("Pembagian disalin dari " + tglPanjang(d.dari_tanggal) + ".");
        } else {
          const d = await api(`/api/templates?team_id=${form.team_id}`);
          if (!d.rows.length) return setFlash("Template team masih kosong. Isi pembagian lalu klik Simpan Sebagai Template.", "err");
          form.rows = d.rows.map((r) => ({ nama: r.nama, persenStr: String(r.persentase).replace(".", ","), orangStr: String(r.jumlah_orang) }));
          setFlash("Template team dipakai.");
        }
      } catch (e) { setFlash(e.message, "err"); }
    }
    async function simpanTemplate() {
      try {
        await api("/api/templates", { method: "PUT", body: JSON.stringify({ team_id: form.team_id, rows: form.rows.filter((r) => r.nama).map((r) => ({ nama: r.nama, persentase: parseID(r.persenStr), jumlah_orang: parseInt(r.orangStr) || 0 })) }) });
        setFlash("Template pembagian team tersimpan.");
      } catch (e) { setFlash(e.message, "err"); }
    }
    async function simpan() {
      busy.value = true;
      try {
        const payload = { team_id: form.team_id, tanggal: form.tanggal, shift: form.shift, tanpa_hasil: form.tanpa_hasil, hasil_gram: parseID(form.hasilStr), catatan: form.catatan, rows: form.rows.filter((r) => r.nama).map((r) => ({ nama: r.nama, persentase: parseID(r.persenStr), jumlah_orang: parseInt(r.orangStr) || 0 })) };
        await api("/api/entries", { method: "POST", body: JSON.stringify(payload) });
        setFlash((modeEdit.value ? "Perubahan tersimpan: " : "Tersimpan: ") + tglPanjang(form.tanggal) + " - Shift " + form.shift + ".");
        modeEdit.value = true;
        await muatRiwayat(true); await muatAdminStatus();
      } catch (e) { setFlash(e.message, "err"); }
      busy.value = false;
    }

    // ===== Riwayat =====
    const presets = [{ id: "1", label: "1 Hari" }, { id: "7", label: "7 Hari" }, { id: "30", label: "30 Hari" }, { id: "bulan", label: "Bulan Ini" }];
    function setPreset(target, id) {
      const o = target === "riw" ? riw : lap; const t = today.value;
      if (id === "1") { o.from = t; o.to = t; }
      else if (id === "7") { o.from = addDays(t, -6); o.to = t; }
      else if (id === "30") { o.from = addDays(t, -29); o.to = t; }
      else if (id === "bulan") { o.from = t.slice(0, 8) + "01"; o.to = t; }
    }
    const riw = reactive({ team_id: null, from: "", to: "", shift: "", q: "", per: 10, page: 1, days: [], total_hari: 0, total_page: 1, loading: false });
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
      form.team_id = riw.team_id; form.tanggal = tanggal; form.shift = s.shift;
      view.value = "input"; cekModeEdit();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    const hapusTarget = ref(null);
    function mintaHapus(s, tanggal) { hapusTarget.value = { id: s.id, label: tglPanjang(tanggal) + " - Shift " + s.shift + " (" + fmt(s.hasil_gram) + " gr)" }; }
    async function konfirmasiHapus() {
      try { await api(`/api/entries/${hapusTarget.value.id}`, { method: "DELETE" }); setFlash("Data terhapus dan tercatat di riwayat perubahan."); hapusTarget.value = null; await muatRiwayat(); }
      catch (e) { setFlash(e.message, "err"); }
    }
    const auditFor = ref(null); const auditList = ref([]);
    async function lihatAudit(id) {
      if (auditFor.value === id) { auditFor.value = null; return; }
      try { const d = await api(`/api/entries/${id}/audit`); auditList.value = d.audit; auditFor.value = id; }
      catch (e) { setFlash(e.message, "err"); }
    }

    const APP_VERSION = "3.2.0";
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
    function totalKolom(nama) { if (!lap.report) return 0; return Math.round(lap.report.days.reduce((a, d) => a + ((d.kelompok && d.kelompok[nama]) || 0), 0) * 1000) / 1000; }
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
    function catatanGabung(d) { if (!d.catatan || !d.catatan.length) return ""; return d.catatan.map((c) => (lap.team_id === "all" && c.team_nama ? c.team_nama + " " : "") + "S" + c.shift + ": " + c.teks).join(" | "); }
    const cetak = ref(null); const cetakMode = ref("rentang");
    const timestampCetak = computed(() => {
      const parts = {};
      new Intl.DateTimeFormat("id-ID", { timeZone: settings.zona_waktu, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
      return parts.day + " " + parts.month + " " + parts.year + " - pukul " + parts.hour + "." + parts.minute + "." + parts.second + " " + settings.zona_label;
    });
    async function cetakLaporan(harian) {
      if (!lap.report) return;
      const teamNama = lap.team_id === "all" ? "Semua Team - Satu Perusahaan" : ((teams.value.find((t) => t.id === lap.team_id) || {}).nama || "");
      if (harian) {
        cetakMode.value = "harian";
        const det = await api(`/api/entries?team_id=${lap.team_id}&from=${lap.from}&to=${lap.to}&per=1&page=1`);
        const shifts = det.days.length ? det.days[0].shifts : [];
        cetak.value = { judul: "Laporan Hasil Harian", subjudul: teamNama + " - " + tglPanjang(lap.from) + " - Shift 1 dan Shift 2", shifts, staffNama: user.value.nama };
      } else {
        cetakMode.value = "rentang";
        const rentangLabel = lap.from === lap.to ? tglPanjang(lap.from) : tglPanjang(lap.from) + " sampai " + tglPanjang(lap.to);
        cetak.value = { judul: "Laporan Hasil " + lapDays.value.length + " Hari", subjudul: teamNama + " - " + rentangLabel + " - Shift 1 dan Shift 2", staffNama: user.value.nama };
      }
      await nextTick(); window.print();
    }

    // ===== Unduh PDF langsung (generator otomatis jsPDF, tanpa pratinjau cetak) =====
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
        const body = [];
        for (const blok of blokLaporan.value) {
          for (const d of blok.rows) {
            body.push([String(d.no), tglSingkat(d.tanggal), d.s1 ? fmt(d.s1.hasil) : "-", d.s2 ? fmt(d.s2.hasil) : "-", fmt(d.total), fmt(d.terbagi), fmt(d.sisa), catatanGabung(d) || "-"]);
          }
          if (blok.subtotal) {
            const st = { fillColor: [254, 243, 199], fontStyle: "bold" };
            body.push([{ content: "Subtotal Hari " + blok.dari + "-" + blok.ke + " (" + blok.label + ")", colSpan: 4, styles: st }, { content: fmt(blok.subtotal.total), styles: st }, { content: fmt(blok.subtotal.terbagi), styles: st }, { content: fmt(blok.subtotal.sisa), styles: st }, { content: "", styles: st }]);
          }
        }
        const gst = { fillColor: [219, 234, 254], fontStyle: "bold" };
        body.push([{ content: "TOTAL (" + lap.from + " s/d " + lap.to + ")", colSpan: 4, styles: gst }, { content: fmt(t.hasil), styles: gst }, { content: fmt(t.terbagi), styles: gst }, { content: fmt(t.sisa), styles: gst }, { content: "", styles: gst }]);
        doc.autoTable({ startY: y, margin: { left: 12, right: 12 }, head: [["No", "Tanggal", "Shift 1", "Shift 2", "Total Hari", "Terbagi", "Pendapatan Usaha", "Catatan"]], body, styles: pdfTabelStyle, headStyles: pdfHeadStyle, columnStyles: { 0: { font: "fira" }, 2: { font: "fira", halign: "right" }, 3: { font: "fira", halign: "right" }, 4: { font: "fira", halign: "right" }, 5: { font: "fira", halign: "right" }, 6: { font: "fira", halign: "right" } } });
        y = doc.lastAutoTable.finalY + 7;
        const kolomM = lap.kolomKelompok || [];
        if (kolomM.length && kolomM.length <= 6) {
          doc.setFont("pjs", "bold"); doc.setFontSize(10.5); doc.text("Terbagi Per Hari Per Kelompok", 12, y); y += 2;
          const mHead = ["Tanggal", ...kolomM, "Total Terbagi", "Sisa"];
          const mBody = lapDays.value.map((d) => [tglSingkat(d.tanggal), ...kolomM.map((k) => (d.kelompok && d.kelompok[k]) ? fmt(d.kelompok[k]) : "-"), fmt(d.terbagi), fmt(d.sisa)]);
          const fst = { fillColor: [219, 234, 254], fontStyle: "bold" };
          mBody.push([{ content: "Total", styles: fst }, ...kolomM.map((k) => ({ content: fmt(totalKolom(k)), styles: fst })), { content: fmt(t.terbagi), styles: fst }, { content: fmt(t.sisa), styles: fst }]);
          const mStyles = { 0: { cellWidth: 32 } };
          kolomM.forEach((k, i) => { mStyles[i + 1] = { font: "fira", halign: "right" }; });
          mStyles[kolomM.length + 1] = { font: "fira", halign: "right", cellWidth: 28 };
          mStyles[kolomM.length + 2] = { font: "fira", halign: "right", cellWidth: 28 };
          doc.autoTable({ startY: y, margin: { left: 12, right: 12 }, head: [mHead], body: mBody, styles: pdfTabelStyle, headStyles: pdfHeadStyle, columnStyles: mStyles });
          y = doc.lastAutoTable.finalY + 7;
        } else if (kolomM.length > 6) {
          doc.setFont("pjs", "normal"); doc.setFontSize(9); doc.setTextColor(100, 116, 139);
          doc.text("Rincian terbagi per hari per kelompok tidak ditampilkan karena jumlah kelompok lebih dari 6 - lihat Total Per Kelompok.", 12, y);
          doc.setTextColor(15, 23, 42); y += 5;
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
    const teamBaru = ref(""); const userBaru = reactive({ nama: "", username: "", password: "", role: "staff", team_id: null });
    async function muatAdminStatus() { if (!user.value || user.value.role !== "admin") return; try { const d = await api("/api/admin/status"); adminStatus.value = d.status; } catch (e) {} }
    async function muatAdmin() {
      if (!user.value || user.value.role !== "admin") return;
      try {
        const [t, u, s] = await Promise.all([api("/api/admin/teams"), api("/api/admin/users"), api("/api/admin/settings")]);
        teamsAll.value = t.teams; users.value = u.users;
        settingsForm.nama_perusahaan = s.settings.nama_perusahaan; settingsForm.nama_pimpinan = s.settings.nama_pimpinan; settingsForm.zona_waktu = s.settings.zona_waktu;
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
        riw.from = addDays(b.today, -29); riw.to = b.today;
        lap.from = b.today; lap.to = b.today;
      }
      await cekModeEdit(); await muatRiwayat(true); await muatLaporan(); await muatAdmin();
      if (user.value && user.value.role === "admin") jadwalPrefetchPDF();
    }
    onMounted(async () => {
      try { const d = await api("/api/me"); user.value = d.user; await muatBootstrap(true); }
      catch (e) { user.value = null; }
    });
    watch(view, (v) => { if (v === "riwayat") muatRiwayat(); if (v === "laporan") muatLaporan(); if (v === "admin") muatAdmin(); });

    return { user, busy, flash, view, tabs, loginForm, loginError, doLogin, doLogout, clearCache, settings, teams, today,
      APP_VERSION, pdfState, sheetOpen, konfirmasiKeluar, bukaSheet, tutupSheet, inisial,
      form, modeEdit, chipCatatan, tambahChip, rowCalc, totalHasilForm, totalPersenForm, sisaGram, sisaPersen, cekModeEdit, pakaiSumber, simpanTemplate, simpan, teamLabelAktif,
      presets, setPreset, riw, muatRiwayat, expanded, toggleExpand, halamanList, formatWaktu, editEntry, hapusTarget, mintaHapus, konfirmasiHapus, auditFor, auditList, lihatAudit,
      lap, muatLaporan, totalKolom, lapDays, blokLaporan, rataHari, catatanGabung, cetak, cetakMode, cetakLaporan, timestampCetak, unduhPDF,
      adminStatus, teamsAll, users, settingsForm, teamBaru, userBaru, simpanSettings, tambahTeam, toggleTeam, tambahUser, toggleUser,
      showPw, pwForm, pwError, gantiPassword, fmt, fmtPct, parseID, tglPanjang, tglSingkat };
  }
}).mount("#app");
