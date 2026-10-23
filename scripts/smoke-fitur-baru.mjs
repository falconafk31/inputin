// Smoke fitur baru v3.3.0 di PREVIEW: matriks kolom Lainnya (7 kelompok) + antrian offline.
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("admin")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";
const hasil = [];
const cek = (nama, ok, det) => { hasil.push([nama, !!ok]); console.log((ok ? "PASS " : "FAIL ") + nama + (det ? " | " + det : "")); };

// --- API langsung (Node fetch) untuk seed + cleanup ---
let cookie = "";
async function api(path, opts = {}) {
  const r = await fetch(ORIGIN + path, { ...opts, headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) } });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
  return d;
}
const TGL_M = ["2026-10-12", "2026-10-13", "2026-10-14"];
const TGL_Q = ["2026-10-05", "2026-10-06"];
async function bersihkan() {
  for (const tgl of [...TGL_M, ...TGL_Q]) {
    const d = await api(`/api/entries?team_id=1&from=${tgl}&to=${tgl}&per=10&page=1`);
    for (const day of d.days || []) for (const s of day.shifts || []) await api(`/api/entries/${s.id}`, { method: "DELETE" });
  }
}

await api("/api/login", { method: "POST", body: JSON.stringify({ username: "admin", password: PASS }) });
await bersihkan();
// Seed matriks: 3 hari x 100 gr, 7 kelompok (total persen 18)
const ROWS7 = [
  { nama: "Operator", persentase: 6, jumlah_orang: 6 }, { nama: "Helper", persentase: 4, jumlah_orang: 5 },
  { nama: "Mandor", persentase: 3, jumlah_orang: 2 }, { nama: "Sopir", persentase: 2, jumlah_orang: 2 },
  { nama: "Satpam", persentase: 1, jumlah_orang: 2 }, { nama: "Koki", persentase: 1, jumlah_orang: 1 },
  { nama: "Tukang", persentase: 1, jumlah_orang: 1 },
];
for (const tgl of TGL_M) await api("/api/entries", { method: "POST", body: JSON.stringify({ team_id: 1, tanggal: tgl, shift: 1, tanpa_hasil: false, hasil_gram: 100, catatan: "uji matriks 7 kelompok", rows: ROWS7 }) });
const rep = await api("/api/report?team_id=1&from=2026-10-12&to=2026-10-14");
cek("API report: 7 kolom kelompok", rep.kelompok_kolom && rep.kelompok_kolom.length === 7, (rep.kelompok_kolom || []).join(","));
cek("API report: total terbagi 54", Math.abs(rep.totals.terbagi - 54) < 1e-9, "terbagi=" + rep.totals.terbagi);

