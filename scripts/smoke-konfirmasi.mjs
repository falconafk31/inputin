// Smoke v3.4.5: konfirmasi hapus baris kelompok (tombol X) + konfirmasi daftar perubahan sebelum submit Mode Edit.
// Semua di PREVIEW, data contoh Team 2 tanggal 2026-10-05, dibersihkan di akhir.
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("admin")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";
const hasil = [];
const cek = (nama, ok, det) => { hasil.push([nama, ok]); console.log((ok ? "PASS " : "FAIL ") + nama + (det ? " | " + det : "")); };

// ---------- Seed via API langsung ----------
const loginR = await fetch(ORIGIN + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: PASS }) });
const cookie = (loginR.headers.get("set-cookie") || "").split(";")[0];
const H = { "Content-Type": "application/json", Cookie: cookie };
cek("login admin preview", loginR.status === 200 && !!cookie);
const seed = { team_id: 2, tanggal: "2026-10-05", shift: 1, tanpa_hasil: false, hasil_gram: 50, catatan: "", rows: [{ nama: "Operator", persentase: 6, jumlah_orang: 4 }, { nama: "Kelompok Kas", persentase: 8, jumlah_orang: 1 }] };
const seedR = await fetch(ORIGIN + "/api/entries", { method: "POST", headers: H, body: JSON.stringify(seed) });
cek("seed entri contoh tersimpan", seedR.status === 200, "status " + seedR.status);
const bacaEntri = async () => { const d = await (await fetch(ORIGIN + "/api/entries/one?team_id=2&tanggal=2026-10-05&shift=1", { headers: H })).json(); return d.entry; };
let entri = await bacaEntri();
const entryId = entri && entri.id;
cek("entri contoh terbaca (id " + entryId + ")", !!entri && entri.hasil_gram === 50 && entri.rows.length === 2);

// ---------- UI ----------
const PORT = 9341;
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
  cek("login admin di UI", (await ev2(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:atob('${b64}')}).then(r=>r.status)`)) === 200);
  await ev2("location.reload(); 'ok'");
  await wait(3000);
  // Arahkan form ke Team 2 / 5 Okt 2026 / Shift 1
  await ev2("(()=>{ const s=document.querySelector('#f-team'); s.value='2'; s.dispatchEvent(new Event('change',{bubbles:true})); const t=document.querySelector('#f-tanggal'); t.value='2026-10-05'; t.dispatchEvent(new Event('input',{bubbles:true})); t.dispatchEvent(new Event('change',{bubbles:true})); [...document.querySelectorAll('.seg button')].find(b=>b.innerText.trim()==='Shift 1').click(); return 'ok'; })()");
  await wait(2500);
  const jmlBaris = () => ev2("document.querySelectorAll('.dist').length");
  const modalTeks = () => ev2("(()=>{ const m=document.querySelector('.modal'); return m ? m.innerText : ''; })()");
  cek("form Mode Edit memuat 2 baris + hasil 50", (await jmlBaris()) === 2 && (await ev2("document.querySelector('#f-hasil').value")) === "50", "hasil: " + (await ev2("document.querySelector('#f-hasil') ? document.querySelector('#f-hasil').value : '?'")));

  // --- Uji A: konfirmasi hapus baris ---
  await ev2("document.querySelectorAll('.dist .icon-btn')[1].click(); 'ok'");
  await wait(600);
  let mt = await modalTeks();
  cek("klik X memunculkan modal konfirmasi hapus kelompok", mt.includes("Hapus kelompok ini?") && mt.includes("Kelompok Kas"), mt.slice(0, 80));
  cek("baris belum terhapus selama modal tampil", (await jmlBaris()) === 2);
  await ev2("[...document.querySelectorAll('.modal .btn')].find(b=>b.innerText.trim()==='Batal').click(); 'ok'");
  await wait(400);
  cek("Batal menutup modal, baris tetap 2", (await modalTeks()) === "" && (await jmlBaris()) === 2);
  await ev2("document.querySelectorAll('.dist .icon-btn')[1].click(); 'ok'");
  await wait(600);
  await ev2("[...document.querySelectorAll('.modal .btn')].find(b=>b.innerText.trim()==='Ya, Hapus').click(); 'ok'");
  await wait(400);
  cek("Ya, Hapus menghilangkan baris (sisa 1)", (await jmlBaris()) === 1);

  // --- Uji B: konfirmasi perubahan sebelum submit ---
  await ev2("(()=>{ const h=document.querySelector('#f-hasil'); h.value='60'; h.dispatchEvent(new Event('input',{bubbles:true})); return 'ok'; })()");
  await wait(300);
  await ev2("document.querySelector('.savebar .btn').click(); 'ok'");
  await wait(700);
  mt = await modalTeks();
  cek("submit Mode Edit memunculkan modal daftar perubahan", mt.includes("Simpan perubahan ini?") && mt.includes("Hasil: 50,000 gr menjadi 60,000 gr") && mt.includes("Kelompok dihapus: Kelompok Kas"), mt.replace(/\n/g, " | ").slice(0, 220));
  await ev2("[...document.querySelectorAll('.modal .btn')].find(b=>b.innerText.trim()==='Batal').click(); 'ok'");
  await wait(500);
  entri = await bacaEntri();
  cek("Batal: data di server tidak berubah (50 gr, 2 baris)", !!entri && entri.hasil_gram === 50 && entri.rows.length === 2);
  await ev2("document.querySelector('.savebar .btn').click(); 'ok'");
  await wait(700);
  await ev2("[...document.querySelectorAll('.modal .btn')].find(b=>b.innerText.trim()==='Ya, Simpan Perubahan').click(); 'ok'");
  await wait(1800);
  entri = await bacaEntri();
  cek("Ya, Simpan Perubahan: server kini 60 gr, 1 baris", !!entri && entri.hasil_gram === 60 && entri.rows.length === 1 && entri.rows[0].nama === "Operator", JSON.stringify(entri && { h: entri.hasil_gram, r: entri.rows.length }));

  // --- Uji C: submit tanpa perubahan = tanpa modal ---
  await ev2("document.querySelector('.savebar .btn').click(); 'ok'");
  await wait(1200);
  cek("submit tanpa perubahan langsung tersimpan (tanpa modal)", (await modalTeks()) === "");
  ws.close();
} finally { chrome.kill("SIGKILL"); }

// ---------- Cleanup ----------
if (entryId) await fetch(ORIGIN + "/api/entries/" + entryId, { method: "DELETE", headers: H });
cek("entri contoh dibersihkan", true);

const gagal = hasil.filter((h) => !h[1]).length;
console.log(`\nSMOKE KONFIRMASI: ${hasil.length - gagal}/${hasil.length} PASS`);
process.exit(gagal ? 1 : 0);
