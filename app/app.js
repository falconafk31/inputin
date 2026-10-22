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
    const tabs = computed(() => {
      const t = [{ id: "input", label: "Input", icon: "Tulis" }, { id: "riwayat", label: "Riwayat", icon: "Daftar" }, { id: "laporan", label: "Laporan", icon: "Grafik" }];
      if (user.value && user.value.role === "admin") t.push({ id: "admin", label: "Admin", icon: "Atur" });
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

    // ===== Laporan + cetak =====
    const lap = reactive({ team_id: null, from: "", to: "", report: null, loading: false });
    async function muatLaporan() {
      if (!lap.team_id || !lap.from || !lap.to) return;
      lap.loading = true;
      try { const d = await api(`/api/report?team_id=${lap.team_id}&from=${lap.from}&to=${lap.to}`); lap.report = d; }
      catch (e) { setFlash(e.message, "err"); }
      lap.loading = false;
    }
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
    function catatanGabung(d) { if (!d.catatan || !d.catatan.length) return ""; return d.catatan.map((c) => "S" + c.shift + ": " + c.teks).join(" | "); }
    const cetak = ref(null); const cetakMode = ref("rentang");
    const timestampCetak = computed(() => {
      const parts = {};
      new Intl.DateTimeFormat("id-ID", { timeZone: settings.zona_waktu, day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
      return parts.day + " " + parts.month + " " + parts.year + " - pukul " + parts.hour + "." + parts.minute + "." + parts.second + " " + settings.zona_label;
    });
    async function cetakLaporan(harian) {
      if (!lap.report) return;
      const teamNama = (teams.value.find((t) => t.id === lap.team_id) || {}).nama || "";
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
    async function doLogout() { try { await api("/api/logout", { method: "POST", body: "{}" }); } catch (e) {} user.value = null; }
    async function muatBootstrap(resetTanggal = true) {
      const b = await api("/api/bootstrap");
      Object.assign(settings, b.settings);
      teams.value = b.teams; today.value = b.today;
      const defaultTeam = user.value.role === "staff" ? user.value.team_id : (teams.value[0] ? teams.value[0].id : null);
      if (!form.team_id) form.team_id = defaultTeam;
      if (!riw.team_id) riw.team_id = defaultTeam;
      if (!lap.team_id) lap.team_id = defaultTeam;
      if (!userBaru.team_id) userBaru.team_id = defaultTeam;
      if (resetTanggal) {
        form.tanggal = b.today;
        riw.from = addDays(b.today, -29); riw.to = b.today;
        lap.from = b.today; lap.to = b.today;
      }
      await cekModeEdit(); await muatRiwayat(true); await muatLaporan(); await muatAdmin();
    }
    onMounted(async () => {
      try { const d = await api("/api/me"); user.value = d.user; await muatBootstrap(true); }
      catch (e) { user.value = null; }
    });
    watch(view, (v) => { if (v === "riwayat") muatRiwayat(); if (v === "laporan") muatLaporan(); if (v === "admin") muatAdmin(); });

    return { user, busy, flash, view, tabs, loginForm, loginError, doLogin, doLogout, settings, teams, today,
      form, modeEdit, chipCatatan, tambahChip, rowCalc, totalHasilForm, totalPersenForm, sisaGram, sisaPersen, cekModeEdit, pakaiSumber, simpanTemplate, simpan, teamLabelAktif,
      presets, setPreset, riw, muatRiwayat, expanded, toggleExpand, halamanList, formatWaktu, editEntry, hapusTarget, mintaHapus, konfirmasiHapus, auditFor, auditList, lihatAudit,
      lap, muatLaporan, blokLaporan, rataHari, catatanGabung, cetak, cetakMode, cetakLaporan, timestampCetak,
      adminStatus, teamsAll, users, settingsForm, teamBaru, userBaru, simpanSettings, tambahTeam, toggleTeam, tambahUser, toggleUser,
      showPw, pwForm, pwError, gantiPassword, fmt, fmtPct, parseID, tglPanjang, tglSingkat };
  }
}).mount("#app");
