// Smoke dedupe antrian offline v3.4.2 di PREVIEW:
// 1) antrian lama menumpuk (3 salinan kunci sama) dirapatkan saat aplikasi dimuat, yang berlaku salinan terakhir
// 2) simpan offline berulang untuk shift yang sama mengganti isi antrian, bukan menambah salinan
// 3) simpan online langsung membuang item antrian berkunci sama (tidak menimpa data terbaru nanti)
// 4) hasil akhir di server = nilai terakhir
import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";
import fs from "node:fs";

const credTxt = fs.readFileSync(new URL("../credentials-awal.txt", import.meta.url), "utf8");
const PASS = credTxt.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("admin")).map((l) => l.split("/")[1].trim().split(" ")[0])[0];
const ORIGIN = "https://ui-modern-inputin.hadesxyz.workers.dev";
const hasil = [];
const cek = (nama, ok, det) => { hasil.push([nama, !!ok]); console.log((ok ? "PASS " : "FAIL ") + nama + (det ? " | " + det : "")); };

let cookie = "";
async function api(path, opts = {}) {
  const r = await fetch(ORIGIN + path, { ...opts, headers: { "Content-Type": "application/json", Cookie: cookie, ...(opts.headers || {}) } });
  const sc = r.headers.get("set-cookie"); if (sc) cookie = sc.split(";")[0];
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
  return d;
}
const TGL = ["2026-10-20", "2026-10-21"];
async function bersihkan() {
  for (const tgl of TGL) {
    const d = await api(`/api/entries?team_id=1&from=${tgl}&to=${tgl}&per=10&page=1`);
    for (const day of d.days || []) for (const s of day.shifts || []) await api(`/api/entries/${s.id}`, { method: "DELETE" });
  }
}
await api("/api/login", { method: "POST", body: JSON.stringify({ username: "admin", password: PASS }) });
await bersihkan();

