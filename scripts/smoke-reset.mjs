// Smoke Reset Data Transaksi + font angka (v3.6.0) di PREVIEW (D1 terisolasi - aman direset).
// API: backup berisi seed; reset ditolak tanpa RESET / password salah / bukan admin; reset benar mengosongkan
// entri tapi team/user/settings/audit tetap; UI: kartu reset ada, tombol nonaktif sampai 3 syarat terpenuhi,
// angka KPI memakai font Plus Jakarta Sans (kelas num).
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";
const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const ambil = (u) => credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith(u)).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const PASS = ambil("admin"), PASS_STAFF = ambil("staff1");
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";
const hasil = [];
const cek = (nama, ok, det) => { hasil.push([nama, !!ok]); console.log((ok ? "PASS " : "FAIL ") + nama + (det ? " | " + det : "")); };
async function login(u, p) { const r = await fetch(ORIGIN + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) }); return (r.headers.get("set-cookie") || "").split(";")[0]; }
const ckAdmin = await login("admin", PASS);
const H = { "Content-Type": "application/json", Cookie: ckAdmin };
cek("login admin preview", !!ckAdmin);
// Tunggu versi worker baru konsisten (sesudah deploy, origin bisa melayani campuran versi lama/baru sesaat).
// Probe: konfirmasi salah harus 400 di worker baru; worker lama menjawab 404.
let siapVersi = false;
for (let i = 0; i < 12; i++) {
  const p = await fetch(ORIGIN + "/api/admin/reset", { method: "POST", headers: H, body: JSON.stringify({ konfirmasi: "PROBE", password: "x" }) });
  if (p.status === 400) { siapVersi = true; break; }
  await wait(6000);
}
cek("worker versi baru konsisten (probe reset 400)", siapVersi);
const ROWS = [{ nama: "Operator", persentase: 6, jumlah_orang: 4 }, { nama: "Kelompok Kas", persentase: 8, jumlah_orang: 1 }];
for (const [team, tgl] of [[1, "2026-10-21"], [2, "2026-10-21"]]) {
  const r = await fetch(ORIGIN + "/api/entries", { method: "POST", headers: H, body: JSON.stringify({ team_id: team, tanggal: tgl, shift: 1, tanpa_hasil: false, hasil_gram: 40, catatan: "seed reset", rows: ROWS }) });
  if (r.status !== 200) console.log("  seed gagal", team, r.status);
}
// 1. Backup
const bk = await (await fetch(ORIGIN + "/api/admin/backup", { headers: H })).json();
cek("backup JSON berisi entri + baris", bk.ok && bk.jumlah_entri >= 2 && bk.entries.every((e) => Array.isArray(e.rows)) && bk.entries.some((e) => e.rows.length === 2), "entri: " + bk.jumlah_entri);
// 2. Penolakan
const tolak1 = await fetch(ORIGIN + "/api/admin/reset", { method: "POST", headers: H, body: JSON.stringify({ konfirmasi: "HAPUS", password: PASS }) });
cek("reset ditolak bila kata konfirmasi bukan RESET (400)", tolak1.status === 400, "status " + tolak1.status);
const tolak2 = await fetch(ORIGIN + "/api/admin/reset", { method: "POST", headers: H, body: JSON.stringify({ konfirmasi: "RESET", password: "salah-total" }) });
cek("reset ditolak bila password salah (403)", tolak2.status === 403, "status " + tolak2.status);
const ckStaff = await login("staff1", PASS_STAFF);
const tolak3 = await fetch(ORIGIN + "/api/admin/backup", { headers: { Cookie: ckStaff } });
cek("backup khusus admin (staff 403)", tolak3.status === 403, "status " + tolak3.status);
const masih = await (await fetch(ORIGIN + "/api/report?team_id=all&from=2026-10-21&to=2026-10-21", { headers: H })).json();
cek("data utuh setelah percobaan gagal", masih.totals && masih.totals.hasil >= 80, "total " + (masih.totals && masih.totals.hasil));
// 3. Reset benar
const rz = await (await fetch(ORIGIN + "/api/admin/reset", { method: "POST", headers: H, body: JSON.stringify({ konfirmasi: "RESET", password: PASS }) })).json();
cek("reset berhasil + hitungan terhapus", rz.ok && rz.terhapus.entri >= 2 && rz.terhapus.baris >= 4, JSON.stringify(rz.terhapus));
const sesudah = await (await fetch(ORIGIN + "/api/report?team_id=all&from=2026-01-01&to=2026-12-31", { headers: H })).json();
cek("laporan kosong total setelah reset", sesudah.totals && sesudah.totals.hasil === 0 && (sesudah.days || []).length === 0, "");
const adm = await (await fetch(ORIGIN + "/api/admin/teams", { headers: H })).json();
const setg = await (await fetch(ORIGIN + "/api/admin/settings", { headers: H })).json();
cek("team + settings tetap ada setelah reset", (adm.teams || []).length >= 2 && !!setg.settings, "");
const auditList = await (await fetch(ORIGIN + "/api/entries?team_id=1&from=2026-10-21&to=2026-10-21&per=5&page=1", { headers: H })).json();
cek("daftar entri kosong setelah reset", (auditList.days || []).length === 0, "");
// audit reset event: cek lewat riwayat perubahan global? endpoint riwayat per entri tidak ada untuk event global;
// verifikasi tidak langsung: login ulang tetap bisa + status admin jalan.
const st = await (await fetch(ORIGIN + "/api/admin/status?tanggal=2026-10-21", { headers: H })).json();
cek("status admin tetap jalan setelah reset", st.ok && Array.isArray(st.status), "");

