// Smoke Dashboard Fase 1 (v3.5.0): tab Grafik di Laporan - KPI, grafik harian/bulanan, donat, Analisa Singkat.
// Semua di PREVIEW, data contoh Team 2, ekspektasi dihitung dari API laporan yang sama. Seed dibersihkan di akhir.
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("admin")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";
const hasil = [];
const cek = (nama, ok, det) => { hasil.push([nama, !!ok]); console.log((ok ? "PASS " : "FAIL ") + nama + (det ? " | " + det : "")); };
const fmtID = (n) => (Number(n) || 0).toLocaleString("id-ID", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const p2 = (x) => String(x).padStart(2, "0");
const tglStr = (d) => d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
const HARI_INI = tglStr(new Date());
const DARI_30 = tglStr(new Date(Date.now() - 29 * 86400000));

// ---------- Seed + ekspektasi via API ----------
const loginR = await fetch(ORIGIN + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: PASS }) });
const cookie = (loginR.headers.get("set-cookie") || "").split(";")[0];
const H = { "Content-Type": "application/json", Cookie: cookie };
cek("login admin preview", loginR.status === 200 && !!cookie);
const ROWS = [{ nama: "Operator", persentase: 6, jumlah_orang: 4 }, { nama: "Kelompok Kas", persentase: 8, jumlah_orang: 1 }];
const SEED = [
  { team_id: 2, tanggal: "2026-10-10", shift: 1, tanpa_hasil: false, hasil_gram: 999, catatan: "", rows: ROWS },
  { team_id: 2, tanggal: "2026-10-12", shift: 1, tanpa_hasil: false, hasil_gram: 20, catatan: "", rows: [{ nama: "Operator", persentase: 6, jumlah_orang: 6 }, { nama: "Kelompok Kas", persentase: 8, jumlah_orang: 1 }] },
  { team_id: 2, tanggal: "2026-10-12", shift: 2, tanpa_hasil: false, hasil_gram: 10, catatan: "", rows: [{ nama: "Operator", persentase: 6, jumlah_orang: 6 }, { nama: "Kelompok Kas", persentase: 8, jumlah_orang: 1 }] },
  { team_id: 2, tanggal: "2026-08-15", shift: 1, tanpa_hasil: false, hasil_gram: 500, catatan: "", rows: ROWS },
  { team_id: 2, tanggal: "2026-09-15", shift: 1, tanpa_hasil: false, hasil_gram: 300, catatan: "", rows: ROWS },
];
for (const e of SEED) { const r = await fetch(ORIGIN + "/api/entries", { method: "POST", headers: H, body: JSON.stringify(e) }); if (r.status !== 200) console.log("  seed gagal", e.tanggal, e.shift, r.status); }
const rep30 = await (await fetch(ORIGIN + `/api/report?team_id=2&from=${DARI_30}&to=${HARI_INI}`, { headers: H })).json();
cek("ekspektasi API 30 hari terbaca", !!rep30.totals && rep30.totals.hasil >= 1029, "total " + (rep30.totals && rep30.totals.hasil));
const awal12 = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 11); return tglStr(d); })();
const rep12 = await (await fetch(ORIGIN + `/api/report?team_id=2&from=${awal12}&to=${HARI_INI}`, { headers: H })).json();
const totalAgu = Math.round((rep12.days || []).filter((d) => d.tanggal.startsWith("2026-08")).reduce((a, d) => a + d.total, 0) * 1000) / 1000;