// --- Browser ---
const PORT = 9337;
const chrome = spawn(process.env.CHROME_BIN || "/home/hatch/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome", ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${PORT}`, "--window-size=430,900", "about:blank"], { stdio: "ignore" });
try {
  let targets = null;
  for (let i = 0; i < 30; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets && targets.length) break; } catch {} await wait(400); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  let mid = 0; const pend = new Map(); const errs = [];
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } if (m.method === "Runtime.exceptionThrown") errs.push("EXC: " + (m.params.exceptionDetails.exception?.description || "").slice(0, 140)); };
  await new Promise((r) => (ws.onopen = r));
  const send = (method, params = {}) => new Promise((res) => { const id = ++mid; pend.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable"); await send("Runtime.enable"); await send("Fetch.enable", { patterns: [{ urlPattern: ORIGIN + "/*", requestStage: "Request" }] });
  ws.addEventListener("message", async (ev) => {
    const m = JSON.parse(ev.data);
    if (m.method !== "Fetch.requestPaused") return;
    const { requestId, request } = m.params;
    try {
      const r = await fetch(request.url, { method: request.method, headers: request.headers, body: request.postData || undefined, redirect: "manual" });
      const buf = Buffer.from(await r.arrayBuffer());
      const rh = {}; r.headers.forEach((v, k) => { if (!["content-length", "content-encoding", "transfer-encoding"].includes(k.toLowerCase())) rh[k] = v; });
      await send("Fetch.fulfillRequest", { requestId, responseCode: r.status, responseHeaders: Object.entries(rh).map(([name, value]) => ({ name, value })), body: buf.toString("base64") });
    } catch (e) { await send("Fetch.failRequest", { requestId, errorReason: "Failed" }); }
  });
  const ev2 = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || "eval error"); return r.result?.result?.value; };
  await send("Page.navigate", { url: ORIGIN + "/" });
  await wait(3000);
  const b64 = Buffer.from(JSON.stringify({ username: "admin", password: PASS })).toString("base64");
  const loginRes = await ev2(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:atob('${b64}')}).then(r=>r.status)`);
  cek("login admin preview", loginRes === 200, "status " + loginRes);
  await ev2("location.reload(); 'ok'");
  await wait(3500);

  // === A. Matriks Lainnya di layar ===
  await ev2("[...document.querySelectorAll('.bottomnav button')][2].click(); 'ok'");
  await wait(1200);
  await ev2(`(()=>{ const set=(el,v)=>{ Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }; set(document.querySelector('#l-dari'),'2026-10-12'); set(document.querySelector('#l-sampai'),'2026-10-14'); return 'ok'; })()`);
  await wait(2500);
  await ev2("(()=>{ const cards=[...document.querySelectorAll('.card')]; const mc = cards.find(c=>c.innerText.includes('Terbagi Per Hari Per Kelompok')); const t = mc && mc.querySelector('.acc-toggle'); if (t) t.click(); return t ? 'accordion dibuka' : 'tanpa toggle'; })()");
  await wait(600);
  const layarMatriks = await ev2("(()=>{ const cards=[...document.querySelectorAll('.card')]; const mc = cards.find(c=>c.innerText.includes('Terbagi Per Hari Per Kelompok')); return mc ? mc.innerText.replace(/\\n/g,' | ').slice(0,600) : '(kartu matriks tidak ada)'; })()");
  cek("layar: matriks tampil dengan kolom Lainnya", layarMatriks.includes("Lainnya"), layarMatriks.slice(0, 200));
  cek("layar: total kolom Lainnya 6,000", layarMatriks.includes("6,000"), "");

  // === PDF rentang memuat Lainnya ===
  const uri = await ev2("window.__PDF_TEST__=true; window.__unduhPDF(false).then(d=>d.output('datauristring'))");
  fs.writeFileSync(new URL("../smoke-test/laporan-matriks-lainnya.pdf", import.meta.url), Buffer.from(uri.split(",")[1], "base64"));
  cek("PDF rentang 7 kelompok ter-generate", uri.length > 5000, "datauri " + uri.length);

  // === B. Antrian offline ===
  await ev2("[...document.querySelectorAll('.bottomnav button')][0].click(); 'ok'");
  await wait(1500);
  await ev2(`(()=>{ window.__fetchAsli = window.fetch; window.fetch = (u,o)=>{ if (String(u).includes('/api/entries') && o && o.method==='POST') return Promise.reject(new TypeError('stub offline')); return window.__fetchAsli(u,o); }; return 'stub aktif'; })()`);
  const isiForm = async (tgl, hasilGram) => {
    await ev2(`(()=>{ const set=(el,v,proto)=>{ Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }; set(document.querySelector('#f-tanggal'),'${tgl}',HTMLInputElement); return 'ok'; })()`);
    await wait(1200);
    await ev2(`(()=>{ const set=(el,v,proto)=>{ Object.getOwnPropertyDescriptor(proto.prototype,'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }; set(document.querySelector('#f-hasil'),'${hasilGram}',HTMLInputElement); set(document.querySelector('#f-catatan'),'uji antrian offline',HTMLTextAreaElement); return 'ok'; })()`);
    await wait(300);
    await ev2("document.querySelector('.save-btn').click(); 'ok'");
    await wait(1500);
  };
  await isiForm(TGL_Q[0], "120");
  const q1 = await ev2("JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]').length");
  const qPayload = await ev2("(()=>{ const q=JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]'); return q.length ? (q[0].payload.hasil_gram + '|' + q[0].payload.tanggal + '|' + q[0].pemilik) : '-'; })()");
  const qShift = await ev2("(()=>{ const q=JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]'); return q.length ? q[0].payload.shift : 1; })()");
  cek("offline: input masuk antrian lokal", q1 === 1 && qPayload.startsWith("120|2026-10-05|admin"), "payload " + qPayload);
  const kartuAntrian = await ev2("document.body.innerText.includes('Menunggu Terkirim (1)')");
  cek("offline: kartu antrian tampil", kartuAntrian === true);
  // Guard clearCache: buka sheet profil -> Perbaiki Aplikasi
  await ev2("document.querySelector('.topbar .avatar').click(); 'ok'");
  await wait(700);
  await ev2("[...document.querySelectorAll('.pitem')].find(b=>b.innerText.includes('Perbaiki Aplikasi')).click(); 'ok'");
  await wait(700);
  const flashGuard = await ev2("document.querySelector('.banner.toast')?.innerText || ''");
  const qMasih = await ev2("JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]').length");
  cek("guard: Perbaiki Aplikasi tertahan saat ada antrian", flashGuard.includes("belum terkirim") && qMasih === 1, flashGuard.slice(0, 90));
  await ev2("document.querySelector('.sheet-bg')?.dispatchEvent(new MouseEvent('click',{bubbles:true})); 'ok'");
  await wait(400);
  // Online lagi -> kirim sekarang
  await ev2("window.fetch = window.__fetchAsli; 'ok'");
  await ev2("[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Kirim Sekarang').click(); 'ok'");
  await wait(2500);
  const q2 = await ev2("JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]').length");
  cek("online: antrian terkirim dan kosong", q2 === 0, "sisa " + q2);
  const masuk = await api("/api/entries/one?team_id=1&tanggal=2026-10-05&shift=" + (qShift || 1));
  cek("online: entri antrian tersimpan di server (120 gr)", masuk.entry && Math.abs(masuk.entry.hasil_gram - 120) < 1e-9, masuk.entry ? "hasil " + masuk.entry.hasil_gram : "tidak ada");
  cek("tanpa error JS relevan", errs.length === 0, errs.slice(0, 2).join(" ;; "));
  ws.close();
} finally { chrome.kill("SIGKILL"); }

await bersihkan();
const rep2 = await api("/api/report?team_id=1&from=2026-10-01&to=2026-10-31");
cek("cleanup: data uji terhapus (report Okt kosong)", rep2.totals.hasil === 0, "hasil=" + rep2.totals.hasil);
const gagal = hasil.filter((h) => !h[1]).length;
console.log(`\nSMOKE FITUR BARU: ${hasil.length - gagal}/${hasil.length} PASS`);
process.exit(gagal ? 1 : 0);