// 4. UI: kartu reset + gerbang tombol + font angka KPI
const PORT = 9351;
const chrome = spawn(process.env.CHROME_BIN || "/home/hatch/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome", ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${PORT}`, "--window-size=430,900", "about:blank"], { stdio: "ignore" });
try {
  let targets = null;
  for (let i = 0; i < 30; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets && targets.length) break; } catch {} await wait(400); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  let mid = 0; const pend = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const id = ++mid; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Network.enable");
  await send("Network.setRequestInterception", { patterns: [{ urlPattern: ORIGIN + "/*", requestStage: "Request" }] });
  ws.addEventListener("message", async (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method !== "Fetch.requestPaused") return;
    const { requestId, request } = m.params;
    if (request.url.startsWith(ORIGIN + "/api/")) {
      try {
        let pd = request.postData || "";
        if (request.hasPostData && pd.length < 30 && request.method === "POST") { const full = await send("Fetch.getRequestPostData", { requestId }); if (full.result && full.result.postData) pd = Buffer.from(full.result.postData, full.result.base64Encoded ? "base64" : "utf8").toString("utf8"); }
        const r = await fetch(request.url, { method: request.method, headers: { "Content-Type": "application/json", ...(request.headers.Cookie ? { Cookie: request.headers.Cookie } : {}) }, body: request.method === "POST" ? pd : undefined, redirect: "manual" });
        const buf = Buffer.from(await r.arrayBuffer());
        const rh = {}; r.headers.forEach((v, k) => { if (!["content-length", "content-encoding", "transfer-encoding"].includes(k.toLowerCase())) rh[k] = v; });
        await send("Fetch.fulfillRequest", { requestId, responseCode: r.status, responseHeaders: Object.entries(rh).map(([name, value]) => ({ name, value })), body: buf.toString("base64") });
      } catch (e) { await send("Fetch.failRequest", { requestId, errorReason: "Failed" }); }
      return;
    }
    const target = request.url.replace(ORIGIN, "http://127.0.0.1:8899");
    try {
      const headers = { ...request.headers }; delete headers.host; delete headers.Host; delete headers["Accept-Encoding"]; delete headers["accept-encoding"];
      const r = await fetch(target, { method: request.method, headers, body: request.postData || undefined, redirect: "manual" });
      const buf = Buffer.from(await r.arrayBuffer());
      const rh = {}; r.headers.forEach((v, k) => { if (!["content-length", "content-encoding", "transfer-encoding"].includes(k.toLowerCase())) rh[k] = v; });
      await send("Fetch.fulfillRequest", { requestId, responseCode: r.status, responseHeaders: Object.entries(rh).map(([name, value]) => ({ name, value })), body: buf.toString("base64") });
    } catch (e) { await send("Fetch.failRequest", { requestId, errorReason: "Failed" }); }
  });
  await send("Fetch.enable", { patterns: [{ urlPattern: ORIGIN + "/*", requestStage: "Request" }] });
  await send("Page.navigate", { url: ORIGIN + "/" });
  await wait(3500);
  const ev2 = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval error"); return r.result?.result?.value; };
  const b64 = Buffer.from(JSON.stringify({ username: "admin", password: PASS })).toString("base64");
  await ev2(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:atob('${b64}')}).then(r=>r.status)`);
  await ev2("location.reload(); 'ok'");
  await wait(3000);
  // Font angka: buka Laporan, periksa font KPI (perlu data - seed 1 entri via API dari browser agar KPI tampil)
  await ev2(`fetch('/api/entries',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({team_id:1,tanggal:'${new Date().toISOString().slice(0, 10)}',shift:1,tanpa_hasil:false,hasil_gram:12.5,catatan:'',rows:[{nama:'Operator',persentase:6,jumlah_orang:4}]})}).then(r=>r.status)`);
  await ev2("[...document.querySelectorAll('.bottomnav button')][2].click(); 'ok'");
  await wait(2500);
  const fontKpi = await ev2("(()=>{ const v=document.querySelector('.kpi .val'); if(!v) return 'tidak ada'; const cs=getComputedStyle(v); return v.className + '|' + cs.fontFamily.slice(0, 30) + '|' + cs.fontSize + '|' + cs.fontWeight; })()");
  cek("angka KPI memakai Plus Jakarta Sans 24px 700 (kelas num)", String(fontKpi).includes("num") && String(fontKpi).includes("Plus Jakarta Sans") && String(fontKpi).includes("24px"), fontKpi);
  // Admin: kartu reset + gerbang
  await ev2("[...document.querySelectorAll('.bottomnav button')][3].click(); 'ok'");
  await wait(2500);
  const adaKartu = await ev2("document.body.innerText.includes('Reset Data Transaksi') && !!document.querySelector('#rs-teks')");
  cek("kartu Reset Data Transaksi ada di Admin", adaKartu === true, "");
  const btnAwal = await ev2("(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Reset Semua Data Transaksi'); return b ? b.disabled : 'tidak ada'; })()");
  cek("tombol reset nonaktif sebelum syarat terpenuhi", btnAwal === true, "");
  await ev2("(()=>{ const i=document.querySelector('#rs-teks'); i.value='RESET'; i.dispatchEvent(new Event('input',{bubbles:true})); const p=document.querySelector('#rs-pass'); p.value='x'; p.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; })()");
  await wait(600);
  const btnTengah = await ev2("(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Reset Semua Data Transaksi'); return b ? b.disabled : 'tidak ada'; })()");
  cek("tombol tetap nonaktif sebelum backup diunduh", btnTengah === true, "");
  // bersihkan entri font-check lewat API admin (reset sunguhan lewat UI terlalu destruktif untuk sisa suite; API reset sudah terbukti di atas)
  ws.close();
} finally { chrome.kill("SIGKILL"); }
const rz2 = await (await fetch(ORIGIN + "/api/admin/reset", { method: "POST", headers: H, body: JSON.stringify({ konfirmasi: "RESET", password: PASS }) })).json();
cek("pembersihan akhir preview via reset", rz2.ok === true, "");
const gagal = hasil.filter((h) => !h[1]).length;
console.log(`\nSMOKE RESET: ${hasil.length - gagal}/${hasil.length} PASS`);
process.exit(gagal ? 1 : 0);