const PORT = 9343;
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
    if (d.method === "Runtime.exceptionThrown") errors.push(d.params.exceptionDetails.text);
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
  const ev2 = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || "")); return r.result.value; };
  await wait(3000);
  const b64 = Buffer.from(JSON.stringify({ username: "admin", password: PASS })).toString("base64");
  await ev2(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:atob('${b64}')}).then(r=>r.status)`);
  // Tanam antrian lama yang menumpuk SEBELUM reload: 3 salinan shift 1 (hasil 1, 2, 3) + 1 item shift 2 (hasil 9)
  await ev2(`(()=>{ const mk=(shift,hasil,n)=>({ id: 'tanam-'+n, pemilik: 'admin', payload: { team_id: 1, tanggal: '2026-10-20', shift, tanpa_hasil: false, hasil_gram: hasil, catatan: 'tanam uji', rows: [{ nama: 'Operator', persentase: 6, jumlah_orang: 6 }] }, dibuat: new Date().toISOString(), status: 'menunggu', pesan: '' }); localStorage.setItem('inputin-antrian-v1', JSON.stringify([mk(1,1,1), mk(1,2,2), mk(1,3,3), mk(2,9,4)])); return 'tertanam 4'; })()`);
  await ev2("location.reload(); 'ok'");
  await wait(5000);
  const qTanam = await ev2("JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]').length");
  cek("muat: antrian menumpuk dirapatkan lalu terkirim (sisa 0)", qTanam === 0, "sisa " + qTanam);
  const s1 = await api("/api/entries/one?team_id=1&tanggal=2026-10-20&shift=1");
  cek("muat: yang tercatat salinan terakhir (3 gr)", s1.entry && Math.abs(s1.entry.hasil_gram - 3) < 1e-9, s1.entry ? "hasil " + s1.entry.hasil_gram : "tidak ada");
  const s2 = await api("/api/entries/one?team_id=1&tanggal=2026-10-20&shift=2");
  cek("muat: shift lain tetap terkirim (9 gr)", s2.entry && Math.abs(s2.entry.hasil_gram - 9) < 1e-9, s2.entry ? "hasil " + s2.entry.hasil_gram : "tidak ada");

  // Stub offline, simpan berulang kunci sama
  await ev2("[...document.querySelectorAll('.bottomnav button')][0].click(); 'ok'");
  await wait(1200);
  await ev2(`(()=>{ window.__fetchAsli = window.fetch; window.fetch = (u,o)=>{ if (String(u).includes('/api/entries') && o && o.method==='POST') return Promise.reject(new TypeError('stub offline')); return window.__fetchAsli(u,o); }; return 'stub aktif'; })()`);
  const setInput = async (sel, v, proto) => { await ev2(`(()=>{ const el=document.querySelector('${sel}'); const d=Object.getOwnPropertyDescriptor(${proto}.prototype,'value'); d.set.call(el,'${v}'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return 'ok'; })()`); await wait(500); };
  // Sejak v3.4.5, simpan dalam Mode Edit menampilkan modal daftar perubahan dulu - klik konfirmasinya bila muncul.
  const simpanKlik = async () => { await ev2("document.querySelector('.save-btn').click(); 'ok'"); await wait(900); await ev2("(()=>{ const b=[...document.querySelectorAll('.modal .btn')].find(x=>x.innerText.trim()==='Ya, Simpan Perubahan'); if (b) b.click(); return 'ok'; })()"); await wait(1500); };
  await setInput("#f-tanggal", "2026-10-20", "HTMLInputElement"); await wait(1000);
  await setInput("#f-hasil", "77", "HTMLInputElement");
  await simpanKlik();
  let q = await ev2("(()=>{ const a=JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]'); return a.length + '|' + (a[0] ? a[0].payload.hasil_gram : '-'); })()");
  cek("offline: simpan pertama masuk antrian (1 item, 77)", q === "1|77", q);
  await setInput("#f-hasil", "88", "HTMLInputElement");
  await simpanKlik();
  q = await ev2("(()=>{ const a=JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]'); return a.length + '|' + (a[0] ? a[0].payload.hasil_gram : '-'); })()");
  cek("offline: simpan ulang kunci sama MENGGANTI isi (tetap 1 item, 88)", q === "1|88", q);
  // Shift 2 kunci berbeda -> item kedua
  await ev2("[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Shift 2').click(); 'ok'"); await wait(1000);
  await setInput("#f-hasil", "55", "HTMLInputElement");
  await simpanKlik();
  q = await ev2("JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]').length");
  cek("offline: shift berbeda = item terpisah (2 item)", q === 2, "jumlah " + q);
  // Online lagi -> kirim
  await ev2("window.fetch = window.__fetchAsli; 'ok'");
  await ev2("[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Kirim Sekarang').click(); 'ok'");
  await wait(3000);
  q = await ev2("JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]').length");
  cek("online: antrian terkirim semua", q === 0, "sisa " + q);
  const f1 = await api("/api/entries/one?team_id=1&tanggal=2026-10-20&shift=1");
  cek("server: shift 1 = nilai terakhir (88 gr)", f1.entry && Math.abs(f1.entry.hasil_gram - 88) < 1e-9, f1.entry ? "hasil " + f1.entry.hasil_gram : "tidak ada");
  const f2 = await api("/api/entries/one?team_id=1&tanggal=2026-10-20&shift=2");
  cek("server: shift 2 = 55 gr", f2.entry && Math.abs(f2.entry.hasil_gram - 55) < 1e-9, f2.entry ? "hasil " + f2.entry.hasil_gram : "tidak ada");

  // Simpan online langsung membuang item antrian berkunci sama
  await ev2("[...document.querySelectorAll('button')].find(b=>b.innerText.trim()==='Shift 1').click(); 'ok'"); await wait(800);
  await setInput("#f-tanggal", "2026-10-21", "HTMLInputElement"); await wait(1000);
  await ev2(`(()=>{ window.fetch = (u,o)=>{ if (String(u).includes('/api/entries') && o && o.method==='POST') return Promise.reject(new TypeError('stub offline')); return window.__fetchAsli(u,o); }; return 'stub aktif lagi'; })()`);
  await setInput("#f-hasil", "5", "HTMLInputElement");
  await simpanKlik();
  q = await ev2("JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]').length");
  cek("purge: 21 Okt masuk antrian (1 item)", q === 1, "jumlah " + q);
  await ev2("window.fetch = window.__fetchAsli; 'ok'");
  await setInput("#f-hasil", "6", "HTMLInputElement");
  await simpanKlik();
  q = await ev2("JSON.parse(localStorage.getItem('inputin-antrian-v1')||'[]').length");
  cek("purge: simpan online membuang item antrian kunci sama (0 item)", q === 0, "sisa " + q);
  const f3 = await api("/api/entries/one?team_id=1&tanggal=2026-10-21&shift=1");
  cek("server: 21 Okt = nilai simpan langsung (6 gr)", f3.entry && Math.abs(f3.entry.hasil_gram - 6) < 1e-9, f3.entry ? "hasil " + f3.entry.hasil_gram : "tidak ada");
  cek("tanpa error JS", errors.length === 0, errors.slice(0, 2).join(" ;; "));
  ws.close();
} finally { chrome.kill("SIGKILL"); }

await bersihkan();
const gagal = hasil.filter((h) => !h[1]).length;
console.log("\nSMOKE ANTRIAN DEDUPE: " + (hasil.length - gagal) + "/" + hasil.length + " PASS");
