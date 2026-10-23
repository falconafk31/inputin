// Debug sekali pakai: kenapa kartu matriks tidak muncul di smoke fitur baru (v3.4.1).
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("admin")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";

let cookie = "";
async function api(path, opts = {}) {
  const r = await fetch(ORIGIN + path, { ...opts, headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) } });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
  return d;
}
const TGL_M = ["2026-10-12", "2026-10-13", "2026-10-14"];
async function bersihkan() {
  for (const tgl of TGL_M) {
    const d = await api(`/api/entries?team_id=1&from=${tgl}&to=${tgl}&per=10&page=1`);
    for (const day of d.days || []) for (const s of day.shifts || []) await api(`/api/entries/${s.id}`, { method: "DELETE" });
  }
}
const ROWS7 = [
  { nama: "Operator", persentase: 6, jumlah_orang: 6 }, { nama: "Helper", persentase: 4, jumlah_orang: 5 },
  { nama: "Mandor", persentase: 3, jumlah_orang: 2 }, { nama: "Sopir", persentase: 2, jumlah_orang: 2 },
  { nama: "Satpam", persentase: 1, jumlah_orang: 2 }, { nama: "Koki", persentase: 1, jumlah_orang: 1 },
  { nama: "Tukang", persentase: 1, jumlah_orang: 1 },
];
await api("/api/login", { method: "POST", body: JSON.stringify({ username: "admin", password: PASS }) });
await bersihkan();
for (const tgl of TGL_M) await api("/api/entries", { method: "POST", body: JSON.stringify({ team_id: 1, tanggal: tgl, shift: 1, tanpa_hasil: false, hasil_gram: 100, catatan: "debug matriks", rows: ROWS7 }) });
console.log("seed selesai");

const PORT = 9341;
const chrome = spawn(process.env.CHROME_BIN || "/home/hatch/.cache/puppeteer/chrome/linux-154.0.8037.57/chrome-linux64/chrome", ["--headless=new", "--no-sandbox", "--disable-dev-shm-usage", `--remote-debugging-port=${PORT}`, "--window-size=430,900", ORIGIN], { stdio: "ignore" });
try {
  let targets = null;
  for (let i = 0; i < 30; i++) { try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json(); if (targets && targets.length) break; } catch {} await wait(400); }
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const errors = [];
  const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.text + " " + (d.params.exceptionDetails.exception?.description || ""));
    if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") errors.push("console: " + d.params.args.map((a) => a.value || a.description || "").join(" "));
  };
  await new Promise((r) => { ws.onopen = r; });
  await send("Runtime.enable"); await send("Page.enable"); await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  ws.addEventListener("message", async (m) => {
    const d = JSON.parse(m.data);
    if (d.method === "Fetch.requestPaused") {
      const { requestId, request } = d.params;
      try {
        const u = new URL(request.url);
        if (u.origin === ORIGIN) {
          const r = await fetch(request.url, { method: request.method, headers: request.headers, body: request.postData || undefined });
          const buf = Buffer.from(await r.arrayBuffer());
          const headers = []; r.headers.forEach((v, k) => headers.push({ name: k, value: v }));
          await send("Fetch.fulfillRequest", { requestId, responseCode: r.status, responseHeaders: headers, body: buf.toString("base64") });
        } else await send("Fetch.continueRequest", { requestId });
      } catch { try { await send("Fetch.continueRequest", { requestId }); } catch {} }
    }
  });
  const ev2 = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  await wait(3000);
  const b64 = Buffer.from(JSON.stringify({ username: "admin", password: PASS })).toString("base64");
  console.log("login:", await ev2(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:atob('${b64}')}).then(r=>r.status)`));
  await ev2("location.reload(); 'ok'"); await wait(3500);
  await ev2("[...document.querySelectorAll('.bottomnav button')][2].click(); 'ok'"); await wait(1500);
  console.log("SETELAH MASUK LAPORAN (rentang hari ini):");
  console.log(await ev2("(()=>{ const es=document.querySelector('.empty-state'); const cards=[...document.querySelectorAll('.card')].map(c=>c.innerText.slice(0,40).replace(/\\n/g,' ')); return JSON.stringify({emptyState: !!es, jumlahCard: cards.length, cards}, null, 1); })()"));
  await ev2(`(()=>{ const set=(el,v)=>{ Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); }; set(document.querySelector('#l-dari'),'2026-10-12'); set(document.querySelector('#l-sampai'),'2026-10-14'); return 'ok'; })()`);
  await wait(3000);
  console.log("SETELAH GANTI RENTANG 12-14 OKT:");
  console.log(await ev2("(()=>{ const es=document.querySelector('.empty-state'); const cards=[...document.querySelectorAll('.card')]; const mc = cards.find(c=>c.innerText.includes('Terbagi Per Hari Per Kelompok')); const kpis=document.querySelector('.kpis'); return JSON.stringify({emptyState: !!es, kartuMatriks: !!mc, kpis: !!kpis, jumlahCard: cards.length}, null, 1); })()"));
  console.log("ERRORS:", errors.length ? errors.join(" || ") : "tidak ada");
} finally {
  chrome.kill("SIGKILL");
  await bersihkan();
  console.log("cleanup selesai");
}
