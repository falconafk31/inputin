// Smoke v3.7.0: ikon pensil penanda field bisa diedit + Edit User admin (username/password) di PREVIEW.
// API: buat user uji -> edit username+password -> login baru OK / lama gagal -> username duplikat ditolak ->
// admin terakhir dilindungi -> staff tidak bisa memakai endpoint admin.
// UI: ikon pensil ada di kartu kelompok form Input; tombol Edit membuka modal berisi data user; simpan mengubah tabel.
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";
const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("admin")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";
const hasil = [];
const cek = (nama, ok, det) => { hasil.push([nama, !!ok]); console.log((ok ? "PASS " : "FAIL ") + nama + (det ? " | " + det : "")); };
async function login(u, p) { const r = await fetch(ORIGIN + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: u, password: p }) }); return r.status === 200 ? (r.headers.get("set-cookie") || "").split(";")[0] : ""; }
const ckAdmin = await login("admin", PASS);
const H = { "Content-Type": "application/json", Cookie: ckAdmin };
cek("login admin preview", !!ckAdmin);
// Tunggu versi baru konsisten sesudah deploy (probe: PUT user tak dikenal harus 404 dari handler baru)
let siap = false;
for (let i = 0; i < 12; i++) {
  const p = await fetch(ORIGIN + "/api/admin/users/999999", { method: "PUT", headers: H, body: JSON.stringify({ nama: "x", role: "staff", aktif: true }) });
  if (p.status === 404) { siap = true; break; }
  await wait(5000);
}
cek("worker versi baru konsisten (probe PUT 404)", siap);
// Buat user uji
const SFX = String(Date.now()).slice(-5);
const buat = await (await fetch(ORIGIN + "/api/admin/users", { method: "POST", headers: H, body: JSON.stringify({ nama: "Uji Edit", username: "ujiedit" + SFX, password: "UjiEdit-123", role: "staff", team_id: 2 }) })).json();
cek("buat user uji", buat.ok && buat.id > 0, "id " + buat.id);
const idUji = buat.id;
// Edit username + password
const edit = await (await fetch(ORIGIN + `/api/admin/users/${idUji}`, { method: "PUT", headers: H, body: JSON.stringify({ nama: "Uji Edit Baru", username: "ujiedit2" + SFX, role: "staff", team_id: 1, aktif: true, password: "UjiBaru-456" }) })).json();
cek("edit username + password + pindah team", edit.ok === true, "");
const ckBaru = await login("ujiedit2" + SFX, "UjiBaru-456");
cek("login dengan username + password baru", !!ckBaru);
const ckLama = await login("ujiedit" + SFX, "UjiEdit-123");
cek("login lama ditolak", ckLama === "");
// Username duplikat ditolak
const dup = await fetch(ORIGIN + `/api/admin/users/${idUji}`, { method: "PUT", headers: H, body: JSON.stringify({ nama: "Uji Edit Baru", username: "admin", role: "staff", team_id: 1, aktif: true }) });
cek("username duplikat ditolak (400)", dup.status === 400, "status " + dup.status);
// Password pendek ditolak
const pendek = await fetch(ORIGIN + `/api/admin/users/${idUji}`, { method: "PUT", headers: H, body: JSON.stringify({ nama: "Uji Edit Baru", role: "staff", team_id: 1, aktif: true, password: "abc" }) });
cek("password < 8 ditolak (400)", pendek.status === 400, "status " + pendek.status);
// Admin terakhir dilindungi: cari id admin yang login (dari daftar user)
const daftar = await (await fetch(ORIGIN + "/api/admin/users", { headers: H })).json();
const adminAktif = (daftar.users || []).filter((u) => u.role === "admin" && u.aktif);
if (adminAktif.length === 1) {
  const turun = await fetch(ORIGIN + `/api/admin/users/${adminAktif[0].id}`, { method: "PUT", headers: H, body: JSON.stringify({ nama: adminAktif[0].nama, role: "staff", team_id: 1, aktif: true }) });
  cek("admin aktif satu-satunya tidak bisa diturunkan (400)", turun.status === 400, "status " + turun.status);
} else {
  cek("admin aktif satu-satunya tidak bisa diturunkan (400)", true, "dilewati: admin aktif=" + adminAktif.length);
}
// Staff tidak bisa memakai endpoint admin
const tolak = await fetch(ORIGIN + `/api/admin/users/${idUji}`, { method: "PUT", headers: { "Content-Type": "application/json", Cookie: ckBaru }, body: JSON.stringify({ nama: "x", role: "staff", aktif: true }) });
cek("staff dilarang edit user (403)", tolak.status === 403, "status " + tolak.status);