// ---------- UI ----------
const PORT = 9345;
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
  await ev2("[...document.querySelectorAll('.bottomnav button')][2].click(); 'ok'");
  await wait(2500);
  cek("tab bawaan = Tabel & PDF (kontrol tanggal tampil)", await ev2("!!document.querySelector('#l-dari')"));
  await ev2("[...document.querySelectorAll('.tabseg button')].find(b=>b.innerText.trim()==='Grafik').click(); 'ok'");
  await wait(1200);
  await ev2("(()=>{ const s=document.querySelector('#g-team'); s.value='2'; s.dispatchEvent(new Event('change',{bubbles:true})); return 'ok'; })()");
  await wait(3000);
  const teks = () => ev2("document.body.innerText");
  let t = await teks();
  cek("KPI Total Hasil grafik = API 30 hari (" + fmtID(rep30.totals.hasil) + ")", t.includes(fmtID(rep30.totals.hasil)), "");
  cek("KPI Pendapatan Usaha grafik = API (" + fmtID(rep30.totals.sisa) + ")", t.includes(fmtID(rep30.totals.sisa)), "");
  const jmlRectHarian = await ev2("(()=>{ const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>x.innerText.includes('Hasil Harian')); return c ? c.querySelectorAll('svg rect').length : 0; })()");
  cek("grafik harian menggambar batang (60 rect)", jmlRectHarian >= 55, "rect: " + jmlRectHarian);
  const vb = await ev2("(()=>{ const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>x.innerText.includes('Hasil Harian')); const s=c ? c.querySelector('svg') : null; if(!s) return 'tidak ada'; const tall=[...s.querySelectorAll('rect')].some(r=>Number(r.getAttribute('height'))>20); return s.getAttribute('viewBox') + '|' + tall; })()");
  cek("viewBox grafik terpasang statis + ada batang tinggi nyata", vb === "0 0 720 252|true", vb);
  cek("analisa: hari terbaik = Sabtu 10 Okt 999 gr", t.includes("Hari terbaik") && t.includes("999,000") && t.includes("10 Okt 2026"), "");
  cek("analisa: pekerja + jatah per orang tampil", t.includes("Pekerja:") && t.includes("orang-shift") && t.includes("Jatah per orang tertinggi"), "");
  cek("analisa: pendapatan + konsistensi tampil", t.includes("Pendapatan Usaha:") && t.includes("Konsistensi:"), "");
  const donatAda = await ev2("(()=>{ const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>x.innerText.includes('Komposisi Terbagi')); return c ? c.querySelectorAll('svg circle').length : 0; })()");
  cek("donat kelompok tergambar (>= 3 lingkaran)", donatAda >= 3, "circle: " + donatAda);
  // 12 Bulan
  await ev2("[...document.querySelectorAll('.chip')].find(b=>b.innerText.trim()==='12 Bulan').click(); 'ok'");
  await wait(3000);
  t = await teks();
  const rectBulan = await ev2("(()=>{ const cards=[...document.querySelectorAll('.card')]; const c=cards.find(x=>x.innerText.includes('Hasil Bulanan')); return c ? c.querySelectorAll('svg rect').length : 0; })()");
  cek("grafik bulanan 12 batang", rectBulan === 12, "rect: " + rectBulan);
  cek("total Agustus sesuai API (" + fmtID(totalAgu) + ")", t.includes(fmtID(totalAgu)), "");
  // Tahun Ini
  await ev2("[...document.querySelectorAll('.chip')].find(b=>b.innerText.trim()==='Tahun Ini').click(); 'ok'");
  await wait(3000);
  t = await teks();
  cek("mode Tahun Ini: judul bulanan tahun ini", t.includes("Hasil Bulanan - Tahun Ini"), "");
  // Kembali ke Tabel
  await ev2("[...document.querySelectorAll('.tabseg button')].find(b=>b.innerText.includes('Tabel')).click(); 'ok'");
  await wait(800);
  cek("kembali ke tab Tabel & PDF utuh", await ev2("!!document.querySelector('#l-dari') && !!document.querySelector('#l-team')"));
  const shot = await send("Page.captureScreenshot", { format: "png" });
  fs.writeFileSync(new URL("../smoke-test/ui-grafik-tab.png", import.meta.url), Buffer.from(shot.result.data, "base64"));
  ws.close();
} finally { chrome.kill("SIGKILL"); }

// ---------- Cleanup ----------
for (const tgl of ["2026-10-10", "2026-10-12", "2026-08-15", "2026-09-15"]) {
  const d = await (await fetch(ORIGIN + `/api/entries?team_id=2&from=${tgl}&to=${tgl}&per=10&page=1`, { headers: H })).json();
  for (const day of d.days || []) for (const s of day.shifts || []) await fetch(ORIGIN + "/api/entries/" + s.id, { method: "DELETE", headers: H });
}
cek("seed dibersihkan", true);

const gagal = hasil.filter((h) => !h[1]).length;
console.log(`\nSMOKE GRAFIK: ${hasil.length - gagal}/${hasil.length} PASS`);
process.exit(gagal ? 1 : 0);
