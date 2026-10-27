// Inputin - Worker API + penyaji frontend (single file HTML digenerate ke frontend.js)
// Binding: DB (D1 inputin-db). Semua aturan bisnis sesuai DESAIN.md yang terkunci.
import FRONTEND_HTML from "./frontend.js";
import PDF_ASSETS from "./pdfassets.js";
import ICON_ASSETS from "./iconassets.js";

const JSON_CT = { "content-type": "application/json; charset=utf-8" };

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), { status, headers: { ...JSON_CT, ...extraHeaders } });
}
function err(message, status = 400) { return json({ ok: false, error: message }, status); }

const round3 = (n) => Math.round((Number(n) || 0) * 1000) / 1000;

function hexEncode(buf) {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexDecode(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return hexEncode(digest);
}
async function pbkdf2Hex(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt: hexDecode(saltHex), iterations: 100000, hash: "SHA-256" }, key, 256);
  return hexEncode(bits);
}
async function hashPassword(password) {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const saltHex = hexEncode(saltBytes.buffer);
  return saltHex + ":" + (await pbkdf2Hex(password, saltHex));
}
async function verifyPassword(password, stored) {
  const [salt, hash] = String(stored || "").split(":");
  if (!salt || !hash) return false;
  const calc = await pbkdf2Hex(password, salt);
  if (calc.length !== hash.length) return false;
  let diff = 0;
  for (let i = 0; i < calc.length; i++) diff |= calc.charCodeAt(i) ^ hash.charCodeAt(i);
  return diff === 0;
}