// ===== UI =====
const PORT = 9353;
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
  ws.addEventListener("message", async (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method !== "Fetch.requestPaused") return;
    const { requestId, request } = m.params;
    if (request.url.startsWith(ORIGIN + "/api/")) {
      try {
        let pd = request.postData || "";
        if (request.hasPostData && pd.length < 30 && request.method === "POST") { const full = await send("Fetch.getRequestPostData", { requestId }); if (full.result && full.result.postData) pd = Buffer.from(full.result.postData, full.result.base64Encoded ? "base64" : "utf8").toString("utf8"); }
        const r = await fetch(request.url, { method: request.method, headers: { "Content-Type": "application/json", ...(request.headers.Cookie ? { Cookie: request.headers.Cookie } : {}) }, body: (request.method === "POST" || request.method === "PUT") ? pd : undefined, redirect: "manual" });
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
  // Ikon pensil di form Input (kartu kelompok pertama: nama + persen + orang = 3 ikon)
  const pensil = await ev2("document.querySelectorAll('.dist .inp-edit svg').length");
  cek("ikon pensil tampil di field kelompok (nama, persen, orang)", pensil >= 3, "jumlah " + pensil);
  const pensilTerlihat = await ev2("(()=>{ const s=document.querySelector('.dist .inp-edit svg'); if(!s) return false; const r=s.getBoundingClientRect(); const cs=getComputedStyle(s); return r.width>0 && cs.color !== ''; })()");
  cek("ikon pensil benar-benar ter-render (ukuran + warna)", pensilTerlihat === true, "");
  // Admin: buka accordion User, klik Edit pada baris ujiedit2
  await ev2("[...document.querySelectorAll('.bottomnav button')][3].click(); 'ok'");
  await wait(2500);
  const klikEdit = await ev2(`(()=>{ const rows=[...document.querySelectorAll('tr')]; const row=rows.find(r=>r.innerText.includes('ujiedit2${SFX}')); if(!row) return 'baris tidak ada'; const b=[...row.querySelectorAll('button')].find(x=>x.innerText.trim()==='Edit'); if(!b) return 'tombol tidak ada'; b.click(); return 'klik'; })()`);
  cek("tombol Edit ada di baris user", klikEdit === "klik", String(klikEdit));
  await wait(900);
  const modalIsi = await ev2("(()=>{ const m=[...document.querySelectorAll('.modal')].find(x=>x.innerText.includes('Edit User')); if(!m) return ''; const inp=[...m.querySelectorAll('input')]; return inp.map(i=>i.value).join('|'); })()");
  cek("modal Edit User terbuka berisi data user", String(modalIsi).includes("Uji Edit Baru") && String(modalIsi).includes("ujiedit2" + SFX), String(modalIsi).slice(0, 60));
  // Ubah nama lewat modal lalu simpan
  await ev2("(()=>{ const m=[...document.querySelectorAll('.modal')].find(x=>x.innerText.includes('Edit User')); const inp=[...m.querySelectorAll('input')][0]; inp.value='Uji Edit Final'; inp.dispatchEvent(new Event('input',{bubbles:true})); const b=[...m.querySelectorAll('button')].find(x=>x.innerText.includes('Simpan')); b.click(); return 'simpan'; })()");
  await wait(3000);
  const tabelBaru = await ev2("document.body.textContent.includes('Uji Edit Final')");
  const diag = await ev2("(()=>{ const m=[...document.querySelectorAll('.modal')].find(x=>x.innerText.includes('Edit User')); const f=document.querySelector('.flash'); return (m ? 'modal masih terbuka; ' : 'modal tertutup; ') + (f ? 'flash: ' + f.innerText : 'tanpa flash'); })()");
  cek("nama baru tampil di tabel setelah simpan dari modal", tabelBaru === true, diag);
  ws.close();
} finally { chrome.kill("SIGKILL"); }
// Bersihkan: nonaktifkan user uji
await fetch(ORIGIN + `/api/admin/users/${idUji}`, { method: "PUT", headers: H, body: JSON.stringify({ nama: "Uji Edit Final", role: "staff", team_id: 1, aktif: false }) });
const gagal = hasil.filter((h) => !h[1]).length;
console.log(`\nSMOKE USER EDIT: ${hasil.length - gagal}/${hasil.length} PASS`);
process.exit(gagal ? 1 : 0);
