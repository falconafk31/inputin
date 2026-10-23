// Smoke perbaikan v3.4.3 di PREVIEW:
// A) Tombol Edit di Riwayat (filter bawaan admin) memuat entri dengan team yang benar dan simpan berhasil.
// B) Pindah dari entri termuat ke slot kosong membersihkan hasil + catatan; ketikan segar (bukan Mode Edit) tidak ikut terhapus.
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
const ROWS = [{ nama: "Operator", persentase: 6, jumlah_orang: 6 }, { nama: "Helper", persentase: 4, jumlah_orang: 5 }];
async function bersihkan() {
  for (const [team, tgl] of [[1, "2026-10-19"], [2, "2026-10-20"], [2, "2026-10-21"], [2, "2026-10-22"]]) {
    const d = await api(`/api/entries?team_id=${team}&from=${tgl}&to=${tgl}&per=10&page=1`);
    for (const day of d.days || []) for (const s of day.shifts || []) await api(`/api/entries/${s.id}`, { method: "DELETE" });
  }
}
await api("/api/login", { method: "POST", body: JSON.stringify({ username: "admin", password: PASS }) });
await bersihkan();
await api("/api/entries", { method: "POST", body: JSON.stringify({ team_id: 1, tanggal: "2026-10-19", shift: 1, tanpa_hasil: false, hasil_gram: 111, catatan: "benih team 1", rows: ROWS }) });
await api("/api/entries", { method: "POST", body: JSON.stringify({ team_id: 2, tanggal: "2026-10-20", shift: 1, tanpa_hasil: false, hasil_gram: 250, catatan: "benih team 2", rows: ROWS }) });
console.log("seed selesai");

const PORT = 9353;
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
  const ev2 = async (expr) => { const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
  const setVal = async (sel, v, proto) => { await ev2(`(()=>{ const el=document.querySelector('${sel}'); Object.getOwnPropertyDescriptor(${proto}.prototype,'value').set.call(el,'${v}'); el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return 'ok'; })()`); await wait(500); };
  await wait(3000);
  const b64 = Buffer.from(JSON.stringify({ username: "admin", password: PASS })).toString("base64");
  await ev2(`fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:atob('${b64}')}).then(r=>r.status)`);
  await ev2("location.reload(); 'ok'"); await wait(3500);

  // === A. Edit dari Riwayat dengan filter bawaan ===
  await ev2("[...document.querySelectorAll('.bottomnav button')][1].click(); 'ok'"); await wait(1500);
  cek("filter riwayat bawaan = Semua Team", await ev2("(()=>{ const s=document.querySelector('#r-team'); return s ? s.options[s.selectedIndex].text.includes('Semua Team') : false; })()"));
  await ev2("[...document.querySelectorAll('.chip')].find(b=>b.innerText.trim()==='30 Hari').click(); 'ok'"); await wait(2500);
  // Hari terbaru = 20 Okt (Team 2). Buka rincian pertamanya lalu Edit.
  await ev2("(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Buka Rincian'); if(b) b.click(); return 'ok'; })()"); await wait(900);
  await ev2("(()=>{ const b=[...document.querySelectorAll('button')].find(x=>x.innerText.trim()==='Edit'); if(b) b.click(); return 'ok'; })()"); await wait(1800);
  const formState = await ev2("(()=>{ const t=document.querySelector('#f-team'); return { team: t ? t.options[t.selectedIndex].text : '-', tanggal: document.querySelector('#f-tanggal')?.value, hasil: document.querySelector('#f-hasil')?.value, modeEdit: document.body.innerText.includes('Mode Edit') }; })()");
  cek("edit memuat team entri (Team 2)", formState.team === "Team 2", JSON.stringify(formState));
  cek("edit memuat tanggal + hasil entri (20 Okt, 250)", formState.tanggal === "2026-10-20" && formState.hasil === "250" && formState.modeEdit, JSON.stringify(formState));
  await setVal("#f-hasil", "260", "HTMLInputElement");
  await ev2("document.querySelector('.savebar .btn').click(); 'ok'"); await wait(1000);
  // Sejak v3.4.5, simpan Mode Edit wajib melewati modal daftar perubahan.
  await ev2("(()=>{ const b=[...document.querySelectorAll('.modal .btn')].find(x=>x.innerText.trim()==='Ya, Simpan Perubahan'); if (b) b.click(); return 'ok'; })()"); await wait(2500);
  const flash = await ev2("document.querySelector('.banner.toast')?.innerText || ''");
  cek("simpan hasil edit berhasil (bukan 'Team tidak valid')", flash.includes("Perubahan tersimpan") && !flash.includes("tidak valid"), flash);
  const t2 = await api("/api/entries/one?team_id=2&tanggal=2026-10-20&shift=1");
  cek("server: Team 2 kini 260 gr", t2.entry && Math.abs(t2.entry.hasil_gram - 260) < 1e-9, t2.entry ? "hasil " + t2.entry.hasil_gram : "tidak ada");
  const t1 = await api("/api/entries/one?team_id=1&tanggal=2026-10-19&shift=1");
  cek("server: entri Team 1 tidak tersentuh (111 gr)", t1.entry && Math.abs(t1.entry.hasil_gram - 111) < 1e-9, t1.entry ? "hasil " + t1.entry.hasil_gram : "tidak ada");

  // === B. Kebersihan form ===
  // Masih Mode Edit (Team 2, 20 Okt). Pindah ke 21 Okt yang kosong.
  await setVal("#f-tanggal", "2026-10-21", "HTMLInputElement"); await wait(1500);
  const bersih = await ev2("(()=>({ hasil: document.querySelector('#f-hasil')?.value, catatan: document.querySelector('#f-catatan')?.value, modeEdit: document.body.innerText.includes('Mode Edit') }))()");
  cek("pindah ke slot kosong: hasil + catatan bersih, Mode Edit hilang", bersih.hasil === "" && bersih.catatan === "" && !bersih.modeEdit, JSON.stringify(bersih));
  // Ketikan segar tidak boleh ikut terhapus saat pindah slot kosong lain
  await setVal("#f-hasil", "33", "HTMLInputElement");
  await setVal("#f-catatan", "ketikan segar", "HTMLTextAreaElement");
  await setVal("#f-tanggal", "2026-10-22", "HTMLInputElement"); await wait(1500);
  const segar = await ev2("(()=>({ hasil: document.querySelector('#f-hasil')?.value, catatan: document.querySelector('#f-catatan')?.value }))()");
  cek("ketikan segar tetap ada setelah pindah slot kosong", segar.hasil === "33" && segar.catatan === "ketikan segar", JSON.stringify(segar));
  cek("tanpa error JS", errors.length === 0, errors.slice(0, 2).join(" ;; "));
  ws.close();
} finally { chrome.kill("SIGKILL"); }

await bersihkan();
const gagal = hasil.filter((h) => !h[1]).length;
console.log("\nSMOKE EDIT RIWAYAT: " + (hasil.length - gagal) + "/" + hasil.length + " PASS");
