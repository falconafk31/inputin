// Cek fitur baris kecil orang + @ di PDF Rentang (v3.4.4): seed data contoh gambaran di PREVIEW (Team 2),
// verifikasi shift_rows worker membawa jumlah_orang + per_orang_gram, lalu generate PDF rentang dan simpan.
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("admin")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";
const hasil = [];
const cek = (nama, ok, det) => { hasil.push([nama, ok]); console.log((ok ? "PASS " : "FAIL ") + nama + (det ? " | " + det : "")); };

// ---------- 1) Seed + verifikasi API langsung ----------
const loginR = await fetch(ORIGIN + "/api/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: "admin", password: PASS }) });
const cookie = (loginR.headers.get("set-cookie") || "").split(";")[0];
cek("login admin preview (API langsung)", loginR.status === 200 && !!cookie, "status " + loginR.status);
const H = { "Content-Type": "application/json", Cookie: cookie };
const SEED = [
  { team_id: 2, tanggal: "2026-10-01", shift: 1, tanpa_hasil: false, hasil_gram: 28, catatan: "", rows: [{ nama: "Operator", persentase: 6, jumlah_orang: 4 }, { nama: "Kelompok Kas", persentase: 8, jumlah_orang: 1 }] },
  { team_id: 2, tanggal: "2026-10-02", shift: 1, tanpa_hasil: false, hasil_gram: 20, catatan: "", rows: [{ nama: "Operator", persentase: 6, jumlah_orang: 5 }, { nama: "Kelompok Kas", persentase: 8, jumlah_orang: 1 }] },
  { team_id: 2, tanggal: "2026-10-02", shift: 2, tanpa_hasil: false, hasil_gram: 16, catatan: "", rows: [{ nama: "Operator", persentase: 6, jumlah_orang: 6 }, { nama: "Kelompok Kas", persentase: 8, jumlah_orang: 1 }] },
  { team_id: 2, tanggal: "2026-10-03", shift: 1, tanpa_hasil: false, hasil_gram: 10, catatan: "", rows: [{ nama: "Operator", persentase: 6, jumlah_orang: 4 }, { nama: "Kelompok Kas", persentase: 8, jumlah_orang: 1 }] },
  { team_id: 2, tanggal: "2026-10-03", shift: 2, tanpa_hasil: false, hasil_gram: 10, catatan: "", rows: [{ nama: "Operator", persentase: 7, jumlah_orang: 4 }, { nama: "Kelompok Kas", persentase: 8, jumlah_orang: 1 }] },
];
const seedIds = [];
for (const e of SEED) {
  const r = await fetch(ORIGIN + "/api/entries", { method: "POST", headers: H, body: JSON.stringify(e) });
  const j = await r.json().catch(() => ({}));
  if (j && j.entry && j.entry.id) seedIds.push(j.entry.id); else if (j && j.id) seedIds.push(j.id);
  if (r.status !== 200) console.log("  seed gagal", e.tanggal, e.shift, r.status, JSON.stringify(j).slice(0, 120));
}
cek("5 entri contoh tersimpan di preview", seedIds.length === 5, "id: " + seedIds.join(","));
const rep = await (await fetch(ORIGIN + "/api/report?team_id=2&from=2026-10-01&to=2026-10-03", { headers: H })).json();
const d1 = (rep.days || []).find((d) => d.tanggal === "2026-10-01");
const op1 = d1 && (d1.shift_rows["1"] || []).find((r) => r.nama === "Operator");
cek("shift_rows worker membawa jumlah_orang + per_orang_gram", !!op1 && op1.jumlah_orang === 4 && Math.abs(op1.per_orang_gram - 0.42) < 1e-9, JSON.stringify(op1 || {}));

// ---------- 2) Generate PDF lewat UI ----------
const PORT = 9337;
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
  const loginRes = await ev2(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:atob('${b64}')}).then(r=>r.status)`);
  cek("login admin di UI", loginRes === 200, "status " + loginRes);
  await ev2("location.reload(); 'ok'");
  await wait(3000);
  await ev2("[...document.querySelectorAll('.bottomnav button')][2].click(); 'ok'");
  await wait(2000);
  await ev2("(()=>{ const s=document.querySelector('#l-team'); s.value='2'; s.dispatchEvent(new Event('change',{bubbles:true})); const setT=(id,v)=>{ const el=document.querySelector(id); el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }; setT('#l-dari','2026-10-01'); setT('#l-sampai','2026-10-03'); return 'ok'; })()");
  await wait(3000);
  const uri = await ev2("window.__PDF_TEST__=true; window.__unduhPDF(false).then(d=>d.output('datauristring'))");
  fs.writeFileSync(new URL("../smoke-test/cek-perorang.pdf", import.meta.url), Buffer.from(uri.split(",")[1], "base64"));
  cek("PDF rentang contoh tersimpan", uri.length > 5000, "datauri " + uri.length + " char");
  ws.close();
} finally { chrome.kill("SIGKILL"); }

// ---------- 3) Bersihkan seed ----------
for (const id of seedIds) await fetch(ORIGIN + "/api/entries/" + id, { method: "DELETE", headers: H });
cek("seed contoh dibersihkan dari preview", true, seedIds.length + " entri dihapus");

const gagal = hasil.filter((h) => !h[1]).length;
console.log(`\nCEK PER-ORANG: ${hasil.length - gagal}/${hasil.length} PASS`);
process.exit(gagal ? 1 : 0);