const ZONA_LABEL = { "Asia/Jakarta": "WIB", "Asia/Makassar": "WITA", "Asia/Jayapura": "WIT" };
function todayInTz(tz) {
  const parts = {};
  new Intl.DateTimeFormat("en-CA", { timeZone: tz || "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date()).forEach((p) => { parts[p.type] = p.value; });
  return `${parts.year}-${parts.month}-${parts.day}`;
}
const nowIso = () => new Date().toISOString();

async function getSettings(db) {
  const { results } = await db.prepare("SELECT key, value FROM settings").all();
  const s = {};
  for (const r of results || []) s[r.key] = r.value;
  return s;
}

function readCookie(request, name) {
  const raw = request.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

async function currentUser(request, db) {
  const token = readCookie(request, "inp_session");
  if (!token) return null;
  const tokenHash = await sha256Hex(token);
  const row = await db.prepare(
    `SELECT u.id, u.nama, u.username, u.role, u.team_id, u.aktif, t.nama AS team_nama, s.expires_at
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN teams t ON t.id = u.team_id
     WHERE s.token_hash = ?`
  ).bind(tokenHash).first();
  if (!row || !row.aktif || row.expires_at < nowIso()) return null;
  return row;
}

function guardTeam(user, requestedTeamId, allowAll = false) {
  // Staff selalu terkunci ke team sendiri; Admin bebas memilih, termasuk "all" untuk rekap satu perusahaan.
  if (user.role === "staff") return user.team_id;
  if (allowAll && requestedTeamId === "all") return "ALL";
  const t = parseInt(requestedTeamId, 10);
  return Number.isFinite(t) ? t : null;
}

async function loadEntry(db, id) {
  const head = await db.prepare(
    `SELECT r.*, t.nama AS team_nama, u1.nama AS created_by_nama, u2.nama AS updated_by_nama
     FROM shift_results r JOIN teams t ON t.id = r.team_id
     LEFT JOIN users u1 ON u1.id = r.created_by LEFT JOIN users u2 ON u2.id = r.updated_by
     WHERE r.id = ?`).bind(id).first();
  if (!head) return null;
  const { results: rows } = await db.prepare(
    "SELECT nama, persentase, jumlah_orang, total_gram, per_orang_gram FROM distribution_rows WHERE result_id = ? ORDER BY urutan, id"
  ).bind(id).all();
  return serializeEntry(head, rows || []);
}
function serializeEntry(head, rows) {
  const terbagi = round3(rows.reduce((a, r) => a + (r.total_gram || 0), 0));
  return {
    id: head.id, team_id: head.team_id, team_nama: head.team_nama,
    tanggal: head.tanggal, shift: head.shift,
    hasil_gram: head.hasil_gram, tanpa_hasil: !!head.tanpa_hasil,
    catatan: head.catatan, rows,
    total_terbagi: terbagi, sisa: round3(head.hasil_gram - terbagi),
    created_by_nama: head.created_by_nama, updated_by_nama: head.updated_by_nama,
    created_at: head.created_at, updated_at: head.updated_at,
  };
}

async function audit(db, { result_id = null, team_id = null, user_id = null, aksi, detail = null }) {
  await db.prepare("INSERT INTO audit_log (result_id, team_id, user_id, aksi, detail, waktu) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(result_id, team_id, user_id, aksi, detail ? JSON.stringify(detail) : null, nowIso()).run();
}

function validTanggal(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")); }

async function handleApi(request, env, url) {
  const db = env.DB;
  const path = url.pathname;
  const method = request.method;
  const body = method === "POST" || method === "PUT" ? await request.json().catch(() => ({})) : {};

  // ---- Login (publik) ----
  if (path === "/api/login" && method === "POST") {
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const user = await db.prepare("SELECT * FROM users WHERE username = ? AND aktif = 1").bind(username).first();
    if (!user || !(await verifyPassword(password, user.password_hash))) return err("Username atau password salah.", 401);
    const token = hexEncode(crypto.getRandomValues(new Uint8Array(32)).buffer);
    const tokenHash = await sha256Hex(token);
    const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString();
    await db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
      .bind(tokenHash, user.id, expires, nowIso()).run();
    const team = user.team_id ? await db.prepare("SELECT nama FROM teams WHERE id = ?").bind(user.team_id).first() : null;
    return json({ ok: true, user: { id: user.id, nama: user.nama, username: user.username, role: user.role, team_id: user.team_id, team_nama: team ? team.nama : null } }, 200,
      { "set-cookie": `inp_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${30 * 24 * 3600}` });
  }

  const user = await currentUser(request, db);
  if (!user) return err("Belum login.", 401);

  if (path === "/api/logout" && method === "POST") {
    const token = readCookie(request, "inp_session");
    if (token) await db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
    return json({ ok: true }, 200, { "set-cookie": "inp_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0" });
  }
  if (path === "/api/me" && method === "GET") {
    return json({ ok: true, user: { id: user.id, nama: user.nama, username: user.username, role: user.role, team_id: user.team_id, team_nama: user.team_nama } });
  }
  if (path === "/api/change-password" && method === "POST") {
    const me = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first();
    if (!(await verifyPassword(String(body.old_password || ""), me.password_hash))) return err("Password lama salah.", 400);
    const np = String(body.new_password || "");
    if (np.length < 8) return err("Password baru minimal 8 karakter.", 400);
    await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(np), user.id).run();
    return json({ ok: true });
  }

  if (path === "/api/bootstrap" && method === "GET") {
    const settings = await getSettings(db);
    const { results: teams } = await db.prepare("SELECT id, nama, aktif FROM teams ORDER BY id").all();
    const visibleTeams = user.role === "admin" ? teams : teams.filter((t) => t.id === user.team_id);
    return json({ ok: true, settings: { nama_perusahaan: settings.nama_perusahaan || "", nama_pimpinan: settings.nama_pimpinan || "", zona_waktu: settings.zona_waktu || "Asia/Jakarta", zona_label: ZONA_LABEL[settings.zona_waktu] || "WIB" }, teams: visibleTeams, today: todayInTz(settings.zona_waktu) });
  }

  // ---- Entri hasil shift ----
  if (path === "/api/entries" && method === "GET") {
    const teamId = guardTeam(user, url.searchParams.get("team_id"), true);
    if (!teamId) return err("Team tidak valid.", 400);
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    if (!validTanggal(from) || !validTanggal(to)) return err("Rentang tanggal tidak valid.", 400);
    const shiftFilter = url.searchParams.get("shift");
    const shiftNum = shiftFilter === "1" || shiftFilter === "2" ? parseInt(shiftFilter, 10) : null;
    const qRaw = (url.searchParams.get("q") || "").trim();
    const qLike = qRaw ? "%" + qRaw.replace(/[\\%_]/g, (c) => "\\" + c) + "%" : null;
    const perHari = Math.min(30, Math.max(1, parseInt(url.searchParams.get("per") || "10", 10)));
    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const allTeams = teamId === "ALL";
    // Keputusan filter ringan untuk 5000+ baris: kondisi filter disusun SEKALI dan
    // dipakai identik oleh semua query di bawah (halaman tanggal, hitung total,
    // heads, rows), sehingga database yang menyaring dan memotong halaman,
    // bukan memori Worker. LIKE di SQLite hanya case-insensitive untuk ASCII.
    const conds = [];
    const condBinds = [];
    if (!allTeams) { conds.push("r.team_id = ?"); condBinds.push(teamId); }
    conds.push("r.deleted_at IS NULL");
    if (shiftNum) { conds.push("r.shift = ?"); condBinds.push(shiftNum); }
    if (qLike) { conds.push("(r.catatan LIKE ? ESCAPE '\\' OR EXISTS (SELECT 1 FROM distribution_rows d2 WHERE d2.result_id = r.id AND d2.nama LIKE ? ESCAPE '\\'))"); condBinds.push(qLike, qLike); }
    const rangeWhere = `${conds.join(" AND ")} AND r.tanggal BETWEEN ? AND ?`;
    const rangeBinds = [...condBinds, from, to];
    // 1. Halaman tanggal saja (bukan semua entri dalam rentang)
    const { results: dateRows } = await db.prepare(
      `SELECT DISTINCT r.tanggal FROM shift_results r WHERE ${rangeWhere} ORDER BY r.tanggal DESC LIMIT ? OFFSET ?`
    ).bind(...rangeBinds, perHari, (page - 1) * perHari).all();
    const pageDates = (dateRows || []).map((d) => d.tanggal);
    // 2. Total halaman dari COUNT dengan WHERE identik
    const cnt = await db.prepare(
      `SELECT COUNT(DISTINCT r.tanggal) AS n FROM shift_results r WHERE ${rangeWhere}`
    ).bind(...rangeBinds).first();
    const totalHari = cnt ? cnt.n : 0;
    const totalPage = Math.max(1, Math.ceil(totalHari / perHari));
    // 3. Heads + rows hanya untuk tanggal di halaman ini. Halaman adalah irisan
    // berurutan daftar tanggal distinct, jadi BETWEEN ujung halaman mencakup
    // tepat tanggal-tanggal halaman itu (tanggal tanpa entri tidak menghasilkan baris).
    let heads = [];
    const rowsByResult = {};
    if (pageDates.length) {
      const lo = pageDates[pageDates.length - 1], hi = pageDates[0];
      const headsQuery = `SELECT r.*, u2.nama AS updated_by_nama, u1.nama AS created_by_nama, t.nama AS team_nama
         FROM shift_results r JOIN teams t ON t.id = r.team_id
         LEFT JOIN users u1 ON u1.id = r.created_by LEFT JOIN users u2 ON u2.id = r.updated_by
         WHERE ${rangeWhere} AND r.tanggal BETWEEN ? AND ?
         ORDER BY r.tanggal DESC, r.shift ASC, r.team_id ASC`;
      ({ results: heads } = await db.prepare(headsQuery).bind(...rangeBinds, lo, hi).all());
      const rowsQuery = `SELECT d.result_id, d.nama, d.persentase, d.jumlah_orang, d.total_gram, d.per_orang_gram FROM distribution_rows d JOIN shift_results r ON r.id = d.result_id WHERE ${rangeWhere} AND r.tanggal BETWEEN ? AND ? ORDER BY d.urutan, d.id`;
      const { results: allRows } = await db.prepare(rowsQuery).bind(...rangeBinds, lo, hi).all();
      for (const r of allRows || []) (rowsByResult[r.result_id] = rowsByResult[r.result_id] || []).push(r);
    }
    const byDate = new Map();
    for (const h of heads || []) {
      const e = serializeEntry(h, rowsByResult[h.id] || []);
      if (!byDate.has(e.tanggal)) byDate.set(e.tanggal, []);
      byDate.get(e.tanggal).push(e);
    }
    const days = pageDates.filter((t) => byDate.has(t)).map((tanggal) => {
      const shifts = byDate.get(tanggal);
      const totalHasil = round3(shifts.reduce((a, s) => a + s.hasil_gram, 0));
      const totalTerbagi = round3(shifts.reduce((a, s) => a + s.total_terbagi, 0));
      return { tanggal, shifts, total_hasil: totalHasil, total_terbagi: totalTerbagi, sisa: round3(totalHasil - totalTerbagi) };
    });
    return json({ ok: true, days, page, per: perHari, total_hari: totalHari, total_page: totalPage });
  }

  if (path === "/api/entries/one" && method === "GET") {
    const teamId = guardTeam(user, url.searchParams.get("team_id"));
    const tanggal = url.searchParams.get("tanggal"), shift = parseInt(url.searchParams.get("shift"), 10);
    if (!teamId || !validTanggal(tanggal) || ![1, 2].includes(shift)) return err("Parameter tidak valid.", 400);
    const head = await db.prepare("SELECT id FROM shift_results WHERE team_id = ? AND tanggal = ? AND shift = ? AND deleted_at IS NULL").bind(teamId, tanggal, shift).first();
    return json({ ok: true, entry: head ? await loadEntry(db, head.id) : null });
  }

  if (path === "/api/entries/copy-source" && method === "GET") {
    const teamId = guardTeam(user, url.searchParams.get("team_id"));
    const tanggal = url.searchParams.get("tanggal"), shift = parseInt(url.searchParams.get("shift"), 10);
    if (!teamId || !validTanggal(tanggal)) return err("Parameter tidak valid.", 400);
    let head = await db.prepare("SELECT id FROM shift_results WHERE team_id = ? AND tanggal < ? AND shift = ? AND deleted_at IS NULL ORDER BY tanggal DESC LIMIT 1").bind(teamId, tanggal, shift).first();
    if (!head) head = await db.prepare("SELECT id FROM shift_results WHERE team_id = ? AND tanggal < ? AND deleted_at IS NULL ORDER BY tanggal DESC, shift DESC LIMIT 1").bind(teamId, tanggal).first();
    if (!head) return json({ ok: true, rows: [], dari_tanggal: null });
    const entry = await loadEntry(db, head.id);
    return json({ ok: true, rows: entry.rows, dari_tanggal: entry.tanggal });
  }

  if (path === "/api/entries" && method === "POST") {
    const teamId = guardTeam(user, body.team_id);
    const tanggal = body.tanggal, shift = parseInt(body.shift, 10);
    if (!teamId) return err("Team tidak valid.", 400);
    if (!validTanggal(tanggal)) return err("Tanggal tidak valid.", 400);
    if (![1, 2].includes(shift)) return err("Shift harus 1 atau 2.", 400);
    const tanpaHasil = body.tanpa_hasil ? 1 : 0;
    const hasil = tanpaHasil ? 0 : round3(body.hasil_gram);
    if (!tanpaHasil && (!(hasil > 0) || hasil > 100000)) return err("Hasil gram tidak valid.", 400);
    const rowsIn = Array.isArray(body.rows) ? body.rows : [];
    const totalPersen = rowsIn.reduce((a, r) => a + (Number(r.persentase) || 0), 0);
    if (totalPersen > 100.0001) return err("Total persentase melebihi 100%. Simpan ditolak.", 400);
    const rows = rowsIn.filter((r) => String(r.nama || "").trim() !== "").map((r, i) => {
      const persen = Number(r.persentase) || 0;
      const orang = Math.max(0, parseInt(r.jumlah_orang, 10) || 0);
      const total = round3(hasil * persen / 100);
      return { nama: String(r.nama).trim(), persentase: persen, jumlah_orang: orang, total_gram: total, per_orang_gram: orang > 0 ? round3(total / orang) : 0, urutan: i };
    });
    const catatan = String(body.catatan || "").slice(0, 1000);
    if (tanpaHasil && !catatan.trim()) return err("Mode Tanpa Hasil wajib diisi alasannya di Catatan.", 400);
    const existing = await db.prepare("SELECT id FROM shift_results WHERE team_id = ? AND tanggal = ? AND shift = ?").bind(teamId, tanggal, shift).first();
    let resultId, aksi;
    if (existing) {
      await db.prepare("UPDATE shift_results SET hasil_gram = ?, tanpa_hasil = ?, catatan = ?, updated_by = ?, updated_at = ?, deleted_at = NULL WHERE id = ?")
        .bind(hasil, tanpaHasil, catatan, user.id, nowIso(), existing.id).run();
      await db.prepare("DELETE FROM distribution_rows WHERE result_id = ?").bind(existing.id).run();
      resultId = existing.id; aksi = "ubah";
    } else {
      const ins = await db.prepare("INSERT INTO shift_results (team_id, tanggal, shift, hasil_gram, tanpa_hasil, catatan, created_by, updated_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .bind(teamId, tanggal, shift, hasil, tanpaHasil, catatan, user.id, user.id, nowIso(), nowIso()).run();
      resultId = ins.meta.last_row_id; aksi = "buat";
    }
    for (const r of rows) {
      await db.prepare("INSERT INTO distribution_rows (result_id, nama, persentase, jumlah_orang, total_gram, per_orang_gram, urutan) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(resultId, r.nama, r.persentase, r.jumlah_orang, r.total_gram, r.per_orang_gram, r.urutan).run();
    }
    await audit(db, { result_id: resultId, team_id: teamId, user_id: user.id, aksi, detail: { tanggal, shift, hasil_gram: hasil, tanpa_hasil: !!tanpaHasil, rows } });
    return json({ ok: true, entry: await loadEntry(db, resultId) });
  }

  const delMatch = path.match(/^\/api\/entries\/(\d+)$/);
  if (delMatch && method === "DELETE") {
    const id = parseInt(delMatch[1], 10);
    const head = await db.prepare("SELECT * FROM shift_results WHERE id = ? AND deleted_at IS NULL").bind(id).first();
    if (!head) return err("Data tidak ditemukan.", 404);
    if (user.role === "staff" && head.team_id !== user.team_id) return err("Tidak boleh menghapus data team lain.", 403);
    await db.prepare("UPDATE shift_results SET deleted_at = ?, updated_by = ?, updated_at = ? WHERE id = ?").bind(nowIso(), user.id, nowIso(), id).run();
    await audit(db, { result_id: id, team_id: head.team_id, user_id: user.id, aksi: "hapus", detail: { tanggal: head.tanggal, shift: head.shift, hasil_gram: head.hasil_gram } });
    return json({ ok: true });
  }
  const auditMatch = path.match(/^\/api\/entries\/(\d+)\/audit$/);
  if (auditMatch && method === "GET") {
    const id = parseInt(auditMatch[1], 10);
    const head = await db.prepare("SELECT team_id FROM shift_results WHERE id = ?").bind(id).first();
    if (!head) return err("Data tidak ditemukan.", 404);
    if (user.role === "staff" && head.team_id !== user.team_id) return err("Tidak ada akses.", 403);
    const { results } = await db.prepare(
      `SELECT a.aksi, a.detail, a.waktu, u.nama AS user_nama FROM audit_log a LEFT JOIN users u ON u.id = a.user_id WHERE a.result_id = ? ORDER BY a.id DESC LIMIT 50`
    ).bind(id).all();
    return json({ ok: true, audit: results || [] });
  }

  // ---- Laporan ----
  if (path === "/api/report" && method === "GET") {
    const teamId = guardTeam(user, url.searchParams.get("team_id"), true);
    const from = url.searchParams.get("from"), to = url.searchParams.get("to");
    if (!teamId || !validTanggal(from) || !validTanggal(to)) return err("Parameter laporan tidak valid.", 400);
    const allTeams = teamId === "ALL";
    // Agregat ringan untuk 5000+ baris: semua penjumlahan memakai miligram
    // integer. Nilai tersimpan sudah 3 desimal (round3 saat simpan), jadi
    // penjumlahan integer eksak dan bebas urutan float, dan hasilnya sama
    // persis dengan akumulasi round3 lama. Rentang lebih dari 366 hari
    // dipecah per bulan di server supaya satu potongan tidak memuat ribuan baris.
    const mg = (x) => Math.round((Number(x) || 0) * 1000);
    const dariMg = (m) => m / 1000;
    const ambilSlice = async (f, t) => {
      const { results: hs } = allTeams
        ? await db.prepare("SELECT r.*, t.nama AS team_nama FROM shift_results r JOIN teams t ON t.id = r.team_id WHERE r.tanggal BETWEEN ? AND ? AND r.deleted_at IS NULL ORDER BY r.tanggal ASC, r.shift ASC").bind(f, t).all()
        : await db.prepare("SELECT r.*, t.nama AS team_nama FROM shift_results r JOIN teams t ON t.id = r.team_id WHERE r.team_id = ? AND r.tanggal BETWEEN ? AND ? AND r.deleted_at IS NULL ORDER BY r.tanggal ASC, r.shift ASC").bind(teamId, f, t).all();
      const rowsBy = {};
      if ((hs || []).length) {
        const rowsQuery = `SELECT d.result_id, d.nama, d.persentase, d.jumlah_orang, d.total_gram, d.per_orang_gram FROM distribution_rows d JOIN shift_results r ON r.id = d.result_id WHERE ${allTeams ? "" : "r.team_id = ? AND "}r.tanggal BETWEEN ? AND ? AND r.deleted_at IS NULL ORDER BY d.urutan, d.id`;
        const { results: allRows } = allTeams
          ? await db.prepare(rowsQuery).bind(f, t).all()
          : await db.prepare(rowsQuery).bind(teamId, f, t).all();
        for (const r of allRows || []) (rowsBy[r.result_id] = rowsBy[r.result_id] || []).push(r);
      }
      return { heads: hs || [], rowsBy };
    };
    const potongBulan = (f, t) => {
      const out = [];
      let y = Number(f.slice(0, 4)), m = Number(f.slice(5, 7));
      const ey = Number(t.slice(0, 4)), em = Number(t.slice(5, 7));
      while (y < ey || (y === ey && m <= em)) {
        const awal = (y === Number(f.slice(0, 4)) && m === Number(f.slice(5, 7))) ? f : `${y}-${String(m).padStart(2, "0")}-01`;
        const akhirBulan = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
        out.push([awal, akhirBulan > t ? t : akhirBulan]);
        m++; if (m > 12) { m = 1; y++; }
      }
      return out;
    };
    const rentangHari = Math.round((new Date(to + "T00:00:00Z") - new Date(from + "T00:00:00Z")) / 86400000);
    const slices = rentangHari > 366 ? potongBulan(from, to) : [[from, to]];
    const dayMap = new Map();
    const perKelompokMap = new Map();
    const perTeamMap = new Map();
    const hasilById = new Map();
    let totHasilMg = 0, totTerbagiMg = 0, shiftCount = 0;
    for (const [sf, st] of slices) {
      const { heads, rowsBy } = await ambilSlice(sf, st);
      for (const h of heads) {
        hasilById.set(h.id, h.hasil_gram);
        const rows = rowsBy[h.id] || [];
        const terbagiMg = rows.reduce((a, r) => a + mg(r.total_gram), 0);
        if (!dayMap.has(h.tanggal)) dayMap.set(h.tanggal, { tanggal: h.tanggal, s1: null, s2: null, totalMg: 0, terbagiMg: 0, catatan: [], kelompokMg: {}, shift_rows: {} });
        const d = dayMap.get(h.tanggal);
        const key = h.shift === 1 ? "s1" : "s2";
        if (!d[key]) d[key] = { hasil: 0, terbagi: 0, tanpa_hasil: false, id: h.id };
        d[key].hasil = dariMg(mg(d[key].hasil) + mg(h.hasil_gram)); d[key].terbagi = dariMg(mg(d[key].terbagi) + terbagiMg);
        if (h.tanpa_hasil) d[key].tanpa_hasil = true;
        d.totalMg += mg(h.hasil_gram); d.terbagiMg += terbagiMg;
        if (h.catatan) d.catatan.push({ shift: h.shift, teks: h.catatan, team_nama: h.team_nama });
        totHasilMg += mg(h.hasil_gram); totTerbagiMg += terbagiMg; shiftCount++;
        for (const r of rows) {
          let g = perKelompokMap.get(r.nama);
          if (!g) { g = { nama: r.nama, totalMg: 0, perPersenMg: new Map(), shiftIds: new Set() }; perKelompokMap.set(r.nama, g); }
          g.totalMg += mg(r.total_gram);
          g.perPersenMg.set(r.persentase, (g.perPersenMg.get(r.persentase) || 0) + mg(r.total_gram));
          g.shiftIds.add(h.id);
          d.kelompokMg[r.nama] = (d.kelompokMg[r.nama] || 0) + mg(r.total_gram);
          (d.shift_rows[h.shift] = d.shift_rows[h.shift] || []).push({ nama: r.nama, persentase: r.persentase, total_gram: r.total_gram, jumlah_orang: r.jumlah_orang, per_orang_gram: r.per_orang_gram });
        }
        if (allTeams) {
          if (!perTeamMap.has(h.team_id)) perTeamMap.set(h.team_id, { team_id: h.team_id, team_nama: h.team_nama, hasilMg: 0, terbagiMg: 0, tanggal_set: new Set(), shift_tercatat: 0 });
          const pt = perTeamMap.get(h.team_id);
          pt.hasilMg += mg(h.hasil_gram); pt.terbagiMg += terbagiMg;
          pt.tanggal_set.add(h.tanggal); pt.shift_tercatat++;
        }
      }
    }
    const days = [...dayMap.values()].map((d) => ({ tanggal: d.tanggal, s1: d.s1, s2: d.s2, total: dariMg(d.totalMg), terbagi: dariMg(d.terbagiMg), sisa: dariMg(d.totalMg - d.terbagiMg), catatan: d.catatan, kelompok: Object.fromEntries(Object.entries(d.kelompokMg).map(([k, v]) => [k, dariMg(v)])), shift_rows: d.shift_rows }));
    const perKelompok = [...perKelompokMap.values()].map((g) => {
      const basisMg = [...g.shiftIds].reduce((a, id) => a + mg(hasilById.get(id) || 0), 0);
      const rata = basisMg > 0 ? Math.round((g.totalMg / basisMg) * 100 * 1000) / 1000 : 0;
      return { nama: g.nama, total: dariMg(g.totalMg), persen_rata: rata, rincian: [...g.perPersenMg.entries()].map(([persentase, totalMg]) => ({ persentase, total: dariMg(totalMg) })).sort((a, b) => a.persentase - b.persentase) };
    });
    const resp = { ok: true, days, totals: { hasil: dariMg(totHasilMg), terbagi: dariMg(totTerbagiMg), sisa: dariMg(totHasilMg - totTerbagiMg), hari_aktif: days.length, shift_tercatat: shiftCount }, per_kelompok: perKelompok, kelompok_kolom: perKelompok.slice().sort((a, b) => b.total - a.total).map((g) => g.nama) };
    if (allTeams) resp.per_team = [...perTeamMap.values()].map((pt) => ({ team_id: pt.team_id, team_nama: pt.team_nama, hasil: dariMg(pt.hasilMg), terbagi: dariMg(pt.terbagiMg), sisa: dariMg(pt.hasilMg - pt.terbagiMg), hari_aktif: pt.tanggal_set.size, shift_tercatat: pt.shift_tercatat }));
    return json(resp);
  }

  // ---- Template pembagian ----
  if (path === "/api/templates" && method === "GET") {
    const teamId = guardTeam(user, url.searchParams.get("team_id"));
    if (!teamId) return err("Team tidak valid.", 400);
    const { results } = await db.prepare("SELECT nama, persentase, jumlah_orang FROM distribution_templates WHERE team_id = ? ORDER BY urutan, id").bind(teamId).all();
    return json({ ok: true, rows: results || [] });
  }
  if (path === "/api/templates" && method === "PUT") {
    const teamId = guardTeam(user, body.team_id);
    if (!teamId) return err("Team tidak valid.", 400);
    await db.prepare("DELETE FROM distribution_templates WHERE team_id = ?").bind(teamId).run();
    const rows = Array.isArray(body.rows) ? body.rows : [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (!String(r.nama || "").trim()) continue;
      await db.prepare("INSERT INTO distribution_templates (team_id, nama, persentase, jumlah_orang, urutan) VALUES (?, ?, ?, ?, ?)")
        .bind(teamId, String(r.nama).trim(), Number(r.persentase) || 0, Math.max(0, parseInt(r.jumlah_orang, 10) || 0), i).run();
    }
    return json({ ok: true });
  }

  // ---- Admin ----
  if (path.startsWith("/api/admin/")) {
    if (user.role !== "admin") return err("Khusus Admin.", 403);
    if (path === "/api/admin/status" && method === "GET") {
      const settings = await getSettings(db);
      const tanggal = validTanggal(url.searchParams.get("tanggal")) ? url.searchParams.get("tanggal") : todayInTz(settings.zona_waktu);
      const { results: teams } = await db.prepare("SELECT id, nama FROM teams WHERE aktif = 1 ORDER BY id").all();
      const { results: recs } = await db.prepare("SELECT team_id, shift FROM shift_results WHERE tanggal = ? AND deleted_at IS NULL").bind(tanggal).all();
      const set = new Set((recs || []).map((r) => r.team_id + ":" + r.shift));
      return json({ ok: true, tanggal, status: (teams || []).map((t) => ({ team_id: t.id, team_nama: t.nama, s1: set.has(t.id + ":1"), s2: set.has(t.id + ":2") })) });
    }
    if (path === "/api/admin/teams" && method === "GET") {
      const { results } = await db.prepare("SELECT * FROM teams ORDER BY id").all();
      return json({ ok: true, teams: results || [] });
    }
    if (path === "/api/admin/teams" && method === "POST") {
      const nama = String(body.nama || "").trim();
      if (!nama) return err("Nama team wajib diisi.", 400);
      const ins = await db.prepare("INSERT INTO teams (nama, aktif, created_at) VALUES (?, 1, ?)").bind(nama, nowIso()).run();
      return json({ ok: true, id: ins.meta.last_row_id });
    }
    const teamMatch = path.match(/^\/api\/admin\/teams\/(\d+)$/);
    if (teamMatch && method === "PUT") {
      await db.prepare("UPDATE teams SET nama = ?, aktif = ? WHERE id = ?")
        .bind(String(body.nama || "").trim(), body.aktif ? 1 : 0, parseInt(teamMatch[1], 10)).run();
      return json({ ok: true });
    }
    if (path === "/api/admin/users" && method === "GET") {
      const { results } = await db.prepare(
        "SELECT u.id, u.nama, u.username, u.role, u.team_id, u.aktif, t.nama AS team_nama FROM users u LEFT JOIN teams t ON t.id = u.team_id ORDER BY u.id").all();
      return json({ ok: true, users: results || [] });
    }
    if (path === "/api/admin/users" && method === "POST") {
      const nama = String(body.nama || "").trim(), username = String(body.username || "").trim();
      const pw = String(body.password || "");
      if (!nama || !username || pw.length < 8) return err("Nama, username, dan password (min 8) wajib diisi.", 400);
      const ada = await db.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
      if (ada) return err("Username sudah dipakai.", 400);
      const ins = await db.prepare("INSERT INTO users (nama, username, password_hash, role, team_id, aktif, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)")
        .bind(nama, username, await hashPassword(pw), body.role === "admin" ? "admin" : "staff", body.role === "admin" ? null : (parseInt(body.team_id, 10) || null), nowIso()).run();
      return json({ ok: true, id: ins.meta.last_row_id });
    }
    const userMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
    if (userMatch && method === "PUT") {
      const id = parseInt(userMatch[1], 10);
      const target = await db.prepare("SELECT id, role, aktif FROM users WHERE id = ?").bind(id).first();
      if (!target) return err("User tidak ditemukan.", 404);
      const namaBaru = String(body.nama || "").trim();
      if (!namaBaru) return err("Nama wajib diisi.", 400);
      const roleBaru = body.role === "admin" ? "admin" : "staff";
      const aktifBaru = body.aktif ? 1 : 0;
      if (target.role === "admin" && target.aktif && (roleBaru !== "admin" || !aktifBaru)) {
        const lain = await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND aktif = 1 AND id <> ?").bind(id).first();
        if (!lain || !lain.n) return err("Tidak bisa: ini satu-satunya Admin aktif.", 400);
      }
      await db.prepare("UPDATE users SET nama = ?, role = ?, team_id = ?, aktif = ? WHERE id = ?")
        .bind(namaBaru, roleBaru, roleBaru === "admin" ? null : (parseInt(body.team_id, 10) || null), aktifBaru, id).run();
      if (body.username !== undefined) {
        const usernameBaru = String(body.username || "").trim();
        if (!usernameBaru) return err("Username wajib diisi.", 400);
        const dup = await db.prepare("SELECT id FROM users WHERE username = ? AND id <> ?").bind(usernameBaru, id).first();
        if (dup) return err("Username sudah dipakai.", 400);
        await db.prepare("UPDATE users SET username = ? WHERE id = ?").bind(usernameBaru, id).run();
      }
      if (body.password) {
        if (String(body.password).length < 8) return err("Password minimal 8 karakter.", 400);
        await db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").bind(await hashPassword(String(body.password)), id).run();
      }
      return json({ ok: true });
    }
    if (path === "/api/admin/settings" && method === "GET") {
      const s = await getSettings(db);
      return json({ ok: true, settings: { nama_perusahaan: s.nama_perusahaan || "", nama_pimpinan: s.nama_pimpinan || "", zona_waktu: s.zona_waktu || "Asia/Jakarta" } });
    }
    if (path === "/api/admin/settings" && method === "PUT") {
      const zona = ZONA_LABEL[body.zona_waktu] ? body.zona_waktu : "Asia/Jakarta";
      for (const [k, v] of [["nama_perusahaan", String(body.nama_perusahaan || "").slice(0, 120)], ["nama_pimpinan", String(body.nama_pimpinan || "").slice(0, 120)], ["zona_waktu", zona]]) {
        await db.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(k, v).run();
      }
      return json({ ok: true });
    }
    if (path === "/api/admin/backup" && method === "GET") {
      const { results: sr } = await db.prepare("SELECT * FROM shift_results ORDER BY tanggal, team_id, shift").all();
      const { results: dr } = await db.prepare("SELECT * FROM distribution_rows ORDER BY result_id, id").all();
      const byId = new Map();
      for (const r of dr || []) { if (!byId.has(r.result_id)) byId.set(r.result_id, []); byId.get(r.result_id).push({ nama: r.nama, persentase: r.persentase, jumlah_orang: r.jumlah_orang, total_gram: r.total_gram, per_orang_gram: r.per_orang_gram }); }
      const entries = (sr || []).map((h) => ({ id: h.id, team_id: h.team_id, tanggal: h.tanggal, shift: h.shift, tanpa_hasil: !!h.tanpa_hasil, hasil_gram: h.hasil_gram, catatan: h.catatan, deleted_at: h.deleted_at, created_at: h.created_at, updated_at: h.updated_at, rows: byId.get(h.id) || [] }));
      return json({ ok: true, aplikasi: "Inputin - Pencatatan Hasil Usaha", diekspor: nowIso(), jumlah_entri: entries.length, entries });
    }
    if (path === "/api/admin/reset" && method === "POST") {
      if (String(body.konfirmasi || "") !== "RESET") return err("Ketik RESET untuk melanjutkan.", 400);
      const me = await db.prepare("SELECT password_hash FROM users WHERE id = ?").bind(user.id).first();
      if (!me || !(await verifyPassword(String(body.password || ""), me.password_hash))) return err("Password Admin salah.", 403);
      const c1 = await db.prepare("SELECT COUNT(*) AS n FROM shift_results").first();
      const c2 = await db.prepare("SELECT COUNT(*) AS n FROM distribution_rows").first();
      await db.prepare("DELETE FROM distribution_rows").run();
      await db.prepare("DELETE FROM shift_results").run();
      await audit(db, { user_id: user.id, aksi: "reset", detail: { entri_terhapus: c1 ? c1.n : 0, baris_terhapus: c2 ? c2.n : 0 } });
      return json({ ok: true, terhapus: { entri: c1 ? c1.n : 0, baris: c2 ? c2.n : 0 } });
    }
    return err("Endpoint admin tidak dikenal.", 404);
  }

  return err("Endpoint tidak dikenal.", 404);
}

const ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="96" fill="#1E40AF"/><path d="M128 336 L224 176 L288 272 L336 208 L384 336 Z" fill="#D97706"/><circle cx="256" cy="384" r="26" fill="#F8FAFC"/></svg>`;
const MANIFEST = JSON.stringify({ name: "Inputin - Pencatatan Hasil Usaha", short_name: "Inputin", start_url: "/", display: "standalone", background_color: "#F8FAFC", theme_color: "#1E40AF", icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }, { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" }, { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] });
const SW_JS = `const CACHE='inputin-v3';const SHELL=['/','/manifest.webmanifest','/icon.svg','/icon-192.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.pathname.startsWith('/api/'))return;e.respondWith(fetch(e.request).then(r=>{const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request).then(m=>m||caches.match('/'))))});`;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await handleApi(request, env, url); }
      catch (e) { return err("Kesalahan server: " + (e && e.message ? e.message : "tidak dikenal"), 500); }
    }
    if (url.pathname === "/manifest.webmanifest") return new Response(MANIFEST, { headers: { "content-type": "application/manifest+json" } });
    if (url.pathname === "/icon.svg") return new Response(ICON_SVG, { headers: { "content-type": "image/svg+xml" } });
    if (ICON_ASSETS[url.pathname]) { const bin = Uint8Array.from(atob(ICON_ASSETS[url.pathname]), (c) => c.charCodeAt(0)); return new Response(bin, { headers: { "content-type": "image/png", "cache-control": "public, max-age=86400" } }); }
    if (url.pathname === "/sw.js") return new Response(SW_JS, { headers: { "content-type": "application/javascript" } });
    if (url.pathname.startsWith("/assets/")) {
      const nama = url.pathname.split("/").pop();
      const isi = PDF_ASSETS[nama];
      if (isi) return new Response(isi, { headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=31536000, immutable" } });
      return new Response("Tidak ditemukan.", { status: 404 });
    }
    return new Response(FRONTEND_HTML, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" } });
  },
};
